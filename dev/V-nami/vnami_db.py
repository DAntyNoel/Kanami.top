from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from crawler import (
    DEFAULT_AUDIO_DIR,
    DEFAULT_KEYWORDS,
    PRIVATE_DIR,
    CoverItem,
    audio_file_exists,
    audio_file_name,
    build_dataset,
    chmod_private,
    cover_item_from_json,
    read_json_file,
    relative_path,
)


DEFAULT_DATABASE = PRIVATE_DIR / "vnami_downloads.sqlite3"
DEFAULT_RESOURCE_URL_PREFIX = "/files/WIKI/audio/v-nami/"


@dataclass(slots=True)
class DatabaseSyncSummary:
    active_items: int
    changed_items: int
    database: Path


def sync_json_to_database(json_path: Path, database: Path, *, audio_dir: Path = DEFAULT_AUDIO_DIR) -> DatabaseSyncSummary:
    payload = read_json_file(json_path, {})
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        ensure_database(database)
        return DatabaseSyncSummary(active_items=0, changed_items=0, database=database)

    raw_items = [item for item in payload["items"] if isinstance(item, dict)]
    now = now_label()
    changed = 0
    with connect_database(database) as db:
        db.execute("UPDATE cover_items SET active = 0")
        write_metadata(db, payload, now)
        for raw_item in raw_items:
            item = cover_item_from_json(raw_item)
            if not item.bvid:
                continue
            existing = db.execute(
                "SELECT item_json, audio_file, audio_resource_url, download_status FROM cover_items WHERE bvid = ?",
                (item.bvid,),
            ).fetchone()
            item.audio_file = existing_audio_file(existing, item, audio_dir)
            item.audio_resource_url = existing_audio_resource_url(existing, item)
            status = download_status(existing, item)
            item_json = json.dumps(item.to_json(), ensure_ascii=False, sort_keys=True)
            previous_json = existing["item_json"] if existing else None
            if item_json != previous_json or not existing or int(existing["download_status"] != status):
                changed += 1
            db.execute(
                """
                INSERT INTO cover_items (
                  bvid, active, item_json, audio_file, audio_resource_url,
                  download_status, failure_note, downloaded_at, source_updated_at, updated_at
                )
                VALUES (?, 1, ?, ?, ?, ?, NULL, ?, ?, ?)
                ON CONFLICT(bvid) DO UPDATE SET
                  active = 1,
                  item_json = excluded.item_json,
                  audio_file = excluded.audio_file,
                  audio_resource_url = excluded.audio_resource_url,
                  download_status = CASE
                    WHEN cover_items.download_status = 'failed' AND excluded.download_status = 'pending' THEN 'failed'
                    ELSE excluded.download_status
                  END,
                  failure_note = CASE
                    WHEN cover_items.download_status = 'failed' AND excluded.download_status = 'pending' THEN cover_items.failure_note
                    ELSE excluded.failure_note
                  END,
                  downloaded_at = CASE
                    WHEN excluded.download_status = 'downloaded' THEN COALESCE(cover_items.downloaded_at, excluded.downloaded_at)
                    ELSE cover_items.downloaded_at
                  END,
                  source_updated_at = excluded.source_updated_at,
                  updated_at = excluded.updated_at
                """,
                (
                    item.bvid,
                    item_json,
                    item.audio_file,
                    item.audio_resource_url,
                    status,
                    now if status == "downloaded" else None,
                    now,
                    now,
                ),
            )
    return DatabaseSyncSummary(active_items=len(raw_items), changed_items=changed, database=database)


def pending_items(database: Path, *, overwrite: bool = False, retry_failed: bool = False) -> list[CoverItem]:
    with connect_database(database) as db:
        rows = db.execute(
            "SELECT * FROM cover_items WHERE active = 1 ORDER BY COALESCE(CAST(json_extract(item_json, '$.pubdate') AS INTEGER), 0) DESC, bvid"
        ).fetchall()

    items: list[CoverItem] = []
    for row in rows:
        if row["download_status"] == "failed" and not retry_failed:
            continue
        item = item_from_row(row)
        if overwrite or not audio_file_exists(item):
            items.append(item)
    return items


def downloaded_items(database: Path) -> list[CoverItem]:
    with connect_database(database) as db:
        rows = db.execute(
            "SELECT * FROM cover_items WHERE active = 1 AND download_status = 'downloaded' ORDER BY COALESCE(CAST(json_extract(item_json, '$.pubdate') AS INTEGER), 0) DESC, bvid"
        ).fetchall()
    return [item for item in (item_from_row(row) for row in rows) if audio_file_exists(item)]


