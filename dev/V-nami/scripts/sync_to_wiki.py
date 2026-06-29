#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parents[1]
DEFAULT_WIKI_ROOT = REPO_ROOT / "local-server" / "files" / "WIKI"
GROUPS_FILE = "resource_groups.json"
CUSTOM_FILE = "custom_kanami_ai_covers.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync V-nami output into a Kanami.top WIKI resource folder.")
    parser.add_argument("--input", required=True, type=Path, help="V-nami crawler JSON output.")
    parser.add_argument("--wiki-root", type=Path, default=DEFAULT_WIKI_ROOT, help="Target WIKI root.")
    parser.add_argument("--dry-run", action="store_true", help="Show planned writes without changing files.")
    args = parser.parse_args()

    payload = read_json(args.input)
    resource_map = payload.get("resourceMap")
    resource_group = payload.get("resourceGroup")
    if not isinstance(resource_map, dict) or not isinstance(resource_group, dict):
        raise SystemExit("Input JSON is missing resourceMap or resourceGroup.")

    audio_copies = plan_audio_copies(payload.get("items") or [], args.wiki_root)
    print(f"Target WIKI root: {args.wiki_root}")
    print(f"Resource entries: {len(resource_map)}")
    print(f"Audio copies: {len(audio_copies)}")
    if args.dry_run:
        for source, target in audio_copies[:10]:
            print(f"copy {source} -> {target}")
        return 0

    args.wiki_root.mkdir(parents=True, exist_ok=True)
    write_json(args.wiki_root / CUSTOM_FILE, resource_map)
    merge_group(args.wiki_root / GROUPS_FILE, resource_group)
    for source, target in audio_copies:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return 0


def plan_audio_copies(items: list[dict[str, Any]], wiki_root: Path) -> list[tuple[Path, Path]]:
    copies: list[tuple[Path, Path]] = []
    target_dir = wiki_root / "audio" / "v-nami"
    for item in items:
        audio_file = item.get("audioFile")
        audio_url = item.get("audioResourceUrl") or ""
        if not audio_file or not str(audio_url).endswith(".mp3"):
            continue
        source = Path(audio_file)
        if not source.is_absolute():
            source = PROJECT_ROOT / source
        if not source.exists():
            continue
        copies.append((source, target_dir / Path(audio_url).name))
    return copies


def merge_group(path: Path, group: dict[str, Any]) -> None:
    payload = read_json(path) if path.exists() else {"version": 1, "groups": []}
    groups = payload if isinstance(payload, list) else payload.get("groups", [])
    if not isinstance(groups, list):
        groups = []
    next_groups = [existing for existing in groups if existing.get("id") != group.get("id")]
    next_groups.append(group)
    write_json(path, {"version": 1, "groups": next_groups})


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    raise SystemExit(main())
