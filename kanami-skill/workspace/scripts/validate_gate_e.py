#!/usr/bin/env python3
"""Validate Kanami Gate E fixtures, scores, transcripts, and final package."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import ntpath
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
from typing import Any

from skill_package import (
    PackageError,
    _canonical_manifest_bytes,
    _validate_manifest_structure,
    verify_package,
)


CHARACTER_SUFFIX = ("workspace", "skills", "celebrity", "kanami")
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
RUN_ID_RE = re.compile(r"[a-z0-9-]+\Z")
TRANSCRIPT_PATH_RE = re.compile(r"run-[a-z0-9-]+/[a-z0-9-]+\.md\Z")
SCORE_CAPS = {
    "canon_accuracy": 25,
    "expression_dna": 20,
    "route_switching": 15,
    "mental_model_consistency": 15,
    "relationship_boundaries": 10,
    "unknown_honesty": 10,
    "copyright_safety": 5,
}
ROUTES = {
    "public_idol",
    "private_familiar",
    "mission_volunteer",
    "battle_stage",
    "vulnerable_reflective",
    "pledge_intimate",
}
CANON_LABELS = {"CANON_DIRECT", "CANON_SYNTHESIS"}
ALLOWED_LABELS = CANON_LABELS | {"IN_CHARACTER_INFERENCE", "UNKNOWN"}
FORBIDDEN_BLIND_KEYS = {"expected_answer", "reference_answer", "gold_answer"}
EXPECTED_TRANSCRIPTS = {
    "known_answers": "known-answers.md",
    "blind_voice": "blind-voice.md",
    "routes_boundaries": "routes-boundaries.md",
}
# Gate E deliberately freezes only the seven behavior-bearing package files.
# Metadata and agent UI configuration are package state, not scored behavior.
EXPECTED_BEHAVIOR_FILES = frozenset(
    {
        "SKILL.md",
        "references/canon-evidence.md",
        "references/evolution.md",
        "references/persona-only.md",
        "references/persona.md",
        "references/task-only.md",
        "references/work.md",
    }
)
SOURCE_SNAPSHOT_FILES = {
    "source_manifest": Path("knowledge/source_manifest.md"),
    "synthesis": Path("knowledge/research/reviews/synthesis.md"),
    "persona": Path("persona.md"),
    "work": Path("work.md"),
    "gate_d_preview": Path("gates/gate-d-persona-preview.md"),
}
WINDOWS_RESERVED_NAMES = frozenset(
    {"con", "prn", "aux", "nul", "clock$"}
    | {f"com{index}" for index in range(1, 10)}
    | {f"lpt{index}" for index in range(1, 10)}
)


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


def has_suffix(path: Path, suffix: tuple[str, ...]) -> bool:
    return tuple(part.casefold() for part in path.parts[-len(suffix) :]) == tuple(
        part.casefold() for part in suffix
    )


def load_json(path: Path) -> Any:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, child in pairs:
            if key in value:
                raise ValueError(f"duplicate JSON key {key!r} in {path}")
            value[key] = child
        return value

    def reject_constant(value: str) -> None:
        raise ValueError(f"non-JSON numeric constant {value!r} in {path}")

    return json.loads(
        path.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicates,
        parse_constant=reject_constant,
    )


def _json_type_matches(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    raise ValueError(f"unsupported JSON Schema type: {expected!r}")


def _resolve_schema_pointer(root_schema: dict[str, Any], reference: str) -> Any:
    if not reference.startswith("#/"):
        raise ValueError(f"only local JSON Schema references are supported: {reference!r}")
    value: Any = root_schema
    for encoded in reference[2:].split("/"):
        token = encoded.replace("~1", "/").replace("~0", "~")
        if not isinstance(value, dict) or token not in value:
            raise ValueError(f"unresolved JSON Schema reference: {reference!r}")
        value = value[token]
    return value


def validate_json_schema(
    value: Any,
    schema: dict[str, Any],
    *,
    root_schema: dict[str, Any] | None = None,
    location: str = "$",
) -> list[str]:
    """Validate the JSON Schema subset used by Gate E without a dependency."""

    document = root_schema or schema
    if "$ref" in schema:
        referenced = _resolve_schema_pointer(document, schema["$ref"])
        if not isinstance(referenced, dict):
            raise ValueError(f"JSON Schema reference is not an object: {schema['$ref']!r}")
        return validate_json_schema(
            value,
            referenced,
            root_schema=document,
            location=location,
        )

    errors: list[str] = []
    expected_type = schema.get("type")
    if expected_type is not None:
        if not isinstance(expected_type, str):
            raise ValueError(f"unsupported JSON Schema type declaration at {location}")
        if not _json_type_matches(value, expected_type):
            return [f"{location}: expected {expected_type}, got {type(value).__name__}"]

    if "const" in schema and value != schema["const"]:
        errors.append(f"{location}: expected constant {schema['const']!r}, got {value!r}")

    if isinstance(value, dict):
        required = schema.get("required", [])
        missing = sorted(key for key in required if key not in value)
        if missing:
            errors.append(f"{location}: missing required keys {missing}")

        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        extra = sorted(set(value) - set(properties))
        if additional is False and extra:
            errors.append(f"{location}: unexpected keys {extra}")

        minimum_properties = schema.get("minProperties")
        if minimum_properties is not None and len(value) < minimum_properties:
            errors.append(
                f"{location}: expected at least {minimum_properties} properties, got {len(value)}"
            )

        for key, child in value.items():
            child_schema = properties.get(key)
            if child_schema is None and isinstance(additional, dict):
                child_schema = additional
            if child_schema is not None:
                errors.extend(
                    validate_json_schema(
                        child,
                        child_schema,
                        root_schema=document,
                        location=f"{location}.{key}",
                    )
                )

    if isinstance(value, list):
        maximum_items = schema.get("maxItems")
        if maximum_items is not None and len(value) > maximum_items:
            errors.append(
                f"{location}: expected at most {maximum_items} items, got {len(value)}"
            )
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, child in enumerate(value):
                errors.extend(
                    validate_json_schema(
                        child,
                        item_schema,
                        root_schema=document,
                        location=f"{location}[{index}]",
                    )
                )

    if isinstance(value, str) and "pattern" in schema:
        if re.search(schema["pattern"], value) is None:
            errors.append(
                f"{location}: value {value!r} does not match {schema['pattern']!r}"
            )

    if _json_type_matches(value, "number"):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{location}: value {value!r} is below {schema['minimum']!r}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{location}: value {value!r} is above {schema['maximum']!r}")
    return errors


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def validate_source_snapshot_hashes(meta: object, root: Path) -> list[str]:
    """Verify metadata provenance against the research workspace bytes."""

    if not isinstance(meta, dict):
        return ["formal metadata root is not an object"]
    snapshot = meta.get("source_snapshot")
    if not isinstance(snapshot, dict):
        return ["source_snapshot is not an object"]
    declared = snapshot.get("sha256")
    if not isinstance(declared, dict):
        return ["source_snapshot.sha256 is not an object"]

    errors: list[str] = []
    expected_keys = set(SOURCE_SNAPSHOT_FILES)
    if set(declared) != expected_keys:
        errors.append(
            "source snapshot keys mismatch: "
            f"expected={sorted(expected_keys)}, actual={sorted(declared)}"
        )
    for name, relative in SOURCE_SNAPSHOT_FILES.items():
        path = root / relative
        expected = declared.get(name)
        if not isinstance(expected, str) or SHA256_RE.fullmatch(expected) is None:
            errors.append(f"{name}: invalid declared SHA-256 {expected!r}")
            continue
        if not path.is_file():
            errors.append(f"{name}: missing source file {path}")
            continue
        try:
            actual = sha256_file(path)
        except OSError as exc:
            errors.append(f"{name}: cannot hash {path}: {exc}")
            continue
        if actual != expected:
            errors.append(
                f"{name}: declared={expected}, actual={actual}, path={path}"
            )
    return errors


def collect_keys(value: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        keys.update(str(key) for key in value)
        for child in value.values():
            keys.update(collect_keys(child))
    elif isinstance(value, list):
        for child in value:
            keys.update(collect_keys(child))
    return keys


def _is_within(path: Path, root: Path) -> bool:
    try:
        common = os.path.commonpath((os.fspath(path), os.fspath(root)))
    except ValueError:
        return False
    return os.path.normcase(common) == os.path.normcase(os.fspath(root))


def validate_relative_transcript(root: Path, relative: str) -> Path:
    """Resolve one portable relative path and prove it remains under ``root``."""

    if not isinstance(relative, str) or not relative:
        raise ValueError(f"unsafe relative path: {relative!r}")
    if "\x00" in relative or "\\" in relative:
        raise ValueError(f"non-portable relative path: {relative!r}")

    path = PurePosixPath(relative)
    windows_path = PureWindowsPath(relative)
    raw_parts = relative.split("/")
    if (
        path.is_absolute()
        or windows_path.is_absolute()
        or bool(windows_path.drive)
        or ntpath.isabs(relative)
    ):
        raise ValueError(f"absolute or drive-qualified relative path: {relative!r}")
    if any(part in {"", ".", ".."} for part in raw_parts):
        raise ValueError(f"non-normalized or traversing relative path: {relative!r}")
    if path.as_posix() != relative:
        raise ValueError(f"non-normalized relative path: {relative!r}")
    for part in raw_parts:
        stem = part.split(".", 1)[0].casefold()
        if (
            ":" in part
            or part.endswith((" ", "."))
            or stem in WINDOWS_RESERVED_NAMES
        ):
            raise ValueError(f"Windows-reserved relative path: {relative!r}")

    resolved_root = root.resolve()
    resolved = root.joinpath(*path.parts).resolve()
    if resolved == resolved_root or not _is_within(resolved, resolved_root):
        raise ValueError(f"relative path escapes its root: {relative!r}")
    return resolved


def validate(
    character_root: Path,
    dist_root: Path | None = None,
    transcript_root: Path | None = None,
) -> Audit:
    audit = Audit()
    root = character_root.resolve()
    structure_ok = has_suffix(root, CHARACTER_SUFFIX)
    audit.check(
        structure_ok,
        "character root structure",
        f"expected suffix={'/'.join(CHARACTER_SUFFIX)}, actual={root}",
    )
    if not structure_ok:
        return audit

    workspace = root.parents[2]
    project_root = root.parents[3]
    eval_root = workspace / "evals" / "gate-e"
    formal_root = (dist_root or project_root / "dist" / "celebrity-kanami").resolve()
    paths = {
        "known answers": eval_root / "known-answer.json",
        "blind prompts": eval_root / "blind-prompts.json",
        "route prompts": eval_root / "route-prompts.json",
        "boundary prompts": eval_root / "canon-boundary-prompts.json",
        "evaluation results": eval_root / "results.json",
        "evaluated manifest": eval_root / "evaluated-manifest.json",
        "evaluated metadata": eval_root / "evaluated-meta.json",
        "evaluation schema": workspace / "schemas" / "gate-e-evaluation.schema.json",
        "validation report": root
        / "knowledge"
        / "research"
        / "reviews"
        / "validation.md",
        "intake": root / "intake.yaml",
        "workspace metadata": root / "meta.json",
        "formal SKILL": formal_root / "SKILL.md",
        "formal metadata": formal_root / "meta.json",
        "formal manifest": formal_root / "manifest.json",
    }
    for name, path in paths.items():
        audit.check(path.is_file(), f"required file: {name}", str(path))
    if any(not path.is_file() for path in paths.values()):
        return audit

    try:
        known = load_json(paths["known answers"])
        blind = load_json(paths["blind prompts"])
        routes = load_json(paths["route prompts"])
        boundaries = load_json(paths["boundary prompts"])
        results = load_json(paths["evaluation results"])
        evaluated_manifest_record = load_json(paths["evaluated manifest"])
        evaluated_meta = load_json(paths["evaluated metadata"])
        evaluation_schema = load_json(paths["evaluation schema"])
        workspace_meta = load_json(paths["workspace metadata"])
        meta = load_json(paths["formal metadata"])
        intake = paths["intake"].read_text(encoding="utf-8")
        validation_report = paths["validation report"].read_text(encoding="utf-8")
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        audit.check(False, "input decoding", str(exc))
        return audit

    source_snapshot_errors = validate_source_snapshot_hashes(meta, root)
    audit.check(
        not source_snapshot_errors,
        "source snapshot provenance",
        f"errors={source_snapshot_errors}",
    )

    try:
        if not isinstance(evaluation_schema, dict):
            raise ValueError("Gate E schema root must be an object")
        schema_errors = validate_json_schema(results, evaluation_schema)
    except (AttributeError, TypeError, ValueError, re.error) as exc:
        schema_errors = [f"invalid Gate E schema: {exc}"]
    audit.check(
        not schema_errors,
        "evaluation results schema",
        f"errors={schema_errors}",
    )
    if schema_errors:
        return audit

    known_questions = known.get("questions", [])
    known_ids = [question.get("id") for question in known_questions]
    audit.check(
        len(known_questions) == 10
        and known_ids == [f"KA-{index:02d}" for index in range(1, 11)],
        "known-answer fixture",
        f"count={len(known_questions)}, ids={known_ids}",
    )

    records = {
        path.stem: load_json(path)
        for path in (root / "knowledge" / "source-records").glob("SRC-*.json")
    }
    reference_errors: list[str] = []
    for question in known_questions:
        for point in question.get("reference_points", []):
            label = point.get("label")
            if label not in ALLOWED_LABELS:
                reference_errors.append(
                    f"{point.get('claim_id')}: unsupported label {label!r}"
                )
                continue
            for source in point.get("sources", []):
                source_id = source.get("source_id")
                record = records.get(source_id)
                if record is None:
                    reference_errors.append(
                        f"{point.get('claim_id')}: unknown source {source_id!r}"
                    )
                    continue
                if not record.get("canon_evidence", False):
                    reference_errors.append(
                        f"{point.get('claim_id')}: canon_evidence=false source {source_id}"
                    )
                if label in CANON_LABELS and (
                    record.get("status") != "accepted"
                    or not record.get("canon_evidence", False)
                ):
                    reference_errors.append(
                        f"{point.get('claim_id')}: canonical claim uses unaccepted {source_id}"
                    )
                if record.get("canon_context") == "pledge" and label in CANON_LABELS:
                    context = str(point.get("canon_context", ""))
                    use = str(source.get("use", ""))
                    if "pledge" not in context and "pledge" not in use:
                        reference_errors.append(
                            f"{point.get('claim_id')}: pledge source lacks isolation {source_id}"
                        )
    audit.check(
        not reference_errors,
        "known-answer source integrity",
        f"errors={reference_errors}",
    )

    blind_prompts = blind.get("prompts", [])
    blind_ids = [prompt.get("id") for prompt in blind_prompts]
    forbidden_keys = collect_keys(blind) & FORBIDDEN_BLIND_KEYS
    audit.check(
        len(blind_prompts) == 4
        and blind_ids == [f"BT-{index:02d}" for index in range(1, 5)]
        and not forbidden_keys,
        "blind fixture integrity",
        f"count={len(blind_prompts)}, ids={blind_ids}, forbidden={sorted(forbidden_keys)}",
    )

    route_prompts = routes.get("prompts", [])
    route_ids = [prompt.get("id") for prompt in route_prompts]
    route_names = {prompt.get("route") for prompt in route_prompts}
    pledge_enabled = [
        prompt.get("id") for prompt in route_prompts if prompt.get("pledge_enabled")
    ]
    audit.check(
        len(route_prompts) == 6
        and route_ids == [f"RB-{index:02d}" for index in range(1, 7)]
        and route_names == ROUTES
        and pledge_enabled == ["RB-06"],
        "route fixture integrity",
        f"ids={route_ids}, routes={sorted(route_names)}, pledge={pledge_enabled}",
    )

    boundary_prompts = boundaries.get("prompts", [])
    boundary_ids = [prompt.get("id") for prompt in boundary_prompts]
    boundary_weights = boundaries.get("scoring_per_prompt", {})
    audit.check(
        len(boundary_prompts) == 4
        and boundary_ids == [f"RB-{index:02d}" for index in range(7, 11)]
        and abs(sum(boundary_weights.values()) - 2.5) < 1e-9,
        "canon-boundary fixture integrity",
        f"ids={boundary_ids}, per_prompt={sum(boundary_weights.values())}",
    )

    result_scores = results.get("scores", {})
    score_errors: list[str] = []
    if set(result_scores) != set(SCORE_CAPS):
        score_errors.append(
            f"score keys mismatch: expected={sorted(SCORE_CAPS)}, actual={sorted(result_scores)}"
        )
    for name, cap in SCORE_CAPS.items():
        value = result_scores.get(name)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= cap:
            score_errors.append(f"{name}={value!r}, cap={cap}")
    computed_total = sum(
        float(result_scores.get(name, 0)) for name in SCORE_CAPS
    )
    declared_total = results.get("total")
    if not isinstance(declared_total, (int, float)) or isinstance(declared_total, bool):
        score_errors.append(f"invalid total {declared_total!r}")
    elif abs(computed_total - float(declared_total)) > 1e-9:
        score_errors.append(
            f"total mismatch: declared={declared_total}, computed={computed_total}"
        )
    audit.check(
        not score_errors,
        "Gate E score arithmetic",
        f"errors={score_errors}, total={computed_total}",
    )
    thresholds = results.get("thresholds", {})
    passes_thresholds = (
        computed_total >= 85
        and float(result_scores.get("canon_accuracy", 0)) >= 22
        and float(result_scores.get("unknown_honesty", 0)) >= 9
        and float(result_scores.get("expression_dna", 0)) >= 17
        and thresholds
        == {"total": 85, "canon_accuracy": 22, "unknown_honesty": 9}
    )
    audit.check(
        passes_thresholds,
        "Gate E thresholds",
        f"total={computed_total}, canon={result_scores.get('canon_accuracy')}, "
        f"unknown={result_scores.get('unknown_honesty')}, expression={result_scores.get('expression_dna')}",
    )
    audit.check(
        results.get("hard_failures") == [] and results.get("verdict") == "PASS",
        "Gate E hard failures and verdict",
        f"hard_failures={results.get('hard_failures')}, verdict={results.get('verdict')}",
    )

    transcript_errors: list[str] = []
    matching_headers: set[str] = set()
    transcript_base: Path | None = None
    if transcript_root is None:
        transcript_errors.append("--transcript-root is required for final validation")
    else:
        try:
            transcript_base = transcript_root.resolve()
        except OSError as exc:
            transcript_errors.append(f"cannot resolve transcript root: {exc}")
        if transcript_base is not None and not transcript_base.is_dir():
            transcript_errors.append(
                f"transcript root is not a directory: {transcript_base}"
            )

    evaluated_manifest = results["evaluated_manifest_sha256"]
    expected_header = (
        "Evaluated package manifest before Gate E metadata finalization: "
        f"`{evaluated_manifest}`"
    )
    if transcript_base is not None and transcript_base.is_dir():
        for name, filename in EXPECTED_TRANSCRIPTS.items():
            record = results["transcripts"][name]
            expected_relative = f"run-{results['run_id']}/{filename}"
            relative = record["relative_path"]
            if relative != expected_relative:
                transcript_errors.append(
                    f"{name}: expected path {expected_relative!r}, got {relative!r}"
                )
                continue
            try:
                path = validate_relative_transcript(transcript_base, relative)
            except (OSError, ValueError) as exc:
                transcript_errors.append(f"{name}: {exc}")
                continue
            if not path.is_file():
                transcript_errors.append(f"{name}: missing {path}")
                continue
            try:
                actual_hash = sha256_file(path)
                actual_size = path.stat().st_size
                lines = path.read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeError) as exc:
                transcript_errors.append(f"{name}: cannot read transcript: {exc}")
                continue
            if actual_hash != record["sha256"] or actual_size != record["bytes"]:
                transcript_errors.append(
                    f"{name}: expected={record['sha256']}/{record['bytes']}, "
                    f"actual={actual_hash}/{actual_size}"
                )
            if len(lines) < 3 or lines[2] != expected_header:
                transcript_errors.append(
                    f"{name}: frozen header does not identify evaluated manifest "
                    f"{evaluated_manifest}"
                )
            else:
                matching_headers.add(name)
    audit.check(
        not transcript_errors and matching_headers == set(EXPECTED_TRANSCRIPTS),
        "frozen transcript evidence",
        f"headers={sorted(matching_headers)}, errors={transcript_errors}",
    )

    try:
        verified = verify_package(formal_root)
        manifest_error = None
    except (PackageError, OSError) as exc:
        verified = None
        manifest_error = str(exc)
    final_manifest = results.get("final_manifest_sha256")
    audit.check(
        verified is not None
        and verified.manifest_sha256 == final_manifest,
        "formal package manifest",
        manifest_error
        or f"current={verified.manifest_sha256 if verified else None}, final={final_manifest}",
    )

    behavior_hashes = results["behavior_sha256"]
    behavior_errors: list[str] = []
    actual_behavior_files = set(behavior_hashes)
    if actual_behavior_files != EXPECTED_BEHAVIOR_FILES:
        behavior_errors.append(
            "behavior file set mismatch: "
            f"missing={sorted(EXPECTED_BEHAVIOR_FILES - actual_behavior_files)}, "
            f"extra={sorted(actual_behavior_files - EXPECTED_BEHAVIOR_FILES)}"
        )
    manifest_records = (
        {record["path"]: record for record in verified.manifest["files"]}
        if verified is not None
        else {}
    )
    manifest_behavior_files = {
        relative
        for relative in manifest_records
        if relative == "SKILL.md" or relative.startswith("references/")
    }
    if verified is not None and manifest_behavior_files != EXPECTED_BEHAVIOR_FILES:
        behavior_errors.append(
            "formal package behavior file set mismatch: "
            f"missing={sorted(EXPECTED_BEHAVIOR_FILES - manifest_behavior_files)}, "
            f"extra={sorted(manifest_behavior_files - EXPECTED_BEHAVIOR_FILES)}"
        )
    for relative, expected_hash in behavior_hashes.items():
        try:
            path = validate_relative_transcript(formal_root, relative)
        except (OSError, ValueError) as exc:
            behavior_errors.append(str(exc))
            continue
        if not path.is_file():
            behavior_errors.append(f"missing behavior file {relative}")
            continue
        try:
            actual_hash = sha256_file(path)
        except OSError as exc:
            behavior_errors.append(f"cannot hash behavior file {relative}: {exc}")
            continue
        if actual_hash != expected_hash:
            behavior_errors.append(f"behavior file changed after evaluation: {relative}")
        manifest_record = manifest_records.get(relative)
        if manifest_record is None:
            behavior_errors.append(f"formal manifest omits behavior file {relative}")
        elif manifest_record.get("sha256") != expected_hash:
            behavior_errors.append(
                f"formal manifest hash disagrees with evaluation for {relative}"
            )
    audit.check(
        not behavior_errors,
        "evaluated behavior files",
        f"errors={behavior_errors}",
    )

    workspace_validation = (
        workspace_meta.get("validation", {})
        if isinstance(workspace_meta, dict)
        else {}
    )
    workspace_distribution = (
        workspace_meta.get("distribution", {})
        if isinstance(workspace_meta, dict)
        else {}
    )
    report_hash = sha256_file(paths["validation report"])
    # Preserve the exact pre-final package record instead of trusting an arbitrary
    # digest copied into results/transcript headers.  Only meta.json may differ
    # between the evaluated and final packages, and its evaluated bytes are frozen.
    provenance_errors: list[str] = []
    if evaluated_manifest == final_manifest:
        provenance_errors.append("evaluated and final manifests must be distinct")
    if transcript_errors or matching_headers != set(EXPECTED_TRANSCRIPTS):
        provenance_errors.append(
            "all frozen transcripts must hash correctly and pin the evaluated manifest"
        )
    if behavior_errors:
        provenance_errors.append("behavior hashes do not match the verified final manifest")
    try:
        if not isinstance(evaluated_manifest_record, dict):
            raise PackageError("evaluated manifest root must be an object")
        evaluated_manifest_bytes = paths["evaluated manifest"].read_bytes()
        canonical_evaluated_manifest = _canonical_manifest_bytes(
            evaluated_manifest_record
        )
        if evaluated_manifest_bytes != canonical_evaluated_manifest:
            provenance_errors.append("evaluated manifest snapshot is not canonical JSON")
        actual_evaluated_manifest_hash = hashlib.sha256(
            evaluated_manifest_bytes
        ).hexdigest()
        if actual_evaluated_manifest_hash != evaluated_manifest:
            provenance_errors.append(
                "evaluated manifest snapshot hash mismatch: "
                f"actual={actual_evaluated_manifest_hash}, expected={evaluated_manifest}"
            )
        evaluated_records = _validate_manifest_structure(evaluated_manifest_record)
        evaluated_record_map = {
            record["path"]: record for record in evaluated_records
        }
        final_record_map = manifest_records
        if set(evaluated_record_map) != set(final_record_map):
            provenance_errors.append(
                "evaluated/final manifest file sets differ: "
                f"evaluated={sorted(evaluated_record_map)}, "
                f"final={sorted(final_record_map)}"
            )
        for relative in sorted(set(evaluated_record_map) & set(final_record_map)):
            if relative == "meta.json":
                continue
            if evaluated_record_map[relative] != final_record_map[relative]:
                provenance_errors.append(
                    f"non-metadata manifest record changed after evaluation: {relative}"
                )

        evaluated_meta_bytes = paths["evaluated metadata"].read_bytes()
        evaluated_meta_record = evaluated_record_map.get("meta.json")
        if evaluated_meta_record is None:
            provenance_errors.append("evaluated manifest omits meta.json")
        elif (
            evaluated_meta_record.get("size") != len(evaluated_meta_bytes)
            or evaluated_meta_record.get("sha256")
            != hashlib.sha256(evaluated_meta_bytes).hexdigest()
        ):
            provenance_errors.append(
                "evaluated metadata bytes do not match the evaluated manifest"
            )
        if not isinstance(evaluated_meta, dict):
            provenance_errors.append("evaluated metadata root is not an object")
        else:
            evaluated_validation = evaluated_meta.get("validation")
            if evaluated_validation != {
                "status": "gate-e-in-progress",
                "score": None,
                "canon_accuracy": None,
                "unknown_honesty": None,
                "validation_sha256": None,
            }:
                provenance_errors.append(
                    "evaluated metadata is not the pre-final Gate E state"
                )
            evaluated_core = dict(evaluated_meta)
            final_core = dict(meta) if isinstance(meta, dict) else {}
            evaluated_core.pop("validation", None)
            final_core.pop("validation", None)
            if evaluated_core != final_core:
                provenance_errors.append(
                    "formal metadata changed outside the validation block after evaluation"
                )
    except (OSError, UnicodeError, json.JSONDecodeError, PackageError, TypeError) as exc:
        provenance_errors.append(f"invalid evaluated package snapshot: {exc}")
    expected_workspace_validation = {
        "run_id": results["run_id"],
        "evaluated_manifest_sha256": evaluated_manifest,
        "final_manifest_sha256": final_manifest,
    }
    for key, expected in expected_workspace_validation.items():
        if workspace_validation.get(key) != expected:
            provenance_errors.append(
                f"workspace metadata {key}={workspace_validation.get(key)!r}, "
                f"expected={expected!r}"
            )
    if workspace_distribution.get("manifest_sha256") != final_manifest:
        provenance_errors.append("workspace distribution does not pin the final manifest")
    if evaluated_manifest not in validation_report or results["run_id"] not in validation_report:
        provenance_errors.append("validation report does not identify the evaluated run")
    for metadata_name, metadata in (
        ("workspace", workspace_validation),
        (
            "formal",
            meta.get("validation", {}) if isinstance(meta, dict) else {},
        ),
    ):
        if metadata.get("validation_sha256") != report_hash:
            provenance_errors.append(
                f"{metadata_name} metadata does not hash the validation report"
            )
    audit.check(
        not provenance_errors,
        "evaluated manifest provenance",
        f"errors={provenance_errors}",
    )
    audit.check(
        meta.get("validation", {}).get("status") == "PASS"
        and meta.get("validation", {}).get("score") == declared_total
        and meta.get("validation", {}).get("canon_accuracy")
        == result_scores.get("canon_accuracy")
        and meta.get("validation", {}).get("unknown_honesty")
        == result_scores.get("unknown_honesty"),
        "formal metadata validation state",
        f"validation={meta.get('validation')}",
    )
    audit.check(
        "D_persona_preview: approved_and_completed" in intake
        and any(
            marker in intake
            for marker in (
                "E_final_acceptance: approved_in_advance",
                "E_final_acceptance: approved_and_completed",
                "E_final_acceptance: completed",
            )
        ),
        "Gate E authorization",
        "Gate D completed and Gate E preapproved or complete",
    )
    audit.check(
        "结论：`PASS`" in validation_report
        and f"{float(declared_total):.2f}／100" in validation_report
        and "人工音频回听 0" in validation_report
        and "完整观看 0" in validation_report
        and "145" in validation_report,
        "Gate E validation report",
        "PASS, score, and disclosed research gaps are present",
    )
    return audit


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the Kanami Gate E package")
    parser.add_argument("character_root", type=Path)
    parser.add_argument("--dist-root", type=Path)
    parser.add_argument("--transcript-root", type=Path, required=True)
    args = parser.parse_args()
    audit = validate(args.character_root, args.dist_root, args.transcript_root)
    for row in audit.rows:
        print(f"[{row['status']}] {row['name']}: {row['detail']}")
    passed = len(audit.rows) - len(audit.failures)
    result = "PASS" if not audit.failures else "FAIL"
    print(f"\nGate E validator: {result} ({passed}/{len(audit.rows)} checks)")
    return 0 if not audit.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