def record_download_success(database: Path, item: CoverItem) -> None:
    item.filter_notes = remove_download_failures(item.filter_notes)
    if not item.audio_resource_url:
        item.audio_resource_url = resource_url_for_item(item)
    now = now_label()
    with connect_database(database) as db:
        db.execute(
            """
            UPDATE cover_items
            SET item_json = ?, audio_file = ?, audio_resource_url = ?,
                download_status = 'downloaded', failure_note = NULL,
                downloaded_at = ?, updated_at = ?
            WHERE bvid = ?
            """,
            (
                json.dumps(item.to_json(), ensure_ascii=False, sort_keys=True),
                item.audio_file,
                item.audio_resource_url,
                now,
                now,
                item.bvid,
            ),
        )


def record_download_failure(database: Path, item: CoverItem, error: Exception) -> None:
    item.filter_notes = [*remove_download_failures(item.filter_notes), f"audio-download-failed:{error}"]
    now = now_label()
    with connect_database(database) as db:
        db.execute(
            """
            UPDATE cover_items
            SET item_json = ?, download_status = 'failed', failure_note = ?, updated_at = ?
            WHERE bvid = ?
            """,
            (
                json.dumps(item.to_json(), ensure_ascii=False, sort_keys=True),
                str(error),
                now,
                item.bvid,
            ),
        )


def build_wiki_dataset_from_database(database: Path) -> dict[str, Any]:
    with connect_database(database) as db:
        metadata = read_metadata(db)
    return build_dataset(
        items=downloaded_items(database),
        keywords=metadata.get("keywords") or list(DEFAULT_KEYWORDS),
        pages=int(metadata.get("pagesPerKeyword") or 1),
        search_backend=str(metadata.get("searchBackend") or "both"),
        max_results_per_keyword=metadata.get("maxResultsPerKeyword"),
    )


def connect_database(database: Path) -> sqlite3.Connection:
    ensure_database(database)
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_database(database: Path) -> None:
    database.parent.mkdir(parents=True, exist_ok=True)
    chmod_private(database.parent, 0o700)
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS cover_items (
              bvid TEXT PRIMARY KEY,
              active INTEGER NOT NULL DEFAULT 1,
              item_json TEXT NOT NULL,
              audio_file TEXT,
              audio_resource_url TEXT,
              download_status TEXT NOT NULL DEFAULT 'pending',
              failure_note TEXT,
              downloaded_at TEXT,
              source_updated_at TEXT,
              updated_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_cover_items_active_status ON cover_items(active, download_status)")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS metadata (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
    chmod_private(database, 0o600)


def write_metadata(db: sqlite3.Connection, payload: dict[str, Any], updated_at: str) -> None:
    metadata = {
        "keywords": payload.get("keywords") or list(DEFAULT_KEYWORDS),
        "pagesPerKeyword": payload.get("pagesPerKeyword") or 1,
        "searchBackend": payload.get("searchBackend") or "both",
        "maxResultsPerKeyword": payload.get("maxResultsPerKeyword"),
    }
    for key, value in metadata.items():
        db.execute(
            """
            INSERT INTO metadata (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value_json = excluded.value_json,
              updated_at = excluded.updated_at
            """,
            (key, json.dumps(value, ensure_ascii=False), updated_at),
        )


def read_metadata(db: sqlite3.Connection) -> dict[str, Any]:
    rows = db.execute("SELECT key, value_json FROM metadata").fetchall()
    metadata: dict[str, Any] = {}
    for row in rows:
        try:
            metadata[row["key"]] = json.loads(row["value_json"])
        except json.JSONDecodeError:
            continue
    return metadata


def existing_audio_file(existing: sqlite3.Row | None, item: CoverItem, audio_dir: Path) -> str:
    if existing and existing["audio_file"]:
        existing_item = cover_item_from_json({**item.to_json(), "audioFile": existing["audio_file"]})
        if audio_file_exists(existing_item):
            return str(existing["audio_file"])
    return relative_path(audio_dir / audio_file_name(item.bvid))


def existing_audio_resource_url(existing: sqlite3.Row | None, item: CoverItem) -> str:
    if existing and existing["audio_resource_url"]:
        return str(existing["audio_resource_url"])
    return item.audio_resource_url or resource_url_for_item(item)


def download_status(existing: sqlite3.Row | None, item: CoverItem) -> str:
    if audio_file_exists(item):
        return "downloaded"
    if existing and existing["download_status"] == "failed":
        return "failed"
    return "pending"


def item_from_row(row: sqlite3.Row) -> CoverItem:
    raw = json.loads(row["item_json"])
    raw["audioFile"] = row["audio_file"]
    raw["audioResourceUrl"] = row["audio_resource_url"]
    return cover_item_from_json(raw)


def resource_url_for_item(item: CoverItem) -> str:
    return f"{DEFAULT_RESOURCE_URL_PREFIX}{audio_file_name(item.bvid)}"


def remove_download_failures(notes: list[str]) -> list[str]:
    return [note for note in notes if not note.startswith("audio-download-failed:")]


def now_label() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
