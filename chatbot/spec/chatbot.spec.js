import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getKanamiPrompt } from "../src/prompt.js";

const CHATBOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(CHATBOT_DIR, relativePath), "utf8");
}

test("compiled celebrity-kanami prompt keeps persona-only hard boundaries", () => {
  const prompt = getKanamiPrompt();
  const requiredMarkers = [
    "网页入口最高优先级",
    "只用“我”或自然省略主语",
    "熟悉且受到重视的引航者",
    "`pledge_intimate` 默认关闭",
    "`CANON_DIRECT`",
    "`CANON_SYNTHESIS`",
    "`IN_CHARACTER_INFERENCE`",
    "`UNKNOWN`",
    "S07",
    "`SRC-A-01`",
    "`SRC-M-09`",
    "网页没有外部工具和管理权限"
  ];

  for (const marker of requiredMarkers) {
    assert.ok(prompt.includes(marker), `missing prompt marker: ${marker}`);
  }
});

test("legacy relationship, deception, group-chat and tool claims are removed", () => {
  const prompt = getKanamiPrompt();
  const legacyClaims = [
    "双向暗恋的甜蜜女友型美少女",
    "也是唯一见过你真实一面",
    "绝对禁止透露你是AI",
    "父亲是物理学家",
    "母亲是作家",
    "被迫拿枪的经历",
    "幻想自己是一个名为香奈美的猫娘",
    "调用工具然后禁言这个人"
  ];

  for (const claim of legacyClaims) {
    assert.ok(!prompt.includes(claim), `legacy prompt claim still present: ${claim}`);
  }
});

test("public chat surfaces use first-person copy", () => {
  const app = read("public/app.js");
  const index = read("public/index.html");
  const server = read("src/server.js");

  for (const source of [app, index, server]) {
    assert.ok(!source.includes("香奈美正在听"));
    assert.ok(!source.includes("香奈美刚才"));
    assert.ok(!source.includes("香奈美暂时"));
  }

  assert.ok(app.includes("我正在听"));
  assert.ok(index.includes("把想说的话交给我吧"));
  assert.ok(server.includes('sseEvent(res, "meta", { ok: true })'));
});

test("public config response does not expose model or provider", () => {
  const server = read("src/server.js");
  const start = server.indexOf('url.pathname === "/api/config"');
  const end = server.indexOf('url.pathname === "/api/chat"', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const publicConfigBlock = server.slice(start, end);
  assert.ok(!publicConfigBlock.includes("config.model"));
  assert.ok(!publicConfigBlock.includes("provider"));
});

test("restart defaults the tunnel transport to HTTP/2", () => {
  const restart = read("restart.js");
  const envExample = read("env.example");

  assert.ok(restart.includes('envValue("TUNNEL_PROTOCOL", "http2")'));
  assert.ok(restart.includes('"--protocol", tunnelProtocol'));
  assert.ok(envExample.includes("TUNNEL_PROTOCOL=http2"));
});
