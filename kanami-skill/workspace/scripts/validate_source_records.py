#!/usr/bin/env python3
"""Validate source-record JSON files without third-party packages."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import re
import sys
from typing import Any


def load_schema(path: Path) -> dict[str, Any]:
    schema = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(schema, dict):
        raise ValueError(f"schema must be a JSON object: {path}")
    return schema


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "null":
        return value is None
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    raise ValueError(f"unsupported schema type: {expected}")


def _validate_date(value: str) -> bool:
    if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value) is None:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def validate_instance(
    instance: Any, schema: dict[str, Any], path: str = "$"
) -> list[str]:
    """Validate the JSON-Schema subset used by source-record.schema.json."""

    errors: list[str] = []
    declared_types = schema.get("type")
    if declared_types is not None:
        expected_types = (
            [declared_types] if isinstance(declared_types, str) else declared_types
        )
        if not isinstance(expected_types, list) or not all(
            isinstance(item, str) for item in expected_types
        ):
            raise ValueError(f"invalid type declaration at {path}")
        if not any(_matches_type(instance, item) for item in expected_types):
            return [f"{path}: expected type {expected_types}"]

    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: value is not in enum {schema['enum']}")

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            errors.append(f"{path}: string is shorter than minLength")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errors.append(f"{path}: string is longer than maxLength")
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            errors.append(f"{path}: string does not match pattern {schema['pattern']}")
        if schema.get("format") == "date" and not _validate_date(instance):
            errors.append(f"{path}: expected an ISO calendar date (YYYY-MM-DD)")

    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            errors.append(f"{path}: array has fewer than minItems")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append(f"{path}: array has more than maxItems")
        if schema.get("uniqueItems"):
            canonical = [
                json.dumps(item, ensure_ascii=False, sort_keys=True) for item in instance
            ]
            if len(canonical) != len(set(canonical)):
                errors.append(f"{path}: array items must be unique")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(instance):
                errors.extend(validate_instance(item, item_schema, f"{path}[{index}]"))

    if isinstance(instance, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        for name in required:
            if name not in instance:
                errors.append(f"{path}: missing required property {name!r}")
        if schema.get("additionalProperties") is False:
            unknown = sorted(set(instance) - set(properties))
            if unknown:
                errors.append(f"{path}: unknown properties {unknown}")
        for name, value in instance.items():
            property_schema = properties.get(name)
            if isinstance(property_schema, dict):
                errors.extend(
                    validate_instance(value, property_schema, f"{path}.{name}")
                )

    for subschema in schema.get("allOf", []):
        errors.extend(validate_instance(instance, subschema, path))

    if "anyOf" in schema:
        matches = sum(
            not validate_instance(instance, subschema, path)
            for subschema in schema["anyOf"]
        )
        if matches == 0:
            errors.append(f"{path}: value does not match any anyOf branch")

    if "oneOf" in schema:
        matches = sum(
            not validate_instance(instance, subschema, path)
            for subschema in schema["oneOf"]
        )
        if matches != 1:
            errors.append(f"{path}: value must match exactly one oneOf branch")

    if_schema = schema.get("if")
    if isinstance(if_schema, dict):
        branch_name = "then" if not validate_instance(instance, if_schema, path) else "else"
        branch = schema.get(branch_name)
        if isinstance(branch, dict):
            errors.extend(validate_instance(instance, branch, path))

    return errors


def validate_record(record: Any, schema: dict[str, Any]) -> list[str]:
    errors = validate_instance(record, schema)

    def find_placeholders(value: Any, path: str) -> None:
        if isinstance(value, str) and "REPLACE" in value.upper():
            errors.append(f"{path}: unreplaced template placeholder")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                find_placeholders(item, f"{path}[{index}]")
        elif isinstance(value, dict):
            for name, item in value.items():
                find_placeholders(item, f"{path}.{name}")

    find_placeholders(record, "$")
    return errors


def validate_records_directory(
    records_dir: Path, schema: dict[str, Any]
) -> tuple[list[Path], list[str]]:
    if not records_dir.is_dir():
        return [], [f"{records_dir}: source-records directory does not exist"]

    record_paths = sorted(records_dir.glob("*.json"))
    if not record_paths:
        return [], [f"{records_dir}: no source-record JSON files found"]

    errors: list[str] = []
    source_id_paths: dict[str, Path] = {}
    for record_path in record_paths:
        try:
            record = json.loads(record_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            errors.append(f"{record_path}: cannot load JSON: {exc}")
            continue

        errors.extend(
            f"{record_path}: {error}" for error in validate_record(record, schema)
        )
        if isinstance(record, dict) and isinstance(record.get("source_id"), str):
            source_id = record["source_id"]
            previous = source_id_paths.get(source_id)
            if previous is not None:
                errors.append(
                    f"{record_path}: duplicate source_id {source_id!r}; first seen in {previous}"
                )
            else:
                source_id_paths[source_id] = record_path

    return record_paths, errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate source-records/*.json against the repository schema"
    )
    parser.add_argument(
        "records_dir",
        nargs="?",
        type=Path,
        default=Path("source-records"),
        help="Directory containing source-record JSON files",
    )
    parser.add_argument(
        "--schema",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "schemas"
        / "source-record.schema.json",
        help="Path to source-record.schema.json",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args()

    try:
        schema = load_schema(args.schema)
        record_paths, errors = validate_records_directory(args.records_dir, schema)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        record_paths, errors = [], [str(exc)]

    if args.json:
        print(
            json.dumps(
                {
                    "status": "PASS" if not errors else "FAIL",
                    "files": [str(path) for path in record_paths],
                    "errors": errors,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        for error in errors:
            print(f"[FAIL] {error}")
        print(
            f"source-record validator: {'PASS' if not errors else 'FAIL'} "
            f"({len(record_paths)} files, {len(errors)} errors)"
        )
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
