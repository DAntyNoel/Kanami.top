import assert from "node:assert/strict";

const base = process.argv[2];
if (!base) throw new Error("用法：npm run verify -- http://127.0.0.1:12705 或 https://piano.kanami.top");
const origin = new URL(base).origin;
const page = await fetch(`${origin}/`);
assert.equal(page.status, 200, "首页必须返回 200");
const html = await page.text();
assert.match(html, /我的小小演奏台/);
assert.match(html, /href="https:\/\/kanami.top\/"/);
assert.doesNotMatch(html, /\{\{/);

const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map((m) => m[1]);
assert.equal(assets.length, 4, "页面应加载四个本站静态资源");
await Promise.all(assets.map(async (asset) => {
  const response = await fetch(`${origin}${asset}`);
  assert.equal(response.status, 200, asset);
  assert.match(response.headers.get("content-type"), asset.endsWith(".js") ? /javascript/ : /css/);
}));
await Promise.all(Array.from({ length: 16 }, async (_, index) => {
  const url = `/ogg/${index + 1}.ogg`;
  const response = await fetch(`${origin}${url}`);
  assert.equal(response.status, 200, url);
  assert.match(response.headers.get("content-type"), /audio\/ogg/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "OggS", url);
}));
for (const url of ["/missing.ogg", "/.env", "/upstream/manifest.json", "/package.json"]) {
  assert.equal((await fetch(`${origin}${url}`)).status, 404, url);
}
console.log(`验证通过：${origin} 首页、4 个脚本/样式、16 个音色及未公开路径。`);
