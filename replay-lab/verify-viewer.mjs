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
const dom = new JSDOM(html, {
  url: "http://127.0.0.1:8766/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const w = dom.window;
const canvasCalls = [];
const fakeContext = new Proxy(
  Object.fromEntries(["arc", "ellipse"].map((method) => [method, (...args) => canvasCalls.push({ method, args })])),
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
w.fetch = async () => ({ ok: true, json: async () => playback });
const wrapped =
  "(async()=>{" +
  code +
  "\nreturn {clock,position,install,seek,draw,stateAt,statusAt,vitalsAt,eventDetails,isStringified,decodeData:()=>data,timeNow:()=>time,isPlaying:()=>playing};})()";
const api = await w.eval(wrapped);
const $ = (id) => w.document.getElementById(id);
assert.equal($("players").children.length, playback.players.length);
assert.equal($("round-markers").children.length, playback.rounds.length);
assert.equal($("message").textContent, "");
const begin = api.timeNow();
$("play").click();
assert(api.isPlaying());
$("play").click();
assert(!api.isPlaying());
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
  assert($("event-list").textContent.includes("准备开始"));
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
  assert.throws(() => api.install({ ...playback, rounds: [{ ...first, active_ms: NaN }] }));
  assert.throws(() => api.install({ ...playback, timeline: [{ time_ms: 10,
    round_phase: { phase: "active", round_number: -1 } }] }));
} else assert.equal($("phase-markers").children.length, 0);
for (const t of [0, 60000, 114254, 500000, 960000, 1500000, 1900441]) {
  api.seek(t);
  api.draw();
  assert.equal($("clock").textContent, api.clock(t, true));
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
renderedForm(2300, true, true); // flying keeps its ripple and 2D shape
renderedForm(2850, true, true); // wall skill keeps its ripple
renderedForm(3100, true, true); // unrelated skills keep their ripple
renderedForm(3300, false, true); // 3D update ends the ellipse immediately
renderedForm(3600, true, true);
renderedForm(3800, false, false); // death clears the form
renderedForm(4001, false, false); // new actor has no movement mode yet
renderedForm(4700, true, false);
renderedForm(5000, false, false);
renderedForm(6100, false, false); // no state leak across appearance intervals
renderedForm(2100, true, false); // backward seek reconstructs the state
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
        "side ripple removed; flying, wall and other ability ripples preserved",
        "round preparation, inferred active phase and victory; backward seek and next round reset",
        "phase markers seek/pause and show provenance; winner reset calls excluded from round filter",
      ],
      limitation:
        "jsdom with canvas stub; not a browser screenshot or visual layout check",
    },
    null,
    2,
  ),
);
