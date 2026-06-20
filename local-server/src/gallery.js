import fs from "node:fs";
import path from "node:path";
import { paths } from "./config.js";

const GALLERY_ROUTES = new Set(["/gallery", "/gallery/"]);
const GALLERY_API_ROUTE = "/gallery/api";
const GALLERY_MEDIA_PREFIX = "/gallery/media/";

const IMAGE_MIME_TYPES = new Map([
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function sendJson(req, res, status, payload) {
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
  const type = IMAGE_MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "text/html; charset=utf-8";
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

function isReadableDirectory(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function safeRelative(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    return null;
  }
  return normalized;
}

function mediaUrl(folder, relativePath) {
  return `/gallery/media/${[folder, ...relativePath.split("/")].map(encodeURIComponent).join("/")}`;
}

function compactImage(folderName, image) {
  const file = safeRelative(image?.file);
  const thumbnail = safeRelative(image?.thumbnail);
  if (!file || !thumbnail) {
    return null;
  }

  return {
    folder: folderName,
    id: String(image.id ?? image.filename ?? ""),
    filename: String(image.filename ?? path.basename(file)),
    fileType: String(image.file_type ?? path.extname(file).slice(1)).toLowerCase(),
    fileSize: Number.isFinite(image.file_size) ? image.file_size : 0,
    createdAt: image.created_at ?? "",
    tags: Array.isArray(image.tags) ? image.tags.filter((tag) => typeof tag === "string") : [],
    description: typeof image.description === "string" ? image.description : "",
    originalName: typeof image.original_name === "string" ? image.original_name : "",
    thumbUrl: mediaUrl(folderName, thumbnail),
    fileUrl: mediaUrl(folderName, file)
  };
}

function readManifest() {
  const manifestPath = path.join(paths.gallery, "index.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const sourceFolders = manifest && typeof manifest.folders === "object" ? manifest.folders : {};
  const folders = [];
  const images = [];

  for (const [folderName, folder] of Object.entries(sourceFolders)) {
    const folderImages = Array.isArray(folder?.images)
      ? folder.images.map((image) => compactImage(folderName, image)).filter(Boolean)
      : [];

    folders.push({
      name: folderName,
      count: Number.isFinite(folder?.image_count) ? folder.image_count : folderImages.length
    });
    images.push(...folderImages);
  }

  folders.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });

  return {
    ok: true,
    generatedAt: manifest.generated_at ?? "",
    folderCount: Number.isFinite(manifest.folder_count) ? manifest.folder_count : folders.length,
    imageCount: Number.isFinite(manifest.image_count) ? manifest.image_count : images.length,
    folders,
    images
  };
}

export function galleryStatus() {
  const manifestPath = path.join(paths.gallery, "index.json");
  return {
    available: isReadableDirectory(paths.gallery) && isReadableFile(manifestPath),
    route: "/gallery",
    api: GALLERY_API_ROUTE,
    media: GALLERY_MEDIA_PREFIX,
    root: paths.gallery,
    manifest: manifestPath
  };
}

function sendGalleryPage(req, res) {
  const pagePath = path.join(paths.public, "gallery", "index.html");
  if (!isReadableFile(pagePath)) {
    sendJson(req, res, 404, {
      error: "GALLERY_PAGE_NOT_FOUND",
      message: "香奈美还没找到图库页面，等我把舞台灯打开一下。"
    });
    return;
  }
  sendFile(req, res, pagePath, "no-store");
}

function sendGalleryApi(req, res) {
  try {
    sendJson(req, res, 200, readManifest());
  } catch (error) {
    sendJson(req, res, 503, {
      error: "GALLERY_SOURCE_UNAVAILABLE",
      message: "香奈美暂时没读到 advanced_media 的图库清单。",
      root: paths.gallery,
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendGalleryMedia(req, res, url) {
  const requested = url.pathname.slice(GALLERY_MEDIA_PREFIX.length);
  const mediaPath = resolveInside(paths.gallery, requested);
  if (!mediaPath) {
    sendJson(req, res, 403, {
      error: "FORBIDDEN",
      message: "香奈美不能把图库外面的文件交出去。"
    });
    return;
  }

  const mimeType = IMAGE_MIME_TYPES.get(path.extname(mediaPath).toLowerCase());
  if (!mimeType) {
    sendJson(req, res, 415, {
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "这个文件不像图片，香奈美先不预览它。"
    });
    return;
  }

  if (!isReadableFile(mediaPath)) {
    sendJson(req, res, 404, {
      error: "GALLERY_MEDIA_NOT_FOUND",
      message: "香奈美没有在图库里找到这张图。"
    });
    return;
  }

  sendFile(req, res, mediaPath, "public, max-age=60");
}

export function tryServeGallery(req, res, url) {
  if (GALLERY_ROUTES.has(url.pathname)) {
    sendGalleryPage(req, res);
    return true;
  }

  if (url.pathname === GALLERY_API_ROUTE) {
    sendGalleryApi(req, res);
    return true;
  }

  if (url.pathname.startsWith(GALLERY_MEDIA_PREFIX)) {
    sendGalleryMedia(req, res, url);
    return true;
  }

  return false;
}
