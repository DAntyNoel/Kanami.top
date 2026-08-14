from __future__ import annotations

import copy
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORKSPACE_ROOT.parent
CHARACTER_ROOT = WORKSPACE_ROOT / "skills" / "celebrity" / "kanami"
DIST_ROOT = PROJECT_ROOT / "dist" / "celebrity-kanami"
TRANSCRIPT_ROOT = PROJECT_ROOT / "tmp" / "gate-e-results"
RESULTS_PATH = WORKSPACE_ROOT / "evals" / "gate-e" / "results.json"
SCHEMA_PATH = WORKSPACE_ROOT / "schemas" / "gate-e-evaluation.schema.json"
EVALUATED_MANIFEST_PATH = (
    WORKSPACE_ROOT / "evals" / "gate-e" / "evaluated-manifest.json"
)
sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

import validate_gate_e as gate_e  # noqa: E402


class GateEValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.results = gate_e.load_json(RESULTS_PATH)
        cls.schema = gate_e.load_json(SCHEMA_PATH)

    def validate_with_results(self, results: dict[str, object]) -> gate_e.Audit:
        original_load_json = gate_e.load_json

        def load_json(path: Path) -> object:
            if path == RESULTS_PATH:
                return copy.deepcopy(results)
            return original_load_json(path)

        with patch.object(gate_e, "load_json", side_effect=load_json):
            return gate_e.validate(CHARACTER_ROOT, DIST_ROOT, TRANSCRIPT_ROOT)

    def test_current_gate_e_package_passes(self) -> None:
        audit = gate_e.validate(CHARACTER_ROOT, DIST_ROOT, TRANSCRIPT_ROOT)
        self.assertEqual([], audit.failures)

    def test_source_snapshot_hashes_match_workspace_bytes(self) -> None:
        metadata = gate_e.load_json(DIST_ROOT / "meta.json")
        self.assertEqual(
            [], gate_e.validate_source_snapshot_hashes(metadata, CHARACTER_ROOT)
        )

        tampered = copy.deepcopy(metadata)
        tampered["source_snapshot"]["sha256"]["source_manifest"] = "0" * 64
        errors = gate_e.validate_source_snapshot_hashes(tampered, CHARACTER_ROOT)
        self.assertTrue(
            any("source_manifest" in error and "actual=" in error for error in errors),
            errors,
        )

    def test_final_validation_requires_transcript_root(self) -> None:
        audit = gate_e.validate(CHARACTER_ROOT, DIST_ROOT)
        failures = {row["name"] for row in audit.failures}
        self.assertIn("frozen transcript evidence", failures)

    def test_schema_subset_enforces_gate_e_contract(self) -> None:
        self.assertEqual([], gate_e.validate_json_schema(self.results, self.schema))

        mutations = {
            "missing required root key": lambda value: value.pop("run_id"),
            "unexpected root key": lambda value: value.__setitem__("extra", True),
            "integer rejects float": lambda value: value.__setitem__(
                "schema_version", 1.0
            ),
            "run id pattern": lambda value: value.__setitem__("run_id", "Bad_Run"),
            "sha pattern": lambda value: value.__setitem__(
                "evaluated_manifest_sha256", "A" * 64
            ),
            "behavior value type": lambda value: value["behavior_sha256"].__setitem__(
                "SKILL.md", 1
            ),
            "exact transcript keys": lambda value: value["transcripts"].__setitem__(
                "extra", copy.deepcopy(value["transcripts"]["known_answers"])
            ),
            "transcript path pattern": lambda value: value["transcripts"][
                "known_answers"
            ].__setitem__("relative_path", "run-ok\\known-answers.md"),
            "integer rejects bool": lambda value: value["transcripts"][
                "known_answers"
            ].__setitem__("bytes", True),
            "score maximum": lambda value: value["scores"].__setitem__(
                "canon_accuracy", 26
            ),
            "exact score keys": lambda value: value["scores"].__setitem__(
                "extra", 0
            ),
            "threshold constant": lambda value: value["thresholds"].__setitem__(
                "total", 84
            ),
            "hard failure maximum": lambda value: value.__setitem__(
                "hard_failures", ["failure"]
            ),
            "verdict constant": lambda value: value.__setitem__("verdict", "FAIL"),
            "note item type": lambda value: value.__setitem__("evaluator_notes", [1]),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                candidate = copy.deepcopy(self.results)
                mutate(candidate)
                self.assertTrue(
                    gate_e.validate_json_schema(candidate, self.schema),
                    label,
                )

    def test_relative_path_rejects_windows_and_traversal_forms(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            valid = gate_e.validate_relative_transcript(
                root, "run-safe/transcript.md"
            )
            self.assertEqual(
                (root / "run-safe" / "transcript.md").resolve(),
                valid,
            )

            unsafe = (
                "C:/outside.md",
                "C:outside.md",
                "//server/share/outside.md",
                r"\\server\share\outside.md",
                r"run-safe\outside.md",
                "/absolute.md",
                "run-safe/../outside.md",
                "run-safe/./outside.md",
                "run-safe//outside.md",
                "run-safe/CON.md",
                "run-safe/com1.txt",
                "run-safe/name:stream.md",
                "run-safe/trailing.md.",
                "run-safe/trailing.md ",
            )
            for relative in unsafe:
                with self.subTest(relative=relative):
                    with self.assertRaises(ValueError):
                        gate_e.validate_relative_transcript(root, relative)

    def test_resolved_path_must_remain_contained(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / "root"
            outside = base / "outside"
            root.mkdir()
            outside.mkdir()
            link = root / "run-link"
            try:
                os.symlink(outside, link, target_is_directory=True)
            except (NotImplementedError, OSError):
                self.skipTest("directory symlinks are unavailable for this test user")
            with self.assertRaisesRegex(ValueError, "escapes"):
                gate_e.validate_relative_transcript(root, "run-link/transcript.md")

    def test_behavior_file_set_is_exact(self) -> None:
        candidate = copy.deepcopy(self.results)
        candidate["behavior_sha256"]["references/unscored.md"] = "0" * 64
        audit = self.validate_with_results(candidate)
        failures = {row["name"] for row in audit.failures}
        self.assertIn("evaluated behavior files", failures)

    def test_transcript_headers_pin_the_evaluated_manifest(self) -> None:
        candidate = copy.deepcopy(self.results)
        candidate["evaluated_manifest_sha256"] = "0" * 64
        audit = self.validate_with_results(candidate)
        failures = {row["name"] for row in audit.failures}
        self.assertIn("frozen transcript evidence", failures)
        self.assertIn("evaluated manifest provenance", failures)

    def test_evaluated_manifest_snapshot_is_cryptographically_verified(self) -> None:
        original_load_json = gate_e.load_json
        tampered = original_load_json(EVALUATED_MANIFEST_PATH)
        tampered["payload_sha256"] = "0" * 64

        def load_json(path: Path) -> object:
            if path == EVALUATED_MANIFEST_PATH:
                return copy.deepcopy(tampered)
            return original_load_json(path)

        with patch.object(gate_e, "load_json", side_effect=load_json):
            audit = gate_e.validate(CHARACTER_ROOT, DIST_ROOT, TRANSCRIPT_ROOT)
        failures = {row["name"] for row in audit.failures}
        self.assertIn("evaluated manifest provenance", failures)


if __name__ == "__main__":
    unittest.main()
