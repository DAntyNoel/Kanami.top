from __future__ import annotations

import argparse
import json
import queue
import random
import re
import sys
import threading
import time
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import crawler as crawler_module
from crawler import (
    DEFAULT_AUDIO_DIR,
    DEFAULT_CHECKPOINT,
    DEFAULT_EXCLUDE_TERMS,
    DEFAULT_INCLUDE_TERMS,
    DEFAULT_KEYWORDS,
    DEFAULT_OUTPUT,
    DATA_DIR,
    BilibiliClient,
    CoverItem,
    SearchHit,
    SearchWindowSummary,
    append_jsonl,
    date_key_from_pubdate,
    evaluate_candidate,
    extract_aid,
    extract_bvid,
    iso_from_pubdate,
    is_cooldown_exception,
    item_from_hit,
    load_completed_search_dates,
    load_existing_items,
    parse_pubtime_bound,
    read_json_file,
    search_hit_key,
    tag_names_from_payload,
    write_crawl_output,
    write_json,
)
from vnami_db import DEFAULT_DATABASE, sync_json_to_database


DEFAULT_REVIEW_CHECKPOINT = DATA_DIR / "review_checkpoint.json"
DEFAULT_REVIEW_CANDIDATES = DATA_DIR / "review_candidates.jsonl"
COMMAND_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ReviewInterrupted(RuntimeError):
    pass


@dataclass(slots=True)
class ReviewCommand:
    kind: str
    value: str = ""
    raw: str = ""


@dataclass(slots=True)
class ReviewSummary:
    date_key: str
    remote_results: int = 0
    unique_results: int = 0
    detail_checked: int = 0
    accepted_new: int = 0
    updated_existing: int = 0
    already_local: int = 0
    rejected: int = 0
    errors: int = 0
    local_only: int = 0
    api_pages: int = 0
    api_requests: int = 0
    new_bvids: list[str] = field(default_factory=list)
    updated_bvids: list[str] = field(default_factory=list)
    local_only_bvids: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ReviewCheckpoint:
    completed_dates: set[str] = field(default_factory=set)
    summaries: dict[str, dict[str, Any]] = field(default_factory=dict)


class InterruptiblePacer:
    def __init__(self, request_delay: float, request_jitter: float, interrupt_event: threading.Event, *, verbose: bool) -> None:
        self.request_delay = max(0.0, request_delay)
        self.request_jitter = max(0.0, request_jitter)
        self.interrupt_event = interrupt_event
        self.verbose = verbose

    def wait(self, label: str, base_delay: float | None = None, jitter: float | None = None) -> None:
        delay = self.request_delay if base_delay is None else max(0.0, base_delay)
        spread = self.request_jitter if jitter is None else max(0.0, jitter)
        total = delay + (random_fraction() * spread if spread else 0.0)
        if total <= 0:
            if self.interrupt_event.is_set():
                raise ReviewInterrupted
            return
        if self.verbose:
            print(f"sleep {total:.1f}s before {label}", flush=True)
        wait_interruptibly(total, self.interrupt_event)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return run_worker(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a lazy V-nami Bilibili date review worker.")
    parser.add_argument("--keyword", action="append", dest="keywords", help="Search keyword. Can be passed more than once.")
    parser.add_argument("--date", action="append", dest="dates", default=[], help="Only review this date. Can be passed more than once.")
    parser.add_argument("--pubtime-begin", help="Earliest date to schedule when --date is not provided.")
    parser.add_argument("--pubtime-end", help="Latest date to schedule when --date is not provided.")
    parser.add_argument("--page-size", type=int, default=30, help="Search results per page.")
    parser.add_argument("--max-pages-per-date", type=int, default=0, help="Maximum API pages per keyword/date. 0 means until exhausted or repeated.")
    parser.add_argument("--request-delay", type=float, default=30.0, help="Base seconds to wait before background Bilibili requests.")
    parser.add_argument("--request-jitter", type=float, default=30.0, help="Random extra seconds added to background request delay.")
    parser.add_argument("--idle-interval", type=float, default=300.0, help="Seconds to wait before rebuilding the schedule when no dates are pending.")
    parser.add_argument("--once", action="store_true", help="Review one scheduled date and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Compare only; do not add or update local output/database/checkpoint.")
    parser.add_argument("--allow-anonymous", action="store_true", help="Do not fail when cookies are missing or expired.")
    parser.add_argument("--include-crawl-completed", action="store_true", help="Do not skip dates already completed by crawler.py checkpoint.")
    parser.add_argument("--no-stdin", action="store_true", help="Disable runtime commands from stdin.")
    parser.add_argument("--verbose", action="store_true", help="Print background request sleep details.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Crawler output JSON to compare and update.")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE, help="Private SQLite database to sync after output changes.")
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR, help="Directory used for generated audio file paths.")
    parser.add_argument("--resource-url-prefix", default="/files/WIKI/audio/v-nami/", help="URL prefix used when new accepted items are added.")
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT, help="crawler.py checkpoint used to skip already completed crawl dates.")
    parser.add_argument("--review-checkpoint", type=Path, default=DEFAULT_REVIEW_CHECKPOINT, help="Review worker checkpoint path.")
    parser.add_argument("--review-candidates", type=Path, default=DEFAULT_REVIEW_CANDIDATES, help="JSONL audit log for review candidates.")
    parser.add_argument("--include-term", action="append", default=[], help="Extra include term for rough filtering.")
    parser.add_argument("--exclude-term", action="append", default=[], help="Extra exclude term for rough filtering.")
    return parser


