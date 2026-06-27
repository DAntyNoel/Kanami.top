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
VOICE_PAGE = "https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E/%E8%AF%AD%E9%9F%B3%E5%8F%B0%E8%AF%8D"
OATH_PAGE = "https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E/%E8%AA%93%E7%BA%A6"
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
VOICE_FILE = "audio.json"
VOICE_SECTION = "语音台词"
OATH_TEXT_FILE = "oath_texts.json"
DATA_BUNDLE_FILE = "wiki-data.js"
DATA_BUNDLE_GROUPS = [
    ("emotes", "emotes.json"),
    ("wallpapers", "story_wallpapers.json"),
    ("outfits", "outfits.json"),
    ("audio", "audio.json"),
    ("character", "character.json"),
    ("weapons", "weapons.json"),
    ("skills", "skills.json"),
    ("imprints", "imprints.json"),
    ("network", "amplification_network.json"),
    ("updates", "update_history.json"),
    ("oath", OATH_TEXT_FILE),
]
CONTENT_SELECTOR = "#mw-content-text"
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": SOURCE_PAGE,
}


def text_of(node: Tag | None) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def direct_text_of(node: Tag | None) -> str:
    if node is None:
        return ""
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def fetch_source(source_page: str) -> str:
    response = requests.get(
        source_page,
        timeout=30,
        headers=REQUEST_HEADERS,
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


def media_file_name_from_link(link: Tag, raw_url: str, normalized_url: str) -> str:
    label = text_of(link).removeprefix("媒体文件:").strip()
    if label:
        return label
    return title_from(link, raw_url, normalized_url)


def language_from_filename(filename: str) -> str:
    stem = filename.rsplit(".", 1)[0]
    if re.search(r"(?:^|[-_ ])JP(?:$|[-_ 0-9])", stem, re.IGNORECASE):
        return "JP"
    if re.search(r"(?:^|[-_ ])EN(?:$|[-_ 0-9])", stem, re.IGNORECASE):
        return "EN"
    if re.search(r"(?:^|[-_ ])CN(?:$|[-_ 0-9])", stem, re.IGNORECASE) or re.search(
        r"CN$", stem, re.IGNORECASE
    ):
        return "CN"
    return "CN"


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
    for key in ("language", "text", "voiceType", "voiceTag"):
        if incoming.get(key):
            existing[key] = incoming[key]


def init_resources() -> dict[str, OrderedDict[str, dict[str, Any]]]:
    resources: dict[str, OrderedDict[str, dict[str, Any]]] = {}
    for filename, _resource_type in OUTPUTS.values():
        resources.setdefault(filename, OrderedDict())
    return resources


def empty_oath_texts() -> dict[str, Any]:
    return {
        "sourcePage": OATH_PAGE,
        "kachiuCommunications": [],
        "characterStories": [],
        "characterBiographies": [],
        "returnLetters": [],
    }


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


def build_voice_resources(
    html: str,
    resources: dict[str, OrderedDict[str, dict[str, Any]]],
) -> None:
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one(CONTENT_SELECTOR) or soup
    target = resources[VOICE_FILE]

    for table in content.select("table.voice-table"):
        heading = table.find_previous("h2")
        voice_type = text_of(heading) if heading else None
        if not voice_type or voice_type in SKIP_HEADINGS:
            continue

        current_tag: str | None = None
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) < 2:
                continue

            media_cell_index = next(
                (
                    index
                    for index, cell in enumerate(cells)
                    if any(collect_urls(link, VOICE_PAGE) for link in cell.find_all("a"))
                ),
                None,
            )
            if media_cell_index is None:
                continue

            if media_cell_index > 0:
                current_tag = text_of(cells[0])

            voice_tag = current_tag or ""
            text_cell = cells[media_cell_index + 1] if media_cell_index + 1 < len(cells) else None
            voice_text = text_of(text_cell)

            for link in cells[media_cell_index].find_all("a"):
                for raw_url in collect_urls(link, VOICE_PAGE):
                    normalized_url = normalize_url(raw_url, VOICE_PAGE)
                    extension = extension_of(normalized_url)
                    media_type = MEDIA_EXTENSIONS[extension]
                    if media_type != "audio":
                        continue

                    title = media_file_name_from_link(link, raw_url, normalized_url)
                    metadata: dict[str, Any] = {
                        "title": title,
                        "type": "audio",
                        "section": VOICE_SECTION,
                        "subsection": voice_type,
                        "mediaType": media_type,
                        "extension": extension,
                        "thumbnailUrl": None,
                        "sourcePage": VOICE_PAGE,
                        "width": None,
                        "height": None,
                        "occurrences": 1,
                        "language": language_from_filename(title),
                        "text": voice_text,
                        "voiceType": voice_type,
                        "voiceTag": voice_tag,
                    }

                    if normalized_url in target:
                        merge_metadata(target[normalized_url], metadata)
                    else:
                        target[normalized_url] = metadata


