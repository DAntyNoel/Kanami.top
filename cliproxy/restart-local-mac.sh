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

usage_keeper_compose() {
  docker compose --env-file .env -f docker-compose.usage-keeper.yml "$@"
}

env_value() {
  key="$1"
  awk -v key="$key" -F= '
    /^[[:space:]]*(#|$)/ { next }
    {
      name = $1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == key) {
        value = $0
        sub(/^[^=]*=/, "", value)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        gsub(/^["'\''"]|["'\''"]$/, "", value)
      }
    }
    END { print value }
  ' .env
}

truthy() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

cli_proxy_image() {
  image=$(env_value "CLI_PROXY_IMAGE")
  printf '%s\n' "${image:-kanami-cliproxy:latest}"
}

START_USAGE_KEEPER="${START_USAGE_KEEPER:-$(env_value "START_USAGE_KEEPER")}"

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

if truthy "$START_USAGE_KEEPER"; then
  echo "Starting CPA Usage Keeper in detached mode..."
  echo "Command: docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d"
  usage_keeper_compose up -d
  usage_keeper_compose ps
else
  echo "CPA Usage Keeper not started. Set START_USAGE_KEEPER=true or run:"
  echo "  docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d"
fi
