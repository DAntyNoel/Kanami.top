import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, paths } from "./config.js";
import { sendJson } from "./static.js";

export const RESOURCE_GROUPS = [
  { id: "emotes", label: "表情包", file: "emotes.json", manageable: true },
  { id: "wallpapers", label: "壁纸", file: "story_wallpapers.json", manageable: true },
  { id: "outfits", label: "时装建模", file: "outfits.json", manageable: true },
  { id: "audio", label: "语音音乐", file: "audio.json", manageable: true },
  { id: "character", label: "角色设定", file: "character.json", manageable: true },
  { id: "weapons", label: "武器", file: "weapons.json", manageable: true },
  { id: "skills", label: "技能", file: "skills.json", manageable: true },
  { id: "imprints", label: "印迹", file: "imprints.json", manageable: true },
  { id: "network", label: "增幅网络", file: "amplification_network.json", manageable: true },
  { id: "updates", label: "更新图", file: "update_history.json", manageable: true },
  { id: "oath", label: "誓约文本", file: "oath_texts.json", manageable: false }
];

const API_PREFIX = "/api/resource/manage";
const MAX_JSON_BYTES = 26 * 1024 * 1024;
const MANAGED_MEDIA_PREFIX = "/files/WIKI/images/managed/";
const MIME_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["application/pdf", "pdf"],
  ["application/zip", "zip"],
  ["text/plain", "txt"]
]);

function requestHost(req) {
  return String(req.headers.host || "").split(":")[0].toLowerCase();
}

function isLocalHost(req) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(requestHost(req));
}

function hasAdminAccess(req, url) {
  if (isLocalHost(req)) return true;
  if (!config.adminToken) return false;
  return req.headers["x-kanami-admin-token"] === config.adminToken || url.searchParams.get("token") === config.adminToken;
}

function groupById(id) {
  return RESOURCE_GROUPS.find((group) => group.id === id) || null;
}

function wikiFilePath(group) {
  return path.join(paths.files, "WIKI", group.file);
}

function managedMediaDir() {
  return path.join(paths.files, "WIKI", "images", "managed");
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function readGroupData(group) {
  const data = readJsonFile(wikiFilePath(group), {});
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error(`${group.file} is not a manageable object map`);
  }
  return data;
}

function writeGroupData(group, data) {
  writeJsonFile(wikiFilePath(group), data);
}

function groupItems(group) {
  if (!group.manageable) return [];
  const data = readGroupData(group);
  return Object.entries(data).map(([url, meta], index) => ({
    id: url,
    url,
    group: group.id,
    index,
    title: meta?.title || path.basename(url),
    meta: meta || {}
  }));
}

function groupCount(group) {
  if (!group.manageable) return 0;
  return Object.keys(readGroupData(group)).length;
}

function sendManageError(req, res, status, error, message, detail) {
  sendJson(req, res, status, {
    ok: false,
    error,
    message,
    ...(detail ? { detail } : {})
  });
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function searchItems(items, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => {
    const haystack = [
      item.url,
      item.title,
      item.meta.type,
      item.meta.section,
      item.meta.subsection,
      item.meta.language,
      item.meta.voiceType,
      item.meta.voiceTag,
      item.meta.text
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

function reorderObject(data, id, toIndex) {
  const entries = Object.entries(data);
  const fromIndex = entries.findIndex(([key]) => key === id);
  if (fromIndex === -1) return null;
  const [entry] = entries.splice(fromIndex, 1);
  const boundedIndex = Math.max(0, Math.min(Number(toIndex), entries.length));
  entries.splice(boundedIndex, 0, entry);
  return Object.fromEntries(entries);
}

function insertObjectEntry(data, id, value, toIndex) {
  const entries = Object.entries(data).filter(([key]) => key !== id);
  const boundedIndex = Number.isFinite(Number(toIndex))
    ? Math.max(0, Math.min(Number(toIndex), entries.length))
    : entries.length;
  entries.splice(boundedIndex, 0, [id, value]);
  return Object.fromEntries(entries);
}

function safeTitle(value, fallback) {
  const title = String(value || "").trim();
  return title || fallback;
}

function extensionFromUpload(fileName, mimeType) {
  const fromMime = MIME_EXTENSIONS.get(String(mimeType || "").toLowerCase());
  if (fromMime) return fromMime;
  const fromName = path.extname(String(fileName || "")).replace(".", "").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(fromName) ? fromName : "bin";
}

function mediaTypeFromMime(mimeType) {
  if (String(mimeType || "").startsWith("image/")) return "image";
  if (String(mimeType || "").startsWith("audio/")) return "audio";
  return "file";
}

function mediaTypeFromExtension(extension) {
  const normalized = String(extension || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(normalized)) return "image";
  if (["mp3", "wav", "ogg", "m4a"].includes(normalized)) return "audio";
  return "file";
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(String(url), "http://kanami.local").pathname;
    const extension = path.extname(pathname).replace(".", "").toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "";
  } catch {
    return "";
  }
}

function csvCellValue(key, value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return undefined;
  if (["width", "height", "occurrences"].includes(String(key))) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : undefined;
  }
  if (trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => String(value).trim() !== "") || rows.length === 0) rows.push(row);
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((value) => String(value || "").trim());
  return dataRows
    .map((values, index) => ({
      line: index + 2,
      record: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]))
    }))
    .filter(({ record }) => Object.values(record).some((value) => String(value).trim() !== ""));
}

