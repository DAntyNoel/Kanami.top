from __future__ import annotations

from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

from validate_gate_c import MODEL_HEADING_RE, split_sections, validate  # noqa: E402


class GateCValidationTests(unittest.TestCase):
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

    def test_current_gate_c_package_passes(self) -> None:
        character_root = WORKSPACE_ROOT / "skills" / "celebrity" / "kanami"
        audit = validate(character_root)
        self.assertEqual([], audit.failures)

    def test_model_section_stops_at_next_level_two_heading(self) -> None:
        text = """# Test
## Models
### M1｜One
- 定义：first
## Later
SRC-TEST-99 must not leak into M1.
"""
        sections = split_sections(text, MODEL_HEADING_RE)
        self.assertEqual(1, len(sections))
        self.assertNotIn("SRC-TEST-99", sections[0][1])

    def test_section_parser_keeps_consecutive_models_separate(self) -> None:
        pattern = re.compile(r"^### (M[1-9])(?:｜|\s)", re.MULTILINE)
        text = "### M1｜One\nA\n### M2｜Two\nB\n## Next\nC\n"
        sections = split_sections(text, pattern)
        self.assertEqual(["M1", "M2"], [name for name, _ in sections])
        self.assertNotIn("B", sections[0][1])
        self.assertNotIn("C", sections[1][1])

    def test_duplicate_heuristic_ids_are_rejected(self) -> None:
        character_root = self.copy_character_root()
        synthesis_path = (
            character_root / "knowledge" / "research" / "reviews" / "synthesis.md"
        )
        synthesis = synthesis_path.read_text(encoding="utf-8")
        synthesis, replacements = re.subn(
            r"^### H8\b", "### H7", synthesis, count=1, flags=re.MULTILINE
        )
        self.assertEqual(1, replacements)
        synthesis_path.write_text(synthesis, encoding="utf-8")

        audit = validate(character_root)
        row = next(row for row in audit.rows if row["name"] == "decision heuristic IDs")
        self.assertEqual("FAIL", row["status"])
        self.assertIn("H7", row["detail"])


if __name__ == "__main__":
    unittest.main()
