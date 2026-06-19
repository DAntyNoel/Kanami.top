import fs from "node:fs";
import http from "node:http";
import { config, paths } from "./config.js";
import { sendJson, tryServeMappedFile, tryServeStatic } from "./static.js";

function filesRootReady() {
  try {
    return fs.existsSync(paths.files) && fs.statSync(paths.files).isDirectory();
  } catch {
    return false;
  }
}

function healthPayload() {
  return {
    ok: true,
    service: config.serviceName,
    status: "online",
    time: new Date().toISOString(),
    tunnel: {
      connected: config.remoteConnected,
      remoteHost: config.remoteHost,
      remoteUrl: config.remoteUrl,
      target: `http://${config.host}:${config.port}`
    },
    files: {
      available: filesRootReady(),
      route: config.fileRoutePrefix,
      root: paths.files
    }
  };
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/health") {
      sendJson(req, res, 200, healthPayload());
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && tryServeStatic(req, res, url)) {
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && tryServeMappedFile(req, res, url)) {
      return;
    }

    sendJson(req, res, 404, {
      error: "NOT_FOUND",
      message: "香奈美没有找到这个本地入口。"
    });
  } catch (error) {
    sendJson(req, res, 500, {
      error: "SERVER_ERROR",
      message: "香奈美这边的本地舞台刚刚卡住了，请稍后再试。",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} listening at http://${config.host}:${config.port}/`);
});
