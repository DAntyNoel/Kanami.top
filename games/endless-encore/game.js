const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const distanceEl = document.querySelector("#distance");
const comboEl = document.querySelector("#combo");
const hpEl = document.querySelector("#hp");
const bestEl = document.querySelector("#best");
const startButton = document.querySelector("#start");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const overlayAction = document.querySelector("#overlay-action");
const messageEl = document.querySelector("#message");
const controlButtons = Array.from(document.querySelectorAll("[data-control]"));

const STORAGE_KEY = "kanami-endless-encore-best";
const DPR_LIMIT = 2;
const WORLD_SCALE = 9;
const ASSET_PATHS = {
  player: "../../res/images/favicon.png",
  portrait: "../../res/images/lovekanami.jpg",
  bgSoda: "../../res/images/backgrounds/Soda.png",
  bgShining: "../../res/images/backgrounds/Be-Shinning.png",
  stampHappy: "../../res/images/stamps/003.jpg",
  stampHeart: "../../res/images/stamps/004.png",
  stampPlease: "../../res/images/stamps/001.png"
};

const images = {};
const controls = {
  left: false,
  right: false,
  jump: false,
  down: false,
  dash: false,
  probe: false
};
const pressed = {
  jump: false,
  dash: false,
  probe: false
};

const game = {
  mode: "ready",
  width: 960,
  height: 540,
  lastTime: 0,
  cameraX: 0,
  distance: 0,
  bonusScore: 0,
  combo: 0,
  comboTimer: 0,
  best: readBest(),
  nextSpawnX: 620,
  spawnStep: 260,
  particles: [],
  entities: [],
  floaters: [],
  shake: 0,
  messageTimer: 0,
  pulse: null,
  startedAt: 0
};

const player = {
  x: 92,
  y: 0,
  width: 52,
  height: 78,
  baseHeight: 78,
  slideHeight: 44,
  vx: 0,
  vy: 0,
  hp: 100,
  maxHp: 100,
  onGround: false,
  invulnerable: 0,
  dashTime: 0,
  dashCooldown: 0,
  probeCooldown: 0,
  slideTime: 0
};

const messages = {
  start: "巡演开始啦，今天也把星光带到更远的地方吧。",
  pickup: ["星光收到！这份应援我会好好带上。", "节奏很好哦，再往前一点点。", "漂亮的收集，香奈美看见啦。"],
  probe: ["灯牌点亮成功！这就是应援的默契。", "暗掉的舞台也被你照亮啦。", "谢谢你帮我把这束光找回来。"],
  near: ["刚刚那一下很漂亮，差一点就碰到暗灯了。", "好险，但你稳住啦。", "这个闪避我记进安可名单了。"],
  hit: ["没关系，先稳住呼吸，我还在这里。", "暗灯擦到了，别急，节奏还能追回来。"],
  heal: "汽水补给到位，声音又亮起来啦。",
  end: "这次的安可先到这里，我已经记下你的应援距离了。"
};

function loadImages() {
  Object.entries(ASSET_PATHS).forEach(([key, src]) => {
    const image = new Image();
    image.src = src;
    images[key] = image;
  });
}

function readBest() {
  return Number(localStorage.getItem(STORAGE_KEY) || "0");
}

