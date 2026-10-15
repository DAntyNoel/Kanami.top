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
const fakeContext = new Proxy(
  {},
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
  "\nreturn {clock,position,install,seek,draw,stateAt,statusAt,decodeData:()=>data,timeNow:()=>time,isPlaying:()=>playing};})()";
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
$("players").firstElementChild.click();
assert.equal($("picked-name").textContent, playback.players[0].name);
for (const kind of ["important", "skill", "effect", "damage", "shot", "all"]) {
  $("event-filter").value = kind;
  $("event-filter").dispatchEvent(new w.Event("change"));
  assert($("event-list").querySelector("button"));
  $("event-list").querySelector("button").click();
  assert($("detail-body").textContent.includes("time_ms"));
}
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
        "follow player",
        "all 6 event filters",
        "event details",
        "7 timeline render points",
        "restart at end",
        "reject invalid import",
        "exact sample positioning",
        "independent controller aim and missing/other-actor fallback",
      ],
      limitation:
        "jsdom with canvas stub; not a browser screenshot or visual layout check",
    },
    null,
    2,
  ),
);
