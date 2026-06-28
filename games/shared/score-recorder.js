(() => {
  async function record({ gameId, gameTitle, score, detail = {} }) {
    if (!gameId || !Number.isFinite(Number(score))) return null;
    try {
      const response = await fetch("/api/auth/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, gameTitle, score: Number(score), detail })
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (payload.user && window.KanamiLocalAuthSession?.mirrorUser) {
        window.KanamiLocalAuthSession.mirrorUser(payload.user);
      }
      return payload;
    } catch {
      return null;
    }
  }

  window.KanamiGameScore = { record };
})();
