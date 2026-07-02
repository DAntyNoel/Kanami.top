import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./config.js";
import { sendJson } from "./static.js";

const API_PREFIX = "/api/v-nami";
const MAX_JSON_BYTES = 64 * 1024;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_SUGGESTION_LENGTH = 500;
const FEEDBACK_VALUES = new Set(["great", "normal", "question", "problem"]);
const CORRECTION_TYPES = new Set(["title", "song", "author", "tag", "link", "audio", "other"]);
const BVID_RE = /^BV[0-9A-Za-z_-]{2,30}$/u;

function wikiDataPath() {
  return path.join(paths.files, "WIKI", "custom_kanami_ai_covers.json");
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function compactText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeBvid(value) {
  const bvid = compactText(value, 40);
  return BVID_RE.test(bvid) ? bvid : "";
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function readCoverMap() {
  try {
    const payload = JSON.parse(fs.readFileSync(wikiDataPath(), "utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function findItem(bvid) {
  const entries = Object.entries(readCoverMap());
  for (const [url, meta] of entries) {
    if (meta?.bvid === bvid) {
      return { url, meta };
    }
  }
  return null;
}

function recordBase(req, body, bvid, item, prefix) {
  return {
    id: randomId(prefix),
    createdAt: nowIso(),
    bvid,
    itemTitle: compactText(item.meta?.title || item.meta?.videoTitle || "", 160),
    sourcePage: compactText(item.meta?.videoUrl || item.meta?.sourcePage || item.url || "", 300),
    page: compactText(body?.page || req.headers.referer || "", 300),
    userAgent: compactText(req.headers["user-agent"], 180)
  };
}

function appendJsonl(fileName, record) {
  fs.mkdirSync(paths.vnamiFeedback, { recursive: true });
  fs.appendFileSync(path.join(paths.vnamiFeedback, fileName), `${JSON.stringify(record)}\n`, "utf8");
}

function sendVnamiError(req, res, status, error, message, detail) {
  sendJson(req, res, status, {
    error,
    message,
    ...(detail ? { detail } : {})
  });
}

async function handleFeedback(req, res) {
  const body = await readRequestJson(req);
  const bvid = normalizeBvid(body?.bvid);
  const value = compactText(body?.value, 24);
  if (!bvid) {
    sendVnamiError(req, res, 400, "INVALID_BVID", "香奈美没有认出这首歌的 BV 号。");
    return;
  }
  if (!FEEDBACK_VALUES.has(value)) {
    sendVnamiError(req, res, 400, "INVALID_FEEDBACK", "香奈美没有认出这次音频反馈。");
    return;
  }

  const item = findItem(bvid);
  if (!item) {
    sendVnamiError(req, res, 404, "VNAMI_ITEM_NOT_FOUND", "香奈美没有在 AI 歌单里找到这首。");
    return;
  }

  const record = {
    ...recordBase(req, body, bvid, item, "fb"),
    value
  };
  appendJsonl("feedback.jsonl", record);
  sendJson(req, res, 201, { ok: true, id: record.id });
}

async function handleCorrection(req, res) {
  const body = await readRequestJson(req);
  const bvid = normalizeBvid(body?.bvid);
  const issueType = compactText(body?.issueType, 24);
  const message = compactText(body?.message, MAX_MESSAGE_LENGTH + 1);
  const suggestion = compactText(body?.suggestion, MAX_SUGGESTION_LENGTH);
  if (!bvid) {
    sendVnamiError(req, res, 400, "INVALID_BVID", "香奈美没有认出这首歌的 BV 号。");
    return;
  }
  if (!CORRECTION_TYPES.has(issueType)) {
    sendVnamiError(req, res, 400, "INVALID_CORRECTION_TYPE", "香奈美没有认出这个纠错类型。");
    return;
  }
  if (!message) {
    sendVnamiError(req, res, 400, "EMPTY_CORRECTION", "纠错内容还没有写好。");
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    sendVnamiError(req, res, 400, "CORRECTION_TOO_LONG", "纠错内容太长啦，香奈美这次先接不住。");
    return;
  }

  const item = findItem(bvid);
  if (!item) {
    sendVnamiError(req, res, 404, "VNAMI_ITEM_NOT_FOUND", "香奈美没有在 AI 歌单里找到这首。");
    return;
  }

  const record = {
    ...recordBase(req, body, bvid, item, "fix"),
    issueType,
    message,
    suggestion
  };
  appendJsonl("corrections.jsonl", record);
  sendJson(req, res, 201, { ok: true, id: record.id });
}

export async function tryHandleVnamiApi(req, res, url) {
  if (!url.pathname.startsWith(API_PREFIX)) return false;

  try {
    const route = url.pathname.slice(API_PREFIX.length) || "/";
    if (req.method === "POST" && route === "/feedback") {
      await handleFeedback(req, res);
      return true;
    }
    if (req.method === "POST" && route === "/correction") {
      await handleCorrection(req, res);
      return true;
    }

    sendVnamiError(req, res, 404, "API_NOT_FOUND", "香奈美没有找到这个 AI 歌单接口。");
    return true;
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === "INVALID_JSON") {
      sendVnamiError(req, res, 400, "INVALID_JSON", "香奈美没有读懂这次提交的数据。");
      return true;
    }
    if (code === "REQUEST_TOO_LARGE") {
      sendVnamiError(req, res, 413, "REQUEST_TOO_LARGE", "这次提交太大啦，香奈美先收不下。");
      return true;
    }
    sendVnamiError(req, res, 500, "VNAMI_API_ERROR", "香奈美记录 AI 歌单反馈时卡住了。", code);
    return true;
  }
}
