const backgrounds = [
  "/res/images/backgrounds/Be-Shinning.png",
  "/res/images/backgrounds/Soda.png"
];

const stamps = ["001.png", "002.jpg", "003.jpg", "004.png", "005.jpg"];

function rotateBackground() {
  const bg = document.querySelector(".background");
  if (!bg) return;

  let index = 0;
  bg.style.backgroundImage = `url(${backgrounds[index]})`;
  bg.style.opacity = "1";

  window.setInterval(() => {
    bg.style.opacity = "0";
    window.setTimeout(() => {
      index = (index + 1) % backgrounds.length;
      bg.style.backgroundImage = `url(${backgrounds[index]})`;
      bg.style.opacity = "1";
    }, 900);
  }, 30000);
}

function renderStamps() {
  const grid = document.querySelector("[data-stamps-grid]");
  const button = document.querySelector("[data-shuffle-stamps]");
  if (!grid || !button) return;

  const draw = () => {
    const picked = [...stamps].sort(() => 0.5 - Math.random()).slice(0, 2);
    grid.replaceChildren(
      ...picked.map((file) => {
        const image = document.createElement("img");
        image.src = `/res/images/stamps/${file}`;
        image.alt = "KANAMI Stamp";
        return image;
      })
    );
  };

  button.addEventListener("click", draw);
  draw();
}

function text(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function setConnectionState(kind, label) {
  const panel = document.querySelector("[data-connection-panel]");
  const badge = document.querySelector("[data-connection-badge]");
  if (panel) panel.dataset.state = kind;
  if (badge) badge.textContent = label;
}

async function refreshHealth() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) throw new Error(`Health returned ${response.status}`);
    const health = await response.json();

    text("[data-remote-url]", health.tunnel.remoteUrl);
    text("[data-local-target]", health.tunnel.target);
    text("[data-file-route]", health.files.route);
    text("[data-file-root]", health.files.root);
    text("[data-checked-at]", new Date(health.time).toLocaleString());

    setConnectionState(
      health.tunnel.connected ? "connected" : "ready",
      health.tunnel.connected ? "已连接到远程" : "等待远程连接"
    );
  } catch {
    setConnectionState("warning", "健康检查未确认");
    text("[data-checked-at]", "刚刚检查失败");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  rotateBackground();
  renderStamps();
  refreshHealth();
});