function parseUploadPayload(body) {
  if (body.dataUrl) {
    const match = String(body.dataUrl).match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/u);
    if (!match) throw new Error("INVALID_DATA_URL");
    return {
      mimeType: body.mimeType || match[1] || "application/octet-stream",
      buffer: Buffer.from(match[2], "base64")
    };
  }

  if (body.dataBase64) {
    return {
      mimeType: body.mimeType || "application/octet-stream",
      buffer: Buffer.from(String(body.dataBase64), "base64")
    };
  }

  throw new Error("UPLOAD_DATA_REQUIRED");
}

function managedFilePathFromUrl(url) {
  if (!String(url).startsWith(MANAGED_MEDIA_PREFIX)) return null;
  const relative = String(url).slice("/files/".length);
  const absolutePath = path.resolve(paths.files, relative);
  const relativePath = path.relative(paths.files, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return absolutePath;
}

function deleteManagedFile(url) {
  const filePath = managedFilePathFromUrl(url);
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

async function handleGroups(req, res) {
  const groups = RESOURCE_GROUPS.map((group) => ({
    ...group,
    count: groupCount(group)
  }));
  sendJson(req, res, 200, { ok: true, groups });
}

async function handleItems(req, res, url) {
  const group = groupById(url.searchParams.get("group"));
  if (!group || !group.manageable) {
    sendManageError(req, res, 400, "INVALID_GROUP", "香奈美没有找到这个可管理分类。");
    return;
  }

  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10));
  const limit = Math.min(1000, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "240", 10)));
  const allItems = searchItems(groupItems(group), url.searchParams.get("query"));
  sendJson(req, res, 200, {
    ok: true,
    group: group.id,
    total: allItems.length,
    items: allItems.slice(offset, offset + limit)
  });
}

async function handleUpload(req, res, body) {
  const group = groupById(body.group);
  if (!group || !group.manageable) {
    sendManageError(req, res, 400, "INVALID_GROUP", "香奈美还不能把文件放进这个分类。");
    return;
  }

  const { mimeType, buffer } = parseUploadPayload(body);
  if (!buffer.length) {
    sendManageError(req, res, 400, "EMPTY_UPLOAD", "香奈美没有读到要上传的文件。");
    return;
  }

  const extension = extensionFromUpload(body.fileName, mimeType);
  const mediaType = mediaTypeFromMime(mimeType);
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 10);
  const safeBaseName = path.basename(String(body.fileName || "kanami-resource"))
    .replace(/\.[^.]+$/u, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "kanami-resource";
  const fileName = `${Date.now()}-${hash}-${safeBaseName}.${extension}`;
  const outputDir = managedMediaDir();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, fileName), buffer);

  const resourceUrl = `${MANAGED_MEDIA_PREFIX}${fileName}`;
  const title = safeTitle(body.title || body.metadata?.title, body.fileName || fileName);
  const meta = {
    title,
    type: body.metadata?.type || group.id,
    section: body.metadata?.section || "香奈美管理台",
    subsection: body.metadata?.subsection || "管理上传",
    mediaType,
    extension,
    thumbnailUrl: body.metadata?.thumbnailUrl || null,
    sourcePage: body.metadata?.sourcePage || "/resource/manage",
    width: body.metadata?.width ?? null,
    height: body.metadata?.height ?? null,
    occurrences: body.metadata?.occurrences ?? 1,
    ...body.metadata,
    title,
    mediaType,
    extension
  };

  const data = readGroupData(group);
  writeGroupData(group, insertObjectEntry(data, resourceUrl, meta, body.toIndex));
  sendJson(req, res, 201, { ok: true, group: group.id, item: { id: resourceUrl, url: resourceUrl, meta, title } });
}

