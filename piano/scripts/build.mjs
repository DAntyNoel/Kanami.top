import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, cp, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const repo = path.dirname(root);
const dist = path.join(root, "dist");
const upstream = path.join(root, "upstream");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const manifest = JSON.parse(await readFile(path.join(upstream, "manifest.json"), "utf8"));

for (const entry of manifest.files) {
  const data = await readFile(path.join(upstream, entry.path));
  if (data.length !== entry.bytes || digest(data) !== entry.sha256) {
    throw new Error(`上游资源校验失败：${entry.path}`);
  }
}

let app = await readFile(path.join(upstream, "assets/index-BYn0JuRY.js"), "utf8");
function replaceOnce(before, after) {
  const count = app.split(before).length - 1;
  if (count !== 1) throw new Error(`预期一个适配位置，实际 ${count} 个：${before}`);
  app = app.replace(before, after);
}

// Keep the downloaded release intact; apply the small site adaptations only
// while building. These checks stop a future upstream update from silently
// dropping an adaptation.
replaceOnce("`钢琴窗 - Piano Roll`", "`和我一起编曲`");
replaceOnce("`关闭钢琴窗`", "`收起我的编曲窗`");
replaceOnce("`打开钢琴窗`", "`和我一起编曲`");
replaceOnce("`PAD `,e", "`音垫 `,e");
replaceOnce("onClick:e,className:`rounded p-1", "onClick:e,\"aria-label\":i?`暂停我的旋律`:`播放我的旋律`,className:`rounded p-1");
replaceOnce("onClick:t,className:`rounded p-1", "onClick:t,\"aria-label\":`停止播放`,className:`rounded p-1");
replaceOnce("onClick:n,className:`rounded p-1", "onClick:n,\"aria-label\":a?`结束我的录制`:`录下我的节拍`,\"aria-pressed\":a,className:`rounded p-1");
replaceOnce("onClick:()=>s({type:`SET_TOOL`,tool:`draw`}),className:", "onClick:()=>s({type:`SET_TOOL`,tool:`draw`}),\"aria-label\":`写下音符`,className:");
replaceOnce("onClick:()=>s({type:`SET_TOOL`,tool:`erase`}),className:", "onClick:()=>s({type:`SET_TOOL`,tool:`erase`}),\"aria-label\":`擦去音符`,className:");
replaceOnce("onMouseDown:()=>t(e),disabled:!n", "onPointerDown:()=>t(e),onKeyDown:r=>{if(!r.repeat&&(r.key===`Enter`||r.key===` `)){r.preventDefault();t(e)}},\"data-piano-pad\":e,\"aria-label\":`和我弹奏音垫 ${e}`,disabled:!n");
replaceOnce("fetch(`/ogg/${i}.ogg`).then(e=>e.arrayBuffer())", "fetch(`/ogg/${i}.ogg`).then(e=>{if(!e.ok)throw Error(`音色加载失败`);return e.arrayBuffer()})");
replaceOnce(".then(()=>a(!0)),()=>{n.close()}", ".then(()=>a(!0)).catch(()=>window.dispatchEvent(new Event(`piano-audio-error`))),()=>{n.close()}");

await mkdir(path.join(dist, "assets"), { recursive: true });
for (const entry of await readdir(path.join(dist, "assets"), { withFileTypes: true })) {
  if (entry.isFile() && /^(piano|kanami)-[a-f0-9]{12}\.(js|css)$/.test(entry.name)) {
    await unlink(path.join(dist, "assets", entry.name));
  }
}
const assets = {};
async function asset(key, name, content, ext) {
  const filename = `${name}-${digest(content).slice(0, 12)}.${ext}`;
  await writeFile(path.join(dist, "assets", filename), content);
  assets[key] = `/assets/${filename}`;
}
await asset("PIANO_SCRIPT", "piano", app, "js");
await asset("PIANO_STYLE", "piano", await readFile(path.join(upstream, "assets/index-B1FUi-qB.css")), "css");
await asset("KANAMI_STYLE", "kanami", [
  await readFile(path.join(repo, "games/shared/game-header.css"), "utf8"),
  await readFile(path.join(root, "site/piano.css"), "utf8")
].join("\n").replace(/\r\n/g, "\n"), "css");
await asset("KANAMI_SCRIPT", "kanami", [
  await readFile(path.join(repo, "res/scripts/header.js"), "utf8"),
  await readFile(path.join(root, "site/piano.js"), "utf8")
].join("\n").replace(/\r\n/g, "\n"), "js");

for (const name of ["index.html", "404.html"]) {
  let html = (await readFile(path.join(root, "site", name), "utf8")).replace(/\r\n/g, "\n");
  for (const [key, value] of Object.entries(assets)) html = html.replaceAll(`{{${key}}}`, value);
  if (/\{\{/.test(html)) throw new Error("页面包含尚未替换的资源路径");
  await writeFile(path.join(dist, name), html);
}
await cp(path.join(upstream, "ogg"), path.join(dist, "ogg"), { recursive: true });
await cp(path.join(repo, "res/images/favicon.png"), path.join(dist, "favicon.png"));
console.log(`已构建演奏台：${manifest.files.length} 个上游资源及本站页眉，仅发布 piano/dist。`);
