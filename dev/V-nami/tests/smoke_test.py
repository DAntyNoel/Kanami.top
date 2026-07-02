from __future__ import annotations

import io
import json
import sys
import time
import types
from argparse import Namespace
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import httpx  # noqa: F401
except ModuleNotFoundError:
    class _MissingHTTPXClient:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise RuntimeError("httpx is required for live Bilibili requests")

    class _MissingHTTPXStatusError(Exception):
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            super().__init__("httpx is required for live Bilibili requests")
            self.response = types.SimpleNamespace(status_code=0)

    sys.modules["httpx"] = types.SimpleNamespace(
        Cookies=dict,
        Client=_MissingHTTPXClient,
        Timeout=lambda *_args, **_kwargs: None,
        HTTPStatusError=_MissingHTTPXStatusError,
    )

import download_worker
import review_worker
from crawler import (
    CoverItem,
    DEFAULT_COMPLETE_THROUGH_DATE,
    DEFAULT_KEYWORDS,
    DEFAULT_OUTPUT,
    EmptyFirstPageTimeout,
    SearchHit,
    SearchWindowSummary,
    build_dataset,
    build_parser,
    candidate_status_title,
    clear_search_date_complete,
    clear_zero_result_search_date,
    collect_search_hits,
    collect_search_hit_batches,
    date_key_from_pubdate,
    daily_search_windows,
    drop_zero_result_dates_from_completed,
    evaluate_candidate,
    extract_original_song_name,
    is_search_date_complete,
    item_from_hit,
    iso_from_pubdate,
    load_completed_search_dates,
    load_processed_statuses,
    load_zero_result_search_dates,
    mark_zero_result_search_date,
    mark_search_date_complete_if_closed,
    mark_search_date_complete,
    print_candidate_status,
    print_search_date,
    print_search_window_summary,
    print_search_complete_through_date,
    print_zero_result_review,
    processed_skip_reason,
    pubtime_open_date,
    resolve_max_results,
    resolve_search_backend,
    search_hit_from_ytdlp,
    should_stop_before_complete_date,
    tag_names_from_payload,
    parse_pubtime_bound,
    wbi_search_params,
    write_checkpoint,
)
from download_worker import build_parser as build_download_worker_parser
from vnami_db import DEFAULT_DATABASE, build_wiki_dataset_from_database, pending_items, record_download_success, sync_json_to_database


class FakePacer:
    def __init__(self) -> None:
        self.labels: list[str] = []
        self.base_delays: list[float | None] = []
        self.jitters: list[float | None] = []

    def wait(self, label: str, base_delay: float | None = None, jitter: float | None = None) -> None:
        self.labels.append(label)
        self.base_delays.append(base_delay)
        self.jitters.append(jitter)


class FakeBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 30,
        pubtime_begin_s: int | None = None,
        pubtime_end_s: int | None = None,
    ) -> list[SearchHit]:
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

    def search_videos(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 30,
        pubtime_begin_s: int | None = None,
        pubtime_end_s: int | None = None,
    ) -> list[SearchHit]:
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


class FakeEmptySecondPageBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 30,
        pubtime_begin_s: int | None = None,
        pubtime_end_s: int | None = None,
    ) -> list[SearchHit]:
        self.pages.append(page)
        if page > 1:
            return []
        return [
            SearchHit(
                bvid="BVONEPAGE",
                aid=None,
                title=f"{keyword} one page result",
                author="tester",
                arcurl="https://www.bilibili.com/video/BVONEPAGE",
                pubdate=2000,
            )
        ]


class FakeRecoveringFirstPageBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 30,
        pubtime_begin_s: int | None = None,
        pubtime_end_s: int | None = None,
    ) -> list[SearchHit]:
        self.pages.append(page)
        if len(self.pages) < 3:
            return []
        return [
            SearchHit(
                bvid="BVRECOVER",
                aid=None,
                title=f"{keyword} recovered result",
                author="tester",
                arcurl="https://www.bilibili.com/video/BVRECOVER",
                pubdate=2000,
            )
        ]


class FakeAlwaysEmptyFirstPageBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 30,
        pubtime_begin_s: int | None = None,
        pubtime_end_s: int | None = None,
    ) -> list[SearchHit]:
        self.pages.append(page)
        return []


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


