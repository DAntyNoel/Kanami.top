const stage = document.querySelector("#stage");
const scoreEl = document.querySelector("#score");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");
const startButton = document.querySelector("#start");
const messageEl = document.querySelector("#message");

const gameTuning = {
  storageKey: "kanami-catch-best",
  durationSeconds: 30,
  board: {
    rows: 3,
    columns: 3
  },
  assets: {
    target: [
      {
        src: "../../res/images/stamps/001.png",
        label: "香奈美闪现"
      },
      {
        src: "../../res/images/stamps/002.jpg",
        label: "香奈美应援照"
      },
      {
        src: "../../res/images/stamps/003.jpg",
        label: "香奈美舞台照"
      }
    ],
    decoy: [
      {
        src: "../../res/images/stamps/004.png",
        label: "干扰灯"
      },
      {
        src: "../../res/images/stamps/005.jpg",
        label: "干扰剪影"
      }
    ]
  },
  wave: {
    totalVisibleRatio: {
      start: 0.12,
      end: 0.24,
      easing: "easeInQuad",
      min: 1,
      max: 3
    },
    correctRatio: {
      start: 1,
      end: 0.66,
      easing: "linear",
      min: 1
    },
    decoyRatio: {
      start: 0,
      end: 0.34,
      easing: "linear",
      max: 2
    }
  },
  timing: {
    intervalMs: {
      start: 980,
      end: 430,
      easing: "easeInQuad"
    },
    visibleMs: {
      start: 760,
      end: 320,
      easing: "easeInQuad"
    },
    minBlankMs: 80,
    jitterMs: 36
  },
  scoring: {
    target: 1,
    decoy: -2
  },
  sounds: {
    target: {
      frequency: 720,
      duration: 0.07
    },
    decoy: {
      frequency: 180,
      duration: 0.12
    }
  }
};

const bestKey = gameTuning.storageKey;
const easings = {
  linear: (progress) => progress,
  easeInQuad: (progress) => progress * progress,
  easeOutQuad: (progress) => progress * (2 - progress),
  easeInCubic: (progress) => progress * progress * progress
};

let score = 0;
let timeLeft = gameTuning.durationSeconds;
let activeTargets = new Set();
let activeDecoys = new Set();
let running = false;
let spawnTimer = 0;
let clearTimer = 0;
let countdownTimer = 0;

function makeBoard() {
  const size = gameTuning.board.rows * gameTuning.board.columns;
  stage.style.gridTemplateColumns = `repeat(${gameTuning.board.columns}, minmax(0, 1fr))`;
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
  Object.values(gameTuning.assets).flat().forEach(({ src }) => {
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
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.05, context.currentTime);
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
  return clamp((gameTuning.durationSeconds - timeLeft) / gameTuning.durationSeconds, 0, 1);
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
  const targetMin = gameTuning.wave.correctRatio.min ?? 0;
  const totalVisible = clamp(
    Math.round(holeCount * tuneValue(gameTuning.wave.totalVisibleRatio, progress)),
    Math.max(gameTuning.wave.totalVisibleRatio.min ?? 1, targetMin),
    Math.min(gameTuning.wave.totalVisibleRatio.max ?? holeCount, holeCount)
  );
  const correctWeight = Math.max(0, tuneValue(gameTuning.wave.correctRatio, progress));
  const decoyWeight = Math.max(0, tuneValue(gameTuning.wave.decoyRatio, progress));
  const combinedWeight = correctWeight + decoyWeight || 1;
  const targetMax = gameTuning.wave.correctRatio.max ?? totalVisible;
  const decoyMax = gameTuning.wave.decoyRatio.max ?? totalVisible;
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
    tuneValue(gameTuning.timing.intervalMs, progress) +
      (Math.random() * 2 - 1) * (gameTuning.timing.jitterMs ?? 0)
  );
  const visibleLimit = Math.max(80, intervalMs - (gameTuning.timing.minBlankMs ?? 0));
  const visibleMs = clamp(tuneValue(gameTuning.timing.visibleMs, progress), 80, visibleLimit);

  return {
    intervalMs,
    visibleMs
  };
}

function resetHole(hole) {
  const index = hole.dataset.index;
  hole.classList.remove("is-target", "is-decoy");
  hole.style.removeProperty("--hole-image");
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
  const asset = randomItem(gameTuning.assets[type]);
  hole.classList.add(type === "target" ? "is-target" : "is-decoy");
  hole.dataset.kind = type;
  hole.style.setProperty("--hole-image", `url("${asset.src}")`);
  hole.setAttribute("aria-label", `${asset.label}，舞台灯 ${Number(hole.dataset.index) + 1}`);
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
    score += gameTuning.scoring.target;
    messageEl.textContent = "抓到啦！香奈美把这一秒收进舞台相册。";
    beep(gameTuning.sounds.target.frequency, gameTuning.sounds.target.duration);
    clearHole(index);
    updateHud();
    return;
  }
  if (activeDecoys.has(index)) {
    score = Math.max(0, score + gameTuning.scoring.decoy);
    messageEl.textContent = "那是干扰光啦，香奈美提醒你冷静一点。";
    beep(gameTuning.sounds.decoy.frequency, gameTuning.sounds.decoy.duration);
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
  startButton.textContent = "再来";
  messageEl.textContent = `时间到！这次抓到 ${score} 次，香奈美已经记下你的应援速度。`;
}

function start() {
  window.clearTimeout(spawnTimer);
  window.clearTimeout(clearTimer);
  window.clearInterval(countdownTimer);
  score = 0;
  timeLeft = gameTuning.durationSeconds;
  running = true;
  startButton.textContent = "进行中";
  messageEl.textContent = "灯光开始流动了，盯紧香奈美出现的位置。";
  updateHud();
  spawn();
  countdownTimer = window.setInterval(() => {
    timeLeft -= 1;
    updateHud();
    if (timeLeft <= 0) finish();
  }, 1000);
}

startButton.addEventListener("click", start);
makeBoard();
preloadAssets();
updateHud();
