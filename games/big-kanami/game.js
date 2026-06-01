const { Engine, World, Bodies, Body, Events, Runner, Composite } = window.Matter || {};

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.querySelector("#next-ball");
const nextCtx = nextCanvas.getContext("2d");
const levelListEl = document.querySelector("#level-list");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const messageEl = document.querySelector("#message");
const restartButton = document.querySelector("#restart");
const dropButton = document.querySelector("#drop");

const width = 420;
const height = 600;
const bottle = {
  left: 34,
  right: 386,
  lipY: 98,
  floorY: 576,
  gameOverY: 122
};
const bestKey = "kanami-big-kanami-best";

const levels = [
  { name: "小奈美", radius: 20, score: 2, color: "#ffe26a", image: "../../res/images/favicon.png" },
  { name: "星光奈美", radius: 25, score: 4, color: "#73e0d5", image: "../../res/images/stamps/001.png" },
  { name: "Soda 奈美", radius: 31, score: 8, color: "#7fb4ff", image: "../../res/images/backgrounds/Soda.png" },
  { name: "粉心奈美", radius: 38, score: 16, color: "#ff83ad", image: "../../res/images/stamps/004.png" },
  { name: "橙光奈美", radius: 46, score: 32, color: "#ffac4d", image: "../../res/images/stamps/003.jpg" },
  { name: "青舞奈美", radius: 55, score: 64, color: "#37b6c8", image: "../../res/images/backgrounds/Be-Shinning.png" },
  { name: "紫梦奈美", radius: 66, score: 128, color: "#8f72d8", image: "../../res/images/stamps/005.jpg" },
  { name: "红冠奈美", radius: 79, score: 256, color: "#ef5f6c", image: "../../res/images/stamps/002.jpg" },
  { name: "大奈美", radius: 94, score: 512, color: "#2fce78", image: "../../res/images/lovekanami.jpg" }
];

let engine;
let runner;
let balls = [];
let score = 0;
let nextLevel = 0;
let aimX = width / 2;
let canDrop = true;
let isGameOver = false;
let warnedAt = 0;
let animationFrame = 0;
let imageCache = new Map();

function preloadImages() {
  levels.forEach((level) => {
    const image = new Image();
    image.src = level.image;
    image.onload = () => {
      renderNext();
      renderLevelGuide();
    };
    imageCache.set(level.image, image);
  });
}

function bestScore() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateBest() {
  if (score > bestScore()) localStorage.setItem(bestKey, String(score));
  bestEl.textContent = String(bestScore());
}

