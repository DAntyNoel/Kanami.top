#!/usr/bin/env python3
"""Download Kanami Wiki resources into the local server files directory.

The script reads the static resource maps from ``res/WIKI`` and mirrors every
remote media URL under ``local-server/files/WIKI`` with the same URL path shape.
It also writes local JSON maps with the same schema as the source maps, replacing
remote media URLs with paths served by the local server, for example:

    https://patchwiki.biligame.com/images/klbq/a/ab/file.png
    /files/WIKI/images/klbq/a/ab/file.png
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import requests


RESOURCE_HOST = "patchwiki.biligame.com"
RESOURCE_PATH_PREFIX = "/images/klbq/"
DEFAULT_ROUTE_PREFIX = "/files/WIKI"
WALLPAPER_MAP_NAME = "story_wallpapers.json"
DEFAULT_WALLPAPER_DIR_NAME = "wallpapers"
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Referer": "https://wiki.biligame.com/klbq/%E9%A6%99%E5%A5%88%E7%BE%8E",
}


class DownloadError(RuntimeError):
    """Raised when one or more resources fail to download."""


def default_source_dir() -> Path:
    return Path(__file__).resolve().parents[4] / "res" / "WIKI"


def default_output_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def is_resource_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and parsed.netloc == RESOURCE_HOST and parsed.path.startswith(
        RESOURCE_PATH_PREFIX
    )


def local_relative_path(url: str) -> Path:
    parsed = urlparse(url)
    path = unquote(parsed.path).lstrip("/")
    if not path.startswith(RESOURCE_PATH_PREFIX.lstrip("/")):
        raise ValueError(f"Unsupported resource path: {url}")
    return Path(*path.split("/"))


def local_route(url: str, route_prefix: str) -> str:
    parsed = urlparse(url)
    path = parsed.path
    if not path.startswith(RESOURCE_PATH_PREFIX):
        raise ValueError(f"Unsupported resource path: {url}")
    return f"{route_prefix.rstrip('/')}{path}"


def route_to_local_path(value: str, output_dir: Path, route_prefix: str) -> Path | None:
    if not isinstance(value, str):
        return None
    prefix = route_prefix.rstrip("/") + "/"
    if not value.startswith(prefix):
        return None
    return output_dir / Path(*value.removeprefix(prefix).split("/"))


def iter_source_maps(source_dir: Path) -> Iterable[Path]:
    for path in sorted(source_dir.glob("*.json")):
        if path.is_file():
            yield path


def read_json(path: Path) -> dict[str, dict[str, Any]]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


def collect_urls(data: dict[str, dict[str, Any]]) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for remote_url, metadata in data.items():
        if not isinstance(metadata, dict):
            continue
        for value in (remote_url, metadata.get("thumbnailUrl")):
            if is_resource_url(value) and value not in seen:
                urls.append(value)
                seen.add(value)
    return urls


def remap_metadata(metadata: dict[str, Any], route_prefix: str) -> dict[str, Any]:
    remapped = dict(metadata)
    thumbnail_url = remapped.get("thumbnailUrl")
    if is_resource_url(thumbnail_url):
        remapped["thumbnailUrl"] = local_route(thumbnail_url, route_prefix)
    return remapped


def build_local_map(data: dict[str, dict[str, Any]], route_prefix: str) -> dict[str, dict[str, Any]]:
    remapped: dict[str, dict[str, Any]] = {}
    for remote_url, metadata in data.items():
        if not is_resource_url(remote_url) or not isinstance(metadata, dict):
            continue
        remapped[local_route(remote_url, route_prefix)] = remap_metadata(metadata, route_prefix)
    return remapped


def download_one(
    session: requests.Session,
    url: str,
    target: Path,
    *,
    timeout: float,
    retries: int,
    force: bool,
    dry_run: bool,
) -> str:
    if target.exists() and not force:
        return "exists"
    if dry_run:
        return "pending"

    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None

    for attempt in range(1, retries + 2):
        try:
            with session.get(url, stream=True, timeout=timeout) as response:
                response.raise_for_status()
                temp_path = target.with_name(f"{target.name}.part")
                with temp_path.open("wb") as file:
                    for chunk in response.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            file.write(chunk)
                os.replace(temp_path, target)
            return "downloaded"
        except Exception as error:  # noqa: BLE001 - keep retry handling compact for CLI use.
            last_error = error
            if attempt <= retries:
                time.sleep(min(2**attempt, 10))

    raise DownloadError(f"{url} -> {target}: {last_error}")


def write_local_map(path: Path, data: dict[str, dict[str, Any]], dry_run: bool) -> None:
    if dry_run:
        return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def exported_route(path: Path, output_dir: Path, route_prefix: str) -> str | None:
    try:
        relative_path = path.relative_to(output_dir)
    except ValueError:
        return None
    return f"{route_prefix.rstrip('/')}/{relative_path.as_posix()}"


def safe_filename(value: str, fallback: str) -> str:
    stem = Path(value).stem or fallback
    for prefix in ("250px-", "800px-", "80px-", "30px-"):
        if stem.startswith(prefix):
            stem = stem.removeprefix(prefix)
            break
    cleaned = "".join("_" if char in '<>:"/\\|?*' or ord(char) < 32 else char for char in stem).strip(" ._")
    return cleaned or fallback


def wallpaper_name(index: int, source_url: str, metadata: dict[str, Any]) -> str:
    thumbnail_url = metadata.get("thumbnailUrl")
    raw_name = unquote(urlparse(thumbnail_url if isinstance(thumbnail_url, str) else source_url).path.rsplit("/", 1)[-1])
    name = safe_filename(raw_name, f"wallpaper-{index:03d}")
    extension = metadata.get("extension") or Path(urlparse(source_url).path).suffix.lstrip(".") or "png"
    return f"{index:03d}-{name}.{extension}"


def export_wallpapers(
    local_map_path: Path,
    export_dir: Path,
    *,
    output_dir: Path,
    route_prefix: str,
    dry_run: bool = False,
) -> int:
    """Copy all story wallpaper resources into one flat export directory."""

    data = read_json(local_map_path)
    records: list[dict[str, Any]] = []

    if not dry_run:
        export_dir.mkdir(parents=True, exist_ok=True)

    for index, (local_url, metadata) in enumerate(data.items(), start=1):
        if not isinstance(metadata, dict) or metadata.get("mediaType") != "image":
            continue

        source_path = route_to_local_path(local_url, output_dir, route_prefix)
        if source_path is None:
            continue
        filename = wallpaper_name(index, local_url, metadata)
        target_path = export_dir / filename

        if not dry_run:
            if not source_path.is_file():
                raise FileNotFoundError(f"wallpaper source not found: {source_path}")
            shutil.copy2(source_path, target_path)

        record = dict(metadata)
        exported_url = exported_route(target_path, output_dir, route_prefix)
        if exported_url:
            record["url"] = exported_url
        record["sourceUrl"] = local_url
        record["filePath"] = str(target_path)
        record["fileName"] = filename
        records.append(record)

    if not dry_run:
        index_path = export_dir / "index.json"
        index_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return len(records)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download all media referenced by res/WIKI maps into local-server/files/WIKI."
    )
    parser.add_argument("--source-dir", type=Path, default=default_source_dir(), help="directory containing res/WIKI JSON maps")
    parser.add_argument("--output-dir", type=Path, default=default_output_dir(), help="download and local map output directory")
    parser.add_argument("--route-prefix", default=DEFAULT_ROUTE_PREFIX, help="URL prefix written into local JSON maps")
    parser.add_argument("--timeout", type=float, default=30, help="per-request timeout in seconds")
    parser.add_argument("--retries", type=int, default=2, help="retry count after the first failed request")
    parser.add_argument("--force", action="store_true", help="download again even if a file already exists")
    parser.add_argument(
        "--export-wallpapers",
        nargs="?",
        const=DEFAULT_WALLPAPER_DIR_NAME,
        metavar="DIR",
        help="copy story wallpapers into DIR after local maps are ready; defaults to wallpapers",
    )
    parser.add_argument("--dry-run", action="store_true", help="print planned work without writing files")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    output_dir = args.output_dir.resolve()

    if not source_dir.is_dir():
        print(f"source directory not found: {source_dir}", file=sys.stderr)
        return 2

    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    total_urls = 0
    status_counts = {"downloaded": 0, "exists": 0, "pending": 0}
    errors: list[str] = []

    for source_map in iter_source_maps(source_dir):
        data = read_json(source_map)
        local_map = build_local_map(data, args.route_prefix)
        write_local_map(output_dir / source_map.name, local_map, args.dry_run)

        urls = collect_urls(data)
        total_urls += len(urls)
        print(f"{source_map.name}: {len(local_map)} entries, {len(urls)} files")

        for url in urls:
            target = output_dir / local_relative_path(url)
            try:
                status = download_one(
                    session,
                    url,
                    target,
                    timeout=args.timeout,
                    retries=args.retries,
                    force=args.force,
                    dry_run=args.dry_run,
                )
                status_counts[status] += 1
            except DownloadError as error:
                errors.append(str(error))

    print(
        "total files: "
        f"{total_urls}, downloaded: {status_counts['downloaded']}, "
        f"exists: {status_counts['exists']}, pending: {status_counts['pending']}"
    )

    if errors:
        print("failed downloads:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    if args.export_wallpapers:
        wallpaper_map_path = output_dir / WALLPAPER_MAP_NAME
        wallpaper_export_dir = Path(args.export_wallpapers)
        if not wallpaper_export_dir.is_absolute():
            wallpaper_export_dir = output_dir / wallpaper_export_dir
        count = export_wallpapers(
            wallpaper_map_path,
            wallpaper_export_dir.resolve(),
            output_dir=output_dir,
            route_prefix=args.route_prefix,
            dry_run=args.dry_run,
        )
        print(f"wallpapers exported: {count} -> {wallpaper_export_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
