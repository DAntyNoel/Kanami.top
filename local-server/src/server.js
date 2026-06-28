import fs from "node:fs";
import http from "node:http";
import { tryHandleAuthApi } from "./auth.js";
import { config, paths } from "./config.js";
import { galleryStatus } from "./gallery.js";
import { tryHandleResourceManageApi } from "./resourceManage.js";
import { sendJson, tryServeMappedFile, tryServeStatic } from "./static.js";

function filesRootReady() {
  try {
    return fs.existsSync(paths.files) && fs.statSync(paths.files).isDirectory();
  } catch {
    return false;
  }
}

function publicHealthPayload() {
  return {
    ok: true,
    service: config.serviceName,
    status: "online",
    time: new Date().toISOString()
  };
}

function detailedHealthPayload() {
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
    },
    gallery: galleryStatus()
  };
}

function isDetailedHealthAllowed(req, url) {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return true;
  if (!config.adminToken) return false;
  return req.headers["x-kanami-admin-token"] === config.adminToken || url.searchParams.get("token") === config.adminToken;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Kanami-Admin-Token"
      });
      res.end();
      return;
    }

    if (await tryHandleAuthApi(req, res, url)) {
      return;
    }

    if (await tryHandleResourceManageApi(req, res, url)) {
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/health") {
      sendJson(req, res, 200, publicHealthPayload());
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/health/detail") {
      if (isDetailedHealthAllowed(req, url)) {
        sendJson(req, res, 200, detailedHealthPayload());
        return;
      }
      sendJson(req, res, 403, {
        error: "ADMIN_ACCESS_REQUIRED",
        message: "香奈美把详细健康检查收进后台啦。"
      });
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

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`${config.serviceName} could not start because ${config.host}:${config.port} is already in use.`);
    console.error("Stop the existing process or use another LOCAL_SERVER_PORT.");
    process.exit(98);
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} listening at http://${config.host}:${config.port}/`);
});
