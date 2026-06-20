import fs from "node:fs";
import path from "node:path";
import { paths } from "./env.js";

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
  [".mp3", "audio/mpeg"]
]);

function sendFile(req, res, filePath) {
  const type = MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": type.startsWith("text/html") ? "no-store" : "public, max-age=3600"
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

export function tryServeStatic(req, res, url) {
  if (url.pathname === "/" || url.pathname === "/start") {
    sendFile(req, res, path.join(paths.public, "index.html"));
    return true;
  }

  if (url.pathname === "/offline") {
    sendFile(req, res, path.join(paths.public, "offline.html"));
    return true;
  }

  if (url.pathname.startsWith("/res/")) {
    const assetPath = resolveInside(paths.sharedAssets, url.pathname.slice("/res/".length));
    if (assetPath && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      sendFile(req, res, assetPath);
      return true;
    }
  }

  const publicPath = resolveInside(paths.public, url.pathname);
  if (publicPath && fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
    sendFile(req, res, publicPath);
    return true;
  }

  return false;
}
