const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#composer");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const clearButton = document.querySelector("#clear-chat");
const statusEl = document.querySelector("#status");

const storageKey = "kanami-chat-history";
let history = loadHistory();
let busy = false;

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(storageKey, JSON.stringify(history.slice(-24)));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function addMessage(role, content, extraClass = "") {
  const item = document.createElement("div");
  item.className = `message ${role} ${extraClass}`.trim();
  item.textContent = content;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return item;
}

function renderHistory() {
  messagesEl.innerHTML = "";
  if (!history.length) {
    addMessage("assistant", "引航者来啦。香奈美刚刚还在想，今天第一句话会是什么呢~");
    return;
  }

  for (const message of history) {
    addMessage(message.role, message.content);
  }
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const payload = await response.json();
    const providerLabel = payload.provider === "local-cliproxy" ? "本地代理" : "BASE URL";
    setStatus(`${providerLabel}已待命 · ${payload.model}`);
  } catch {
    setStatus("后台暂时离线");
  }
}

function parseSseChunk(buffer, onEvent) {
  const events = buffer.split("\n\n");
  const rest = events.pop() || "";

  for (const rawEvent of events) {
    const lines = rawEvent.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    onEvent(event, JSON.parse(data));
  }

  return rest;
}

async function sendMessage(content) {
  if (busy) return;
  busy = true;
  sendButton.disabled = true;
  setStatus("香奈美正在听");

  history.push({ role: "user", content });
  saveHistory();
  addMessage("user", content);

  const assistantMessage = addMessage("assistant", "");
  let assistantContent = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        stream: true,
        messages: history
      })
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "香奈美暂时没能接通。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, (event, payload) => {
        if (event === "token") {
          assistantContent += payload.delta;
          assistantMessage.textContent = assistantContent;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        if (event === "error") {
          throw new Error(payload.message || "香奈美暂时没能接通。");
        }
      });
    }

    if (!assistantContent.trim()) {
      throw new Error("香奈美刚才没有发出声音，再试一次好吗？");
    }

    history.push({ role: "assistant", content: assistantContent });
    saveHistory();
    setStatus("后台已连接");
  } catch (error) {
    assistantMessage.classList.add("error");
    assistantMessage.textContent = error.message || "香奈美这边断线了，稍后再试一次吧。";
    if (history.at(-1)?.role === "user") {
      history.pop();
    }
    saveHistory();
    setStatus("后台暂时离线");
  } finally {
    busy = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  resizeInput();
  sendMessage(content);
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

clearButton.addEventListener("click", () => {
  history = [];
  saveHistory();
  renderHistory();
  input.focus();
});

renderHistory();
resizeInput();
checkHealth();
