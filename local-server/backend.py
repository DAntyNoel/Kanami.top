"""Local debug entrypoint for the Kanami local-server backend."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"


def strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_env_file(path: Path) -> dict[str, str]:
    loaded: dict[str, str] = {}
    if not path.exists():
        return loaded

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            loaded[key] = strip_quotes(value.strip())
    return loaded


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start local-server through Python for local debugging.")
    parser.add_argument("--host", help="Override LOCAL_SERVER_HOST for this debug run.")
    parser.add_argument("--port", type=int, help="Override LOCAL_SERVER_PORT for this debug run.")
    parser.add_argument("--node", default=None, help="Node.js executable to use. Defaults to LOCAL_SERVER_NODE_BIN or node.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    file_env = load_env_file(ENV_FILE)
    env = {**file_env, **os.environ}

    if args.host:
        env["LOCAL_SERVER_HOST"] = args.host
    if args.port:
        env["LOCAL_SERVER_PORT"] = str(args.port)

    node_bin = args.node or env.get("LOCAL_SERVER_NODE_BIN") or "node"
    server_path = ROOT / "src" / "server.js"
    host = env.get("LOCAL_SERVER_HOST", "127.0.0.1")
    port = env.get("LOCAL_SERVER_PORT", "12700")

    print(f"Starting Kanami local-server debug backend at http://{host}:{port}/", flush=True)
    try:
        completed = subprocess.run([node_bin, str(server_path)], cwd=ROOT, env=env, check=False)
    except FileNotFoundError:
        print(f"Node.js executable was not found: {node_bin}", file=sys.stderr)
        return 127
    except KeyboardInterrupt:
        return 130

    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
