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

const config = window.BIG_KANAMI_CONFIG;
const tuning = config.tuning;
const width = tuning.stage.width;
const height = tuning.stage.height;
const bottle = tuning.bottle;
const bestKey = tuning.storage.bestKey;
const levels = config.ballTemplates.map((template, index) => normalizeLevel(template, index));

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

function normalizeLevel(template, index) {
  const radiusScale = tuning.ball.radiusScale ?? 1;
  const text = template.text || {};
  const ball = template.ball || {};
  const asset = template.asset || {};
  const name = text.name || `奈美 ${index + 1}`;

  return {
    id: template.id || `kanami-${index}`,
    name,
    label: text.label || name,
    mergeText: text.mergeText || `合体成功，${name}登场。`,
    finalText: text.finalText,
    radius: Math.max(4, Math.round((ball.baseRadius || 20) * radiusScale)),
    score: ball.score || 0,
    color: asset.fillColor || "#ffe26a",
    image: asset.backgroundImage,
    imageOpacity: asset.imageOpacity ?? 0.92,
    highlightColor: asset.highlightColor || "rgba(255, 255, 255, 0.2)",
    textColor: asset.textColor || "#242538",
    textStrokeColor: asset.textStrokeColor || "rgba(255, 255, 255, 0.9)"
  };
}

function applyTuning() {
  document.documentElement.style.setProperty("--game-aspect-ratio", `${width} / ${height}`);
  if (tuning.theme?.pageBackgroundImage) {
    document.documentElement.style.setProperty(
      "--page-background-image",
      `url("${tuning.theme.pageBackgroundImage}")`
    );
  }
  canvas.setAttribute("width", String(width));
  canvas.setAttribute("height", String(height));
}

function preloadImages() {
  const imageSources = new Set(levels.map((level) => level.image).filter(Boolean));
  imageSources.forEach((source) => {
    const image = new Image();
    image.src = source;
    image.onload = () => {
      renderNext();
      renderLevelGuide();
    };
    imageCache.set(source, image);
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
  return Math.random() < tuning.spawn.secondLevelChance ? Math.min(1, levels.length - 1) : 0;
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
    friction: tuning.physics.wallFriction,
    restitution: tuning.physics.wallRestitution,
    render: { visible: false },
    ...options
  });
}

function createWorld() {
  engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = tuning.physics.gravityY;
  runner = Runner.create();

  const wallHeight = bottle.floorY - bottle.lipY + bottle.wallExtraHeight;
  const wallY = bottle.lipY + wallHeight / 2 - bottle.wallYOffset;
  const sideWallWidth = bottle.sideWallThickness;
  const floorWidth = bottle.right - bottle.left + bottle.floorExtraWidth * 2;
  const leftWall = makeWall(bottle.left - sideWallWidth / 2, wallY, sideWallWidth, wallHeight);
  const rightWall = makeWall(bottle.right + sideWallWidth / 2, wallY, sideWallWidth, wallHeight);
  const floor = makeWall(
    (bottle.left + bottle.right) / 2,
    bottle.floorY + bottle.floorThickness / 2 - 1,
    floorWidth,
    bottle.floorThickness
  );

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
    restitution: tuning.physics.ballRestitution,
    friction: tuning.physics.ballFriction,
    frictionAir: tuning.physics.ballFrictionAir,
    density: tuning.physics.ballBaseDensity + levelIndex * tuning.physics.ballDensityStep,
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
  const x = Math.max(bottle.left + radius, Math.min(bottle.right - radius, aimX));
  createBall(nextLevel, x, bottle.lipY);
  nextLevel = randomNextLevel();
  canDrop = false;
  dropButton.disabled = true;
  renderNext();
  setTimeout(() => {
    canDrop = !isGameOver;
    dropButton.disabled = isGameOver;
  }, tuning.spawn.dropCooldownMs);
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
      x: (a.velocity.x + b.velocity.x) * tuning.physics.mergeVelocityXScale,
      y: Math.min(
        (a.velocity.y + b.velocity.y) * tuning.physics.mergeVelocityYScale,
        tuning.physics.mergeVelocityYMax
      )
    });
    score += levels[level].score;
    scoreEl.textContent = String(score);
    updateBest();
    messageEl.textContent = level === levels.length - 1
      ? (levels[level].finalText || levels[level].mergeText)
      : levels[level].mergeText;
  });
}

