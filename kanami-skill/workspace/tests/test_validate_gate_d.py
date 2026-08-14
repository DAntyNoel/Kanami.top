from __future__ import annotations

from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

from validate_gate_d import PREVIEW_RE, ROUTES, validate  # noqa: E402


class GateDValidationTests(unittest.TestCase):
    def copy_character_root(self) -> Path:
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        source = WORKSPACE_ROOT / "skills" / "celebrity" / "kanami"
        destination = (
            Path(temporary_directory.name)
            / "workspace"
            / "skills"
            / "celebrity"
            / "kanami"
        )
        shutil.copytree(source, destination)
        return destination

    def audit_row(self, audit, name: str) -> dict[str, str]:
        return next(row for row in audit.rows if row["name"] == name)

    def test_current_gate_d_package_passes(self) -> None:
        character_root = WORKSPACE_ROOT / "skills" / "celebrity" / "kanami"
        audit = validate(character_root)
        self.assertEqual([], audit.failures)

    def test_preview_parser_requires_context_response_and_check(self) -> None:
        valid = (
            "### `private_familiar`\n\n"
            "情境：普通聊天。\n\n"
            "> 先听你说，再一起找下一步。\n\n"
            "检查：保持默认距离。\n"
        )
        invalid = "### `battle_stage`\n\n> 缺少情境与检查。\n"
        self.assertEqual(1, len(list(PREVIEW_RE.finditer(valid))))
        self.assertEqual(0, len(list(PREVIEW_RE.finditer(invalid))))

    def test_declared_routes_are_unique(self) -> None:
        self.assertEqual(6, len(ROUTES))
        self.assertEqual(len(ROUTES), len(set(ROUTES)))

    def test_three_declared_models_are_accepted_and_derived(self) -> None:
        character_root = self.copy_character_root()
        synthesis_path = (
            character_root / "knowledge" / "research" / "reviews" / "synthesis.md"
        )
        synthesis = synthesis_path.read_text(encoding="utf-8")
        synthesis, synthesis_replacements = re.subn(
            r"^### M4\b.*?(?=^## 3\.)",
            "",
            synthesis,
            count=1,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertEqual(1, synthesis_replacements)
        synthesis_path.write_text(synthesis, encoding="utf-8")

        persona_path = character_root / "persona.md"
        persona = persona_path.read_text(encoding="utf-8")
        persona, persona_replacements = re.subn(
            r"^### M4\b.*?(?=^## Layer 4\b)",
            "",
            persona,
            count=1,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertEqual(1, persona_replacements)
        persona_path.write_text(persona, encoding="utf-8")

        audit = validate(character_root)
        self.assertEqual(
            "PASS", self.audit_row(audit, "Gate C mental model declarations")["status"]
        )
        self.assertEqual("PASS", self.audit_row(audit, "Persona mental models")["status"])

    def test_too_few_declared_models_are_rejected(self) -> None:
        character_root = self.copy_character_root()
        synthesis_path = (
            character_root / "knowledge" / "research" / "reviews" / "synthesis.md"
        )
        synthesis = synthesis_path.read_text(encoding="utf-8")
        synthesis, replacements = re.subn(
            r"^### M3\b.*?(?=^## 3\.)",
            "",
            synthesis,
            count=1,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertEqual(1, replacements)
        synthesis_path.write_text(synthesis, encoding="utf-8")

        audit = validate(character_root)
        self.assertEqual(
            "FAIL", self.audit_row(audit, "Gate C mental model declarations")["status"]
        )

    def test_missing_declared_persona_model_is_rejected(self) -> None:
        character_root = self.copy_character_root()
        persona_path = character_root / "persona.md"
        persona = persona_path.read_text(encoding="utf-8")
        persona, replacements = re.subn(
            r"^### M4\b.*?(?=^## Layer 4\b)",
            "",
            persona,
            count=1,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertEqual(1, replacements)
        persona_path.write_text(persona, encoding="utf-8")

        audit = validate(character_root)
        row = self.audit_row(audit, "Persona mental models")
        self.assertEqual("FAIL", row["status"])
        self.assertIn("M4", row["detail"])

    def test_duplicate_route_previews_are_rejected(self) -> None:
        character_root = self.copy_character_root()
        preview_path = character_root / "gates" / "gate-d-persona-preview.md"
        preview = preview_path.read_text(encoding="utf-8")
        route_block = re.search(
            r"^### `public_idol`.*?(?=^### `private_familiar`)",
            preview,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(route_block)
        assert route_block is not None
        preview = preview.replace(route_block.group(0), route_block.group(0) * 2, 1)
        preview_path.write_text(preview, encoding="utf-8")

        audit = validate(character_root)
        row = self.audit_row(audit, "six route previews")
        self.assertEqual("FAIL", row["status"])
        self.assertIn("public_idol", row["detail"])

    def test_missing_layer_four_returns_audit_failures(self) -> None:
        character_root = self.copy_character_root()
        persona_path = character_root / "persona.md"
        persona = persona_path.read_text(encoding="utf-8")
        persona, replacements = re.subn(
            r"^## Layer 4\b.*?(?=^## Layer 5\b)",
            "",
            persona,
            count=1,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertEqual(1, replacements)
        persona_path.write_text(persona, encoding="utf-8")

        audit = validate(character_root)
        self.assertEqual("FAIL", self.audit_row(audit, "Persona layer structure")["status"])
        row = self.audit_row(audit, "Persona decision heuristics")
        self.assertEqual("FAIL", row["status"])
        self.assertEqual("Layer 4 is absent", row["detail"])


if __name__ == "__main__":
    unittest.main()
