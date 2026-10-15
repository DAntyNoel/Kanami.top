const $ = (id) => document.getElementById(id);
const canvas = $("arena"),
  ctx = canvas.getContext("2d");
let data,
  time = 0,
  playing = false,
  speed = 1,
  picked = null,
  following = false,
  selectedEvent = null;
let camera = { x: 0, y: 0, scale: 0.035 },
  fitted = { ...camera },
  width = 1,
  height = 1,
  lastFrame = 0,
  lastPanel = 0;
let filtered = [],
  timeline = [],
  playerById = new Map(),
  renderedEventCenter = -1;
// Fixed map coordinates in Unreal centimetres. Keep image and player transforms shared.
const mapCatalog = {
  "/Game/PaperMan/Maps/Envi_Akns/Envi_Akns_Bomb/Envi_Akns": {
    name: "奥卡努斯", image: "maps/ocarnus.webp",
    bounds: { minX: -8500, maxX: 8500, minY: -8500, maxY: 8500 },
  },
};
let activeMap = null, mapImage = null, viewBounds = null, yDirection = -1;
const colors = ["#40c5b8", "#cda963"];
const charactersById = new Map(), charactersByName = new Map(), portraits = new Map();
function characterInfo(raw) {
  return charactersByName.get(String(raw ?? "").toLowerCase()) ?? null;
}
function characterName(raw) {
  return characterInfo(raw)?.name ?? raw ?? "未知角色";
}
function characterAt(player, pos, t) {
  // A selected role can change before the character Actor changes. The actual
  // appearance must win, so portraits cannot jump to the next role too early.
  return pos ? characterInfo(pos.character) : charactersById.get(stateAt(player, t).SelectRoleId) ?? null;
}
async function loadCharacters() {
  const response = await fetch("characters/manifest.json");
  if (!response.ok) return;
  for (const role of await response.json()) {
    if (!Number.isInteger(role.id) || typeof role.name !== "string" ||
        !Array.isArray(role.aliases) || role.portrait !== `characters/icons/${role.id}.png`) continue;
    charactersById.set(role.id, role);
    for (const alias of [...role.aliases, role.name])
      charactersByName.set(String(alias).toLowerCase(), role);
    const entry = { image: new Image(), ready: false };
    portraits.set(role.id, entry);
    entry.image.onload = () => { entry.ready = true; draw(); };
    entry.image.src = role.portrait;
  }
}
const vitalLabels = { Health: "生命", HealthMax: "生命上限", Armor: "护甲", ArmorMax: "护甲上限" };
function number(value) {
  return Number.isFinite(value) ? String(Number(value.toFixed(2))) : "—";
}
function integer(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "—";
}
function vitalsAt(p, t) {
  const values = {};
  for (const [key, entries] of p.vitalIndex || []) {
    const index = upper(entries, t) - 1;
    if (index >= 0) values[key] = entries[index].value;
  }
  return values;
}
function vitalText(values) {
  return `生命 ${number(values.Health)} / ${number(values.HealthMax)}\n护甲 ${number(values.Armor)} / ${number(values.ArmorMax)}`;
}
function vitalChangeText(event) {
  return event.changes.map((change) => `${vitalLabels[change.attribute]} ${number(change.before)} → ${number(change.after)}（${change.delta > 0 ? "+" : ""}${number(change.delta)}）`).join(" · ");
}
function damageType(path) {
  return shortPath(path || "").replace(/^BP_/, "").replace(/DamageType/, "").replace(/_+/g, "_").replace(/^_|_$/g, "") || "未知类型";
}
function damageTarget(combat) {
  return combat.target_uid ? name(combat.target_uid)
    : combat.target_owner_uid ? `${name(combat.target_owner_uid)}的附属对象` : `场景对象 #${combat.target_actor}`;
}
function damageAttacker(combat) {
  return combat.attacker_uid ? name(combat.attacker_uid) : "未知攻击者";
}
function winnerText(teams = []) {
  return teams.length ? teams.map((team) => team === 1 ? "金方" : "蓝方").join("、") + "胜利" : "胜方未解析";
}
function validScore(score) {
  return Array.isArray(score) && score.length === 2 &&
    score.every((value) => Number.isInteger(value) && value >= 0);
}
function scoreText(score) {
  return validScore(score) ? `比分 蓝方 ${score[0]} : ${score[1]} 金方` : "比分未知";
}
function phaseLabel(event, includeScore = true) {
  const phase = event.round_phase;
  return `第 ${phase.round_number} 回合 · ${phase.phase === "active" ? "正式开始（推定）" : `胜利判定 · ${winnerText(phase.winner_teams)}${includeScore ? ` · ${scoreText(phase.score_after)}` : ""}`}`;
}
function eventDetails(event) {
  let summary = "";
  if (event.round_phase) {
    const phase = event.round_phase;
    summary = phaseLabel(event) + "\n" + (phase.phase === "active"
      ? "来自录像中的全局阶段切换；正式开始的含义为阶段推定，解除屏障尚未独立确认。时间取实际记录，未按固定准备时长计算。\n"
      : `来自带胜方参数的胜利通知。结束原因编号：${phase.reason_code ?? "未知"}（具体含义未映射）。\n`);
    summary += phase.phase === "ended"
      ? `判定前：${scoreText(phase.score_before)}\n判定后：${scoreText(phase.score_after)}\n比分按已确认的逐回合胜利累计，每回合仅记一次；缺少前序结果时显示未知。\n`
      : `本回合开始时：${scoreText(phase.score_before)}\n`;
  } else if (event.combat) {
    const combat = event.combat;
    summary = `攻击者：${damageAttacker(combat)}\n受击目标：${damageTarget(combat)}\n武器 / 技能类型：${damageType(combat.damage_type)}\n单次命中伤害：未解析\n`;
    if (combat.nearby_vital_syncs.length) {
      summary += "\n随后 200 ms 内的属性同步（可能合并其他命中、治疗或效果）：\n" + combat.nearby_vital_syncs
        .map((sync) => `${clock(sync.time_ms, true)}  ${vitalChangeText(sync)}`).join("\n") + "\n";
    } else summary += "\n随后 200 ms 内无生命 / 护甲变化记录。\n";
  } else if (event.kind === "vital_change") {
    summary = `${name(event.uid)}\n${vitalChangeText(event)}\n属性同步不等同于单次命中，可能包含多次伤害、治疗或其他效果。\n`;
  }
  return (summary ? summary + "\n原始记录\n" : "") + JSON.stringify(event, null, 2);
}
const stateLabels = {
  ReplicatedMovementMode: "移动模式编号",
  AmmoRemain: "备用弹药",
  AmmoInMagazine: "弹匣弹药",
  MagazineState: "弹匣状态编号",
  ArousalLevel: "觉醒等级",
  TotalDamage: "累计伤害",
  TotalRealDamage: "TotalRealDamage 原字段",
  NumKills: "击杀",
  NumDeaths: "死亡",
  NumAssist: "助攻",
  bIsSpectator: "观战状态",
  bBleeding: "流血状态",
  Rescuer: "救援者对象",
  SelectRoleId: "角色编号",
  AttributeTeamID: "队伍编号",
};
const eventLabels = {
  PlayerRespawn: "角色出生",
  PlayerDeath: "被击败",
  PlayerInjured: "击倒",
  BombRound: "准备开始",
  WatchStart: "录像开始",
};
const rpcLabels = {
  MulticastNotifyAbilityActivated: "能力激活",
  MulticastDamageEventData: "伤害调用",
  MulticastAttackActor: "攻击命中调用",
  MulticastAttackMiss: "攻击落空",
  MulticastAttackMulti: "多目标攻击",
  MulticastProjectile: "发射投掷物",
  MulticastProjectileExplode: "投掷物爆炸",
  MulticastNotifySuccessRescue: "救援成功",
  MulticastBombEvent: "炸弹事件",
  MulticastBombFound: "发现炸弹",
  MulticastWinnerTeam: "回合胜方",
  MulticastPlayerJumped: "跳跃",
};
function clock(ms, precise = false) {
  ms = Math.max(0, Math.round(ms));
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}${precise ? "." + String(ms % 1000).padStart(3, "0") : ""}`;
}
function upper(arr, t, get = (x) => x.time_ms) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (get(arr[mid]) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function shortPath(path = "") {
  return path
    .replace(/^Default__/, "")
    .replace(/_C$/, "")
    .split("/")
    .pop();
}
function name(uid) {
  return playerById.get(uid)?.name || uid || "场景对象";
}
function statusAt(p, t) {
  const i = upper(p.life, t) - 1;
  return i >= 0 ? p.life[i].state : "unknown";
}
function stateAt(p, t) {
  const result = {};
  for (const [key, values] of p.stateIndex) {
    const i = upper(values, t) - 1;
    if (i >= 0) result[key] = values[i].value;
  }
  return result;
}
// Sample-verified against State.Shape.2D.* target tags; see PROTOCOL_NOTES.md.
const stringifiedModes = new Set([19, 20, 21]);
const stringificationAbilities = new Set(["GA_Shared_Side", "GA_Shared_Fly", "GA_Shared_Wall"]);
function isStringified(p, t, actor) {
  if (statusAt(p, t) === "dead") return false;
  const appearance = p.appearances.find(
    (a) => a.actor === actor && a.from_ms <= t && t <= a.to_ms,
  );
  if (!appearance) return false;
  const entries = p.movementModeIndex?.get(actor) || [];
  const sample = entries[upper(entries, t) - 1];
  return !!sample && sample.time_ms >= appearance.from_ms &&
    stringifiedModes.has(sample.value);
}
function position(p, t) {
  const i = upper(p.samples, t, (s) => s[0]) - 1;
  if (i < 0) return null;
  const a = p.samples[i],
    b = p.samples[i + 1];
  const appearance = p.appearances.find(
    (x) => x.actor === a[6] && x.from_ms <= t && t <= x.to_ms,
  );
  if (!appearance) return null;
  const aimIndex = upper(p.aim_samples || [], t, (s) => s[0]) - 1;
  const aim = aimIndex >= 0 ? p.aim_samples[aimIndex] : null;
  const validAim = aim?.[3] === a[6] && aim[0] >= appearance.from_ms;
  let out = a.slice();
  if (
    b &&
    b[6] === a[6] &&
    b[0] > a[0] &&
    b[0] - a[0] < 2000 &&
    Math.hypot(b[1] - a[1], b[2] - a[2]) < 450
  ) {
    const f = (t - a[0]) / (b[0] - a[0]);
    for (let j = 1; j <= 3; j++) out[j] = a[j] + (b[j] - a[j]) * f;
    out[4] = a[4] + (((b[4] - a[4] + 540) % 360) - 180) * f;
  }
  return {
    x: out[1],
    y: out[2],
    z: out[3],
    yaw: out[4],
    pitch: out[5],
    aimYaw: validAim ? aim[1] : null,
    aimPitch: validAim ? aim[2] : null,
    actor: out[6],
    index: i,
    character: appearance.character,
  };
}
function label(e) {
  if (e.round_phase) return phaseLabel(e);
  if (e.name === "MulticastWinnerTeam")
    return e.parameters?.length ? "胜方通知（原始记录）" : "胜方状态清空";
  if (e.kind === "vital_change") return `${name(e.uid)} · ${vitalChangeText(e)}`;
  if (e.combat) return `${damageAttacker(e.combat)} → ${damageTarget(e.combat)} · ${damageType(e.combat.damage_type)}（数值未解析）`;
  if (e.kind.startsWith("effect_"))
    return `${name(e.uid)} · ${{ effect_added: "效果获得", effect_updated: "效果更新", effect_removed: "效果移除" }[e.kind]} ${shortPath(e.effect || "未命名效果")}`;
  if (e.kind === "event") {
    if (e.group === "BombRound")
      return `第 ${e.round_number ?? upper(data.rounds, e.time_ms)} 回合 · 回合开始（准备）`;
    if (e.group === "PlayerDeath")
      return `${e.fields[0]} ← ${e.fields[2] || "未知"} · 被击败`;
    if (e.group === "PlayerRespawn") return `${e.fields[0]} · 角色出生`;
    if (e.group === "PlayerInjured")
      return `${e.fields[0]} ← ${e.fields[2] || "未知"} · 击倒`;
    return `${eventLabels[e.group] || e.group} ${e.metadata || ""}`;
  }
  if (e.kind === "damage_total_delta")
    return `${name(e.uid)} · 累计伤害 +${e.amount}`;
  if (e.ability) return `${name(e.uid)} · ${shortPath(e.ability.path)}`;
  return `${name(e.uid)} · ${rpcLabels[e.name] || e.name}`;
}
function validate(d) {
  if (
    !d?.source ||
    !d?.counts ||
    !Array.isArray(d?.rounds) ||
    d?.schema !== "kanami-replay-playback-v1" ||
    !Array.isArray(d.players) ||
    !Array.isArray(d.timeline) ||
    !Number.isFinite(d.duration_ms) ||
    d.duration_ms <= 0
  )
    throw Error("回放格式无效。请选择配套解析器生成的 playback.json。");
  if (!d.players.some((p) => p.samples?.length))
    throw Error("数据中还没有可播放的位置。");
  let previousRound = -1;
  for (const round of d.rounds) {
    if (!Number.isFinite(round.time_ms) || round.time_ms < previousRound ||
        round.time_ms < 0 || round.time_ms > d.duration_ms)
      throw Error("回合起点存在无效时间。");
    previousRound = round.time_ms;
    for (const key of ["active_ms", "ended_ms"])
      if (round[key] != null && (!Number.isFinite(round[key]) ||
          round[key] < round.time_ms || round[key] > d.duration_ms))
        throw Error("回合阶段时间无效。");
    if (round.active_ms != null && round.ended_ms != null && round.active_ms > round.ended_ms)
      throw Error("回合阶段时间顺序无效。");
    if (round.winner_teams !== undefined && (!Array.isArray(round.winner_teams) ||
        round.winner_teams.some((team) => team !== 0 && team !== 1)))
      throw Error("回合胜方数据格式无效。");
    for (const key of ["score_before", "score_after"])
      if (round[key] != null && !validScore(round[key]))
        throw Error("回合比分格式无效。");
  }
  for (const p of d.players) {
    if (
      !Array.isArray(p.samples) ||
      !Array.isArray(p.states) ||
      !Array.isArray(p.appearances)
    )
      throw Error("队员数据缺少轨迹或状态。");
    let previous = -1;
    for (const s of p.samples) {
      if (
        s.length !== 7 ||
        !s.every(Number.isFinite) ||
        s[0] < previous ||
        s[0] < 0 ||
        s[0] > d.duration_ms
      )
        throw Error("轨迹存在无效坐标或时间顺序。");
      previous = s[0];
    }
    previous = -1;
    if (p.aim_samples !== undefined && !Array.isArray(p.aim_samples))
      throw Error("瞄准数据格式无效。");
    for (const s of p.aim_samples || []) {
      if (s.length !== 4 || !s.every(Number.isFinite) || s[0] < previous ||
          s[0] < 0 || s[0] > d.duration_ms || Math.abs(s[1]) > 360 || Math.abs(s[2]) > 360)
        throw Error("瞄准数据存在无效角度或时间顺序。");
      previous = s[0];
    }
    if (p.vitals !== undefined && !Array.isArray(p.vitals)) throw Error("生命与护甲数据格式无效。");
    previous = -1;
    for (const s of p.vitals || []) {
      if (!(s.attribute in vitalLabels) || !Number.isFinite(s.value) || s.value < 0 ||
          !Number.isFinite(s.time_ms) || s.time_ms < previous || s.time_ms < 0 || s.time_ms > d.duration_ms)
        throw Error("生命与护甲数据存在无效数值或时间顺序。");
      previous = s.time_ms;
    }
  }
  for (const e of d.timeline) {
    if (
      !Number.isFinite(e.time_ms) ||
      e.time_ms < 0 ||
      e.time_ms > d.duration_ms
    )
      throw Error("事件时间超出了录像范围。");
    if (e.round_phase && (!Number.isInteger(e.round_phase.round_number) ||
        e.round_phase.round_number < 1 || e.round_phase.round_number > d.rounds.length ||
        !["active", "ended"].includes(e.round_phase.phase) ||
        (e.round_phase.winner_teams !== undefined && (!Array.isArray(e.round_phase.winner_teams) ||
          e.round_phase.winner_teams.some((team) => team !== 0 && team !== 1)))))
      throw Error("回合阶段事件格式无效。");
    for (const key of ["score_before", "score_after"])
      if (e.round_phase?.[key] != null && !validScore(e.round_phase[key]))
        throw Error("事件比分格式无效。");
  }
}
function install(d) {
  validate(d);
  data = d;
  playing = false;
  picked = null;
  following = false;
  selectedEvent = null;
  timeline = [...d.timeline].sort((a, b) => a.time_ms - b.time_ms);
  playerById = new Map(d.players.map((p) => [p.uid, p]));
  for (const p of d.players) {
    p.vitalIndex = new Map();
    for (const sample of p.vitals || []) {
      if (!p.vitalIndex.has(sample.attribute)) p.vitalIndex.set(sample.attribute, []);
      p.vitalIndex.get(sample.attribute).push(sample);
    }
    p.stateIndex = new Map();
    p.movementModeIndex = new Map();
    for (const s of p.states) {
      if (!p.stateIndex.has(s.name)) p.stateIndex.set(s.name, []);
      p.stateIndex.get(s.name).push(s);
      if (s.name === "ReplicatedMovementMode") {
        if (!p.movementModeIndex.has(s.actor)) p.movementModeIndex.set(s.actor, []);
        p.movementModeIndex.get(s.actor).push(s);
      }
    }
    p.life = [];
    for (const e of timeline) {
      if (
        e.kind === "event" &&
        e.fields?.[1] === p.uid &&
        (e.group === "PlayerRespawn" || e.group === "PlayerDeath")
      )
        p.life.push({
          time_ms: e.time_ms,
          state: e.group === "PlayerDeath" ? "dead" : "alive",
        });
    }
    p.states.sort((a, b) => a.time_ms - b.time_ms);
    for (const entries of p.stateIndex.values())
      entries.sort((a, b) => a.time_ms - b.time_ms);
    for (const entries of p.movementModeIndex.values())
      entries.sort((a, b) => a.time_ms - b.time_ms);
  }
  $("source").textContent = d.source.file;
  $("duration").textContent = clock(d.duration_ms);
  $("endclock").textContent = clock(d.duration_ms, true);
  $("seek").max = d.duration_ms;
  $("description").textContent =
    `${d.players.length} 名玩家 · ${d.rounds.length} 个回合 · ${d.counts.movement_records.toLocaleString()} 条位置记录`;
  $("evidence").textContent =
    `原文件：${d.source.file}\nSHA-256：${d.source.sha256}\n地图路径：${d.map}\n坐标：Unreal 厘米；X/Y 为水平面，Z 为高度。\n恢复：${d.counts.movement_records.toLocaleString()} 条角色移动，${d.counts.state_updates.toLocaleString()} 条状态变化，${d.counts.timeline.toLocaleString()} 条时间线记录。\n视野扇形优先使用控制器瞄准方向，无记录时使用身体朝向；角度和距离仅为示意。每次事件都保留原始参数与位偏移供核对。`;
  resize();
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  for (const p of d.players)
    for (const s of p.samples) {
      bounds.minX = Math.min(bounds.minX, s[1]);
      bounds.maxX = Math.max(bounds.maxX, s[1]);
      bounds.minY = Math.min(bounds.minY, s[2]);
      bounds.maxY = Math.max(bounds.maxY, s[2]);
    }
  if (!Number.isFinite(bounds.minX)) throw Error("数据中还没有可播放的位置。");
  activeMap = mapCatalog[d.map] ?? null;
  yDirection = activeMap ? 1 : -1;
  mapImage = null;
  viewBounds = activeMap?.bounds ?? bounds;
  $("canvas-note").textContent = activeMap
    ? `${activeMap.name} · 底图加载中 · 扇形：视野示意`
    : "该地图暂无固定底图 · 扇形：视野示意";
  if (activeMap) {
    const image = new Image();
    image.onload = () => {
      if (data !== d) return;
      mapImage = image;
      $("canvas-note").textContent = `${activeMap.name} · 固定地图底图 · 扇形：视野示意`;
      draw();
    };
    image.onerror = () => {
      if (data === d) $("canvas-note").textContent = `${activeMap.name} · 底图加载失败 · 扇形：视野示意`;
    };
    image.src = activeMap.image;
  }
  fitted = fitBounds(viewBounds);
  camera = { ...fitted };
  $("players").replaceChildren();
  const roster = [...d.players].sort((a, b) => (a.AttributeTeamID ?? 0) - (b.AttributeTeamID ?? 0));
  let previousTeam = null;
  roster.forEach((p) => {
    const i = d.players.indexOf(p), team = p.AttributeTeamID ?? 0;
    const b = node("button", undefined, "player");
    b.dataset.uid = p.uid;
    if (team !== previousTeam) b.dataset.teamLabel = team === 1 ? "金方" : "蓝方";
    previousTeam = team;
    const badge = node("span", undefined, "badge");
    p.portraitUi = node("img");
    p.portraitUi.hidden = true;
    p.portraitUi.alt = "";
    p.portraitUi.addEventListener("error", () => { p.portraitUi.hidden = true; });
    badge.append(p.portraitUi, node("span", String(i + 1).padStart(2, "0"), "player-number"));
    b.append(badge);
    const copy = node("span");
    copy.append(node("strong", p.name), node("small", "等待上场"));
    const bars = node("span", undefined, "vital-bars");
    p.vitalUi = {};
    for (const attribute of ["Health", "Armor"]) {
      const line = node("span", undefined, `vital-line ${attribute.toLowerCase()}`);
      const text = node("span", `${vitalLabels[attribute]} —`);
      const meter = node("meter");
      meter.min = 0; meter.max = 1; meter.value = 0;
      meter.setAttribute("aria-label", vitalLabels[attribute]);
      line.append(text, meter); bars.append(line);
      p.vitalUi[attribute] = { text, meter };
    }
    const stats = node("span", undefined, "player-stats");
    stats.append(node("span", "0 / 0", "score"), node("span", "伤害 —", "damage-stat"));
    b.append(copy, stats, bars);
    b.addEventListener("click", () => pick(p));
    p.button = b;
    $("players").append(b);
  });
  $("round-select").replaceChildren(node("option", "选择回合"));
  $("round-select").firstChild.value = "";
  $("round-markers").replaceChildren();
  $("phase-markers").replaceChildren();
  $("round-segments").replaceChildren();
  d.rounds.forEach((r, i) => {
    const o = node("option", `第 ${i + 1} 回合`);
    o.value = r.time_ms;
    $("round-select").append(o);
    const segment = node("span", String(i + 1), `round-segment ${i % 2 === 0 ? "odd" : "even"}`);
    segment.style.left = `${r.time_ms / d.duration_ms * 100}%`;
    segment.style.width = `${((d.rounds[i + 1]?.time_ms ?? d.duration_ms) - r.time_ms) / d.duration_ms * 100}%`;
    $("round-segments").append(segment);
    const b = node("button");
    b.title = `第 ${i + 1} 回合 · 回合开始（准备） · ${clock(r.time_ms, true)}`;
    b.setAttribute("aria-label", b.title);
    b.style.left = `${r.time_ms / d.duration_ms * 100}%`;
    b.dataset.time = r.time_ms;
    b.addEventListener("click", () => {
      const event = timeline.find((e) => e.group === "BombRound" && e.time_ms === r.time_ms);
      if (event) selectEvent(event);
      else { selectedEvent = null; seek(r.time_ms); }
    });
    $("round-markers").append(b);
  });
  for (const event of timeline.filter((e) => e.round_phase)) {
    const marker = node("button", undefined, `phase-marker phase-${event.round_phase.phase}`);
    marker.title = `${phaseLabel(event)} · ${clock(event.time_ms, true)}`;
    marker.setAttribute("aria-label", marker.title);
    marker.style.left = `${event.time_ms / d.duration_ms * 100}%`;
    marker.dataset.time = event.time_ms;
    marker.addEventListener("click", () => selectEvent(event));
    $("phase-markers").append(marker);
  }
  $("phase-markers").hidden = !$("phase-markers").children.length;
  $("phase-legend").hidden = $("phase-markers").hidden;
  filterEvents();
  const first = d.players.map((p) => p.samples[0]?.[0]).filter(Number.isFinite);
  seek(first.length ? Math.max(...first) : 0);
  $("message").textContent = "";
  $("play").textContent = "播放";
  $("picked-name").textContent = "未选择玩家或事件";
  $("detail-body").textContent = "选择玩家查看状态，或选择事件查看原始参数。";
  showPanel("events");
}
function showPanel(panel) {
  document.querySelectorAll("[data-panel]").forEach((tab) => {
    const active = tab.dataset.panel === panel;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !active;
  });
}
function pick(p) {
  picked = p;
  following = true;
  selectedEvent = null;
  updatePanels(true);
  showPanel("details");
}
function seek(value) {
  time = Math.max(0, Math.min(data?.duration_ms || 0, Number(value) || 0));
  updateTimeControls();
  updatePanels(true);
  draw();
}
function updateTimeControls() {
  if (!data) return;
  $("seek").value = time;
  $("playhead").style.left = `${time / data.duration_ms * 100}%`;
}
function toggle() {
  if (!data) return;
  if (time >= data.duration_ms) seek(0);
  playing = !playing;
  $("play").textContent = playing ? "暂停" : "播放";
}
function selectEvent(event) {
  playing = false;
  $("play").textContent = "播放";
  selectedEvent = event;
  seek(event.time_ms);
  renderEvents(true);
  showPanel("details");
}
function filterEvents() {
  const type = $("event-filter").value;
  filtered = timeline.filter(
    (e) =>
      type === "all" ||
      (type === "round" && (e.round_phase || e.group === "BombRound")) ||
      (type === "important" &&
        (e.round_phase || (e.kind === "event" && e.group !== "PlayerRespawn") ||
          ["MulticastNotifySuccessRescue", "MulticastBombEvent"].includes(
            e.name,
          ))) ||
      (type === "skill" && e.name === "MulticastNotifyAbilityActivated") ||
      (type === "effect" && e.kind.startsWith("effect_")) ||
      (type === "damage" &&
        (e.kind === "damage_total_delta" || e.kind === "vital_change" ||
          e.name === "MulticastDamageEventData")) ||
      (type === "shot" && /^MulticastAttack/.test(e.name || "")),
  );
  renderedEventCenter = -1;
  renderEvents(true);
}
function renderEvents(force = false) {
  const center = upper(filtered, time);
  if (!force && Math.abs(center - renderedEventCenter) < 3) return;
  renderedEventCenter = center;
  const start = Math.max(0, center - 8),
    end = Math.min(filtered.length, start + 35);
  const list = $("event-list");
  list.replaceChildren();
  for (let i = start; i < end; i++) {
    const e = filtered[i],
      b = node(
        "button",
        undefined,
        "event" +
          (e.time_ms > time ? " future" : "") +
          (e === selectedEvent ? " selected" : ""),
      );
    b.append(node("small", clock(e.time_ms, true)));
    if (e.round_phase?.phase === "ended")
      b.append(node("span", phaseLabel(e, false)), node("span", scoreText(e.round_phase.score_after), "event-score"));
    else b.append(node("span", label(e)));
    b.addEventListener("click", () => selectEvent(e));
    list.append(b);
  }
  if (!filtered.length)
    list.append(node("p", "此分类暂无事件。", "hint"));
}
function updatePanels(force = false) {
  if (!data) return;
  $("clock").textContent = clock(time, true);
  updateTimeControls();
  const roundIndex = upper(data.rounds, time) - 1;
  let roundText = "赛前准备";
  if (roundIndex >= 0) {
    const round = data.rounds[roundIndex];
    let origin = round.time_ms, phase = round.active_ms != null ? "准备中" : "回合计时";
    if (round.active_ms != null && time >= round.active_ms) {
      origin = round.active_ms;
      phase = "交战中（推定）";
    }
    if (round.ended_ms != null && time >= round.ended_ms) {
      origin = round.ended_ms;
      phase = `已结束 · ${winnerText(round.winner_teams)}`;
    }
    const score = round.ended_ms != null && time >= round.ended_ms ? round.score_after : round.score_before;
    roundText = `第 ${roundIndex + 1} 回合 · ${phase} · ${clock(time - origin)}\n${scoreText(score)}`;
  }
  $("round").textContent = roundText;
  for (const p of data.players) {
    const pos = position(p, time),
      state = stateAt(p, time),
      life = statusAt(p, time),
      team = state.AttributeTeamID ?? p.AttributeTeamID ?? 0,
      role = characterAt(p, pos, time);
    p.button.className = `player team${team === 1 ? 1 : 0}${picked === p ? " active" : ""}${life === "dead" ? " dead" : ""}`;
    p.button.querySelector("small").textContent = pos
      ? `${characterName(pos.character)} · ${life === "dead" ? "已被击败" : life === "alive" ? "在场" : "状态未知"}`
      : role ? `${role.name} · 等待上场` : "等待上场";
    p.button.querySelector("small").title = role ? `${role.name} · ${role.english} · 内部名 ${role.internal} · ID ${role.id}` : "";
    const roleKey = String(role?.id ?? "");
    if (p.portraitUi.dataset.roleId !== roleKey) {
      p.portraitUi.dataset.roleId = roleKey;
      p.portraitUi.hidden = !role;
      p.portraitUi.alt = role?.name ?? "";
      if (role) p.portraitUi.src = role.portrait;
      else p.portraitUi.removeAttribute("src");
    }
    p.button.querySelector(".score").textContent = `${state.NumKills ?? 0} / ${state.NumDeaths ?? 0}`;
    p.button.querySelector(".damage-stat").textContent = `伤害 ${number(state.TotalDamage)}`;
    p.button.querySelector(".damage-stat").title = "累计造成伤害";
    const vitals = vitalsAt(p, time);
    for (const attribute of ["Health", "Armor"]) {
      const current = vitals[attribute], maximum = vitals[attribute + "Max"], ui = p.vitalUi[attribute];
      ui.text.textContent = `${vitalLabels[attribute]} ${integer(current)} / ${integer(maximum)}`;
      ui.meter.max = maximum > 0 ? maximum : 1;
      ui.meter.value = Number.isFinite(current) ? current : 0;
      ui.meter.hidden = !Number.isFinite(current) || !(maximum > 0);
      ui.meter.title = ui.text.textContent;
    }
  }
  if (selectedEvent) {
    $("picked-name").textContent =
      `${clock(selectedEvent.time_ms, true)} · ${label(selectedEvent)}`;
    $("detail-body").textContent = eventDetails(selectedEvent);
  } else if (picked) {
    const state = stateAt(picked, time),
      pos = position(picked, time);
    $("picked-name").textContent = picked.name;
    $("detail-body").textContent =
      vitalText(vitalsAt(picked, time)) + `\n累计造成伤害 ${number(state.TotalDamage)}\n\n` + (pos
        ? `角色 ${characterName(pos.character)}（${pos.character}）\n位置 (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) cm\n身体朝向 ${pos.yaw.toFixed(1)}°\n${pos.aimYaw !== null ? `瞄准 ${pos.aimYaw.toFixed(1)}° · 俯仰 ${pos.aimPitch.toFixed(1)}°` : `远端俯仰 ${pos.pitch.toFixed(1)}° · 尚无瞄准数据`}\n`
        : "尚未读取到此刻的位置\n") +
      Object.entries(state)
        .map(
          ([k, v]) =>
            `${stateLabels[k] || k}：${typeof v === "object" ? JSON.stringify(v) : v}`,
        )
        .join("\n");
  }
  renderEvents(force);
}
function xy(x, y) {
  return [
    width / 2 + (x - camera.x) * camera.scale,
    height / 2 + yDirection * (y - camera.y) * camera.scale,
  ];
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  if (!data) return;
  if (picked && following) {
    const p = position(picked, time);
    if (p) {
      camera.x = p.x;
      camera.y = p.y;
    }
  }
  if (mapImage) {
    const bounds = activeMap.bounds;
    const [x, y] = xy(bounds.minX, bounds.minY);
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mapImage, x, y,
      (bounds.maxX - bounds.minX) * camera.scale,
      (bounds.maxY - bounds.minY) * camera.scale);
    ctx.restore();
  }
  const grid = camera.scale < 0.025 ? 2000 : camera.scale < 0.08 ? 1000 : 500;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#abb5e90e";
  ctx.fillStyle = "#8490b050";
  ctx.font = "9px sans-serif";
  const x0 = camera.x - width / 2 / camera.scale,
    y0 = camera.y - height / 2 / camera.scale;
  for (
    let x = Math.floor(x0 / grid) * grid;
    x < x0 + width / camera.scale;
    x += grid
  ) {
    const [sx] = xy(x, 0);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
    ctx.fillText(`${x / 100}m`, sx + 4, height - 35);
  }
  for (
    let y = Math.floor(y0 / grid) * grid;
    y < y0 + height / camera.scale;
    y += grid
  ) {
    const [, sy] = xy(0, y);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
    ctx.fillText(`${y / 100}m`, 7, sy - 4);
  }
  const positions = new Map();
  data.players.forEach((p, i) => {
    const pos = position(p, time);
    if (!pos) return;
    positions.set(p.uid, pos);
    const state = stateAt(p, time),
      color =
        colors[(state.AttributeTeamID ?? p.AttributeTeamID) === 1 ? 1 : 0],
      life = statusAt(p, time);
    const [sx, sy] = xy(pos.x, pos.y);
    if ($("trails").checked) {
      const start = upper(p.samples, time - 3000, (s) => s[0]);
      ctx.strokeStyle = color + "55";
      ctx.lineWidth = p === picked ? 2.5 : 1.3;
      ctx.beginPath();
      let prev = null;
      for (let j = start; j <= pos.index; j++) {
        const s = p.samples[j];
        if (s[6] !== pos.actor) continue;
        const [x, y] = xy(s[1], s[2]);
        if (!prev || Math.hypot(s[1] - prev[1], s[2] - prev[2]) > 450)
          ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        prev = s;
      }
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalAlpha = life === "dead" ? 0.32 : 1;
    if (p === picked) {
      ctx.strokeStyle = "#d7eeea";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    const theta = (yDirection * (pos.aimYaw ?? pos.yaw) * Math.PI) / 180;
    ctx.save();
    ctx.rotate(theta);
    ctx.fillStyle = color + "38";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 65, -0.42, 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color + "99";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 65, -0.42, 0.42);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#151d2d";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (isStringified(p, time, pos.actor))
      ctx.ellipse(0, 0, 6, 12, 0, 0, Math.PI * 2);
    else ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    const portrait = portraits.get(characterAt(p, pos, time)?.id);
    if (portrait?.ready) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(portrait.image, -12, -12, 24, 24);
      ctx.restore();
    }
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(String(i + 1), portrait?.ready ? 14 : 0, portrait?.ready ? 10 : 0);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#e4e5f3";
    ctx.fillText(p.name, 0, 22);
    const vitals = vitalsAt(p, time);
    for (const [attribute, y, color] of [["Health", 31, "#67c69d"], ["Armor", 36, "#82b7df"]]) {
      const current = vitals[attribute], maximum = vitals[attribute + "Max"];
      if (!Number.isFinite(current) || !(maximum > 0)) continue;
      ctx.fillStyle = "#14232b";
      ctx.fillRect(-18, y, 36, 3);
      ctx.fillStyle = color;
      ctx.fillRect(-18, y, 36 * Math.max(0, Math.min(1, current / maximum)), 3);
    }
    ctx.restore();
  });
  const ti = upper(timeline, time);
  for (let i = Math.max(0, ti - 70); i < ti; i++) {
    const e = timeline[i],
      age = time - e.time_ms;
    if (age > 650 || !e.uid) continue;
    const pos = positions.get(e.uid);
    if (!pos) continue;
    const [x, y] = xy(pos.x, pos.y);
    ctx.globalAlpha = 1 - age / 650;
    if (e.kind === "damage_total_delta") {
      const player = playerById.get(e.uid);
      const team = player && (stateAt(player, time).AttributeTeamID ?? player.AttributeTeamID);
      ctx.fillStyle = colors[team === 1 ? 1 : 0];
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(number(e.amount), x, y - 30 - age * 0.025);
    } else if (e.name === "MulticastNotifyAbilityActivated" &&
        !stringificationAbilities.has(shortPath(e.ability?.path))) {
      ctx.strokeStyle = "#40c5b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 14 + age * 0.04, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const pos = picked && positions.get(picked.uid);
  $("selection").textContent = pos
    ? `${picked.name} · ${characterName(pos.character)}\nX ${pos.x.toFixed(1)}  Y ${pos.y.toFixed(1)}  Z ${pos.z.toFixed(1)}\n朝向 ${pos.yaw.toFixed(1)}°`
    : "";
}
function fitBounds(bounds) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    scale: Math.min(
      Math.max(1, width - 90) / Math.max(1, bounds.maxX - bounds.minX),
      Math.max(1, height - 90) / Math.max(1, bounds.maxY - bounds.minY),
    ),
  };
}
function resize() {
  const wasFitted = camera.x === fitted.x && camera.y === fitted.y && camera.scale === fitted.scale;
  const box = canvas.parentElement.getBoundingClientRect();
  width = box.width;
  height = box.height;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (viewBounds) {
    fitted = fitBounds(viewBounds);
    if (wasFitted) camera = { ...fitted };
  }
  draw();
}
new ResizeObserver(resize).observe(canvas.parentElement);
$("play").addEventListener("click", toggle);
$("back").addEventListener("click", () => seek(time - 5000));
$("forward").addEventListener("click", () => seek(time + 5000));
$("seek").addEventListener("input", (e) => {
  selectedEvent = null;
  seek(e.target.value);
});
$("speed").addEventListener("change", (e) => (speed = Number(e.target.value)));
$("round-select").addEventListener("change", (e) => {
  if (e.target.value !== "") {
    selectedEvent = null;
    seek(e.target.value);
  }
});
$("event-filter").addEventListener("change", filterEvents);
document.querySelectorAll("[data-panel]").forEach((tab, index, tabs) => {
  tab.addEventListener("click", () => showPanel(tab.dataset.panel));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    showPanel(tabs[next].dataset.panel);
    tabs[next].focus();
  });
});
function jumpRound(direction) {
  if (!data?.rounds.length) return;
  const index = direction > 0 ? upper(data.rounds, time)
    : upper(data.rounds, time - 1) - 1;
  selectedEvent = null;
  seek(data.rounds[Math.max(0, Math.min(data.rounds.length - 1, index))].time_ms);
}
$("previous-round").addEventListener("click", () => jumpRound(-1));
$("next-round").addEventListener("click", () => jumpRound(1));
function zoom(factor) {
  camera.scale = Math.max(0.005, Math.min(0.5, camera.scale * factor));
  draw();
}
$("zoom-in").addEventListener("click", () => zoom(1.25));
$("zoom-out").addEventListener("click", () => zoom(0.8));
$("fit").addEventListener("click", () => {
  following = false;
  camera = { ...fitted };
});
$("unfollow").addEventListener("click", () => {
  picked = null;
  following = false;
  camera = { ...fitted };
  updatePanels(true);
});
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
      document.activeElement?.tagName,
    )
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    toggle();
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    seek(time - 5000);
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    seek(time + 5000);
  }
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect(),
      mx = e.clientX - rect.left - width / 2,
      my = e.clientY - rect.top - height / 2,
      old = camera.scale;
    camera.scale = Math.max(
      0.005,
      Math.min(0.5, old * Math.exp(-e.deltaY * 0.001)),
    );
    camera.x += mx / old - mx / camera.scale;
    camera.y += yDirection * (my / old - my / camera.scale);
    following = false;
  },
  { passive: false },
);
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  drag.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
  camera.x -= dx / camera.scale;
  camera.y -= yDirection * dy / camera.scale;
  drag.x = e.clientX;
  drag.y = e.clientY;
  following = false;
});
canvas.addEventListener("pointerup", (e) => {
  if (drag && !drag.moved && data) {
    const rect = canvas.getBoundingClientRect();
    let best = null,
      dist = 24;
    for (const p of data.players) {
      const pos = position(p, time);
      if (!pos) continue;
      const [x, y] = xy(pos.x, pos.y),
        d = Math.hypot(x - e.clientX + rect.left, y - e.clientY + rect.top);
      if (d < dist) {
        best = p;
        dist = d;
      }
    }
    if (best) pick(best);
  }
  drag = null;
});
canvas.addEventListener("pointercancel", () => (drag = null));
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    install(JSON.parse(await file.text()));
  } catch (error) {
    $("message").textContent = error.message;
  }
  e.target.value = "";
});
function animate(now) {
  if (playing && data) {
    time = Math.min(
      data.duration_ms,
      time + Math.min(250, now - lastFrame) * speed,
    );
    if (time === data.duration_ms) {
      playing = false;
      $("play").textContent = "播放";
    }
  }
  lastFrame = now;
  updateTimeControls();
  draw();
  if (now - lastPanel > 150) {
    updatePanels();
    lastPanel = now;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
try {
  await loadCharacters().catch(() => {});
  const response = await fetch("playback.json");
  if (!response.ok)
    throw Error(
      "未找到 playback.json。可通过右上角“导入回放”选择已解析的数据文件。",
    );
  install(await response.json());
} catch (error) {
  $("message").textContent = error.message;
  $("description").textContent = "等待导入回放数据";
}