async function handleUpdateItem(req, res, body) {
  const group = groupById(body.group);
  if (!group || !group.manageable || !body.id) {
    sendManageError(req, res, 400, "INVALID_ITEM", "香奈美没有找到要修改的收藏。");
    return;
  }

  const sourceData = readGroupData(group);
  const current = sourceData[body.id];
  if (!current) {
    sendManageError(req, res, 404, "ITEM_NOT_FOUND", "这个收藏已经不在当前分类里啦。");
    return;
  }

  const nextMeta = {
    ...current,
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {})
  };
  if (body.title !== undefined) nextMeta.title = safeTitle(body.title, current.title || path.basename(body.id));

  const targetGroup = body.targetGroup ? groupById(body.targetGroup) : group;
  if (!targetGroup || !targetGroup.manageable) {
    sendManageError(req, res, 400, "INVALID_TARGET_GROUP", "香奈美还不能移动到这个分类。");
    return;
  }

  if (targetGroup.id === group.id) {
    sourceData[body.id] = nextMeta;
    const nextData = Number.isFinite(Number(body.toIndex))
      ? reorderObject(sourceData, body.id, body.toIndex)
      : sourceData;
    writeGroupData(group, nextData || sourceData);
  } else {
    delete sourceData[body.id];
    const targetData = readGroupData(targetGroup);
    writeGroupData(group, sourceData);
    writeGroupData(targetGroup, insertObjectEntry(targetData, body.id, nextMeta, body.toIndex));
  }

  sendJson(req, res, 200, {
    ok: true,
    item: { id: body.id, url: body.id, group: targetGroup.id, title: nextMeta.title || path.basename(body.id), meta: nextMeta }
  });
}

async function handleReorder(req, res, body) {
  const group = groupById(body.group);
  if (!group || !group.manageable || !body.id || !Number.isFinite(Number(body.toIndex))) {
    sendManageError(req, res, 400, "INVALID_REORDER", "香奈美需要知道要移动哪一项和目标位置。");
    return;
  }

  const data = readGroupData(group);
  const nextData = reorderObject(data, body.id, Number(body.toIndex));
  if (!nextData) {
    sendManageError(req, res, 404, "ITEM_NOT_FOUND", "这个收藏已经不在当前分类里啦。");
    return;
  }

  writeGroupData(group, nextData);
  sendJson(req, res, 200, { ok: true, group: group.id, id: body.id, toIndex: Number(body.toIndex) });
}

async function handleDeleteItem(req, res, url) {
  const group = groupById(url.searchParams.get("group"));
  const id = url.searchParams.get("id");
  if (!group || !group.manageable || !id) {
    sendManageError(req, res, 400, "INVALID_ITEM", "香奈美没有找到要删除的收藏。");
    return;
  }

  const data = readGroupData(group);
  if (!data[id]) {
    sendManageError(req, res, 404, "ITEM_NOT_FOUND", "这个收藏已经不在当前分类里啦。");
    return;
  }
  delete data[id];
  writeGroupData(group, data);

  let fileDeleted = false;
  if (url.searchParams.get("deleteFile") === "true") {
    fileDeleted = deleteManagedFile(id);
  }

  sendJson(req, res, 200, { ok: true, group: group.id, id, fileDeleted });
}

async function handleBulkDelete(req, res, body) {
  const group = groupById(body.group);
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!group || !group.manageable || !ids.length) {
    sendManageError(req, res, 400, "INVALID_BULK_DELETE", "香奈美需要知道要批量删除哪些收藏。");
    return;
  }

  const data = readGroupData(group);
  const deleted = [];
  const missing = [];
  let filesDeleted = 0;

  for (const id of ids) {
    if (!data[id]) {
      missing.push(id);
      continue;
    }
    delete data[id];
    deleted.push(id);
    if (body.deleteFiles === true && deleteManagedFile(id)) filesDeleted += 1;
  }

  writeGroupData(group, data);
  sendJson(req, res, 200, {
    ok: true,
    group: group.id,
    deleted,
    missing,
    filesDeleted
  });
}