def run_worker(args: argparse.Namespace) -> int:
    keywords = args.keywords or list(DEFAULT_KEYWORDS)
    command_queue: queue.Queue[ReviewCommand] = queue.Queue()
    interrupt_event = threading.Event()
    stop_event = threading.Event()
    if not args.no_stdin:
        start_stdin_thread(command_queue, interrupt_event, stop_event)
        if not args.verbose and sys.stdin.isatty():
            print_runtime_help()

    with BilibiliClient() as bilibili:
        if not args.allow_anonymous and not bilibili.is_logged_in():
            raise RuntimeError("Bilibili login is required. Run: python crawler.py login")

        while not stop_event.is_set():
            process_runtime_commands(bilibili, args, command_queue, interrupt_event, stop_event)
            if stop_event.is_set():
                break

            by_bvid = load_existing_items(args.output)
            checkpoint = load_review_checkpoint(args.review_checkpoint)
            completed_dates = set(checkpoint.completed_dates)
            if not args.include_crawl_completed:
                completed_dates.update(crawl_completed_dates_for_keywords(args.checkpoint, keywords))
            schedule = schedule_review_dates(
                items=list(by_bvid.values()),
                completed_dates=completed_dates,
                explicit_dates=args.dates,
                pubtime_begin=args.pubtime_begin,
                pubtime_end=args.pubtime_end,
            )

            if not schedule:
                if args.once:
                    return 0
                try:
                    wait_interruptibly(max(1.0, args.idle_interval), interrupt_event)
                except ReviewInterrupted:
                    continue
                continue

            date_key = schedule[0]
            pacer = InterruptiblePacer(args.request_delay, args.request_jitter, interrupt_event, verbose=args.verbose)
            try:
                summary = review_date(
                    bilibili=bilibili,
                    args=args,
                    date_key=date_key,
                    by_bvid=by_bvid,
                    keywords=keywords,
                    pacer=pacer,
                )
            except ReviewInterrupted:
                process_runtime_commands(bilibili, args, command_queue, interrupt_event, stop_event)
                continue
            except Exception as exc:
                if is_cooldown_exception(exc):
                    print(f"[{now_label()}] review paused after risk response on {date_key}: {exc}", flush=True)
                    try:
                        wait_interruptibly(max(1.0, args.idle_interval), interrupt_event)
                    except ReviewInterrupted:
                        continue
                    continue
                raise

            if not args.dry_run:
                checkpoint.completed_dates.add(date_key)
                checkpoint.summaries[date_key] = summary.to_json()
                write_review_checkpoint(args.review_checkpoint, checkpoint)
            print_review_summary(summary, dry_run=args.dry_run)
            if args.once:
                return 0

    return 0


