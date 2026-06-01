const stage = document.querySelector("#stage");
const scoreEl = document.querySelector("#score");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");
const startButton = document.querySelector("#start");
const messageEl = document.querySelector("#message");
const bestKey = "kanami-catch-best";

let score = 0;
let timeLeft = 30;
let activeIndex = -1;
let decoyIndex = -1;
let running = false;
let spawnTimer = 0;
let countdownTimer = 0;

function makeBoard() {
  const holes = Array.from({ length: 9 }, (_, index) => {
    const button = document.createElement("button");
    button.className = "hole";
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `舞台灯 ${index + 1}`);
    button.addEventListener("click", () => hit(index));
    return button;
  });
  stage.replaceChildren(...holes);
}

function bestScore() {
  return Number(localStorage.getItem(bestKey) || "0");
}

function updateHud() {
  scoreEl.textContent = String(score);
  timeEl.textContent = String(timeLeft);
  bestEl.textContent = String(bestScore());
}

function beep(frequency, duration) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.05, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function clearLights() {
  document.querySelectorAll(".hole").forEach((hole) => {
    hole.classList.remove("is-target", "is-decoy");
  });
}

function spawn() {
  if (!running) return;
  const holes = [...document.querySelectorAll(".hole")];
  clearLights();
  activeIndex = Math.floor(Math.random() * holes.length);
  decoyIndex = Math.random() > 0.58 ? Math.floor(Math.random() * holes.length) : -1;
  if (decoyIndex === activeIndex) decoyIndex = (decoyIndex + 1) % holes.length;
  holes[activeIndex].classList.add("is-target");
  if (decoyIndex >= 0) holes[decoyIndex].classList.add("is-decoy");
  const speed = Math.max(430, 980 - (30 - timeLeft) * 18);
  spawnTimer = window.setTimeout(spawn, speed);
}

function hit(index) {
  if (!running) return;
  if (index === activeIndex) {
    score += 1;
    messageEl.textContent = "抓到啦！香奈美把这一秒收进舞台相册。";
    beep(720, 0.07);
    clearLights();
    activeIndex = -1;
    updateHud();
    return;
  }
  if (index === decoyIndex) {
    score = Math.max(0, score - 2);
    messageEl.textContent = "那是干扰光啦，香奈美提醒你冷静一点。";
    beep(180, 0.12);
    clearLights();
    updateHud();
  }
}

function finish() {
  running = false;
  window.clearTimeout(spawnTimer);
  window.clearInterval(countdownTimer);
  clearLights();
  if (score > bestScore()) localStorage.setItem(bestKey, String(score));
  updateHud();
  startButton.textContent = "再来";
  messageEl.textContent = `时间到！这次抓到 ${score} 次，香奈美已经记下你的应援速度。`;
}

function start() {
  window.clearTimeout(spawnTimer);
  window.clearInterval(countdownTimer);
  score = 0;
  timeLeft = 30;
  running = true;
  startButton.textContent = "进行中";
  messageEl.textContent = "灯光开始流动了，盯紧香奈美出现的位置。";
  updateHud();
  spawn();
  countdownTimer = window.setInterval(() => {
    timeLeft -= 1;
    updateHud();
    if (timeLeft <= 0) finish();
  }, 1000);
}

startButton.addEventListener("click", start);
makeBoard();
updateHud();
