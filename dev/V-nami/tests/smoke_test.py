from __future__ import annotations

import sys
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crawler import (
    CoverItem,
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
    load_completed_search_dates,
    mark_search_date_complete,
    resolve_max_results,
    resolve_search_backend,
    search_hit_from_ytdlp,
    write_checkpoint,
)


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


def main() -> None:
    assert DEFAULT_KEYWORDS == ["香奈美"]
    defaults = build_parser().parse_args(["crawl"])
    assert defaults.request_delay == 1.0
    assert defaults.request_jitter == 4.0
    assert defaults.cooldown_seconds == 1800.0
    assert defaults.output == DEFAULT_OUTPUT
    assert candidate_status_title("<em>香奈美</em> 的夏日翻唱曲目") == "香奈美 的夏日翻唱曲"
    assert candidate_status_title("") == "无标题"
    completed_dates: dict[str, set[str]] = {}
    assert mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert is_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    assert not mark_search_date_complete(completed_dates, "香奈美", "2026-06-30")
    checkpoint_path = Path(__file__).resolve().parents[1] / "data" / "smoke_checkpoint.tmp.json"
    write_checkpoint(checkpoint_path, {"BVTEST0001"}, completed_dates)
    try:
        assert load_completed_search_dates(checkpoint_path) == {"香奈美": {"2026-06-30"}}
    finally:
        checkpoint_path.unlink(missing_ok=True)
    assert date_key_from_pubdate(1782748800) == "2026-06-30"
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


if __name__ == "__main__":
    main()
