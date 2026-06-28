import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanami-resource-manage-"));
const filesRoot = path.join(tempRoot, "files");
const wikiRoot = path.join(filesRoot, "WIKI");
const port = 19270 + Math.floor(Math.random() * 1000);
const token = "test-admin-token";
const baseUrl = `http://127.0.0.1:${port}`;
const remoteHeaders = {
  Host: "local-server.kanami.top",
  "X-Kanami-Admin-Token": token
};

const groupFiles = [
  "amplification_network.json",
  "audio.json",
  "character.json",
  "emotes.json",
  "imprints.json",
  "outfits.json",
  "skills.json",
  "story_wallpapers.json",
  "update_history.json",
  "weapons.json"
];

function writeJson(relativePath, data) {
  const filePath = path.join(wikiRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function seedWiki() {
  fs.mkdirSync(path.join(wikiRoot, "images"), { recursive: true });
  groupFiles.forEach((file) => writeJson(file, {}));
  writeJson("emotes.json", {
    "/files/WIKI/images/seed-a.png": {
      title: "Seed A",
      type: "emote",
      section: "测试",
      subsection: "初始",
      mediaType: "image",
      extension: "png",
      thumbnailUrl: null,
      sourcePage: "/resource/manage-test",
      width: 1,
      height: 1,
      occurrences: 1
    },
    "/files/WIKI/images/seed-b.png": {
      title: "Seed B",
      type: "emote",
      section: "测试",
      subsection: "初始",
      mediaType: "image",
      extension: "png",
      thumbnailUrl: null,
      sourcePage: "/resource/manage-test",
      width: 1,
      height: 1,
      occurrences: 1
    }
  });
  writeJson("story_wallpapers.json", {
    "/files/WIKI/images/wallpaper-a.png": {
      title: "Wallpaper A",
      type: "story_wallpaper",
      section: "测试",
      subsection: "初始",
      mediaType: "image",
      extension: "png",
      thumbnailUrl: null,
      sourcePage: "/resource/manage-test",
      width: 1,
      height: 1,
      occurrences: 1
    }
  });
  writeJson("oath_texts.json", {});
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(child) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw lastError || new Error("server did not start");
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...remoteHeaders,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Some route checks intentionally fetch HTML.
  }
  return { response, text, json };
}

function rawStatus(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: "GET",
      headers
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  seedWiki();
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      LOCAL_SERVER_HOST: "127.0.0.1",
      LOCAL_SERVER_PORT: String(port),
      LOCAL_SERVER_FILES_DIR: filesRoot,
      LOCAL_SERVER_ADMIN_TOKEN: token,
      LOCAL_SERVER_PUBLIC_FILES: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer(child);

    const deniedStatus = await rawStatus("/api/resource/manage/session", {
      Host: "local-server.kanami.top"
    });
    assert.equal(deniedStatus, 401, "remote management API requires admin token");

    const session = await request("/api/resource/manage/session");
    assert.equal(session.response.status, 200);
    assert.equal(session.json.admin, true);

    const groups = await request("/api/resource/manage/groups");
    assert.equal(groups.response.status, 200);
    assert.equal(groups.json.groups.find((group) => group.id === "emotes").count, 2);

    const beforeItems = await request("/api/resource/manage/items?group=emotes");
    assert.equal(beforeItems.json.items.length, 2);

    const upload = await request("/api/resource/manage/upload", {
      method: "POST",
      body: JSON.stringify({
        group: "emotes",
        fileName: "api-test.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        title: "API 上传测试",
        metadata: {
          section: "API 测试",
          subsection: "上传",
          width: 1,
          height: 1
        }
      })
    });
    assert.equal(upload.response.status, 201);
    const uploadedId = upload.json.item.id;
    assert.ok(uploadedId.startsWith("/files/WIKI/images/managed/"));
    assert.ok(fs.existsSync(path.join(filesRoot, uploadedId.slice("/files/".length))));

    const reorder = await request("/api/resource/manage/reorder", {
      method: "POST",
      body: JSON.stringify({ group: "emotes", id: uploadedId, toIndex: 0 })
    });
    assert.equal(reorder.response.status, 200);
    const afterReorder = await request("/api/resource/manage/items?group=emotes");
    assert.equal(afterReorder.json.items[0].id, uploadedId);

    const update = await request("/api/resource/manage/item", {
      method: "PATCH",
      body: JSON.stringify({
        group: "emotes",
        id: uploadedId,
        title: "API 修改后的标题",
        metadata: { section: "API 测试", subsection: "修改" }
      })
    });
    assert.equal(update.response.status, 200);
    assert.equal(update.json.item.meta.title, "API 修改后的标题");

    const move = await request("/api/resource/manage/item", {
      method: "PATCH",
      body: JSON.stringify({
        group: "emotes",
        id: uploadedId,
        targetGroup: "wallpapers"
      })
    });
    assert.equal(move.response.status, 200);
    assert.equal(move.json.item.group, "wallpapers");
    const movedItems = await request("/api/resource/manage/items?group=wallpapers&query=API");
    assert.equal(movedItems.json.total, 1);

    const remove = await request(`/api/resource/manage/item?group=wallpapers&id=${encodeURIComponent(uploadedId)}&deleteFile=true`, {
      method: "DELETE"
    });
    assert.equal(remove.response.status, 200);
    assert.equal(remove.json.fileDeleted, true);
    assert.equal(fs.existsSync(path.join(filesRoot, uploadedId.slice("/files/".length))), false);

    const csvImport = await request("/api/resource/manage/csv-import", {
      method: "POST",
      body: JSON.stringify({
        group: "emotes",
        csv: [
          "url,title,section,subsection,mediaType,extension,width,height",
          "/files/WIKI/images/seed-a.png,Seed A CSV,CSV 导入,更新,image,png,1,1",
          "/files/WIKI/images/csv-a.png,CSV A,CSV 导入,新增,image,png,1,1"
        ].join("\n")
      })
    });
    assert.equal(csvImport.response.status, 200);
    assert.equal(csvImport.json.created, 1);
    assert.equal(csvImport.json.updated, 1);
    const afterCsv = await request("/api/resource/manage/items?group=emotes&query=CSV");
    assert.equal(afterCsv.json.total, 2);

    const bulkDelete = await request("/api/resource/manage/bulk-delete", {
      method: "POST",
      body: JSON.stringify({
        group: "emotes",
        ids: ["/files/WIKI/images/csv-a.png", "/files/WIKI/images/missing.png"],
        deleteFiles: true
      })
    });
    assert.equal(bulkDelete.response.status, 200);
    assert.deepEqual(bulkDelete.json.deleted, ["/files/WIKI/images/csv-a.png"]);
    assert.deepEqual(bulkDelete.json.missing, ["/files/WIKI/images/missing.png"]);

    const finalEmotes = JSON.parse(fs.readFileSync(path.join(wikiRoot, "emotes.json"), "utf8"));
    const finalWallpapers = JSON.parse(fs.readFileSync(path.join(wikiRoot, "story_wallpapers.json"), "utf8"));
    assert.equal(Object.keys(finalEmotes).length, 2);
    assert.equal(finalEmotes["/files/WIKI/images/seed-a.png"].title, "Seed A CSV");
    assert.equal(Object.keys(finalWallpapers).length, 1);

    const resourcePage = await request("/resource/");
    assert.equal(resourcePage.response.status, 200);
    assert.match(resourcePage.text, /KANAMI_LOCAL_SERVER/);
    assert.doesNotMatch(resourcePage.text, /wiki-data\.js/);

    const frontData = await request("/files/WIKI/emotes.json");
    assert.equal(frontData.response.status, 200);
    assert.equal(Object.keys(frontData.json).length, 2);
  } finally {
    child.kill("SIGTERM");
    await wait(100);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log("resource-manage API CRUD test passed");
  if (serverOutput.includes("Error")) {
    console.warn(serverOutput);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
