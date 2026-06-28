import fs from "node:fs";
import path from "node:path";
import { config, paths } from "./config.js";
import { tryServeGallery } from "./gallery.js";

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
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".zip", "application/zip"]
]);

const AUTH_ROUTES = new Map([
  ["/auth", "auth/login.html"],
  ["/auth/", "auth/login.html"],
  ["/auth/login", "auth/login.html"],
  ["/auth/register", "auth/register.html"],
  ["/auth/profile", "auth/profile.html"]
]);

const LOCAL_WIKI_DATA_FILES = new Set([
  "WIKI/amplification_network.json",
  "WIKI/audio.json",
  "WIKI/character.json",
  "WIKI/emotes.json",
  "WIKI/imprints.json",
  "WIKI/oath_texts.json",
  "WIKI/outfits.json",
  "WIKI/skills.json",
  "WIKI/story_wallpapers.json",
  "WIKI/update_history.json",
  "WIKI/weapons.json"
]);

let reloadState = {
  token: String(Date.now()),
  next: ""
};

function reloadLocation(nextPath) {
  const fallback = "/";
  const value = nextPath || fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  const target = new URL(value, "http://local-server");
  target.searchParams.set("_kanami_reload", String(Date.now()));
  return `${target.pathname}${target.search}${target.hash}`;
}

function sendReloadJson(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0, must-revalidate"
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  res.end(JSON.stringify({
    ok: true,
    token: reloadState.token,
    next: reloadState.next
  }, null, 2));
}

function sendCacheReload(req, res, url) {
  reloadState = {
    token: String(Date.now()),
    next: reloadLocation(url.searchParams.get("next"))
  };

  res.writeHead(302, {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "Clear-Site-Data": "\"cache\"",
    "Location": reloadState.next
  });
  res.end();
}

function sendExternalReload(req, res, url) {
  reloadState = {
    token: String(Date.now()),
    next: url.searchParams.has("next") ? reloadLocation(url.searchParams.get("next")) : ""
  };
  sendReloadJson(req, res);
}

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