def review_date(
    *,
    bilibili: BilibiliClient,
    args: argparse.Namespace,
    date_key: str,
    by_bvid: dict[str, CoverItem],
    keywords: list[str],
    pacer: InterruptiblePacer,
) -> ReviewSummary:
    include_terms = [*DEFAULT_INCLUDE_TERMS, *getattr(args, "include_term", [])]
    exclude_terms = [*DEFAULT_EXCLUDE_TERMS, *getattr(args, "exclude_term", [])]
    local_before = {item.bvid for item in local_items_for_date(by_bvid.values(), date_key)}
    remote_seen: set[str] = set()
    changed = False
    summary = ReviewSummary(date_key=date_key)

    for keyword in keywords:
        window_summary = SearchWindowSummary(date_key=date_key)
        for hit in iter_date_search_hits(
            bilibili=bilibili,
            keyword=keyword,
            date_key=date_key,
            page_size=args.page_size,
            max_pages=args.max_pages_per_date,
            pacer=pacer,
            summary=window_summary,
        ):
            if pacer.interrupt_event.is_set():
                raise ReviewInterrupted
            key = search_hit_key(hit)
            if not key or key in remote_seen:
                continue
            remote_seen.add(key)
            summary.unique_results += 1
            try:
                item, raw_record = item_from_hit(
                    bilibili=bilibili,
                    hit=hit,
                    keyword=keyword,
                    include_terms=include_terms,
                    exclude_terms=exclude_terms,
                    audio_dir=args.audio_dir,
                    resource_url_prefix=args.resource_url_prefix,
                    pacer=pacer,
                )
            except Exception as exc:
                summary.errors += 1
                append_jsonl(args.review_candidates, review_error_record(date_key, keyword, hit, exc))
                continue

            summary.detail_checked += 1
            bvid = str(raw_record.get("bvid") or hit.bvid or key)
            review_status = classify_review_record(bvid, item, by_bvid)
            raw_record["reviewDate"] = date_key
            raw_record["reviewStatus"] = review_status
            append_jsonl(args.review_candidates, raw_record)

            if review_status == "new":
                summary.accepted_new += 1
                summary.new_bvids.append(item.bvid if item else bvid)
                if item and not args.dry_run:
                    by_bvid[item.bvid] = item
                    changed = True
            elif review_status == "updated":
                summary.updated_existing += 1
                summary.updated_bvids.append(item.bvid if item else bvid)
                if item and not args.dry_run:
                    by_bvid[item.bvid] = merge_existing_item(by_bvid[item.bvid], item)
                    changed = True
            elif review_status == "already-local":
                summary.already_local += 1
            else:
                summary.rejected += 1

        summary.remote_results += window_summary.api_results
        summary.api_pages += window_summary.api_pages
        summary.api_requests += window_summary.api_requests

    local_only = sorted(local_before - remote_seen)
    summary.local_only = len(local_only)
    summary.local_only_bvids = local_only[:50]
    if changed:
        persist_review_output(args, by_bvid, keywords)
    return summary


def iter_date_search_hits(
    *,
    bilibili: BilibiliClient,
    keyword: str,
    date_key: str,
    page_size: int,
    max_pages: int,
    pacer: InterruptiblePacer,
    summary: SearchWindowSummary,
) -> Iterator[SearchHit]:
    begin_s = parse_pubtime_bound(date_key, end_of_day=False)
    end_s = parse_pubtime_bound(date_key, end_of_day=True)
    page = 1
    seen: set[str] = set()
    while max_pages <= 0 or page <= max_pages:
        if pacer.interrupt_event.is_set():
            raise ReviewInterrupted
        pacer.wait(f"api search {keyword} {date_key} page {page}")
        summary.api_pages += 1
        summary.api_requests += 1
        candidates = bilibili.search_videos(
            keyword=keyword,
            page=page,
            page_size=page_size,
            pubtime_begin_s=begin_s,
            pubtime_end_s=end_s,
        )
        summary.api_results += len(candidates)
        if not candidates:
            break
        new_hits: list[SearchHit] = []
        for hit in sorted(candidates, key=lambda candidate: candidate.pubdate or 0, reverse=True):
            key = search_hit_key(hit)
            if not key or key in seen:
                continue
            seen.add(key)
            new_hits.append(hit)
        if not new_hits:
            break
        yield from new_hits
        page += 1


def classify_review_record(bvid: str, item: CoverItem | None, by_bvid: dict[str, CoverItem]) -> str:
    if item is None:
        return "rejected-existing" if bvid in by_bvid else "rejected"
    existing = by_bvid.get(item.bvid)
    if existing is None:
        return "new"
    return "updated" if item_changed(existing, item) else "already-local"


def item_changed(existing: CoverItem, incoming: CoverItem) -> bool:
    comparable = [
        "video_url",
        "author",
        "original_song_name",
        "video_title",
        "published_at",
        "pubdate",
        "tags",
        "description",
        "cover_url",
        "search_source",
    ]
    return any(getattr(existing, key) != getattr(incoming, key) for key in comparable)


