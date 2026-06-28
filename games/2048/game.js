const boardEl = document.querySelector("#board");
const boardCellsEl = document.querySelector("#board-cells");
const tileLayerEl = document.querySelector("#tile-layer");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const messageEl = document.querySelector("#message");
const restartButton = document.querySelector("#restart");
const boardSize = 4;
const moveAnimationMs = 210;
const bestKey = "kanami-2048-best";
const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;

const defaultTileAsset = {
  text: ({ value }) => String(value),
  background: "#6f5f90",
  color: "#ffffff",
  fontSize: "0.82rem",
  shadow: "inset 0 -8px 18px rgba(43, 41, 50, 0.08)",
  backgroundImage: "",
  backgroundPosition: "center",
  backgroundSize: "cover",
  className: ""
};

// Tile asset templates: edit text, colors, className, and backgroundImage here.
const tileAssets = {
  2: {
    text: "♪",
    background: "#fff4c7",
    color: "#2f2b34",
    fontSize: "1.6rem"
  },
  4: {
    text: "Soda",
    background: "#ffd8a8",
    color: "#fff7f0",
    fontSize: "1.25rem",
    backgroundImage: "linear-gradient(rgba(43, 41, 50, 0.05), rgba(43, 41, 50, 0.34)), url('../../res/images/backgrounds/Soda.png')",
    className: "tile-image"
  },
  8: {
    text: "Be Shinning",
    background: "#ffb0a6",
    color: "#ffffff",
    fontSize: "0.9rem",
    backgroundImage: "linear-gradient(rgba(43, 41, 50, 0.04), rgba(43, 41, 50, 0.38)), url('../../res/images/backgrounds/Be-Shinning.png')",
    className: "tile-image"
  },
  16: {
    text: "Stamp",
    background: "#f58bac",
    color: "#ffffff",
    fontSize: "0.95rem"
  },
  32: {
    text: "Stage",
    background: "#a3d8f4",
    color: "#2f2b34",
    fontSize: "0.9rem"
  },
  64: {
    text: "Kanami",
    background: "#81c7c0",
    color: "#ffffff",
    fontSize: "0.9rem"
  },
  128: {
    text: "World",
    fontSize: "0.82rem"
  },
  256: {
    text: "Encore",
    fontSize: "0.82rem"
  },
  512: {
    text: "Dream",
    fontSize: "0.82rem"
  },
  1024: {
    text: "Idol",
    fontSize: "0.82rem"
  },
  2048: {
    text: "占领世界",
    background: "#f5c65f",
    color: "#2f2b34",
    fontSize: "0.82rem",
    backgroundImage: "linear-gradient(rgba(255, 244, 199, 0.52), rgba(245, 139, 172, 0.35)), url('../../res/images/lovekanami.jpg')",
    className: "tile-image"
  }
};

let grid = [];
let score = 0;
let nextTileId = 1;
let touchStart = null;
let moveLocked = false;
let unlockTimer = 0;
let gameScoreRecorded = false;
const tileElements = new Map();

function emptyGrid() {
  return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => null));
}

function bestScore() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateBest() {
  if (score > bestScore()) localStorage.setItem(bestKey, String(score));
  bestEl.textContent = String(bestScore());
}

function renderBoardCells() {
  const cells = Array.from({ length: boardSize * boardSize }, () => {
    const cell = document.createElement("div");
    cell.className = "cell";
    return cell;
  });
  boardCellsEl.replaceChildren(...cells);
}

function createTile(value, spawned = false) {
  const tile = {
    id: nextTileId,
    value,
    spawned,
    merged: false
  };
  nextTileId += 1;
  return tile;
}

function tileAssetFor(value) {
  return { ...defaultTileAsset, ...(tileAssets[value] || {}) };
}

function tileText(asset, value) {
  if (typeof asset.text === "function") return asset.text({ value });
  return asset.text ?? String(value);
}

function setStyleValue(element, property, value) {
  if (value === undefined || value === null || value === "") {
    element.style.removeProperty(property);
    return;
  }
  element.style.setProperty(property, value);
}

function createTileElement(tile) {
  const tileEl = document.createElement("div");
  const faceEl = document.createElement("div");
  tileEl.dataset.tileId = String(tile.id);
  faceEl.className = "tile-face";
  tileEl.append(faceEl);
  tileEl.addEventListener("animationend", () => {
    tileEl.classList.remove("tile-new", "tile-merged");
  });
  tileElements.set(tile.id, tileEl);
  tileLayerEl.append(tileEl);
  return tileEl;
}

function applyTileAsset(tileEl, tile) {
  const faceEl = tileEl.querySelector(".tile-face");
  const asset = tileAssetFor(tile.value);
  const classes = ["tile", `value-${tile.value}`];

  if (asset.className) classes.push(...asset.className.split(/\s+/).filter(Boolean));
  if (tile.spawned) classes.push("tile-new");
  if (tile.merged) classes.push("tile-merged");

  tileEl.className = classes.join(" ");
  tileEl.dataset.value = String(tile.value);
  faceEl.textContent = tileText(asset, tile.value);
  faceEl.style.backgroundImage = asset.backgroundImage || "";
  faceEl.style.backgroundPosition = asset.backgroundPosition || "";
  faceEl.style.backgroundSize = asset.backgroundSize || "";
  setStyleValue(tileEl, "--tile-bg", asset.background);
  setStyleValue(tileEl, "--tile-color", asset.color);
  setStyleValue(tileEl, "--tile-font-size", asset.fontSize);
  setStyleValue(tileEl, "--tile-shadow", asset.shadow);
}

