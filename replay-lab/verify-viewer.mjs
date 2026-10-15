import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = (await import("node:url")).fileURLToPath(
  new URL("../", import.meta.url),
);
if (!process.argv[2])
  throw Error("Usage: node verify-viewer.mjs path/to/playback.json");
const html = await fs.readFile(root + "replay-lab/web/index.html", "utf8");
const code = await fs.readFile(root + "replay-lab/web/app.js", "utf8");
const playback = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
const characters = JSON.parse(await fs.readFile(root + "replay-lab/web/characters/manifest.json", "utf8"));
const dom = new JSDOM(html, {
  url: "http://127.0.0.1:8766/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const w = dom.window;
const canvasCalls = [];
const fakeContext = new Proxy(
  Object.fromEntries(["arc", "ellipse", "fillText", "drawImage", "rotate"].map((method) => [method, (...args) => canvasCalls.push({ method, args, color: fakeContext.fillStyle })])),
  {
    get: (target, key) => target[key] ?? (() => {}),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  },
);
w.HTMLCanvasElement.prototype.getContext = () => fakeContext;
w.HTMLElement.prototype.getBoundingClientRect = () => ({
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  width: 900,
  height: 600,
  right: 900,
  bottom: 600,
});
w.ResizeObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {
    this.cb();
  }
};
w.requestAnimationFrame = () => 0;
w.Image = class {
  set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); }
};
w.fetch = async (url) => ({ ok: true, json: async () => url === "characters/manifest.json" ? characters : playback });
const wrapped =
  "(async()=>{" +
  code +
  "\nreturn {clock,position,install,seek,draw,animate,stateAt,statusAt,vitalsAt,eventDetails,isStringified,characterInfo,characterAt,xy,viewState:()=>({activeMap,mapImage,viewBounds,yDirection,camera:{...camera}}),decodeData:()=>data,timeNow:()=>time,isPlaying:()=>playing};})()";
const api = await w.eval(wrapped);
const $ = (id) => w.document.getElementById(id);
assert.equal($("players").children.length, playback.players.length);
assert.equal($("round-markers").children.length, playback.rounds.length);
assert.equal($("message").textContent, "");
for (const player of playback.players) {
  for (const appearance of player.appearances) {
    const role = api.characterInfo(appearance.character);
    assert(role, `mapped replay character: ${appearance.character}`);
    assert.equal(role.id, api.stateAt(player, appearance.from_ms).SelectRoleId,
      "internal character name agrees with independently replicated role ID");
    api.seek(appearance.from_ms);
    assert.equal(player.portraitUi.dataset.roleId, String(role.id));
    assert.equal(player.portraitUi.getAttribute("src"), role.portrait);
    assert(player.button.querySelector("small").textContent.startsWith(role.name + " ·"));
  }
}
for (const [alias, name] of [["Nora", "诺诺"], ["Cielle", "汐"], ["Aika", "艾卡"],
  ["Eika", "艾卡"], ["MoBai", "白墨"], ["BaiMo", "白墨"], ["Celestia", "星绘"],
  ["HuiXing", "星绘"], ["KokonaShiki", "心夏"], ["Michelle", "米雪儿"]])
  assert.equal(api.characterInfo(alias).name, name);
assert.equal(api.characterInfo("unknown-new-character"), null);
const rolePlayer = playback.players.find((p) => p.appearances.length > 1);
const firstAppearance = rolePlayer.appearances[0], secondAppearance = rolePlayer.appearances[1];
api.seek(secondAppearance.from_ms);
api.seek(firstAppearance.from_ms);
assert.equal(rolePlayer.portraitUi.dataset.roleId, String(api.characterInfo(firstAppearance.character).id),
  "backward seek restores the earlier character portrait");
assert.equal(api.characterAt(rolePlayer, { character: firstAppearance.character }, secondAppearance.from_ms).id,
  api.characterInfo(firstAppearance.character).id, "actual Actor wins over a different selected role ID");
