(() => {
  const HEADER_SELECTOR = ".site-header, .game-header, .kanami-chat-site-header";
  const MENU_CLASS = "kanami-header-menu";
  const PANEL_CLASS = "kanami-header-menu-panel";

  function directChildren(element, selector) {
    return Array.from(element.children).filter((child) => !selector || child.matches(selector));
  }

  function wrapGameHeaderSide(header) {
    if (!header.matches(".game-header") || header.querySelector(":scope > .game-header-side")) return;

    const stats = header.querySelector(":scope > .game-header-stats");
    const actions = header.querySelector(":scope > .game-header-actions");
    if (!stats && !actions) return;

    const side = document.createElement("div");
    side.className = "game-header-side";
    header.appendChild(side);
    if (stats) side.appendChild(stats);
    if (actions) side.appendChild(actions);
  }

  function collectMenuItems(nav) {
    const menu = nav.querySelector(`:scope > .${MENU_CLASS}`);
    const panel = menu?.querySelector(`.${PANEL_CLASS}`);
    const panelItems = panel ? Array.from(panel.children) : [];
    const looseItems = Array.from(nav.children).filter((child) => child !== menu);
    if (menu) menu.remove();
    return [...panelItems, ...looseItems];
  }

  function createMenu(items) {
    const details = document.createElement("details");
    details.className = MENU_CLASS;

    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "展开页眉快捷入口");
    summary.title = "快捷入口";
    summary.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));

    const panel = document.createElement("div");
    panel.className = PANEL_CLASS;
    items.forEach((item) => panel.appendChild(item));
    details.append(summary, panel);
    return details;
  }

  function syncMenu(nav) {
    if (nav.dataset.headerMenuSyncing === "true") return;
    nav.dataset.headerMenuSyncing = "true";

    const menu = nav.querySelector(`:scope > .${MENU_CLASS}`);
    const panel = menu?.querySelector(`.${PANEL_CLASS}`);
    const looseItems = Array.from(nav.children).filter((child) => child !== menu);
    if (menu && panel) {
      looseItems.forEach((item) => panel.appendChild(item));
      const panelItems = Array.from(panel.children);
      nav.dataset.collapsedMenu = panelItems.length > 3 ? "true" : "false";
      if (panelItems.length <= 3) {
        panelItems.forEach((item) => nav.insertBefore(item, menu));
        menu.remove();
      }
      nav.dataset.headerMenuSyncing = "false";
      return;
    }

    if (looseItems.length <= 3) {
      nav.dataset.collapsedMenu = "false";
      nav.dataset.headerMenuSyncing = "false";
      return;
    }

    const items = collectMenuItems(nav);
    nav.dataset.collapsedMenu = items.length > 3 ? "true" : "false";
    if (items.length > 3) {
      nav.appendChild(createMenu(items));
    } else {
      items.forEach((item) => nav.appendChild(item));
    }

    nav.dataset.headerMenuSyncing = "false";
  }

  function enableTicker(copy) {
    if (copy.dataset.headerTickerReady === "true") return;
    copy.dataset.headerTickerReady = "true";

    copy.addEventListener("wheel", (event) => {
      const canScroll = copy.scrollWidth > copy.clientWidth + 1;
      if (!canScroll || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      copy.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
  }

  function syncTicker(copy) {
    enableTicker(copy);
    const available = copy.clientWidth;
    const lines = directChildren(copy, "h1, p, strong, span").filter((line) => !line.matches(".game-kicker"));

    lines.forEach((line) => {
      line.dataset.headerOverflowLine = "false";
      line.style.removeProperty("--kanami-marquee-distance");
      const overflow = Math.ceil(line.scrollWidth - available);
      if (overflow > 4) {
        line.dataset.headerOverflowLine = "true";
        line.style.setProperty("--kanami-marquee-distance", `-${overflow}px`);
      }
    });
  }

  function enhanceHeader(header) {
    wrapGameHeaderSide(header);

    const nav = header.querySelector(":scope > .site-nav")
      || header.querySelector(":scope > .kanami-header-actions")
      || header.querySelector(":scope > .game-header-actions")
      || header.querySelector(":scope > .game-header-side > .game-header-actions");
    if (nav) {
      syncMenu(nav);
      if (!nav.dataset.headerMenuObserved) {
        nav.dataset.headerMenuObserved = "true";
        const observer = new MutationObserver(() => syncMenu(nav));
        observer.observe(nav, { childList: true });
      }
    }

    const copy = header.querySelector(":scope > .site-header-copy, :scope > .game-header-copy, :scope > .kanami-header-copy");
    if (copy) syncTicker(copy);
  }

  function enhanceAllHeaders() {
    document.querySelectorAll(HEADER_SELECTOR).forEach(enhanceHeader);
  }

  document.addEventListener("DOMContentLoaded", () => {
    enhanceAllHeaders();
    window.addEventListener("resize", enhanceAllHeaders);
    document.addEventListener("click", (event) => {
      document.querySelectorAll(`.${MENU_CLASS}[open]`).forEach((menu) => {
        if (!menu.contains(event.target)) menu.removeAttribute("open");
      });
    });
  });
})();
