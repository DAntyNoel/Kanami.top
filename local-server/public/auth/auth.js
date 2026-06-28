(() => {
  const defaultAvatar = "/res/images/favicon.png";
  const sessionApi = window.KanamiLocalAuthSession;

  function setImage(image, src) {
    if (!image) return;
    image.src = src || defaultAvatar;
    image.onerror = () => {
      image.src = defaultAvatar;
    };
  }

  function displayName(user) {
    if (!user) return "";
    return user.nickname || user.username || user.email || "香奈美的来宾";
  }

  function message(form, text, type = "info") {
    const box = form?.querySelector("[data-auth-message]");
    if (!box) return;
    box.textContent = text;
    box.dataset.state = type;
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/auth${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || `账号接口 ${response.status}`);
    }
    if (payload.user && sessionApi?.mirrorUser) sessionApi.mirrorUser(payload.user);
    sessionApi?.renderAuthEntry?.();
    return payload;
  }

  function validateQq(qq) {
    return !qq || /^\d{5,12}$/.test(qq);
  }

  function readAvatarFile(input) {
    return new Promise((resolve, reject) => {
      const file = input?.files && input.files[0];
      if (!file) {
        resolve("");
        return;
      }

      if (!file.type.startsWith("image/")) {
        reject(new Error("头像需要选择图片文件哦。"));
        return;
      }

      if (file.size > 800 * 1024) {
        reject(new Error("头像先控制在 800KB 以内吧。"));
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

  async function avatarValue(form, fallback = "") {
    return await readAvatarFile(form.elements.avatarFile) || form.elements.avatarUrl.value.trim() || fallback;
  }

  async function handleLogin(form) {
    try {
      const payload = await api("/login", {
        method: "POST",
        body: JSON.stringify({
          account: form.elements.account.value.trim(),
          password: form.elements.password.value
        })
      });
      message(form, `${displayName(payload.user)}，欢迎回来。`, "success");
      window.location.href = "/auth/profile";
    } catch (error) {
      message(form, error.message, "error");
    }
  }

  async function handleRegister(form) {
    const password = form.elements.password.value;
    const passwordConfirm = form.elements.passwordConfirm.value;
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

    try {
      const avatar = await avatarValue(form);
      const payload = await api("/register", {
        method: "POST",
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          username: form.elements.username.value.trim(),
          password,
          nickname: form.elements.nickname.value.trim(),
          qq,
          avatar
        })
      });
      message(form, `${displayName(payload.user)}，香奈美记住你啦。`, "success");
      window.location.href = "/auth/profile";
    } catch (error) {
      message(form, error.message, "error");
    }
  }

  function fillProfile(form, user) {
    form.elements.account.value = user.username || user.email || "";
    form.elements.email.value = user.email || "";
    form.elements.role.value = user.role === "superadmin" ? "超管" : "普通用户";
    form.elements.nickname.value = user.nickname || "";
    form.elements.qq.value = user.qq || "";
    form.elements.avatarUrl.value = user.avatar && !user.avatar.startsWith("data:") ? user.avatar : "";
    setImage(form.querySelector("[data-auth-preview]"), user.avatar || defaultAvatar);
    setImage(document.querySelector("[data-auth-profile-avatar]"), user.avatar || defaultAvatar);
    renderProfileStats(user);
  }

  function renderProfileStats(user) {
    const points = document.querySelector("[data-auth-points]");
    const checkin = document.querySelector("[data-auth-last-checkin]");
    const scores = document.querySelector("[data-auth-scores]");
    const adminPanel = document.querySelector("[data-auth-admin-panel]");
    if (points) points.textContent = String(user.points || 0);
    if (checkin) checkin.textContent = user.lastCheckinDate || "还没有签到";
    if (scores) {
      const entries = Object.values(user.gameScores || {});
      scores.innerHTML = "";
      if (!entries.length) {
        scores.appendChild(Object.assign(document.createElement("p"), { textContent: "香奈美还没有收到你的小游戏成绩。" }));
      } else {
        entries
          .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
          .forEach((item) => {
            const row = document.createElement("div");
            row.className = "auth-score-row";
            row.innerHTML = `<span>${item.gameTitle || item.gameId}</span><strong>${item.highScore}</strong><small>${item.attempts || 0} 次</small>`;
            scores.appendChild(row);
          });
      }
    }
    if (adminPanel) adminPanel.hidden = user.role !== "superadmin";
  }

  async function refreshProfile(form) {
    const user = await sessionApi?.refreshSession?.();
    if (!user) {
      window.location.href = "/auth/login";
      return null;
    }
    fillProfile(form, user);
    return user;
  }

  async function handleProfile(form) {
    const qq = form.elements.qq.value.trim();
    if (!validateQq(qq)) {
      message(form, "QQ 号需要是 5 到 12 位数字。", "error");
      form.elements.qq.focus();
      return;
    }

    try {
      const current = sessionApi?.currentUser?.();
      const payload = await api("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: form.elements.nickname.value.trim(),
          qq,
          avatar: await avatarValue(form, current?.avatar || "")
        })
      });
      form.elements.avatarFile.value = "";
      fillProfile(form, payload.user);
      message(form, "资料保存好啦。", "success");
    } catch (error) {
      message(form, error.message, "error");
    }
  }

  async function handleCheckin() {
    const form = document.querySelector("[data-auth-form='profile']");
    try {
      const payload = await api("/checkin", { method: "POST", body: "{}" });
      fillProfile(form, payload.user);
      message(form, payload.already ? "今天已经签到过啦，香奈美明天再给你盖章。" : `签到成功，积分 +${payload.pointsAdded}。`, "success");
    } catch (error) {
      message(form, error.message, "error");
    }
  }

  async function loadAdminUsers() {
    const list = document.querySelector("[data-auth-admin-users]");
    if (!list) return;
    try {
      const payload = await api("/users");
      list.innerHTML = "";
      payload.users.forEach((user) => {
        const item = document.createElement("article");
        item.className = "auth-user-row";
        item.innerHTML = `
          <strong>${displayName(user)}</strong>
          <span>${user.username || user.email || user.id}</span>
          <span>${user.role === "superadmin" ? "超管" : "普通用户"} · ${user.points || 0} 分</span>
          <small>签到 ${user.checkins?.length || 0} 次 · 游戏 ${Object.keys(user.gameScores || {}).length} 项</small>
        `;
        list.appendChild(item);
      });
    } catch (error) {
      list.innerHTML = `<p>${error.message}</p>`;
    }
  }

  function wireProfileActions(form) {
    const logout = document.querySelector("[data-auth-logout]");
    if (logout) {
      logout.addEventListener("click", async () => {
        await api("/logout", { method: "POST", body: "{}" }).catch(() => {});
        sessionApi?.mirrorUser?.(null);
        window.location.href = "/auth/login";
      });
    }
    document.querySelector("[data-auth-checkin]")?.addEventListener("click", handleCheckin);
    document.querySelector("[data-auth-admin-refresh]")?.addEventListener("click", loadAdminUsers);
    form.addEventListener("auth-admin-ready", loadAdminUsers);
  }

  async function init() {
    const page = document.body.dataset.authPage;
    const form = document.querySelector("[data-auth-form]");
    sessionApi?.renderAuthEntry?.();
    if (!form) return;

    wireAvatarPreview(form);

    if (page === "profile") {
      wireProfileActions(form);
      const user = await refreshProfile(form);
      if (user?.role === "superadmin") {
        form.dispatchEvent(new CustomEvent("auth-admin-ready"));
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (page === "login") await handleLogin(form);
      if (page === "register") await handleRegister(form);
      if (page === "profile") await handleProfile(form);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
