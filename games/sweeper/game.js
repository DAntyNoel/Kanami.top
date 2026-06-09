const boardEl = document.querySelector("#board");
const flagsEl = document.querySelector("#flags");
const timerEl = document.querySelector("#timer");
const bestEl = document.querySelector("#best");
const modeButton = document.querySelector("#mode");
const restartButton = document.querySelector("#restart");
const messageEl = document.querySelector("#message");
const config = window.KANAMI_SWEEPER_CONFIG;
const tuning = config.tuning;
const rows = tuning.board.rows;
const columns = tuning.board.columns;
const mineCount = tuning.board.mineCount;
const bestKey = tuning.storage.bestKey;

let board = [];
let activeMineCount = mineCount;
let openCount = 0;
let flags = 0;
let flagMode = false;
let gameOver = false;
let minesReady = false;
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
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < columns) {
        cells.push([nextRow, nextCol]);
      }
    }
  }
  return cells;
}

function applyTuning() {
  document.documentElement.style.setProperty("--sweeper-board-columns", String(columns));
  if (tuning.theme?.pageBackgroundImage) {
    document.documentElement.style.setProperty(
      "--page-background-image",
      `url("${tuning.theme.pageBackgroundImage}")`
    );
  }
  Object.entries(config.tileTemplates || {}).forEach(([key, template]) => {
    if (template.asset?.background) {
      document.documentElement.style.setProperty(`--sweeper-${key}-bg`, template.asset.background);
    }
  });
}

function makeBoard() {
  board = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => ({
    row,
    col,
    mine: false,
    open: false,
    flagged: false,
    count: 0
  })));
}

function placeMines(safeRow, safeCol) {
  const safeArea = tuning.board.firstClickSafeNeighbors
    ? [[safeRow, safeCol], ...neighbors(safeRow, safeCol)]
    : [[safeRow, safeCol]];
  const safeCells = new Set(safeArea.map(([row, col]) => `${row}:${col}`));
  activeMineCount = Math.min(mineCount, rows * columns - safeCells.size);
  let placed = 0;
  while (placed < activeMineCount) {
    const row = Math.floor(Math.random() * rows);
    const col = Math.floor(Math.random() * columns);
    if (!board[row][col].mine && !safeCells.has(`${row}:${col}`)) {
      board[row][col].mine = true;
      placed += 1;
    }
  }

  board.flat().forEach((cell) => {
    cell.count = neighbors(cell.row, cell.col).filter(([row, col]) => board[row][col].mine).length;
  });
  minesReady = true;
}

function elapsedSeconds() {
  return startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
}

function formatSeconds(seconds) {
  if (!seconds) return "--";
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return minutes ? `${minutes}:${rest}` : `${rest}s`;
}

function bestTime() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateBest(time) {
  const currentBest = bestTime();
  if (time && (!currentBest || time < currentBest)) {
    localStorage.setItem(bestKey, String(time));
  }
  bestEl.textContent = formatSeconds(bestTime());
}

function updateHud() {
  flagsEl.textContent = String(activeMineCount - flags);
  bestEl.textContent = formatSeconds(bestTime());
  modeButton.textContent = flagMode ? "旗帜" : "翻开";
  modeButton.setAttribute("aria-pressed", String(flagMode));
}

function startTimer() {
  if (startedAt) return;
  startedAt = Date.now();
  timerId = window.setInterval(() => {
    timerEl.textContent = String(Math.floor((Date.now() - startedAt) / 1000));
  }, tuning.timing.timerTickMs);
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
        button.textContent = tuning.symbols.mine;
      } else {
        button.textContent = cell.count ? String(cell.count) : "";
      }
    } else if (cell.flagged) {
      button.classList.add("is-flagged");
      button.textContent = tuning.symbols.flag;
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
      }, tuning.timing.longPressMs);
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
    const time = elapsedSeconds();
    updateBest(time);
    messageEl.textContent = tuning.text.win(formatSeconds(time));
  } else {
    revealAll();
    messageEl.textContent = tuning.text.lose;
  }
  render();
}

function checkWin() {
  if (openCount === rows * columns - activeMineCount) finish(true);
}

function toggleFlag(row, col) {
  if (gameOver) return;
  if (!minesReady) {
    messageEl.textContent = tuning.text.firstSafe;
    return;
  }
  startTimer();
  const cell = board[row][col];
  if (cell.open) return;
  if (!cell.flagged && flags >= activeMineCount) return;
  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
  messageEl.textContent = cell.flagged ? tuning.text.flagOn : tuning.text.flagOff;
  render();
}

function handleCell(row, col) {
  if (gameOver) return;
  if (flagMode) {
    toggleFlag(row, col);
    return;
  }
  if (!minesReady) {
    placeMines(row, col);
  }
  startTimer();
  const cell = board[row][col];
  if (cell.flagged || cell.open) return;
  if (cell.mine) {
    finish(false);
    return;
  }
  reveal(row, col);
  messageEl.textContent = cell.count ? tuning.text.risky : tuning.text.safe;
  render();
  checkWin();
}

function restart() {
  window.clearInterval(timerId);
  openCount = 0;
  flags = 0;
  flagMode = false;
  gameOver = false;
  minesReady = false;
  activeMineCount = mineCount;
  startedAt = 0;
  timerEl.textContent = "0";
  messageEl.textContent = tuning.text.ready;
  makeBoard();
  render();
  updateBest();
}

modeButton.addEventListener("click", () => {
  flagMode = !flagMode;
  updateHud();
});
restartButton.addEventListener("click", restart);
applyTuning();
restart();
