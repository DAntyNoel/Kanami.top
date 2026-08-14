#!/usr/bin/env python3
"""Validate the Kanami Gate B research package without third-party packages."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys
from typing import Any

from validate_source_records import load_schema, validate_records_directory


CHARACTER_SUFFIX = ("workspace", "skills", "celebrity", "kanami")
RAW_FILES = (
    "01_writings.md",
    "02_conversations.md",
    "03_expression_dna.md",
    "04_decisions.md",
    "05_external_views.md",
    "06_timeline.md",
)
LABELS = (
    "CANON_DIRECT",
    "CANON_SYNTHESIS",
    "IN_CHARACTER_INFERENCE",
    "UNKNOWN",
)
SOURCE_ID_RE = re.compile(r"\bSRC-[A-Z0-9]+(?:-[A-Z0-9]+)*[0-9]\b")
MANIFEST_SOURCE_RE = re.compile(r"^\|\s*(SRC-[A-Z0-9-]+)\s*\|", re.MULTILINE)
SUCCESSFUL_WEB_STATUSES = {
    "live-content-verified",
    "page-identity-verified",
    "conditional-page-identity-verified",
}
CORE_ACCEPTED_IDS = {
    "SRC-M-01",
    "SRC-O-L01",
    *(f"SRC-O-B{index:02d}" for index in range(1, 6)),
    *(f"SRC-O-C{index:02d}" for index in range(1, 10)),
    *(f"SRC-O-S{index:02d}" for index in range(1, 6)),
}
MEDIA_EVIDENCE_IDS = {
    "SRC-A-01",
    "SRC-A-03",
    *(f"SRC-B-{index:02d}" for index in range(1, 7)),
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


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def has_suffix(path: Path, suffix: tuple[str, ...]) -> bool:
    return tuple(part.casefold() for part in path.parts[-len(suffix) :]) == tuple(
        part.casefold() for part in suffix
    )


def validate(args: argparse.Namespace) -> Audit:
    audit = Audit()
    root = args.character_root.resolve()
    structure_ok = has_suffix(root, CHARACTER_SUFFIX)
    audit.check(
        structure_ok,
        "character root structure",
        f"expected suffix={'/'.join(CHARACTER_SUFFIX)}, actual={root}",
    )
    if not structure_ok:
        return audit

    workspace = root.parents[2]
    checkout_root = root.parents[4]
    repo = args.repo_root.resolve() if args.repo_root else checkout_root
    knowledge = root / "knowledge"
    raw_dir = knowledge / "research" / "raw"
    records_dir = knowledge / "source-records"
    manifest_path = knowledge / "source_manifest.md"
    web_path = knowledge / "inventory" / "web-verification.json"
    audio_path = knowledge / "inventory" / "audio-analysis.json"
    merged_summary_path = knowledge / "research" / "merged" / "summary.md"
    research_audit_path = knowledge / "research" / "reviews" / "research_audit.md"
    gate_summary_path = root / "gates" / "gate-b-research-summary.md"
    intake_path = root / "intake.yaml"
    schema_path = workspace / "schemas" / "source-record.schema.json"

    required_paths = {
        "manifest": manifest_path,
        "web verification": web_path,
        "audio analysis": audio_path,
        "merged summary": merged_summary_path,
        "research audit": research_audit_path,
        "Gate B summary": gate_summary_path,
        "intake": intake_path,
        "source schema": schema_path,
        **{f"raw {name}": raw_dir / name for name in RAW_FILES},
    }
    for name, path in required_paths.items():
        audit.check(path.is_file(), f"required file: {name}", str(path))
    if any(not path.is_file() for path in required_paths.values()):
        return audit

    manifest = manifest_path.read_text(encoding="utf-8")
    merged_summary = merged_summary_path.read_text(encoding="utf-8")
    research_audit = research_audit_path.read_text(encoding="utf-8")
    gate_summary = gate_summary_path.read_text(encoding="utf-8")
    intake = intake_path.read_text(encoding="utf-8")
    manifest_ids = MANIFEST_SOURCE_RE.findall(manifest)
    manifest_id_set = set(manifest_ids)
    audit.check(
        len(manifest_ids) == len(manifest_id_set) == 53,
        "manifest source IDs",
        f"rows={len(manifest_ids)}, unique={len(manifest_id_set)}",
    )
    audit.check(
        "GATE_B_RESEARCH_COMPLETE" in manifest
        and "21 条 `accepted`" in manifest
        and "32 条 `candidate`" in manifest,
        "manifest Gate B state",
        "manifest records Gate B completion and 21/32 status split",
    )
    audit.check(
        "status: gate-b-awaiting-user-confirmation" in intake
        and "B_research_summary: ready_for_user_confirmation" in intake
        and "C_mental_models: pending" in intake,
        "intake Gate B state",
        "awaiting user confirmation; Gate C remains pending",
    )
    audit.check(
        "READY_FOR_USER_CONFIRMATION" in merged_summary
        and "53 条 source record" in merged_summary
        and "21 条 `accepted`" in merged_summary
        and "32 条 `candidate`" in merged_summary
        and "人工回听为 **0**" in merged_summary
        and "PLEDGE_ONLY" in merged_summary,
        "merged summary disclosures",
        "counts, zero-listen boundary, and pledge isolation are explicit",
    )
    audit.check(
        "PASS_WITH_DISCLOSED_GAPS" in research_audit
        and "无 P1／P2" in research_audit
        and "人工回听 0" in research_audit,
        "research audit verdict",
        "independent verdict and disclosed media gaps are recorded",
    )
    audit.check(
        "READY_FOR_USER_CONFIRMATION" in gate_summary
        and "3–5 个候选心智模型" in gate_summary
        and "3–7 个候选心智模型" not in gate_summary
        and "Gate B 通过" in gate_summary,
        "Gate B user handoff",
        "user confirmation phrase and planned 3-5 Gate C models are present",
    )

    schema = load_schema(schema_path)
    record_paths, record_errors = validate_records_directory(records_dir, schema)
    audit.check(
        len(record_paths) == 53 and not record_errors,
        "source-record validation",
        f"files={len(record_paths)}, errors={len(record_errors)}",
    )

    records: list[dict[str, Any]] = []
    if not record_errors:
        records = [read_json(path) for path in record_paths]
    record_ids = {record.get("source_id") for record in records}
    audit.check(
        record_ids == manifest_id_set,
        "manifest/source-record alignment",
        (
            f"missing={sorted(manifest_id_set - record_ids)}, "
            f"unexpected={sorted(record_ids - manifest_id_set)}"
        ),
    )

    status_counts = Counter(record.get("status") for record in records)
    reviewed_count = status_counts.get("inspected", 0) + status_counts.get(
        "accepted", 0
    )
    audit.check(
        reviewed_count >= 12 and status_counts.get("accepted", 0) >= 12,
        "reviewed material threshold",
        f"reviewed={reviewed_count}, statuses={dict(sorted(status_counts.items()))}",
    )

    records_by_id = {str(record.get("source_id")): record for record in records}
    core_record_errors: list[str] = []
    for source_id in sorted(CORE_ACCEPTED_IDS):
        record = records_by_id.get(source_id, {})
        if record.get("status") != "accepted":
            core_record_errors.append(f"{source_id}:status={record.get('status')}")
        for field in ("evidence_summary", "inference", "conflicts"):
            if not record.get(field):
                core_record_errors.append(f"{source_id}:{field}=empty")
        if record.get("material_type") in {"story", "dialogue", "letter"} and not record.get(
            "counterparties"
        ):
            core_record_errors.append(f"{source_id}:counterparties=empty")
    audit.check(
        not core_record_errors,
        "Gate B core source-record evidence",
        f"accepted={len(CORE_ACCEPTED_IDS)}, errors={core_record_errors}",
    )

    media_record_errors: list[str] = []
    for source_id in sorted(MEDIA_EVIDENCE_IDS):
        record = records_by_id.get(source_id, {})
        if record.get("status") != "candidate":
            media_record_errors.append(f"{source_id}:status={record.get('status')}")
        if not record.get("evidence_summary") or not record.get("conflicts"):
            media_record_errors.append(f"{source_id}:missing evidence/conflicts")
        if record.get("timestamp"):
            media_record_errors.append(f"{source_id}:unexpected timestamp")
    audit.check(
        not media_record_errors,
        "unreviewed media evidence boundary",
        f"candidates={len(MEDIA_EVIDENCE_IDS)}, errors={media_record_errors}",
    )

    pledge_ids = {
        "SRC-O-L01",
        *(f"SRC-O-C{index:02d}" for index in range(1, 10)),
        *(f"SRC-O-S{index:02d}" for index in range(1, 7)),
    }
    pledge_errors = [
        source_id
        for source_id in sorted(pledge_ids)
        if records_by_id.get(source_id, {}).get("canon_context") != "pledge"
        or records_by_id.get(source_id, {}).get("context_router", {}).get("primary")
        != "pledge_intimate"
    ]
    birthday_event = records_by_id.get("SRC-O-S07", {})
    audit.check(
        not pledge_errors
        and birthday_event.get("canon_context") == "event"
        and birthday_event.get("context_router", {}).get("primary")
        == "private_familiar",
        "pledge source-record routing",
        f"pledge_errors={pledge_errors}, S07={birthday_event.get('canon_context')}",
    )

    conditional_video = records_by_id.get("SRC-B-07", {})
    audit.check(
        conditional_video.get("status") == "candidate"
        and conditional_video.get("canon_evidence") is False
        and conditional_video.get("characters_present") == ["未确认"],
        "conditional video evidence boundary",
        (
            f"status={conditional_video.get('status')}, "
            f"canon_evidence={conditional_video.get('canon_evidence')}, "
            f"characters={conditional_video.get('characters_present')}"
        ),
    )

    material_types = {record.get("material_type") for record in records}
    required_material_types = {"setting", "story", "dialogue", "voice", "pv"}
    official_video_records = [
        record
        for record in records
        if record.get("publisher") == "卡拉彼丘官方账号"
        and record.get("material_type") in {"pv", "song"}
    ]
    audit.check(
        required_material_types <= material_types and len(official_video_records) >= 6,
        "required material categories",
        (
            f"types={sorted(str(item) for item in material_types)}, "
            f"official_videos={len(official_video_records)}"
        ),
    )

    missing_local_paths: list[str] = []
    unsafe_local_paths: list[str] = []
    for record in records:
        for relative in record.get("local_paths", []):
            relative_path = Path(relative)
            if relative_path.is_absolute() or ".." in relative_path.parts:
                unsafe_local_paths.append(f"{record.get('source_id')}:{relative}")
            elif not (repo / relative_path).is_file():
                missing_local_paths.append(f"{record.get('source_id')}:{relative}")
    audit.check(
        not missing_local_paths and not unsafe_local_paths,
        "source-record local paths",
        f"missing={missing_local_paths}, unsafe={unsafe_local_paths}",
    )

    web = read_json(web_path)
    observations = web.get("observations", [])
    successful = [
        item for item in observations if item.get("status") in SUCCESSFUL_WEB_STATUSES
    ]
    blocked = [item for item in observations if item.get("status") == "blocked-by-site"]
    successful_ids = {item.get("source_id") for item in successful}
    expected_web_ids = {
        "SRC-M-01",
        "SRC-A-01",
        *(f"SRC-B-{index:02d}" for index in range(1, 8)),
    }
    research_relevant_ids = {
        item.get("source_id")
        for item in successful
        if item.get("status") != "conditional-page-identity-verified"
    }
    expected_research_relevant_ids = {
        "SRC-M-01",
        "SRC-A-01",
        *(f"SRC-B-{index:02d}" for index in range(1, 7)),
    }
    audit.check(
        len(successful) >= 9
        and successful_ids == expected_web_ids
        and web.get("successful_page_checks") == len(successful),
        "opened URL inventory",
        f"successful={len(successful)}, ids={sorted(str(item) for item in successful_ids)}",
    )
    audit.check(
        research_relevant_ids == expected_research_relevant_ids,
        "research-relevant URL threshold",
        (
            f"relevant={len(research_relevant_ids)}, "
            f"ids={sorted(str(item) for item in research_relevant_ids)}"
        ),
    )
    voice_page = next(
        (item for item in observations if item.get("source_id") == "SRC-A-01"),
        {},
    )
    audit.check(
        voice_page.get("content_reviewed") is True
        and voice_page.get("audio_playback_reviewed") is False,
        "voice page verification boundary",
        "visible page content checked; audio playback remains unreviewed",
    )
    audit.check(
        len(blocked) == web.get("blocked_page_checks") == 1,
        "blocked URL disclosure",
        f"blocked={len(blocked)}",
    )

    audio = read_json(audio_path)
    audio_inventory = audio.get("inventory", {})
    language_counts = audio.get("filename_language", {}).get("counts", {})
    audit.check(
        audio_inventory
        == {"total": 952, "voice_metadata": 942, "related_music": 10}
        and sum(language_counts.values()) == 952,
        "audio inventory analysis",
        f"inventory={audio_inventory}, languages={language_counts}",
    )
    audit.check(
        audio.get("metadata_language_conflicts", {}).get("count", 0) > 0,
        "audio language conflict disclosure",
        f"conflicts={audio.get('metadata_language_conflicts', {}).get('count')}",
    )

    raw_source_ids: set[str] = set()
    raw_details: list[str] = []
    raw_integrity_ok = True
    for name in RAW_FILES:
        path = raw_dir / name
        text = path.read_text(encoding="utf-8")
        refs = set(SOURCE_ID_RE.findall(text))
        unknown_refs = refs - manifest_id_set
        raw_source_ids.update(refs)
        missing_labels = [label for label in LABELS if label not in text]
        max_line = max((len(line) for line in text.splitlines()), default=0)
        bad_quote_lines = [
            line for line in text.splitlines() if line.lstrip().startswith(">") and len(line) > 250
        ]
        if unknown_refs or missing_labels or len(refs) < 8 or bad_quote_lines:
            raw_integrity_ok = False
        raw_details.append(
            f"{name}:refs={len(refs)},unknown={sorted(unknown_refs)},"
            f"missing_labels={missing_labels},max_line={max_line},"
            f"long_quotes={len(bad_quote_lines)}"
        )
    audit.check(
        raw_integrity_ok and len(raw_source_ids) >= 12,
        "six-track evidence integrity",
        "; ".join(raw_details),
    )

    combined_raw = "\n".join(
        (raw_dir / name).read_text(encoding="utf-8") for name in RAW_FILES
    )
    audit.check(
        "PLEDGE_ONLY" in combined_raw
        and "pledge_intimate" in combined_raw
        and "skin" in combined_raw,
        "context isolation markers",
        "pledge and skin boundaries are explicit",
    )
    audit.check(
        "REPLACE_" not in combined_raw and "REPLACE-" not in combined_raw,
        "research placeholders",
        "no template placeholders remain",
    )

    premature_outputs = [
        root / name
        for name in (
            "SKILL.md",
            "persona.md",
            "work.md",
            "persona_skill.md",
            "work_skill.md",
        )
        if (root / name).exists()
    ]
    audit.check(
        not premature_outputs,
        "Gate B boundary",
        "no Persona or final Skill files before Gate B approval"
        if not premature_outputs
        else ", ".join(str(path) for path in premature_outputs),
    )

    return audit


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the Kanami Gate B source-record and six-track package"
    )
    parser.add_argument(
        "character_root",
        type=Path,
        help="Path ending in workspace/skills/celebrity/kanami",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        help="Override checkout root for repository-relative local_paths",
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
            f"\nGate B validator: {'PASS' if not audit.failures else 'FAIL'} "
            f"({len(audit.rows) - len(audit.failures)}/{len(audit.rows)} checks)"
        )
    return 0 if not audit.failures else 1


if __name__ == "__main__":
    sys.exit(main())
