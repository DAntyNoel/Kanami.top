"""Local debug entrypoint for the Kanami local-server backend."""

from __future__ import annotations

import argparse
import os
import json
import socket
import subprocess
import sys
from urllib.error import URLError
from urllib.request import urlopen
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


def probe_host(host: str) -> str:
    if host in {"", "0.0.0.0", "::"}:
        return "127.0.0.1"
    return host


def local_url(host: str, port: str) -> str:
    url_host = probe_host(host)
    if ":" in url_host and not url_host.startswith("["):
        url_host = f"[{url_host}]"
    return f"http://{url_host}:{port}"


def port_is_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((probe_host(host), port), timeout=0.5):
            return True
    except OSError:
        return False


def read_health(url: str) -> dict[str, object] | None:
    try:
        with urlopen(f"{url}/health", timeout=1.5) as response:
            payload = response.read().decode("utf-8")
    except (OSError, URLError, TimeoutError):
        return None

    try:
        value = json.loads(payload)
    except json.JSONDecodeError:
        return None

    return value if isinstance(value, dict) else None


def check_port_before_start(host: str, port: str) -> int | None:
    try:
        port_number = int(port)
    except ValueError:
        print(f"LOCAL_SERVER_PORT must be a number, got: {port}", file=sys.stderr)
        return 2

    if not port_is_open(host, port_number):
        return None

    url = local_url(host, port)
    health = read_health(url)
    if health and health.get("service") == "Kanami Local Server":
        print(f"Kanami local-server is already running at {url}/")
        print("Use --port 12701 if you want to start another local debug instance.")
        return 0

    print(f"Port {probe_host(host)}:{port} is already in use, but it is not responding as Kanami local-server.", file=sys.stderr)
    print("Stop the existing process or start this debug backend with another port, for example: python backend.py --port 12701", file=sys.stderr)
    return 98


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

    port_status = check_port_before_start(host, port)
    if port_status is not None:
        return port_status

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
