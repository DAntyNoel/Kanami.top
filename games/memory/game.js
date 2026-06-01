const assets = [
  "../../res/images/stamps/001.png",
  "../../res/images/stamps/002.jpg",
  "../../res/images/stamps/003.jpg",
  "../../res/images/stamps/004.png",
  "../../res/images/stamps/005.jpg",
  "../../res/images/backgrounds/Soda.png",
  "../../res/images/backgrounds/Be-Shinning.png",
  "../../res/images/lovekanami.jpg"
];

const board = document.querySelector("#board");
const movesEl = document.querySelector("#moves");
const timerEl = document.querySelector("#timer");
const bestEl = document.querySelector("#best");
const messageEl = document.querySelector("#message");
const restartButton = document.querySelector("#restart");
const bestKey = "kanami-memory-best";

let deck = [];
let firstCard = null;
let secondCard = null;
let locked = false;
let moves = 0;
let matches = 0;
let startedAt = 0;
let timerId = 0;

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function updateBest() {
  const best = JSON.parse(localStorage.getItem(bestKey) || "null");
  bestEl.textContent = best ? `${best.moves}步 ${formatTime(best.time)}` : "--";
}

function tick() {
  if (!startedAt) {
    timerEl.textContent = "00:00";
    return;
  }
  timerEl.textContent = formatTime(Math.floor((Date.now() - startedAt) / 1000));
}

function startTimer() {
  if (startedAt) return;
  startedAt = Date.now();
  timerId = window.setInterval(tick, 500);
}

function makeCard(card, index) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.dataset.id = card.id;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", "翻开一张香奈美卡片");
  button.innerHTML = `
    <span class="card-inner">
      <span class="face front">K</span>
      <span class="face back"><img src="${card.src}" alt="香奈美卡片图案"></span>
    </span>
  `;
  button.addEventListener("click", () => flipCard(button));
  return button;
}

function flipCard(cardEl) {
  if (locked || cardEl === firstCard || cardEl.classList.contains("is-matched")) return;
  startTimer();
  cardEl.classList.add("is-flipped");

  if (!firstCard) {
    firstCard = cardEl;
    messageEl.textContent = "第一张记住了吗？香奈美等你翻第二张。";
    return;
  }

  secondCard = cardEl;
  locked = true;
  moves += 1;
  movesEl.textContent = String(moves);

  if (firstCard.dataset.id === secondCard.dataset.id) {
    firstCard.classList.add("is-matched");
    secondCard.classList.add("is-matched");
    matches += 1;
    messageEl.textContent = "配对成功，香奈美的应援力增加了。";
    resetTurn();
    if (matches === assets.length) finishGame();
    return;
  }

  messageEl.textContent = "没关系，香奈美刚刚也偷偷记住位置了。";
  window.setTimeout(() => {
    firstCard.classList.remove("is-flipped");
    secondCard.classList.remove("is-flipped");
    resetTurn();
  }, 760);
}

function resetTurn() {
  [firstCard, secondCard] = [null, null];
  locked = false;
}

function finishGame() {
  window.clearInterval(timerId);
  const time = Math.floor((Date.now() - startedAt) / 1000);
  const best = JSON.parse(localStorage.getItem(bestKey) || "null");
  if (!best || moves < best.moves || (moves === best.moves && time < best.time)) {
    localStorage.setItem(bestKey, JSON.stringify({ moves, time }));
    updateBest();
    messageEl.textContent = `全部配对成功！${moves} 步 ${formatTime(time)}，这是新的最佳记录。`;
  } else {
    messageEl.textContent = `全部配对成功！${moves} 步 ${formatTime(time)}，香奈美已经把掌声送到啦。`;
  }
}

function restart() {
  window.clearInterval(timerId);
  deck = shuffle(assets.flatMap((src, id) => [{ src, id }, { src, id }]));
  firstCard = null;
  secondCard = null;
  locked = false;
  moves = 0;
  matches = 0;
  startedAt = 0;
  timerId = 0;
  movesEl.textContent = "0";
  timerEl.textContent = "00:00";
  messageEl.textContent = "香奈美已经洗好牌啦，第一张由你来翻。";
  board.replaceChildren(...deck.map(makeCard));
  updateBest();
}

restartButton.addEventListener("click", restart);
restart();
