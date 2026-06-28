(() => {
  const defaultAvatar = "/res/images/favicon.png";
  const accountsKey = "kanami.localServer.auth.accounts";
  const sessionKey = "kanami.localServer.auth.session";
  let cachedUser = null;

  function parseJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  function accountKey(user) {
    return (user?.email || user?.username || user?.id || "").toLowerCase();
  }

  function mirrorUser(user) {
    cachedUser = user || null;
    if (!user) {
      localStorage.removeItem(sessionKey);
      return;
    }
    const key = accountKey(user);
    const accounts = parseJson(accountsKey, {});
    accounts[key] = user;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    localStorage.setItem(sessionKey, JSON.stringify({ email: key, signedInAt: new Date().toISOString() }));
  }

  function fallbackUser() {
    const session = parseJson(sessionKey, null);
    if (!session || !session.email) return null;
    const accounts = parseJson(accountsKey, {});
    return accounts[String(session.email).toLowerCase()] || null;
  }

  function currentUser() {
    return cachedUser || fallbackUser();
  }

  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) return currentUser();
      const payload = await response.json();
      mirrorUser(payload.user || null);
      renderAuthEntry();
      return currentUser();
    } catch {
      return currentUser();
    }
  }

  function displayName(user) {
    if (!user) return "";
    return user.nickname || user.username || (user.qq ? `QQ ${user.qq}` : user.email);
  }

  function setImage(image, src) {
    if (!image) return;
    image.src = src || defaultAvatar;
    image.onerror = () => {
      image.src = defaultAvatar;
    };
  }

  function renderAuthEntry() {
    const user = currentUser();
    document.querySelectorAll("[data-auth-entry]").forEach((entry) => {
      const label = entry.querySelector("[data-auth-label]");
      const avatar = entry.querySelector("[data-auth-avatar]");
      const loginUrl = entry.dataset.authLoginUrl || "/auth/login";
      const profileUrl = entry.dataset.authProfileUrl || "/auth/profile";

      entry.href = user ? profileUrl : loginUrl;
      if (label) label.textContent = user ? displayName(user) : "登录";
      if (avatar) {
        setImage(avatar, user && user.avatar);
        avatar.hidden = !user;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAuthEntry();
    refreshSession();
  });

  window.KanamiLocalAuthSession = { currentUser, refreshSession, renderAuthEntry, mirrorUser };
})();
