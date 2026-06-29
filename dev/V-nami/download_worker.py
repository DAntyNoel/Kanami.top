from __future__ import annotations

import argparse
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from crawler import (
    DEFAULT_AUDIO_DIR,
    DEFAULT_OUTPUT,
    DEFAULT_KEYWORDS,
    CoverItem,
    audio_file_exists,
    build_dataset,
    cover_item_from_json,
    download_item_audio,
    read_json_file,
    wait_with_jitter,
    write_json,
)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return poll_download_json(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Poll V-nami JSON output and download newly accepted mp3 files.")
    parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT, help="Crawler output JSON to poll.")
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR, help="Directory for downloaded mp3 files.")
    parser.add_argument("--poll-interval", type=float, default=60.0, help="Seconds between JSON polling checks.")
    parser.add_argument("--idle-timeout", type=float, default=1800.0, help="Exit after this many seconds with no JSON update or new pending downloads.")
    parser.add_argument("--download-delay", type=float, default=30.0, help="Base seconds to wait before each mp3 download.")
    parser.add_argument("--download-jitter", type=float, default=30.0, help="Random extra seconds added before each mp3 download.")
    parser.add_argument("--overwrite-audio", action="store_true", help="Redownload mp3 files even if they exist.")
    parser.add_argument("--retry-failed", action="store_true", help="Retry items that failed earlier in this worker process.")
    parser.add_argument("--once", action="store_true", help="Process current pending downloads once, then exit without polling.")
    return parser


def poll_download_json(args: argparse.Namespace) -> int:
    last_signature: tuple[int, int] | None = None
    last_activity = time.monotonic()
    failed_bvids: set[str] = set()

    while True:
        payload = read_json_file(args.input, {})
        signature = file_signature(args.input)
        if signature != last_signature:
            last_signature = signature
            last_activity = time.monotonic()
            print(f"[{now_label()}] detected JSON update: {args.input}")

        items = load_items(payload)
        pending = [
            item for item in items
            if (args.overwrite_audio or not audio_file_exists(item))
            and (args.retry_failed or item.bvid not in failed_bvids)
        ]

        if pending:
            last_activity = time.monotonic()
            print(f"[{now_label()}] pending downloads: {len(pending)}")
            for item in pending:
                wait_with_jitter(args.download_delay, args.download_jitter, f"download {item.bvid}")
                try:
                    download_item_audio(item, audio_dir=args.audio_dir, overwrite=args.overwrite_audio)
                    item.filter_notes = remove_download_failures(item.filter_notes)
                    print(f"[{now_label()}] downloaded {item.bvid}")
                except RuntimeError as exc:
                    failed_bvids.add(item.bvid)
                    item.filter_notes.append(f"audio-download-failed:{exc}")
                    print(f"[{now_label()}] download failed {item.bvid}: {exc}")
                update_item(args.input, item)
                last_signature = file_signature(args.input)

        if args.once:
            return 0

        idle_for = time.monotonic() - last_activity
        if idle_for >= args.idle_timeout:
            print(f"[{now_label()}] no JSON update for {args.idle_timeout:.0f}s; stopping download worker.")
            return 0

        sleep_for = max(1.0, args.poll_interval)
        time.sleep(min(sleep_for, max(1.0, args.idle_timeout - idle_for)))


def load_items(payload: Any) -> list[CoverItem]:
    if not isinstance(payload, dict):
        return []
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        return []
    return [cover_item_from_json(item) for item in raw_items if isinstance(item, dict)]


def update_item(path: Path, updated_item: CoverItem) -> None:
    payload = read_json_file(path, {})
    if not isinstance(payload, dict):
        return
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        return

    next_items: list[CoverItem] = []
    found = False
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        if str(raw_item.get("bvid") or "") == updated_item.bvid:
            merged = {**raw_item, **updated_item.to_json()}
            next_items.append(cover_item_from_json(merged))
            found = True
        else:
            next_items.append(cover_item_from_json(raw_item))
    if not found:
        next_items.append(updated_item)

    write_json(path, build_dataset(
        items=next_items,
        keywords=payload.get("keywords") or list(DEFAULT_KEYWORDS),
        pages=int(payload.get("pagesPerKeyword") or 1),
        search_backend=str(payload.get("searchBackend") or "both"),
        max_results_per_keyword=payload.get("maxResultsPerKeyword"),
    ))


def file_signature(path: Path) -> tuple[int, int] | None:
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    return stat.st_mtime_ns, stat.st_size


def remove_download_failures(notes: list[str]) -> list[str]:
    return [note for note in notes if not note.startswith("audio-download-failed:")]


def now_label() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


if __name__ == "__main__":
    raise SystemExit(main())
