const boardEl = document.querySelector("#board");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const messageEl = document.querySelector("#message");
const restartButton = document.querySelector("#restart");
const bestKey = "kanami-2048-best";
const labels = {
  2: "♪",
  4: "Soda",
  8: "Be Shinning",
  16: "Stamp",
  32: "Stage",
  64: "Kanami",
  128: "World",
  256: "Encore",
  512: "Dream",
  1024: "Idol",
  2048: "占领世界"
};

let grid = [];
let score = 0;
let touchStart = null;

function emptyGrid() {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
}

function bestScore() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateBest() {
  if (score > bestScore()) localStorage.setItem(bestKey, String(score));
  bestEl.textContent = String(bestScore());
}

function render() {
  updateBest();
  scoreEl.textContent = String(score);
  const cells = [];
  grid.flat().forEach((value) => {
    const cell = document.createElement("div");
    cell.className = value ? `cell tile value-${value}` : "cell";
    cell.textContent = value ? labels[value] || String(value) : "";
    cells.push(cell);
  });
  boardEl.replaceChildren(...cells);
}

function randomEmptyCell() {
  const empty = [];
  grid.forEach((row, r) => row.forEach((value, c) => {
    if (!value) empty.push([r, c]);
  }));
  if (!empty.length) return null;
  return empty[Math.floor(Math.random() * empty.length)];
}

function addTile() {
  const cell = randomEmptyCell();
  if (!cell) return;
  grid[cell[0]][cell[1]] = Math.random() > 0.88 ? 4 : 2;
}

function compact(line) {
  const values = line.filter(Boolean);
  const result = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      const merged = values[i] * 2;
      result.push(merged);
      gained += merged;
      i += 1;
    } else {
      result.push(values[i]);
    }
  }
  while (result.length < 4) result.push(0);
  return { line: result, gained };
}

function rotateRight(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function rotateLeft(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[3 - index]));
}

function sameGrid(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canMove() {
  if (randomEmptyCell()) return true;
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const value = grid[r][c];
      if (grid[r + 1]?.[c] === value || grid[r][c + 1] === value) return true;
    }
  }
  return false;
}

function move(direction) {
  const before = grid.map((row) => [...row]);
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

  if (sameGrid(before, working)) return;
  grid = working;
  score += gained;
  addTile();
  render();

  if (grid.flat().includes(2048)) {
    messageEl.textContent = "2048 达成！香奈美的歌声已经传到世界尽头啦。";
  } else if (!canMove()) {
    messageEl.textContent = "没有可移动的格子了。香奈美整理一下舞台，我们再来一局吧。";
  } else {
    messageEl.textContent = gained ? `合成 +${gained}，这一下很漂亮。` : "继续滑动，香奈美在看着棋盘呢。";
  }
}

function restart() {
  grid = emptyGrid();
  score = 0;
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
restart();