def h2_texts(content: Tag) -> dict[str, Tag]:
    return {text_of(h2): h2 for h2 in content.find_all("h2")}


def message_role(tag: Tag) -> str:
    classes = set(tag.get("class") or [])
    if "char-text" in classes:
        return "香奈美"
    if "mc-text" in classes or "textToggleDisplayButtonLabelText" in classes:
        return "引航者"
    return ""


def message_kind(tag: Tag) -> str:
    classes = set(tag.get("class") or [])
    if "textToggleDisplayButtonLabelText" in classes:
        return "option"
    return "message"


def parse_kachiu_communications(content: Tag) -> list[dict[str, Any]]:
    section = h2_texts(content).get("卡丘通讯")
    if section is None:
        return []
    container = section.find_next_sibling("div", class_="resp-tabs")
    if container is None:
        return []

    labels = [text_of(label) for label in container.select(".resp-tabs-list li")]
    panels = container.select(".resp-tabs-container > .resp-tab-content")
    entries = []
    for index, (label, panel) in enumerate(zip(labels, panels), start=1):
        messages = []
        seen_options: set[tuple[str, str]] = set()
        for tag in panel.find_all(["span", "div"]):
            classes = set(tag.get("class") or [])
            if not (
                "char-text" in classes
                or "mc-text" in classes
                or "textToggleDisplayButtonLabelText" in classes
            ):
                continue
            if "textToggleDisplayButtonLabelText" in classes and "off" in classes:
                continue
            text = text_of(tag)
            if not text:
                continue
            kind = message_kind(tag)
            role = message_role(tag)
            if kind == "option":
                option_key = (role, text)
                if option_key in seen_options:
                    continue
                seen_options.add(option_key)
            messages.append({"role": role, "kind": kind, "text": text})
        entries.append(
            {
                "id": f"kachiu-{index:02d}",
                "title": label,
                "type": "卡丘通讯",
                "sourcePage": OATH_PAGE,
                "messages": messages,
            }
        )
    return entries


def parse_story_links(content: Tag) -> list[dict[str, str]]:
    section = h2_texts(content).get("角色剧情")
    if section is None:
        return []
    nav = section.find_next_sibling("div", class_="nav-chara")
    if nav is None:
        return []

    links = []
    seen: set[str] = set()
    for box in nav.select(".game-story-box"):
        label = text_of(box)
        link = box.find("a", href=True)
        if link is None:
            continue
        href = urljoin(OATH_PAGE, link["href"])
        if href in seen:
            continue
        seen.add(href)
        links.append({"title": label, "url": href, "wikiTitle": link.get("title") or label})
    return links


