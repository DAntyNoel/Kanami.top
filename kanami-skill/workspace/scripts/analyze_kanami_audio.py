#!/usr/bin/env python3
"""Produce deterministic, dependency-free statistics for Kanami audio metadata."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[3]
INPUT_PATH = REPO_ROOT / "res" / "WIKI" / "audio.json"
OUTPUT_PATH = (
    REPO_ROOT
    / "kanami-skill"
    / "workspace"
    / "skills"
    / "celebrity"
    / "kanami"
    / "knowledge"
    / "inventory"
    / "audio-analysis.json"
)

EXPECTED_SUBSECTION_COUNTS = {
    "世纪歌姬时装": 248,
    "宿舍": 179,
    "对局": 350,
    "相关音乐": 10,
    "系统播报语音": 151,
    "花的私语时装": 14,
}
EXPECTED_FILENAME_LANGUAGE_COUNTS = {
    "CN": 283,
    "EN": 202,
    "JP": 321,
    "unlabeled": 146,
}
FILENAME_LANGUAGE_RE = re.compile(
    r"(?:[_-](CN|JP|EN)|(?<=\d)(CN|JP|EN))(?:-\d+)?$", re.IGNORECASE
)

CN_GROUP_SUBSECTIONS = {
    "base_dorm": ("宿舍",),
    "match": ("对局",),
    "skin": ("世纪歌姬时装", "花的私语时装"),
}
ANCHOR_VOICE_TAGS = {
    "base_dorm": ("获得角色", "互动交谈", "打断角色状态"),
    "match": ("回合开场", "战斗失败", "战斗胜利"),
    "skin": ("选择角色", "回合开场", "战斗胜利"),
}

MUSIC_STAGE_TERMS = (
    "音乐",
    "歌声",
    "演唱",
    "舞台",
    "旋律",
    "节奏",
    "演出",
    "偶像",
    "粉丝",
    "观众",
)
MODAL_PARTICLES = (
    "啊",
    "呀",
    "哦",
    "呢",
    "吧",
    "啦",
    "嘛",
    "哟",
    "诶",
    "欸",
    "嗯",
    "哼",
    "唔",
    "呐",
)


def load_audio_metadata(path: Path) -> tuple[bytes, list[dict[str, Any]]]:
    raw = path.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("audio.json must contain a JSON object")
    entries: list[dict[str, Any]] = []
    for source_url, metadata in data.items():
        if not isinstance(source_url, str) or not isinstance(metadata, dict):
            raise ValueError("audio.json contains a non-object metadata entry")
        entry = dict(metadata)
        entry["source_url"] = source_url
        if not isinstance(entry.get("title"), str):
            raise ValueError(f"audio entry is missing title: {source_url}")
        if not isinstance(entry.get("subsection"), str):
            raise ValueError(f"audio entry is missing subsection: {source_url}")
        entries.append(entry)
    return raw, entries


def filename_language(title: str) -> str:
    match = FILENAME_LANGUAGE_RE.search(Path(title).stem)
    if match is None:
        return "unlabeled"
    return next(group.upper() for group in match.groups() if group is not None)


def sorted_counter(values: Iterable[str]) -> dict[str, int]:
    return dict(sorted(Counter(values).items()))


def token_metric(texts: list[str], tokens: Iterable[str]) -> dict[str, Any]:
    token_list = tuple(tokens)
    by_token = {
        token: sum(text.count(token) for text in texts)
        for token in token_list
    }
    return {
        "sample_count": sum(any(token in text for token in token_list) for text in texts),
        "occurrences": sum(by_token.values()),
        "by_token": {token: count for token, count in by_token.items() if count},
    }


def single_token_metric(texts: list[str], token: str) -> dict[str, int]:
    return {
        "sample_count": sum(token in text for text in texts),
        "occurrences": sum(text.count(token) for text in texts),
    }


def build_group_stats(entries: list[dict[str, Any]]) -> dict[str, Any]:
    texts = [
        entry["text"].strip()
        for entry in entries
        if isinstance(entry.get("text"), str) and entry["text"].strip()
    ]
    return {
        "file_count": len(entries),
        "text_sample_count": len(texts),
        "missing_text_count": len(entries) - len(texts),
        "average_characters": round(
            sum(len(text) for text in texts) / len(texts), 2
        )
        if texts
        else 0.0,
        "punctuation": {
            "question": token_metric(texts, ("?", "？")),
            "exclamation": token_metric(texts, ("!", "！")),
        },
        "self_reference": {
            "香奈美": single_token_metric(texts, "香奈美"),
            "我": single_token_metric(texts, "我"),
        },
        "second_person": {"你": single_token_metric(texts, "你")},
        "music_stage_terms": token_metric(texts, MUSIC_STAGE_TERMS),
        "modal_particles": token_metric(texts, MODAL_PARTICLES),
    }


def build_anchors(
    grouped_entries: dict[str, list[dict[str, Any]]]
) -> dict[str, dict[str, list[dict[str, str]]]]:
    anchors: dict[str, dict[str, list[dict[str, str]]]] = {}
    for group_name, voice_tags in ANCHOR_VOICE_TAGS.items():
        group_anchors: dict[str, list[dict[str, str]]] = {}
        entries = sorted(
            grouped_entries[group_name],
            key=lambda entry: (entry["title"], entry["source_url"]),
        )
        for voice_tag in voice_tags:
            candidates: list[dict[str, str]] = []
            for entry in entries:
                text = entry.get("text")
                if (
                    entry.get("voiceTag") != voice_tag
                    or not isinstance(text, str)
                    or not text.strip()
                    or len(text.strip()) >= 200
                ):
                    continue
                candidates.append(
                    {
                        "filename": entry["title"],
                        "text": text.strip(),
                        "voiceTag": voice_tag,
                    }
                )
                if len(candidates) == 2:
                    break
            group_anchors[voice_tag] = candidates
        anchors[group_name] = group_anchors
    return anchors


def analyze(entries: list[dict[str, Any]], input_sha256: str) -> dict[str, Any]:
    if len(entries) != 952:
        raise ValueError(f"expected 952 audio entries, found {len(entries)}")

    subsection_counts = Counter(entry["subsection"] for entry in entries)
    if dict(subsection_counts) != EXPECTED_SUBSECTION_COUNTS:
        raise ValueError(
            f"unexpected subsection counts: {dict(sorted(subsection_counts.items()))}"
        )

    voice_entries = [entry for entry in entries if "voiceTag" in entry]
    music_entries = [entry for entry in entries if "voiceTag" not in entry]
    if len(voice_entries) != 942 or len(music_entries) != 10:
        raise ValueError(
            f"expected voice/music=942/10, found {len(voice_entries)}/{len(music_entries)}"
        )

    suffix_by_title = {
        entry["title"]: filename_language(entry["title"]) for entry in entries
    }
    suffix_counts = Counter(suffix_by_title.values())
    if dict(suffix_counts) != EXPECTED_FILENAME_LANGUAGE_COUNTS:
        raise ValueError(
            f"unexpected filename language counts: {dict(sorted(suffix_counts.items()))}"
        )

    subsection_analysis: dict[str, Any] = {}
    for subsection in sorted(subsection_counts):
        subsection_entries = [
            entry for entry in entries if entry["subsection"] == subsection
        ]
        subsection_analysis[subsection] = {
            "total": len(subsection_entries),
            "filename_language": sorted_counter(
                suffix_by_title[entry["title"]] for entry in subsection_entries
            ),
            "metadata_language": sorted_counter(
                str(entry.get("language", "missing")) for entry in subsection_entries
            ),
        }

    conflicts = sorted(
        (
            {
                "filename": entry["title"],
                "filename_language": suffix_by_title[entry["title"]],
                "metadata_language": str(entry.get("language")),
                "subsection": entry["subsection"],
            }
            for entry in entries
            if suffix_by_title[entry["title"]] != "unlabeled"
            and isinstance(entry.get("language"), str)
            and suffix_by_title[entry["title"]] != entry["language"]
        ),
        key=lambda item: (item["filename"], item["subsection"]),
    )
    conflict_by_subsection = sorted_counter(
        item["subsection"] for item in conflicts
    )

    grouped_entries: dict[str, list[dict[str, Any]]] = {}
    for group_name, subsections in CN_GROUP_SUBSECTIONS.items():
        grouped_entries[group_name] = [
            entry
            for entry in entries
            if entry["subsection"] in subsections
            and suffix_by_title[entry["title"]] == "CN"
        ]
    if sum(len(group) for group in grouped_entries.values()) != suffix_counts["CN"]:
        raise ValueError("CN grouping does not cover every filename-labeled CN entry")

    anchors = build_anchors(grouped_entries)
    anchor_count = sum(
        len(items)
        for group in anchors.values()
        for items in group.values()
    )
    if any(
        len(items) > 2 or any(len(item["text"]) >= 200 for item in items)
        for group in anchors.values()
        for items in group.values()
    ):
        raise ValueError("anchor policy violation")

    return {
        "analysis_version": 1,
        "source": {
            "path": "res/WIKI/audio.json",
            "sha256": input_sha256,
        },
        "inventory": {
            "total": len(entries),
            "voice_metadata": len(voice_entries),
            "related_music": len(music_entries),
        },
        "filename_language": {
            "parser": (
                "CN/JP/EN marker at filename end, or immediately before a trailing "
                "numeric segment; otherwise unlabeled"
            ),
            "counts": dict(sorted(suffix_counts.items())),
            "by_subsection": subsection_analysis,
        },
        "metadata_language_conflicts": {
            "comparison_policy": (
                "count only entries with both a CN/JP/EN filename marker and a string "
                "metadata language; unlabeled or missing values are not conflicts"
            ),
            "count": len(conflicts),
            "by_subsection": conflict_by_subsection,
            "filename_examples": conflicts[:6],
        },
        "cn_text_groups": {
            "selection_policy": (
                "filename marker must be CN; base_dorm=宿舍, match=对局, "
                "skin=世纪歌姬时装+花的私语时装"
            ),
            "character_count_policy": (
                "Unicode code points after trimming leading/trailing whitespace; "
                "punctuation is included"
            ),
            "term_count_policy": (
                "literal substring counts; each listed term is counted independently"
            ),
            "groups": {
                group_name: {
                    "subsections": list(CN_GROUP_SUBSECTIONS[group_name]),
                    **build_group_stats(grouped_entries[group_name]),
                }
                for group_name in sorted(grouped_entries)
            },
        },
        "short_text_anchors": {
            "policy": (
                "preselected voiceTags only; deterministic filename order; "
                "at most 2 anchors per voiceTag; every text is shorter than 200 characters"
            ),
            "count": anchor_count,
            "groups": anchors,
        },
        "scope_note": (
            "Descriptive metadata and text counts only; no personality or persona "
            "conclusions are produced."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Analyze Kanami audio metadata without third-party packages"
    )
    parser.parse_args()

    raw, entries = load_audio_metadata(INPUT_PATH)
    result = analyze(entries, hashlib.sha256(raw).hexdigest())
    serialized = json.dumps(
        result, ensure_ascii=False, indent=2, sort_keys=True
    ).encode("utf-8") + b"\n"
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(serialized)
    print(
        json.dumps(
            {
                "status": "PASS",
                "output": str(OUTPUT_PATH),
                "bytes": len(serialized),
                "sha256": hashlib.sha256(serialized).hexdigest(),
                "inventory": result["inventory"],
                "metadata_language_conflicts": result[
                    "metadata_language_conflicts"
                ]["count"],
                "short_text_anchors": result["short_text_anchors"]["count"],
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