function render() {
  updateBest();
  scoreEl.textContent = String(score);
  const activeIds = new Set();

  grid.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (!tile) return;
      activeIds.add(tile.id);
      const tileEl = tileElements.get(tile.id) || createTileElement(tile);
      applyTileAsset(tileEl, tile);
      tileEl.style.setProperty("--row", rowIndex);
      tileEl.style.setProperty("--col", colIndex);
      tile.spawned = false;
      tile.merged = false;
    });
  });

  tileElements.forEach((tileEl, tileId) => {
    if (activeIds.has(tileId)) return;
    tileEl.remove();
    tileElements.delete(tileId);
  });
}

function randomEmptyCell() {
  const empty = [];
  grid.forEach((row, r) => row.forEach((value, c) => {
    if (!value) empty.push([r, c]);
  }));
  if (!empty.length) return null;
  return empty[Math.floor(Math.random() * empty.length)];
}

function addTile(spawned = true) {
  const cell = randomEmptyCell();
  if (!cell) return null;
  const value = Math.random() > 0.88 ? 4 : 2;
  const tile = createTile(value, spawned);
  grid[cell[0]][cell[1]] = tile;
  return tile;
}

function compact(line) {
  const values = line.filter(Boolean);
  const result = [];
  let gained = 0;

  for (let i = 0; i < values.length; i += 1) {
    if (values[i].value === values[i + 1]?.value) {
      const merged = {
        ...values[i],
        value: values[i].value * 2,
        merged: true,
        spawned: false
      };
      result.push(merged);
      gained += merged.value;
      i += 1;
    } else {
      result.push({ ...values[i], merged: false, spawned: false });
    }
  }

  while (result.length < boardSize) result.push(null);
  return { line: result, gained };
}

function rotateRight(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function rotateLeft(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[boardSize - 1 - index]));
}

function valueSnapshot(matrix) {
  return matrix.map((row) => row.map((tile) => tile?.value || 0));
}

function sameGridValues(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canMove() {
  if (randomEmptyCell()) return true;
  for (let r = 0; r < boardSize; r += 1) {
    for (let c = 0; c < boardSize; c += 1) {
      const value = grid[r][c]?.value;
      if (!value) continue;
      if (grid[r + 1]?.[c]?.value === value || grid[r][c + 1]?.value === value) return true;
    }
  }
  return false;
}

function unlockMovement() {
  window.clearTimeout(unlockTimer);
  moveLocked = true;
  unlockTimer = window.setTimeout(() => {
    moveLocked = false;
  }, prefersReducedMotion ? 0 : moveAnimationMs);
}

function updateMessage(gained) {
  if (grid.flat().some((tile) => tile?.value >= 2048)) {
    messageEl.textContent = "2048 达成！香奈美的歌声已经传到世界尽头啦。";
  } else if (!canMove()) {
    messageEl.textContent = "没有可移动的格子了。香奈美整理一下舞台，我们再来一局吧。";
    if (!gameScoreRecorded) {
      gameScoreRecorded = true;
      window.KanamiGameScore?.record({
        gameId: "kanami-2048",
        gameTitle: "香奈美 2048",
        score,
        detail: { maxTile: Math.max(...grid.flat().map((tile) => tile?.value || 0)) }
      });
    }
  } else {
    messageEl.textContent = gained ? `合成 +${gained}，这一下很漂亮。` : "继续滑动，香奈美在看着棋盘呢。";
  }
}

function move(direction) {
  if (moveLocked) return;
  const before = valueSnapshot(grid);
  let working = grid.map((row) => [...row]);
  if (direction === "up") working = rotateLeft(working);
  if (direction === "down") working = rotateRight(working);
  if (direction === "right") working = working.map((row) => [...row].reverse());

  let gained = 0;
  working = working.map((row) => {
    const result = compact(row);
    gained += result.gained;
    return result.line;
  });

  if (direction === "up") working = rotateRight(working);
  if (direction === "down") working = rotateLeft(working);
  if (direction === "right") working = working.map((row) => [...row].reverse());

  if (sameGridValues(before, valueSnapshot(working))) return;
  grid = working;
  score += gained;
  addTile();
  render();
  updateMessage(gained);
  unlockMovement();
}

function restart() {
  window.clearTimeout(unlockTimer);
  moveLocked = false;
  tileElements.forEach((tileEl) => tileEl.remove());
  tileElements.clear();
  grid = emptyGrid();
  score = 0;
  gameScoreRecorded = false;
  nextTileId = 1;
  addTile();
  addTile();
  messageEl.textContent = "用方向键或滑动来移动方块，香奈美会帮你记录最佳分数。";
  render();
}

document.addEventListener("keydown", (event) => {
  const map = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down"
  };
  if (!map[event.key]) return;
  event.preventDefault();
  move(map[event.key]);
});

boardEl.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

boardEl.addEventListener("touchend", (event) => {
  if (!touchStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
}, { passive: true });

restartButton.addEventListener("click", restart);
renderBoardCells();
restart();
