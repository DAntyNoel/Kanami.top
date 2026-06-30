from __future__ import annotations

import sys
from argparse import Namespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crawler import (
    CoverItem,
    SearchHit,
    build_dataset,
    collect_search_hits,
    evaluate_candidate,
    extract_original_song_name,
    resolve_max_results,
    resolve_search_backend,
    search_hit_from_ytdlp,
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
                bvid=f"BVTEST{page:04d}",
                aid=None,
                title=f"{keyword} page {page}",
                author="tester",
                arcurl=f"https://www.bilibili.com/video/BVTEST{page:04d}",
            )
        ]


def main() -> None:
    result = evaluate_candidate(
        title="【AI香奈美】《群青》翻唱",
        tags=["AI翻唱", "香奈美"],
        description="单曲翻唱",
    )
    assert result.accepted
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
    payload = build_dataset(items=[item], keywords=["AI香奈美"], pages=1)
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
    collect_search_hits(
        bilibili=fake_bilibili,
        keyword="AI香奈美",
        backend="api",
        page_size=10,
        max_results=35,
        pacer=fake_pacer,
    )
    assert fake_bilibili.pages == [1, 2, 3, 4]


if __name__ == "__main__":
    main()