await Promise.resolve();
canvasCalls.length = 0; api.draw();
assert(canvasCalls.some((c) => c.method === "drawImage" && /characters\/icons\//.test(c.args[0].source ?? "")),
  "map markers render actual role portraits");
assert.equal($("round-segments").children.length, playback.rounds.length);
for (const [i, segment] of [...$("round-segments").children].entries()) {
  assert(segment.classList.contains(i % 2 === 0 ? "odd" : "even"));
  const end = playback.rounds[i + 1]?.time_ms ?? playback.duration_ms;
  assert(Math.abs(parseFloat(segment.style.left) - playback.rounds[i].time_ms / playback.duration_ms * 100) < 1e-9);
  assert(Math.abs(parseFloat(segment.style.width) - (end - playback.rounds[i].time_ms) / playback.duration_ms * 100) < 1e-9);
}
if (playback.map.includes("Envi_Akns_Bomb")) {
  await Promise.resolve();
  const view = api.viewState();
  assert.equal(view.activeMap.name, "奥卡努斯");
  assert.equal(view.mapImage.source, "maps/ocarnus.webp");
  assert.equal(view.yDirection, 1);
  const topLeft = api.xy(-8500, -8500), bottomRight = api.xy(8500, 8500);
  assert(topLeft[0] < bottomRight[0] && topLeft[1] < bottomRight[1]);
  canvasCalls.length = 0;
  api.draw();
  const imageCall = canvasCalls.find((c) => c.method === "drawImage");
  assert.equal(imageCall.args[0], view.mapImage);
  assert.equal(imageCall.args[3], imageCall.args[4], "fixed map keeps square proportions");
  const aimPlayer = playback.players.find((p) => p.aim_samples.length);
  const aimSample = aimPlayer.aim_samples.find((a) => api.position(aimPlayer, a[0])?.actor === a[3]);
  api.seek(aimSample[0]); canvasCalls.length = 0; api.draw();
  assert(canvasCalls.some((c) => c.method === "rotate" && Math.abs(c.args[0] - aimSample[1] * Math.PI / 180) < 1e-9), "aim follows image Y direction");
  const before = api.viewState().camera;
  const cursorWorld = [before.x + 230 / before.scale, before.y + 80 / before.scale];
  $("arena").dispatchEvent(new w.WheelEvent("wheel", { clientX: 680, clientY: 380, deltaY: -160, cancelable: true }));
  const cursorAfter = api.xy(...cursorWorld);
  assert(Math.abs(cursorAfter[0] - 680) < 1e-9 && Math.abs(cursorAfter[1] - 380) < 1e-9,
    "zoom preserves the world point under the cursor on the map");
  $("arena").setPointerCapture = () => {};
  $("arena").dispatchEvent(new w.MouseEvent("pointerdown", { clientX: 300, clientY: 300 }));
  $("arena").dispatchEvent(new w.MouseEvent("pointermove", { clientX: 330, clientY: 320 }));
  const dragged = api.xy(...cursorWorld);
  assert(Math.abs(dragged[0] - 710) < 1e-9 && Math.abs(dragged[1] - 400) < 1e-9,
    "map and player coordinates pan in the pointer direction");
  $("arena").dispatchEvent(new w.MouseEvent("pointerup", { clientX: 330, clientY: 320 }));
  $("fit").click();
}
const begin = api.timeNow();
$("play").click();
assert(api.isPlaying());
$("play").click();
assert(!api.isPlaying());
api.seek(begin); $("play").click(); api.animate(200); api.animate(400);
assert(api.timeNow() > begin);
assert(Math.abs(parseFloat($("playhead").style.left) - api.timeNow() / playback.duration_ms * 100) < 1e-9,
  "white playhead moves during continuous playback");
$("play").click(); api.seek(begin);
$("forward").click();
assert.equal(api.timeNow(), begin + 5000);
$("back").click();
assert.equal(api.timeNow(), begin);
$("round-select").value = String(playback.rounds[5].time_ms);
$("round-select").dispatchEvent(new w.Event("change"));
assert.equal(api.timeNow(), playback.rounds[5].time_ms);
$("next-round").click();
assert.equal(api.timeNow(), playback.rounds[6].time_ms);
$("previous-round").click();
assert.equal(api.timeNow(), playback.rounds[5].time_ms);
$("players").firstElementChild.click();
assert.equal($("picked-name").textContent, playback.players[0].name);
assert.equal($("panel-details").hidden, false);
assert.equal($("tab-details").getAttribute("aria-selected"), "true");
$("tab-evidence").click();
assert.equal($("panel-evidence").hidden, false);
assert.equal($("panel-details").hidden, true);
for (const kind of ["important", "round", "skill", "effect", "damage", "shot", "all"]) {
  $("tab-events").click();
  $("event-filter").value = kind;
  $("event-filter").dispatchEvent(new w.Event("change"));
  assert($("event-list").querySelector("button"));
  $("event-list").querySelector("button").click();
  assert($("detail-body").textContent.includes("time_ms"));
  assert.equal($("panel-details").hidden, false);
}
if (playback.rounds[0].active_ms != null) {
  const first = playback.rounds[0], second = playback.rounds[1];
  assert.equal($("phase-markers").children.length, playback.rounds.length * 2);
  for (const marker of [...$("round-markers").children, ...$("phase-markers").children]) {
    assert(Math.abs(parseFloat(marker.style.left) - Number(marker.dataset.time) / playback.duration_ms * 100) < 1e-9);
    assert(marker.getAttribute("aria-label"));
  }
  api.seek(first.time_ms);
  assert($("round").textContent.includes("准备中"));
  api.seek(first.active_ms - 1);
  assert($("round").textContent.includes("准备中"));
  api.seek(first.active_ms);
  assert($("round").textContent.includes("交战中（推定） · 00:00"));
  api.seek(first.ended_ms);
  assert($("round").textContent.includes("已结束"));
  assert($("round").textContent.includes("胜利"));
  api.seek(second.time_ms);
  assert($("round").textContent.includes("第 2 回合 · 准备中"));
  api.seek(first.active_ms - 1);
  assert($("round").textContent.includes("第 1 回合 · 准备中"));
  $("event-filter").value = "important";
  $("event-filter").dispatchEvent(new w.Event("change"));
  api.seek(first.ended_ms);
  assert($("event-list").textContent.includes("胜利判定"));
  assert($("event-list").textContent.includes("正式开始（推定）"));
  $("event-filter").value = "round";
  $("event-filter").dispatchEvent(new w.Event("change"));
  assert($("event-list").textContent.includes("回合开始（准备）"));
  assert(!$("event-list").textContent.includes("MulticastWinnerTeam"));
  const marker = [...$("phase-markers").children].find((b) => b.classList.contains("phase-active"));
  $("play").click();
  marker.click();
  assert.equal(api.isPlaying(), false);
  assert.equal(api.timeNow(), first.active_ms);
  assert.equal($("panel-details").hidden, false);
  assert($("detail-body").textContent.includes("解除屏障尚未独立确认"));
  const endMarker = [...$("phase-markers").children].find((b) => b.classList.contains("phase-ended"));
  endMarker.click();
  assert.equal(api.timeNow(), first.ended_ms);
  assert($("detail-body").textContent.includes("带胜方参数"));
  if (first.score_after) {
    assert($("detail-body").textContent.includes("判定后：比分 蓝方 0 : 1 金方"));
    assert($("picked-name").textContent.includes("金方胜利 · 比分 蓝方 0 : 1 金方"));
    api.seek(first.ended_ms - 1);
    assert($("round").textContent.includes("比分 蓝方 0 : 0 金方"));
    api.seek(first.ended_ms);
    assert($("round").textContent.includes("比分 蓝方 0 : 1 金方"));
    api.seek(second.time_ms);
    assert($("round").textContent.includes("比分 蓝方 0 : 1 金方"));
    api.seek(playback.duration_ms);
    const finalScore = playback.rounds.at(-1).score_after;
    assert($("round").textContent.includes(`比分 蓝方 ${finalScore[0]} : ${finalScore[1]} 金方`));
    api.seek(first.time_ms);
    assert($("round").textContent.includes("比分 蓝方 0 : 0 金方"));
  }
  $("round-markers").firstElementChild.click();
  assert.equal(api.timeNow(), first.time_ms);
  assert.equal(api.isPlaying(), false);
  assert($("picked-name").textContent.includes("回合开始（准备）"));
  assert.throws(() => api.install({ ...playback, rounds: [{ ...first, active_ms: NaN }] }));
  assert.throws(() => api.install({ ...playback, timeline: [{ time_ms: 10,
    round_phase: { phase: "active", round_number: -1 } }] }));
} else assert.equal($("phase-markers").children.length, 0);
for (const t of [0, 60000, 114254, 500000, 960000, 1500000, 1900441]) {
  api.seek(t);
  api.draw();
  assert.equal($("clock").textContent, api.clock(t, true));
  assert(Math.abs(parseFloat($("playhead").style.left) - t / playback.duration_ms * 100) < 1e-9);
  for (const player of playback.players)
    assert.equal(player.button.querySelector(".damage-stat").textContent,
      `伤害 ${Number.isFinite(api.stateAt(player, t).TotalDamage) ? Number(api.stateAt(player, t).TotalDamage.toFixed(2)) : "—"}`);
}
for (const team of [0, 1]) {
  const damage = playback.timeline.find((e) => e.kind === "damage_total_delta" &&
    playback.players.find((p) => p.uid === e.uid)?.AttributeTeamID === team);
  assert(damage);
  api.seek(damage.time_ms + 1); canvasCalls.length = 0; api.draw();
  assert(canvasCalls.some((c) => c.method === "fillText" && c.args[0] === String(Number(damage.amount.toFixed(2))) &&
    c.color === ["#40c5b8", "#cda963"][team]), "floating damage has team color and no plus sign");
}
api.seek(1900441);
$("play").click();
assert.equal(api.timeNow(), 0);
assert.throws(() => api.install({ schema: "wrong" }));
const p = playback.players[0];
const s = p.samples.find((s, i) => i > 0 && s[0] > p.samples[i - 1][0]);
const pos = api.position(p, s[0]);
assert.equal(pos.x, s[1]);
assert.equal(pos.y, s[2]);
const aim = p.aim_samples.find((a) => api.position(p, a[0])?.actor === a[3]);
assert(aim, "real replay has a bound controller direction");
const aimed = api.position(p, aim[0]);
assert.equal(aimed.aimYaw, aim[1]);
assert.equal(aimed.aimPitch, aim[2]);
assert.equal(api.position({ ...p, aim_samples: [] }, aim[0]).aimYaw, null);
assert.equal(api.position({ ...p, aim_samples: [[aim[0], 12, 34, -1]] }, aim[0]).aimYaw, null);
if (p.vitals?.length) {
  const sample = p.vitals.find((v) => v.attribute === "Health");
  api.seek(sample.time_ms);
  assert.equal(api.vitalsAt(p, sample.time_ms).Health, sample.value);
  assert.equal(api.vitalsAt(p, sample.time_ms - 1).Health, undefined);
  assert.equal(p.vitalUi.Health.meter.value, sample.value);
  const damage = playback.timeline.find((e) => e.combat?.target_uid && e.combat.nearby_vital_syncs.length);
  assert(api.eventDetails(damage).includes("单次命中伤害：未解析"));
  assert(api.eventDetails(damage).includes("200 ms"));
  assert(!api.eventDetails(damage).includes("undefined"));
  const oldFile = { ...p, vitalIndex: new Map() };
  assert.deepEqual(Object.keys(api.vitalsAt(oldFile, sample.time_ms)), []);
} else {
  assert.equal(p.vitalIndex.size, 0);
  assert.equal(p.vitalUi.Health.meter.hidden, true);
  assert.equal(p.vitalUi.Armor.meter.hidden, true);
}
let realPersistentForm = false;
for (const player of playback.players) {
  for (const [actor, entries] of player.movementModeIndex) {
    const index = entries.findIndex((sample, i) => sample.value === 19 &&
      entries[i + 1]?.time_ms - sample.time_ms > 650 &&
      ![19, 20, 21].includes(entries[i + 1].value) &&
      api.position(player, sample.time_ms + 650)?.actor === actor &&
      api.statusAt(player, sample.time_ms + 650) !== "dead");
    if (index < 0) continue;
    const start = entries[index], end = entries[index + 1];
    assert(api.isStringified(player, start.time_ms + 650, actor));
    assert(!api.isStringified(player, end.time_ms, actor));
    realPersistentForm = true;
    break;
  }
}
assert(realPersistentForm, "real replay has a sustained side state and a recorded exit");
// Exercise state boundaries independently of ability activation, elapsed time,
// owned summons, playback direction, death and character replacement.
const formPlayer = {
  ...p,
  samples: [[1000, 0, 0, 0, 0, 0, 101], [4000, 0, 0, 0, 0, 0, 101],
    [4001, 0, 0, 0, 0, 0, 102], [6000, 0, 0, 0, 0, 0, 102],
    [6001, 0, 0, 0, 0, 0, 101], [6500, 0, 0, 0, 0, 0, 101]],
  aim_samples: [], vitals: [],
  appearances: [{ actor: 101, from_ms: 1000, to_ms: 4000, character: "test" },
    { actor: 102, from_ms: 4001, to_ms: 6000, character: "test" },
    { actor: 101, from_ms: 6001, to_ms: 6500, character: "test" }],
  states: [[1000, 101, 1], [1100, 101, 19], [1600, 999, 1],
    [2200, 101, 20], [2800, 101, 21], [3300, 101, 3], [3600, 101, 19],
    [4700, 102, 19], [5000, 102, 1]].map(([time_ms, actor, value]) =>
    ({ time_ms, actor, value, name: "ReplicatedMovementMode" })),
};
const ability = (time_ms, path) => ({ time_ms, uid: p.uid, kind: "rpc",
  name: "MulticastNotifyAbilityActivated", ability: { path } });
api.install({ ...playback, players: [formPlayer], timeline: [
  ability(1050, "Default__GA_Shared_Side_C"),
  ability(2300, "Default__GA_Shared_Fly_C"),
  ability(2850, "Default__GA_Shared_Wall_C"),
  ability(3100, "Default__GA_Character_Q_C"),
  ability(5000, "Default__GA_Shared_Fly_C"), // exit: 2D mode becomes 3D at the same time
  ability(5300, "Default__GA_Character_FlyStrike_C"), // unrelated name must keep its ripple
  { time_ms: 3800, kind: "event", group: "PlayerDeath", fields: [p.name, p.uid] },
  { time_ms: 4001, kind: "event", group: "PlayerRespawn", fields: [p.name, p.uid] },
] });
function renderedForm(t, ellipse, ripple) {
  canvasCalls.length = 0;
  api.seek(t);
  api.draw();
  assert.equal(canvasCalls.some((c) => c.method === "ellipse"), ellipse, `ellipse at ${t}`);
  assert.equal(canvasCalls.some((c) => c.method === "arc" && c.args[2] >= 14 && c.args[2] < 40), ripple, `ripple at ${t}`);
  if (!ellipse) assert(canvasCalls.some((c) => c.method === "arc" && c.args[2] === 10), `circle at ${t}`);
  for (const call of canvasCalls.filter((c) => c.method === "ellipse"))
    assert.deepEqual(call.args.slice(2, 5), [6, 12, 0], "ellipse stays vertical on screen");
}
renderedForm(1050, false, false); // activation alone does not imply a state
renderedForm(1100, true, false);
renderedForm(2100, true, false); // persists past ripple lifetime; ignores summon
renderedForm(2300, true, false); // flying changes the persistent shape without a ripple
renderedForm(2850, true, false); // wall stringification has no ripple
renderedForm(3100, true, true); // unrelated skills keep their ripple
renderedForm(3300, false, true); // 3D update ends the ellipse immediately
renderedForm(3600, true, true);
renderedForm(3800, false, false); // death clears the form
renderedForm(4001, false, false); // new actor has no movement mode yet
renderedForm(4700, true, false);
renderedForm(5000, false, false); // returning to 3D also has no ripple
renderedForm(5300, false, true); // unrelated skills are not excluded by a partial name match
renderedForm(6100, false, false); // no state leak across appearance intervals
renderedForm(2100, true, false); // backward seek reconstructs the state
api.install({ ...playback, map: "/unknown-map", players: [formPlayer], timeline: [] });
assert.equal(api.viewState().activeMap, null);
assert.equal(api.viewState().mapImage, null);
assert($("canvas-note").textContent.includes("暂无固定底图"));
canvasCalls.length = 0; api.draw();
assert(!canvasCalls.some((c) => c.method === "drawImage"), "unknown maps never borrow an unrelated image");
console.log(
  JSON.stringify(
    {
      status: "passed",
      players: playback.players.length,
      rounds: playback.rounds.length,
      checks: [
        "load real replay",
        "play/pause",
        "seek +/-5s",
        "round jump",
        "previous/next round controls",
        "follow player",
        "event, detail and data panel navigation",
        "all 7 event filters",
        "event details",
        "7 timeline render points",
        "restart at end",
        "reject invalid import",
        "exact sample positioning",
        "independent controller aim and missing/other-actor fallback",
        "vital lookup and unknown/missing-data handling; damage caveats when present",
        "persistent vertical stringification, release, backward seek, death and actor isolation",
        "side, flying, wall and stringification exit have no ripple; unrelated ability ripples preserved",
        "round preparation, inferred active phase and victory; backward seek and next round reset",
        "phase markers seek/pause and show provenance; winner reset calls excluded from round filter",
        "all three marker types align to recorded time and jump to the exact event",
        "winner and score shown at settlement; scores persist across rounds and reconstruct on backward seek",
        "single-strip alternating round segments and exact white playhead time",
        "persistent roster damage and team-colored floating values without plus signs",
        "fixed map aspect ratio, coordinate direction, aim rotation and unknown-map fallback",
        "role ID/name/portrait agreement, aliases, character swaps and backward seek",
      ],
      limitation:
        "jsdom with canvas stub; not a browser screenshot or visual layout check",
    },
    null,
    2,
  ),
);