class FakeReviewBilibili:
    def __init__(self) -> None:
        self.pages: list[int] = []

    def search_videos(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 30,
        pubtime_begin_s: int | None = None,
        pubtime_end_s: int | None = None,
    ) -> list[SearchHit]:
        self.pages.append(page)
        if page > 1:
            return []
        return [
            SearchHit(
                bvid="BVREVIEWNEW",
                aid=None,
                title="【AI香奈美】《新歌》翻唱",
                author="tester",
                arcurl="https://www.bilibili.com/video/BVREVIEWNEW",
                pubdate=1782748800,
                source="api",
            ),
            SearchHit(
                bvid="BVREVIEWOLD",
                aid=None,
                title="【AI香奈美】《旧歌》翻唱",
                author="tester",
                arcurl="https://www.bilibili.com/video/BVREVIEWOLD",
                pubdate=1782748800,
                source="api",
            ),
            SearchHit(
                bvid="BVREVIEWMISS",
                aid=None,
                title="香奈美剧情片段",
                author="tester",
                arcurl="https://www.bilibili.com/video/BVREVIEWMISS",
                pubdate=1782748800,
                source="api",
            ),
        ]

    def video_view(self, bvid: str | None = None, aid: int | None = None) -> dict[str, object]:
        if bvid == "BVREVIEWMISS":
            return {
                "bvid": bvid,
                "aid": aid,
                "title": "香奈美剧情片段",
                "owner": {"name": "tester"},
                "pubdate": 1782748800,
                "desc": "剧情片段",
                "Tags": [{"tag_name": "香奈美"}],
            }
        title = "【AI香奈美】《新歌》翻唱" if bvid == "BVREVIEWNEW" else "【AI香奈美】《旧歌》翻唱"
        return {
            "bvid": bvid,
            "aid": aid,
            "title": title,
            "owner": {"name": "tester"},
            "pubdate": 1782748800,
            "desc": "单曲翻唱",
            "Tags": [{"tag_name": "AI翻唱"}, {"tag_name": "香奈美"}],
        }

    def video_tags(self, bvid: str, aid: int | None = None) -> list[str]:
        return []


