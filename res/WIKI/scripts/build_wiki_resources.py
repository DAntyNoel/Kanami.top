#!/usr/bin/env python3
"""Build static resource maps from the Kanami Biligame Wiki pages."""

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
GALLERY_PAGE = "https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E/%E7%94%BB%E5%BB%8A"
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
GALLERY_FILE = "story_wallpapers.json"
GALLERY_TYPE = "story_wallpaper"
GALLERY_SECTION = "画廊"
CONTENT_SELECTOR = "#mw-content-text"


def text_of(node: Tag | None) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def fetch_source(source_page: str) -> str:
    response = requests.get(
        source_page,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0 KanamiTopResourceMapper/1.0"},
    )
    response.raise_for_status()
    return response.text


def extension_of(url: str) -> str:
    path = urlparse(url).path
    filename = path.rsplit("/", 1)[-1]
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def normalize_url(raw_url: str, source_page: str) -> str:
    absolute = urljoin(source_page, raw_url.strip())
    parsed = urlparse(absolute)
    path = parsed.path

    if "/images/klbq/thumb/" in path:
        path = path.replace("/images/klbq/thumb/", "/images/klbq/", 1)
        path = path.rsplit("/", 1)[0]

    return urlunparse(parsed._replace(path=path, query="", fragment=""))


def is_tracked_resource(raw_url: str, source_page: str) -> bool:
    normalized = normalize_url(raw_url, source_page)
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


def split_srcset(value: str) -> list[str]:
    urls: list[str] = []
    for candidate in value.split(","):
        url = candidate.strip().split(" ", 1)[0]
        if url:
            urls.append(url)
    return urls


def collect_urls(tag: Tag, source_page: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for attr in ("src", "data-src", "href"):
        value = tag.get(attr)
        if isinstance(value, str) and is_tracked_resource(value, source_page):
            normalized = normalize_url(value, source_page)
            if normalized not in seen:
                urls.append(value)
                seen.add(normalized)
    srcset = tag.get("srcset")
    if isinstance(srcset, str):
        for value in split_srcset(srcset):
            if is_tracked_resource(value, source_page):
                normalized = normalize_url(value, source_page)
                if normalized not in seen:
                    urls.append(value)
                    seen.add(normalized)
    return urls


def image_area(metadata: dict[str, Any]) -> int:
    width = metadata.get("width") or 0
    height = metadata.get("height") or 0
    return width * height


def merge_metadata(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    existing["occurrences"] += 1
    if incoming.get("thumbnailUrl") and (
        not existing.get("thumbnailUrl") or image_area(incoming) > image_area(existing)
    ):
        existing["thumbnailUrl"] = incoming["thumbnailUrl"]
        existing["width"] = incoming["width"]
        existing["height"] = incoming["height"]
    for key in ("title", "width", "height"):
        if not existing.get(key) and incoming.get(key):
            existing[key] = incoming[key]


def init_resources() -> dict[str, OrderedDict[str, dict[str, Any]]]:
    resources: dict[str, OrderedDict[str, dict[str, Any]]] = {}
    for filename, _resource_type in OUTPUTS.values():
        resources.setdefault(filename, OrderedDict())
    return resources


def build_main_resources(
    html: str,
    resources: dict[str, OrderedDict[str, dict[str, Any]]],
) -> None:
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one(CONTENT_SELECTOR) or soup
    current_section: str | None = None
    current_subsection: str | None = None

    for node in content.find_all(["h1", "h2", "h3", "img", "a", "source", "audio"]):
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
        for raw_url in collect_urls(node, SOURCE_PAGE):
            normalized_url = normalize_url(raw_url, SOURCE_PAGE)
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


def build_gallery_resources(
    html: str,
    resources: dict[str, OrderedDict[str, dict[str, Any]]],
) -> None:
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one(CONTENT_SELECTOR) or soup
    current_subsection: str | None = None

    for node in content.find_all(["h1", "h2", "h3", "img", "a", "source", "audio"]):
        if not isinstance(node, Tag):
            continue

        if node.name == "h2":
            heading = text_of(node)
            current_subsection = None if not heading or heading in SKIP_HEADINGS else heading
            continue
        if node.name in {"h1", "h3"}:
            continue
        if current_subsection is None:
            continue

        for raw_url in collect_urls(node, GALLERY_PAGE):
            normalized_url = normalize_url(raw_url, GALLERY_PAGE)
            extension = extension_of(normalized_url)
            media_type = MEDIA_EXTENSIONS[extension]
            if media_type != "image":
                continue

            absolute_url = urljoin(GALLERY_PAGE, raw_url.strip())
            thumbnail_url = None
            if "/images/klbq/thumb/" in urlparse(absolute_url).path:
                thumbnail_url = absolute_url

            metadata: dict[str, Any] = {
                "title": title_from(node, raw_url, normalized_url),
                "type": GALLERY_TYPE,
                "section": GALLERY_SECTION,
                "subsection": current_subsection,
                "mediaType": media_type,
                "extension": extension,
                "thumbnailUrl": thumbnail_url,
                "sourcePage": GALLERY_PAGE,
                "width": int_attr(node, "width"),
                "height": int_attr(node, "height"),
                "occurrences": 1,
            }

            target = resources[GALLERY_FILE]
            if normalized_url in target:
                merge_metadata(target[normalized_url], metadata)
            else:
                target[normalized_url] = metadata


def write_resources(resources: dict[str, OrderedDict[str, dict[str, Any]]]) -> None:
    output_dir = Path(__file__).resolve().parents[1]
    for filename, data in resources.items():
        path = output_dir / filename
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def main() -> None:
    resources = init_resources()
    build_main_resources(fetch_source(SOURCE_PAGE), resources)
    build_gallery_resources(fetch_source(GALLERY_PAGE), resources)
    write_resources(resources)
    total = sum(len(data) for data in resources.values())
    for filename, data in resources.items():
        print(f"{filename}: {len(data)}")
    print(f"total: {total}")


if __name__ == "__main__":
    main()
