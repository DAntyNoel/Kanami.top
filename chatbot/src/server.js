import http from "node:http";
import { config } from "./env.js";
import { getKanamiPrompt } from "./prompt.js";
import { isApiKeyRequired, providerHeaders, resolveProvider } from "./provider.js";
import { tryServeStatic } from "./static.js";

const rateBuckets = new Map();
const rateLimitWindowMs = 60000;
let lastRateLimitSweep = 0;

function json(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = config.allowedOrigins;
  if (!origin) return;

  if (allowed.includes("*") || allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
}

function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function checkRateLimit(req) {
  const key = clientIp(req);
  const now = Date.now();
  if (now - lastRateLimitSweep > rateLimitWindowMs) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now > bucket.resetAt) rateBuckets.delete(bucketKey);
    }
    lastRateLimitSweep = now;
  }

  const bucket = rateBuckets.get(key) ?? { resetAt: now + rateLimitWindowMs, count: 0 };
  if (now > bucket.resetAt) {
    bucket.resetAt = now + rateLimitWindowMs;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= config.rateLimitPerMinute;
}

function requestHost(req) {
  return String(req.headers.host || "").split(":")[0].toLowerCase();
}

function hasAdminAccess(req, url) {
  const host = requestHost(req);
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return true;
  if (!config.adminToken) return false;
  return req.headers["x-kanami-admin-token"] === config.adminToken || url.searchParams.get("token") === config.adminToken;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) {
    throw new Error("messages must be an array");
  }

  const messages = input
    .slice(-config.maxHistoryMessages)
    .map((message) => ({
      role: String(message.role || "").trim(),
      content: String(message.content || "").trim().slice(0, config.maxMessageChars)
    }))
    .filter((message) => ["user", "assistant"].includes(message.role) && message.content);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    throw new Error("last message must be from user");
  }

  return messages;
}

function providerMessages(messages) {
  return [
    {
      role: "system",
      content: getKanamiPrompt()
    },
    ...messages
  ];
}

function sseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
}

function sseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractDelta(payload) {
  const choice = payload.choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? "";
}

function chatPayload(messages, stream) {
  return JSON.stringify({
    model: config.model,
    messages: providerMessages(messages),
    temperature: config.temperature,
    stream
  });
}

async function fetchProviderChat(provider, messages, stream, signal) {
  return fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: providerHeaders(),
    signal,
    body: chatPayload(messages, stream)
  });
}

async function streamCompleteFallback(res, provider, messages, signal) {
  const response = await fetchProviderChat(provider, messages, false, signal);

  if (!response.ok) {
    sseEvent(res, "error", {
      message: "我的麦克风暂时没接好，等一下再喊我可以吗？",
      status: response.status
    });
    return false;
  }

  const payload = await response.json();
  const message = payload.choices?.[0]?.message?.content ?? "";
  if (message) sseEvent(res, "token", { delta: message });
  sseEvent(res, "done", { ok: true, fallback: "non-stream" });
  return true;
}

async function streamChat(req, res, messages) {
  const provider = await resolveProvider({ forceLocalProbe: true });
  if (isApiKeyRequired(provider)) {
    json(res, 500, {
      error: "MISSING_API_KEY",
      message: "后台还没有配置好，我现在还不能开麦。"
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  req.on("close", () => controller.abort());

  sseHeaders(res);
  sseEvent(res, "meta", { ok: true });

  try {
    const response = await fetchProviderChat(provider, messages, true, controller.signal);

    if (!response.ok || !response.body) {
      await streamCompleteFallback(res, provider, messages, controller.signal);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const dataLines = part
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        for (const line of dataLines) {
          if (!line || line === "[DONE]") continue;
          const payload = JSON.parse(line);
          const delta = extractDelta(payload);
          if (delta) sseEvent(res, "token", { delta });
        }
      }
    }

    sseEvent(res, "done", { ok: true });
  } catch (error) {
    sseEvent(res, "error", {
      message: error.name === "AbortError"
        ? "我这次等得太久了，先把这句话收起来，稍后再继续好吗？"
        : "我刚才没能连上后台的声音通道。"
    });
  } finally {
    clearTimeout(timeout);
    res.end();
  }
}

async function completeChat(res, messages) {
  const provider = await resolveProvider({ forceLocalProbe: true });
  if (isApiKeyRequired(provider)) {
    json(res, 500, {
      error: "MISSING_API_KEY",
      message: "后台还没有配置好，我现在还不能开麦。"
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchProviderChat(provider, messages, false, controller.signal);

    if (!response.ok) {
      json(res, response.status, {
        error: "UPSTREAM_ERROR",
        message: "我的麦克风暂时没接好，等一下再喊我可以吗？"
      });
      return;
    }

    const payload = await response.json();
    json(res, 200, {
      message: payload.choices?.[0]?.message?.content ?? ""
    });
  } catch (error) {
    json(res, 504, {
      error: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      message: "我刚才没能连上后台的声音通道。"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleChat(req, res) {
  if (!checkRateLimit(req)) {
    json(res, 429, {
      error: "RATE_LIMITED",
      message: "我有点喘不过气了，稍等一下再和我说话吧。"
    });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    const messages = normalizeMessages(body.messages);
    if (body.stream === false) {
      await completeChat(res, messages);
      return;
    }
    await streamChat(req, res, messages);
  } catch (error) {
    json(res, error.message === "REQUEST_TOO_LARGE" ? 413 : 400, {
      error: "BAD_REQUEST",
      message: "这次的消息格式我没看懂，可以重新发一次吗？"
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    if (!config.publicHealthDetails) {
      json(res, 200, {
        ok: true,
        status: "online"
      });
      return;
    }
  }

  if (req.method === "GET" && (url.pathname === "/health/detail" || url.pathname === "/health")) {
    if (!config.publicHealthDetails && !hasAdminAccess(req, url)) {
      json(res, 403, {
        error: "ADMIN_ACCESS_REQUIRED",
        message: "我把后台细节收进管理入口了。"
      });
      return;
    }
    const provider = await resolveProvider({ forceLocalProbe: true });
    json(res, 200, {
      ok: true,
      status: "online",
      model: config.model,
      prompt: "celebrity-kanami/persona-only",
      apiConfigured: Boolean(config.apiKey) || provider.source === "local-cliproxy",
      provider: provider.source,
      localCliProxy: {
        configured: Boolean(config.localCliProxyPort),
        available: provider.localAvailable,
        host: config.localCliProxyHost,
        port: config.localCliProxyPort || null
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    json(res, 200, {
      ok: true,
      maxMessageChars: config.maxMessageChars,
      stream: true
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && tryServeStatic(req, res, url)) {
    return;
  }

  json(res, 404, {
    error: "NOT_FOUND",
    message: "我找不到这个入口。"
  });
});

getKanamiPrompt();
server.listen(config.port, config.host, () => {
  console.log(`Kanami chatbot listening at http://${config.host}:${config.port}/start`);
});
