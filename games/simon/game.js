const pads = [...document.querySelectorAll(".pad")];
const roundEl = document.querySelector("#round");
const bestEl = document.querySelector("#best");
const startButton = document.querySelector("#start");
const messageEl = document.querySelector("#message");
const bestKey = "kanami-simon-best";
const tones = [392, 523, 659, 784];
const keys = ["q", "w", "a", "s"];

let sequence = [];
let playerIndex = 0;
let acceptingInput = false;

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
  oscillator.frequency.value = tones[index];
  oscillator.type = "triangle";
  gain.gain.setValueAtTime(0.06, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.22);
}

function flash(index) {
  pads[index].classList.add("is-active");
  tone(index);
  window.setTimeout(() => pads[index].classList.remove("is-active"), 260);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playSequence() {
  acceptingInput = false;
  messageEl.textContent = "香奈美正在亮灯，先认真听完这一小节。";
  await wait(420);
  for (const index of sequence) {
    flash(index);
    await wait(470);
  }
  playerIndex = 0;
  acceptingInput = true;
  messageEl.textContent = "轮到你啦，照着刚才的顺序点亮舞台。";
}

function nextRound() {
  sequence.push(Math.floor(Math.random() * pads.length));
  updateHud();
  playSequence();
}

function start() {
  sequence = [];
  playerIndex = 0;
  startButton.textContent = "重开";
  messageEl.textContent = "第一小节要来啦。";
  nextRound();
}

function fail() {
  acceptingInput = false;
  const round = Math.max(0, sequence.length - 1);
  if (round > bestRound()) localStorage.setItem(bestKey, String(round));
  updateHud();
  messageEl.textContent = `这一拍乱掉了，不过已经完成 ${round} 回合。香奈美等你再开场。`;
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
    messageEl.textContent = "完美跟上！香奈美再加一盏灯。";
    window.setTimeout(nextRound, 760);
  }
}

pads.forEach((pad, index) => pad.addEventListener("click", () => press(index)));
document.addEventListener("keydown", (event) => {
  const index = keys.indexOf(event.key.toLowerCase());
  if (index >= 0) press(index);
});
startButton.addEventListener("click", start);
updateHud();
