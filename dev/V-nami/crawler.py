from __future__ import annotations

import argparse
import html
import json
import math
import os
import random
import re
import shutil
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from http.cookiejar import Cookie
from pathlib import Path
from typing import Any

import httpx


PROJECT_ROOT = Path(__file__).resolve().parent
PRIVATE_DIR = Path(os.environ.get("VNAMI_PRIVATE_DIR", PROJECT_ROOT / ".private"))
DATA_DIR = Path(os.environ.get("VNAMI_DATA_DIR", PROJECT_ROOT / "data"))
DEFAULT_OUTPUT = DATA_DIR / "kanami_ai_covers.json"
DEFAULT_AUDIO_DIR = DATA_DIR / "audio"
DEFAULT_CHECKPOINT = DATA_DIR / "crawl_checkpoint.json"
DEFAULT_RAW_CANDIDATES = DATA_DIR / "raw_candidates.jsonl"
COOKIE_JSON = PRIVATE_DIR / "bilibili_cookies.json"
COOKIE_TXT = PRIVATE_DIR / "bilibili_cookies.txt"

QR_GENERATE_URL = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
QR_POLL_URL = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
NAV_URL = "https://api.bilibili.com/x/web-interface/nav"
SEARCH_URL = "https://api.bilibili.com/x/web-interface/search/type"
VIEW_URL = "https://api.bilibili.com/x/web-interface/view"
TAGS_URL = "https://api.bilibili.com/x/tag/archive/tags"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Referer": "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com",
}

DEFAULT_KEYWORDS = [
    "香奈美",
]

DEFAULT_INCLUDE_TERMS = [
    "ai香奈美",
    "香奈美ai",
    "ai音乐",
    "ai歌曲",
    "ai 翻唱",
    "翻唱",
    "cover",
    "ai cover",
    "sovits",
    "rvc",
]

DEFAULT_EXCLUDE_TERMS = [
    "教程",
    "数据集",
    "模型配布",
    "直播",
    "切片",
    "杂谈",
    "剧情",
    "台词",
]

RESOURCE_GROUP = {
    "id": "kanami_ai_covers",
    "label": "香奈美 AI 翻唱",
    "file": "custom_kanami_ai_covers.json",
    "manageable": True,
    "custom": True,
    "fields": [
        {"key": "videoUrl", "label": "视频链接", "required": True},
        {"key": "author", "label": "作者", "required": True},
        {"key": "originalSongName", "label": "原唱曲目名称", "required": True},
        {"key": "videoTitle", "label": "视频标题", "required": True},
        {"key": "publishedAt", "label": "发布日期", "required": True},
        {"key": "bvid", "label": "BVID", "required": True},
    ],
}

HTML_TAG_RE = re.compile(r"<[^>]+>")
BVID_RE = re.compile(r"\bBV[0-9A-Za-z]{8,}\b")
AV_RE = re.compile(r"(?:/video/)?av(?P<aid>\d+)", re.IGNORECASE)
AI_TAG_RE = re.compile(r"(^|[^a-z0-9])ai($|[^a-z0-9])|aigc|rvc|sovits|so-vits", re.IGNORECASE)
TAG_COVER_TERMS = ["翻唱", "cover", "歌ってみた"]
SONG_PATTERNS = [
    re.compile(r"《([^》]{1,80})》"),
    re.compile(r"「([^」]{1,80})」"),
    re.compile(r"『([^』]{1,80})』"),
    re.compile(r"【([^】]{1,80})】"),
    re.compile(r"\[([^\]]{1,80})\]"),
]


@dataclass(slots=True)
class SearchHit:
    bvid: str
    aid: int | None
    title: str
    author: str
    arcurl: str
    pubdate: int | None = None
    description: str = ""
    pic: str | None = None
    tag_text: str = ""
    source: str = "api"


@dataclass(slots=True)
class CoverItem:
    bvid: str
    video_url: str
    author: str
    original_song_name: str
    video_title: str
    published_at: str
    pubdate: int | None = None
    audio_file: str | None = None
    audio_resource_url: str | None = None
    tags: list[str] = field(default_factory=list)
    description: str = ""
    cover_url: str | None = None
    matched_keywords: list[str] = field(default_factory=list)
    filter_notes: list[str] = field(default_factory=list)
    search_source: str = "api"

    def to_json(self) -> dict[str, Any]:
        data = asdict(self)
        return {
            "bvid": data["bvid"],
            "videoUrl": data["video_url"],
            "author": data["author"],
            "originalSongName": data["original_song_name"],
            "videoTitle": data["video_title"],
            "publishedAt": data["published_at"],
            "pubdate": data["pubdate"],
            "audioFile": data["audio_file"],
            "audioResourceUrl": data["audio_resource_url"],
            "tags": data["tags"],
            "description": data["description"],
            "coverUrl": data["cover_url"],
            "matchedKeywords": data["matched_keywords"],
            "filterNotes": data["filter_notes"],
            "searchSource": data["search_source"],
        }


@dataclass(slots=True)
class FilterResult:
    accepted: bool
    matched_keywords: list[str]
    notes: list[str]