function checkGameOver() {
  if (isGameOver) return;
  const now = performance.now();
  const danger = balls.some((ball) => (
    ball.position.y - levels[ball.kanami.level].radius < bottle.gameOverY &&
    now - ball.kanami.bornAt > tuning.gameOver.graceMs &&
    Math.abs(ball.velocity.y) < tuning.gameOver.settledVelocityY
  ));

  if (!danger) {
    warnedAt = 0;
    return;
  }
  if (!warnedAt) {
    warnedAt = now;
    messageEl.textContent = tuning.text.crowded;
    return;
  }
  if (now - warnedAt > tuning.gameOver.warningMs) endGame();
}

function endGame() {
  isGameOver = true;
  canDrop = false;
  dropButton.disabled = true;
  messageEl.textContent = tuning.text.gameOver(score);
  window.KanamiGameScore?.record({
    gameId: "big-kanami",
    gameTitle: "合成大奈美",
    score,
    detail: { balls: balls.length }
  });
}

function drawImageCover(context, image, x, y, size) {
  if (!image || !image.complete || !image.naturalWidth) return false;
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
  context.globalAlpha = level.imageOpacity;
  drawImageCover(context, image, x - radius, y - radius, radius * 2);
  context.globalAlpha = 1;
  context.fillStyle = level.highlightColor;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 0.75);
  context.restore();

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.lineWidth = Math.max(2, radius * tuning.ball.rimWidthScale);
  context.strokeStyle = "rgba(255, 255, 255, 0.92)";
  context.stroke();
  context.lineWidth = Math.max(1, radius * tuning.ball.innerRimWidthScale);
  context.strokeStyle = "rgba(36, 37, 56, 0.18)";
  context.stroke();

  if (label && radius >= tuning.ball.labelMinRadius) {
    const labelText = level.label || level.name;
    const labelY = y + radius * tuning.ball.labelYOffsetScale;
    const maxTextWidth = radius * 1.72;
    const baseFontSize = Math.max(10, radius * tuning.ball.labelFontScale);
    context.font = `900 ${baseFontSize}px "Segoe UI", sans-serif`;
    const measuredWidth = context.measureText(labelText).width;
    if (measuredWidth > maxTextWidth) {
      const fittedFontSize = Math.max(8, baseFontSize * (maxTextWidth / measuredWidth));
      context.font = `900 ${fittedFontSize}px "Segoe UI", sans-serif`;
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4;
    context.strokeStyle = level.textStrokeColor;
    context.fillStyle = level.textColor;
    context.strokeText(labelText, x, labelY);
    context.fillText(labelText, x, labelY);
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
  ctx.quadraticCurveTo(
    (bottle.left + bottle.right) / 2,
    bottle.floorY + bottle.bottomCurveDepth,
    bottle.right,
    bottle.floorY
  );
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
  ctx.fillText(tuning.text.gameOverLine, bottle.left + 16, bottle.gameOverY - 8);
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
  drawBall(
    nextCtx,
    nextLevel,
    nextCanvas.width / 2,
    nextCanvas.height / 2,
    Math.min(1, tuning.ball.nextPreviewMaxRadius / levels[nextLevel].radius),
    false
  );
}

function renderLevelGuide() {
  if (!levelListEl) return;
  const cards = levels.map((level, index) => {
    const card = document.createElement("div");
    card.className = "level-card";

    const preview = document.createElement("canvas");
    preview.width = tuning.ball.guidePreviewSize;
    preview.height = tuning.ball.guidePreviewSize;
    const previewCtx = preview.getContext("2d");
    drawBall(
      previewCtx,
      index,
      preview.width / 2,
      preview.height / 2,
      Math.min(1, tuning.ball.guidePreviewMaxRadius / level.radius),
      false
    );

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
  const radius = levels[nextLevel].radius;
  aimX = Math.max(bottle.left + radius, Math.min(bottle.right - radius, canvasPoint(event)));
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
  messageEl.textContent = tuning.text.ready;
  renderNext();
  renderLevelGuide();
  cancelAnimationFrame(animationFrame);
  render();
}

function boot() {
  if (!window.Matter) {
    messageEl.textContent = tuning.text.missingEngine;
    dropButton.disabled = true;
    restartButton.disabled = true;
    return;
  }
  applyTuning();
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
      aimX = Math.max(bottle.left + levels[nextLevel].radius, aimX - tuning.controls.keyboardStep);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      aimX = Math.min(bottle.right - levels[nextLevel].radius, aimX + tuning.controls.keyboardStep);
    }
  });
  restart();
}

boot();
