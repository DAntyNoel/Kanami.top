#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="$SCRIPT_DIR"

cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.example and fill in the real values first." >&2
  exit 1
fi

if [ -d "config.yaml" ]; then
  echo "config.yaml is a directory. Remove it and create a file before starting local Docker." >&2
  exit 1
fi
if [ ! -f "config.yaml" ]; then
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Fxq "kanami-cliproxy-api" &&
    docker cp "kanami-cliproxy-api:/CLIProxyAPI/config.yaml" "config.yaml"; then
    echo "Exported existing container config to config.yaml."
  else
    : > "config.yaml"
    echo "Created empty config.yaml. The container will populate it on first start."
  fi
fi

compose() {
  docker compose --env-file .env -f docker-compose.yml "$@"
}

usage_keeper_compose() {
  docker compose --env-file .env -f docker-compose.usage-keeper.yml "$@"
}

USAGE_KEEPER_DATA_VOLUME="kanami-cpa-usage-keeper-data"

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

memory_killbot_image() {
  image=$(env_value "CLIPROXY_MEMORY_KILLBOT_IMAGE")
  printf '%s\n' "${image:-kanami-cliproxy-memory-killbot:local}"
}

START_USAGE_KEEPER="${START_USAGE_KEEPER:-$(env_value "START_USAGE_KEEPER")}"
START_USAGE_KEEPER="${START_USAGE_KEEPER:-true}"
START_KEEPER_TUNNEL="${START_KEEPER_TUNNEL:-$(env_value "START_KEEPER_TUNNEL")}"
START_KEEPER_TUNNEL="${START_KEEPER_TUNNEL:-true}"
KEEPER_TUNNEL_TOKEN="${KEEPER_TUNNEL_TOKEN:-$(env_value "KEEPER_TUNNEL_TOKEN")}"

RUNNING_CONTAINERS=$(compose ps -q)

if [ -n "$RUNNING_CONTAINERS" ]; then
  echo "Stopping running local Cloudflare Docker services..."
  compose stop
else
  echo "No running local Cloudflare Docker services found."
fi

CLI_PROXY_IMAGE_NAME=$(cli_proxy_image)
MEMORY_KILLBOT_IMAGE_NAME=$(memory_killbot_image)

if docker image inspect "$CLI_PROXY_IMAGE_NAME" >/dev/null 2>&1 &&
  docker image inspect "$MEMORY_KILLBOT_IMAGE_NAME" >/dev/null 2>&1; then
  echo "Found local Docker images: $CLI_PROXY_IMAGE_NAME and $MEMORY_KILLBOT_IMAGE_NAME"
  echo "Starting without rebuilding CLIProxyAPI or memory killbot..."
  UP_ARGS="-d --no-build --force-recreate"
else
  echo "One or more local images are missing: $CLI_PROXY_IMAGE_NAME, $MEMORY_KILLBOT_IMAGE_NAME"
  echo "Building CLIProxyAPI and memory killbot before start..."
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
  echo "Ensuring CPA Usage Keeper data volume exists..."
  docker volume create --label com.kanami.service=cpa-usage-keeper "$USAGE_KEEPER_DATA_VOLUME" >/dev/null

  if usage_keeper_compose run --rm --no-deps -T --entrypoint /bin/sh cpa-usage-keeper -c 'test -s /data/app.db'; then
    :
  else
    volume_probe_exit=$?
    if [ "$volume_probe_exit" -ne 1 ]; then
      echo "usage keeper data volume probe failed with exit code $volume_probe_exit" >&2
      exit "$volume_probe_exit"
    fi
    if [ -s "keeper/app.db" ]; then
      echo "legacy keeper/app.db exists while $USAGE_KEEPER_DATA_VOLUME is empty; refusing to start a blank database." >&2
      echo "Back up app.db/app.db-wal/app.db-shm, checkpoint the WAL, seed the named volume, then rerun." >&2
      exit 1
    fi
  fi

  echo "Restarting CPA Usage Keeper in detached mode..."
  if truthy "$START_KEEPER_TUNNEL" && [ -n "$KEEPER_TUNNEL_TOKEN" ]; then
    echo "Keeper Cloudflare Tunnel token found; restarting keeper and tunnel connector."
    echo "Command: docker compose --env-file .env -f docker-compose.usage-keeper.yml --profile keeper-tunnel up -d --force-recreate"
    usage_keeper_compose --profile keeper-tunnel up -d --force-recreate
  else
    echo "Keeper Cloudflare Tunnel not started; token missing or START_KEEPER_TUNNEL is false."
    echo "Command: docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d --force-recreate"
    usage_keeper_compose up -d --force-recreate
  fi
  usage_keeper_compose ps
else
  echo "CPA Usage Keeper not started because START_USAGE_KEEPER is false. To start it manually, run:"
  echo "  docker compose --env-file .env -f docker-compose.usage-keeper.yml up -d --force-recreate"
fi
