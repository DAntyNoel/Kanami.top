import fs from "node:fs";
import path from "node:path";
import { config, paths } from "./config.js";

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".zip", "application/zip"]
]);

export function sendJson(req, res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload, null, 2));
}

function sendFile(req, res, filePath, cacheControl) {
  const type = MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": cacheControl
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function resolveInside(baseDir, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const safePath = decoded.replace(/^\/+/, "");
  const absolutePath = path.resolve(baseDir, safePath);
  const relativePath = path.relative(baseDir, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return absolutePath;
}

function isReadableFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

export function tryServeStatic(req, res, url) {
  if (url.pathname === "/" || url.pathname === "/start") {
    sendFile(req, res, paths.entryHtml, "no-store");
    return true;
  }

  if (url.pathname === "/offline") {
    sendFile(req, res, paths.offlineHtml, "no-store");
    return true;
  }

  if (url.pathname === "/script.js") {
    sendFile(req, res, paths.sharedScript, "public, max-age=3600");
    return true;
  }

  if (url.pathname.startsWith("/res/")) {
    const assetPath = resolveInside(paths.sharedAssets, url.pathname.slice("/res/".length));
    if (assetPath && isReadableFile(assetPath)) {
      sendFile(req, res, assetPath, "public, max-age=3600");
      return true;
    }
  }

  if (url.pathname.startsWith("/games/")) {
    const gamePath = resolveInside(paths.sharedGames, url.pathname.slice("/games/".length));
    if (gamePath && isReadableFile(gamePath)) {
      sendFile(req, res, gamePath, "public, max-age=3600");
      return true;
    }
    if (gamePath && isDirectory(gamePath)) {
      const indexPath = path.join(gamePath, "index.html");
      if (isReadableFile(indexPath)) {
        sendFile(req, res, indexPath, "no-store");
        return true;
      }
    }
  }

  const publicPath = resolveInside(paths.public, url.pathname);
  if (publicPath && isReadableFile(publicPath)) {
    const cacheControl = path.extname(publicPath).toLowerCase() === ".html" ? "no-store" : "public, max-age=3600";
    sendFile(req, res, publicPath, cacheControl);
    return true;
  }

  return false;
}

export function tryServeMappedFile(req, res, url) {
  if (!url.pathname.startsWith(config.fileRoutePrefix)) {
    return false;
  }

  const requested = url.pathname.slice(config.fileRoutePrefix.length);
  const filePath = resolveInside(paths.files, requested);
  if (!filePath) {
    sendJson(req, res, 403, {
      error: "FORBIDDEN",
      message: "香奈美不会把映射目录外的文件交出去。"
    });
    return true;
  }

  if (isDirectory(filePath)) {
    sendJson(req, res, 403, {
      error: "DIRECTORY_NOT_LISTED",
      message: "这个入口已经连上啦，不过目录列表暂时不公开。"
    });
    return true;
  }

  if (!isReadableFile(filePath)) {
    sendJson(req, res, 404, {
      error: "FILE_NOT_FOUND",
      message: "香奈美没有在映射目录里找到这个文件。"
    });
    return true;
  }

  sendFile(req, res, filePath, "public, max-age=60");
  return true;
}
