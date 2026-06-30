from __future__ import annotations

import argparse
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from crawler import (
    DEFAULT_AUDIO_DIR,
    DEFAULT_OUTPUT,
    CoverItem,
    download_item_audio,
    wait_with_jitter,
)
from vnami_db import (
    DEFAULT_DATABASE,
    pending_items,
    record_download_failure,
    record_download_success,
    sync_json_to_database,
)


@dataclass(slots=True)
class DownloadResult:
    item: CoverItem
    error: RuntimeError | None = None


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return poll_download_json(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Poll V-nami JSON output and download newly accepted mp3 files.")
    parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT, help="Crawler output JSON to poll.")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE, help="Private SQLite database for V-nami download state.")
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR, help="Directory for downloaded mp3 files.")
    parser.add_argument("--poll-interval", type=float, default=60.0, help="Seconds between JSON polling checks.")
    parser.add_argument("--idle-timeout", type=float, default=1800.0, help="Exit after this many seconds with no JSON update or new pending downloads.")
    parser.add_argument("--download-delay", type=float, default=5.0, help="Base seconds to wait between concurrent download batches.")
    parser.add_argument("--download-jitter", type=float, default=3.0, help="Random extra seconds added between concurrent download batches.")
    parser.add_argument("--concurrency", type=int, default=8, help="Maximum number of concurrent mp3 downloads.")
    parser.add_argument("--overwrite-audio", action="store_true", help="Redownload mp3 files even if they exist.")
    parser.add_argument("--retry-failed", action="store_true", help="Retry items that failed earlier in this worker process.")
    parser.add_argument("--once", action="store_true", help="Process current pending downloads once, then exit without polling.")
    return parser


def poll_download_json(args: argparse.Namespace) -> int:
    last_signature: tuple[int, int] | None = None
    last_activity = time.monotonic()

    while True:
        summary = sync_json_to_database(args.input, args.database, audio_dir=args.audio_dir)
        signature = file_signature(args.input)
        if signature != last_signature:
            last_signature = signature
            last_activity = time.monotonic()
            print(f"[{now_label()}] detected JSON update: {args.input}; active items: {summary.active_items}")

        pending = pending_items(args.database, overwrite=args.overwrite_audio, retry_failed=args.retry_failed)
        if pending:
            last_activity = time.monotonic()
            concurrency = max(1, int(args.concurrency))
            print(f"[{now_label()}] pending downloads: {len(pending)}; concurrency: {concurrency}")
            for result in download_pending_items(
                pending,
                audio_dir=args.audio_dir,
                overwrite=args.overwrite_audio,
                concurrency=concurrency,
            ):
                item = result.item
                if result.error is None:
                    item.filter_notes = remove_download_failures(item.filter_notes)
                    print(f"[{now_label()}] downloaded {item.bvid}")
                    record_download_success(args.database, item)
                else:
                    exc = result.error
                    item.filter_notes.append(f"audio-download-failed:{exc}")
                    print(f"[{now_label()}] download failed {item.bvid}: {exc}")
                    record_download_failure(args.database, item, exc)

            summary = sync_json_to_database(args.input, args.database, audio_dir=args.audio_dir)
            next_signature = file_signature(args.input)
            if next_signature != last_signature:
                last_signature = next_signature
                last_activity = time.monotonic()
                print(f"[{now_label()}] detected JSON update after download batch: {args.input}; active items: {summary.active_items}")

            if args.once:
                return 0

            wait_with_jitter(args.download_delay, args.download_jitter, "next download batch")
            continue

        if args.once:
            return 0
        idle_for = time.monotonic() - last_activity
        if idle_for >= args.idle_timeout:
            print(f"[{now_label()}] no JSON update for {args.idle_timeout:.0f}s; stopping download worker.")
            return 0

        sleep_for = max(1.0, args.poll_interval)
        time.sleep(min(sleep_for, max(1.0, args.idle_timeout - idle_for)))


def download_pending_items(
    items: list[CoverItem],
    *,
    audio_dir: Path,
    overwrite: bool,
    concurrency: int,
) -> Iterator[DownloadResult]:
    workers = max(1, concurrency)
    if workers == 1:
        for item in items:
            yield download_one_item(
                item,
                audio_dir=audio_dir,
                overwrite=overwrite,
            )
        return

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(
                download_one_item,
                item,
                audio_dir=audio_dir,
                overwrite=overwrite,
            )
            for item in items
        ]
        for future in as_completed(futures):
            yield future.result()


def download_one_item(
    item: CoverItem,
    *,
    audio_dir: Path,
    overwrite: bool,
) -> DownloadResult:
    try:
        download_item_audio(item, audio_dir=audio_dir, overwrite=overwrite)
    except RuntimeError as exc:
        return DownloadResult(item=item, error=exc)
    return DownloadResult(item=item)


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