function sendHtml(req, res, filePath, cacheControl, transform = (html) => html) {
  const html = transform(fs.readFileSync(filePath, "utf8"));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": cacheControl
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  res.end(html);
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

function requestHost(req) {
  return String(req.headers.host || "").split(":")[0].toLowerCase();
}

function isLocalHost(req) {
  const host = requestHost(req);
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
}

function hasAdminAccess(req, url) {
  if (isLocalHost(req)) return true;
  if (!config.adminToken) return false;
  return req.headers["x-kanami-admin-token"] === config.adminToken || url.searchParams.get("token") === config.adminToken;
}

function localRuntimeConfig(req, url) {
  return {
    enabled: true,
    serviceName: config.serviceName,
    remoteHost: config.remoteHost,
    remoteUrl: config.remoteUrl,
    remoteConnected: config.remoteConnected,
    showAdminTools: hasAdminAccess(req, url),
    wikiBase: "/files/WIKI/",
    wikiUseLocalAssets: true,
    wikiLocalAssetBase: "/files/WIKI/"
  };
}

function localBootstrapScript(req, url) {
  const json = JSON.stringify(localRuntimeConfig(req, url)).replace(/</g, "\\u003c");
  return `<script>
    window.KANAMI_LOCAL_SERVER = ${json};
    window.KANAMI_WIKI_BASE = window.KANAMI_LOCAL_SERVER.wikiBase;
    window.KANAMI_WIKI_USE_LOCAL_ASSETS = window.KANAMI_LOCAL_SERVER.wikiUseLocalAssets;
    window.KANAMI_WIKI_LOCAL_ASSET_BASE = window.KANAMI_LOCAL_SERVER.wikiLocalAssetBase;
  </script>`;
}

function localRuntimeScripts(req, url) {
  const runtimeVersion = encodeURIComponent(reloadState.token);
  const scripts = [
    localBootstrapScript(req, url),
    `<script src="/local-runtime.js?v=${runtimeVersion}"></script>`,
    `<script src="/auth/session.js"></script>`
  ];
  if (hasAdminAccess(req, url)) {
    scripts.push(`<script src="/__reload-client.js"></script>`);
  }
  return scripts.join("\n  ");
}

function prepareLocalHtml(req, url, html) {
  let output = html
    .replace(/<script>\s*window\.KANAMI_WIKI_BASE = "\/res\/WIKI\/";\s*<\/script>\s*/u, "")
    .replace(/\s*<script src="\/res\/WIKI\/wiki-data\.js"><\/script>/u, "");

  const scriptTagMatch = output.match(/<script src="\/?script\.js"><\/script>/u);
  if (scriptTagMatch) {
    return output.replace(scriptTagMatch[0], `${localRuntimeScripts(req, url)}\n  ${scriptTagMatch[0]}`);
  }

  return output.replace("</body>", `  ${localRuntimeScripts(req, url)}\n</body>`);
}

function isAllowedMappedPath(requested) {
  const normalized = requested.replace(/^\/+/, "");
  if (LOCAL_WIKI_DATA_FILES.has(normalized)) return true;
  return config.fileAllowedPrefixes.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

function denyAdminRoute(req, res) {
  sendJson(req, res, 403, {
    error: "ADMIN_ACCESS_REQUIRED",
    message: "香奈美把这个调试入口收进后台啦，请从本机访问或带上管理口令。"
  });
}

export function tryServeStatic(req, res, url) {
  if (url.pathname === "/__reload/state") {
    if (!hasAdminAccess(req, url)) {
      denyAdminRoute(req, res);
      return true;
    }
    sendReloadJson(req, res);
    return true;
  }

  if (url.pathname === "/__reload/trigger") {
    if (!hasAdminAccess(req, url)) {
      denyAdminRoute(req, res);
      return true;
    }
    sendExternalReload(req, res, url);
    return true;
  }

  if (url.pathname === "/__reload") {
    if (!hasAdminAccess(req, url)) {
      denyAdminRoute(req, res);
      return true;
    }
    sendCacheReload(req, res, url);
    return true;
  }

  if (url.pathname === "/" || url.pathname === "/start") {
    sendHtml(req, res, paths.entryHtml, "no-store", (html) => prepareLocalHtml(req, url, html));
    return true;
  }

  if (tryServeGallery(req, res, url)) {
    return true;
  }

  if (url.pathname === "/offline") {
    sendFile(req, res, paths.offlineHtml, "no-store");
    return true;
  }

  if (url.pathname === "/resource" || url.pathname === "/resource/") {
    sendHtml(req, res, paths.resourceHtml, "no-store", (html) => prepareLocalHtml(req, url, html));
    return true;
  }

  if (url.pathname === "/resource/manage" || url.pathname === "/resource/manage/") {
    sendFile(req, res, paths.resourceManageHtml, "no-store");
    return true;
  }

  const authRoute = AUTH_ROUTES.get(url.pathname);
  if (authRoute) {
    const authPath = path.join(paths.public, authRoute);
    if (isReadableFile(authPath)) {
      sendFile(req, res, authPath, "no-store");
      return true;
    }
    sendJson(req, res, 404, {
      error: "AUTH_PAGE_NOT_FOUND",
      message: "香奈美没有找到这个账号入口。"
    });
    return true;
  }

  if (url.pathname === "/script.js") {
    sendFile(req, res, paths.sharedScript, "no-store");
    return true;
  }

  if (url.pathname === "/__reload-client.js") {
    sendFile(req, res, path.join(paths.public, "reload-client.js"), "no-store");
    return true;
  }

  if (url.pathname === "/local-runtime.js") {
    sendFile(req, res, path.join(paths.public, "local-runtime.js"), "no-store");
    return true;
  }

  if (url.pathname.startsWith("/res/")) {
    const assetPath = resolveInside(paths.sharedAssets, url.pathname.slice("/res/".length));
    if (assetPath && isReadableFile(assetPath)) {
      sendFile(req, res, assetPath, "no-store");
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
    const isAuthAsset = url.pathname.startsWith("/auth/");
    const isGalleryAsset = url.pathname.startsWith("/gallery/");
    const isResourceManageAsset = url.pathname.startsWith("/resource-manage/");
    const cacheControl = path.extname(publicPath).toLowerCase() === ".html" || isAuthAsset || isGalleryAsset || isResourceManageAsset
      ? "no-store"
      : "public, max-age=3600";
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
  if (!config.publicFilesEnabled || (!isAllowedMappedPath(requested) && !hasAdminAccess(req, url))) {
    sendJson(req, res, 403, {
      error: "FILE_ROUTE_RESTRICTED",
      message: "香奈美只公开已经登记的资源目录，其他映射文件先留在后台。"
    });
    return true;
  }

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
