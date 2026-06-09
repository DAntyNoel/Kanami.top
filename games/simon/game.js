const padsEl = document.querySelector("#pads");
const roundEl = document.querySelector("#round");
const bestEl = document.querySelector("#best");
const startButton = document.querySelector("#start");
const messageEl = document.querySelector("#message");
const config = window.KANAMI_SIMON_CONFIG;
const tuning = config.tuning;
const padTemplates = config.padTemplates.map((template, index) => normalizePad(template, index));
const keyMap = new Map(padTemplates.map((pad, index) => [pad.key, index]));
const bestKey = tuning.storage.bestKey;

let sequence = [];
let playerIndex = 0;
let acceptingInput = false;
let playToken = 0;
let pads = [];

function normalizePad(template, index) {
  const text = template.text || {};
  const asset = template.asset || {};
  const name = text.name || `舞台灯 ${index + 1}`;

  return {
    id: template.id || `simon-pad-${index}`,
    key: (template.key || "").toLowerCase(),
    tone: template.tone || 440,
    name,
    label: text.label || name,
    color: asset.color || "#ff70a6",
    backgroundImage: asset.backgroundImage
  };
}

function applyTuning() {
  document.documentElement.style.setProperty("--simon-pad-columns", String(tuning.board.columns));
  if (tuning.theme?.pageBackgroundImage) {
    document.documentElement.style.setProperty(
      "--page-background-image",
      `url("${tuning.theme.pageBackgroundImage}")`
    );
  }
  messageEl.textContent = tuning.text.idle;
}

function preloadAssets() {
  padTemplates.forEach((pad) => {
    if (!pad.backgroundImage) return;
    const image = new Image();
    image.src = pad.backgroundImage;
  });
}

function makePads() {
  const buttons = padTemplates.map((pad, index) => {
    const button = document.createElement("button");
    button.className = "pad";
    button.type = "button";
    button.dataset.pad = String(index);
    button.dataset.key = pad.key;
    button.setAttribute("aria-label", pad.name);
    button.style.setProperty("--pad-color", pad.color);
    if (pad.backgroundImage) button.style.setProperty("--pad-image", `url("${pad.backgroundImage}")`);
    button.innerHTML = `<span class="pad-label">${pad.label}</span>`;
    button.addEventListener("click", () => press(index));
    return button;
  });
  padsEl.replaceChildren(...buttons);
  pads = buttons;
}

function bestRound() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateHud() {
  roundEl.textContent = String(sequence.length);
  bestEl.textContent = String(bestRound());
}

function tone(index) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = padTemplates[index].tone;
  oscillator.type = tuning.audio.type;
  gain.gain.setValueAtTime(tuning.audio.gain, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + tuning.audio.durationSeconds);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + tuning.audio.durationSeconds);
}

function flash(index) {
  pads[index].classList.add("is-active");
  tone(index);
  window.setTimeout(() => pads[index].classList.remove("is-active"), tuning.timing.flashMs);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playSequence(token) {
  acceptingInput = false;
  startButton.disabled = true;
  messageEl.textContent = tuning.text.listen;
  await wait(tuning.timing.introDelayMs);
  for (const index of sequence) {
    if (token !== playToken) return;
    flash(index);
    await wait(tuning.timing.sequenceStepMs);
  }
  if (token !== playToken) return;
  playerIndex = 0;
  acceptingInput = true;
  startButton.disabled = false;
  messageEl.textContent = tuning.text.repeat;
}

function nextRound(token = playToken) {
  if (token !== playToken) return;
  sequence.push(Math.floor(Math.random() * pads.length));
  updateHud();
  playSequence(token);
}

function start() {
  playToken += 1;
  sequence = [];
  playerIndex = 0;
  startButton.textContent = "重开";
  startButton.disabled = false;
  messageEl.textContent = tuning.text.start;
  nextRound(playToken);
}

function fail() {
  playToken += 1;
  acceptingInput = false;
  startButton.disabled = false;
  startButton.textContent = "再来";
  const round = Math.max(0, sequence.length - 1);
  if (round > bestRound()) localStorage.setItem(bestKey, String(round));
  updateHud();
  messageEl.textContent = tuning.text.fail(round);
}

function press(index) {
  if (!acceptingInput) return;
  flash(index);
  if (sequence[playerIndex] !== index) {
    fail();
    return;
  }
  playerIndex += 1;
  if (playerIndex === sequence.length) {
    if (sequence.length > bestRound()) localStorage.setItem(bestKey, String(sequence.length));
    updateHud();
    acceptingInput = false;
    messageEl.textContent = tuning.text.success;
    const token = playToken;
    window.setTimeout(() => nextRound(token), tuning.timing.nextRoundDelayMs);
  }
}

document.addEventListener("keydown", (event) => {
  const index = keyMap.get(event.key.toLowerCase());
  if (index !== undefined) press(index);
});
startButton.addEventListener("click", start);
applyTuning();
preloadAssets();
makePads();
updateHud();
