const DEFAULT_BACKEND_ORIGIN = "https://replace-with-your-tunnel.example.com";
const OFFLINE_PATH = "/offline";

function offlineHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>香奈美正在准备中</title>
  <style>
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      color: #2f2634;
      font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
      background:
        linear-gradient(110deg, rgba(255,255,255,.9), rgba(255,238,247,.78)),
        radial-gradient(circle at 20% 20%, rgba(238,138,180,.28), transparent 34%),
        linear-gradient(135deg, #f7c8e0, #b7d5ff);
    }
    main {
      width: min(680px, 100%);
      padding: 44px;
      border: 1px solid rgba(255,255,255,.76);
      border-radius: 8px;
      background: rgba(255,255,255,.88);
      box-shadow: 0 24px 70px rgba(47,38,52,.22);
    }
    p:first-child {
      margin: 0 0 10px;
      color: #d7aa48;
      font-size: .78rem;
      font-weight: 800;
    }
    h1 {
      margin: 0 0 16px;
      font-size: clamp(2rem, 7vw, 4rem);
      line-height: 1.02;
    }
    main > p {
      margin: 0;
      color: #685f70;
      font-size: 1.05rem;
      line-height: 1.75;
    }
    .offline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 26px;
    }
    a {
      display: inline-grid;
      place-items: center;
      height: 46px;
      padding: 0 22px;
      border-radius: 8px;
      color: #fff;
      font-weight: 800;
      text-decoration: none;
      background: linear-gradient(135deg, #ee8ab4, #77a7df);
      box-shadow: 0 10px 26px rgba(119,167,223,.28);
    }
    a.secondary {
      color: #2f2634;
      background: rgba(255,255,255,.78);
      box-shadow: inset 0 0 0 1px rgba(119,167,223,.34);
    }
  </style>
</head>
<body>
  <main>
    <p>KANAMI IS OFFLINE</p>
    <h1>后台的舞台灯暂时暗下来了。</h1>
    <p>香奈美正在重新接上声音通道，等服务恢复后再回到这里，我会继续听你说话的。</p>
    <div class="offline-actions" aria-label="离线页操作">
      <a href="/start">再试一次</a>
      <a class="secondary" href="https://kanami.top/">回到我的主页</a>
    </div>
  </main>
</body>
</html>`;
}

function offlineResponse(request, status = 503) {
  return new Response(request.method === "HEAD" ? null : offlineHtml(), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function offlineJsonResponse(status = 503) {
  return new Response(JSON.stringify({
    error: "BACKEND_OFFLINE",
    message: "香奈美正在重新接上声音通道，稍后再试一次好吗？"
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function wantsHtml(request) {
  const accept = request.headers.get("Accept") || "";
  return (request.method === "GET" || request.method === "HEAD") && accept.includes("text/html");
}

function isMachineEndpoint(pathname) {
  return pathname === "/health" || pathname.startsWith("/api/");
}

function offlineRedirect(request) {
  const target = new URL(request.url);
  target.pathname = OFFLINE_PATH;
  target.search = "";
  target.hash = "";
  return Response.redirect(target.toString(), 302);
}

function backendOfflineResponse(request, status = 503) {
  const url = new URL(request.url);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === OFFLINE_PATH) {
    return offlineResponse(request, status);
  }
  if (isMachineEndpoint(url.pathname)) {
    return offlineJsonResponse(status);
  }
  if (wantsHtml(request)) {
    return offlineRedirect(request);
  }
  return offlineJsonResponse(status);
}

function buildBackendRequest(request, backendOrigin) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, backendOrigin);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", incoming.host);
  headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));

  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual"
  });
}

export default {
  async fetch(request, env) {
    const backendOrigin = env.BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN;
    const url = new URL(request.url);

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === OFFLINE_PATH) {
      return offlineResponse(request);
    }

    try {
      const response = await fetch(buildBackendRequest(request, backendOrigin));
      if (response.status >= 500) {
        return backendOfflineResponse(request, response.status);
      }
      return response;
    } catch {
      return backendOfflineResponse(request);
    }
  }
};
