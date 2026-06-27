(() => {
  const config = window.KANAMI_LOCAL_SERVER;
  if (!config || !config.enabled) return;

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function card({ href, status, title, copy, action, external = false }) {
    const link = createElement("a", "game-card service-card game-card-live");
    link.href = href;
    if (external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    link.append(
      createElement("span", "game-card-status", status),
      createElement("span", "game-card-title", title),
      createElement("span", "game-card-copy", copy),
      createElement("span", "game-card-action", action)
    );
    return link;
  }

  function navLink(href, text, className = "") {
    const link = createElement("a", `site-nav-link ${className}`.trim(), text);
    link.href = href;
    return link;
  }

  function ensureHeader() {
    const header = document.querySelector(".site-header");
    const nav = header?.querySelector(".site-nav");
    const logo = header?.querySelector(".site-logo");
    const logoText = header?.querySelector(".site-logo-text");
    if (!header || !nav || !logo || !logoText) return;

    header.dataset.siteHeader = "local-server";
    logo.setAttribute("aria-label", "回到香奈美本地舞台");
    logoText.textContent = "本地舞台";

    nav.querySelectorAll("[data-local-runtime-nav]").forEach((item) => item.remove());

    const auth = navLink("/auth/login", "登录");
    auth.dataset.localRuntimeNav = "true";
    auth.dataset.authEntry = "";
    auth.dataset.authLoginUrl = "/auth/login";
    auth.dataset.authProfileUrl = "/auth/profile";
    const avatar = document.createElement("img");
    avatar.src = "/res/images/favicon.png";
    avatar.alt = "";
    avatar.className = "site-user-avatar";
    avatar.hidden = true;
    avatar.dataset.authAvatar = "";
    const label = createElement("span", "site-profile-label", "登录");
    label.dataset.authLabel = "";
    auth.replaceChildren(avatar, label);

    const gallery = navLink("/gallery", "本地图库");
    gallery.dataset.localRuntimeNav = "true";
    const staticSite = navLink("https://kanami.top/", "线上主站", "site-nav-link-primary");
    staticSite.dataset.localRuntimeNav = "true";

    nav.prepend(auth);
    nav.append(gallery, staticSite);

    if (config.showAdminTools) {
      const reload = navLink(`/__reload?next=${encodeURIComponent(location.pathname || "/")}`, "刷新缓存", "site-nav-link-reload");
      reload.dataset.localRuntimeNav = "true";
      nav.append(reload);
    }

    if (window.KanamiLocalAuthSession?.renderAuthEntry) {
      window.KanamiLocalAuthSession.renderAuthEntry();
    }
  }

  function insertLocalPanel() {
    if (document.querySelector("[data-local-server-panel]")) return;

    const services = document.querySelector(".section.services");
    if (!services) return;

    const panel = document.createElement("details");
    panel.className = "backstage-panel local-server-panel";
    panel.dataset.localServerPanel = "true";

    const summary = createElement("summary", "", "展开本地服务入口");
    const grid = createElement("div", "game-grid services-grid");
    grid.setAttribute("aria-label", "香奈美本地服务入口");

    grid.append(
      card({
        href: "/gallery",
        status: "图库",
        title: "本地素材图库",
        copy: "我会把本机图库清单整理成可搜索预览，方便直接挑选素材。",
        action: "打开图库"
      }),
      card({
        href: "/resource/",
        status: "资源",
        title: "本地资源映射",
        copy: "资源舞台会优先读取本地 WIKI 映射，缺图时再回到线上来源。",
        action: "查看资源"
      }),
      card({
        href: "/health",
        status: "状态",
        title: "服务健康状态",
        copy: "公网只展示最小状态，详细路径和映射信息会留在后台。",
        action: "查看状态"
      })
    );

    if (config.showAdminTools) {
      grid.append(card({
        href: "/health/detail",
        status: "后台",
        title: "详细健康检查",
        copy: "这个入口只给本机或带管理口令的维护访问。",
        action: "打开详情"
      }));
    }

    panel.append(summary, grid);

    const publicTools = services.querySelector(".public-tools");
    if (publicTools) {
      services.insertBefore(panel, publicTools);
    } else {
      services.append(panel);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureHeader();
    insertLocalPanel();
  });
})();