def main() -> None:
    assert DEFAULT_KEYWORDS == ["香奈美", "kanami", "かなみ", "カナミ"]
    assert DEFAULT_COMPLETE_THROUGH_DATE == "2023-08-03"
    defaults = build_parser().parse_args(["crawl"])
    assert defaults.request_delay == 1.0
    assert defaults.request_jitter == 4.0
    assert defaults.cooldown_seconds == 1800.0
    assert defaults.output == DEFAULT_OUTPUT
    assert defaults.pubtime_begin is None
    assert defaults.pubtime_end is None
    pubtime_begin = parse_pubtime_bound("2024-01-01", end_of_day=False)
    pubtime_end = parse_pubtime_bound("2024-12-31", end_of_day=True)
    assert pubtime_begin is not None
    assert pubtime_end is not None
    assert pubtime_begin < pubtime_end
    assert pubtime_open_date(pubtime_end) == "2024-12-31"
    windows = list(daily_search_windows(
        parse_pubtime_bound("2024-12-29", end_of_day=False),
        parse_pubtime_bound("2024-12-31", end_of_day=True),
    ))
    assert [window.date_key for window in windows] == ["2024-12-31", "2024-12-30", "2024-12-29"]
    assert all(window.pubtime_begin_s <= window.pubtime_end_s for window in windows)
    default_begin_windows = list(daily_search_windows(
        None,
        parse_pubtime_bound("2023-08-05", end_of_day=True),
    ))
    assert [window.date_key for window in default_begin_windows] == ["2023-08-05", "2023-08-04", "2023-08-03"]
    open_completed_dates: dict[str, set[str]] = {}
    assert not mark_search_date_complete_if_closed(open_completed_dates, "香奈美", "2024-12-31", "2024-12-31")
    assert open_completed_dates == {}
    assert mark_search_date_complete_if_closed(open_completed_dates, "香奈美", "2024-12-30", "2024-12-31")
    assert open_completed_dates == {"香奈美": {"2024-12-30"}}
    assert parse_pubtime_bound("1704067200", end_of_day=False) == 1704067200
    signed_params = wbi_search_params(
        keyword="香奈美",
        page=2,
        page_size=30,
        order="pubdate",
        pubtime_begin_s=pubtime_begin,
        pubtime_end_s=pubtime_end,
    )
    assert signed_params["pubtime_begin_s"] == str(pubtime_begin)
    assert signed_params["pubtime_end_s"] == str(pubtime_end)
    assert signed_params["dynamic_offset"] == "30"
    assert len(signed_params["qv_id"]) == 32
    assert len(signed_params["w_rid"]) == 32
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
    review_defaults = review_worker.build_parser().parse_args(["--no-stdin", "--once"])
    assert review_defaults.output == DEFAULT_OUTPUT
    assert review_defaults.database == DEFAULT_DATABASE
    assert review_defaults.request_delay == 30.0
    assert review_defaults.request_jitter == 30.0
    assert review_defaults.idle_interval == 300.0
    assert review_worker.parse_runtime_command("2026-06-30").kind == "date"
    assert review_worker.parse_runtime_command("list 2026-06-30").value == "2026-06-30"
    assert review_worker.parse_runtime_command("video BV12JE8zdEzG").kind == "video"
    assert review_worker.parse_runtime_command("https://www.bilibili.com/video/BV12JE8zdEzG").kind == "video"
    assert review_worker.parse_runtime_command("quit").kind == "stop"
    sparse_items = [
        CoverItem(
            bvid="BVCOUNT1",
            video_url="https://www.bilibili.com/video/BVCOUNT1",
            author="tester",
            original_song_name="群青",
            video_title="count",
            published_at="2026-06-29T00:00:00+08:00",
        ),
        CoverItem(
            bvid="BVCOUNT2",
            video_url="https://www.bilibili.com/video/BVCOUNT2",
            author="tester",
            original_song_name="群青",
            video_title="count",
            published_at="2026-06-29T00:00:00+08:00",
        ),
        CoverItem(
            bvid="BVCOUNT3",
            video_url="https://www.bilibili.com/video/BVCOUNT3",
            author="tester",
            original_song_name="群青",
            video_title="count",
            published_at="2026-06-28T00:00:00+08:00",
        ),
    ]
    assert review_worker.local_date_counts(sparse_items)["2026-06-29"] == 2
    assert review_worker.schedule_review_dates(
        items=sparse_items,
        completed_dates={"2026-06-30"},
        explicit_dates=[],
        pubtime_begin="2026-06-28",
        pubtime_end="2026-06-30",
    ) == ["2026-06-28", "2026-06-29"]
    assert review_worker.schedule_review_dates(
        items=sparse_items,
        completed_dates=set(),
        explicit_dates=["2026-06-29", "2026-06-28"],
        pubtime_begin=None,
        pubtime_end=None,
    ) == ["2026-06-28", "2026-06-29"]
    with TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        old_item = CoverItem(
            bvid="BVREVIEWOLD",
            video_url="https://www.bilibili.com/video/BVREVIEWOLD",
            author="tester",
            original_song_name="旧歌",
            video_title="【AI香奈美】《旧歌》翻唱",
            published_at=iso_from_pubdate(1782748800),
            pubdate=1782748800,
            tags=["AI翻唱", "香奈美"],
            description="单曲翻唱",
            search_source="api",
        )
        local_only_item = CoverItem(
            bvid="BVREVIEWLOCAL",
            video_url="https://www.bilibili.com/video/BVREVIEWLOCAL",
            author="tester",
            original_song_name="本地曲",
            video_title="【AI香奈美】《本地曲》翻唱",
            published_at=iso_from_pubdate(1782748800),
            pubdate=1782748800,
            tags=["AI翻唱", "香奈美"],
            description="单曲翻唱",
            search_source="api",
        )
        output_path = tmp_root / "covers.json"
        output_path.write_text(
            json.dumps(build_dataset(items=[old_item, local_only_item], keywords=["香奈美"], pages=1), ensure_ascii=False),
            encoding="utf-8",
        )
        review_args = Namespace(
            page_size=30,
            max_pages_per_date=1,
            audio_dir=tmp_root / "audio",
            resource_url_prefix="/files/WIKI/audio/v-nami/",
            review_candidates=tmp_root / "review_candidates.jsonl",
            dry_run=False,
            output=output_path,
            database=tmp_root / "private" / "vnami.sqlite3",
            include_term=[],
            exclude_term=[],
        )
        review_bilibili = FakeReviewBilibili()
        review_summary = review_worker.review_date(
            bilibili=review_bilibili,
            args=review_args,
            date_key="2026-06-30",
            by_bvid={"BVREVIEWOLD": old_item, "BVREVIEWLOCAL": local_only_item},
            keywords=["香奈美"],
            pacer=review_worker.InterruptiblePacer(0, 0, Event(), verbose=False),
        )
        assert review_bilibili.pages == [1]
        assert review_summary.remote_results == 3
        assert review_summary.unique_results == 3
        assert review_summary.detail_checked == 3
        assert review_summary.accepted_new == 1
        assert review_summary.already_local == 1
        assert review_summary.rejected == 1
        assert review_summary.local_only == 1
        assert review_summary.new_bvids == ["BVREVIEWNEW"]
        assert review_summary.local_only_bvids == ["BVREVIEWLOCAL"]
        reviewed_payload = json.loads(output_path.read_text(encoding="utf-8"))
        assert {item["bvid"] for item in reviewed_payload["items"]} == {"BVREVIEWNEW", "BVREVIEWOLD", "BVREVIEWLOCAL"}
        review_list = review_worker.query_date(review_bilibili, review_args, "2026-06-30")
        assert review_list["type"] == "video_list"
        assert review_list["count"] == 3
        assert {item["localStatus"] for item in review_list["items"]} == {"saved", "missing"}
    assert candidate_status_title("<em>香奈美</em> 的夏日翻唱曲目") == "香奈美 的夏日翻唱曲"
    assert candidate_status_title("") == "无标题"
    completed_dates: dict[str, set[str]] = {}
    assert mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert is_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert not mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert clear_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert not is_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    zero_result_dates: dict[str, set[str]] = {}
    assert mark_zero_result_search_date(zero_result_dates, "香奈美", "2026-05-15")
    assert not mark_zero_result_search_date(zero_result_dates, "香奈美", "2026-05-15")
    assert clear_zero_result_search_date(zero_result_dates, "香奈美", "2026-05-15")
    assert zero_result_dates == {}
    assert mark_zero_result_search_date(zero_result_dates, "香奈美", "2026-05-15")
    assert mark_search_date_complete(completed_dates, "香奈美", "2026-05-15")
    assert drop_zero_result_dates_from_completed(completed_dates, zero_result_dates)
    assert not is_search_date_complete(completed_dates, "香奈美", "2026-05-15")
    checkpoint_path = Path(__file__).resolve().parents[1] / "data" / "smoke_checkpoint.tmp.json"
    write_checkpoint(checkpoint_path, {"BVTEST0001"}, completed_dates, {"BVTEST0001": "mismatch"}, zero_result_dates)
    try:
        assert load_completed_search_dates(checkpoint_path) == {"香奈美": {"2026-06-30"}}
        assert load_processed_statuses(checkpoint_path) == {"BVTEST0001": "mismatch"}
        assert load_zero_result_search_dates(checkpoint_path) == {"香奈美": {"2026-05-15"}}
    finally:
        checkpoint_path.unlink(missing_ok=True)
    assert date_key_from_pubdate(1782748800) == "2026-06-30"
    assert should_stop_before_complete_date("2023-08-02", "2023-08-03")
    assert not should_stop_before_complete_date("2023-08-03", "2023-08-03")
    assert not should_stop_before_complete_date("2023-08-04", "2023-08-03")
    output = io.StringIO()
    with redirect_stdout(output):
        print_search_date("2026-06-30")
    assert output.getvalue() == "当前搜索日期：2026-06-30\n"
    output = io.StringIO()
    with redirect_stdout(output):
        print_search_window_summary(SearchWindowSummary(
            date_key="2026-05-15",
            api_pages=1,
            api_requests=7,
            api_results=0,
            detail_checked=0,
            saved=0,
            skipped=0,
            errors=1,
            empty_result_retries=6,
        ))
    assert output.getvalue() == "日期总结：2026-05-15 API页数=1 API请求=7 搜索结果=0 已爬=0 已保存=0 跳过=0 异常=1 空结果重试=6\n"
    output = io.StringIO()
    with redirect_stdout(output):
        print_zero_result_review("2026-05-15")
    assert output.getvalue() == "需要人工审核：2026-05-15 搜索结果为 0，未标记为已爬完。\n"
    output = io.StringIO()
    with redirect_stdout(output):
        print_search_complete_through_date("2023-08-03")
    assert output.getvalue() == "已完成 2023-08-03 及更新视频搜索。\n"
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
    kana_result = evaluate_candidate(
        title="【AIかなみ】《群青》cover",
        tags=[],
        description="",
    )
    assert kana_result.accepted
    assert "aiかなみ" in kana_result.matched_keywords
    katakana_result = evaluate_candidate(
        title="【AIカナミ】《群青》cover",
        tags=[],
        description="",
    )
    assert katakana_result.accepted
    assert "aiカナミ" in katakana_result.matched_keywords
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
    assert extract_original_song_name("【AI香奈美】失眠-品尝过爱情的香甜") == "失眠"
    assert extract_original_song_name(
        "【AI 香奈美】“送你四季”",
        description="翻唱源：《四季予你》——洛天依",
        tags=["AI翻唱", "香奈美"],
    ) == "四季予你"
    assert extract_original_song_name(
        "【AI香奈美】银河偶像 强强高音 // AliA - かくれんぼ",
        tags=["发现《かくれんぼ》", "AI翻唱"],
    ) == "かくれんぼ"
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
    empty_second_bilibili = FakeEmptySecondPageBilibili()
    empty_second_summary = SearchWindowSummary(date_key="2026-05-15")
    fake_pacer = FakePacer()
    output = io.StringIO()
    with redirect_stdout(output):
        empty_second_batches = list(collect_search_hit_batches(
            bilibili=empty_second_bilibili,
            keyword="香奈美",
            backend="api",
            page_size=10,
            max_results=None,
            pacer=fake_pacer,
            summary=empty_second_summary,
        ))
    assert empty_second_bilibili.pages == [1, 2]
    assert [[hit.bvid for hit in batch] for batch in empty_second_batches] == [["BVONEPAGE"]]
    assert empty_second_summary.api_pages == 2
    assert empty_second_summary.api_requests == 2
    assert empty_second_summary.api_results == 1
    assert empty_second_summary.empty_result_retries == 0
    assert empty_second_summary.errors == 0
    assert "returned 0 candidates; stopping." in output.getvalue()
    recovering_bilibili = FakeRecoveringFirstPageBilibili()
    recovering_summary = SearchWindowSummary(date_key="2026-05-15")
    fake_pacer = FakePacer()
    output = io.StringIO()
    with redirect_stdout(output):
        recovering_batches = list(collect_search_hit_batches(
            bilibili=recovering_bilibili,
            keyword="香奈美",
            backend="api",
            page_size=10,
            max_results=1,
            pacer=fake_pacer,
            summary=recovering_summary,
        ))
    assert recovering_bilibili.pages == [1, 1, 1]
    assert [[hit.bvid for hit in batch] for batch in recovering_batches] == [["BVRECOVER"]]
    assert recovering_summary.api_pages == 1
    assert recovering_summary.api_requests == 3
    assert recovering_summary.api_results == 1
    assert recovering_summary.empty_result_retries == 2
    assert recovering_summary.errors == 0
    assert "retry 1/6 after 30s" in output.getvalue()
    assert "retry 2/6 after 60s" in output.getvalue()
    assert "api search retry 香奈美 page 1 2/6" in fake_pacer.labels
    assert fake_pacer.base_delays == [None, 30.0, 60.0]
    assert fake_pacer.jitters == [None, 0.0, 0.0]
    always_empty_bilibili = FakeAlwaysEmptyFirstPageBilibili()
    always_empty_summary = SearchWindowSummary(date_key="2026-05-15")
    fake_pacer = FakePacer()
    output = io.StringIO()
    with redirect_stdout(output):
        try:
            list(collect_search_hit_batches(
                bilibili=always_empty_bilibili,
                keyword="香奈美",
                backend="api",
                page_size=10,
                max_results=None,
                pacer=fake_pacer,
                summary=always_empty_summary,
            ))
        except EmptyFirstPageTimeout as exc:
            assert "stayed empty after waiting 16m" in str(exc)
        else:
            raise AssertionError("Expected EmptyFirstPageTimeout")
    assert always_empty_bilibili.pages == [1, 1, 1, 1, 1, 1, 1]
    assert always_empty_summary.api_pages == 1
    assert always_empty_summary.api_requests == 7
    assert always_empty_summary.api_results == 0
    assert always_empty_summary.empty_result_retries == 6
    assert always_empty_summary.errors == 1
    assert fake_pacer.base_delays == [None, 30.0, 60.0, 120.0, 240.0, 480.0, 960.0]
    assert fake_pacer.jitters == [None, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    assert "retry 6/6 after 960s" in output.getvalue()


if __name__ == "__main__":
    main()
