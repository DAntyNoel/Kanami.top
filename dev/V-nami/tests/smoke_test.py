from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from crawler import CoverItem, build_dataset, evaluate_candidate, extract_original_song_name, search_hit_from_ytdlp


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


if __name__ == "__main__":
    main()
