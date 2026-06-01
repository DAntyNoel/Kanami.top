const size = 8;
const mineCount = 10;
const boardEl = document.querySelector("#board");
const flagsEl = document.querySelector("#flags");
const timerEl = document.querySelector("#timer");
const modeButton = document.querySelector("#mode");
const restartButton = document.querySelector("#restart");
const messageEl = document.querySelector("#message");

let board = [];
let openCount = 0;
let flags = 0;
let flagMode = false;
let gameOver = false;
let startedAt = 0;
let timerId = 0;
let longPressTimer = 0;
let suppressTap = false;

function neighbors(row, col) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue;
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) {
        cells.push([nextRow, nextCol]);
      }
    }
  }
  return cells;
}

function makeBoard() {
  board = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => ({
    row,
    col,
    mine: false,
    open: false,
    flagged: false,
    count: 0
  })));

  let placed = 0;
  while (placed < mineCount) {
    const row = Math.floor(Math.random() * size);
    const col = Math.floor(Math.random() * size);
    if (!board[row][col].mine) {
      board[row][col].mine = true;
      placed += 1;
    }
  }

  board.flat().forEach((cell) => {
    cell.count = neighbors(cell.row, cell.col).filter(([row, col]) => board[row][col].mine).length;
  });
}

function updateHud() {
  flagsEl.textContent = String(mineCount - flags);
  modeButton.textContent = flagMode ? "旗帜" : "翻开";
  modeButton.setAttribute("aria-pressed", String(flagMode));
}

function startTimer() {
  if (startedAt) return;
  startedAt = Date.now();
  timerId = window.setInterval(() => {
    timerEl.textContent = String(Math.floor((Date.now() - startedAt) / 1000));
  }, 1000);
}

function render() {
  const buttons = board.flat().map((cell) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.row = String(cell.row);
    button.dataset.col = String(cell.col);
    button.setAttribute("aria-label", `第 ${cell.row + 1} 行第 ${cell.col + 1} 列`);
    if (cell.open) {
      button.classList.add("is-open");
      if (cell.mine) {
        button.classList.add("is-mine");
        button.textContent = "★";
      } else {
        button.textContent = cell.count ? String(cell.count) : "";
      }
    } else if (cell.flagged) {
      button.classList.add("is-flagged");
      button.textContent = "旗";
    }
    button.addEventListener("click", () => {
      if (suppressTap) {
        suppressTap = false;
        return;
      }
      handleCell(cell.row, cell.col);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      toggleFlag(cell.row, cell.col);
    });
    button.addEventListener("touchstart", () => {
      suppressTap = false;
      longPressTimer = window.setTimeout(() => {
        suppressTap = true;
        toggleFlag(cell.row, cell.col);
      }, 520);
    }, { passive: true });
    button.addEventListener("touchend", () => window.clearTimeout(longPressTimer), { passive: true });
    return button;
  });
  boardEl.replaceChildren(...buttons);
  updateHud();
}

function reveal(row, col) {
  const cell = board[row][col];
  if (cell.open || cell.flagged) return;
  cell.open = true;
  openCount += 1;
  if (!cell.mine && cell.count === 0) {
    neighbors(row, col).forEach(([nextRow, nextCol]) => reveal(nextRow, nextCol));
  }
}

function revealAll() {
  board.flat().forEach((cell) => {
    if (cell.mine) cell.open = true;
  });
}

function finish(win) {
  gameOver = true;
  window.clearInterval(timerId);
  if (win) {
    messageEl.textContent = "全部安全格都揭开啦！香奈美的舞台顺利开演。";
  } else {
    revealAll();
    messageEl.textContent = "星光炸点被踩到了。香奈美把舞台重新整理好，我们再试一次。";
  }
  render();
}

function checkWin() {
  if (openCount === size * size - mineCount) finish(true);
}

function toggleFlag(row, col) {
  if (gameOver) return;
  startTimer();
  const cell = board[row][col];
  if (cell.open) return;
  if (!cell.flagged && flags >= mineCount) return;
  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
  messageEl.textContent = cell.flagged ? "这里先插旗，香奈美记住这个危险点。" : "旗帜收回，继续确认舞台。";
  render();
}

function handleCell(row, col) {
  if (gameOver) return;
  if (flagMode) {
    toggleFlag(row, col);
    return;
  }
  startTimer();
  const cell = board[row][col];
  if (cell.flagged || cell.open) return;
  if (cell.mine) {
    finish(false);
    return;
  }
  reveal(row, col);
  messageEl.textContent = cell.count ? "周围有星光炸点，小心推进。" : "这里很安全，香奈美帮你展开一片区域。";
  render();
  checkWin();
}

function restart() {
  window.clearInterval(timerId);
  openCount = 0;
  flags = 0;
  flagMode = false;
  gameOver = false;
  startedAt = 0;
  timerEl.textContent = "0";
  messageEl.textContent = "默认是翻开模式；手机上可以切换旗帜模式，或长按格子插旗。";
  makeBoard();
  render();
}

modeButton.addEventListener("click", () => {
  flagMode = !flagMode;
  updateHud();
});
restartButton.addEventListener("click", restart);
restart();