def merge_existing_item(existing: CoverItem, incoming: CoverItem) -> CoverItem:
    incoming.audio_file = existing.audio_file or incoming.audio_file
    incoming.audio_resource_url = existing.audio_resource_url or incoming.audio_resource_url
    incoming.matched_keywords = sorted(set([*existing.matched_keywords, *incoming.matched_keywords]))
    incoming.filter_notes = sorted(set([*existing.filter_notes, *incoming.filter_notes]))
    return incoming


def persist_review_output(args: argparse.Namespace, by_bvid: dict[str, CoverItem], keywords: list[str]) -> None:
    payload = read_json_file(args.output, {})
    write_crawl_output(
        output=args.output,
        items=list(by_bvid.values()),
        keywords=payload.get("keywords") if isinstance(payload, dict) and payload.get("keywords") else keywords,
        pages=int(payload.get("pagesPerKeyword") or 1) if isinstance(payload, dict) else 1,
        search_backend=str(payload.get("searchBackend") or "api") if isinstance(payload, dict) else "api",
        max_results_per_keyword=payload.get("maxResultsPerKeyword") if isinstance(payload, dict) else None,
    )
    sync_json_to_database(args.output, args.database, audio_dir=args.audio_dir)


def process_runtime_commands(
    bilibili: BilibiliClient,
    args: argparse.Namespace,
    command_queue: queue.Queue[ReviewCommand],
    interrupt_event: threading.Event,
    stop_event: threading.Event,
) -> None:
    processed = False
    while True:
        try:
            command = command_queue.get_nowait()
        except queue.Empty:
            break
        processed = True
        if command.kind == "stop":
            stop_event.set()
            print(json.dumps({"type": "worker_stop", "message": "review worker stopping"}, ensure_ascii=False), flush=True)
            continue
        if command.kind == "help":
            print_runtime_help()
            continue
        try:
            if command.kind == "date":
                print(json.dumps(query_date(bilibili, args, command.value), ensure_ascii=False, indent=2), flush=True)
            elif command.kind == "video":
                print(json.dumps(query_video_detail(bilibili, args, command.value), ensure_ascii=False, indent=2), flush=True)
            else:
                print(json.dumps({"type": "error", "input": command.raw, "message": "unknown command"}, ensure_ascii=False), flush=True)
        except Exception as exc:
            print(json.dumps({"type": "error", "input": command.raw, "message": str(exc)}, ensure_ascii=False), flush=True)
    if processed:
        interrupt_event.clear()


def query_date(bilibili: BilibiliClient, args: argparse.Namespace, date_key: str) -> dict[str, Any]:
    by_bvid = load_existing_items(args.output)
    hits: dict[str, SearchHit] = {}
    summary = SearchWindowSummary(date_key=date_key)
    pacer = InterruptiblePacer(0.0, 0.0, threading.Event(), verbose=False)
    for keyword in getattr(args, "keywords", None) or list(DEFAULT_KEYWORDS):
        for hit in iter_date_search_hits(
            bilibili=bilibili,
            keyword=keyword,
            date_key=date_key,
            page_size=args.page_size,
            max_pages=args.max_pages_per_date,
            pacer=pacer,
            summary=summary,
        ):
            key = search_hit_key(hit)
            if key:
                hits[key] = hit
    items = [search_hit_to_json(hit, by_bvid) for hit in sorted(hits.values(), key=lambda item: item.pubdate or 0, reverse=True)]
    return {
        "type": "video_list",
        "date": date_key,
        "count": len(items),
        "apiPages": summary.api_pages,
        "apiRequests": summary.api_requests,
        "items": items,
    }


