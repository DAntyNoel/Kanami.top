import http from "node:http";
import { config } from "./env.js";
import { getKanamiPrompt } from "./prompt.js";
import { tryServeStatic } from "./static.js";

const rateBuckets = new Map();

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
  const bucket = rateBuckets.get(key) ?? { resetAt: now + 60000, count: 0 };
  if (now > bucket.resetAt) {
    bucket.resetAt = now + 60000;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= config.rateLimitPerMinute;
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

function providerUrl() {
  return `${config.baseUrl}/chat/completions`;
}

function providerHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`
  };
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

async function streamChat(req, res, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  req.on("close", () => controller.abort());

  sseHeaders(res);
  sseEvent(res, "meta", { model: config.model });

  try {
    const response = await fetch(providerUrl(), {
      method: "POST",
      headers: providerHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: providerMessages(messages),
        temperature: config.temperature,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      sseEvent(res, "error", {
        message: "香奈美这边的麦克风暂时没接好，等一下再喊我可以吗？",
        status: response.status,
        detail: errorText.slice(0, 500)
      });
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
        ? "香奈美这次等太久啦，先把这句话收起来，稍后再继续好吗？"
        : "香奈美刚才没能连上后台的声音通道。"
    });
  } finally {
    clearTimeout(timeout);
    res.end();
  }
}

async function completeChat(res, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(providerUrl(), {
      method: "POST",
      headers: providerHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: providerMessages(messages),
        temperature: config.temperature,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      json(res, response.status, {
        error: "UPSTREAM_ERROR",
        message: "香奈美这边的麦克风暂时没接好，等一下再喊我可以吗？",
        detail: errorText.slice(0, 500)
      });
      return;
    }

    const payload = await response.json();
    json(res, 200, {
      message: payload.choices?.[0]?.message?.content ?? "",
      model: payload.model ?? config.model
    });
  } catch (error) {
    json(res, 504, {
      error: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      message: "香奈美刚才没能连上后台的声音通道。"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleChat(req, res) {
  if (!checkRateLimit(req)) {
    json(res, 429, {
      error: "RATE_LIMITED",
      message: "香奈美有点喘不过气啦，稍等一下再和我说话吧。"
    });
    return;
  }

  if (!config.apiKey) {
    json(res, 500, {
      error: "MISSING_API_KEY",
      message: "后台还没有配置 API_KEY，香奈美现在还不能开麦。"
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
      message: "这次的消息格式香奈美没看懂，可以重新发一次吗？"
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
    json(res, 200, {
      ok: true,
      model: config.model,
      prompt: "kanami-prompt.md",
      apiConfigured: Boolean(config.apiKey)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    json(res, 200, {
      model: config.model,
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
    message: "香奈美找不到这个入口。"
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Kanami chatbot listening at http://${config.host}:${config.port}/start`);
});
