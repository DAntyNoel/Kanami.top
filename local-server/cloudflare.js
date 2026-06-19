import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOCAL_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILES = [path.join(LOCAL_SERVER_DIR, ".env"), path.join(LOCAL_SERVER_DIR, "env")];

function stripQuotes(value) {
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

function loadFileEnv() {
  const loaded = {};

  for (const filePath of ENV_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const index = trimmed.indexOf("=");
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      const value = stripQuotes(trimmed.slice(index + 1).trim());
      if (key && loaded[key] === undefined) {
        loaded[key] = value;
      }
    }
  }

  return loaded;
}

const fileEnv = loadFileEnv();
const childEnv = { ...fileEnv, ...process.env };

function envValue(key, fallback = "") {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}

function tunnelToken() {
  return envValue("LOCAL_SERVER_TUNNEL_TOKEN") || envValue("TUNNEL_TOKEN");
}

function localTarget() {
  const host = envValue("LOCAL_SERVER_HOST", "127.0.0.1");
  const port = envValue("LOCAL_SERVER_PORT", "12700");
  return envValue("LOCAL_SERVER_TUNNEL_TARGET", `http://${host}:${port}`);
}

const token = tunnelToken().trim();
if (!token) {
  console.log("Cloudflare Tunnel not started because TUNNEL_TOKEN is empty.");
  process.exit(0);
}

const cloudflared = envValue("LOCAL_SERVER_CLOUDFLARED_BIN", "cloudflared");
const remoteHost = envValue("LOCAL_SERVER_REMOTE_HOST", "local-server.kanami.top");

console.log(`Starting Cloudflare Tunnel connector for ${remoteHost}.`);
console.log(`Expected local target: ${localTarget()}`);

const child = spawn(
  cloudflared,
  ["tunnel", "--no-autoupdate", "run", "--token", token],
  {
    cwd: LOCAL_SERVER_DIR,
    env: childEnv,
    stdio: "inherit",
    windowsHide: false
  }
);

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(`cloudflared executable was not found: ${cloudflared}`);
    process.exit(127);
    return;
  }

  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    const signalExitCodes = new Map([
      ["SIGINT", 130],
      ["SIGTERM", 143]
    ]);
    process.exit(signalExitCodes.get(signal) ?? 1);
    return;
  }
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
