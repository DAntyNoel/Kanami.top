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

RUNNING_CONTAINERS=$(compose ps -q)

if [ -n "$RUNNING_CONTAINERS" ]; then
  echo "Stopping running local Cloudflare Docker services..."
  compose stop
else
  echo "No running local Cloudflare Docker services found."
fi

echo "Starting local Cloudflare Docker services in detached mode..."
compose up -d --build --force-recreate
compose ps
