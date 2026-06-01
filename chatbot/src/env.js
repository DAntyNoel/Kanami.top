import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CHATBOT_DIR = path.join(ROOT_DIR, "chatbot");
const ENV_FILES = [path.join(CHATBOT_DIR, "env"), path.join(CHATBOT_DIR, ".env")];

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const splitAt = trimmed.indexOf("=");
  if (splitAt < 0) return null;

  const key = trimmed.slice(0, splitAt).trim();
  let value = trimmed.slice(splitAt + 1).trim();
  if (!key) return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFiles() {
  const loaded = {};

  for (const file of ENV_FILES) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const pair = parseEnvLine(line);
      if (!pair) continue;
      const [key, value] = pair;
      if (process.env[key] === undefined && loaded[key] === undefined) {
        loaded[key] = value;
      }
    }
  }

  return loaded;
}

function envValue(fileEnv, key, fallback = "") {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}

function numberValue(fileEnv, key, fallback, { min, max } = {}) {
  const raw = envValue(fileEnv, key, String(fallback));
  if (raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (min !== undefined && value < min) return fallback;
  if (max !== undefined && value > max) return fallback;
  return value;
}

function listValue(fileEnv, key, fallback = []) {
  const raw = envValue(fileEnv, key, "");
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

const fileEnv = loadEnvFiles();

export const paths = {
  root: ROOT_DIR,
  chatbot: CHATBOT_DIR,
  public: path.join(CHATBOT_DIR, "public"),
  prompt: path.join(CHATBOT_DIR, "kanami-prompt.md"),
  sharedAssets: path.join(ROOT_DIR, "res")
};

export const config = {
  host: envValue(fileEnv, "HOST", "127.0.0.1"),
  port: numberValue(fileEnv, "PORT", 8787, { min: 1, max: 65535 }),
  baseUrl: normalizeBaseUrl(envValue(fileEnv, "BASE_URL", "https://api.openai.com/v1")),
  localCliProxyPort: numberValue(fileEnv, "LOCAL_CLIPROXY_PORT", 0, { min: 1, max: 65535 }),
  localCliProxyHost: envValue(fileEnv, "LOCAL_CLIPROXY_HOST", "127.0.0.1"),
  localCliProxyProbeMs: numberValue(fileEnv, "LOCAL_CLIPROXY_PROBE_MS", 350, { min: 50, max: 5000 }),
  localCliProxyCacheMs: numberValue(fileEnv, "LOCAL_CLIPROXY_CACHE_MS", 2500, { min: 0, max: 60000 }),
  apiKey: envValue(fileEnv, "API_KEY", ""),
  model: envValue(fileEnv, "MODEL", "gpt-4o-mini"),
  temperature: numberValue(fileEnv, "TEMPERATURE", 0.86, { min: 0, max: 2 }),
  maxHistoryMessages: numberValue(fileEnv, "MAX_HISTORY_MESSAGES", 24, { min: 1, max: 80 }),
  maxMessageChars: numberValue(fileEnv, "MAX_MESSAGE_CHARS", 2400, { min: 200, max: 12000 }),
  requestTimeoutMs: numberValue(fileEnv, "REQUEST_TIMEOUT_MS", 90000, { min: 5000, max: 300000 }),
  rateLimitPerMinute: numberValue(fileEnv, "RATE_LIMIT_PER_MINUTE", 30, { min: 1, max: 300 }),
  allowedOrigins: listValue(fileEnv, "ALLOWED_ORIGINS", [])
};
