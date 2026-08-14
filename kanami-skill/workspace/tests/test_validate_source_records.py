from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

from validate_source_records import load_schema, validate_record  # noqa: E402


class SourceRecordValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = load_schema(
            WORKSPACE_ROOT / "schemas" / "source-record.schema.json"
        )

    def setUp(self) -> None:
        self.record = {
            "source_id": "SRC-TEST-01",
            "title": "测试材料",
            "url": "https://wiki.example.test/kanami/source-1",
            "local_paths": ["res/WIKI/oath_texts.json"],
            "publisher": "测试发布者",
            "published_at": None,
            "version": "unknown",
            "accessed_at": "2026-08-14",
            "material_type": "setting",
            "canon_context": "base",
            "context_router": {
                "primary": "public_idol",
                "secondary": None,
            },
            "language": "zh-CN",
            "timeline_phase": "unknown",
            "scene": "资料页",
            "dimensions": ["writings"],
            "characters_present": ["香奈美"],
            "counterparties": [],
            "evidence_summary": [],
            "short_quote": [],
            "timestamp": [],
            "inference": [],
            "conflicts": [],
            "status": "candidate",
            "canon_evidence": True,
        }

    def errors_for(self, **changes: object) -> list[str]:
        record = deepcopy(self.record)
        record.update(changes)
        return validate_record(record, self.schema)

    def test_valid_candidate(self) -> None:
        self.assertEqual([], validate_record(self.record, self.schema))

    def test_accepted_without_evidence_is_rejected(self) -> None:
        errors = self.errors_for(status="accepted")
        self.assertTrue(
            any("$.evidence_summary" in error and "minItems" in error for error in errors),
            errors,
        )

    def test_inspected_media_without_timestamp_is_rejected(self) -> None:
        errors = self.errors_for(
            status="inspected",
            material_type="pv",
            evidence_summary=["视频内容已经人工核验。"],
        )
        self.assertTrue(
            any("$.timestamp" in error and "minItems" in error for error in errors),
            errors,
        )

    def test_accepted_story_without_counterparty_is_rejected(self) -> None:
        errors = self.errors_for(
            status="accepted",
            material_type="story",
            evidence_summary=["剧情内容已经人工核验。"],
        )
        self.assertTrue(
            any("$.counterparties" in error and "minItems" in error for error in errors),
            errors,
        )

    def test_unreplaced_placeholder_is_rejected(self) -> None:
        errors = self.errors_for(title="REPLACE_WITH_MATERIAL_TITLE")
        self.assertTrue(
            any(
                "$.title" in error and "unreplaced template placeholder" in error
                for error in errors
            ),
            errors,
        )

    def test_url_without_host_is_rejected(self) -> None:
        errors = self.errors_for(url="https://")
        self.assertTrue(any("$.url" in error and "pattern" in error for error in errors), errors)

    def test_invalid_publication_date_is_rejected(self) -> None:
        errors = self.errors_for(published_at="not-a-date")
        self.assertTrue(any("$.published_at" in error and "ISO" in error for error in errors), errors)

    def test_local_path_traversal_is_rejected(self) -> None:
        errors = self.errors_for(local_paths=["../../../../Users/private.json"])
        self.assertTrue(any("$.local_paths[0]" in error and "pattern" in error for error in errors), errors)

    def test_invalid_timestamp_is_rejected(self) -> None:
        errors = self.errors_for(
            status="inspected",
            material_type="pv",
            evidence_summary=["视频内容已经人工核验。"],
            timestamp=["00:99"],
        )
        self.assertTrue(any("$.timestamp[0]" in error and "pattern" in error for error in errors), errors)

    def test_pledge_context_requires_intimate_router(self) -> None:
        errors = self.errors_for(canon_context="pledge")
        self.assertTrue(any("$.context_router.primary" in error and "enum" in error for error in errors), errors)

    def test_unknown_field_is_rejected(self) -> None:
        record = deepcopy(self.record)
        record["unexpected"] = "not allowed"
        errors = validate_record(record, self.schema)
        self.assertTrue(any("unknown properties" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
