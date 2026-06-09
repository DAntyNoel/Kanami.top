const stage = document.querySelector("#stage");
const scoreEl = document.querySelector("#score");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");
const startButton = document.querySelector("#start");
const messageEl = document.querySelector("#message");

const config = window.KANAMI_CATCH_CONFIG;
const tuning = config.tuning;
const assetTemplates = {
  target: config.targetTemplates.map((template, index) => normalizeAsset(template, index, "target")),
  decoy: config.decoyTemplates.map((template, index) => normalizeAsset(template, index, "decoy"))
};
const bestKey = tuning.storage.bestKey;
const easings = {
  linear: (progress) => progress,
  easeInQuad: (progress) => progress * progress,
  easeOutQuad: (progress) => progress * (2 - progress),
  easeInCubic: (progress) => progress * progress * progress
};

let score = 0;
let timeLeft = tuning.durationSeconds;
let activeTargets = new Set();
let activeDecoys = new Set();
let running = false;
let spawnTimer = 0;
let clearTimer = 0;
let countdownTimer = 0;

function normalizeAsset(template, index, type) {
  const text = template.text || {};
  const asset = template.asset || {};
  const audio = template.audio || {};

  return {
    id: template.id || `${type}-${index}`,
    image: asset.image,
    label: text.label || (type === "target" ? "香奈美闪现" : "干扰光"),
    frequency: audio.frequency || (type === "target" ? 720 : 180),
    durationSeconds: audio.durationSeconds || (type === "target" ? 0.07 : 0.12)
  };
}

function applyTuning() {
  document.documentElement.style.setProperty("--catch-board-columns", String(tuning.board.columns));
  if (tuning.theme?.pageBackgroundImage) {
    document.documentElement.style.setProperty(
      "--page-background-image",
      `url("${tuning.theme.pageBackgroundImage}")`
    );
  }
  messageEl.textContent = tuning.text.ready;
}

function makeBoard() {
  const size = tuning.board.rows * tuning.board.columns;
  const holes = Array.from({ length: size }, (_, index) => {
    const button = document.createElement("button");
    button.className = "hole";
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `舞台灯 ${index + 1}`);
    button.addEventListener("click", () => hit(index));
    return button;
  });
  stage.replaceChildren(...holes);
}

function preloadAssets() {
  Object.values(assetTemplates).flat().forEach(({ image: src }) => {
    const image = new Image();
    image.src = src;
  });
}

function bestScore() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateHud() {
  scoreEl.textContent = String(score);
  timeEl.textContent = String(timeLeft);
  bestEl.textContent = String(bestScore());
}

