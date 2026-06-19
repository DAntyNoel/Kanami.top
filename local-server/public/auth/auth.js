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

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function accounts() {
    return parseJson(accountsKey, {});
  }

  function saveAccounts(value) {
    saveJson(accountsKey, value);
  }

  function session() {
    return parseJson(sessionKey, null);
  }

  function setSession(email) {
    saveJson(sessionKey, {
      email: email.toLowerCase(),
      signedInAt: new Date().toISOString()
    });
  }

  function signedInUser() {
    const current = session();
    if (!current || !current.email) return null;
    return accounts()[current.email.toLowerCase()] || null;
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

  async function passwordDigest(password) {
    const data = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function normalizeEmail(value) {
    return value.trim().toLowerCase();
  }

  function validateQq(qq) {
    return !qq || /^\d{5,12}$/.test(qq);
  }

  function message(form, text, type = "info") {
    const box = form.querySelector("[data-auth-message]");
    if (!box) return;
    box.textContent = text;
    box.dataset.state = type;
  }

  function readAvatarFile(input) {
    return new Promise((resolve, reject) => {
      const file = input.files && input.files[0];
      if (!file) {
        resolve("");
        return;
      }

      if (!file.type.startsWith("image/")) {
        reject(new Error("头像需要选择图片文件哦。"));
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(new Error("头像读取失败了。")));
      reader.readAsDataURL(file);
    });
  }

  function wireAvatarPreview(form) {
    const preview = form.querySelector("[data-auth-preview]");
    const previewLabel = form.querySelector("[data-auth-preview-label]");
    const avatarUrl = form.elements.avatarUrl;
    const avatarFile = form.elements.avatarFile;

    if (!preview || !avatarUrl || !avatarFile) return;

    avatarUrl.addEventListener("input", () => {
      const value = avatarUrl.value.trim();
      if (!value) {
        setImage(preview, defaultAvatar);
        return;
      }
      avatarFile.value = "";
      setImage(preview, value);
      if (previewLabel) previewLabel.textContent = "香奈美会使用这个头像地址。";
    });

    avatarFile.addEventListener("change", async () => {
      try {
        const avatar = await readAvatarFile(avatarFile);
        if (avatar) {
          avatarUrl.value = "";
          setImage(preview, avatar);
          if (previewLabel) previewLabel.textContent = "香奈美已经预览上传头像啦。";
        }
      } catch (error) {
        avatarFile.value = "";
        if (previewLabel) previewLabel.textContent = error.message;
      }
    });
  }

  function renderHeader() {
    if (window.KanamiLocalAuthSession) {
      window.KanamiLocalAuthSession.renderAuthEntry();
      return;
    }

    const user = signedInUser();
    document.querySelectorAll("[data-auth-entry]").forEach((entry) => {
      const label = entry.querySelector("[data-auth-label]");
      const avatar = entry.querySelector("[data-auth-avatar]");
      entry.href = user ? "/auth/profile" : "/auth/login";
      if (label) label.textContent = user ? displayName(user) : "登录";
      if (avatar) {
        setImage(avatar, user && user.avatar);
        avatar.hidden = !user;
      }
    });
  }

  async function handleLogin(form) {
    const email = normalizeEmail(form.elements.email.value);
    const password = form.elements.password.value;
    const user = accounts()[email];

    if (!user || user.passwordHash !== await passwordDigest(password)) {
      message(form, "账号或密码不对哦。", "error");
      return;
    }

    setSession(email);
    message(form, "登录成功，香奈美带你回资料页。", "success");
    renderHeader();
    window.location.href = "/auth/profile";
  }

  async function handleRegister(form) {
    const email = normalizeEmail(form.elements.email.value);
    const password = form.elements.password.value;
    const passwordConfirm = form.elements.passwordConfirm.value;
    const nickname = form.elements.nickname.value.trim() || "香奈美的来宾";
    const qq = form.elements.qq.value.trim();

    if (password !== passwordConfirm) {
      message(form, "两次输入的密码不一样哦。", "error");
      return;
    }

    if (!validateQq(qq)) {
      message(form, "QQ 号需要是 5 到 12 位数字。", "error");
      form.elements.qq.focus();
      return;
    }

    const saved = accounts();
    if (saved[email]) {
      message(form, "这个账号已经注册过啦。", "error");
      return;
    }

    let avatar = form.elements.avatarUrl.value.trim();
    try {
      avatar = await readAvatarFile(form.elements.avatarFile) || avatar;
    } catch (error) {
      message(form, error.message, "error");
      return;
    }

    saved[email] = {
      email,
      passwordHash: await passwordDigest(password),
      nickname,
      qq,
      avatar,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      saveAccounts(saved);
      setSession(email);
    } catch {
      message(form, "资料太大啦，换一个小一点的头像或头像地址吧。", "error");
      return;
    }

    message(form, "注册成功，香奈美记住你啦。", "success");
    renderHeader();
    window.location.href = "/auth/profile";
  }

  function fillProfile(form, user) {
    form.elements.email.value = user.email;
    form.elements.nickname.value = user.nickname || "";
    form.elements.qq.value = user.qq || "";
    form.elements.avatarUrl.value = user.avatar && !user.avatar.startsWith("data:") ? user.avatar : "";
    setImage(form.querySelector("[data-auth-preview]"), user.avatar || defaultAvatar);
    setImage(document.querySelector("[data-auth-profile-avatar]"), user.avatar || defaultAvatar);
  }

  async function handleProfile(form, user) {
    const email = user.email.toLowerCase();
    const saved = accounts();
    const qq = form.elements.qq.value.trim();

    if (!validateQq(qq)) {
      message(form, "QQ 号需要是 5 到 12 位数字。", "error");
      form.elements.qq.focus();
      return;
    }

    let avatar = form.elements.avatarUrl.value.trim();
    try {
      avatar = await readAvatarFile(form.elements.avatarFile) || avatar || user.avatar || "";
    } catch (error) {
      message(form, error.message, "error");
      return;
    }

    saved[email] = {
      ...user,
      nickname: form.elements.nickname.value.trim() || "香奈美的来宾",
      qq,
      avatar,
      updatedAt: new Date().toISOString()
    };

    try {
      saveAccounts(saved);
    } catch {
      message(form, "资料太大啦，换一个小一点的头像或头像地址吧。", "error");
      return;
    }

    form.elements.avatarFile.value = "";
    fillProfile(form, saved[email]);
    renderHeader();
    message(form, "资料保存好啦。", "success");
  }

  function init() {
    const page = document.body.dataset.authPage;
    const form = document.querySelector("[data-auth-form]");
    renderHeader();
    if (!form) return;

    wireAvatarPreview(form);

    if (page === "profile") {
      const user = signedInUser();
      if (!user) {
        window.location.href = "/auth/login";
        return;
      }

      fillProfile(form, user);
      const logout = document.querySelector("[data-auth-logout]");
      if (logout) {
        logout.addEventListener("click", () => {
          localStorage.removeItem(sessionKey);
          renderHeader();
          window.location.href = "/auth/login";
        });
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (page === "login") await handleLogin(form);
      if (page === "register") await handleRegister(form);
      if (page === "profile") await handleProfile(form, signedInUser());
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
