const board = document.querySelector("#board");
const movesEl = document.querySelector("#moves");
const timerEl = document.querySelector("#timer");
const bestEl = document.querySelector("#best");
const messageEl = document.querySelector("#message");
const restartButton = document.querySelector("#restart");
const config = window.KANAMI_MEMORY_CONFIG;
const tuning = config.tuning;
const cards = config.cardTemplates.map((template, index) => normalizeCard(template, index));
const bestKey = tuning.storage.bestKey;

let deck = [];
let firstCard = null;
let secondCard = null;
let locked = false;
let moves = 0;
let matches = 0;
let startedAt = 0;
let timerId = 0;

function normalizeCard(template, index) {
  const text = template.text || {};
  const asset = template.asset || {};
  const name = text.name || `香奈美卡片 ${index + 1}`;

  return {
    id: template.id || `memory-card-${index}`,
    name,
    alt: text.alt || `${tuning.card.altPrefix}：${name}`,
    image: asset.image
  };
}

function applyTuning() {
  document.documentElement.style.setProperty("--memory-board-columns", String(tuning.board.columns));
  document.documentElement.style.setProperty(
    "--memory-mobile-board-columns",
    String(tuning.board.mobileColumns || tuning.board.columns)
  );
  if (tuning.theme?.pageBackgroundImage) {
    document.documentElement.style.setProperty(
      "--page-background-image",
      `url("${tuning.theme.pageBackgroundImage}")`
    );
  }
}

function preloadAssets() {
  cards.forEach((card) => {
    const image = new Image();
    image.src = card.image;
  });
}

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
  timerId = window.setInterval(tick, tuning.timing.timerTickMs);
}

function makeCard(card, index) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.dataset.id = card.id;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", `翻开${card.name}`);
  button.innerHTML = `
    <span class="card-inner">
      <span class="face front">${tuning.card.frontText}</span>
      <span class="face back"><img src="${card.image}" alt="${card.alt}"></span>
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
    messageEl.textContent = tuning.text.firstPick;
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
    messageEl.textContent = tuning.text.matched;
    resetTurn();
    if (matches === cards.length) finishGame();
    return;
  }

  messageEl.textContent = tuning.text.mismatched;
  window.setTimeout(() => {
    firstCard.classList.remove("is-flipped");
    secondCard.classList.remove("is-flipped");
    resetTurn();
  }, tuning.timing.mismatchHideDelayMs);
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
    messageEl.textContent = tuning.text.newBest(moves, formatTime(time));
  } else {
    messageEl.textContent = tuning.text.finished(moves, formatTime(time));
  }
}

function restart() {
  window.clearInterval(timerId);
  deck = shuffle(cards.flatMap((card) => [{ ...card }, { ...card }]));
  firstCard = null;
  secondCard = null;
  locked = false;
  moves = 0;
  matches = 0;
  startedAt = 0;
  timerId = 0;
  movesEl.textContent = "0";
  timerEl.textContent = "00:00";
  messageEl.textContent = tuning.text.ready;
  board.replaceChildren(...deck.map(makeCard));
  updateBest();
}

restartButton.addEventListener("click", restart);
applyTuning();
preloadAssets();
restart();
