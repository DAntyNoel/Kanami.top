(() => {
  const root = document.getElementById("root");
  const status = document.getElementById("piano-status");
  const retry = document.getElementById("piano-retry");
  if (!root || !status || !retry) return;

  const observer = new MutationObserver(() => {
    const pads = root.querySelectorAll("button[data-piano-pad]");
    if (pads.length === 16 && [...pads].every((pad) => !pad.disabled)) {
      status.textContent = "音色准备好啦，点亮音垫，我来陪你弹奏。";
      observer.disconnect();
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });

  window.addEventListener("piano-audio-error", () => {
    status.textContent = "音色还没准备好，让我再试一次吧。";
    retry.hidden = false;
  });
  retry.addEventListener("click", () => window.location.reload());
})();