def clean_story_line(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_story_page(story: dict[str, str], html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one(CONTENT_SELECTOR) or soup
    page_title_node = soup.select_one("h1")
    page_title = text_of(page_title_node) or story["wikiTitle"]
    unlock = ""
    condition_table = content.select_one("table.klbqtable.text-center")
    if condition_table:
        unlock = text_of(condition_table)

    scenes = []
    for scene_index, table in enumerate(content.select("table.klbq-story-table"), start=1):
        lines = []
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"], recursive=False)
            if not cells:
                continue
            text = clean_story_line(text_of(cells[-1]))
            if text:
                lines.append(text)
        if lines:
            scenes.append({"index": scene_index, "lines": lines})

    return {
        "title": story["title"],
        "wikiTitle": page_title,
        "type": "角色剧情",
        "sourcePage": story["url"],
        "unlockCondition": unlock,
        "scenes": scenes,
    }


def parse_character_biographies(content: Tag) -> list[dict[str, Any]]:
    section = h2_texts(content).get("角色小传")
    if section is None:
        return []

    biographies = []
    current_title = ""
    current_condition = ""
    node = section.find_next_sibling()
    while node and not (isinstance(node, Tag) and node.name == "h2"):
        if isinstance(node, Tag) and node.name == "h3":
            current_title = text_of(node)
            current_condition = ""
        elif isinstance(node, Tag) and node.name == "table" and current_title:
            current_condition = text_of(node)
        elif isinstance(node, Tag) and "poem" in (node.get("class") or []) and current_title:
            paragraphs = [
                text_of(paragraph)
                for paragraph in node.find_all("p")
                if text_of(paragraph)
            ]
            if not paragraphs:
                paragraphs = [line for line in text_of(node).split(" ") if line]
            biographies.append(
                {
                    "title": current_title,
                    "type": "角色小传",
                    "sourcePage": OATH_PAGE,
                    "unlockCondition": current_condition,
                    "paragraphs": paragraphs,
                }
            )
        node = node.find_next_sibling()
    return biographies


def parse_return_letters(content: Tag) -> list[dict[str, Any]]:
    section = h2_texts(content).get("回归信")
    if section is None:
        return []
    condition = ""
    paragraphs: list[str] = []
    node = section.find_next_sibling()
    while node and not (isinstance(node, Tag) and node.name == "h2"):
        if isinstance(node, Tag) and node.name == "table" and "navbox" not in (node.get("class") or []):
            condition = text_of(node)
        elif isinstance(node, Tag) and "poem" in (node.get("class") or []):
            paragraphs.extend(
                text_of(paragraph)
                for paragraph in node.find_all("p")
                if text_of(paragraph)
            )
        node = node.find_next_sibling()
    if not paragraphs:
        return []
    return [
        {
            "title": "回归信",
            "type": "回归信",
            "sourcePage": OATH_PAGE,
            "triggerCondition": condition,
            "paragraphs": paragraphs,
        }
    ]


def build_oath_texts(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one(CONTENT_SELECTOR) or soup
    oath_texts = empty_oath_texts()
    oath_texts["kachiuCommunications"] = parse_kachiu_communications(content)
    story_links = parse_story_links(content)
    oath_texts["characterStories"] = [
        parse_story_page(story, fetch_source(story["url"]))
        for story in story_links
    ]
    oath_texts["characterBiographies"] = parse_character_biographies(content)
    oath_texts["returnLetters"] = parse_return_letters(content)
    return oath_texts


def write_resources(resources: dict[str, OrderedDict[str, dict[str, Any]]]) -> None:
    output_dir = Path(__file__).resolve().parents[1]
    for filename, data in resources.items():
        path = output_dir / filename
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def write_oath_texts(oath_texts: dict[str, Any]) -> None:
    output_dir = Path(__file__).resolve().parents[1]
    path = output_dir / OATH_TEXT_FILE
    path.write_text(
        json.dumps(oath_texts, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_data_bundle(
    resources: dict[str, OrderedDict[str, dict[str, Any]]],
    oath_texts: dict[str, Any],
) -> None:
    payload: dict[str, Any] = {}
    for group_id, filename in DATA_BUNDLE_GROUPS:
        payload[group_id] = oath_texts if filename == OATH_TEXT_FILE else resources[filename]

    output_dir = Path(__file__).resolve().parents[1]
    path = output_dir / DATA_BUNDLE_FILE
    path.write_text(
        "window.KANAMI_WIKI_DATA="
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )


def main() -> None:
    resources = init_resources()
    build_main_resources(fetch_source(SOURCE_PAGE), resources)
    build_gallery_resources(fetch_source(GALLERY_PAGE), resources)
    build_voice_resources(fetch_source(VOICE_PAGE), resources)
    oath_texts = build_oath_texts(fetch_source(OATH_PAGE))
    write_resources(resources)
    write_oath_texts(oath_texts)
    write_data_bundle(resources, oath_texts)
    total = sum(len(data) for data in resources.values())
    for filename, data in resources.items():
        print(f"{filename}: {len(data)}")
    print(
        "oath_texts.json: "
        f"{len(oath_texts['kachiuCommunications'])} communications, "
        f"{len(oath_texts['characterStories'])} stories, "
        f"{len(oath_texts['characterBiographies'])} biographies, "
        f"{len(oath_texts['returnLetters'])} return letters"
    )
    print(f"total: {total}")


if __name__ == "__main__":
    main()
