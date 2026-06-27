import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(sourceDir, "..");

function stripQuotes(value) {
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = stripQuotes(trimmed.slice(index + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(rootDir, ".env"));

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function boolEnv(name, fallback) {
  const value = env(name, String(fallback)).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function numberEnv(name, fallback) {
  const parsed = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

export const paths = {
  root: rootDir,
  public: path.join(rootDir, "public"),
  sharedAssets: path.resolve(rootDir, "..", "res"),
  sharedGames: path.resolve(rootDir, "..", "games"),
  entryHtml: path.resolve(rootDir, "..", "local-server.html"),
  offlineHtml: path.resolve(rootDir, "..", "local-server-offline.html"),
  resourceHtml: path.resolve(rootDir, "..", "resource", "index.html"),
  sharedScript: path.resolve(rootDir, "..", "script.js"),
  gallery: resolveFromRoot(env("LOCAL_SERVER_GALLERY_DIR", "../KanamiBot/data/advanced_media")),
  files: resolveFromRoot(env("LOCAL_SERVER_FILES_DIR", "./files"))
};

export const config = {
  host: env("LOCAL_SERVER_HOST", "127.0.0.1"),
  port: numberEnv("LOCAL_SERVER_PORT", 12700),
  serviceName: env("LOCAL_SERVER_NAME", "Kanami Local Server"),
  remoteHost: env("LOCAL_SERVER_REMOTE_HOST", "local-server.kanami.top"),
  remoteUrl: env("LOCAL_SERVER_REMOTE_URL", "https://local-server.kanami.top"),
  remoteConnected: boolEnv("LOCAL_SERVER_REMOTE_CONNECTED", true),
  fileRoutePrefix: "/files/"
};
