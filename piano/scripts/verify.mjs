import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = process.argv[2];
if (!base) throw new Error("用法：npm run verify -- http://127.0.0.1:12705/ 或 https://kanami.top/piano/");
const pageUrl = new URL(base.endsWith("/") ? base : `${base}/`);
const page = await fetch(pageUrl);
assert.equal(page.status, 200, "首页必须返回 200");
const html = await page.text();
assert.match(html, /我的小小演奏台/);
assert.match(html, /href="https:\/\/kanami.top\/"/);
assert.doesNotMatch(html, /\{\{/);

const assets = [...html.matchAll(/(?:src|href)="([^"<>]*assets\/[^"<>]+)"/g)].map((m) => new URL(m[1], page.url));
assert.equal(assets.length, 4, "页面应加载四个本站静态资源");
await Promise.all(assets.map(async (asset) => {
  const response = await fetch(asset);
  assert.equal(response.status, 200, asset.href);
  assert.match(response.headers.get("content-type"), asset.pathname.endsWith(".js") ? /javascript/ : /css/);
  const hash = createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
  assert.equal(hash.slice(0, 12), asset.pathname.match(/-([a-f0-9]{12})\./)[1], asset.href);
}));
const app = assets.find((asset) => /\/piano-[a-f0-9]{12}\.js$/.test(asset.pathname));
assert.ok(app, "页面应加载演奏台脚本");
const manifest = JSON.parse(await readFile(new URL("../upstream/manifest.json", import.meta.url), "utf8"));
await Promise.all(Array.from({ length: 16 }, async (_, index) => {
  const relative = `ogg/${index + 1}.ogg`;
  const url = new URL(`../${relative}`, app);
  const response = await fetch(url);
  assert.equal(response.status, 200, url.href);
  assert.match(response.headers.get("content-type"), /audio\/ogg/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "OggS", url.href);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.files.find((entry) => entry.path === relative).sha256, url.href);
}));
for (const relative of ["missing.ogg", ".env", "upstream/manifest.json", "package.json", "scripts/build.mjs", "site/index.html", "README.html"]) {
  const url = new URL(relative, page.url);
  assert.equal((await fetch(url)).status, 404, url.href);
}
console.log(`验证通过：${page.url} 首页、4 个脚本/样式和 16 个音色的内容哈希，以及未公开路径。`);