def query_video_detail(bilibili: BilibiliClient, args: argparse.Namespace, value: str) -> dict[str, Any]:
    bvid = extract_bvid(value)
    aid = extract_aid(value)
    if not bvid and aid is None and value.strip().isdigit():
        aid = int(value.strip())
    if not bvid and aid is None:
        raise ValueError(f"Cannot parse BVID or av id from {value!r}")
    view = bilibili.video_view(bvid=bvid, aid=aid)
    tags = tag_names_from_payload(view)
    by_bvid = load_existing_items(args.output)
    resolved_bvid = str(view.get("bvid") or bvid or "")
    local = by_bvid.get(resolved_bvid)
    owner = view.get("owner") if isinstance(view.get("owner"), dict) else {}
    filter_result = evaluate_candidate(
        title=str(view.get("title") or ""),
        tags=tags,
        description=str(view.get("desc") or ""),
        include_terms=[*DEFAULT_INCLUDE_TERMS, *getattr(args, "include_term", [])],
        exclude_terms=[*DEFAULT_EXCLUDE_TERMS, *getattr(args, "exclude_term", [])],
    )
    return {
        "type": "video_detail",
        "query": value,
        "detail": {
            "bvid": resolved_bvid,
            "aid": view.get("aid") or aid,
            "videoUrl": f"https://www.bilibili.com/video/{resolved_bvid}" if resolved_bvid else "",
            "title": view.get("title") or "",
            "author": owner.get("name") or "",
            "publishedAt": iso_from_pubdate(as_int(view.get("pubdate"))),
            "pubdate": as_int(view.get("pubdate")),
            "tags": tags,
            "description": view.get("desc") or "",
            "coverUrl": view.get("pic"),
        },
        "filter": {
            "accepted": filter_result.accepted,
            "matchedKeywords": filter_result.matched_keywords,
            "notes": filter_result.notes,
        },
        "local": local.to_json() if local else None,
    }


def search_hit_to_json(hit: SearchHit, by_bvid: dict[str, CoverItem]) -> dict[str, Any]:
    key = search_hit_key(hit)
    local = by_bvid.get(hit.bvid) if hit.bvid else None
    return {
        "bvid": hit.bvid,
        "aid": hit.aid,
        "videoUrl": hit.arcurl or (f"https://www.bilibili.com/video/{hit.bvid}" if hit.bvid else ""),
        "title": hit.title,
        "author": hit.author,
        "publishedAt": iso_from_pubdate(hit.pubdate),
        "pubdate": hit.pubdate,
        "source": hit.source,
        "localStatus": "saved" if local else "missing",
        "localTitle": local.video_title if local else "",
        "candidateKey": key,
    }


def start_stdin_thread(
    command_queue: queue.Queue[ReviewCommand],
    interrupt_event: threading.Event,
    stop_event: threading.Event,
) -> None:
    thread = threading.Thread(
        target=stdin_loop,
        args=(command_queue, interrupt_event, stop_event),
        daemon=True,
        name="vnami-review-stdin",
    )
    thread.start()


def stdin_loop(
    command_queue: queue.Queue[ReviewCommand],
    interrupt_event: threading.Event,
    stop_event: threading.Event,
) -> None:
    while not stop_event.is_set():
        line = sys.stdin.readline()
        if line == "":
            return
        command = parse_runtime_command(line)
        if command is None:
            continue
        command_queue.put(command)
        interrupt_event.set()


def parse_runtime_command(line: str) -> ReviewCommand | None:
    raw = line.rstrip("\n")
    text = raw.strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered in {"q", "quit", "exit", "stop"}:
        return ReviewCommand("stop", raw=raw)
    if lowered in {"h", "help", "?"}:
        return ReviewCommand("help", raw=raw)
    if COMMAND_DATE_RE.fullmatch(text):
        return ReviewCommand("date", text, raw)
    parts = text.split(maxsplit=1)
    if len(parts) == 2 and parts[0].lower() in {"date", "list", "day"}:
        value = parts[1].strip()
        if COMMAND_DATE_RE.fullmatch(value):
            return ReviewCommand("date", value, raw)
    if len(parts) == 2 and parts[0].lower() in {"video", "detail", "bv", "av"}:
        return ReviewCommand("video", parts[1].strip(), raw)
    if extract_bvid(text) or extract_aid(text) is not None:
        return ReviewCommand("video", text, raw)
    return ReviewCommand("unknown", text, raw)


def print_runtime_help() -> None:
    print(
        "runtime commands: YYYY-MM-DD/list YYYY-MM-DD -> video_list; BV.../av.../video <id> -> video_detail; quit -> stop",
        flush=True,
    )


def schedule_review_dates(
    *,
    items: list[CoverItem],
    completed_dates: set[str],
    explicit_dates: list[str],
    pubtime_begin: str | None,
    pubtime_end: str | None,
) -> list[str]:
    if explicit_dates:
        candidates = {validate_date_key(value) for value in explicit_dates}
    else:
        candidates = set(date_range_keys(pubtime_begin, pubtime_end))
    candidates.difference_update(completed_dates)
    counts = local_date_counts(items)
    return sorted(candidates, key=lambda date_key: (counts.get(date_key, 0), -date_ordinal(date_key)))


