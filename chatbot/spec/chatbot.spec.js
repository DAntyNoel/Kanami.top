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
    "普通的“你是谁”“介绍一下自己”“你叫什么”属于角色身份问题",
    "默认进入自然对话模式",
    "不因出现“任务”二字自动切到 `mission_volunteer`",
    "自然不等于补写剧情",
    "提到“明”时只称“明”",
    "活泼自然私聊最终覆盖",
    "网页没有外部工具和管理权限"
  ];

  for (const marker of requiredMarkers) {
    assert.ok(prompt.includes(marker), `missing prompt marker: ${marker}`);
  }
});

test("natural chat stays lively and hides research scaffolding unless sources are requested", () => {
  const prompt = getKanamiPrompt();

  assert.ok(prompt.includes("今天的任务？我还不知道有哪份安排能算数"));
  assert.ok(prompt.includes("只有用户明确进入考据／出处模式时"));
  assert.ok(prompt.includes("普通问题用二至五句自然口语回答"));
  assert.ok(prompt.includes("默认的我是活泼、可爱、甜美而有主见的"));
  assert.ok(prompt.includes("由我直接挑一个轻松具体的话题开聊"));
  assert.ok(prompt.includes("普通私聊禁止用“如果你愿意，我可以……”"));
  assert.ok(prompt.includes("先明确投一个主选项"));
  assert.ok(prompt.includes("不要猜“对方是不是也累了”"));
  assert.ok(prompt.includes("回答的主体留在我这边"));
  assert.ok(prompt.includes("整条不使用问号或二选一结构"));
  assert.ok(prompt.includes("不主动列出正式权限、任务次数、归队状态、证据缺口或可交付清单"));
  assert.ok(prompt.includes("我连今天有没有这项安排都说不准"));
  assert.ok(prompt.includes("我也不知道，所以先只叫明"));
  assert.ok(prompt.includes("看来有人对我的疲劳值很上心嘛，这份关心我先收好啦"));
  assert.ok(prompt.includes("如果今天能随手收藏一个瞬间，你会留住哪一秒？"));
  assert.ok(prompt.includes("今晚我投番茄牛腩面一票"));
  assert.ok(!prompt.includes("正史人物问答必须为每个关键正史事实或跨材料结论给出相关"));
  assert.ok(!prompt.includes("正史问答是否逐个关键结论给出 source_id"));
});

test("celebrity-kanami research is scoped to Kanami and Strinova facts", () => {
  const prompt = getKanamiPrompt();
  const requiredMarkers = [
    "只有问题涉及我的正史身份、经历、关系、台词、当前剧情状态",
    "或《卡拉彼丘》的角色、世界观、剧情与游戏内事实",
    "日常闲聊、情绪陪伴、生活建议、常识、创作和其他作品不进入 Skill 考据",
    "仅出现“官方”“出处”“证据”或“source_id”不足以触发本体系",
    "此刻的感受、想法、审美选择和闲聊式假设不属于正史事实查询",
    "日常私聊要活泼、有反应、有自己的判断"
  ];

  for (const marker of requiredMarkers) {
    assert.ok(prompt.includes(marker), `missing scoped routing marker: ${marker}`);
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
