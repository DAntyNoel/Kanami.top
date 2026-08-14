#!/usr/bin/env python3
"""Validate the Kanami Gate C synthesis package with the standard library."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


CHARACTER_SUFFIX = ("workspace", "skills", "celebrity", "kanami")
MODEL_HEADING_RE = re.compile(r"^### (M[1-9])(?:｜|\s)", re.MULTILINE)
HEURISTIC_HEADING_RE = re.compile(r"^### (H[1-9][0-9]*)(?:｜|\s)", re.MULTILINE)
SOURCE_ID_RE = re.compile(r"\bSRC-[A-Z0-9]+(?:-[A-Z0-9]+)*[0-9]\b")
MODEL_FIELDS = (
    "定义",
    "首先注意",
    "容易忽视",
    "证据锚点",
    "适用情境",
    "反例",
    "失效边界",
    "证据等级",
    "标签",
)
ROUTES = (
    "public_idol",
    "private_familiar",
    "mission_volunteer",
    "battle_stage",
    "vulnerable_reflective",
    "pledge_intimate",
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


def split_sections(text: str, pattern: re.Pattern[str]) -> list[tuple[str, str]]:
    matches = list(pattern.finditer(text))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        next_level_two = re.search(r"^## (?!#)", text[match.end() :], re.MULTILINE)
        if next_level_two:
            end = min(end, match.end() + next_level_two.start())
        sections.append((match.group(1), text[match.start() : end]))
    return sections


def validate(character_root: Path) -> Audit:
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

    synthesis_path = root / "knowledge" / "research" / "reviews" / "synthesis.md"
    gate_path = root / "gates" / "gate-c-mental-models.md"
    intake_path = root / "intake.yaml"
    records_dir = root / "knowledge" / "source-records"
    required = {
        "synthesis": synthesis_path,
        "Gate C handoff": gate_path,
        "intake": intake_path,
        "source records": records_dir,
    }
    for name, path in required.items():
        exists = path.is_dir() if name == "source records" else path.is_file()
        audit.check(exists, f"required path: {name}", str(path))
    if any(
        not (path.is_dir() if name == "source records" else path.is_file())
        for name, path in required.items()
    ):
        return audit

    synthesis = synthesis_path.read_text(encoding="utf-8")
    gate = gate_path.read_text(encoding="utf-8")
    intake = intake_path.read_text(encoding="utf-8")
    record_ids = {path.stem for path in records_dir.glob("SRC-*.json")}

    audit.check(
        "B_research_summary: approved" in intake
        and any(
            marker in intake
            for marker in (
                "C_mental_models: approved_in_advance",
                "C_mental_models: approved_and_completed",
                "C_mental_models: completed",
            )
        )
        and "preserve_sequential_execution: true" in intake
        and "preserve_quality_validation: true" in intake,
        "Gate C authorization",
        "Gate B approved and all-gate preapproval preserves sequence and validation",
    )

    model_sections = split_sections(synthesis, MODEL_HEADING_RE)
    model_ids = [model_id for model_id, _ in model_sections]
    audit.check(
        3 <= len(model_sections) <= 5,
        "mental model count",
        f"models={model_ids}",
    )
    audit.check(
        model_ids == [f"M{index}" for index in range(1, len(model_ids) + 1)],
        "mental model ordering",
        f"models={model_ids}",
    )
    for model_id, block in model_sections:
        missing_fields = [field for field in MODEL_FIELDS if f"- {field}：" not in block]
        refs = set(SOURCE_ID_RE.findall(block))
        unknown_refs = refs - record_ids
        audit.check(
            not missing_fields,
            f"{model_id} required fields",
            f"missing={missing_fields}",
        )
        audit.check(
            len(refs) >= 2 and not unknown_refs,
            f"{model_id} evidence anchors",
            f"refs={sorted(refs)}, unknown={sorted(unknown_refs)}",
        )
        audit.check(
            "IN_CHARACTER_INFERENCE" in block and "candidate_model" in block,
            f"{model_id} inference status",
            "model is explicitly a candidate inference",
        )

    heuristic_sections = split_sections(synthesis, HEURISTIC_HEADING_RE)
    heuristic_ids = [heuristic_id for heuristic_id, _ in heuristic_sections]
    audit.check(
        5 <= len(heuristic_sections) <= 10,
        "decision heuristic count",
        f"heuristics={heuristic_ids}",
    )
    duplicate_heuristic_ids = sorted(
        {
            heuristic_id
            for heuristic_id in heuristic_ids
            if heuristic_ids.count(heuristic_id) > 1
        }
    )
    audit.check(
        not duplicate_heuristic_ids,
        "decision heuristic IDs",
        f"duplicates={duplicate_heuristic_ids}",
    )
    for heuristic_id, block in heuristic_sections:
        audit.check(
            "IN_CHARACTER_INFERENCE" in block
            and "如果" in block
            and "因为" in block
            and "但" in block,
            f"{heuristic_id} executable structure",
            "contains inference label, condition, protected value, and boundary",
        )

    missing_routes = [route for route in ROUTES if f"`{route}`" not in synthesis]
    audit.check(
        not missing_routes,
        "six-route coverage",
        f"missing={missing_routes}",
    )
    audit.check(
        "## 4. 关系矩阵" in synthesis
        and "熟悉且受到重视的引航者" in synthesis
        and "不自动" in synthesis
        and "恋爱" in synthesis,
        "default relationship boundary",
        "default familiar navigator is distinct from romance and pledge",
    )

    boundary_markers = {
        "pledge": ("PLEDGE_ONLY", "默认关闭"),
        "S07 event": ("EVENT_ONLY:S07", "未回听"),
        "audio gap": ("人工音频回听数为 0", "WORDING_UNVERIFIED"),
        "video gap": ("SRC-B-01..06", "尚未完整观看"),
        "non-canon visual": ("NON_CANON_ASSET", "canon_evidence=false"),
    }
    for name, markers in boundary_markers.items():
        audit.check(
            all(marker in synthesis for marker in markers),
            f"boundary: {name}",
            f"markers={markers}",
        )
    audit.check(
        "SKIN_ONLY" in synthesis
        and any(marker in synthesis for marker in ("不覆盖", "不能覆盖")),
        "boundary: skin",
        "skin is isolated and cannot override base",
    )

    synthesis_refs = set(SOURCE_ID_RE.findall(synthesis))
    audit.check(
        not (synthesis_refs - record_ids),
        "synthesis source IDs",
        f"refs={len(synthesis_refs)}, unknown={sorted(synthesis_refs - record_ids)}",
    )
    audit.check(
        "COMPLETE_FOR_GATE_D_INPUT_WITH_DISCLOSED_GAPS" in synthesis
        and "四个模型仍是候选推演" in synthesis,
        "synthesis handoff status",
        "complete for Gate D with candidate-model and gap disclosure",
    )
    audit.check(
        "COMPLETE_FOR_GATE_D_INPUT_WITH_DISCLOSED_GAPS" in gate
        and all(f"| M{index} " in gate for index in range(1, len(model_sections) + 1))
        and "人工回听仍为 0" in gate
        and "视频仍未完整观看" in gate,
        "Gate C handoff",
        "model summary and media gaps are present",
    )

    prohibited_placeholders = ("REPLACE_", "REPLACE-", "TODO", "待填写")
    audit.check(
        not any(marker in synthesis or marker in gate for marker in prohibited_placeholders),
        "Gate C placeholders",
        "no template placeholders remain",
    )

    gate_c_complete = any(
        marker in intake
        for marker in (
            "C_mental_models: approved_and_completed",
            "C_mental_models: completed",
        )
    )
    later_outputs = [
        root / name
        for name in ("persona.md", "work.md", "persona_skill.md", "work_skill.md")
        if (root / name).exists()
    ]
    audit.check(
        gate_c_complete or not later_outputs,
        "Gate C stage boundary",
        "Gate C completed; later outputs permitted"
        if gate_c_complete
        else (
            "no Persona or Work outputs before Gate C completion"
            if not later_outputs
            else ", ".join(str(path) for path in later_outputs)
        ),
    )
    return audit


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the Kanami Gate C package")
    parser.add_argument("character_root", type=Path)
    args = parser.parse_args()
    audit = validate(args.character_root)
    for row in audit.rows:
        print(f"[{row['status']}] {row['name']}: {row['detail']}")
    passed = len(audit.rows) - len(audit.failures)
    result = "PASS" if not audit.failures else "FAIL"
    print(f"\nGate C validator: {result} ({passed}/{len(audit.rows)} checks)")
    return 0 if not audit.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
