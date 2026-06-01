#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="$SCRIPT_DIR"

cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.example and fill in the real values first." >&2
  exit 1
fi

compose() {
  docker compose --env-file .env -f docker-compose.yml "$@"
}

cli_proxy_image() {
  image=$(awk -F= '
    /^[[:space:]]*(#|$)/ { next }
    /^[[:space:]]*CLI_PROXY_IMAGE[[:space:]]*=/ {
      value = $0
      sub(/^[^=]*=/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^["'\''"]|["'\''"]$/, "", value)
    }
    END { print value }
  ' .env)
  printf '%s\n' "${image:-kanami-cliproxy:latest}"
}

RUNNING_CONTAINERS=$(compose ps -q)

if [ -n "$RUNNING_CONTAINERS" ]; then
  echo "Stopping running local Cloudflare Docker services..."
  compose stop
else
  echo "No running local Cloudflare Docker services found."
fi

CLI_PROXY_IMAGE_NAME=$(cli_proxy_image)

if docker image inspect "$CLI_PROXY_IMAGE_NAME" >/dev/null 2>&1; then
  echo "Found local Docker image: $CLI_PROXY_IMAGE_NAME"
  echo "Starting without rebuilding CLIProxyAPI..."
  UP_ARGS="-d --no-build --force-recreate"
else
  echo "Missing local Docker image: $CLI_PROXY_IMAGE_NAME"
  echo "Building CLIProxyAPI before start..."
  UP_ARGS="-d --build --force-recreate"
fi

echo "Starting local Cloudflare Docker services in detached mode..."
if ! compose up $UP_ARGS; then
  cat >&2 <<'EOF'

Docker build/start failed. If the error mentions docker.io, failed to fetch
anonymous token, or i/o timeout, Docker Hub is not reachable from this machine.
Set these optional values in cliproxy/.env and retry:

GO_BUILDER_IMAGE=docker.1ms.run/library/golang:1.26-alpine
RUNTIME_IMAGE=docker.1ms.run/library/alpine:3.23
CLOUDFLARED_IMAGE=docker.1ms.run/cloudflare/cloudflared:latest
GOPROXY=https://goproxy.cn,direct

EOF
  exit 1
fi
compose ps
