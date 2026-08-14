#!/usr/bin/env python3
"""Validate the reproducible Gate A inventory without third-party packages."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys
from typing import Any


SOURCE_ROW_RE = re.compile(r"^\|\s*(SRC-[A-Z0-9-]+)\s*\|", re.MULTILINE)
AUX_ROW_RE = re.compile(r"^\|\s*(AUX-[A-Z0-9-]+)\s*\|", re.MULTILINE)
SOURCE_TABLE_ROW_RE = re.compile(
    r"^\|\s*(SRC-[A-Z0-9-]+)\s*\|(?P<body>.*)$", re.MULTILINE
)
BVID_RE = re.compile(r"\bBV[0-9A-Za-z]{10}\b")
SENSITIVE_ID_RE = re.compile(
    r"""(?ix)
    (?:
        "(?:qq|qq_id|qq_number|group|group_id|qq_group)"
        | \b(?:qq|group)\b
        | QQ群
        | QQ号
        | 群号
    )
    \s*["']?\s*[:=：]?\s*["']?[0-9]{5,}
    """
)

WORKSPACE_SUFFIX = ("workspace", "skills", "celebrity", "kanami")

EXPECTED_SOURCE_IDS = frozenset(
    {
        *(f"SRC-O-C{index:02d}" for index in range(1, 10)),
        *(f"SRC-O-B{index:02d}" for index in range(1, 6)),
        "SRC-O-L01",
        *(f"SRC-O-S{index:02d}" for index in range(1, 8)),
        *(f"SRC-A-{index:02d}" for index in range(1, 7)),
        *(f"SRC-M-{index:02d}" for index in range(1, 12)),
        *(f"SRC-G-{index:02d}" for index in range(1, 8)),
        *(f"SRC-B-{index:02d}" for index in range(1, 8)),
    }
)
EXPECTED_AUX_IDS = frozenset({"AUX-VIS-001"})

EXPECTED_BILIBILI_ROWS = {
    "SRC-B-01": "BV1W2421L7wT",
    "SRC-B-02": "BV1HZ421g71j",
    "SRC-B-03": "BV12JDGYLEsT",
    "SRC-B-04": "BV1AnoPYNEiL",
    "SRC-B-05": "BV1d93p69EKU",
    "SRC-B-06": "BV1TwGA6XEhK",
    "SRC-B-07": "BV1m7um6BEgB",
}

EXPECTED_BILIBILI_EVIDENCE = {
    "BV1W2421L7wT": "core",
    "BV1HZ421g71j": "core",
    "BV12JDGYLEsT": "core-skin",
    "BV1LjSqYhE7a": "screened-low-priority",
    "BV1AnoPYNEiL": "core-language-variant",
    "BV13LtUzyE49": "screened-low-priority",
    "BV1tCFKz7EEH": "screened-visual-only",
    "BV1yqPmzTEzW": "screened-low-priority",
    "BV1NdQwB5EFi": "screened-low-priority",
    "BV1hCKw6VE2i": "screened-low-priority",
    "BV1d93p69EKU": "core-skin",
    "BV1TwGA6XEhK": "core-skin",
    "BV1m7um6BEgB": "conditional",
}


class Audit:
    def __init__(self) -> None:
        self.rows: list[dict[str, str]] = []

    def check(self, condition: bool, name: str, detail: str) -> None:
        self.rows.append(
            {
                "status": "PASS" if condition else "FAIL",
                "name": name,
                "detail": detail,
            }
        )

    @property
    def failures(self) -> list[dict[str, str]]:
        return [row for row in self.rows if row["status"] == "FAIL"]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def all_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*") if path.is_file()]


def count_extensions(paths: list[Path]) -> Counter[str]:
    return Counter(path.suffix.lower() for path in paths)


def has_workspace_suffix(workspace_root: Path) -> bool:
    parts = workspace_root.parts
    return len(parts) >= len(WORKSPACE_SUFFIX) and tuple(
        part.casefold() for part in parts[-len(WORKSPACE_SUFFIX) :]
    ) == tuple(part.casefold() for part in WORKSPACE_SUFFIX)


def resolve_repo_root(workspace_root: Path, explicit: Path | None) -> Path:
    if not has_workspace_suffix(workspace_root):
        raise ValueError(
            "workspace root must end with workspace/skills/celebrity/kanami"
        )
    if explicit is not None:
        return explicit.resolve()
    return workspace_root.parents[4]


def extract_story_titles(data: Any) -> list[str] | None:
    if not isinstance(data, dict):
        return None
    titles: list[str] = []
    for value in data.values():
        if not isinstance(value, dict):
            return None
        title = value.get("title")
        if not isinstance(title, str) or not title:
            return None
        titles.append(title)
    return titles


def extract_material_contexts(
    manifest: str,
) -> tuple[dict[str, tuple[str, str]], list[str]]:
    records: dict[str, tuple[str, str]] = {}
    errors: list[str] = []
    for match in SOURCE_TABLE_ROW_RE.finditer(manifest):
        source_id = match.group(1)
        cells = [cell.strip() for cell in match.group("body").split("|")]
        if cells and not cells[-1]:
            cells.pop()
        try:
            if source_id.startswith("SRC-O-S"):
                material_type, canon_context = "story", cells[1]
            else:
                pair_index = 3 if source_id.startswith("SRC-B-") else 2
                material_type, canon_context = (
                    value.strip() for value in cells[pair_index].split("/", 1)
                )
        except (IndexError, ValueError):
            errors.append(source_id)
            continue
        records[source_id] = (material_type, canon_context)
    return records, errors


def validate(args: argparse.Namespace) -> Audit:
    audit = Audit()
    root = args.workspace_root.resolve()
    root_structure_ok = has_workspace_suffix(root)
    audit.check(
        root_structure_ok,
        "workspace root structure",
        f"expected suffix={'/'.join(WORKSPACE_SUFFIX)}, actual={root}",
    )
    if not root_structure_ok:
        return audit

    repo = resolve_repo_root(root, args.repo_root)
    workspace = root.parents[2]
    project_root = root.parents[3]

    paths = {
        "intake": root / "intake.yaml",
        "manifest": root / "knowledge" / "source_manifest.md",
        "gate": root / "gates" / "gate-a-material-catalog.md",
        "bili_evidence": root
        / "knowledge"
        / "inventory"
        / "bilibili-evidence.json",
        "schema": workspace / "schemas" / "source-record.schema.json",
        "template": workspace / "templates" / "source-record.template.json",
        "adapter": workspace / "adapters" / "fictional-character.md",
    }
    for name, path in paths.items():
        audit.check(path.is_file(), f"required file: {name}", str(path))

    if any(not path.is_file() for path in paths.values()):
        return audit

    intake = paths["intake"].read_text(encoding="utf-8")
    manifest = paths["manifest"].read_text(encoding="utf-8")
    gate = paths["gate"].read_text(encoding="utf-8")
    evidence = load_json(paths["bili_evidence"])
    schema = load_json(paths["schema"])
    template = load_json(paths["template"])

    audit.check(
        "status: gate-a-awaiting-user-confirmation" in intake,
        "intake phase",
        "Gate A must wait for explicit user confirmation",
    )
    audit.check(
        "A_material_catalog: ready_for_user_confirmation" in intake,
        "intake Gate A state",
        "material catalog is ready but not approved",
    )
    audit.check(
        "pledge_mode_default: false" in intake
        and "pledge_intimate" in gate
        and "不得定义默认关系" in gate,
        "pledge isolation",
        "pledge evidence is included but cannot activate the default relationship",
    )

    visual_match = re.search(
        r"non_canon_visual_sources:\s*\n\s*-\s*(\S+)", intake
    )
    intake_base = (
        repo / root.relative_to(root.parents[4])
        if args.repo_root is not None
        else root
    )
    visual_path = (
        (intake_base / visual_match.group(1)).resolve()
        if visual_match is not None
        else None
    )
    audit.check(
        visual_path is not None and visual_path.is_dir(),
        "intake visual path",
        str(visual_path),
    )

    source_ids = SOURCE_ROW_RE.findall(manifest)
    aux_ids = AUX_ROW_RE.findall(manifest)
    wiki_ids = [source_id for source_id in source_ids if not source_id.startswith("SRC-B-")]
    bili_ids = [source_id for source_id in source_ids if source_id.startswith("SRC-B-")]
    duplicate_source_ids = sorted(
        source_id for source_id, count in Counter(source_ids).items() if count > 1
    )
    audit.check(
        set(source_ids) == EXPECTED_SOURCE_IDS and not duplicate_source_ids,
        "source IDs",
        (
            f"rows={len(source_ids)}, unique={len(set(source_ids))}, "
            f"missing={sorted(EXPECTED_SOURCE_IDS - set(source_ids))}, "
            f"unexpected={sorted(set(source_ids) - EXPECTED_SOURCE_IDS)}, "
            f"duplicates={duplicate_source_ids}"
        ),
    )
    audit.check(
        len(wiki_ids) == 46 and len(bili_ids) == 7,
        "source class counts",
        f"wiki={len(wiki_ids)}, bilibili={len(bili_ids)}",
    )
    source_material_contexts, material_context_parse_errors = (
        extract_material_contexts(manifest)
    )
    allowed_material_types = set(
        schema.get("properties", {}).get("material_type", {}).get("enum", [])
    )
    allowed_canon_contexts = set(
        schema.get("properties", {}).get("canon_context", {}).get("enum", [])
    )
    invalid_material_contexts = sorted(
        source_id
        for source_id, (material_type, canon_context) in source_material_contexts.items()
        if material_type not in allowed_material_types
        or canon_context not in allowed_canon_contexts
    )
    audit.check(
        len(source_material_contexts) == len(EXPECTED_SOURCE_IDS)
        and not material_context_parse_errors
        and not invalid_material_contexts,
        "source material/context enums",
        (
            f"rows={len(source_material_contexts)}, "
            f"parse_errors={material_context_parse_errors}, "
            f"invalid={invalid_material_contexts}"
        ),
    )
    audit.check(
        set(aux_ids) == EXPECTED_AUX_IDS and len(aux_ids) == len(EXPECTED_AUX_IDS),
        "auxiliary source IDs",
        (
            f"rows={len(aux_ids)}, missing={sorted(EXPECTED_AUX_IDS - set(aux_ids))}, "
            f"unexpected={sorted(set(aux_ids) - EXPECTED_AUX_IDS)}"
        ),
    )
    audit.check(
        "正史主候选合计：52 条材料单元" in gate,
        "Gate A core claim",
        "46 local units + 6 direct official videos",
    )

    raw_videos = evidence.get("verified_videos", [])
    videos = (
        raw_videos
        if isinstance(raw_videos, list)
        and all(isinstance(video, dict) for video in raw_videos)
        else []
    )
    video_ids = [video.get("bvid") for video in videos]
    status_counts = Counter(video.get("catalog_status") for video in videos)
    evidence_statuses = {
        video.get("bvid"): video.get("catalog_status") for video in videos
    }
    audit.check(
        len(videos) == len(set(video_ids)) == 13,
        "Bilibili evidence IDs",
        f"rows={len(videos)}, unique={len(set(video_ids))}",
    )
    audit.check(
        all(video.get("owner_mid") == 660091334 for video in videos)
        and evidence.get("account", {}).get("official_verify_type") == 1,
        "Bilibili official ownership",
        evidence.get("account", {}).get("official_verify_desc", ""),
    )
    audit.check(
        evidence_statuses == EXPECTED_BILIBILI_EVIDENCE
        and len(videos) == len(EXPECTED_BILIBILI_EVIDENCE),
        "Bilibili catalog classes",
        (
            f"statuses={dict(sorted(status_counts.items(), key=lambda item: str(item[0])))}, "
            "mismatched="
            f"{sorted(bvid for bvid, status in evidence_statuses.items() if EXPECTED_BILIBILI_EVIDENCE.get(bvid) != status)}"
        ),
    )

    row_bvids: dict[str, list[str]] = {}
    for match in SOURCE_TABLE_ROW_RE.finditer(manifest):
        row_bvids.setdefault(match.group(1), []).extend(
            BVID_RE.findall(match.group("body"))
        )
    bili_row_match = all(
        row_bvids.get(source_id) == [expected_bvid]
        for source_id, expected_bvid in EXPECTED_BILIBILI_ROWS.items()
    ) and all(
        not bvids
        for source_id, bvids in row_bvids.items()
        if not source_id.startswith("SRC-B-")
    )
    audit.check(
        bili_row_match,
        "Bilibili source row bindings",
        ", ".join(
            f"{source_id}={row_bvids.get(source_id, [])}"
            for source_id in sorted(EXPECTED_BILIBILI_ROWS)
        ),
    )
    manifest_bvids = set(BVID_RE.findall(manifest))
    audit.check(
        manifest_bvids == set(video_ids),
        "Bilibili manifest/evidence match",
        f"manifest={len(manifest_bvids)}, evidence={len(set(video_ids))}",
    )

    oath_path = repo / "res" / "WIKI" / "oath_texts.json"
    audio_path = repo / "res" / "WIKI" / "audio.json"
    story_path = repo / "res" / "WIKI" / "story_wallpapers.json"
    mirror_story_path = repo / "local-server" / "files" / "WIKI" / "story_wallpapers.json"
    mirror_oath_path = repo / "local-server" / "files" / "WIKI" / "oath_texts.json"
    for path in (
        oath_path,
        audio_path,
        story_path,
        mirror_story_path,
        mirror_oath_path,
    ):
        audit.check(path.is_file(), "local WIKI file", str(path))
    if any(
        not path.is_file()
        for path in (
            oath_path,
            audio_path,
            story_path,
            mirror_story_path,
            mirror_oath_path,
        )
    ):
        return audit

    oath = load_json(oath_path)
    communications = oath.get("kachiuCommunications", [])
    stories = oath.get("characterStories", [])
    biographies = oath.get("characterBiographies", [])
    letters = oath.get("returnLetters", [])
    communication_nodes = sum(
        len(item.get("messages", [])) for item in communications
    )
    story_scenes = sum(len(story.get("scenes", [])) for story in stories)
    story_lines = sum(
        len(scene.get("lines", []))
        for story in stories
        for scene in story.get("scenes", [])
    )
    audit.check(
        (
            len(communications),
            communication_nodes,
            len(stories),
            story_scenes,
            story_lines,
            len(biographies),
            len(letters),
        )
        == (9, 177, 7, 18, 512, 5, 1),
        "oath text inventory",
        (
            f"communications={len(communications)}/{communication_nodes}, "
            f"stories={len(stories)}/{story_scenes}/{story_lines}, "
            f"biographies={len(biographies)}, letters={len(letters)}"
        ),
    )
    audio = load_json(audio_path)
    audit.check(
        len(audio) == 952,
        "audio mapping count",
        f"count={len(audio)}",
    )
    story_wallpapers = load_json(story_path)
    mirror_story_wallpapers = load_json(mirror_story_path)
    story_titles = extract_story_titles(story_wallpapers)
    mirror_story_titles = extract_story_titles(mirror_story_wallpapers)
    story_title_set = set(story_titles or [])
    mirror_story_title_set = set(mirror_story_titles or [])
    missing_story_titles = sorted(story_title_set - mirror_story_title_set)
    extra_story_titles = mirror_story_title_set - story_title_set
    audit.check(
        story_titles is not None
        and mirror_story_titles is not None
        and len(story_wallpapers) == len(story_titles) == len(story_title_set) == 66
        and len(mirror_story_wallpapers)
        == len(mirror_story_titles)
        == len(mirror_story_title_set)
        == 95
        and not missing_story_titles
        and len(extra_story_titles) == 29,
        "story wallpaper title coverage",
        (
            f"res={len(story_wallpapers)}, mirror={len(mirror_story_wallpapers)}, "
            f"missing={missing_story_titles}, extra={len(extra_story_titles)}"
        ),
    )
    audit.check(
        load_json(mirror_oath_path) == {},
        "mirror oath placeholder",
        "local-server mirror must not be used for oath text",
    )

    mirror_root = repo / "local-server" / "files" / "WIKI"
    mirror_files = all_files(mirror_root)
    mirror_ext = count_extensions(mirror_files)
    audit.check(
        len(mirror_files) == 1331
        and sum(path.stat().st_size for path in mirror_files) == 553_084_261,
        "WIKI mirror totals",
        (
            f"files={len(mirror_files)}, "
            f"bytes={sum(path.stat().st_size for path in mirror_files)}"
        ),
    )
    audit.check(
        (
            mirror_ext[".mp3"],
            mirror_ext[".png"],
            mirror_ext[".jpg"],
            mirror_ext[".gif"],
        )
        == (952, 245, 98, 22),
        "WIKI mirror media types",
        (
            f"mp3={mirror_ext['.mp3']}, png={mirror_ext['.png']}, "
            f"jpg={mirror_ext['.jpg']}, gif={mirror_ext['.gif']}"
        ),
    )

    media_root = repo / "KanamiBot" / "data" / "advanced_media" / "香奈美"
    originals = all_files(media_root / "files")
    thumbs = all_files(media_root / "thumbs")
    original_ext = count_extensions(originals)
    audit.check(
        len(originals) == 739
        and sum(path.stat().st_size for path in originals) == 509_564_200,
        "KanamiBot original media totals",
        (
            f"files={len(originals)}, "
            f"bytes={sum(path.stat().st_size for path in originals)}"
        ),
    )
    audit.check(
        (
            original_ext[".jpg"],
            original_ext[".png"],
            original_ext[".gif"],
            len(thumbs),
        )
        == (447, 185, 107, 739),
        "KanamiBot media types",
        (
            f"jpg={original_ext['.jpg']}, png={original_ext['.png']}, "
            f"gif={original_ext['.gif']}, thumbs={len(thumbs)}"
        ),
    )

    raw_dir = root / "knowledge" / "research" / "raw"
    raw_markdown = list(raw_dir.glob("*.md")) if raw_dir.is_dir() else []
    audit.check(
        not raw_markdown,
        "Gate A boundary",
        "no six-track research files may exist before user confirmation",
    )

    audit.check(
        schema.get("title") == "香奈美蒸馏 source record"
        and schema.get("additionalProperties") is False
        and len(schema.get("required", [])) == 23,
        "source record schema",
        f"required={len(schema.get('required', []))}",
    )
    template_keys = set(template)
    schema_properties = set(schema.get("properties", {}))
    schema_required = set(schema.get("required", []))
    audit.check(
        schema_required <= template_keys <= schema_properties,
        "source record template/schema match",
        (
            f"template={len(template_keys)}, properties={len(schema_properties)}, "
            f"missing_required={sorted(schema_required - template_keys)}, "
            f"unknown={sorted(template_keys - schema_properties)}"
        ),
    )

    sensitive_hits: list[str] = []
    for path in all_files(project_root):
        if path.suffix.lower() not in {".md", ".yaml", ".yml", ".json", ".py"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if SENSITIVE_ID_RE.search(text):
            sensitive_hits.append(str(path))
    audit.check(
        not sensitive_hits,
        "sensitive identifier scan",
        "no numeric QQ/group identifiers copied"
        if not sensitive_hits
        else ", ".join(sensitive_hits),
    )

    return audit


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the Kanami Gate A inventory and safety boundaries"
    )
    parser.add_argument(
        "workspace_root",
        type=Path,
        help="Path ending in workspace/skills/celebrity/kanami",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        help="Override repository root when the workspace is copied elsewhere",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args()

    audit = validate(args)
    if args.json:
        print(
            json.dumps(
                {
                    "status": "PASS" if not audit.failures else "FAIL",
                    "checks": audit.rows,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        for row in audit.rows:
            print(f"[{row['status']}] {row['name']}: {row['detail']}")
        print(
            f"\nGate A validator: "
            f"{'PASS' if not audit.failures else 'FAIL'} "
            f"({len(audit.rows) - len(audit.failures)}/{len(audit.rows)} checks)"
        )

    return 0 if not audit.failures else 1


if __name__ == "__main__":
    sys.exit(main())