class CrawlPacer:
    def __init__(self, request_delay: float, request_jitter: float, cooldown_seconds: float) -> None:
        self.request_delay = max(0.0, request_delay)
        self.request_jitter = max(0.0, request_jitter)
        self.cooldown_seconds = max(0.0, cooldown_seconds)

    def wait(self, label: str, base_delay: float | None = None, jitter: float | None = None) -> None:
        delay = self.request_delay if base_delay is None else max(0.0, base_delay)
        spread = self.request_jitter if jitter is None else max(0.0, jitter)
        total = delay + (random.uniform(0.0, spread) if spread else 0.0)
        if total <= 0:
            return
        print(f"sleep {total:.1f}s before {label}")
        time.sleep(total)

    def cooldown(self, reason: str) -> None:
        if self.cooldown_seconds <= 0:
            return
        print(f"cooldown {self.cooldown_seconds:.0f}s: {reason}")
        time.sleep(self.cooldown_seconds)


class CredentialStore:
    def ensure_private_dir(self) -> None:
        PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
        chmod_private(PRIVATE_DIR, 0o700)

    def load_cookies(self) -> httpx.Cookies:
        cookies = httpx.Cookies()
        if not COOKIE_JSON.exists():
            return cookies
        payload = json.loads(COOKIE_JSON.read_text(encoding="utf-8"))
        for item in payload.get("cookies", []):
            name = item.get("name")
            value = item.get("value")
            if not name or value is None:
                continue
            cookies.set(name, value, domain=item.get("domain") or ".bilibili.com", path=item.get("path") or "/")
        return cookies

    def client(self) -> httpx.Client:
        return httpx.Client(
            cookies=self.load_cookies(),
            headers=DEFAULT_HEADERS,
            follow_redirects=True,
            timeout=httpx.Timeout(20.0, connect=10.0),
        )

    def save_from_client(self, client: httpx.Client) -> None:
        self.ensure_private_dir()
        cookies = [cookie_to_dict(cookie) for cookie in client.cookies.jar]
        payload = {
            "version": 1,
            "savedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "cookies": cookies,
        }
        COOKIE_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        COOKIE_TXT.write_text(to_netscape(cookies), encoding="utf-8")
        chmod_private(COOKIE_JSON, 0o600)
        chmod_private(COOKIE_TXT, 0o600)

    def check_login(self) -> dict[str, Any]:
        with self.client() as client:
            response = client.get(NAV_URL)
            response.raise_for_status()
            payload = response.json()
        data = payload.get("data") or {}
        return {
            "isLogin": bool(data.get("isLogin")),
            "uname": data.get("uname"),
            "mid": data.get("mid"),
            "message": payload.get("message") or "",
        }

    def login_by_qr(self, timeout_seconds: int = 180, poll_interval: float = 2.0) -> dict[str, Any]:
        self.ensure_private_dir()
        with httpx.Client(headers=DEFAULT_HEADERS, follow_redirects=True, timeout=20.0) as client:
            generated = client.get(QR_GENERATE_URL)
            generated.raise_for_status()
            payload = generated.json()
            if payload.get("code") != 0:
                raise RuntimeError(f"Failed to generate QR login: {payload}")
            data = payload.get("data") or {}
            login_url = data.get("url")
            qrcode_key = data.get("qrcode_key")
            if not login_url or not qrcode_key:
                raise RuntimeError(f"QR login payload is missing fields: {payload}")

            print("Use the Bilibili mobile app to scan this login QR:")
            print_qr(login_url)
            print(login_url)

            deadline = time.monotonic() + timeout_seconds
            last_message = ""
            while time.monotonic() < deadline:
                result = client.get(QR_POLL_URL, params={"qrcode_key": qrcode_key})
                result.raise_for_status()
                poll_payload = result.json()
                poll_data = poll_payload.get("data") or {}
                code = poll_data.get("code")
                message = poll_data.get("message") or poll_payload.get("message") or ""
                if message and message != last_message:
                    print(message)
                    last_message = message
                if code == 0:
                    self.save_from_client(client)
                    return self.check_login()
                if code == 86038:
                    raise RuntimeError("Bilibili QR login expired.")
                time.sleep(poll_interval)
        raise TimeoutError("Timed out waiting for Bilibili QR confirmation.")


