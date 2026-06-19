const images = [
    "res/images/backgrounds/Be-Shinning.png",
    "res/images/backgrounds/Soda.png",
];
  
document.addEventListener("DOMContentLoaded", () => {
    let index = 0;
    const bg = document.querySelector(".background");
    if (!bg) return;
  
    // 初始化背景
    if (!bg.style.backgroundImage) {
      bg.style.backgroundImage = `url(${images[0]})`;
    }
    bg.style.opacity = 1;
  
    function changeBackground() {
      bg.style.opacity = 0; // 淡出当前
      setTimeout(() => {
        index = (index + 1) % images.length;
        bg.style.backgroundImage = `url(${images[index]})`;
        bg.style.opacity = 1; // 淡入新背景
      }, 1000); // 与 CSS transition 的时间保持一致
    }
  
    setInterval(changeBackground, 30000); // 每 30 秒切换一次
  });
  
// 随机表情包展示功能
document.addEventListener("DOMContentLoaded", () => {

    const stampsDir = "res/images/stamps/";
    // 假设你提前把所有表情包文件名放入数组
    // 如果是静态网页，无法自动读取文件夹，需要手动列出
    const allStamps = [
        "001.png",
        "002.jpg",
        "003.jpg",
        "004.png",
        "005.jpg"
    ];
    const grid = document.getElementById("stamps-grid");
    const shuffleBtn = document.getElementById("shuffle-stamps");
    if (!grid || !shuffleBtn) return;
  
    function getRandomStamps() {
      const count = 2 // Math.floor(Math.random() * 3) + 4; // 4~6 张
      const shuffled = allStamps.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    }
  
    function renderStamps() {
      const stamps = getRandomStamps();
      grid.innerHTML = "";
      stamps.forEach(file => {
        const img = document.createElement("img");
        img.src = stampsDir + file;
        img.alt = "KANAMI Stamp";
        grid.appendChild(img);
      });
    }
  
    shuffleBtn.addEventListener("click", renderStamps);
  
    renderStamps(); // 初始加载
  });

document.addEventListener("DOMContentLoaded", () => {
    const storageKey = "kanami.localServer.profile";
    const defaultAvatar = "res/images/favicon.png";
    const panel = document.querySelector("[data-profile-panel]");
    const trigger = document.querySelector("[data-login-trigger]");

    if (!panel || !trigger) return;

    const form = panel.querySelector("[data-profile-form]");
    const closeButtons = panel.querySelectorAll("[data-profile-close]");
    const clearButton = panel.querySelector("[data-profile-clear]");
    const preview = panel.querySelector("[data-profile-preview]");
    const status = panel.querySelector("[data-profile-status]");
    const navAvatar = document.querySelector("[data-profile-avatar]");
    const navLabel = document.querySelector("[data-profile-label]");
    const nicknameInput = form.elements.nickname;
    const qqInput = form.elements.qq;
    const avatarUrlInput = form.elements.avatarUrl;
    const avatarFileInput = form.elements.avatarFile;
    let selectedAvatar = "";

    function loadProfile() {
      try {
        return JSON.parse(localStorage.getItem(storageKey)) || {};
      } catch {
        return {};
      }
    }

    function setImage(image, src) {
      if (!image) return;
      image.src = src || defaultAvatar;
      image.onerror = () => {
        image.src = defaultAvatar;
      };
    }

    function displayName(profile) {
      if (profile.nickname) return profile.nickname;
      if (profile.qq) return `QQ ${profile.qq}`;
      return "";
    }

    function renderProfile() {
      const profile = loadProfile();
      const name = displayName(profile);
      const avatar = profile.avatar || defaultAvatar;

      if (navLabel) {
        navLabel.textContent = name || "登录";
      }

      if (navAvatar) {
        setImage(navAvatar, avatar);
        navAvatar.hidden = !name && !profile.avatar;
      }

      nicknameInput.value = profile.nickname || "";
      qqInput.value = profile.qq || "";
      avatarUrlInput.value = profile.avatar && !profile.avatar.startsWith("data:") ? profile.avatar : "";
      avatarFileInput.value = "";
      selectedAvatar = "";
      setImage(preview, avatar);

      if (status) {
        status.textContent = name
          ? `香奈美记得你啦：${name}${profile.qq ? ` / QQ ${profile.qq}` : ""}`
          : "香奈美会把你的资料保存在这台设备上。";
      }
    }

    function openPanel() {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      renderProfile();
      setTimeout(() => nicknameInput.focus(), 0);
    }

    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }

    trigger.addEventListener("click", openPanel);
    closeButtons.forEach((button) => button.addEventListener("click", closePanel));
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePanel();
      }
    });

    avatarFileInput.addEventListener("change", () => {
      const file = avatarFileInput.files && avatarFileInput.files[0];
      if (!file) {
        selectedAvatar = "";
        return;
      }

      if (!file.type.startsWith("image/")) {
        avatarFileInput.value = "";
        if (status) status.textContent = "头像需要选择图片文件哦。";
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        selectedAvatar = String(reader.result || "");
        avatarUrlInput.value = "";
        setImage(preview, selectedAvatar);
      });
      reader.readAsDataURL(file);
    });

    avatarUrlInput.addEventListener("input", () => {
      if (avatarUrlInput.value.trim()) {
        selectedAvatar = "";
        avatarFileInput.value = "";
        setImage(preview, avatarUrlInput.value.trim());
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const nickname = nicknameInput.value.trim() || "香奈美的来宾";
      const qq = qqInput.value.trim();
      const avatar = selectedAvatar || avatarUrlInput.value.trim();

      if (qq && !/^\d{5,12}$/.test(qq)) {
        if (status) status.textContent = "QQ 号需要是 5 到 12 位数字。";
        qqInput.focus();
        return;
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify({
          nickname,
          qq,
          avatar,
          updatedAt: new Date().toISOString()
        }));
      } catch {
        if (status) status.textContent = "头像太大啦，换一个小一点的图片或头像地址吧。";
        return;
      }

      renderProfile();
      if (status) status.textContent = "登录资料保存好啦，香奈美记住你了。";
    });

    clearButton.addEventListener("click", () => {
      localStorage.removeItem(storageKey);
      renderProfile();
      if (status) status.textContent = "已经退出登录，资料也从这台设备清掉啦。";
    });

    renderProfile();
  });
