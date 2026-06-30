from __future__ import annotations

import io
import json
import sys
import time
from argparse import Namespace
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import download_worker
from crawler import (
    CoverItem,
    DEFAULT_COMPLETE_THROUGH_YEAR,
    DEFAULT_KEYWORDS,
    DEFAULT_OUTPUT,
    SearchHit,
    build_dataset,
    build_parser,
    candidate_status_title,
    collect_search_hits,
    collect_search_hit_batches,
    date_key_from_pubdate,
    evaluate_candidate,
    extract_original_song_name,
    is_search_date_complete,
    item_from_hit,
    load_completed_search_dates,
    load_processed_statuses,
    mark_search_date_complete,
    print_candidate_status,
    print_search_date,
    print_search_year_complete,
    processed_skip_reason,
    resolve_max_results,
    resolve_search_backend,
    search_hit_from_ytdlp,
    should_stop_before_complete_year,
    tag_names_from_payload,
    write_checkpoint,
)
from download_worker import build_parser as build_download_worker_parser
from vnami_db import DEFAULT_DATABASE, build_wiki_dataset_from_database, pending_items, record_download_success, sync_json_to_database


class FakePacer:
    def __init__(self) -> None:
        self.labels: list[str] = []

    def wait(self, label: str) -> None:
        self.labels.append(label)


class FakeBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(self, keyword: str, page: int = 1, page_size: int = 30) -> list[SearchHit]:
        self.pages.append(page)
        return [
            SearchHit(
                bvid=f"BVOLD{page:04d}",
                aid=None,
                title=f"{keyword} old page {page}",
                author="tester",
                arcurl=f"https://www.bilibili.com/video/BVOLD{page:04d}",
                pubdate=1000 - page,
            ),
            SearchHit(
                bvid=f"BVTEST{page:04d}",
                aid=None,
                title=f"{keyword} page {page}",
                author="tester",
                arcurl=f"https://www.bilibili.com/video/BVTEST{page:04d}",
                pubdate=2000 - page,
            )
        ]


class FakeRepeatingBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(self, keyword: str, page: int = 1, page_size: int = 30) -> list[SearchHit]:
        self.pages.append(page)
        return [
            SearchHit(
                bvid="BVREPEAT",
                aid=None,
                title=f"{keyword} repeated result",
                author="tester",
                arcurl="https://www.bilibili.com/video/BVREPEAT",
                pubdate=2000,
            )
        ]


class FakeDetailBilibili:
    def __init__(self) -> None:
        self.tag_calls = 0

    def video_view(self, bvid: str | None = None, aid: int | None = None) -> dict[str, object]:
        return {
            "bvid": bvid,
            "aid": aid,
            "title": "【AI香奈美】《群青》翻唱",
            "owner": {"name": "tester"},
            "pubdate": 1782748800,
            "desc": "单曲翻唱",
            "Tags": [{"tag_name": "AI翻唱"}, {"tag_name": "香奈美"}],
        }

    def video_tags(self, bvid: str, aid: int | None = None) -> list[str]:
        self.tag_calls += 1
        return []


