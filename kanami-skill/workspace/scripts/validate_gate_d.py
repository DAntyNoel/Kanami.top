#!/usr/bin/env python3
"""Validate the Kanami Gate D Persona, task skill, and route previews."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


CHARACTER_SUFFIX = ("workspace", "skills", "celebrity", "kanami")
ROUTES = (
    "public_idol",
    "private_familiar",
    "mission_volunteer",
    "battle_stage",
    "vulnerable_reflective",
    "pledge_intimate",
)
LAYERS = (
    "Layer 0",
    "Layer 1",
    "Layer 2",
    "Layer 2.5",
    "Layer 3",
    "Layer 4",
    "Layer 5",
    "Layer 6",
    "Layer 7",
    "Layer 8",
)
WORK_MODULES = (
    "对话与陪伴",
    "创意表达",
    "任务协作",
    "失败复盘",
    "记忆与意义讨论",
    "边界处理",
)
SOURCE_ID_RE = re.compile(r"\bSRC-[A-Z0-9]+(?:-[A-Z0-9]+)*[0-9]\b")
MODEL_HEADING_RE = re.compile(r"^### (M[1-9])(?:｜|\s)", re.MULTILINE)
PREVIEW_RE = re.compile(
    r"^### `(?P<route>[^`]+)`\s+"
    r"情境：[^\n]+\s+"
    r"> (?P<response>[^\n]+)\s+"
    r"检查：(?P<check>[^\n]+)",
    re.MULTILINE,
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

    paths = {
        "persona": root / "persona.md",
        "work": root / "work.md",
        "persona-only contract": root / "persona_skill.md",
        "task-only contract": root / "work_skill.md",
        "Gate D preview": root / "gates" / "gate-d-persona-preview.md",
        "Gate C synthesis": root
        / "knowledge"
        / "research"
        / "reviews"
        / "synthesis.md",
        "intake": root / "intake.yaml",
    }
    for name, path in paths.items():
        audit.check(path.is_file(), f"required file: {name}", str(path))
    if any(not path.is_file() for path in paths.values()):
        return audit

    persona = paths["persona"].read_text(encoding="utf-8")
    work = paths["work"].read_text(encoding="utf-8")
    persona_contract = paths["persona-only contract"].read_text(encoding="utf-8")
    work_contract = paths["task-only contract"].read_text(encoding="utf-8")
    preview = paths["Gate D preview"].read_text(encoding="utf-8")
    synthesis = paths["Gate C synthesis"].read_text(encoding="utf-8")
    intake = paths["intake"].read_text(encoding="utf-8")

    audit.check(
        "C_mental_models: approved_and_completed" in intake
        and any(
            marker in intake
            for marker in (
                "D_persona_preview: approved_in_advance",
                "D_persona_preview: approved_and_completed",
                "D_persona_preview: completed",
            )
        )
        and "preserve_sequential_execution: true" in intake,
        "Gate D authorization",
        "Gate C completed and Gate D is preapproved or complete",
    )

    missing_layers = [layer for layer in LAYERS if f"## {layer}" not in persona]
    audit.check(
        not missing_layers and "## Correction Log" in persona,
        "Persona layer structure",
        f"missing={missing_layers}, correction_log={'## Correction Log' in persona}",
    )
    audit.check(
        "非官方 AI 角色解释" in persona
        and "不代表游戏官方或版权方" in persona
        and "中文 PC" in persona,
        "Persona provenance",
        "non-official interpretation and baseline are explicit",
    )

    missing_persona_routes = [route for route in ROUTES if f"`{route}`" not in persona]
    expected_priority = (
        "正在发生的战斗 → 非战斗严肃／脆弱议题 → 任务 → 公开 → 已显式启用的誓约 → 默认私下"
    )
    audit.check(
        not missing_persona_routes and expected_priority in persona,
        "Persona route coverage and priority",
        f"missing={missing_persona_routes}, priority={expected_priority in persona}",
    )
    audit.check(
        "现实安全是覆盖所有模式的硬约束，不是人格路由" in persona
        and "战斗中的伤员／资源处置" in persona
        and "脱离即时危险后的伤病与失败反思" in persona,
        "safety override versus route selection",
        "active combat keeps battle routing while safety overrides actions",
    )
    audit.check(
        "熟悉且受到重视的引航者" in persona
        and "pledge_intimate` 默认关闭" in persona
        and "可随时关闭" in persona
        and "不得在未授权时跨会话持久化" in persona,
        "relationship state machine",
        "default relationship, explicit pledge, revocation, and non-persistence are defined",
    )
    boundary_groups = {
        "S07 event": ("SRC-O-S07", "独立 `event / private_familiar`", "音频未回听"),
        "skin": ("`skin` 只是", "不能覆盖 base"),
        "unreviewed media": ("人工音频回听为 0", "均未完整观看"),
        "non-canon assets": ("canon_evidence=false", "QQ、群号"),
        "canon honesty": ("CANON_DIRECT", "CANON_SYNTHESIS", "IN_CHARACTER_INFERENCE", "UNKNOWN"),
    }
    for name, markers in boundary_groups.items():
        audit.check(
            all(marker in persona for marker in markers),
            f"Persona boundary: {name}",
            f"markers={markers}",
        )

    declared_models = MODEL_HEADING_RE.findall(synthesis)
    duplicate_models = sorted(
        {
            model_id
            for model_id in declared_models
            if declared_models.count(model_id) > 1
        }
    )
    expected_models = [f"M{index}" for index in range(1, len(declared_models) + 1)]
    gate_c_models_valid = (
        3 <= len(declared_models) <= 5
        and not duplicate_models
        and declared_models == expected_models
    )
    audit.check(
        gate_c_models_valid,
        "Gate C mental model declarations",
        (
            f"models={declared_models}, duplicates={duplicate_models}, "
            f"expected={expected_models}"
        ),
    )
    persona_models = MODEL_HEADING_RE.findall(persona)
    missing_models = [
        model_id for model_id in declared_models if model_id not in persona_models
    ]
    unexpected_models = [
        model_id for model_id in persona_models if model_id not in declared_models
    ]
    audit.check(
        gate_c_models_valid
        and not missing_models
        and not unexpected_models
        and persona_models == declared_models
        and persona.count("候选心智模型") >= 1
        and "均为 `IN_CHARACTER_INFERENCE`" in persona,
        "Persona mental models",
        (
            f"declared={declared_models}, persona={persona_models}, "
            f"missing={missing_models}, unexpected={unexpected_models}"
        ),
    )
    layer_4_parts = persona.split("## Layer 4", 1)
    layer_4 = (
        layer_4_parts[1].split("\n## ", 1)[0]
        if len(layer_4_parts) == 2
        else None
    )
    audit.check(
        layer_4 is not None
        and all(f"{index}. " in layer_4 for index in range(1, 9)),
        "Persona decision heuristics",
        (
            "H1-H8 are represented as eight runtime rules"
            if layer_4 is not None
            else "Layer 4 is absent"
        ),
    )
    audit.check(
        "关系矩阵" in persona
        and "基础正史相对时间线" in persona
        and "誓约／羁绊相对线" in persona
        and "独立事件与版本层" in persona,
        "formation, relationship, and timeline separation",
        "base, pledge, event, and release layers are separated",
    )

    missing_modules = [module for module in WORK_MODULES if f"## " not in work or module not in work]
    audit.check(
        not missing_modules,
        "Interaction & Task modules",
        f"missing={missing_modules}",
    )
    forbidden_work_sections = ("技术栈", "接口规范", "CRUD", "Code Review")
    audit.check(
        not any(section in work for section in forbidden_work_sections),
        "Interaction & Task adaptation",
        "no upstream engineering-template sections",
    )
    audit.check(
        work.count("IN_CHARACTER_INFERENCE") >= 20
        and "RUNTIME_TRUTH" in work
        and all(
            marker in work
            for marker in ("计划中", "已尝试但未验证", "已验证完成", "受阻")
        ),
        "task inference and runtime truth",
        "execution rules are inference and completion claims require evidence",
    )

    for name, contract, counterpart in (
        ("persona-only", persona_contract, "work_skill.md"),
        ("task-only", work_contract, "persona_skill.md"),
    ):
        audit.check(
            not contract.startswith("---")
            and "不是独立可发现" in contract
            and "统一 `SKILL.md`" in contract
            and counterpart in contract,
            f"{name} contract",
            "internal contract has no frontmatter and returns through the unified entry",
        )

    preview_matches = list(PREVIEW_RE.finditer(preview))
    preview_routes = [match.group("route") for match in preview_matches]
    duplicate_preview_routes = sorted(
        {
            route
            for route in preview_routes
            if preview_routes.count(route) > 1
        }
    )
    previews_by_route: dict[str, list[str]] = {}
    for match in preview_matches:
        previews_by_route.setdefault(match.group("route"), []).append(
            match.group("response")
        )
    previews = {
        route: responses[0]
        for route, responses in previews_by_route.items()
        if len(responses) == 1
    }
    audit.check(
        not duplicate_preview_routes
        and len(preview_routes) == len(ROUTES)
        and set(preview_routes) == set(ROUTES),
        "six route previews",
        f"routes={sorted(preview_routes)}, duplicates={duplicate_preview_routes}",
    )
    for route in ROUTES:
        response = previews.get(route, "")
        compact_length = len(re.sub(r"\s+", "", response))
        audit.check(
            60 <= compact_length <= 180,
            f"preview length: {route}",
            f"characters={compact_length}",
        )
    non_pledge_leaks = {
        route: response
        for route, response in previews.items()
        if route != "pledge_intimate"
        and any(term in response for term in ("誓约", "恋人", "只属于", "不可或缺"))
    }
    audit.check(
        not non_pledge_leaks
        and "用户已明确说“现在启用誓约模式”" in preview,
        "preview relationship isolation",
        f"non_pledge_leaks={sorted(non_pledge_leaks)}",
    )
    audit.check(
        "伤员" in previews.get("battle_stage", "")
        and "资源" in previews.get("battle_stage", "")
        and "舞台" not in previews.get("vulnerable_reflective", "")
        and "UNKNOWN" not in previews.get("private_familiar", ""),
        "preview routing distinctions",
        "battle handles losses/resources; vulnerable is untheatrical; private remains natural",
    )

    record_ids = {
        path.stem for path in (root / "knowledge" / "source-records").glob("SRC-*.json")
    }
    all_text = "\n".join((persona, work, persona_contract, work_contract, preview))
    refs = set(SOURCE_ID_RE.findall(all_text))
    audit.check(
        not (refs - record_ids),
        "Gate D source IDs",
        f"refs={len(refs)}, unknown={sorted(refs - record_ids)}",
    )
    audit.check(
        "COMPLETE_FOR_GATE_E_INPUT_WITH_DISCLOSED_GAPS" in preview
        and "fresh forward-test" in preview
        and "人工音频回听仍为 0" in preview,
        "Gate D handoff",
        "Gate E status, fresh testing, and media gaps are explicit",
    )
    audit.check(
        "REPLACE_" not in all_text
        and "REPLACE-" not in all_text
        and "TODO" not in all_text
        and "待填写" not in all_text,
        "Gate D placeholders",
        "no template placeholders remain",
    )

    gate_d_complete = any(
        marker in intake
        for marker in (
            "D_persona_preview: approved_and_completed",
            "D_persona_preview: completed",
        )
    )
    dist_root = root.parents[3] / "dist" / "celebrity-kanami"
    audit.check(
        gate_d_complete or not dist_root.exists(),
        "Gate D stage boundary",
        "Gate D completed; formal package permitted"
        if gate_d_complete
        else "formal package absent before Gate D completion",
    )
    audit.check(
        "COMPLETE_FOR_GATE_D_INPUT_WITH_DISCLOSED_GAPS" in synthesis,
        "Gate C dependency",
        "Gate D is based on the completed Gate C synthesis",
    )
    return audit


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the Kanami Gate D package")
    parser.add_argument("character_root", type=Path)
    args = parser.parse_args()
    audit = validate(args.character_root)
    for row in audit.rows:
        print(f"[{row['status']}] {row['name']}: {row['detail']}")
    passed = len(audit.rows) - len(audit.failures)
    result = "PASS" if not audit.failures else "FAIL"
    print(f"\nGate D validator: {result} ({passed}/{len(audit.rows)} checks)")
    return 0 if not audit.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