class BilibiliClient:
    def __init__(self) -> None:
        self.store = CredentialStore()
        self.client = self.store.client()

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> "BilibiliClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def is_logged_in(self) -> bool:
        return self.store.check_login()["isLogin"]

    def ensure_search_cookie(self) -> None:
        if not self.client.cookies.get("buvid3", domain=".bilibili.com"):
            self.client.cookies.set("buvid3", f"{uuid.uuid4()}infoc", domain=".bilibili.com", path="/")

    def search_videos(self, keyword: str, page: int = 1, page_size: int = 30) -> list[SearchHit]:
        self.ensure_search_cookie()
        response = self.client.get(
            SEARCH_URL,
            params={
                "Search_key": keyword,
                "search_type": "video",
                "keyword": keyword,
                "page": page,
                "page_size": page_size,
                "context": "",
                "duration": 0,
                "tids_2": "",
                "__refresh__": "true",
                "tids": 0,
                "highlight": 1,
                "order": "pubdate",
            },
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            raise RuntimeError(f"Bilibili search failed for {keyword!r}: {payload}")
        results = (payload.get("data") or {}).get("result") or []
        return [search_hit_from_payload(item) for item in results if item.get("bvid")]

    def search_videos_ytdlp(self, keyword: str, max_results: int) -> list[SearchHit]:
        try:
            import yt_dlp
        except ImportError as exc:
            raise RuntimeError("yt-dlp is required for the yt-dlp search backend.") from exc

        options: dict[str, Any] = {
            "quiet": True,
            "skip_download": True,
            "extract_flat": "in_playlist",
            "noplaylist": False,
            "playlistend": max_results,
            "ignoreerrors": True,
        }
        if COOKIE_TXT.exists():
            options["cookiefile"] = str(COOKIE_TXT)
        query = f"bilisearch{max(1, max_results)}:{keyword}"
        with yt_dlp.YoutubeDL(options) as ydl:
            payload = ydl.extract_info(query, download=False)
        entries = (payload or {}).get("entries") or []
        hits = [search_hit_from_ytdlp(entry) for entry in entries if entry]
        return [hit for hit in hits if hit.bvid or hit.aid]

    def video_view(self, bvid: str | None = None, aid: int | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if bvid:
            params["bvid"] = bvid
        elif aid:
            params["aid"] = aid
        else:
            raise ValueError("bvid or aid is required")
        response = self.client.get(VIEW_URL, params=params)
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            video_id = bvid or f"av{aid}"
            raise RuntimeError(f"Bilibili view failed for {video_id}: {payload}")
        return payload.get("data") or {}

    def video_tags(self, bvid: str, aid: int | None = None) -> list[str]:
        params: dict[str, Any] = {"bvid": bvid}
        if aid:
            params["aid"] = aid
        response = self.client.get(TAGS_URL, params=params)
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            return []
        return [str(item.get("tag_name") or "").strip() for item in payload.get("data") or [] if item.get("tag_name")]


def crawl(args: argparse.Namespace) -> int:
    if args.download_only:
        return download_only(args)

    keywords = args.keywords or list(DEFAULT_KEYWORDS)
    include_terms = [*DEFAULT_INCLUDE_TERMS, *args.include_term]
    exclude_terms = [*DEFAULT_EXCLUDE_TERMS, *args.exclude_term]
    by_bvid: dict[str, CoverItem] = load_existing_items(args.output) if args.resume else {}
    processed_keys = load_processed_keys(args.checkpoint) if args.resume else set()
    page_size = max(1, min(int(args.page_size), 50))
    max_results = resolve_max_results(args, page_size)
    search_backend = resolve_search_backend(args)
    pacer = CrawlPacer(
        request_delay=args.request_delay,
        request_jitter=args.request_jitter,
        cooldown_seconds=args.cooldown_seconds,
    )
    if args.search_backend == "auto":
        print(f"search backend auto resolved to {search_backend}")
    if args.background_download:
        print("background download moved to download_worker.py; crawler will only update the JSON output.")
    should_download = not args.no_audio and not args.search_only and not args.background_download
    candidates_this_run = 0
    accepted_this_run = 0

    def persist() -> None:
        write_crawl_output(
            output=args.output,
            items=list(by_bvid.values()),
            keywords=keywords,
            pages=max(1, args.pages),
            search_backend=search_backend,
            max_results_per_keyword=max_results,
        )
        write_checkpoint(args.checkpoint, processed_keys)

    with BilibiliClient() as bilibili:
        if not args.allow_anonymous and not bilibili.is_logged_in():
            raise RuntimeError("Bilibili login is required. Run: python crawler.py login")

        for keyword in keywords:
            try:
                hits = collect_search_hits(
                    bilibili=bilibili,
                    keyword=keyword,
                    backend=search_backend,
                    page_size=page_size,
                    max_results=max_results,
                    pacer=pacer,
                )
            except Exception as exc:
                if is_cooldown_exception(exc):
                    pacer.cooldown(f"search failed for {keyword}: {exc}")
                    continue
                raise

            for hit in hits:
                candidate_key = search_hit_key(hit)
                if not candidate_key or candidate_key in processed_keys:
                    continue
                if args.max_candidates_per_run and candidates_this_run >= args.max_candidates_per_run:
                    persist()
                    return 0

                candidates_this_run += 1
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
                    append_jsonl(args.raw_candidates, raw_error_record(keyword, hit, exc))
                    processed_keys.add(candidate_key)
                    persist()
                    if is_cooldown_exception(exc):
                        pacer.cooldown(f"candidate failed for {candidate_key}: {exc}")
                        continue
                    raise

                append_jsonl(args.raw_candidates, raw_record)
                processed_keys.add(candidate_key)
                if raw_record.get("bvid"):
                    processed_keys.add(str(raw_record["bvid"]))

                if item and item.bvid in by_bvid:
                    if keyword not in by_bvid[item.bvid].matched_keywords:
                        by_bvid[item.bvid].matched_keywords.append(keyword)
                elif item:
                    by_bvid[item.bvid] = item
                    accepted_this_run += 1
                    if should_download:
                        wait_with_jitter(args.download_delay, args.download_jitter, f"download {item.bvid}")
                        try:
                            download_item_audio(item, audio_dir=args.audio_dir, overwrite=args.overwrite_audio)
                        except RuntimeError as exc:
                            item.filter_notes.append(f"audio-download-failed:{exc}")
                persist()
                if args.max_accepted_per_run and accepted_this_run >= args.max_accepted_per_run:
                    persist()
                    return 0

    persist()
    items = sorted(by_bvid.values(), key=lambda item: item.pubdate or 0, reverse=True)
    print(f"Wrote {len(items)} items to {args.output}.")
    print(f"resourceMap entries: {len(build_resource_map(items))}.")
    return 0


def collect_search_hits(
    *,
    bilibili: BilibiliClient,
    keyword: str,
    backend: str,
    page_size: int,
    max_results: int,
    pacer: CrawlPacer,
) -> list[SearchHit]:
    hits: list[SearchHit] = []
    seen: set[str] = set()

    def append(candidates: list[SearchHit]) -> None:
        for hit in candidates:
            key = search_hit_key(hit)
            if not key or key in seen:
                continue
            seen.add(key)
            hits.append(hit)

    if backend in {"yt-dlp", "both"}:
        try:
            pacer.wait(f"yt-dlp search {keyword}")
            append(bilibili.search_videos_ytdlp(keyword, max_results=max_results))
        except Exception as exc:
            if backend == "yt-dlp":
                raise
            print(f"yt-dlp search failed for {keyword!r}, falling back to Bilibili API: {exc}")

    if backend in {"api", "both"} and len(hits) < max_results:
        api_pages = max(1, math.ceil(max_results / page_size))
        for page in range(1, api_pages + 1):
            pacer.wait(f"api search {keyword} page {page}")
            candidates = bilibili.search_videos(keyword=keyword, page=page, page_size=page_size)
            if not candidates:
                break
            append(candidates)
            if len(hits) >= max_results:
                break
    return hits[:max_results]


def item_from_hit(
    *,
    bilibili: BilibiliClient,
    hit: SearchHit,
    keyword: str,
    include_terms: list[str],
    exclude_terms: list[str],
    audio_dir: Path,
    resource_url_prefix: str,
    pacer: CrawlPacer,
) -> tuple[CoverItem | None, dict[str, Any]]:
    pacer.wait(f"video detail {search_hit_key(hit)}")
    view = bilibili.video_view(bvid=hit.bvid, aid=hit.aid)
    bvid = str(view.get("bvid") or hit.bvid or "")
    if not bvid:
        return None, raw_candidate_record(keyword, hit, view, None, accepted=False, notes=["missing-bvid"])
    title = str(view.get("title") or hit.title)
    owner = view.get("owner") or {}
    author = str(owner.get("name") or hit.author or "")
    pubdate = int_or_none(view.get("pubdate")) or hit.pubdate
    description = str(view.get("desc") or hit.description or "")
    aid = int_or_none(view.get("aid")) or hit.aid
    pacer.wait(f"video tags {bvid}")
    tags = bilibili.video_tags(bvid, aid)
    if hit.tag_text:
        tags.extend([tag.strip() for tag in hit.tag_text.split(",") if tag.strip()])
    tags = sorted(set(tags))

    filter_result = evaluate_candidate(
        title=title,
        tags=tags,
        description=description,
        include_terms=include_terms,
        exclude_terms=exclude_terms,
    )
    if not filter_result.accepted:
        raw_record = raw_candidate_record(keyword, hit, view, filter_result, accepted=False, notes=filter_result.notes)
        raw_record["tags"] = tags
        return None, raw_record

    audio_resource_url = f"{resource_url_prefix.rstrip('/')}/{audio_file_name(bvid)}"
    item = CoverItem(
        bvid=bvid,
        video_url=f"https://www.bilibili.com/video/{bvid}",
        author=author,
        original_song_name=extract_original_song_name(title),
        video_title=title,
        published_at=iso_from_pubdate(pubdate),
        pubdate=pubdate,
        audio_file=relative_path(audio_dir / audio_file_name(bvid)),
        audio_resource_url=audio_resource_url,
        tags=tags,
        description=description,
        cover_url=view.get("pic") or hit.pic,
        matched_keywords=sorted(set([keyword, *filter_result.matched_keywords])),
        filter_notes=filter_result.notes,
        search_source=hit.source,
    )
    raw_record = raw_candidate_record(keyword, hit, view, filter_result, accepted=True, notes=filter_result.notes)
    raw_record["tags"] = tags
    return item, raw_record


def download_items(items: list[CoverItem], *, audio_dir: Path, overwrite: bool) -> None:
    for item in items:
        try:
            download_item_audio(item, audio_dir=audio_dir, overwrite=overwrite)
        except RuntimeError as exc:
            item.filter_notes.append(f"audio-download-failed:{exc}")


def download_item_audio(item: CoverItem, *, audio_dir: Path, overwrite: bool) -> None:
    path = download_audio_mp3(
        video_url=item.video_url,
        bvid=item.bvid,
        audio_dir=audio_dir,
        overwrite=overwrite,
    )
    item.audio_file = relative_path(path)


def download_audio_mp3(*, video_url: str, bvid: str, audio_dir: Path, overwrite: bool = False) -> Path:
    audio_dir.mkdir(parents=True, exist_ok=True)
    target = audio_dir / audio_file_name(bvid)
    if target.exists() and not overwrite:
        return target
    if not COOKIE_TXT.exists():
        raise RuntimeError(f"Missing Bilibili cookie file: {COOKIE_TXT}")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to extract mp3 audio.")
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp is required to download Bilibili audio.") from exc

    options = {
        "format": "bestaudio/best",
        "outtmpl": str(audio_dir / f"bilibili_{bvid}.%(ext)s"),
        "cookiefile": str(COOKIE_TXT),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": False,
        "retries": 3,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([video_url])

    if not target.exists():
        matches = sorted(audio_dir.glob(f"bilibili_{bvid}*.mp3"))
        if matches:
            matches[0].rename(target)
    if not target.exists():
        raise RuntimeError(f"yt-dlp finished but mp3 was not found for {bvid}.")
    return target


def evaluate_candidate(
    *,
    title: str,
    tags: list[str],
    description: str,
    include_terms: list[str] | None = None,
    exclude_terms: list[str] | None = None,
) -> FilterResult:
    include_terms = include_terms or DEFAULT_INCLUDE_TERMS
    exclude_terms = exclude_terms or DEFAULT_EXCLUDE_TERMS
    haystack = " ".join([title, description, *tags]).lower()
    normalized_no_space = haystack.replace(" ", "")
    notes: list[str] = []
    matched: list[str] = []

    has_kanami = "香奈美" in haystack or "kanami" in haystack
    if not has_kanami:
        notes.append("missing-kanami")

    for term in include_terms:
        term_l = term.lower()
        if term_l in haystack or term_l.replace(" ", "") in normalized_no_space:
            matched.append(term)

    if "ai" in haystack and ("翻唱" in haystack or "cover" in haystack):
        matched.append("ai+cover")

    if tags_match_ai_cover(tags):
        matched.append("tag:ai+cover")

    excluded = [term for term in exclude_terms if term.lower() in haystack]
    if excluded:
        notes.append(f"excluded:{','.join(excluded)}")

    accepted = has_kanami and bool(matched) and not excluded
    if not accepted and not notes:
        notes.append("low-confidence")
    return FilterResult(accepted=accepted, matched_keywords=sorted(set(matched)), notes=notes)


def tags_match_ai_cover(tags: list[str]) -> bool:
    normalized_tags = [re.sub(r"\s+", "", tag).lower() for tag in tags if tag.strip()]
    has_ai = any(AI_TAG_RE.search(tag) for tag in normalized_tags)
    has_cover = any(any(term in tag for term in TAG_COVER_TERMS) for tag in normalized_tags)
    return has_ai and has_cover


def extract_original_song_name(title: str) -> str:
    clean = re.sub(r"\s+", " ", title).strip()
    for pattern in SONG_PATTERNS:
        match = pattern.search(clean)
        if match:
            candidate = strip_song_noise(match.group(1))
            if candidate:
                return candidate

    parts = re.split(r"[-|/｜·]", clean, maxsplit=2)
    for part in parts:
        candidate = strip_song_noise(part)
        if candidate and "香奈美" not in candidate and "翻唱" not in candidate.lower():
            return candidate
    return "未识别曲目"


def strip_song_noise(value: str) -> str:
    result = value.strip()
    for item in ["AI香奈美", "香奈美AI", "香奈美", "AI", "翻唱", "cover", "Cover", "完整版", "高音质"]:
        result = result.replace(item, "")
    return re.sub(r"\s+", " ", result).strip(" -_/｜·:：")


def build_dataset(
    *,
    items: list[CoverItem],
    keywords: list[str],
    pages: int,
    search_backend: str = "api",
    max_results_per_keyword: int | None = None,
) -> dict[str, Any]:
    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "source": "bilibili",
        "keywords": keywords,
        "pagesPerKeyword": pages,
        "searchBackend": search_backend,
        "maxResultsPerKeyword": max_results_per_keyword,
        "resourceGroup": RESOURCE_GROUP,
        "items": [item.to_json() for item in items],
        "resourceMap": build_resource_map(items),
    }


def build_resource_map(items: list[CoverItem]) -> dict[str, dict[str, Any]]:
    resource_map: dict[str, dict[str, Any]] = {}
    for item in items:
        audio_url = item.audio_resource_url or item.audio_file
        if not audio_url:
            continue
        resource_map[audio_url] = {
            "title": resource_title(item),
            "type": "audio",
            "section": "B站 AI 翻唱",
            "subsection": "香奈美 AI 唱歌",
            "mediaType": "audio",
            "extension": "mp3",
            "thumbnailUrl": item.cover_url,
            "sourcePage": item.video_url,
            "width": None,
            "height": None,
            "occurrences": 1,
            "videoUrl": item.video_url,
            "author": item.author,
            "originalSongName": item.original_song_name,
            "videoTitle": item.video_title,
            "publishedAt": item.published_at,
            "pubdate": item.pubdate,
            "bvid": item.bvid,
            "tags": item.tags,
            "searchSource": item.search_source,
        }
    return resource_map


def download_only(args: argparse.Namespace) -> int:
    payload = read_json_file(args.output, {})
    items = list(load_existing_items(args.output).values())
    if not items:
        print(f"No items found in {args.output}.")
        return 0

    def persist() -> None:
        write_crawl_output(
            output=args.output,
            items=items,
            keywords=payload.get("keywords") or list(DEFAULT_KEYWORDS),
            pages=int(payload.get("pagesPerKeyword") or max(1, args.pages)),
            search_backend=str(payload.get("searchBackend") or args.search_backend),
            max_results_per_keyword=payload.get("maxResultsPerKeyword") or resolve_max_results(args, max(1, min(int(args.page_size), 50))),
        )

    targets = [item for item in items if args.overwrite_audio or not audio_file_exists(item)]
    if args.background_download:
        print("background download moved to download_worker.py; running download-only synchronously here.")
    for item in targets:
        wait_with_jitter(args.download_delay, args.download_jitter, f"download {item.bvid}")
        try:
            download_item_audio(item, audio_dir=args.audio_dir, overwrite=args.overwrite_audio)
        except RuntimeError as exc:
            item.filter_notes.append(f"audio-download-failed:{exc}")
        persist()

    persist()
    print(f"Download-only processed {len(targets)} items from {args.output}.")
    return 0


def load_existing_items(path: Path) -> dict[str, CoverItem]:
    payload = read_json_file(path, {})
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return {}
    by_bvid: dict[str, CoverItem] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        item = cover_item_from_json(raw)
        if item.bvid:
            by_bvid[item.bvid] = item
    return by_bvid


def cover_item_from_json(data: dict[str, Any]) -> CoverItem:
    return CoverItem(
        bvid=str(data.get("bvid") or ""),
        video_url=str(data.get("videoUrl") or ""),
        author=str(data.get("author") or ""),
        original_song_name=str(data.get("originalSongName") or "未识别曲目"),
        video_title=str(data.get("videoTitle") or ""),
        published_at=str(data.get("publishedAt") or ""),
        pubdate=int_or_none(data.get("pubdate")),
        audio_file=data.get("audioFile"),
        audio_resource_url=data.get("audioResourceUrl"),
        tags=[str(tag) for tag in data.get("tags") or []],
        description=str(data.get("description") or ""),
        cover_url=data.get("coverUrl"),
        matched_keywords=[str(keyword) for keyword in data.get("matchedKeywords") or []],
        filter_notes=[str(note) for note in data.get("filterNotes") or []],
        search_source=str(data.get("searchSource") or "resume"),
    )


def write_crawl_output(
    *,
    output: Path,
    items: list[CoverItem],
    keywords: list[str],
    pages: int,
    search_backend: str,
    max_results_per_keyword: int | None,
) -> None:
    sorted_items = sorted(items, key=lambda item: item.pubdate or 0, reverse=True)
    payload = build_dataset(
        items=sorted_items,
        keywords=keywords,
        pages=pages,
        search_backend=search_backend,
        max_results_per_keyword=max_results_per_keyword,
    )
    write_json(output, payload)


def load_processed_keys(path: Path) -> set[str]:
    payload = read_json_file(path, {})
    keys = payload.get("processedKeys") if isinstance(payload, dict) else None
    return {str(key) for key in keys or []}


def write_checkpoint(path: Path, processed_keys: set[str]) -> None:
    write_json(path, {
        "version": 1,
        "updatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "processedKeys": sorted(processed_keys),
    })


def raw_candidate_record(
    keyword: str,
    hit: SearchHit,
    view: dict[str, Any],
    filter_result: FilterResult | None,
    *,
    accepted: bool,
    notes: list[str],
) -> dict[str, Any]:
    bvid = str(view.get("bvid") or hit.bvid or "")
    aid = int_or_none(view.get("aid")) or hit.aid
    title = str(view.get("title") or hit.title or "")
    owner = view.get("owner") or {}
    pubdate = int_or_none(view.get("pubdate")) or hit.pubdate
    return {
        "checkedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "keyword": keyword,
        "candidateKey": search_hit_key(hit),
        "accepted": accepted,
        "notes": notes,
        "matchedKeywords": filter_result.matched_keywords if filter_result else [],
        "searchSource": hit.source,
        "bvid": bvid,
        "aid": aid,
        "videoUrl": f"https://www.bilibili.com/video/{bvid}" if bvid else hit.arcurl,
        "author": str(owner.get("name") or hit.author or ""),
        "videoTitle": title,
        "publishedAt": iso_from_pubdate(pubdate),
        "tags": [],
        "description": str(view.get("desc") or hit.description or ""),
    }


def raw_error_record(keyword: str, hit: SearchHit, exc: Exception) -> dict[str, Any]:
    return {
        "checkedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "keyword": keyword,
        "candidateKey": search_hit_key(hit),
        "accepted": False,
        "notes": ["error"],
        "searchSource": hit.source,
        "bvid": hit.bvid,
        "aid": hit.aid,
        "videoUrl": hit.arcurl,
        "videoTitle": hit.title,
        "error": str(exc),
    }


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_json_file(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def audio_file_exists(item: CoverItem) -> bool:
    if not item.audio_file:
        return False
    path = Path(item.audio_file)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.exists()


def wait_with_jitter(delay: float, jitter: float, label: str) -> None:
    total = max(0.0, delay) + (random.uniform(0.0, max(0.0, jitter)) if jitter > 0 else 0.0)
    if total <= 0:
        return
    print(f"sleep {total:.1f}s before {label}")
    time.sleep(total)


def is_cooldown_exception(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {403, 412, 418, 429}
    text = str(exc).lower()
    return any(marker in text for marker in [" 403", " 412", " 418", " 429", "precondition failed", "too many requests", "rate limit"])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Crawl Bilibili Kanami AI cover songs.")
    sub = parser.add_subparsers(dest="command")

    login = sub.add_parser("login", help="Login to Bilibili by QR code and save local private cookies.")
    login.add_argument("--timeout", type=int, default=180, help="Seconds to wait for QR confirmation.")

    sub.add_parser("status", help="Check whether saved Bilibili cookies are still logged in.")

    crawl_parser = sub.add_parser("crawl", help="Search, filter, optionally download mp3 audio, and export JSON.")
    crawl_parser.add_argument("--keyword", action="append", dest="keywords", help="Search keyword. Can be passed more than once.")
    crawl_parser.add_argument("--pages", type=int, default=3, help="Pages to search for each keyword.")
    crawl_parser.add_argument("--page-size", type=int, default=30, help="Search results per page.")
    crawl_parser.add_argument("--max-results-per-keyword", type=int, default=0, help="Hard cap for each keyword. Overrides pages * page-size when set.")
    crawl_parser.add_argument("--deep-search", action="store_true", help="Search up to 1000 candidates per keyword unless --max-results-per-keyword is set.")
    crawl_parser.add_argument("--search-backend", choices=["auto", "both", "yt-dlp", "api"], default="auto", help="Search backend. auto uses Bilibili API for metadata search; both/yt-dlp opt into yt-dlp search.")
    crawl_parser.add_argument("--resume", action="store_true", help="Resume from existing output JSON and checkpoint.")
    crawl_parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT, help="Checkpoint JSON path for processed candidate keys.")
    crawl_parser.add_argument("--raw-candidates", type=Path, default=DEFAULT_RAW_CANDIDATES, help="JSONL audit log for every checked candidate.")
    crawl_parser.add_argument("--search-only", action="store_true", help="Only search and write metadata; do not download mp3 files.")
    crawl_parser.add_argument("--download-only", action="store_true", help="Load existing output JSON and only download missing mp3 files.")
    crawl_parser.add_argument("--background-download", action="store_true", help="Deprecated in crawler. Use download_worker.py to poll the output JSON and download accepted items.")
    crawl_parser.add_argument("--request-delay", type=float, default=5.0, help="Base seconds to wait before Bilibili search/detail/tag requests.")
    crawl_parser.add_argument("--request-jitter", type=float, default=4.0, help="Random extra seconds added to request delay.")
    crawl_parser.add_argument("--cooldown-seconds", type=float, default=900.0, help="Pause this long after 403/412/418/429 style risk responses.")
    crawl_parser.add_argument("--download-delay", type=float, default=20.0, help="Base seconds to wait before each mp3 download.")
    crawl_parser.add_argument("--download-jitter", type=float, default=20.0, help="Random extra seconds added before each mp3 download.")
    crawl_parser.add_argument("--max-candidates-per-run", type=int, default=0, help="Stop after checking this many candidates in one run. 0 means unlimited.")
    crawl_parser.add_argument("--max-accepted-per-run", type=int, default=0, help="Stop after accepting this many items in one run. 0 means unlimited.")
    crawl_parser.add_argument("--include-term", action="append", default=[], help="Extra include term for rough filtering.")
    crawl_parser.add_argument("--exclude-term", action="append", default=[], help="Extra exclude term for rough filtering.")
    crawl_parser.add_argument("--no-audio", action="store_true", help="Skip mp3 download and only write metadata.")
    crawl_parser.add_argument("--overwrite-audio", action="store_true", help="Redownload mp3 files even if they exist.")
    crawl_parser.add_argument("--allow-anonymous", action="store_true", help="Do not fail when cookies are missing or expired.")
    crawl_parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR, help="Directory for downloaded mp3 files.")
    crawl_parser.add_argument("--resource-url-prefix", default="/files/WIKI/audio/v-nami/", help="URL prefix used in resourceMap keys.")
    crawl_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON path.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "login":
        status = CredentialStore().login_by_qr(timeout_seconds=args.timeout)
        if status["isLogin"]:
            print(f"Logged in as {status.get('uname') or status.get('mid')}.")
            return 0
        print("Login cookies were saved, but Bilibili did not report an active login.")
        return 1
    if args.command == "status":
        status = CredentialStore().check_login()
        if status["isLogin"]:
            print(f"Logged in as {status.get('uname') or status.get('mid')}.")
            return 0
        print("Not logged in.")
        return 1
    if args.command == "crawl":
        return crawl(args)
    parser.print_help()
    return 2


def search_hit_from_payload(item: dict[str, Any]) -> SearchHit:
    return SearchHit(
        bvid=str(item.get("bvid")),
        aid=int_or_none(item.get("aid")),
        title=clean_html(item.get("title") or ""),
        author=clean_html(item.get("author") or ""),
        arcurl=str(item.get("arcurl") or f"https://www.bilibili.com/video/{item.get('bvid')}"),
        pubdate=int_or_none(item.get("pubdate")),
        description=clean_html(item.get("description") or ""),
        pic=item.get("pic"),
        tag_text=clean_html(item.get("tag") or ""),
        source="api",
    )


def search_hit_from_ytdlp(entry: dict[str, Any]) -> SearchHit:
    url = str(entry.get("webpage_url") or entry.get("url") or entry.get("original_url") or "")
    bvid = extract_bvid(url) or extract_bvid(str(entry.get("id") or ""))
    aid = extract_aid(url) or int_or_none(entry.get("id"))
    if bvid and not url.startswith("http"):
        url = f"https://www.bilibili.com/video/{bvid}"
    elif aid and not url.startswith("http"):
        url = f"https://www.bilibili.com/video/av{aid}"
    tags = entry.get("tags") if isinstance(entry.get("tags"), list) else []
    return SearchHit(
        bvid=bvid or "",
        aid=aid,
        title=clean_html(entry.get("title") or ""),
        author=clean_html(entry.get("uploader") or entry.get("channel") or ""),
        arcurl=url,
        pubdate=int_or_none(entry.get("timestamp")),
        description=clean_html(entry.get("description") or ""),
        pic=entry.get("thumbnail"),
        tag_text=",".join(str(tag) for tag in tags),
        source="yt-dlp",
    )


def extract_bvid(value: str) -> str | None:
    match = BVID_RE.search(value)
    return match.group(0) if match else None


def extract_aid(value: str) -> int | None:
    match = AV_RE.search(value)
    return int(match.group("aid")) if match else None


def search_hit_key(hit: SearchHit) -> str:
    if hit.bvid:
        return hit.bvid
    if hit.aid:
        return f"av{hit.aid}"
    return ""


def resolve_max_results(args: argparse.Namespace, page_size: int) -> int:
    if args.max_results_per_keyword and args.max_results_per_keyword > 0:
        return args.max_results_per_keyword
    if args.deep_search:
        return 1000
    return max(1, args.pages) * page_size


def resolve_search_backend(args: argparse.Namespace) -> str:
    if args.search_backend == "auto":
        return "api"
    return args.search_backend


def cookie_to_dict(cookie: Cookie) -> dict[str, Any]:
    return {
        "name": cookie.name,
        "value": cookie.value,
        "domain": cookie.domain,
        "path": cookie.path,
        "expires": cookie.expires,
        "secure": bool(cookie.secure),
        "httpOnly": bool(cookie.has_nonstandard_attr("HttpOnly")),
    }


def to_netscape(cookies: list[dict[str, Any]]) -> str:
    lines = [
        "# Netscape HTTP Cookie File",
        "# This file is generated by V-nami. Do not commit it.",
    ]
    for cookie in cookies:
        domain = str(cookie.get("domain") or ".bilibili.com")
        include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
        path = str(cookie.get("path") or "/")
        secure = "TRUE" if cookie.get("secure") else "FALSE"
        expires = str(cookie.get("expires") or 0)
        name = str(cookie.get("name") or "")
        value = str(cookie.get("value") or "")
        if not name:
            continue
        if cookie.get("httpOnly") and not domain.startswith("#HttpOnly_"):
            domain = f"#HttpOnly_{domain}"
        lines.append("\t".join([domain, include_subdomains, path, secure, expires, name, value]))
    return "\n".join(lines) + "\n"


def print_qr(value: str) -> None:
    try:
        import qrcode
    except ImportError:
        return
    qr = qrcode.QRCode(border=1)
    qr.add_data(value)
    qr.make(fit=True)
    qr.print_ascii(invert=True)


def clean_html(value: str) -> str:
    return html.unescape(HTML_TAG_RE.sub("", str(value))).strip()


def int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def iso_from_pubdate(pubdate: int | None) -> str:
    if not pubdate:
        return ""
    return datetime.fromtimestamp(pubdate, tz=timezone.utc).astimezone().isoformat(timespec="seconds")


def audio_file_name(bvid: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in bvid)
    return f"bilibili_{safe}.mp3"


def resource_title(item: CoverItem) -> str:
    if item.original_song_name and item.original_song_name != "未识别曲目":
        return f"{item.original_song_name} - 香奈美 AI 翻唱"
    return item.video_title


def relative_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_name(f"{path.name}.lock")
    with lock_path.open("a+", encoding="utf-8") as lock_handle:
        lock_file(lock_handle)
        temp_path = path.with_name(f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
        try:
            temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temp_path.replace(path)
        finally:
            if temp_path.exists():
                temp_path.unlink()
            unlock_file(lock_handle)


def lock_file(handle: Any) -> None:
    try:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
    except (ImportError, OSError):
        return


def unlock_file(handle: Any) -> None:
    try:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    except (ImportError, OSError):
        return


def chmod_private(path: Path, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        pass


if __name__ == "__main__":
    raise SystemExit(main())
