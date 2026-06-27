#!/usr/bin/env python3
"""Build static resource maps from the Kanami Biligame Wiki page."""

from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup, Tag


SOURCE_PAGE = "https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E"
RESOURCE_HOST_MARKER = "patchwiki.biligame.com/images/klbq/"
MEDIA_EXTENSIONS = {
    "png": "image",
    "jpg": "image",
    "jpeg": "image",
    "webp": "image",
    "gif": "image",
    "mp3": "audio",
    "wav": "audio",
    "ogg": "audio",
}

OUTPUTS = {
    ("超弦体设定", None): ("character.json", "character"),
    ("超弦体时装", None): ("outfits.json", "outfit"),
    ("超弦体武器", None): ("weapons.json", "weapon"),
    ("角色技能", None): ("skills.json", "skill"),
    ("弦能增幅网络", None): ("amplification_network.json", "amplification_network"),
    ("印迹", None): ("imprints.json", "imprint"),
    ("角色表情", "*"): ("emotes.json", "emote"),
    ("角色相关", "相关音乐"): ("audio.json", "audio"),
    ("角色相关", "相关剧情"): ("story_wallpapers.json", "story_wallpaper"),
    ("更新改动历史", None): ("update_history.json", "update_history"),
}

SKIP_HEADINGS = {"香奈美", "WIKI功能", "目录"}


def text_of(node: Tag | None) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def fetch_source() -> str:
    response = requests.get(
        SOURCE_PAGE,
        timeout=30,
        headers={"User-Agent": "KanamiTopResourceMapper/1.0"},
    )
    response.raise_for_status()
    return response.text


def extension_of(url: str) -> str:
    path = urlparse(url).path
    filename = path.rsplit("/", 1)[-1]
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def normalize_url(raw_url: str) -> str:
    absolute = urljoin(SOURCE_PAGE, raw_url.strip())
    parsed = urlparse(absolute)
    path = parsed.path

    if "/images/klbq/thumb/" in path:
        path = path.replace("/images/klbq/thumb/", "/images/klbq/", 1)
        path = path.rsplit("/", 1)[0]

    return urlunparse(parsed._replace(path=path, query="", fragment=""))


def is_tracked_resource(raw_url: str) -> bool:
    normalized = normalize_url(raw_url)
    return RESOURCE_HOST_MARKER in normalized and extension_of(normalized) in MEDIA_EXTENSIONS


def output_for(section: str | None, subsection: str | None) -> tuple[str, str] | None:
    if section is None:
        return None

    exact = OUTPUTS.get((section, subsection))
    if exact:
        return exact

    wildcard = OUTPUTS.get((section, "*"))
    if wildcard:
        return wildcard

    return OUTPUTS.get((section, None))


def title_from(tag: Tag, raw_url: str, normalized_url: str) -> str:
    for attr in ("alt", "title", "aria-label"):
        value = tag.get(attr)
        if isinstance(value, str) and value.strip():
            return re.sub(r"\s+", " ", value).strip()

    source_name = unquote(urlparse(raw_url).path.rsplit("/", 1)[-1])
    normalized_name = unquote(urlparse(normalized_url).path.rsplit("/", 1)[-1])
    return source_name or normalized_name


def int_attr(tag: Tag, name: str) -> int | None:
    value = tag.get(name) or tag.get(f"data-file-{name}")
    if isinstance(value, str) and value.isdigit():
        return int(value)
    if isinstance(value, int):
        return value
    return None


def collect_urls(tag: Tag) -> list[str]:
    urls: list[str] = []
    for attr in ("src", "data-src", "href"):
        value = tag.get(attr)
        if isinstance(value, str) and is_tracked_resource(value):
            urls.append(value)
    return urls


def merge_metadata(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    existing["occurrences"] += 1
    if not existing.get("thumbnailUrl") and incoming.get("thumbnailUrl"):
        existing["thumbnailUrl"] = incoming["thumbnailUrl"]
    for key in ("title", "width", "height"):
        if not existing.get(key) and incoming.get(key):
            existing[key] = incoming[key]


def build_resources(html: str) -> dict[str, OrderedDict[str, dict[str, Any]]]:
    soup = BeautifulSoup(html, "html.parser")
    resources: dict[str, OrderedDict[str, dict[str, Any]]] = {}
    for filename, _resource_type in OUTPUTS.values():
        resources.setdefault(filename, OrderedDict())
    current_section: str | None = None
    current_subsection: str | None = None

    for node in soup.find_all(["h1", "h2", "h3", "img", "a", "source", "audio"]):
        if not isinstance(node, Tag):
            continue

        if node.name in {"h1", "h2", "h3"}:
            heading = text_of(node)
            if not heading or heading in SKIP_HEADINGS:
                continue
            if node.name == "h2":
                current_section = heading
                current_subsection = None
            elif node.name == "h3" and current_section:
                current_subsection = heading
            continue

        output = output_for(current_section, current_subsection)
        if output is None:
            continue

        filename, resource_type = output
        for raw_url in collect_urls(node):
            normalized_url = normalize_url(raw_url)
            extension = extension_of(normalized_url)
            media_type = MEDIA_EXTENSIONS[extension]
            absolute_url = urljoin(SOURCE_PAGE, raw_url.strip())
            thumbnail_url = None
            if "/images/klbq/thumb/" in urlparse(absolute_url).path:
                thumbnail_url = absolute_url

            metadata: dict[str, Any] = {
                "title": title_from(node, raw_url, normalized_url),
                "type": resource_type,
                "section": current_section,
                "subsection": current_subsection,
                "mediaType": media_type,
                "extension": extension,
                "thumbnailUrl": thumbnail_url,
                "sourcePage": SOURCE_PAGE,
                "width": int_attr(node, "width") if media_type == "image" else None,
                "height": int_attr(node, "height") if media_type == "image" else None,
                "occurrences": 1,
            }

            target = resources[filename]
            if normalized_url in target:
                merge_metadata(target[normalized_url], metadata)
            else:
                target[normalized_url] = metadata

    return resources


def write_resources(resources: dict[str, OrderedDict[str, dict[str, Any]]]) -> None:
    output_dir = Path(__file__).resolve().parents[1]
    for filename, data in resources.items():
        path = output_dir / filename
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def main() -> None:
    resources = build_resources(fetch_source())
    write_resources(resources)
    total = sum(len(data) for data in resources.values())
    for filename, data in resources.items():
        print(f"{filename}: {len(data)}")
    print(f"total: {total}")


if __name__ == "__main__":
    main()
