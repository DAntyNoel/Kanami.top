#!/usr/bin/env python3
"""Build, verify, install, and roll back deterministic Codex skill packages.

The package manifest intentionally does not hash itself.  Snapshot identifiers are
the SHA-256 of the exact manifest bytes, while ``payload_sha256`` covers the sorted
file records using ``path\0size\0sha256\n`` framing.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import ntpath
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import stat
import sys
import tempfile
from typing import Any, Iterable
import uuid


MANIFEST_NAME = "manifest.json"
MANIFEST_VERSION = 1
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
SKILL_NAME_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
REPARSE_POINT_FLAG = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x0400)
WINDOWS_INVALID_CHARS = frozenset('<>:"|?*')
WINDOWS_RESERVED_BASENAMES = frozenset(
    {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "CONIN$",
        "CONOUT$",
        *(f"COM{digit}" for digit in "123456789¹²³"),
        *(f"LPT{digit}" for digit in "123456789¹²³"),
    }
)


class PackageError(ValueError):
    """Raised when a package or filesystem operation is unsafe or invalid."""


@dataclass(frozen=True)
class VerifiedPackage:
    """A package that matched its manifest at verification time."""

    root: Path
    manifest: dict[str, Any]
    manifest_sha256: str

    @property
    def payload_sha256(self) -> str:
        return self.manifest["payload_sha256"]

    @property
    def skill_name(self) -> str:
        return self.manifest["skill_name"]


@dataclass(frozen=True)
class _DirectoryState:
    """Identity and verified contents of a directory at one point in time."""

    identity: tuple[int, int]
    package: VerifiedPackage | None = None
    must_be_empty: bool = False


@dataclass(frozen=True)
class _DeploymentOutcome:
    package: VerifiedPackage
    warnings: tuple[dict[str, str], ...] = ()


def _absolute(path: os.PathLike[str] | str) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _lexists(path: Path) -> bool:
    return os.path.lexists(os.fspath(path))


def _is_reparse(path: Path) -> bool:
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & REPARSE_POINT_FLAG
    )


def _assert_no_reparse_ancestors(path: Path, label: str) -> None:
    """Reject symlinks/junctions in the existing portion of an explicit path."""

    cursor = path
    while not _lexists(cursor):
        parent = cursor.parent
        if parent == cursor:
            break
        cursor = parent
    for candidate in (cursor, *cursor.parents):
        if _is_reparse(candidate):
            raise PackageError(f"{label} crosses a symlink or reparse point: {candidate}")


def _assert_directory(path: Path, label: str) -> None:
    if not _lexists(path):
        raise PackageError(f"{label} does not exist: {path}")
    if _is_reparse(path):
        raise PackageError(f"{label} is a symlink or reparse point: {path}")
    try:
        mode = os.lstat(path).st_mode
    except OSError as exc:
        raise PackageError(f"cannot inspect {label}: {path}: {exc}") from exc
    if not stat.S_ISDIR(mode):
        raise PackageError(f"{label} is not a directory: {path}")
    _assert_no_reparse_ancestors(path, label)


def _assert_regular_file(path: Path, label: str) -> None:
    if not _lexists(path):
        raise PackageError(f"{label} does not exist: {path}")
    if _is_reparse(path):
        raise PackageError(f"{label} is a symlink or reparse point: {path}")
    try:
        mode = os.lstat(path).st_mode
    except OSError as exc:
        raise PackageError(f"cannot inspect {label}: {path}: {exc}") from exc
    if not stat.S_ISREG(mode):
        raise PackageError(f"{label} is not a regular file: {path}")


def _validate_relative_path(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise PackageError("manifest file path must be a non-empty string")
    if "\x00" in value or "\\" in value:
        raise PackageError(f"manifest file path is not portable: {value!r}")

    posix_path = PurePosixPath(value)
    windows_path = PureWindowsPath(value)
    if (
        posix_path.is_absolute()
        or windows_path.is_absolute()
        or windows_path.drive
        or ntpath.isabs(value)
    ):
        raise PackageError(f"absolute manifest file path is forbidden: {value!r}")
    if any(part in {"", ".", ".."} for part in posix_path.parts):
        raise PackageError(f"non-normalized or traversing manifest path: {value!r}")
    for part in posix_path.parts:
        if (
            any(character in WINDOWS_INVALID_CHARS for character in part)
            or any(ord(character) < 32 or ord(character) == 127 for character in part)
            or part.endswith((" ", "."))
        ):
            raise PackageError(f"manifest file path is not Windows-safe: {value!r}")
        basename = part.split(".", 1)[0].upper()
        if basename in WINDOWS_RESERVED_BASENAMES:
            raise PackageError(
                f"manifest file path uses a reserved Windows device name: {value!r}"
            )
    if posix_path.as_posix() != value:
        raise PackageError(f"manifest file path is not normalized: {value!r}")
    if value.casefold() == MANIFEST_NAME.casefold():
        raise PackageError(f"manifest must not hash itself: {value!r}")
    return value


def _validate_windows_path_set(paths: Iterable[str]) -> None:
    """Reject collisions created by Windows case-insensitive component lookup."""

    files: set[tuple[str, ...]] = set()
    directories: set[tuple[str, ...]] = set()
    for path in paths:
        parts = tuple(part.casefold() for part in PurePosixPath(path).parts)
        if parts in files:
            raise PackageError(f"duplicate or case-colliding manifest path: {path!r}")
        if parts in directories:
            raise PackageError(
                f"manifest path collides with a directory on Windows: {path!r}"
            )
        for index in range(1, len(parts)):
            prefix = parts[:index]
            if prefix in files:
                raise PackageError(
                    "manifest file/directory paths collide on Windows: "
                    f"{path!r}"
                )
            directories.add(prefix)
        files.add(parts)


def _scan_payload_paths(root: Path) -> list[str]:
    """Enumerate regular payload files while rejecting every reparse point."""

    _assert_directory(root, "package root")
    paths: list[str] = []

    def visit(directory: Path, relative_parts: tuple[str, ...]) -> None:
        try:
            entries = sorted(os.scandir(directory), key=lambda entry: entry.name)
        except OSError as exc:
            raise PackageError(f"cannot enumerate package directory {directory}: {exc}") from exc

        for entry in entries:
            entry_path = Path(entry.path)
            relative = relative_parts + (entry.name,)
            portable = PurePosixPath(*relative).as_posix()
            if _is_reparse(entry_path):
                raise PackageError(
                    f"package contains a symlink or reparse point: {portable}"
                )
            try:
                mode = entry.stat(follow_symlinks=False).st_mode
            except OSError as exc:
                raise PackageError(f"cannot inspect package entry {portable}: {exc}") from exc
            if len(relative) == 1 and entry.name.casefold() == MANIFEST_NAME.casefold():
                if entry.name != MANIFEST_NAME or not stat.S_ISREG(mode):
                    raise PackageError(
                        f"manifest must be one regular file named exactly {MANIFEST_NAME!r}"
                    )
                continue
            if stat.S_ISDIR(mode):
                visit(entry_path, relative)
            elif stat.S_ISREG(mode):
                paths.append(_validate_relative_path(portable))
            else:
                raise PackageError(f"package contains a non-regular entry: {portable}")

    visit(root, ())
    paths.sort()
    _validate_windows_path_set(paths)
    return paths


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _payload_hash(records: Iterable[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for record in records:
        digest.update(
            (
                f"{record['path']}\0{record['size']}\0{record['sha256']}\n"
            ).encode("utf-8")
        )
    return digest.hexdigest()


def _canonical_manifest_bytes(manifest: dict[str, Any]) -> bytes:
    return (
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")


def _load_json_without_duplicate_keys(raw: bytes, path: Path) -> dict[str, Any]:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise PackageError(f"duplicate JSON key in manifest: {key!r}")
            result[key] = value
        return result

    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicates)
    except UnicodeDecodeError as exc:
        raise PackageError(f"manifest is not UTF-8: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PackageError(f"invalid manifest JSON at {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PackageError("manifest root must be a JSON object")
    return value


def _validate_manifest_structure(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    required = {"manifest_version", "skill_name", "payload_sha256", "files"}
    if set(manifest) != required:
        missing = sorted(required - set(manifest))
        extra = sorted(set(manifest) - required)
        raise PackageError(f"manifest keys mismatch: missing={missing}, extra={extra}")
    version = manifest["manifest_version"]
    if (
        not isinstance(version, int)
        or isinstance(version, bool)
        or version != MANIFEST_VERSION
    ):
        raise PackageError(f"manifest_version must be integer {MANIFEST_VERSION}")

    skill_name = manifest["skill_name"]
    if not isinstance(skill_name, str) or SKILL_NAME_RE.fullmatch(skill_name) is None:
        raise PackageError("skill_name must use lowercase hyphen-case")
    if len(skill_name) > 64:
        raise PackageError("skill_name must not exceed 64 characters")

    declared_payload_hash = manifest["payload_sha256"]
    if not isinstance(declared_payload_hash, str) or SHA256_RE.fullmatch(
        declared_payload_hash
    ) is None:
        raise PackageError("payload_sha256 must be a lowercase SHA-256 digest")

    files = manifest["files"]
    if not isinstance(files, list) or not files:
        raise PackageError("manifest files must be a non-empty array")
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, record in enumerate(files):
        if not isinstance(record, dict) or set(record) != {"path", "size", "sha256"}:
            raise PackageError(
                f"manifest files[{index}] must contain only path, size, and sha256"
            )
        path = _validate_relative_path(record["path"])
        size = record["size"]
        checksum = record["sha256"]
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise PackageError(f"manifest files[{index}].size must be a non-negative integer")
        if not isinstance(checksum, str) or SHA256_RE.fullmatch(checksum) is None:
            raise PackageError(
                f"manifest files[{index}].sha256 must be a lowercase SHA-256 digest"
            )
        folded = path.casefold()
        if folded in seen:
            raise PackageError(f"duplicate or case-colliding manifest path: {path!r}")
        seen.add(folded)
        records.append({"path": path, "size": size, "sha256": checksum})

    if [record["path"] for record in records] != sorted(
        record["path"] for record in records
    ):
        raise PackageError("manifest files must be sorted by path")
    _validate_windows_path_set(record["path"] for record in records)
    if _payload_hash(records) != declared_payload_hash:
        raise PackageError("payload_sha256 does not match the manifest file records")
    return records


def _atomic_write(path: Path, content: bytes) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        if _lexists(temporary):
            temporary.unlink()
        raise


def build_manifest(
    source: os.PathLike[str] | str, skill_name: str | None = None
) -> VerifiedPackage:
    """Build ``manifest.json`` deterministically and verify the result."""

    root = _absolute(source)
    paths = _scan_payload_paths(root)
    if not paths:
        raise PackageError("cannot build a skill manifest without payload files")
    effective_name = skill_name if skill_name is not None else root.name
    if not isinstance(effective_name, str) or SKILL_NAME_RE.fullmatch(effective_name) is None:
        raise PackageError("skill name must use lowercase hyphen-case")
    if len(effective_name) > 64:
        raise PackageError("skill name must not exceed 64 characters")

    records: list[dict[str, Any]] = []
    for portable in paths:
        path = root.joinpath(*PurePosixPath(portable).parts)
        _assert_regular_file(path, f"payload file {portable}")
        records.append(
            {
                "path": portable,
                "size": os.lstat(path).st_size,
                "sha256": _sha256_file(path),
            }
        )
    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "skill_name": effective_name,
        "payload_sha256": _payload_hash(records),
        "files": records,
    }
    _atomic_write(root / MANIFEST_NAME, _canonical_manifest_bytes(manifest))
    return verify_package(root)


def verify_package(source: os.PathLike[str] | str) -> VerifiedPackage:
    """Verify structure, exact file set, sizes, checksums, and payload digest."""

    root = _absolute(source)
    _assert_directory(root, "package root")
    manifest_path = root / MANIFEST_NAME
    _assert_regular_file(manifest_path, "manifest")
    raw_manifest = manifest_path.read_bytes()
    manifest = _load_json_without_duplicate_keys(raw_manifest, manifest_path)
    records = _validate_manifest_structure(manifest)

    actual_paths = _scan_payload_paths(root)
    expected_paths = [record["path"] for record in records]
    if actual_paths != expected_paths:
        missing = sorted(set(expected_paths) - set(actual_paths))
        extra = sorted(set(actual_paths) - set(expected_paths))
        raise PackageError(f"package file set mismatch: missing={missing}, extra={extra}")

    for record in records:
        portable = record["path"]
        path = root.joinpath(*PurePosixPath(portable).parts)
        _assert_regular_file(path, f"payload file {portable}")
        actual_size = os.lstat(path).st_size
        if actual_size != record["size"]:
            raise PackageError(
                f"payload size mismatch for {portable}: expected {record['size']}, got {actual_size}"
            )
        actual_hash = _sha256_file(path)
        if actual_hash != record["sha256"]:
            raise PackageError(
                f"payload hash mismatch for {portable}: expected {record['sha256']}, got {actual_hash}"
            )

    return VerifiedPackage(
        root=root,
        manifest=manifest,
        manifest_sha256=hashlib.sha256(raw_manifest).hexdigest(),
    )


def _is_within(path: Path, parent: Path) -> bool:
    try:
        common = os.path.commonpath((os.fspath(path), os.fspath(parent)))
    except ValueError:
        return False
    return os.path.normcase(common) == os.path.normcase(os.fspath(parent))


def _nearest_existing(path: Path) -> tuple[Path, tuple[str, ...]]:
    missing: list[str] = []
    cursor = path
    while not _lexists(cursor):
        parent = cursor.parent
        if parent == cursor:
            break
        missing.append(cursor.name)
        cursor = parent
    return cursor, tuple(reversed(missing))


def _filesystem_identity(path: Path, *, follow_symlinks: bool = False) -> tuple[int, int]:
    try:
        info = os.stat(path, follow_symlinks=follow_symlinks)
    except OSError as exc:
        raise PackageError(f"cannot inspect filesystem identity for {path}: {exc}") from exc
    return info.st_dev, info.st_ino


def _canonical_comparison_path(path: Path) -> Path:
    anchor, missing = _nearest_existing(path)
    try:
        resolved = Path(os.path.realpath(anchor))
    except OSError as exc:
        raise PackageError(f"cannot canonicalize path {path}: {exc}") from exc
    return resolved.joinpath(*missing)


def _physical_key(path: Path) -> tuple[tuple[int, int], tuple[str, ...]]:
    anchor, missing = _nearest_existing(path)
    return (
        _filesystem_identity(anchor, follow_symlinks=True),
        tuple(part.casefold() for part in missing),
    )


def _physically_within(path: Path, parent: Path) -> bool:
    canonical_path = _canonical_comparison_path(path)
    canonical_parent = _canonical_comparison_path(parent)
    if _is_within(canonical_path, canonical_parent):
        return True

    path_key = _physical_key(path)
    parent_key = _physical_key(parent)
    if path_key[0] == parent_key[0] and path_key[1][: len(parent_key[1])] == parent_key[1]:
        return True

    if _lexists(parent):
        parent_identity = _filesystem_identity(parent, follow_symlinks=True)
        cursor, _ = _nearest_existing(path)
        for candidate in (cursor, *cursor.parents):
            if _filesystem_identity(candidate, follow_symlinks=True) == parent_identity:
                return True
    return False


def _assert_disjoint(first: Path, first_label: str, second: Path, second_label: str) -> None:
    if _physically_within(first, second) or _physically_within(second, first):
        raise PackageError(
            f"{first_label} and {second_label} must not overlap: {first}, {second}"
        )


def _prepare_backup_root(backup_root: Path, *, create: bool) -> None:
    _assert_no_reparse_ancestors(backup_root, "backup root")
    if not _lexists(backup_root):
        if not create:
            raise PackageError(f"backup root does not exist: {backup_root}")
        backup_root.mkdir(parents=True, exist_ok=False)
    _assert_directory(backup_root, "backup root")


def _copy_verified_package(package: VerifiedPackage, destination: Path) -> None:
    _assert_directory(destination, "staging directory")
    with os.scandir(destination) as entries:
        is_empty = next(entries, None) is None
    if not is_empty:
        raise PackageError(f"staging directory is not empty: {destination}")

    for record in package.manifest["files"]:
        portable = record["path"]
        source_path = package.root.joinpath(*PurePosixPath(portable).parts)
        _assert_regular_file(source_path, f"payload file {portable}")
        destination_path = destination.joinpath(*PurePosixPath(portable).parts)
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, destination_path, follow_symlinks=False)
    shutil.copyfile(
        package.root / MANIFEST_NAME,
        destination / MANIFEST_NAME,
        follow_symlinks=False,
    )


def _remove_owned_tree(path: Path, parent: Path, prefix: str) -> None:
    if not _lexists(path):
        return
    if path.parent != parent or not path.name.startswith(prefix):
        raise PackageError(f"refusing to remove an unowned path: {path}")
    if _is_reparse(path):
        raise PackageError(f"refusing to remove reparse point: {path}")
    shutil.rmtree(path)


def _ensure_snapshot(package: VerifiedPackage, backup_root: Path) -> VerifiedPackage:
    snapshot_id = package.manifest_sha256
    snapshot = backup_root / snapshot_id
    if _lexists(snapshot):
        verified = verify_package(snapshot)
        if verified.manifest_sha256 != snapshot_id:
            raise PackageError(f"snapshot directory/hash mismatch: {snapshot}")
        if verified.manifest_sha256 != package.manifest_sha256:
            raise PackageError(f"snapshot ID collision: {snapshot_id}")
        return verified

    prefix = f".{snapshot_id}.staging-"
    staging = Path(tempfile.mkdtemp(prefix=prefix, dir=backup_root))
    try:
        _copy_verified_package(package, staging)
        verified = verify_package(staging)
        if verified.manifest_sha256 != snapshot_id:
            raise PackageError("staged snapshot manifest changed during copy")
        try:
            staging.rename(snapshot)
        except FileExistsError:
            # A concurrent writer may have created the same content-addressed snapshot.
            existing = verify_package(snapshot)
            if existing.manifest_sha256 != snapshot_id:
                raise PackageError(f"concurrent snapshot mismatch: {snapshot}")
        return verify_package(snapshot)
    finally:
        _remove_owned_tree(staging, backup_root, prefix)


def _validate_target(target: Path) -> None:
    if target == Path(target.anchor):
        raise PackageError(f"target must not be a filesystem root: {target}")
    _assert_directory(target.parent, "target parent")
    if _lexists(target) and _is_reparse(target):
        raise PackageError(f"target is a symlink or reparse point: {target}")
    if _lexists(target) and not stat.S_ISDIR(os.lstat(target).st_mode):
        raise PackageError(f"target is not a directory: {target}")


def _acquire_file_lock(descriptor: int) -> None:
    try:
        if os.name == "nt":
            import msvcrt

            os.lseek(descriptor, 0, os.SEEK_SET)
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        raise PackageError("another package operation already holds the target lock") from exc


def _release_file_lock(descriptor: int) -> None:
    if os.name == "nt":
        import msvcrt

        os.lseek(descriptor, 0, os.SEEK_SET)
        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(descriptor, fcntl.LOCK_UN)


@contextmanager
def _target_operation_lock(target: Path) -> Iterable[Path]:
    """Serialize cooperative install/rollback operations for one exact target."""

    _validate_target(target)
    lock_path = target.parent / f".{target.name}.package.lock"
    _assert_no_reparse_ancestors(lock_path, "target lock")
    flags = os.O_RDWR | os.O_CREAT
    flags |= getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOINHERIT", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as exc:
        raise PackageError(f"cannot open target lock {lock_path}: {exc}") from exc
    acquired = False
    try:
        if _is_reparse(lock_path):
            raise PackageError(f"target lock is a symlink or reparse point: {lock_path}")
        path_info = os.lstat(lock_path)
        descriptor_info = os.fstat(descriptor)
        if not stat.S_ISREG(path_info.st_mode) or (
            path_info.st_dev,
            path_info.st_ino,
        ) != (descriptor_info.st_dev, descriptor_info.st_ino):
            raise PackageError(f"target lock changed while it was opened: {lock_path}")
        if path_info.st_nlink != 1:
            raise PackageError(f"target lock must not be hard-linked: {lock_path}")
        _acquire_file_lock(descriptor)
        acquired = True
        if _is_reparse(lock_path) or _filesystem_identity(lock_path) != (
            descriptor_info.st_dev,
            descriptor_info.st_ino,
        ):
            raise PackageError(f"target lock changed while it was acquired: {lock_path}")
        yield lock_path
    finally:
        if acquired:
            _release_file_lock(descriptor)
        os.close(descriptor)


def _directory_identity(path: Path) -> tuple[int, int]:
    if _is_reparse(path):
        raise PackageError(f"directory is a symlink or reparse point: {path}")
    identity = _filesystem_identity(path)
    if not stat.S_ISDIR(os.lstat(path).st_mode):
        raise PackageError(f"path is not a directory: {path}")
    return identity


def _capture_package_state(target: Path, label: str) -> _DirectoryState:
    _validate_target(target)
    before = _directory_identity(target)
    package = verify_package(target)
    after = _directory_identity(target)
    if before != after:
        raise PackageError(f"{label} changed identity during verification: {target}")
    return _DirectoryState(identity=before, package=package)


def _capture_empty_state(target: Path, label: str) -> _DirectoryState:
    _validate_target(target)
    before = _directory_identity(target)
    with os.scandir(target) as entries:
        if next(entries, None) is not None:
            raise PackageError(f"{label} is no longer empty: {target}")
    after = _directory_identity(target)
    if before != after:
        raise PackageError(f"{label} changed identity during verification: {target}")
    return _DirectoryState(identity=before, must_be_empty=True)


def _assert_directory_state(path: Path, expected: _DirectoryState, label: str) -> None:
    if not _lexists(path):
        raise PackageError(f"{label} disappeared: {path}")
    before = _directory_identity(path)
    if before != expected.identity:
        raise PackageError(f"{label} changed identity concurrently: {path}")
    if expected.package is not None:
        verified = verify_package(path)
        if verified.manifest_sha256 != expected.package.manifest_sha256:
            raise PackageError(f"{label} changed contents concurrently: {path}")
    elif expected.must_be_empty:
        with os.scandir(path) as entries:
            if next(entries, None) is not None:
                raise PackageError(f"{label} changed contents concurrently: {path}")
    else:  # pragma: no cover - all states have package contents or are reservations.
        raise AssertionError("directory state has no verification contract")
    if _directory_identity(path) != expected.identity:
        raise PackageError(f"{label} changed identity concurrently: {path}")


def _restore_previous(
    previous: Path,
    target: Path,
    state: _DirectoryState,
    *,
    original_was_absent: bool,
) -> None:
    """Best-effort restoration that never deletes suspicious concurrent data."""

    if _lexists(target):
        raise PackageError(f"cannot restore previous target because target reappeared: {target}")
    previous.rename(target)
    if not original_was_absent:
        return
    try:
        _assert_directory_state(target, state, "target reservation")
        target.rmdir()
    except (PackageError, OSError):
        # A writer touched the reservation.  Preserve it at the explicit target.
        return


def _cleanup_warning(path: Path, exc: BaseException) -> dict[str, str]:
    return {
        "code": "previous_cleanup_failed",
        "path": str(path),
        "message": str(exc),
    }


def _deploy_verified(
    package: VerifiedPackage,
    target: Path,
    expected_current: _DirectoryState | None,
) -> _DeploymentOutcome:
    """Copy to same-volume staging, verify, then switch directory names."""

    _validate_target(target)
    parent = target.parent
    staging_prefix = f".{target.name}.staging-"
    staging = Path(tempfile.mkdtemp(prefix=staging_prefix, dir=parent))
    previous: Path | None = None
    previous_prefix = f".{target.name}.previous-"
    original_was_absent = expected_current is None
    switch_state = expected_current
    warnings: list[dict[str, str]] = []
    try:
        _copy_verified_package(package, staging)
        staged = verify_package(staging)
        if staged.manifest_sha256 != package.manifest_sha256:
            raise PackageError("staged install manifest changed during copy")
        staged_identity = _directory_identity(staging)

        if expected_current is None:
            if _lexists(target):
                raise PackageError(f"target appeared concurrently before install: {target}")
            try:
                target.mkdir(parents=False, exist_ok=False)
            except FileExistsError as exc:
                raise PackageError(
                    f"target appeared concurrently before install: {target}"
                ) from exc
            switch_state = _capture_empty_state(target, "target reservation")
        else:
            _assert_directory_state(target, expected_current, "current target")

        assert switch_state is not None
        previous = parent / f"{previous_prefix}{uuid.uuid4().hex}"
        target.rename(previous)
        try:
            _assert_directory_state(previous, switch_state, "renamed previous target")
        except BaseException as verification_error:
            try:
                _restore_previous(
                    previous,
                    target,
                    switch_state,
                    original_was_absent=original_was_absent,
                )
                previous = None
            except BaseException as restore_error:
                raise PackageError(
                    "previous target changed during the switch and could not be restored: "
                    f"verify={verification_error!r}, restore={restore_error!r}"
                ) from restore_error
            raise

        try:
            staging.rename(target)
        except BaseException as install_error:
            try:
                _restore_previous(
                    previous,
                    target,
                    switch_state,
                    original_was_absent=original_was_absent,
                )
                previous = None
            except BaseException as restore_error:
                raise PackageError(
                    "install switch failed and the previous target could not be restored: "
                    f"install={install_error!r}, restore={restore_error!r}"
                ) from restore_error
            raise

        try:
            installed_state = _DirectoryState(identity=staged_identity, package=staged)
            _assert_directory_state(target, installed_state, "installed target")
            installed = verify_package(target)
        except BaseException as verification_error:
            # Only recycle the new directory through staging if a second exact
            # verification proves it is still our payload.  Otherwise quarantine
            # it: concurrent data and reparses must never be recursively deleted.
            failed_target: Path | None = None
            try:
                try:
                    _assert_directory_state(
                        target, installed_state, "installed target recovery"
                    )
                except (PackageError, OSError):
                    failed_target = parent / (
                        f".{target.name}.failed-{uuid.uuid4().hex}"
                    )
                    target.rename(failed_target)
                else:
                    target.rename(staging)
                _restore_previous(
                    previous,
                    target,
                    switch_state,
                    original_was_absent=original_was_absent,
                )
                previous = None
            except BaseException as restore_error:
                raise PackageError(
                    "post-switch verification failed and the previous target state "
                    f"could not be restored: verify={verification_error!r}, "
                    f"restore={restore_error!r}"
                ) from restore_error
            if failed_target is not None:
                raise PackageError(
                    "post-switch verification failed; suspicious installed target "
                    f"was preserved at {failed_target}: {verification_error!r}"
                ) from verification_error
            raise

        try:
            _assert_directory_state(previous, switch_state, "previous target cleanup")
            _remove_owned_tree(previous, parent, previous_prefix)
        except (PackageError, OSError) as cleanup_error:
            warnings.append(_cleanup_warning(previous, cleanup_error))
        finally:
            previous = None
        return _DeploymentOutcome(package=installed, warnings=tuple(warnings))
    finally:
        try:
            _remove_owned_tree(staging, parent, staging_prefix)
        except (PackageError, OSError):
            # Never follow or delete a suspicious replacement.  Failed operations
            # already report their primary error; successful switches moved staging.
            pass
        if previous is not None and _lexists(previous):
            # Do not delete the old target after an unexpected post-switch failure.
            # It remains beside the explicit target and its verified snapshot is intact.
            pass


def _result(action: str, package: VerifiedPackage, **extra: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "action": action,
        "skill_name": package.skill_name,
        "manifest_sha256": package.manifest_sha256,
        "payload_sha256": package.payload_sha256,
    }
    result.update(extra)
    return result


def install_package(
    source: os.PathLike[str] | str,
    target: os.PathLike[str] | str,
    backup_root: os.PathLike[str] | str,
) -> dict[str, Any]:
    """Install a verified package and retain content-addressed rollback snapshots."""

    source_path = _absolute(source)
    target_path = _absolute(target)
    backup_path = _absolute(backup_root)
    _assert_disjoint(source_path, "source", target_path, "target")
    _assert_disjoint(source_path, "source", backup_path, "backup root")
    _assert_disjoint(target_path, "target", backup_path, "backup root")
    _validate_target(target_path)

    incoming = verify_package(source_path)
    with _target_operation_lock(target_path):
        _assert_disjoint(source_path, "source", target_path, "target")
        _assert_disjoint(source_path, "source", backup_path, "backup root")
        _assert_disjoint(target_path, "target", backup_path, "backup root")
        _prepare_backup_root(backup_path, create=True)
        current_state: _DirectoryState | None = None
        if _lexists(target_path):
            current_state = _capture_package_state(target_path, "current target")
            assert current_state.package is not None
            _ensure_snapshot(current_state.package, backup_path)
        incoming_snapshot = _ensure_snapshot(incoming, backup_path)
        deployed = _deploy_verified(incoming_snapshot, target_path, current_state)
    return _result(
        "install",
        deployed.package,
        target=str(target_path),
        backup_root=str(backup_path),
        snapshot_id=incoming_snapshot.manifest_sha256,
        warnings=list(deployed.warnings),
    )


def rollback_package(
    snapshot_id: str,
    target: os.PathLike[str] | str,
    backup_root: os.PathLike[str] | str,
) -> dict[str, Any]:
    """Restore exactly one verified snapshot without accepting aliases or prefixes."""

    if not isinstance(snapshot_id, str) or SHA256_RE.fullmatch(snapshot_id) is None:
        raise PackageError("snapshot_id must be an exact lowercase 64-character SHA-256")
    target_path = _absolute(target)
    backup_path = _absolute(backup_root)
    _assert_disjoint(target_path, "target", backup_path, "backup root")
    _validate_target(target_path)
    with _target_operation_lock(target_path):
        _assert_disjoint(target_path, "target", backup_path, "backup root")
        _prepare_backup_root(backup_path, create=False)

        snapshot_path = backup_path / snapshot_id
        # Verify the requested snapshot before inspecting or changing the target.
        snapshot = verify_package(snapshot_path)
        if snapshot.manifest_sha256 != snapshot_id:
            raise PackageError(
                f"snapshot ID does not match its manifest: requested={snapshot_id}, "
                f"actual={snapshot.manifest_sha256}"
            )

        current_state: _DirectoryState | None = None
        if _lexists(target_path):
            current_state = _capture_package_state(target_path, "current target")
            assert current_state.package is not None
            _ensure_snapshot(current_state.package, backup_path)
        deployed = _deploy_verified(snapshot, target_path, current_state)
    return _result(
        "rollback",
        deployed.package,
        target=str(target_path),
        backup_root=str(backup_path),
        snapshot_id=snapshot_id,
        warnings=list(deployed.warnings),
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build and safely deploy deterministic Codex skill packages"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build-manifest", help="write and verify manifest.json")
    build.add_argument("--source", type=Path, required=True)
    build.add_argument("--skill-name")

    verify = subparsers.add_parser("verify", help="verify a package exactly")
    verify.add_argument("--source", type=Path, required=True)

    install = subparsers.add_parser("install", help="install a verified package")
    install.add_argument("--source", type=Path, required=True)
    install.add_argument("--target", type=Path, required=True)
    install.add_argument("--backup-root", type=Path, required=True)

    rollback = subparsers.add_parser("rollback", help="restore an exact snapshot ID")
    rollback.add_argument("--snapshot-id", required=True)
    rollback.add_argument("--target", type=Path, required=True)
    rollback.add_argument("--backup-root", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "build-manifest":
            package = build_manifest(args.source, args.skill_name)
            result = _result("build-manifest", package, source=str(package.root))
        elif args.command == "verify":
            package = verify_package(args.source)
            result = _result("verify", package, source=str(package.root))
        elif args.command == "install":
            result = install_package(args.source, args.target, args.backup_root)
        elif args.command == "rollback":
            result = rollback_package(args.snapshot_id, args.target, args.backup_root)
        else:  # pragma: no cover - argparse enforces the command set.
            raise AssertionError(f"unexpected command: {args.command}")
    except (PackageError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
