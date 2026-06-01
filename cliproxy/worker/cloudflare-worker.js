const DEFAULT_BACKEND_ORIGIN = "http://127.0.0.1:8317";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function htmlResponse(title, message, status = 502) {
  return new Response(
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f3ee; color: #332b24; }
    main { width: min(92vw, 560px); padding: 32px; }
    h1 { margin: 0 0 12px; font-size: clamp(28px, 6vw, 42px); }
    p { margin: 0; line-height: 1.7; font-size: 16px; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Headers", request.headers.get("Access-Control-Request-Headers") || "authorization, content-type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request);
    }

    const backendOrigin = trimTrailingSlash(env.BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN);
    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname === "/" && request.method === "GET") {
      return htmlResponse("香奈美的 API 转发站", "后台已经在这里待命啦。请把客户端指向 /v1 或对应的 CLIProxyAPI 接口。", 200);
    }

    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, backendOrigin);
    const headers = new Headers(request.headers);
    headers.set("Host", targetUrl.host);
    headers.set("X-Forwarded-Host", incomingUrl.host);
    headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual"
      });
      return withCors(response, request);
    } catch (error) {
      return htmlResponse("香奈美暂时连不上后台", "API 转发服务现在没有回应，请稍等一下再来试试。", 502);
    }
  }
};
