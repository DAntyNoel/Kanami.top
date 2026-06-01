#!/bin/sh
set -eu

MANAGEMENT_PASSWORD="${MANAGEMENT_PASSWORD:-}"

APP_DIR="${APP_DIR:-/CLIProxyAPI}"
AUTH_DIR="${AUTH_DIR:-/tmp/cliproxy-auth}"
API_KEYS_FILE="${API_KEYS_FILE:-${API_KEYS_PATH:-}}"
API_KEYS_SECRET="${API_KEYS_SECRET:-/etc/secrets/api-keys.txt}"
API_KEYS_INLINE="${API_KEYS:-${CLIENT_API_KEY:-}}"
CODEX_AUTH_SECRET="${CODEX_AUTH_SECRET:-/etc/secrets/codex-auth.json}"
CODEX_AUTH_JSON="${CODEX_AUTH_JSON:-}"
CODEX_AUTH_JSON_B64="${CODEX_AUTH_JSON_B64:-${CODEX_AUTH_B64:-}}"
CODEX_AUTH_SOURCE="${CODEX_AUTH_SOURCE:-}"
CODEX_AUTH_AUTO_RESTORE="${CODEX_AUTH_AUTO_RESTORE:-true}"
CODEX_AUTH_REQUIRED="${CODEX_AUTH_REQUIRED:-true}"
PROXY_URL="${PROXY_URL:-}"
SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"

quote_yaml() {
  printf "%s" "$1" | sed "s/'/''/g; 1s/^/'/; \$s/\$/'/"
}

load_api_keys() {
  API_KEYS_SOURCE_PATH=""

  for candidate in \
    "$API_KEYS_FILE" \
    "$SCRIPT_DIR/api-keys.txt" \
    "/opt/render/project/src/api-keys.txt" \
    "$APP_DIR/api-keys.txt" \
    "$API_KEYS_SECRET"
  do
    if [ -n "$candidate" ] && [ -s "$candidate" ]; then
      API_KEYS_SOURCE_PATH="$candidate"
      break
    fi
  done

  if [ -z "$API_KEYS_SOURCE_PATH" ] && [ -n "$API_KEYS_INLINE" ]; then
    API_KEYS_SOURCE_PATH="/tmp/cliproxy-api-keys.txt"
    printf "%s\n" "$API_KEYS_INLINE" | tr ',' '\n' > "$API_KEYS_SOURCE_PATH"
  fi

  if [ -z "$API_KEYS_SOURCE_PATH" ]; then
    echo "Missing API key file. Create api-keys.txt with one key per line, set API_KEYS_FILE, or set API_KEYS/CLIENT_API_KEY." >&2
    exit 1
  fi

  API_KEYS_BLOCK="api-keys:"
  API_KEYS_COUNT=0

  while IFS= read -r line || [ -n "$line" ]; do
    key="$(printf "%s" "$line" | sed 's/\r$//; s/^[[:space:]]*//; s/[[:space:]]*$//')"
    case "$key" in
      ""|\#*) continue ;;
    esac

    API_KEYS_BLOCK="${API_KEYS_BLOCK}
  - $(quote_yaml "$key")"
    API_KEYS_COUNT=$((API_KEYS_COUNT + 1))
  done < "$API_KEYS_SOURCE_PATH"

  if [ "$API_KEYS_COUNT" -eq 0 ]; then
    echo "API key file has no usable keys: $API_KEYS_SOURCE_PATH" >&2
    exit 1
  fi
}

restore_from_base64() {
  if printf "%s" "$CODEX_AUTH_JSON_B64" | base64 -d > "$1" 2>/dev/null; then
    return 0
  fi

  if printf "%s" "$CODEX_AUTH_JSON_B64" | base64 -D > "$1" 2>/dev/null; then
    return 0
  fi

  rm -f "$1"
  return 1
}

restore_codex_auth() {
  mkdir -p "$AUTH_DIR"
  AUTH_FILE="$AUTH_DIR/codex-auth.json"
  umask 077

  case "$CODEX_AUTH_AUTO_RESTORE" in
    0|false|FALSE|False|no|NO|No)
      ;;
    *)
      if [ -n "$CODEX_AUTH_JSON_B64" ]; then
        restore_from_base64 "$AUTH_FILE" || {
          echo "CODEX_AUTH_JSON_B64 is not valid base64" >&2
          exit 1
        }
      elif [ -n "$CODEX_AUTH_JSON" ]; then
        printf "%s" "$CODEX_AUTH_JSON" > "$AUTH_FILE"
      else
        for candidate in \
          "$CODEX_AUTH_SOURCE" \
          "$SCRIPT_DIR/codex-auth.json" \
          "/opt/render/project/src/codex-auth.json" \
          "$APP_DIR/codex-auth.json" \
          "$CODEX_AUTH_SECRET"
        do
          if [ -n "$candidate" ] && [ -s "$candidate" ]; then
            cp "$candidate" "$AUTH_FILE"
            break
          fi
        done
      fi
      ;;
  esac

  if [ ! -s "$AUTH_FILE" ]; then
    case "$CODEX_AUTH_REQUIRED" in
      0|false|FALSE|False|no|NO|No)
        echo "No codex auth found in $AUTH_DIR; continuing without automatic auth injection." >&2
        return 0
        ;;
    esac
  fi

  if [ ! -s "$AUTH_FILE" ]; then
    echo "Missing codex auth. Set CODEX_AUTH_JSON_B64, CODEX_AUTH_JSON, CODEX_AUTH_SOURCE, bundle codex-auth.json with the repo, or provide $CODEX_AUTH_SECRET." >&2
    exit 1
  fi

  chmod 600 "$AUTH_FILE"
}

load_api_keys
restore_codex_auth

cat > "$APP_DIR/config.yaml" <<EOF
host: ""
port: ${PORT:-8317}
remote-management:
  allow-remote: true
  secret-key: $(quote_yaml "$MANAGEMENT_PASSWORD")
  disable-control-panel: false
auth-dir: "$AUTH_DIR"
${API_KEYS_BLOCK}
logging-to-file: false
usage-statistics-enabled: true
proxy-url: $(quote_yaml "$PROXY_URL")
EOF

cd "$APP_DIR"
exec ./CLIProxyAPI