def main() -> None:
    assert DEFAULT_KEYWORDS == ["香奈美"]
    assert DEFAULT_COMPLETE_THROUGH_YEAR == 2021
    defaults = build_parser().parse_args(["crawl"])
    assert defaults.request_delay == 1.0
    assert defaults.request_jitter == 4.0
    assert defaults.cooldown_seconds == 1800.0
    assert defaults.output == DEFAULT_OUTPUT
    download_defaults = build_download_worker_parser().parse_args([])
    assert download_defaults.input == DEFAULT_OUTPUT
    assert download_defaults.database == DEFAULT_DATABASE
    assert download_defaults.poll_interval == 60.0
    assert download_defaults.idle_timeout == 1800.0
    assert download_defaults.download_delay == 5.0
    assert download_defaults.download_jitter == 3.0
    assert download_defaults.concurrency == 8
    worker_items = [
        CoverItem(
            bvid=f"BVWORKER{index}",
            video_url=f"https://www.bilibili.com/video/BVWORKER{index}",
            author="tester",
            original_song_name="群青",
            video_title="worker test",
            published_at="2026-06-30T00:00:00+08:00",
        )
        for index in range(5)
    ]
    assert [item.bvid for item in download_worker.select_download_batch(worker_items, concurrency=3, once=True)] == [
        "BVWORKER0",
        "BVWORKER1",
        "BVWORKER2",
    ]
    assert len(download_worker.select_download_batch(worker_items, concurrency=3, once=False)) == 5
    active_downloads = 0
    max_active_downloads = 0
    lock = Lock()
    original_download_item_audio = download_worker.download_item_audio

    def fake_download_item_audio(item: CoverItem, *, audio_dir: Path, overwrite: bool) -> None:
        nonlocal active_downloads, max_active_downloads
        with lock:
            active_downloads += 1
            max_active_downloads = max(max_active_downloads, active_downloads)
        time.sleep(0.02)
        item.audio_file = str(audio_dir / f"{item.bvid}.mp3")
        with lock:
            active_downloads -= 1

    download_worker.download_item_audio = fake_download_item_audio
    try:
        worker_results = list(download_worker.download_pending_items(
            worker_items,
            audio_dir=Path("data/audio"),
            overwrite=False,
            concurrency=3,
        ))
    finally:
        download_worker.download_item_audio = original_download_item_audio
    assert sorted(result.item.bvid for result in worker_results) == sorted(item.bvid for item in worker_items)
    assert max_active_downloads > 1

    def failing_download_item_audio(item: CoverItem, *, audio_dir: Path, overwrite: bool) -> None:
        raise ValueError("download failed outside RuntimeError")

    download_worker.download_item_audio = failing_download_item_audio
    try:
        failed_results = list(download_worker.download_pending_items(
            worker_items[:1],
            audio_dir=Path("data/audio"),
            overwrite=False,
            concurrency=1,
        ))
    finally:
        download_worker.download_item_audio = original_download_item_audio
    assert isinstance(failed_results[0].error, ValueError)
    with TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        db_path = tmp_root / "private" / "vnami.sqlite3"
        audio_dir = tmp_root / "data" / "audio"
        db_item = CoverItem(
            bvid="BVDBTEST",
            video_url="https://www.bilibili.com/video/BVDBTEST",
            author="tester",
            original_song_name="群青",
            video_title="【AI香奈美】《群青》翻唱",
            published_at="2026-06-30T00:00:00+08:00",
            pubdate=1782748800,
        )
        input_path = tmp_root / "covers.json"
        input_path.write_text(
            json.dumps(build_dataset(items=[db_item], keywords=["香奈美"], pages=1), ensure_ascii=False),
            encoding="utf-8",
        )
        summary = sync_json_to_database(input_path, db_path, audio_dir=audio_dir)
        assert summary.active_items == 1
        imported_pending = pending_items(db_path)
        assert [item.bvid for item in imported_pending] == ["BVDBTEST"]
        downloaded_path = audio_dir / "bilibili_BVDBTEST.mp3"
        downloaded_path.parent.mkdir(parents=True, exist_ok=True)
        downloaded_path.write_bytes(b"ID3")
        imported_pending[0].audio_file = str(downloaded_path)
        record_download_success(db_path, imported_pending[0])
        db_dataset = build_wiki_dataset_from_database(db_path)
        assert list(db_dataset["resourceMap"]) == ["/files/WIKI/audio/v-nami/bilibili_BVDBTEST.mp3"]
        assert db_dataset["items"][0]["audioFile"] == str(downloaded_path)
    assert candidate_status_title("<em>香奈美</em> 的夏日翻唱曲目") == "香奈美 的夏日翻唱曲"
    assert candidate_status_title("") == "无标题"
    completed_dates: dict[str, set[str]] = {}
    assert mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert is_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert not mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    checkpoint_path = Path(__file__).resolve().parents[1] / "data" / "smoke_checkpoint.tmp.json"
    write_checkpoint(checkpoint_path, {"BVTEST0001"}, completed_dates, {"BVTEST0001": "mismatch"})
    try:
        assert load_completed_search_dates(checkpoint_path) == {"香奈美": {"2026-06-30"}}
        assert load_processed_statuses(checkpoint_path) == {"BVTEST0001": "mismatch"}
    finally:
        checkpoint_path.unlink(missing_ok=True)
    assert date_key_from_pubdate(1782748800) == "2026-06-30"
    assert should_stop_before_complete_year("2020-12-31", 2021)
    assert not should_stop_before_complete_year("2021-01-01", 2021)
    output = io.StringIO()
    with redirect_stdout(output):
        print_search_date("2026-06-30")
    assert output.getvalue() == "当前搜索日期：2026-06-30\n"
    output = io.StringIO()
    with redirect_stdout(output):
        print_search_year_complete(2021)
    assert output.getvalue() == "已完成 2021 年及更新视频搜索。\n"
    output = io.StringIO()
    with redirect_stdout(output):
        print_candidate_status("跳过", "【AI香奈美】《群青》翻唱", "不匹配")
    assert output.getvalue() == "跳过（不匹配）：【AI香奈美】《群青\n"
    assert processed_skip_reason("BVTEST0001", {}, {"BVTEST0001": "saved"}) == "已保存"
    assert processed_skip_reason("BVTEST0001", {}, {"BVTEST0001": "mismatch"}) == "不匹配"
    assert processed_skip_reason("BVTEST0001", {}, {}) == "不匹配"
    assert tag_names_from_payload({"Tags": [{"tag_name": "AI翻唱"}, {"tag_name": "香奈美"}]}) == ["AI翻唱", "香奈美"]
    result = evaluate_candidate(
        title="【AI香奈美】《群青》翻唱",
        tags=["AI翻唱", "香奈美"],
        description="单曲翻唱",
    )
    assert result.accepted
    assert "tag:ai+cover" in result.matched_keywords
    tag_only_result = evaluate_candidate(
        title="夏日小曲 / 香奈美",
        tags=["AI", "翻唱", "卡拉彼丘"],
        description="",
    )
    assert tag_only_result.accepted
    assert "tag:ai+cover" in tag_only_result.matched_keywords
    music_tag_result = evaluate_candidate(
        title="世间万千，你的歌声便是《解药》｜香奈美",
        tags=["AI音乐", "kanami", "听歌"],
        description="原曲：《解药》\n翻唱：AI香奈美\n模型训练：本地推理，仅供兴趣研究。",
    )
    assert music_tag_result.accepted
    animation_result = evaluate_candidate(
        title="香奈美与引航者的甜蜜时光",
        tags=["AI动画创作挑战", "卡拉彼丘", "香奈美"],
        description="日常片段",
    )
    assert not animation_result.accepted
    assert extract_original_song_name("【AI香奈美】《群青》翻唱") == "群青"
    item = CoverItem(
        bvid="BV1test",
        video_url="https://www.bilibili.com/video/BV1test",
        author="tester",
        original_song_name="群青",
        video_title="【AI香奈美】《群青》翻唱",
        published_at="2026-06-29T00:00:00+08:00",
        audio_file="data/audio/bilibili_BV1test.mp3",
        audio_resource_url="/files/WIKI/audio/v-nami/bilibili_BV1test.mp3",
    )
    payload = build_dataset(items=[item], keywords=["香奈美"], pages=1)
    resource = payload["resourceMap"]["/files/WIKI/audio/v-nami/bilibili_BV1test.mp3"]
    assert resource["sourcePage"] == item.video_url
    assert resource["mediaType"] == "audio"
    assert resource["originalSongName"] == "群青"
    fake_detail_bilibili = FakeDetailBilibili()
    fake_detail_pacer = FakePacer()
    detail_item, detail_raw = item_from_hit(
        bilibili=fake_detail_bilibili,
        hit=SearchHit(
            bvid="BVDETAIL",
            aid=None,
            title="search title",
            author="tester",
            arcurl="https://www.bilibili.com/video/BVDETAIL",
        ),
        keyword="香奈美",
        include_terms=[],
        exclude_terms=[],
        audio_dir=Path("data/audio"),
        resource_url_prefix="/files/WIKI/audio/v-nami/",
        pacer=fake_detail_pacer,
    )
    assert detail_item is not None
    assert detail_raw["tags"] == ["AI翻唱", "香奈美"]
    assert fake_detail_bilibili.tag_calls == 0
    assert fake_detail_pacer.labels == ["video detail BVDETAIL"]
    hit = search_hit_from_ytdlp({
        "id": "116826180688720",
        "url": "http://www.bilibili.com/video/av116826180688720",
        "ie_key": "BiliBili",
    })
    assert hit.aid == 116826180688720
    assert hit.bvid == ""
    args = Namespace(search_backend="auto", max_results_per_keyword=0, deep_search=True, pages=3)
    assert resolve_search_backend(args) == "api"
    assert resolve_max_results(args, page_size=30) == 1000
    fake_bilibili = FakeBilibili()
    fake_pacer = FakePacer()
    batches = collect_search_hit_batches(
        bilibili=fake_bilibili,
        keyword="香奈美",
        backend="api",
        page_size=10,
        max_results=35,
        pacer=fake_pacer,
    )
    first_batch = next(batches)
    assert fake_bilibili.pages == [1]
    assert [hit.bvid for hit in first_batch] == ["BVTEST0001", "BVOLD0001"]
    second_batch = next(batches)
    assert fake_bilibili.pages == [1, 2]
    assert [hit.bvid for hit in second_batch] == ["BVTEST0002", "BVOLD0002"]
    list(batches)
    assert fake_bilibili.pages == [1, 2, 3, 4]
    fake_bilibili = FakeBilibili()
    fake_pacer = FakePacer()
    collect_search_hits(
        bilibili=fake_bilibili,
        keyword="香奈美",
        backend="api",
        page_size=10,
        max_results=35,
        pacer=fake_pacer,
    )
    assert fake_bilibili.pages == [1, 2, 3, 4]
    repeating_bilibili = FakeRepeatingBilibili()
    fake_pacer = FakePacer()
    output = io.StringIO()
    with redirect_stdout(output):
        repeating_batches = list(collect_search_hit_batches(
            bilibili=repeating_bilibili,
            keyword="香奈美",
            backend="api",
            page_size=10,
            max_results=None,
            pacer=fake_pacer,
        ))
    assert repeating_bilibili.pages == [1, 2]
    assert [[hit.bvid for hit in batch] for batch in repeating_batches] == [["BVREPEAT"]]
    assert "returned no new candidates; stopping." in output.getvalue()


if __name__ == "__main__":
    main()
