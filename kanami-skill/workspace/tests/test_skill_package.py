from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

import skill_package  # noqa: E402
from skill_package import (  # noqa: E402
    PackageError,
    build_manifest,
    install_package,
    rollback_package,
    verify_package,
)


class SkillPackageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def make_package(self, name: str, marker: str) -> Path:
        package = self.root / name
        (package / "references").mkdir(parents=True)
        (package / "SKILL.md").write_text(
            f"---\nname: celebrity-kanami\ndescription: {marker}\n---\n",
            encoding="utf-8",
        )
        (package / "references" / "persona.md").write_text(
            f"persona={marker}\n", encoding="utf-8"
        )
        return package

    def test_build_is_deterministic_sorted_and_does_not_self_hash(self) -> None:
        package = self.make_package("v1", "one")
        first = build_manifest(package, "celebrity-kanami")
        manifest_bytes = (package / "manifest.json").read_bytes()
        manifest = json.loads(manifest_bytes)

        self.assertEqual(
            ["SKILL.md", "references/persona.md"],
            [record["path"] for record in manifest["files"]],
        )
        self.assertNotIn("manifest.json", [record["path"] for record in manifest["files"]])
        framed = "".join(
            f"{record['path']}\0{record['size']}\0{record['sha256']}\n"
            for record in manifest["files"]
        ).encode("utf-8")
        self.assertEqual(hashlib.sha256(framed).hexdigest(), manifest["payload_sha256"])
        self.assertEqual(hashlib.sha256(manifest_bytes).hexdigest(), first.manifest_sha256)

        second = build_manifest(package, "celebrity-kanami")
        self.assertEqual(manifest_bytes, (package / "manifest.json").read_bytes())
        self.assertEqual(first.manifest_sha256, second.manifest_sha256)

    def test_verify_rejects_tampering_and_extra_files(self) -> None:
        tampered = self.make_package("tampered", "original")
        build_manifest(tampered, "celebrity-kanami")
        (tampered / "SKILL.md").write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(PackageError, "mismatch"):
            verify_package(tampered)

        extra = self.make_package("extra", "original")
        build_manifest(extra, "celebrity-kanami")
        (extra / "unexpected.txt").write_text("not listed\n", encoding="utf-8")
        with self.assertRaisesRegex(PackageError, "file set mismatch"):
            verify_package(extra)

    def test_verify_rejects_traversal_and_bad_payload_hash(self) -> None:
        traversal = self.make_package("traversal", "one")
        build_manifest(traversal, "celebrity-kanami")
        manifest_path = traversal / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"][0]["path"] = "../outside.txt"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(PackageError, "traversing"):
            verify_package(traversal)

        absolute = self.make_package("absolute", "one")
        build_manifest(absolute, "celebrity-kanami")
        manifest_path = absolute / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["files"][0]["path"] = "C:/outside.txt"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(PackageError, "absolute"):
            verify_package(absolute)

        bad_hash = self.make_package("bad-hash", "one")
        build_manifest(bad_hash, "celebrity-kanami")
        manifest_path = bad_hash / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["payload_sha256"] = "0" * 64
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(PackageError, "payload_sha256"):
            verify_package(bad_hash)

        bad_version = self.make_package("bad-version", "one")
        build_manifest(bad_version, "celebrity-kanami")
        manifest_path = bad_version / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["manifest_version"] = 1.0
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(PackageError, "must be integer"):
            verify_package(bad_version)

    def test_build_rejects_symlink_when_supported(self) -> None:
        package = self.make_package("linked", "one")
        outside = self.root / "outside.txt"
        outside.write_text("outside\n", encoding="utf-8")
        try:
            os.symlink(outside, package / "linked.txt")
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation is unavailable for this test user")
        with self.assertRaisesRegex(PackageError, "symlink or reparse"):
            build_manifest(package, "celebrity-kanami")

    def test_install_v1_v2_and_exact_rollback(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        v1_verified = build_manifest(v1, "celebrity-kanami")
        v2_verified = build_manifest(v2, "celebrity-kanami")
        target = self.root / "installed" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"

        first = install_package(v1, target, backups)
        self.assertEqual(v1_verified.manifest_sha256, first["snapshot_id"])
        self.assertTrue((backups / v1_verified.manifest_sha256).is_dir())
        self.assertEqual(v1_verified.manifest_sha256, verify_package(target).manifest_sha256)

        second = install_package(v2, target, backups)
        self.assertEqual(v2_verified.manifest_sha256, second["snapshot_id"])
        self.assertTrue((backups / v2_verified.manifest_sha256).is_dir())
        self.assertEqual(v2_verified.manifest_sha256, verify_package(target).manifest_sha256)

        rolled_back = rollback_package(v1_verified.manifest_sha256, target, backups)
        self.assertEqual(v1_verified.manifest_sha256, rolled_back["snapshot_id"])
        self.assertEqual(v1_verified.manifest_sha256, verify_package(target).manifest_sha256)
        self.assertIn("description: one", (target / "SKILL.md").read_text(encoding="utf-8"))

    def test_failed_install_preserves_current_target(self) -> None:
        v1 = self.make_package("v1", "one")
        broken_v2 = self.make_package("v2", "two")
        v1_verified = build_manifest(v1, "celebrity-kanami")
        build_manifest(broken_v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)

        (broken_v2 / "SKILL.md").write_text("tampered\n", encoding="utf-8")
        with self.assertRaises(PackageError):
            install_package(broken_v2, target, backups)
        self.assertEqual(v1_verified.manifest_sha256, verify_package(target).manifest_sha256)

    def test_post_switch_verification_failure_restores_previous_target(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        v1_verified = build_manifest(v1, "celebrity-kanami")
        build_manifest(v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)

        original_verify = verify_package
        target_verifications = 0

        def fail_second_target_verification(source: object):
            nonlocal target_verifications
            if Path(source) == target:
                target_verifications += 1
                if target_verifications == 2:
                    raise PackageError("injected post-switch verification failure")
            return original_verify(source)

        with patch(
            "skill_package.verify_package",
            side_effect=fail_second_target_verification,
        ):
            with self.assertRaisesRegex(PackageError, "injected post-switch"):
                install_package(v2, target, backups)

        self.assertEqual(v1_verified.manifest_sha256, verify_package(target).manifest_sha256)
        leftovers = [
            child.name
            for child in target.parent.iterdir()
            if child.name.startswith(".celebrity-kanami.staging-")
            or child.name.startswith(".celebrity-kanami.previous-")
        ]
        self.assertEqual([], leftovers)

    def test_cleanup_failure_after_commit_returns_warning_and_preserves_previous(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        v1_verified = build_manifest(v1, "celebrity-kanami")
        v2_verified = build_manifest(v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)

        original_remove = skill_package._remove_owned_tree

        def fail_previous_cleanup(path: Path, parent: Path, prefix: str) -> None:
            if ".previous-" in path.name:
                raise PermissionError("simulated Windows file lock")
            original_remove(path, parent, prefix)

        with patch(
            "skill_package._remove_owned_tree", side_effect=fail_previous_cleanup
        ):
            result = install_package(v2, target, backups)

        self.assertEqual(v2_verified.manifest_sha256, verify_package(target).manifest_sha256)
        self.assertEqual("previous_cleanup_failed", result["warnings"][0]["code"])
        previous = Path(result["warnings"][0]["path"])
        self.assertTrue(previous.is_dir())
        self.assertEqual(v1_verified.manifest_sha256, verify_package(previous).manifest_sha256)

    def test_concurrent_target_mutation_before_switch_is_preserved(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        build_manifest(v1, "celebrity-kanami")
        build_manifest(v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)
        original_copy = skill_package._copy_verified_package
        mutated = False

        def mutate_after_staging(package: object, destination: Path) -> None:
            nonlocal mutated
            original_copy(package, destination)
            if destination.parent == target.parent and not mutated:
                (target / "late.txt").write_text("preserve me\n", encoding="utf-8")
                mutated = True

        with patch(
            "skill_package._copy_verified_package", side_effect=mutate_after_staging
        ):
            with self.assertRaises(PackageError):
                install_package(v2, target, backups)

        self.assertEqual("preserve me\n", (target / "late.txt").read_text(encoding="utf-8"))
        self.assertIn("description: one", (target / "SKILL.md").read_text(encoding="utf-8"))

    def test_mutation_during_target_rename_is_detected_and_restored(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        build_manifest(v1, "celebrity-kanami")
        build_manifest(v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)
        original_rename = Path.rename
        mutated = False

        def mutate_then_rename(path: Path, destination: object) -> Path:
            nonlocal mutated
            destination_path = Path(destination)
            if (
                path == target
                and destination_path.name.startswith(".celebrity-kanami.previous-")
                and not mutated
            ):
                (path / "late.txt").write_text("during rename\n", encoding="utf-8")
                mutated = True
            return original_rename(path, destination)

        with patch.object(Path, "rename", new=mutate_then_rename):
            with self.assertRaises(PackageError):
                install_package(v2, target, backups)

        self.assertEqual("during rename\n", (target / "late.txt").read_text(encoding="utf-8"))
        self.assertIn("description: one", (target / "SKILL.md").read_text(encoding="utf-8"))

    def test_post_switch_mutation_is_quarantined_instead_of_deleted(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        v1_verified = build_manifest(v1, "celebrity-kanami")
        build_manifest(v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)
        original_verify = verify_package
        mutated = False

        def mutate_new_target(source: object):
            nonlocal mutated
            source_path = Path(source)
            if source_path == target and not mutated and (target / "SKILL.md").exists():
                text = (target / "SKILL.md").read_text(encoding="utf-8")
                if "description: two" in text:
                    (target / "late.txt").write_text(
                        "after switch\n", encoding="utf-8"
                    )
                    mutated = True
            return original_verify(source)

        with patch("skill_package.verify_package", side_effect=mutate_new_target):
            with self.assertRaisesRegex(PackageError, "was preserved"):
                install_package(v2, target, backups)

        self.assertEqual(v1_verified.manifest_sha256, verify_package(target).manifest_sha256)
        quarantined = [
            child
            for child in target.parent.iterdir()
            if child.name.startswith(".celebrity-kanami.failed-")
        ]
        self.assertEqual(1, len(quarantined))
        self.assertEqual(
            "after switch\n",
            (quarantined[0] / "late.txt").read_text(encoding="utf-8"),
        )

    def test_concurrent_target_appearance_is_rejected_and_preserved(self) -> None:
        package = self.make_package("v1", "one")
        build_manifest(package, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        original_copy = skill_package._copy_verified_package
        appeared = False

        def appear_after_staging(source: object, destination: Path) -> None:
            nonlocal appeared
            original_copy(source, destination)
            if destination.parent == target.parent and not appeared:
                target.mkdir()
                (target / "owner.txt").write_text("concurrent\n", encoding="utf-8")
                appeared = True

        with patch("skill_package._copy_verified_package", side_effect=appear_after_staging):
            with self.assertRaisesRegex(PackageError, "appeared concurrently"):
                install_package(package, target, backups)

        self.assertEqual("concurrent\n", (target / "owner.txt").read_text(encoding="utf-8"))

    def test_target_lock_contention_rejects_second_operation(self) -> None:
        package = self.make_package("v1", "one")
        verified = build_manifest(package, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"

        with skill_package._target_operation_lock(target):
            with self.assertRaisesRegex(PackageError, "holds the target lock"):
                install_package(package, target, backups)

        result = install_package(package, target, backups)
        self.assertEqual(verified.manifest_sha256, result["manifest_sha256"])
        self.assertEqual([], result["warnings"])

    def test_windows_unsafe_and_reserved_paths_are_rejected(self) -> None:
        unsafe = [
            "NUL",
            "con.txt",
            "folder/COM1.log",
            "folder/LPT¹.txt",
            "a?.txt",
            "a*.txt",
            'a"b.txt',
            "a<b.txt",
            "a>b.txt",
            "a|b.txt",
            "control\x01.txt",
            "trailing-space ",
            "trailing-dot.",
        ]
        for path in unsafe:
            with self.subTest(path=path):
                with self.assertRaisesRegex(PackageError, "Windows"):
                    skill_package._validate_relative_path(path)

        self.assertEqual(
            "references/persona.md",
            skill_package._validate_relative_path("references/persona.md"),
        )
        with self.assertRaisesRegex(PackageError, "collide"):
            skill_package._validate_windows_path_set(["A", "a/b.txt"])

    def test_reparse_target_lock_is_rejected_without_installing(self) -> None:
        package = self.make_package("v1", "one")
        build_manifest(package, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        lock_path = target.parent / ".celebrity-kanami.package.lock"
        original_is_reparse = skill_package._is_reparse

        def report_lock_as_reparse(path: Path) -> bool:
            return Path(path) == lock_path or original_is_reparse(path)

        with patch("skill_package._is_reparse", side_effect=report_lock_as_reparse):
            with self.assertRaisesRegex(PackageError, "reparse"):
                install_package(package, target, backups)

        self.assertFalse(target.exists())

    def test_tampered_snapshot_and_inexact_id_do_not_change_target(self) -> None:
        v1 = self.make_package("v1", "one")
        v2 = self.make_package("v2", "two")
        v1_verified = build_manifest(v1, "celebrity-kanami")
        v2_verified = build_manifest(v2, "celebrity-kanami")
        target = self.root / "target-parent" / "celebrity-kanami"
        target.parent.mkdir()
        backups = self.root / "backups"
        install_package(v1, target, backups)
        install_package(v2, target, backups)

        with self.assertRaisesRegex(PackageError, "exact lowercase"):
            rollback_package(v1_verified.manifest_sha256[:12], target, backups)
        self.assertEqual(v2_verified.manifest_sha256, verify_package(target).manifest_sha256)

        (backups / v1_verified.manifest_sha256 / "SKILL.md").write_text(
            "tampered snapshot\n", encoding="utf-8"
        )
        with self.assertRaises(PackageError):
            rollback_package(v1_verified.manifest_sha256, target, backups)
        self.assertEqual(v2_verified.manifest_sha256, verify_package(target).manifest_sha256)


if __name__ == "__main__":
    unittest.main()
