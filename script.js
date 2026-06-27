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
  const fallbackStamps = [
    { src: `${stampsDir}001.png`, title: "香奈美表情 001" },
    { src: `${stampsDir}002.jpg`, title: "香奈美表情 002" },
    { src: `${stampsDir}003.jpg`, title: "香奈美表情 003" },
    { src: `${stampsDir}004.png`, title: "香奈美表情 004" },
    { src: `${stampsDir}005.jpg`, title: "香奈美表情 005" }
  ];
  const grid = document.getElementById("stamps-grid");
  const shuffleBtn = document.getElementById("shuffle-stamps");
  if (!grid || !shuffleBtn) return;

  let allStamps = fallbackStamps;

  function randomStamps() {
    const count = Math.min(allStamps.length, Math.max(6, Math.floor(Math.random() * 7) + 6));
    return [...allStamps]
      .sort(() => 0.5 - Math.random())
      .slice(0, count);
  }

  function renderStamps() {
    const fragment = document.createDocumentFragment();
    for (const stamp of randomStamps()) {
      const img = document.createElement("img");
      img.src = stamp.src;
      img.alt = stamp.title || "香奈美表情";
      img.loading = "lazy";
      fragment.appendChild(img);
    }
    grid.replaceChildren(fragment);
  }

  async function loadWikiStamps() {
    const response = await fetch("res/WIKI/emotes.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`emotes.json ${response.status}`);
    const data = await response.json();
    const stamps = Object.entries(data)
      .map(([url, meta]) => ({
        src: meta.thumbnailUrl || url,
        title: meta.title || "香奈美 WIKI 表情"
      }))
      .filter((stamp) => stamp.src);
    if (stamps.length) {
      allStamps = stamps;
    }
  }

  shuffleBtn.addEventListener("click", renderStamps);
  renderStamps();
  loadWikiStamps().then(renderStamps).catch(() => {});
});

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.getElementById("wiki-resource-tabs");
  const panel = document.getElementById("wiki-resource-panel");
  const search = document.getElementById("wiki-resource-search");
  const stats = document.getElementById("wiki-resource-stats");
  if (!tabs || !panel || !search || !stats) return;

  const wikiBase = window.KANAMI_WIKI_BASE || "res/WIKI/";
  const mediaGroups = [
    { id: "emotes", label: "表情包", file: "emotes.json" },
    { id: "wallpapers", label: "壁纸", file: "story_wallpapers.json" },
    { id: "outfits", label: "时装建模", file: "outfits.json" },
    { id: "audio", label: "语音音乐", file: "audio.json" },
    { id: "character", label: "角色设定", file: "character.json" },
    { id: "weapons", label: "武器", file: "weapons.json" },
    { id: "skills", label: "技能", file: "skills.json" },
    { id: "imprints", label: "印迹", file: "imprints.json" },
    { id: "network", label: "增幅网络", file: "amplification_network.json" },
    { id: "updates", label: "更新图", file: "update_history.json" }
  ];
  const textGroup = { id: "oath", label: "誓约文本", file: "oath_texts.json" };
  const groups = [...mediaGroups, textGroup];
  const state = {
    active: "emotes",
    query: "",
    data: {},
    flat: {}
  };

  function normalizeText(value) {
    return String(value ?? "").toLowerCase();
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function chip(text) {
    return createEl("span", "wiki-resource-chip", text);
  }

  function fileNameFromUrl(url) {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
    } catch {
      return url;
    }
  }

  function localWikiAssetUrl(url) {
    try {
      const localBase = window.KANAMI_WIKI_LOCAL_ASSET_BASE;
      if (!localBase) return null;
      const parsed = new URL(url);
      if (parsed.hostname !== "patchwiki.biligame.com") return null;
      const marker = "/images/klbq/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) return null;
      return `${localBase.replace(/\/$/, "")}${parsed.pathname.slice(markerIndex)}`;
    } catch {
      return null;
    }
  }

  function useLocalWikiAssets() {
    return window.KANAMI_WIKI_USE_LOCAL_ASSETS === true && Boolean(window.KANAMI_WIKI_LOCAL_ASSET_BASE);
  }

  function uniqueUrls(urls) {
    return urls.filter(Boolean).filter((url, index, list) => list.indexOf(url) === index);
  }

  function mediaSourceCandidates(url, previewUrl) {
    const remoteUrls = uniqueUrls([previewUrl, url]);
    const localUrls = uniqueUrls(remoteUrls.map(localWikiAssetUrl));
    return useLocalWikiAssets() ? uniqueUrls([...localUrls, ...remoteUrls]) : uniqueUrls(remoteUrls);
  }

  function applyFallbackSource(el, urls) {
    const candidates = uniqueUrls(urls);
    let index = 0;
    if (!candidates.length) return;
    el.src = candidates[index];
    el.addEventListener("error", () => {
      index += 1;
      if (index < candidates.length) {
        el.src = candidates[index];
      }
    });
  }

  function mediaDimensions(meta) {
    const width = Number(meta.width);
    const height = Number(meta.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  }

  function mediaLayoutClass(item, dimensions) {
    if (item.meta.mediaType !== "image" || !dimensions) return "";
    const ratio = dimensions.width / dimensions.height;
    const title = item.title || "";
    const isWallpaper = item.group === "wallpapers" || item.meta.type === "story_wallpaper";
    const isLargeWide = dimensions.width >= 900 && ratio >= 1.35;
    const isNamedLargeWide = /^(\d+px-|壁纸-)/.test(title) && ratio >= 1.35;

    if ((isWallpaper && ratio >= 1.25) || isLargeWide || isNamedLargeWide) {
      return "wiki-resource-item-featured";
    }
    if (ratio <= 0.68) return "wiki-resource-item-portrait";
    if (ratio >= 1.35) return "wiki-resource-item-landscape";
    return "";
  }

  function flattenMedia(id, data) {
    return Object.entries(data).map(([url, meta]) => ({
      id: url,
      url,
      group: id,
      title: meta.title || fileNameFromUrl(url),
      meta,
      searchText: [
        meta.title,
        meta.type,
        meta.section,
        meta.subsection,
        meta.language,
        meta.text,
        meta.voiceType,
        meta.voiceTag,
        url
      ].filter(Boolean).join(" ")
    }));
  }

  function flattenOath(data) {
    const items = [];
    for (const entry of data.kachiuCommunications || []) {
      items.push({
        id: entry.id,
        kind: "communication",
        title: entry.title,
        type: entry.type,
        sourcePage: entry.sourcePage,
        messages: entry.messages || [],
        searchText: [entry.title, entry.type, ...(entry.messages || []).map((m) => m.text)].join(" ")
      });
    }
    for (const entry of data.characterStories || []) {
      const lines = (entry.scenes || []).flatMap((scene) => scene.lines || []);
      items.push({
        id: entry.sourcePage,
        kind: "story",
        title: entry.title,
        type: entry.type,
        sourcePage: entry.sourcePage,
        unlockCondition: entry.unlockCondition,
        scenes: entry.scenes || [],
        searchText: [entry.title, entry.wikiTitle, entry.unlockCondition, ...lines].join(" ")
      });
    }
    for (const entry of data.characterBiographies || []) {
      items.push({
        id: `bio-${entry.title}`,
        kind: "biography",
        title: entry.title,
        type: entry.type,
        sourcePage: entry.sourcePage,
        unlockCondition: entry.unlockCondition,
        paragraphs: entry.paragraphs || [],
        searchText: [entry.title, entry.unlockCondition, ...(entry.paragraphs || [])].join(" ")
      });
    }
    for (const entry of data.returnLetters || []) {
      items.push({
        id: `letter-${entry.title}`,
        kind: "returnLetter",
        title: entry.title,
        type: entry.type,
        sourcePage: entry.sourcePage,
        triggerCondition: entry.triggerCondition,
        paragraphs: entry.paragraphs || [],
        searchText: [entry.title, entry.triggerCondition, ...(entry.paragraphs || [])].join(" ")
      });
    }
    return items;
  }

  function matches(item) {
    if (!state.query) return true;
    return normalizeText(item.searchText).includes(state.query);
  }

  function activeItems() {
    return (state.flat[state.active] || []).filter(matches);
  }

  function renderStats() {
    const mediaTotal = mediaGroups.reduce((sum, group) => sum + (state.flat[group.id]?.length || 0), 0);
    const oathTotal = state.flat.oath?.length || 0;
    stats.innerHTML = "";
    stats.append(
      chip(`媒体 ${mediaTotal}`),
      chip(`誓约文本 ${oathTotal}`),
      chip(`分类 ${groups.length}`)
    );
  }

  function renderTabs() {
    tabs.innerHTML = "";
    for (const group of groups) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wiki-resource-tab";
      button.id = `wiki-tab-${group.id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(group.id === state.active));
      button.textContent = `${group.label} ${state.flat[group.id]?.length || 0}`;
      button.addEventListener("click", () => {
        state.active = group.id;
        render();
      });
      tabs.appendChild(button);
    }
  }

  function renderMediaCard(item) {
    const { url, meta, title } = item;
    const card = createEl("article", "wiki-resource-item");
    const dimensions = mediaDimensions(meta);
    const layoutClass = mediaLayoutClass(item, dimensions);
    if (layoutClass) card.classList.add(layoutClass);
    if (dimensions && meta.mediaType === "image") {
      card.style.setProperty("--wiki-media-ratio", `${dimensions.width} / ${dimensions.height}`);
    }
    const thumb = createEl("div", "wiki-resource-thumb");
    if (meta.mediaType === "image") {
      const img = document.createElement("img");
      img.alt = title;
      img.loading = "lazy";
      applyFallbackSource(img, mediaSourceCandidates(url, meta.thumbnailUrl));
      thumb.appendChild(img);
    } else if (meta.mediaType === "audio") {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      applyFallbackSource(audio, mediaSourceCandidates(url));
      thumb.appendChild(audio);
    } else {
      thumb.appendChild(createEl("span", "wiki-resource-file", meta.extension || "FILE"));
    }

    const body = createEl("div", "wiki-resource-body");
    body.appendChild(createEl("div", "wiki-resource-title", title));
    const metaLine = createEl("div", "wiki-resource-meta");
    [
      meta.subsection,
      meta.section,
      meta.language,
      meta.voiceType,
      meta.voiceTag,
      meta.extension?.toUpperCase()
    ].filter(Boolean).slice(0, 4).forEach((value) => metaLine.appendChild(chip(value)));
    body.appendChild(metaLine);
    if (meta.text) {
      body.appendChild(createEl("p", "wiki-resource-text", meta.text));
    }
    const open = createEl("a", "wiki-resource-open", "打开资源");
    open.href = url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    body.appendChild(open);
    card.append(thumb, body);
    return card;
  }

  function renderDialogue(container, messages, limit = 80) {
    const wrap = createEl("div", "wiki-dialogue");
    for (const message of messages.slice(0, limit)) {
      const line = createEl("div", "wiki-dialogue-line");
      line.dataset.role = message.role || "";
      line.appendChild(createEl("span", "wiki-dialogue-role", `${message.role || "旁白"} · ${message.kind === "option" ? "选项" : "台词"}`));
      line.appendChild(createEl("span", "wiki-dialogue-text", message.text));
      wrap.appendChild(line);
    }
    if (messages.length > limit) {
      wrap.appendChild(createEl("p", "wiki-resource-text", `还有 ${messages.length - limit} 条台词，香奈美已经收进 JSON 里啦。`));
    }
    container.appendChild(wrap);
  }

  function renderTextItem(item) {
    const detail = createEl("details", "wiki-text-item");
    const summary = document.createElement("summary");
    summary.textContent = item.title;
    detail.appendChild(summary);
    const meta = createEl("div", "wiki-text-meta");
    [item.type, item.unlockCondition, item.triggerCondition].filter(Boolean).forEach((value) => meta.appendChild(chip(value)));
    detail.appendChild(meta);

    if (item.kind === "communication") {
      renderDialogue(detail, item.messages);
    } else if (item.kind === "story") {
      for (const scene of item.scenes) {
        const block = createEl("div", "wiki-story-lines");
        block.appendChild(chip(`Scene ${scene.index}`));
        for (const line of (scene.lines || []).slice(0, 120)) {
          block.appendChild(createEl("p", "wiki-story-line", line));
        }
        detail.appendChild(block);
      }
    } else {
      const block = createEl("div", "wiki-story-lines");
      for (const paragraph of item.paragraphs || []) {
        block.appendChild(createEl("p", "wiki-story-line", paragraph));
      }
      detail.appendChild(block);
    }

    if (item.sourcePage) {
      const open = createEl("a", "wiki-resource-open", "打开来源");
      open.href = item.sourcePage;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      detail.appendChild(open);
    }
    return detail;
  }

  function renderPanel() {
    const items = activeItems();
    panel.innerHTML = "";
    if (!items.length) {
      panel.appendChild(createEl("p", "wiki-resource-empty", "香奈美没有找到匹配的资源。"));
      return;
    }
    if (state.active === "oath") {
      const list = createEl("div", "wiki-text-list");
      items.forEach((item) => list.appendChild(renderTextItem(item)));
      panel.appendChild(list);
      return;
    }
    const grid = createEl("div", "wiki-resource-grid");
    const limit = 72;
    items.slice(0, limit).forEach((item) => grid.appendChild(renderMediaCard(item)));
    panel.appendChild(grid);
    if (items.length > limit) {
      panel.appendChild(createEl("p", "wiki-resource-empty", `香奈美先放出 ${limit} 个，继续搜索可以更快找到想要的资源。`));
    }
  }

  function render() {
    renderStats();
    renderTabs();
    renderPanel();
  }

  function loadBundledResources() {
    const bundled = window.KANAMI_WIKI_DATA;
    if (!bundled) return false;
    const missing = groups.some((group) => !bundled[group.id]);
    if (missing) return false;
    state.data = Object.fromEntries(groups.map((group) => [group.id, bundled[group.id]]));
    for (const group of mediaGroups) {
      state.flat[group.id] = flattenMedia(group.id, state.data[group.id] || {});
    }
    state.flat.oath = flattenOath(state.data.oath || {});
    return true;
  }

  async function loadResources() {
    if (loadBundledResources()) return;
    const responses = await Promise.all(groups.map(async (group) => {
      const response = await fetch(wikiBase + group.file);
      if (!response.ok) throw new Error(`${group.file} ${response.status}`);
      return [group.id, await response.json()];
    }));
    state.data = Object.fromEntries(responses);
    for (const group of mediaGroups) {
      state.flat[group.id] = flattenMedia(group.id, state.data[group.id] || {});
    }
    state.flat.oath = flattenOath(state.data.oath || {});
  }

  search.addEventListener("input", () => {
    state.query = normalizeText(search.value.trim());
    renderPanel();
  });

  loadResources()
    .then(render)
    .catch((error) => {
      console.error("Failed to load WIKI resources", error);
      panel.innerHTML = "";
      panel.appendChild(createEl("p", "wiki-resource-empty", "香奈美暂时没能打开资源映射。"));
      stats.innerHTML = "";
      stats.appendChild(chip("加载失败"));
    });
});
