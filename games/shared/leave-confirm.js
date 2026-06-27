(function () {
  const ROUTE_PATTERN = /\/games\//;
  const STATE_KEY = "__kanamiGameLeaveGuard";
  const STATE_BASE = "base";
  const STATE_GUARD = "guard";
  const CONFIRM_TEXT = "香奈美还在小游戏舞台上等你哦，真的要离开吗？";
  const UNLOAD_TEXT = "离开小游戏前请再确认一次。";

  if (!ROUTE_PATTERN.test(window.location.pathname)) return;

  let allowUnload = false;
  let restoringGuard = false;

  function askToLeave() {
    return window.confirm(CONFIRM_TEXT);
  }

  function allowNextUnload() {
    allowUnload = true;
    window.setTimeout(() => {
      allowUnload = false;
    }, 1500);
  }

  function isInertHref(rawHref) {
    if (!rawHref) return true;

    const normalized = rawHref.trim().toLowerCase();
    return (
      normalized === "#" ||
      normalized.startsWith("#") ||
      normalized === "about:blank" ||
      normalized.startsWith("javascript:") ||
      normalized.startsWith("mailto:") ||
      normalized.startsWith("tel:")
    );
  }

  function isSameDocumentHash(anchor) {
    return (
      anchor.origin === window.location.origin &&
      anchor.pathname === window.location.pathname &&
      anchor.search === window.location.search &&
      anchor.hash &&
      anchor.hash !== window.location.hash
    );
  }

  function shouldConfirmAnchor(anchor) {
    if (!anchor || anchor.hasAttribute("download")) return false;
    if (isInertHref(anchor.getAttribute("href"))) return false;
    if (isSameDocumentHash(anchor)) return false;

    return true;
  }

  function hasInlineNavigationHandler(element) {
    const handlerSource = element?.getAttribute("onclick") || "";
    return /(?:window\.)?(?:location(?:\.(?:href|assign|replace|reload))?|open|history\.(?:back|go))/.test(handlerSource);
  }

  function opensNewTab(anchor) {
    return (anchor?.getAttribute("target") || "").toLowerCase() === "_blank";
  }

  function confirmClickNavigation(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const anchor = target.closest("a[href]");
    const inlineNavigation = target.closest("[onclick]");
    const needsConfirmation = shouldConfirmAnchor(anchor) || hasInlineNavigationHandler(inlineNavigation);

    if (!needsConfirmation) return;
    if (askToLeave()) {
      if (!anchor || !opensNewTab(anchor) || hasInlineNavigationHandler(inlineNavigation)) {
        allowNextUnload();
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function beforeUnload(event) {
    if (allowUnload) return undefined;

    event.preventDefault();
    event.returnValue = UNLOAD_TEXT;
    return UNLOAD_TEXT;
  }

  function currentState() {
    return history.state && typeof history.state === "object" ? history.state : {};
  }

  function installBackGuard() {
    if (!history.pushState || !history.replaceState) return;

    try {
      const state = currentState();
      if (state[STATE_KEY] === STATE_GUARD) return;

      history.replaceState({ ...state, [STATE_KEY]: STATE_BASE }, "", window.location.href);
      history.pushState({ [STATE_KEY]: STATE_GUARD }, "", window.location.href);
    } catch (error) {
      // Some embedded browsers can reject history state updates; click and unload guards still work.
    }
  }

  function handlePopState(event) {
    if (restoringGuard) return;
    if (event.state && event.state[STATE_KEY] === STATE_GUARD) return;

    if (askToLeave()) {
      allowNextUnload();
      window.setTimeout(() => nativeBack(), 0);
      return;
    }

    restoringGuard = true;
    history.pushState({ [STATE_KEY]: STATE_GUARD }, "", window.location.href);
    window.setTimeout(() => {
      restoringGuard = false;
    }, 0);
  }

  const nativeBack = history.back.bind(history);
  const nativeGo = history.go.bind(history);
  const nativeOpen = window.open.bind(window);

  history.back = function () {
    if (!askToLeave()) return;
    allowNextUnload();
    nativeBack();
  };

  history.go = function (delta) {
    if (Number(delta) < 0 && !askToLeave()) return;
    if (Number(delta) < 0) allowNextUnload();
    nativeGo(delta);
  };

  window.open = function (url, target, features) {
    if (url && !isInertHref(String(url)) && !askToLeave()) return null;
    if ((target || "").toLowerCase() !== "_blank") allowNextUnload();
    return nativeOpen(url, target, features);
  };

  document.addEventListener("click", confirmClickNavigation, true);
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("popstate", handlePopState);
  installBackGuard();
})();