function beep(frequency, duration) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = tuning.audio.type;
  gain.gain.setValueAtTime(tuning.audio.gain, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function tuneValue(setting, progress) {
  if (typeof setting === "number") return setting;
  const ease = easings[setting.easing] || easings.linear;
  return setting.start + (setting.end - setting.start) * ease(progress);
}

function gameProgress() {
  return clamp((tuning.durationSeconds - timeLeft) / tuning.durationSeconds, 0, 1);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomIndexes(size, count) {
  return shuffle(Array.from({ length: size }, (_, index) => index)).slice(0, count);
}

function waveCounts(progress, holeCount) {
  const targetMin = tuning.wave.correctRatio.min ?? 0;
  const totalVisible = clamp(
    Math.round(holeCount * tuneValue(tuning.wave.totalVisibleRatio, progress)),
    Math.max(tuning.wave.totalVisibleRatio.min ?? 1, targetMin),
    Math.min(tuning.wave.totalVisibleRatio.max ?? holeCount, holeCount)
  );
  const correctWeight = Math.max(0, tuneValue(tuning.wave.correctRatio, progress));
  const decoyWeight = Math.max(0, tuneValue(tuning.wave.decoyRatio, progress));
  const combinedWeight = correctWeight + decoyWeight || 1;
  const targetMax = tuning.wave.correctRatio.max ?? totalVisible;
  const decoyMax = tuning.wave.decoyRatio.max ?? totalVisible;
  let targetCount = clamp(
    Math.round(totalVisible * (correctWeight / combinedWeight)),
    targetMin,
    Math.min(targetMax, totalVisible)
  );
  let decoyCount = totalVisible - targetCount;

  if (decoyCount > decoyMax) {
    decoyCount = decoyMax;
    targetCount = totalVisible - decoyCount;
  }

  return {
    targetCount,
    decoyCount
  };
}

function waveTiming(progress) {
  const intervalMs = Math.max(
    120,
    tuneValue(tuning.timing.intervalMs, progress) +
      (Math.random() * 2 - 1) * (tuning.timing.jitterMs ?? 0)
  );
  const visibleLimit = Math.max(80, intervalMs - (tuning.timing.minBlankMs ?? 0));
  const visibleMs = clamp(tuneValue(tuning.timing.visibleMs, progress), 80, visibleLimit);

  return {
    intervalMs,
    visibleMs
  };
}

function resetHole(hole) {
  const index = hole.dataset.index;
  hole.classList.remove("is-target", "is-decoy");
  hole.style.removeProperty("--hole-image");
  hole.dataset.audioFrequency = "";
  hole.dataset.audioDuration = "";
  hole.dataset.kind = "";
  hole.setAttribute("aria-label", `舞台灯 ${Number(index) + 1}`);
}

function clearLights() {
  document.querySelectorAll(".hole").forEach((hole) => {
    resetHole(hole);
  });
  activeTargets = new Set();
  activeDecoys = new Set();
}

function clearHole(index) {
  const hole = stage.querySelector(`[data-index="${index}"]`);
  if (!hole) return;
  resetHole(hole);
  activeTargets.delete(index);
  activeDecoys.delete(index);
}

function paintHole(hole, type) {
  const asset = randomItem(assetTemplates[type]);
  hole.classList.add(type === "target" ? "is-target" : "is-decoy");
  hole.dataset.kind = type;
  hole.dataset.audioFrequency = String(asset.frequency);
  hole.dataset.audioDuration = String(asset.durationSeconds);
  hole.style.setProperty("--hole-image", `url("${asset.image}")`);
  hole.setAttribute("aria-label", `${asset.label}，舞台灯 ${Number(hole.dataset.index) + 1}`);
}

function beepHole(index, type) {
  const fallback = assetTemplates[type][0];
  const hole = stage.querySelector(`[data-index="${index}"]`);
  const frequency = Number(hole?.dataset.audioFrequency || fallback.frequency);
  const duration = Number(hole?.dataset.audioDuration || fallback.durationSeconds);
  beep(frequency, duration);
}

function spawn() {
  if (!running) return;
  const holes = [...document.querySelectorAll(".hole")];
  const progress = gameProgress();
  const counts = waveCounts(progress, holes.length);
  const indexes = randomIndexes(holes.length, counts.targetCount + counts.decoyCount);
  const targetIndexes = indexes.slice(0, counts.targetCount);
  const decoyIndexes = indexes.slice(counts.targetCount);
  const timing = waveTiming(progress);

  window.clearTimeout(clearTimer);
  clearLights();

  targetIndexes.forEach((index) => {
    activeTargets.add(index);
    paintHole(holes[index], "target");
  });
  decoyIndexes.forEach((index) => {
    activeDecoys.add(index);
    paintHole(holes[index], "decoy");
  });

  clearTimer = window.setTimeout(clearLights, timing.visibleMs);
  spawnTimer = window.setTimeout(spawn, timing.intervalMs);
}

function hit(index) {
  if (!running) return;
  if (activeTargets.has(index)) {
    score += tuning.scoring.target;
    messageEl.textContent = tuning.text.hit;
    beepHole(index, "target");
    clearHole(index);
    updateHud();
    return;
  }
  if (activeDecoys.has(index)) {
    score = Math.max(0, score + tuning.scoring.decoy);
    messageEl.textContent = tuning.text.decoy;
    beepHole(index, "decoy");
    clearHole(index);
    updateHud();
  }
}

function finish() {
  running = false;
  window.clearTimeout(spawnTimer);
  window.clearTimeout(clearTimer);
  window.clearInterval(countdownTimer);
  clearLights();
  if (score > bestScore()) localStorage.setItem(bestKey, String(score));
  updateHud();
  startButton.textContent = tuning.text.restartButton;
  messageEl.textContent = tuning.text.finish(score);
}

function start() {
  window.clearTimeout(spawnTimer);
  window.clearTimeout(clearTimer);
  window.clearInterval(countdownTimer);
  score = 0;
  timeLeft = tuning.durationSeconds;
  running = true;
  startButton.textContent = tuning.text.runningButton;
  messageEl.textContent = tuning.text.start;
  updateHud();
  spawn();
  countdownTimer = window.setInterval(() => {
    timeLeft -= 1;
    updateHud();
    if (timeLeft <= 0) finish();
  }, 1000);
}

startButton.addEventListener("click", start);
applyTuning();
makeBoard();
preloadAssets();
updateHud();
