import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHATBOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN_DIR = path.join(CHATBOT_DIR, ".run");
const SERVER_PID_FILE = path.join(RUN_DIR, "chatbot-server.pid");
const TUNNEL_PID_FILE = path.join(RUN_DIR, "chatbot-cloudflared.pid");

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
    console.log(`No ${label} pid file found.`);
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
    console.log(`${label} is not running.`);
    return;
  }

  console.log(`Stopping ${label} (pid ${pid})...`);
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

async function main() {
  await stopFromPidFile(TUNNEL_PID_FILE, "Cloudflare Tunnel connector");
  await stopFromPidFile(SERVER_PID_FILE, "chatbot server");
  console.log("Chatbot backend stopped.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