function importMetaFromRecord(record) {
  const url = String(record.url || record.id || "").trim();
  if (!url) return null;
  const extension = String(csvCellValue("extension", record.extension) || extensionFromUrl(url) || "file").toLowerCase();
  const mediaType = String(csvCellValue("mediaType", record.mediaType) || mediaTypeFromExtension(extension));
  const meta = {
    title: safeTitle(record.title, path.basename(url)),
    type: csvCellValue("type", record.type),
    section: csvCellValue("section", record.section),
    subsection: csvCellValue("subsection", record.subsection),
    mediaType,
    extension,
    thumbnailUrl: csvCellValue("thumbnailUrl", record.thumbnailUrl) ?? null,
    sourcePage: csvCellValue("sourcePage", record.sourcePage) || "/resource/manage",
    width: csvCellValue("width", record.width) ?? null,
    height: csvCellValue("height", record.height) ?? null,
    occurrences: csvCellValue("occurrences", record.occurrences) ?? 1
  };

  for (const [key, value] of Object.entries(record)) {
    if (["url", "id", "title", "type", "section", "subsection", "mediaType", "extension", "thumbnailUrl", "sourcePage", "width", "height", "occurrences"].includes(key)) {
      continue;
    }
    const normalizedValue = csvCellValue(key, value);
    if (normalizedValue !== undefined) meta[key] = normalizedValue;
  }

  return { url, meta };
}

async function handleCsvImport(req, res, body) {
  const group = groupById(body.group);
  if (!group || !group.manageable || !body.csv) {
    sendManageError(req, res, 400, "INVALID_CSV_IMPORT", "香奈美需要一个目标分类和 CSV 内容。");
    return;
  }

  const rows = parseCsv(String(body.csv));
  if (!rows.length) {
    sendManageError(req, res, 400, "EMPTY_CSV", "CSV 里还没有可以导入的收藏。");
    return;
  }

  const data = readGroupData(group);
  let nextData = data;
  let created = 0;
  let updated = 0;
  const skipped = [];

  for (const { line, record } of rows) {
    const imported = importMetaFromRecord(record);
    if (!imported) {
      skipped.push({ line, reason: "缺少 url" });
      continue;
    }
    const exists = Object.hasOwn(nextData, imported.url);
    const meta = exists ? { ...nextData[imported.url], ...imported.meta } : imported.meta;
    nextData = insertObjectEntry(nextData, imported.url, meta, body.toIndex);
    if (exists) updated += 1;
    else created += 1;
  }

  writeGroupData(group, nextData);
  sendJson(req, res, 200, {
    ok: true,
    group: group.id,
    created,
    updated,
    skipped,
    total: rows.length
  });
}

export async function tryHandleResourceManageApi(req, res, url) {
  if (!url.pathname.startsWith(API_PREFIX)) return false;

  if (!hasAdminAccess(req, url)) {
    sendManageError(req, res, 401, "ADMIN_ACCESS_REQUIRED", "香奈美把资源管理台锁好啦，请先输入管理口令。");
    return true;
  }

  try {
    const route = url.pathname.slice(API_PREFIX.length) || "/";
    if (req.method === "GET" && route === "/session") {
      sendJson(req, res, 200, { ok: true, admin: true, local: isLocalHost(req) });
      return true;
    }
    if (req.method === "GET" && route === "/groups") {
      await handleGroups(req, res);
      return true;
    }
    if (req.method === "GET" && route === "/items") {
      await handleItems(req, res, url);
      return true;
    }
    if (req.method === "POST" && route === "/upload") {
      await handleUpload(req, res, await readRequestJson(req));
      return true;
    }
    if (req.method === "PATCH" && route === "/item") {
      await handleUpdateItem(req, res, await readRequestJson(req));
      return true;
    }
    if (req.method === "POST" && route === "/reorder") {
      await handleReorder(req, res, await readRequestJson(req));
      return true;
    }
    if (req.method === "DELETE" && route === "/item") {
      await handleDeleteItem(req, res, url);
      return true;
    }
    if (req.method === "POST" && route === "/bulk-delete") {
      await handleBulkDelete(req, res, await readRequestJson(req));
      return true;
    }
    if (req.method === "POST" && route === "/csv-import") {
      await handleCsvImport(req, res, await readRequestJson(req));
      return true;
    }

    sendManageError(req, res, 404, "API_NOT_FOUND", "香奈美没有找到这个资源管理 API。");
    return true;
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === "INVALID_JSON") {
      sendManageError(req, res, 400, "INVALID_JSON", "香奈美没有读懂这次提交的数据。");
      return true;
    }
    if (code === "REQUEST_TOO_LARGE") {
      sendManageError(req, res, 413, "REQUEST_TOO_LARGE", "这个文件太大啦，香奈美这次先接不住。");
      return true;
    }
    sendManageError(req, res, 500, "RESOURCE_MANAGE_ERROR", "香奈美管理资源时卡住了。", code);
    return true;
  }
}
