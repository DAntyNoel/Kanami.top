(() => {
  const defaultAvatar = "/res/images/favicon.png";
  const accountsKey = "kanami.localServer.auth.accounts";
  const sessionKey = "kanami.localServer.auth.session";

  function parseJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  function currentUser() {
    const session = parseJson(sessionKey, null);
    if (!session || !session.email) return null;
    const accounts = parseJson(accountsKey, {});
    return accounts[session.email.toLowerCase()] || null;
  }

  function displayName(user) {
    if (!user) return "";
    return user.nickname || (user.qq ? `QQ ${user.qq}` : user.email);
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

  document.addEventListener("DOMContentLoaded", renderAuthEntry);
  window.KanamiLocalAuthSession = { currentUser, renderAuthEntry };
})();
