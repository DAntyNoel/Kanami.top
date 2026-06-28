import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./config.js";
import { sendJson } from "./static.js";

const API_PREFIX = "/api/auth";
const COOKIE_NAME = "kanami_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "123";
const CHECKIN_POINTS = 10;
const sessions = new Map();

function authDir() {
  return paths.authData;
}

function usersFilePath() {
  return path.join(authDir(), "users.json");
}

function nowIso() {
  return new Date().toISOString();
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function randomId(prefix = "") {
  return `${prefix}${crypto.randomBytes(18).toString("hex")}`;
}

function normalizeAccount(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function validateQq(qq) {
  return !qq || /^\d{5,12}$/.test(qq);
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return { algorithm: "PBKDF2-SHA256", iterations, salt, hash };
}

function passwordMatches(user, password) {
  const record = user?.password;
  if (!record || record.algorithm !== "PBKDF2-SHA256" || !record.hash || !record.salt) return false;
  const iterations = record.iterations || 120000;
  const hash = crypto.pbkdf2Sync(String(password), record.salt, iterations, 32, "sha256").toString("hex");
  const stored = Buffer.from(record.hash, "hex");
  const candidate = Buffer.from(hash, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function readUsersRaw() {
  try {
    const data = JSON.parse(fs.readFileSync(usersFilePath(), "utf8"));
    return data && typeof data === "object" ? data : { users: [] };
  } catch {
    return { users: [] };
  }
}

function writeUsersRaw(data) {
  fs.mkdirSync(authDir(), { recursive: true });
  fs.writeFileSync(usersFilePath(), `${JSON.stringify(data, null, 2)}\n`);
}

function ensureAdminUser(data) {
  const users = Array.isArray(data.users) ? data.users : [];
  const existing = users.find((user) => normalizeUsername(user.username) === ADMIN_USERNAME);
  if (existing) {
    let changed = false;
    if (existing.role !== "superadmin") {
      existing.role = "superadmin";
      changed = true;
    }
    if (!existing.password || existing.password.algorithm !== "PBKDF2-SHA256") {
      existing.password = passwordRecord(ADMIN_PASSWORD);
      changed = true;
    }
    if (!existing.nickname) {
      existing.nickname = "香奈美的超管";
      changed = true;
    }
    if (!existing.points) {
      existing.points = 0;
      changed = true;
    }
    if (!existing.gameScores) {
      existing.gameScores = {};
      changed = true;
    }
    return changed;
  }

  users.push({
    id: "admin",
    username: ADMIN_USERNAME,
    email: "",
    nickname: "香奈美的超管",
    qq: "",
    avatar: "/res/images/favicon.png",
    role: "superadmin",
    points: 0,
    checkins: [],
    lastCheckinDate: "",
    gameScores: {},
    password: passwordRecord(ADMIN_PASSWORD),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  data.users = users;
  return true;
}

function readUsers() {
  const data = readUsersRaw();
  if (!Array.isArray(data.users)) data.users = [];
  if (ensureAdminUser(data)) writeUsersRaw(data);
  return data;
}

function findUser(data, account) {
  const normalized = normalizeAccount(account);
  return data.users.find((user) => (
    normalizeUsername(user.username) === normalized ||
    normalizeAccount(user.email) === normalized ||
    user.id === normalized
  )) || null;
}

function publicUser(user, includeAdminFields = false) {
  if (!user) return null;
  const base = {
    id: user.id,
    username: user.username,
    email: user.email || "",
    nickname: user.nickname || "",
    qq: user.qq || "",
    avatar: user.avatar || "/res/images/favicon.png",
    role: user.role || "user",
    points: Number(user.points || 0),
    lastCheckinDate: user.lastCheckinDate || "",
    gameScores: user.gameScores || {},
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || ""
  };
  if (includeAdminFields) {
    base.checkins = Array.isArray(user.checkins) ? user.checkins : [];
  }
  return base;
}

function cookieValue(req, name) {
  const cookie = String(req.headers.cookie || "");
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return "";
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

export function currentAuthUser(req) {
  const token = cookieValue(req, COOKIE_NAME);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const data = readUsers();
  return data.users.find((user) => user.id === session.userId) || null;
}

export function isSuperAdmin(req) {
  return currentAuthUser(req)?.role === "superadmin";
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_JSON_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function createSession(res, user) {
  const token = randomId("ks_");
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  });
  setSessionCookie(res, token);
}

async function handleLogin(req, res) {
  const body = await readRequestJson(req);
  const account = body.account || body.email || body.username;
  const password = String(body.password || "");
  const data = readUsers();
  const user = findUser(data, account);
  if (!user || !passwordMatches(user, password)) {
    sendJson(req, res, 401, { ok: false, error: "INVALID_CREDENTIALS", message: "账号或密码不对哦。" });
    return;
  }

  user.lastLoginAt = nowIso();
  user.updatedAt = user.updatedAt || nowIso();
  writeUsersRaw(data);
  createSession(res, user);
  sendJson(req, res, 200, { ok: true, user: publicUser(user) });
}

async function handleRegister(req, res) {
  const body = await readRequestJson(req);
  const email = normalizeAccount(body.email);
  const username = normalizeUsername(body.username || email.split("@")[0]);
  const password = String(body.password || "");
  const nickname = String(body.nickname || "").trim() || "香奈美的来宾";
  const qq = String(body.qq || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    sendJson(req, res, 400, { ok: false, error: "INVALID_EMAIL", message: "邮箱格式需要填好哦。" });
    return;
  }
  if (!username || username === ADMIN_USERNAME) {
    sendJson(req, res, 400, { ok: false, error: "INVALID_USERNAME", message: "这个用户名香奈美已经保留啦。" });
    return;
  }
  if (password.length < 6) {
    sendJson(req, res, 400, { ok: false, error: "WEAK_PASSWORD", message: "密码至少需要 6 位。" });
    return;
  }
  if (!validateQq(qq)) {
    sendJson(req, res, 400, { ok: false, error: "INVALID_QQ", message: "QQ 号需要是 5 到 12 位数字。" });
    return;
  }

  const data = readUsers();
  if (data.users.some((user) => normalizeAccount(user.email) === email || normalizeUsername(user.username) === username)) {
    sendJson(req, res, 409, { ok: false, error: "ACCOUNT_EXISTS", message: "这个账号已经注册过啦。" });
    return;
  }

  const user = {
    id: randomId("ku_"),
    username,
    email,
    nickname,
    qq,
    avatar: String(body.avatar || "").trim(),
    role: "user",
    points: 0,
    checkins: [],
    lastCheckinDate: "",
    gameScores: {},
    password: passwordRecord(password),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  data.users.push(user);
  writeUsersRaw(data);
  createSession(res, user);
  sendJson(req, res, 201, { ok: true, user: publicUser(user) });
}

async function handleProfile(req, res) {
  const current = currentAuthUser(req);
  if (!current) {
    sendJson(req, res, 401, { ok: false, error: "LOGIN_REQUIRED", message: "香奈美还没有确认你的登录状态。" });
    return;
  }

  const body = await readRequestJson(req);
  const data = readUsers();
  const user = data.users.find((item) => item.id === current.id);
  if (!user) {
    sendJson(req, res, 401, { ok: false, error: "LOGIN_REQUIRED", message: "香奈美没有找到这个登录档案。" });
    return;
  }

  const qq = String(body.qq || "").trim();
  if (!validateQq(qq)) {
    sendJson(req, res, 400, { ok: false, error: "INVALID_QQ", message: "QQ 号需要是 5 到 12 位数字。" });
    return;
  }

  user.nickname = String(body.nickname || "").trim() || "香奈美的来宾";
  user.qq = qq;
  user.avatar = String(body.avatar || "").trim();
  user.updatedAt = nowIso();
  writeUsersRaw(data);
  sendJson(req, res, 200, { ok: true, user: publicUser(user) });
}

function handleSession(req, res) {
  sendJson(req, res, 200, {
    ok: true,
    user: publicUser(currentAuthUser(req))
  });
}

function handleLogout(req, res) {
  const token = cookieValue(req, COOKIE_NAME);
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  sendJson(req, res, 200, { ok: true });
}

function handleCheckin(req, res) {
  const current = currentAuthUser(req);
  if (!current) {
    sendJson(req, res, 401, { ok: false, error: "LOGIN_REQUIRED", message: "先登录，香奈美再给你盖签到章。" });
    return;
  }

  const data = readUsers();
  const user = data.users.find((item) => item.id === current.id);
  const date = todayKey();
  const already = user.lastCheckinDate === date;
  if (!already) {
    user.points = Number(user.points || 0) + CHECKIN_POINTS;
    user.lastCheckinDate = date;
    user.checkins = [...(Array.isArray(user.checkins) ? user.checkins : []), { date, points: CHECKIN_POINTS, at: nowIso() }];
    user.updatedAt = nowIso();
    writeUsersRaw(data);
  }

  sendJson(req, res, 200, {
    ok: true,
    already,
    pointsAdded: already ? 0 : CHECKIN_POINTS,
    user: publicUser(user)
  });
}

async function handleScore(req, res) {
  const current = currentAuthUser(req);
  if (!current) {
    sendJson(req, res, 401, { ok: false, error: "LOGIN_REQUIRED", message: "登录后香奈美才能记下小游戏成绩。" });
    return;
  }

  const body = await readRequestJson(req);
  const gameId = normalizeUsername(body.gameId || body.game || "");
  const score = Number(body.score);
  if (!gameId || !Number.isFinite(score)) {
    sendJson(req, res, 400, { ok: false, error: "INVALID_SCORE", message: "小游戏成绩格式不对哦。" });
    return;
  }

  const data = readUsers();
  const user = data.users.find((item) => item.id === current.id);
  const scores = user.gameScores || {};
  const previous = scores[gameId] || {};
  const attempt = {
    score,
    detail: body.detail && typeof body.detail === "object" ? body.detail : {},
    at: nowIso()
  };
  scores[gameId] = {
    gameId,
    gameTitle: String(body.gameTitle || previous.gameTitle || gameId).slice(0, 80),
    highScore: Math.max(Number(previous.highScore || 0), score),
    lastScore: score,
    attempts: Number(previous.attempts || 0) + 1,
    updatedAt: attempt.at,
    history: [attempt, ...(Array.isArray(previous.history) ? previous.history : [])].slice(0, 20)
  };
  user.gameScores = scores;
  user.updatedAt = nowIso();
  writeUsersRaw(data);
  sendJson(req, res, 200, { ok: true, score: scores[gameId], user: publicUser(user) });
}

function handleUsers(req, res) {
  const current = currentAuthUser(req);
  if (current?.role !== "superadmin") {
    sendJson(req, res, 403, { ok: false, error: "SUPERADMIN_REQUIRED", message: "这份全员名册只开放给超管账号。" });
    return;
  }
  const data = readUsers();
  sendJson(req, res, 200, {
    ok: true,
    users: data.users.map((user) => publicUser(user, true))
  });
}

export async function tryHandleAuthApi(req, res, url) {
  if (!url.pathname.startsWith(API_PREFIX)) return false;

  try {
    const route = url.pathname.slice(API_PREFIX.length) || "/";
    if (req.method === "GET" && route === "/session") {
      handleSession(req, res);
      return true;
    }
    if (req.method === "POST" && route === "/login") {
      await handleLogin(req, res);
      return true;
    }
    if (req.method === "POST" && route === "/register") {
      await handleRegister(req, res);
      return true;
    }
    if (req.method === "PATCH" && route === "/profile") {
      await handleProfile(req, res);
      return true;
    }
    if (req.method === "POST" && route === "/logout") {
      handleLogout(req, res);
      return true;
    }
    if (req.method === "POST" && route === "/checkin") {
      handleCheckin(req, res);
      return true;
    }
    if (req.method === "POST" && route === "/score") {
      await handleScore(req, res);
      return true;
    }
    if (req.method === "GET" && route === "/users") {
      handleUsers(req, res);
      return true;
    }

    sendJson(req, res, 404, { ok: false, error: "AUTH_API_NOT_FOUND", message: "香奈美没有找到这个账号 API。" });
    return true;
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === "INVALID_JSON") {
      sendJson(req, res, 400, { ok: false, error: "INVALID_JSON", message: "香奈美没有读懂账号数据。" });
      return true;
    }
    if (code === "REQUEST_TOO_LARGE") {
      sendJson(req, res, 413, { ok: false, error: "REQUEST_TOO_LARGE", message: "这份账号资料太大啦。" });
      return true;
    }
    sendJson(req, res, 500, { ok: false, error: "AUTH_ERROR", message: "香奈美处理账号时卡住了。", detail: code });
    return true;
  }
}