function randomNextLevel() {
  return Math.random() > 0.82 ? 1 : 0;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function makeWall(x, y, wallWidth, wallHeight, options = {}) {
  return Bodies.rectangle(x, y, wallWidth, wallHeight, {
    isStatic: true,
    friction: 0.18,
    restitution: 0.08,
    render: { visible: false },
    ...options
  });
}

function createWorld() {
  engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = 0.88;
  runner = Runner.create();

  const wallHeight = bottle.floorY - bottle.lipY + 28;
  const wallY = bottle.lipY + wallHeight / 2 - 8;
  const leftWall = makeWall(20, wallY, 30, wallHeight);
  const rightWall = makeWall(400, wallY, 30, wallHeight);
  const floor = makeWall(width / 2, bottle.floorY + 16, 380, 34);

  World.add(engine.world, [leftWall, rightWall, floor]);
  Events.on(engine, "collisionStart", handleCollisions);
  Runner.run(runner, engine);
}

function clearWorld() {
  if (runner) Runner.stop(runner);
  if (engine) {
    Events.off(engine, "collisionStart", handleCollisions);
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  }
}

function createBall(levelIndex, x, y) {
  const level = levels[levelIndex];
  const body = Bodies.circle(x, y, level.radius, {
    restitution: 0.18,
    friction: 0.22,
    frictionAir: 0.002,
    density: 0.001 + levelIndex * 0.00018,
    label: "kanami-ball"
  });
  body.kanami = { level: levelIndex, bornAt: performance.now(), merging: false };
  balls.push(body);
  World.add(engine.world, body);
  return body;
}

function dropBall() {
  if (!canDrop || isGameOver || !engine) return;
  const radius = levels[nextLevel].radius;
  createBall(nextLevel, Math.max(bottle.left + radius, Math.min(bottle.right - radius, aimX)), bottle.lipY);
  nextLevel = randomNextLevel();
  canDrop = false;
  dropButton.disabled = true;
  renderNext();
  setTimeout(() => {
    canDrop = !isGameOver;
    dropButton.disabled = isGameOver;
  }, 560);
}

function handleCollisions(event) {
  event.pairs.forEach((pair) => {
    const a = pair.bodyA;
    const b = pair.bodyB;
    if (a.label !== "kanami-ball" || b.label !== "kanami-ball") return;
    if (a.kanami.merging || b.kanami.merging) return;
    if (a.kanami.level !== b.kanami.level) return;
    if (a.kanami.level >= levels.length - 1) return;

    const level = a.kanami.level + 1;
    const x = (a.position.x + b.position.x) / 2;
    const y = (a.position.y + b.position.y) / 2;
    a.kanami.merging = true;
    b.kanami.merging = true;
    World.remove(engine.world, [a, b]);
    balls = balls.filter((ball) => ball !== a && ball !== b);
    const merged = createBall(level, x, y);
    Body.setVelocity(merged, {
      x: (a.velocity.x + b.velocity.x) * 0.28,
      y: Math.min((a.velocity.y + b.velocity.y) * 0.2, 2)
    });
    score += levels[level].score;
    scoreEl.textContent = String(score);
    updateBest();
    messageEl.textContent = level === levels.length - 1
      ? "超大奈美诞生！这首歌已经传到世界尽头啦。"
      : `合体成功，${levels[level].name}登场。`;
  });
}

function checkGameOver() {
  if (isGameOver) return;
  const now = performance.now();
  const danger = balls.some((ball) => (
    ball.position.y - levels[ball.kanami.level].radius < bottle.gameOverY &&
    now - ball.kanami.bornAt > 1400 &&
    Math.abs(ball.velocity.y) < 0.35
  ));

  if (!danger) {
    warnedAt = 0;
    return;
  }
  if (!warnedAt) {
    warnedAt = now;
    messageEl.textContent = "杯口有点挤啦，香奈美要小心一点。";
    return;
  }
  if (now - warnedAt > 1600) endGame();
}

function endGame() {
  isGameOver = true;
  canDrop = false;
  dropButton.disabled = true;
  messageEl.textContent = `烧杯满啦，本次 ${score} 分。香奈美整理好舞台就能再来一局。`;
}

function drawImageCover(context, image, x, y, size) {
  if (!image.complete || !image.naturalWidth) return false;
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (size - drawWidth) / 2, y + (size - drawHeight) / 2, drawWidth, drawHeight);
  return true;
}