function writeBest(score) {
  const best = Math.max(readBest(), score);
  localStorage.setItem(STORAGE_KEY, String(best));
  game.best = best;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function groundY() {
  return game.height - 82;
}

function totalScore() {
  return Math.floor(game.distance * 2.25 + game.bonusScore);
}

function setMessage(text, duration = 2.2) {
  messageEl.textContent = text;
  game.messageTimer = duration;
}

function updateHud() {
  scoreEl.textContent = String(totalScore());
  distanceEl.textContent = `${Math.floor(game.distance)}m`;
  comboEl.textContent = String(game.combo);
  hpEl.textContent = String(Math.max(0, Math.ceil(player.hp)));
  bestEl.textContent = String(game.best);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  game.width = Math.max(320, rect.width);
  game.height = Math.max(220, rect.height);
  canvas.width = Math.round(game.width * dpr);
  canvas.height = Math.round(game.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetGame() {
  game.mode = "running";
  game.lastTime = performance.now();
  game.cameraX = 0;
  game.distance = 0;
  game.bonusScore = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.nextSpawnX = 640;
  game.spawnStep = 260;
  game.particles = [];
  game.entities = [];
  game.floaters = [];
  game.shake = 0;
  game.pulse = null;
  game.startedAt = Date.now();

  player.x = 92;
  player.width = 52;
  player.height = player.baseHeight;
  player.y = groundY() - player.height;
  player.vx = 140;
  player.vy = 0;
  player.hp = player.maxHp;
  player.onGround = true;
  player.invulnerable = 0;
  player.dashTime = 0;
  player.dashCooldown = 0;
  player.probeCooldown = 0;
  player.slideTime = 0;

  overlay.hidden = true;
  startButton.textContent = "重开";
  setMessage(messages.start);
  updateHud();
}

function endGame() {
  game.mode = "ended";
  const score = totalScore();
  writeBest(score);
  overlayTitle.textContent = "安可结算";
  overlayCopy.textContent = `这次送出了 ${Math.floor(game.distance)}m 的应援，分数 ${score}。下次我会在更远的舞台等你。`;
  overlayAction.textContent = "再跑一局";
  overlay.hidden = false;
  startButton.textContent = "再来";
  setMessage(messages.end, 5);
  updateHud();
}

function addBonus(points, label, x, y, keepsCombo = true) {
  const multiplier = Math.min(3, 1 + Math.floor(game.combo / 5) * 0.25);
  const gained = Math.round(points * multiplier);
  game.bonusScore += gained;
  game.floaters.push({
    x,
    y,
    text: `${label} +${gained}`,
    life: 1,
    color: keepsCombo ? "#a33768" : "#5c6ac4"
  });
  if (keepsCombo) {
    game.combo += 1;
    game.comboTimer = 2.5;
  }
}

function breakCombo() {
  game.combo = 0;
  game.comboTimer = 0;
}

function damage(amount) {
  if (player.invulnerable > 0 || player.dashTime > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invulnerable = 0.8;
  game.shake = 0.28;
  breakCombo();
  setMessage(choose(messages.hit));
  for (let i = 0; i < 12; i += 1) {
    spawnParticle(player.x + player.width / 2, player.y + player.height / 2, "#ff70a6");
  }
  if (player.hp <= 0) endGame();
}

function heal(amount, x, y) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
  addBonus(90, "补给", x, y, false);
  setMessage(messages.heal);
}

function spawnParticle(x, y, color) {
  game.particles.push({
    x,
    y,
    vx: rand(-120, 120),
    vy: rand(-220, -70),
    size: rand(3, 7),
    life: rand(0.45, 0.8),
    color
  });
}

function spawnPickupLine(x, y, count, arc = 0) {
  for (let i = 0; i < count; i += 1) {
    game.entities.push({
      type: "pickup",
      x: x + i * 42,
      y: y - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * arc,
      width: 26,
      height: 26,
      collected: false,
      phase: rand(0, Math.PI * 2)
    });
  }
}

function spawnObstacle(x, kind) {
  const low = kind === "low";
  const flying = kind === "flying";
  const height = low ? 36 : flying ? 48 : rand(62, 94);
  game.entities.push({
    type: "obstacle",
    kind,
    x,
    y: flying ? groundY() - 132 : groundY() - height,
    width: low ? 74 : flying ? 58 : 48,
    height,
    hit: false,
    passed: false,
    phase: rand(0, Math.PI * 2)
  });
}

function spawnProbeTarget(x) {
  game.entities.push({
    type: "target",
    x,
    y: groundY() - 126,
    width: 58,
    height: 72,
    scanned: false,
    passed: false,
    phase: rand(0, Math.PI * 2)
  });
}

function spawnHeal(x) {
  game.entities.push({
    type: "heal",
    x,
    y: groundY() - rand(118, 170),
    width: 30,
    height: 30,
    collected: false,
    phase: rand(0, Math.PI * 2)
  });
}

function spawnNextChunk() {
  const x = game.nextSpawnX;
  const difficulty = clamp(game.distance / 450, 0, 1);
  const pattern = Math.random();

  if (pattern < 0.25) {
    spawnPickupLine(x, groundY() - rand(112, 168), 5 + Math.floor(rand(0, 3)), 42);
  } else if (pattern < 0.5) {
    spawnObstacle(x, Math.random() < 0.55 ? "tall" : "low");
    spawnPickupLine(x + 92, groundY() - 150, 4, 30);
  } else if (pattern < 0.72) {
    spawnProbeTarget(x + 30);
    spawnPickupLine(x + 122, groundY() - 150, 4, 28);
  } else if (pattern < 0.9) {
    spawnObstacle(x, "flying");
    spawnPickupLine(x + 82, groundY() - 96, 4, 18);
  } else {
    spawnObstacle(x, "tall");
    spawnProbeTarget(x + 118);
  }

  if (Math.random() < 0.12) spawnHeal(x + rand(120, 220));
  game.spawnStep = rand(230, 320) - difficulty * 56;
  game.nextSpawnX += game.spawnStep;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function playerRect() {
  const slideInset = player.height < player.baseHeight ? 12 : 5;
  return {
    x: player.x + 7,
    y: player.y + slideInset,
    width: player.width - 14,
    height: player.height - slideInset - 4
  };
}

function triggerProbe() {
  if (player.probeCooldown > 0) return;
  player.probeCooldown = 0.72;
  game.pulse = {
    x: player.x + player.width / 2,
    y: player.y + player.height * 0.45,
    radius: 0,
    life: 0.32
  };
  setMessage("应援光波，发射。");
}

function triggerDash() {
  if (player.dashCooldown > 0) return;
  player.dashTime = 0.2;
  player.dashCooldown = 1.35;
  player.invulnerable = Math.max(player.invulnerable, 0.22);
  for (let i = 0; i < 10; i += 1) {
    spawnParticle(player.x + 6, player.y + player.height / 2, "#41c7d8");
  }
}

function updateInput(dt) {
  const difficulty = clamp(game.distance / 700, 0, 1);
  let targetSpeed = 130 + difficulty * 56;
  if (controls.right) targetSpeed += 150;
  if (controls.left) targetSpeed -= 110;
  if (controls.down && player.onGround) targetSpeed += 20;
  if (player.dashTime > 0) targetSpeed += 430;
  player.vx = lerp(player.vx, Math.max(60, targetSpeed), clamp(dt * 4.6, 0, 1));

  if (pressed.jump && player.onGround) {
    player.vy = -760;
    player.onGround = false;
    for (let i = 0; i < 8; i += 1) {
      spawnParticle(player.x + player.width / 2, groundY() - 4, "#ffd166");
    }
  }
  if (pressed.dash) triggerDash();
  if (pressed.probe) triggerProbe();

  pressed.jump = false;
  pressed.dash = false;
  pressed.probe = false;
}

function updatePlayer(dt) {
  const sliding = controls.down && player.onGround;
  const oldBottom = player.y + player.height;
  player.height = sliding ? player.slideHeight : player.baseHeight;
  player.y = oldBottom - player.height;

  player.x += player.vx * dt;
  player.vy += 1900 * dt;
  player.y += player.vy * dt;

  if (player.y + player.height >= groundY()) {
    player.y = groundY() - player.height;
    player.vy = 0;
    player.onGround = true;
  }

  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.dashTime = Math.max(0, player.dashTime - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.probeCooldown = Math.max(0, player.probeCooldown - dt);
  game.distance = player.x / WORLD_SCALE;
  game.cameraX = Math.max(0, player.x - game.width * 0.32);
}

function updatePulse(dt) {
  if (!game.pulse) return;
  game.pulse.life -= dt;
  game.pulse.radius = lerp(game.pulse.radius, 188, clamp(dt * 14, 0, 1));
  if (game.pulse.life <= 0) {
    game.pulse = null;
    return;
  }

  game.entities.forEach((entity) => {
    if (entity.type !== "target" || entity.scanned) return;
    const dx = entity.x + entity.width / 2 - game.pulse.x;
    const dy = entity.y + entity.height / 2 - game.pulse.y;
    if (Math.hypot(dx, dy) <= game.pulse.radius + 20) {
      entity.scanned = true;
      entity.width = 66;
      entity.height = 78;
      addBonus(260, "灯牌", entity.x, entity.y);
      setMessage(choose(messages.probe));
      for (let i = 0; i < 16; i += 1) {
        spawnParticle(entity.x + entity.width / 2, entity.y + entity.height / 2, "#ffd166");
      }
    }
  });
}

function updateEntities(dt) {
  while (game.nextSpawnX < game.cameraX + game.width + 520) {
    spawnNextChunk();
  }

  const rect = playerRect();
  game.entities.forEach((entity) => {
    if (entity.type === "pickup" && !entity.collected) {
      const bob = Math.sin(performance.now() / 180 + entity.phase) * 4;
      if (rectsOverlap(rect, { ...entity, y: entity.y + bob })) {
        entity.collected = true;
        addBonus(55, "星光", entity.x, entity.y);
        setMessage(choose(messages.pickup), 1.6);
        for (let i = 0; i < 8; i += 1) spawnParticle(entity.x + 13, entity.y + 13, "#ffd166");
      }
    }

    if (entity.type === "heal" && !entity.collected) {
      const bob = Math.sin(performance.now() / 190 + entity.phase) * 5;
      if (rectsOverlap(rect, { ...entity, y: entity.y + bob })) {
        entity.collected = true;
        heal(22, entity.x, entity.y);
        for (let i = 0; i < 10; i += 1) spawnParticle(entity.x + 15, entity.y + 15, "#77d59f");
      }
    }

    if (entity.type === "obstacle" && !entity.hit && rectsOverlap(rect, entity)) {
      entity.hit = true;
      damage(entity.kind === "flying" ? 16 : 20);
    }

    if ((entity.type === "obstacle" || entity.type === "target") &&
      !entity.passed &&
      entity.x + entity.width < player.x - 12 &&
      !entity.hit &&
      entity.type !== "target") {
      entity.passed = true;
      addBonus(80, "闪避", player.x, player.y);
      if (Math.random() < 0.5) setMessage(choose(messages.near), 1.8);
    }
  });

  game.entities = game.entities.filter((entity) => {
    if (entity.collected) return false;
    return entity.x + entity.width > game.cameraX - 180;
  });
}

function updateParticles(dt) {
  game.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 320 * dt;
    particle.life -= dt;
  });
  game.particles = game.particles.filter((particle) => particle.life > 0);

  game.floaters.forEach((floater) => {
    floater.y -= 32 * dt;
    floater.life -= dt;
  });
  game.floaters = game.floaters.filter((floater) => floater.life > 0);

  game.comboTimer = Math.max(0, game.comboTimer - dt);
  if (game.comboTimer <= 0) game.combo = 0;
  game.shake = Math.max(0, game.shake - dt);
  game.messageTimer = Math.max(0, game.messageTimer - dt);
}

function update(dt) {
  if (game.mode !== "running") return;
  updateInput(dt);
  updatePlayer(dt);
  updatePulse(dt);
  updateEntities(dt);
  updateParticles(dt);
  updateHud();
}

function drawCover(image, x, y, width, height, alpha = 1) {
  if (!image || !image.complete || image.naturalWidth === 0) return false;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  ctx.restore();
  return true;
}

function drawRoundedImage(image, x, y, width, height, radius, alpha = 1) {
  ctx.save();
  roundRect(x, y, width, height, radius);
  ctx.clip();
  if (!drawCover(image, x, y, width, height, alpha)) {
    ctx.fillStyle = "#ffb6d6";
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawParallax(image, factor, y, height, alpha) {
  const tileWidth = game.width * 1.25;
  const offset = -((game.cameraX * factor) % tileWidth);
  for (let x = offset - tileWidth; x < game.width + tileWidth; x += tileWidth) {
    drawCover(image, x, y, tileWidth, height, alpha);
  }
}

function seededUnit(seed) {
  const value = Math.sin(seed * 127.1) * 43758.5453123;
  return value - Math.floor(value);
}

function fillOval(x, y, width, height) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.scale(width / 2, height / 2);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBranch(fromX, fromY, toX, toY, width, color) {
  const bend = (toX - fromX) * 0.28;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.bezierCurveTo(fromX + bend, fromY - 26, toX - bend * 0.4, toY + 18, toX, toY);
  ctx.stroke();
  ctx.restore();
}

function drawBlossomCloud(centerX, centerY, radius, seed, alpha) {
  const colors = ["#ffd3e6", "#ffc1d8", "#fff0f7", "#f8b6d8", "#f4d7ff"];
  ctx.save();
  ctx.globalAlpha = alpha;

  for (let i = 0; i < 12; i += 1) {
    const angle = seededUnit(seed + i * 1.9) * Math.PI * 2;
    const distance = radius * (0.08 + seededUnit(seed + i * 2.7) * 0.58);
    const bloomRadius = radius * (0.34 + seededUnit(seed + i * 3.4) * 0.28);
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance * 0.62;
    const gradient = ctx.createRadialGradient(x - bloomRadius * 0.25, y - bloomRadius * 0.35, 2, x, y, bloomRadius);
    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.5, colors[i % colors.length]);
    gradient.addColorStop(1, "rgba(247,136,185,0.72)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, bloomRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (let i = 0; i < 9; i += 1) {
    const angle = seededUnit(seed + i * 4.1) * Math.PI * 2;
    const distance = radius * (0.16 + seededUnit(seed + i * 5.2) * 0.54);
    ctx.beginPath();
    ctx.arc(
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance * 0.58,
      radius * 0.055,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawPetal(x, y, size, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(1, 0.58);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLantern(x, y, seed) {
  ctx.save();
  ctx.strokeStyle = "rgba(112,75,130,0.36)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 28);
  ctx.lineTo(x, y - 5);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(x - 12, y - 4, x + 12, y + 24);
  gradient.addColorStop(0, "#fff7bf");
  gradient.addColorStop(0.55, "#ffd166");
  gradient.addColorStop(1, "#ff8fbd");
  ctx.fillStyle = gradient;
  roundRect(x - 13, y - 5, 26, 26, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(118,105,216,0.78)";
  ctx.font = "900 12px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(seededUnit(seed) > 0.5 ? "K" : "♪", x, y + 12);
  ctx.restore();
}

function drawKanamiTree(x, baseY, scale, seed, alpha = 1) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  ctx.fillStyle = "rgba(72,45,82,0.16)";
  fillOval(-48, -8, 108, 22);

  const trunkGradient = ctx.createLinearGradient(-18, -142, 18, 4);
  trunkGradient.addColorStop(0, "#8f5f86");
  trunkGradient.addColorStop(0.5, "#6d4666");
  trunkGradient.addColorStop(1, "#3e2d4a");
  ctx.fillStyle = trunkGradient;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.bezierCurveTo(-21, -45, -16, -94, -6, -142);
  ctx.bezierCurveTo(5, -102, 22, -44, 15, 0);
  ctx.closePath();
  ctx.fill();

  drawBranch(-5, -104, -72, -166, 13, "#6d4666");
  drawBranch(-2, -120, 76, -184, 12, "#704b70");
  drawBranch(3, -84, 52, -136, 9, "#7b5276");
  drawBranch(-7, -70, -46, -118, 8, "#6b4565");

  drawBlossomCloud(-66, -178, 54, seed + 3, 0.92);
  drawBlossomCloud(-24, -204, 62, seed + 11, 0.98);
  drawBlossomCloud(38, -190, 70, seed + 19, 0.98);
  drawBlossomCloud(88, -154, 48, seed + 29, 0.88);

  drawLantern(-50, -120, seed + 31);
  drawLantern(58, -126, seed + 37);

  for (let i = 0; i < 11; i += 1) {
    const px = -88 + seededUnit(seed + i * 6.7) * 190;
    const py = -124 + seededUnit(seed + i * 7.3) * 118;
    const size = 2.4 + seededUnit(seed + i * 8.1) * 2.8;
    drawPetal(px, py, size, seededUnit(seed + i * 9.5) * Math.PI, "rgba(255,214,232,0.78)");
  }

  ctx.restore();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, game.height);
  sky.addColorStop(0, "#fff5fb");
  sky.addColorStop(0.45, "#ddf7ff");
  sky.addColorStop(1, "#fff8dc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, game.width, game.height);

  drawParallax(images.bgSoda, 0.08, 0, game.height * 0.72, 0.24);
  drawParallax(images.bgShining, 0.18, game.height * 0.1, game.height * 0.58, 0.18);

  const camera = game.cameraX;
  for (let x = -((camera * 0.24) % 260) - 80; x < game.width + 280; x += 260) {
    const seed = Math.floor((camera * 0.24 + x) / 260) + 100;
    drawKanamiTree(x + 78, groundY() - 2, 0.46 + seededUnit(seed) * 0.06, seed, 0.42);
  }

  for (let x = -((camera * 0.46) % 330) - 120; x < game.width + 360; x += 330) {
    const seed = Math.floor((camera * 0.46 + x) / 330) + 220;
    drawKanamiTree(x + 126, groundY() - 4, 0.68 + seededUnit(seed) * 0.08, seed, 0.76);
  }

  const stage = ctx.createLinearGradient(0, groundY(), 0, game.height);
  stage.addColorStop(0, "#6751a0");
  stage.addColorStop(0.56, "#2e2946");
  stage.addColorStop(1, "#1f1a31");
  ctx.fillStyle = stage;
  ctx.fillRect(0, groundY(), game.width, game.height - groundY());

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  for (let x = -((camera * 0.8) % 72); x < game.width + 72; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, groundY() + 22);
    ctx.lineTo(x + 36, game.height);
    ctx.stroke();
  }
}

function drawPickup(entity) {
  const x = entity.x - game.cameraX;
  const y = entity.y + Math.sin(performance.now() / 180 + entity.phase) * 4;
  ctx.save();
  ctx.translate(x + entity.width / 2, y + entity.height / 2);
  ctx.rotate(performance.now() / 800 + entity.phase);
  ctx.fillStyle = "#ffd166";
  ctx.strokeStyle = "rgba(163,55,104,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    const radius = i % 2 === 0 ? 14 : 6;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHeal(entity) {
  const x = entity.x - game.cameraX;
  const y = entity.y + Math.sin(performance.now() / 190 + entity.phase) * 5;
  ctx.save();
  ctx.fillStyle = "#77d59f";
  roundRect(x, y, entity.width, entity.height, 8);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.fillRect(x + 12, y + 6, 6, 18);
  ctx.fillRect(x + 6, y + 12, 18, 6);
  ctx.restore();
}

function drawObstacle(entity) {
  const x = entity.x - game.cameraX;
  const y = entity.y + Math.sin(performance.now() / 260 + entity.phase) * (entity.kind === "flying" ? 5 : 0);
  ctx.save();
  ctx.globalAlpha = entity.hit ? 0.42 : 1;
  ctx.fillStyle = entity.kind === "low" ? "#31283d" : "#241f31";
  roundRect(x, y, entity.width, entity.height, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,112,166,0.64)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,209,102,0.82)";
  if (entity.kind === "low") {
    ctx.fillRect(x + 10, y + 10, entity.width - 20, 6);
  } else if (entity.kind === "flying") {
    ctx.beginPath();
    ctx.arc(x + entity.width / 2, y + entity.height / 2, 12, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(x + 12, y + 12, entity.width - 24, 8);
    ctx.fillRect(x + 18, y + 30, entity.width - 36, 8);
  }
  ctx.restore();
}

function drawTarget(entity) {
  const x = entity.x - game.cameraX;
  const y = entity.y + Math.sin(performance.now() / 220 + entity.phase) * 3;
  ctx.save();
  ctx.globalAlpha = entity.scanned ? 1 : 0.72;
  ctx.fillStyle = entity.scanned ? "rgba(255,255,255,0.86)" : "rgba(38,31,54,0.72)";
  roundRect(x, y, entity.width, entity.height, 8);
  ctx.fill();
  drawRoundedImage(entity.scanned ? images.stampHeart : images.stampPlease, x + 7, y + 7, entity.width - 14, entity.height - 14, 8, entity.scanned ? 1 : 0.62);
  ctx.strokeStyle = entity.scanned ? "#ffd166" : "rgba(65,199,216,0.64)";
  ctx.lineWidth = 3;
  roundRect(x, y, entity.width, entity.height, 8);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const x = player.x - game.cameraX;
  const y = player.y;
  const flash = player.invulnerable > 0 && Math.floor(performance.now() / 90) % 2 === 0;
  if (flash) return;

  if (player.dashTime > 0) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 1; i <= 4; i += 1) {
      drawRoundedImage(images.player, x - i * 18, y + i * 2, player.width, player.height, 14, 0.34 / i);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(255,112,166,0.42)";
  ctx.shadowBlur = player.dashTime > 0 ? 26 : 12;
  drawRoundedImage(images.player, x, y, player.width, player.height, 14);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = player.dashTime > 0 ? "#41c7d8" : "#ffffff";
  ctx.lineWidth = 4;
  roundRect(x, y, player.width, player.height, 14);
  ctx.stroke();
  ctx.restore();
}

function drawPulse() {
  if (!game.pulse) return;
  const alpha = clamp(game.pulse.life / 0.32, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#41c7d8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(game.pulse.x - game.cameraX, game.pulse.y, game.pulse.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = "#41c7d8";
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  game.particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x - game.cameraX, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawFloaters() {
  game.floaters.forEach((floater) => {
    ctx.save();
    ctx.globalAlpha = clamp(floater.life, 0, 1);
    ctx.fillStyle = floater.color;
    ctx.font = "800 16px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(floater.text, floater.x - game.cameraX, floater.y);
    ctx.restore();
  });
}

function drawCanvasHud() {
  const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  roundRect(18, 18, 186, 18, 9);
  ctx.fill();
  ctx.fillStyle = hpRatio > 0.34 ? "#77d59f" : "#ff70a6";
  roundRect(21, 21, 180 * hpRatio, 12, 6);
  ctx.fill();

  drawCooldown(18, 46, 86, "冲刺", player.dashCooldown / 1.35, "#41c7d8");
  drawCooldown(112, 46, 96, "光波", player.probeCooldown / 0.72, "#ffd166");
  ctx.restore();
}

function drawCooldown(x, y, width, label, ratio, color) {
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  roundRect(x, y, width, 22, 8);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(x + 2, y + 2, (width - 4) * (1 - clamp(ratio, 0, 1)), 18, 7);
  ctx.fill();
  ctx.fillStyle = "#2a2634";
  ctx.font = "800 11px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + width / 2, y + 15);
}

function draw() {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate(rand(-6, 6) * game.shake * 3, rand(-4, 4) * game.shake * 3);
  }
  drawBackground();
  game.entities.forEach((entity) => {
    if (entity.type === "pickup") drawPickup(entity);
    if (entity.type === "heal") drawHeal(entity);
    if (entity.type === "obstacle") drawObstacle(entity);
    if (entity.type === "target") drawTarget(entity);
  });
  drawPulse();
  drawPlayer();
  drawParticles();
  drawFloaters();
  drawCanvasHud();
  ctx.restore();
}

function loop(now) {
  const dt = Math.min((now - game.lastTime) / 1000 || 0, 0.05);
  game.lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function mapKey(event) {
  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a") return "left";
  if (key === "arrowright" || key === "d") return "right";
  if (key === "arrowup" || key === "w" || key === " ") return "jump";
  if (key === "arrowdown" || key === "s") return "down";
  if (key === "shift") return "dash";
  if (key === "f" || key === "enter") return "probe";
  return "";
}

function setControl(control, active) {
  if (!control) return;
  if (active && !controls[control] && pressed[control] !== undefined) {
    pressed[control] = true;
  }
  controls[control] = active;
}

function releaseAllControls() {
  Object.keys(controls).forEach((control) => {
    controls[control] = false;
  });
}

function startOrRestart() {
  resetGame();
}

window.addEventListener("keydown", (event) => {
  const control = mapKey(event);
  if (!control) {
    if ((event.key === "Enter" || event.key === " ") && game.mode !== "running") startOrRestart();
    return;
  }
  event.preventDefault();
  if (game.mode !== "running" && (control === "jump" || control === "probe")) {
    startOrRestart();
    return;
  }
  if (!event.repeat) setControl(control, true);
});

window.addEventListener("keyup", (event) => {
  const control = mapKey(event);
  if (!control) return;
  event.preventDefault();
  setControl(control, false);
});

window.addEventListener("blur", releaseAllControls);
window.addEventListener("resize", () => {
  resizeCanvas();
  if (game.mode !== "running") {
    player.y = groundY() - player.height;
    draw();
  }
});

canvas.addEventListener("pointerdown", () => {
  if (game.mode !== "running") {
    startOrRestart();
    return;
  }
  pressed.probe = true;
});

controlButtons.forEach((button) => {
  const control = button.dataset.control;
  const press = (event) => {
    event.preventDefault();
    button.classList.add("is-pressed");
    if (game.mode !== "running") startOrRestart();
    setControl(control, true);
  };
  const release = (event) => {
    event.preventDefault();
    button.classList.remove("is-pressed");
    setControl(control, false);
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

startButton.addEventListener("click", startOrRestart);
overlayAction.addEventListener("click", startOrRestart);

loadImages();
resizeCanvas();
player.y = groundY() - player.height;
bestEl.textContent = String(game.best);
updateHud();
draw();
requestAnimationFrame(loop);
