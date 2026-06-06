import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHATBOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN_DIR = path.join(CHATBOT_DIR, ".run");
const ENV_FILES = [path.join(CHATBOT_DIR, "env"), path.join(CHATBOT_DIR, ".env")];
const SERVER_PID_FILE = path.join(RUN_DIR, "chatbot-server.pid");
const TUNNEL_PID_FILE = path.join(RUN_DIR, "chatbot-cloudflared.pid");

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

function loadFileEnv() {
  const loaded = {};
  let foundEnvFile = false;

  for (const file of ENV_FILES) {
    if (!fs.existsSync(file)) continue;
    foundEnvFile = true;
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const pair = parseEnvLine(line);
      if (!pair) continue;
      const [key, value] = pair;
      if (loaded[key] === undefined) loaded[key] = value;
    }
  }

  if (!foundEnvFile) {
    throw new Error("Missing chatbot/env or chatbot/.env. Create one from chatbot/env.example first.");
  }

  return loaded;
}

const fileEnv = loadFileEnv();
const childEnv = { ...fileEnv, ...process.env };

function envValue(key, fallback = "") {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}

function truthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function falsy(value) {
  return ["0", "false", "no", "n", "off"].includes(String(value).trim().toLowerCase());
}

function numberValue(key, fallback, { min, max } = {}) {
  const raw = envValue(key, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (min !== undefined && value < min) return fallback;
  if (max !== undefined && value > max) return fallback;
  return value;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopFromPidFile(pidFile, label) {
  if (!fs.existsSync(pidFile)) {
    console.log(`No previous ${label} pid file found.`);
    return;
  }

  const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.rmSync(pidFile, { force: true });
    console.log(`Removed invalid ${label} pid file.`);
    return;
  }

  if (!isProcessRunning(pid)) {
    fs.rmSync(pidFile, { force: true });
    console.log(`Previous ${label} is not running.`);
    return;
  }

  console.log(`Stopping previous ${label} (pid ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isProcessRunning(pid)) break;
    await sleep(250);
  }

  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  fs.rmSync(pidFile, { force: true });
}

function commandExists(command) {
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, process.platform === "win32" ? `${command}${extension}` : command);
      if (fs.existsSync(candidate)) return true;
    }
  }

  return false;
}

function startDetached({ label, command, args, stdoutFile, stderrFile, pidFile }) {
  const stdout = fs.openSync(stdoutFile, "a");
  const stderr = fs.openSync(stderrFile, "a");

  try {
    const child = spawn(command, args, {
      cwd: CHATBOT_DIR,
      detached: true,
      env: childEnv,
      stdio: ["ignore", stdout, stderr],
      windowsHide: true
    });

    child.unref();
    fs.writeFileSync(pidFile, `${child.pid}\n`, "utf8");
    console.log(`Started ${label} (pid ${child.pid}).`);
    return child.pid;
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
}

function healthUrl() {
  const port = numberValue("PORT", 12703, { min: 1, max: 65535 });
  const bindHost = envValue("HOST", "127.0.0.1");
  const host = ["", "0.0.0.0", "::"].includes(bindHost) ? "127.0.0.1" : bindHost;
  const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${urlHost}:${port}/health`;
}

async function waitForServer(pid, url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isProcessRunning(pid)) {
      throw new Error("Chatbot server exited before it became healthy.");
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Retry while the server finishes binding the port.
    }

    await sleep(500);
  }

  throw new Error(`Chatbot server did not become healthy at ${url}.`);
}

async function main() {
  const startTunnel = !falsy(envValue("START_TUNNEL", "true"));
  const tunnelToken = envValue("TUNNEL_TOKEN", "");
  const shouldStartTunnel = startTunnel && tunnelToken.trim().length > 0;

  if (shouldStartTunnel && !commandExists("cloudflared")) {
    throw new Error("TUNNEL_TOKEN is set, but cloudflared was not found in PATH.");
  }

  fs.mkdirSync(RUN_DIR, { recursive: true });

  await stopFromPidFile(TUNNEL_PID_FILE, "Cloudflare Tunnel connector");
  await stopFromPidFile(SERVER_PID_FILE, "chatbot server");

  const serverPid = startDetached({
    label: "chatbot server",
    command: process.execPath,
    args: ["src/server.js"],
    stdoutFile: path.join(RUN_DIR, "chatbot-server.log"),
    stderrFile: path.join(RUN_DIR, "chatbot-server.err.log"),
    pidFile: SERVER_PID_FILE
  });

  const url = healthUrl();
  await waitForServer(serverPid, url);
  console.log(`Chatbot health check passed: ${url}`);

  if (shouldStartTunnel) {
    const tunnelPid = startDetached({
      label: "Cloudflare Tunnel connector",
      command: "cloudflared",
      args: ["tunnel", "--no-autoupdate", "run", "--token", tunnelToken],
      stdoutFile: path.join(RUN_DIR, "chatbot-cloudflared.log"),
      stderrFile: path.join(RUN_DIR, "chatbot-cloudflared.err.log"),
      pidFile: TUNNEL_PID_FILE
    });

    await sleep(1000);
    if (!isProcessRunning(tunnelPid)) {
      throw new Error("Cloudflare Tunnel connector exited immediately. Check chatbot/.run logs.");
    }

    console.log("Cloudflare Tunnel connector restarted.");
  } else if (startTunnel) {
    console.log("Cloudflare Tunnel not started because TUNNEL_TOKEN is empty.");
  } else {
    console.log("Cloudflare Tunnel not started because START_TUNNEL is false.");
  }

  console.log("Restart complete. Logs and pid files are in chatbot/.run.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