function drawBall(context, levelIndex, x, y, scale = 1, label = true) {
  const level = levels[levelIndex];
  const radius = level.radius * scale;
  const image = imageCache.get(level.image);

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = level.color;
  context.fill();
  context.clip();
  context.globalAlpha = 0.92;
  drawImageCover(context, image, x - radius, y - radius, radius * 2);
  context.globalAlpha = 1;
  context.fillStyle = "rgba(255, 255, 255, 0.2)";
  context.fillRect(x - radius, y - radius, radius * 2, radius * 0.75);
  context.restore();

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.lineWidth = Math.max(2, radius * 0.08);
  context.strokeStyle = "rgba(255, 255, 255, 0.92)";
  context.stroke();
  context.lineWidth = Math.max(1, radius * 0.045);
  context.strokeStyle = "rgba(36, 37, 56, 0.18)";
  context.stroke();

  if (label && radius >= 27) {
    context.font = `900 ${Math.max(10, radius * 0.24)}px "Segoe UI", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.fillStyle = "#242538";
    context.strokeText(level.name, x, y + radius * 0.52);
    context.fillText(level.name, x, y + radius * 0.52);
  }
  context.restore();
}

function drawBottle() {
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.52)";
  ctx.strokeStyle = "rgba(38, 123, 131, 0.58)";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(bottle.left, bottle.lipY);
  ctx.lineTo(bottle.left, bottle.floorY);
  ctx.quadraticCurveTo(width / 2, bottle.floorY + 18, bottle.right, bottle.floorY);
  ctx.lineTo(bottle.right, bottle.lipY);
  ctx.stroke();
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255, 122, 168, 0.72)";
  ctx.beginPath();
  ctx.moveTo(bottle.left + 6, bottle.lipY);
  ctx.lineTo(bottle.right - 6, bottle.lipY);
  ctx.stroke();

  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 122, 168, 0.62)";
  ctx.beginPath();
  ctx.moveTo(bottle.left + 10, bottle.gameOverY);
  ctx.lineTo(bottle.right - 10, bottle.gameOverY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(36, 37, 56, 0.58)";
  ctx.font = "800 12px Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("满到这里就结束", bottle.left + 16, bottle.gameOverY - 8);
  ctx.restore();
}

function drawAim() {
  const radius = levels[nextLevel].radius;
  const x = Math.max(bottle.left + radius, Math.min(bottle.right - radius, aimX));
  ctx.save();
  ctx.strokeStyle = "rgba(108, 97, 184, 0.48)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(x, bottle.lipY + 8);
  ctx.lineTo(x, bottle.floorY - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  drawBall(ctx, nextLevel, x, bottle.lipY - radius - 8, 1, false);
  ctx.restore();
}

function renderNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawBall(nextCtx, nextLevel, 33, 33, Math.min(1, 29 / levels[nextLevel].radius), false);
}

function renderLevelGuide() {
  if (!levelListEl) return;
  const cards = levels.map((level, index) => {
    const card = document.createElement("div");
    card.className = "level-card";

    const preview = document.createElement("canvas");
    preview.width = 72;
    preview.height = 72;
    const previewCtx = preview.getContext("2d");
    drawBall(previewCtx, index, 36, 36, Math.min(1, 29 / level.radius), false);

    const label = document.createElement("span");
    label.textContent = level.name;
    card.append(preview, label);
    return card;
  });
  levelListEl.replaceChildren(...cards);
}

function render() {
  drawBottle();
  balls.forEach((ball) => {
    drawBall(ctx, ball.kanami.level, ball.position.x, ball.position.y);
  });
  if (!isGameOver) drawAim();
  checkGameOver();
  animationFrame = requestAnimationFrame(render);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.touches?.[0]?.clientX ?? event.clientX;
  return ((clientX - rect.left) / rect.width) * width;
}

function updateAim(event) {
  aimX = Math.max(bottle.left + 20, Math.min(bottle.right - 20, canvasPoint(event)));
}

function restart() {
  clearWorld();
  createWorld();
  balls = [];
  score = 0;
  nextLevel = randomNextLevel();
  aimX = width / 2;
  canDrop = true;
  isGameOver = false;
  warnedAt = 0;
  scoreEl.textContent = "0";
  updateBest();
  dropButton.disabled = false;
  messageEl.textContent = "移动鼠标或手指选择杯口位置，点击舞台或按空格投下。香奈美准备好啦。";
  renderNext();
  renderLevelGuide();
  cancelAnimationFrame(animationFrame);
  render();
}

function boot() {
  if (!window.Matter) {
    messageEl.textContent = "物理引擎没有加载成功，香奈美暂时没法把球丢进烧杯里。";
    dropButton.disabled = true;
    restartButton.disabled = true;
    return;
  }
  preloadImages();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("pointermove", updateAim);
  canvas.addEventListener("pointerdown", (event) => {
    updateAim(event);
    dropBall();
  });
  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
    updateAim(event);
  }, { passive: false });
  dropButton.addEventListener("click", dropBall);
  restartButton.addEventListener("click", restart);
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      dropBall();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      aimX = Math.max(bottle.left + levels[nextLevel].radius, aimX - 18);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      aimX = Math.min(bottle.right - levels[nextLevel].radius, aimX + 18);
    }
  });
  restart();
}

boot();
