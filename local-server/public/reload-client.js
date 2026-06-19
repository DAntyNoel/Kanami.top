(() => {
  const endpoint = "/__reload/state";
  const intervalMs = 1200;
  let activeToken = "";
  let intervalId = 0;

  function reloadUrl(nextPath) {
    const target = nextPath || `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const url = new URL("/__reload", window.location.origin);
    url.searchParams.set("next", target);
    return url.href;
  }

  async function readState() {
    const response = await fetch(`${endpoint}?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return null;
    return response.json();
  }

  async function tick() {
    try {
      const state = await readState();
      if (!state || !state.token) return;

      if (!activeToken) {
        activeToken = state.token;
        return;
      }

      if (state.token !== activeToken) {
        window.location.replace(reloadUrl(state.next));
      }
    } catch {
      // Debug helper only: ignore temporary server restarts.
    }
  }

  window.addEventListener("pageshow", () => {
    tick();
    if (!intervalId) {
      intervalId = window.setInterval(tick, intervalMs);
    }
  });
})();