def date_range_keys(pubtime_begin: str | None, pubtime_end: str | None) -> Iterator[str]:
    begin_s = parse_pubtime_bound(pubtime_begin, end_of_day=False)
    end_s = parse_pubtime_bound(pubtime_end, end_of_day=True)
    today = datetime.now(timezone.utc).astimezone().date()
    if begin_s is None:
        begin_date = date.fromisoformat(default_review_begin_date())
    else:
        begin_date = datetime.fromtimestamp(begin_s, tz=timezone.utc).astimezone().date()
    if end_s is None:
        end_date = today
    else:
        end_date = datetime.fromtimestamp(end_s, tz=timezone.utc).astimezone().date()
    current = end_date
    while current >= begin_date:
        yield current.isoformat()
        current = date.fromordinal(current.toordinal() - 1)


def local_date_counts(items: list[CoverItem]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for item in items:
        date_key = item_date_key(item)
        if date_key:
            counts[date_key] += 1
    return counts


def default_review_begin_date() -> str:
    complete_through_date = getattr(crawler_module, "DEFAULT_COMPLETE_THROUGH_DATE", "")
    if complete_through_date:
        return str(complete_through_date)
    complete_through_year = int(getattr(crawler_module, "DEFAULT_COMPLETE_THROUGH_YEAR", 2021))
    return f"{complete_through_year:04d}-01-01"


def local_items_for_date(items: Any, date_key: str) -> list[CoverItem]:
    return [item for item in items if item_date_key(item) == date_key]


def item_date_key(item: CoverItem) -> str:
    if item.pubdate:
        return date_key_from_pubdate(item.pubdate)
    published_at = item.published_at or ""
    if len(published_at) >= 10 and COMMAND_DATE_RE.fullmatch(published_at[:10]):
        return published_at[:10]
    return ""


def crawl_completed_dates_for_keywords(path: Path, keywords: list[str]) -> set[str]:
    completed_by_keyword = load_completed_search_dates(path)
    keyword_sets = [completed_by_keyword.get(keyword, set()) for keyword in keywords]
    if not keyword_sets:
        return set()
    return set.intersection(*keyword_sets)


def load_review_checkpoint(path: Path) -> ReviewCheckpoint:
    payload = read_json_file(path, {})
    if not isinstance(payload, dict):
        return ReviewCheckpoint()
    dates = payload.get("completedDates")
    summaries = payload.get("summaries")
    return ReviewCheckpoint(
        completed_dates={str(value) for value in dates or [] if value},
        summaries=summaries if isinstance(summaries, dict) else {},
    )


def write_review_checkpoint(path: Path, checkpoint: ReviewCheckpoint) -> None:
    write_json(
        path,
        {
            "version": 1,
            "updatedAt": now_label(),
            "completedDates": sorted(checkpoint.completed_dates),
            "summaries": checkpoint.summaries,
        },
    )


def review_error_record(date_key: str, keyword: str, hit: SearchHit, exc: Exception) -> dict[str, Any]:
    return {
        "checkedAt": now_label(),
        "reviewDate": date_key,
        "keyword": keyword,
        "reviewStatus": "error",
        "candidateKey": search_hit_key(hit),
        "bvid": hit.bvid,
        "aid": hit.aid,
        "videoUrl": hit.arcurl,
        "videoTitle": hit.title,
        "error": str(exc),
    }


def print_review_summary(summary: ReviewSummary, *, dry_run: bool) -> None:
    prefix = "dry-run " if dry_run else ""
    print(
        f"[{now_label()}] {prefix}review {summary.date_key}: "
        f"remote={summary.remote_results} unique={summary.unique_results} checked={summary.detail_checked} "
        f"new={summary.accepted_new} updated={summary.updated_existing} "
        f"local={summary.already_local} rejected={summary.rejected} localOnly={summary.local_only} errors={summary.errors}",
        flush=True,
    )


def random_fraction() -> float:
    return random.random()


def wait_interruptibly(seconds: float, interrupt_event: threading.Event) -> None:
    deadline = time.monotonic() + max(0.0, seconds)
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        if interrupt_event.wait(min(remaining, 0.25)):
            raise ReviewInterrupted


def validate_date_key(value: str) -> str:
    text = str(value).strip()
    if not COMMAND_DATE_RE.fullmatch(text):
        raise ValueError(f"Invalid date: {value!r}")
    date.fromisoformat(text)
    return text


def date_ordinal(value: str) -> int:
    try:
        return date.fromisoformat(value).toordinal()
    except ValueError:
        return 0


def as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    raise SystemExit(main())
