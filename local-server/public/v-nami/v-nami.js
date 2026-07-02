(() => {
  const DATA_URL = "/files/WIKI/custom_kanami_ai_covers.json";
  const PAGE_SIZE = 96;
  const RANDOM_QUEUE_SIZE = 10;
  const feedbackKey = "kanami:vnami:feedback:v1";
  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" });
  const feedbackLabels = {
    great: "很赞",
    normal: "一般",
    question: "疑问"
  };

  const state = {
    items: [],
    byBvid: new Map(),
    filtered: [],
    rendered: 0,
    queue: [],
    currentBvid: "",
    correctionItem: null,
    feedback: readStoredFeedback()
  };

  const elements = {
    audio: document.querySelector("[data-player-audio]"),
    cover: document.querySelector("[data-player-cover]"),
    currentTitle: document.querySelector("[data-current-title]"),
    currentMeta: document.querySelector("[data-current-meta]"),
    currentOpen: document.querySelector("[data-current-open]"),
    search: document.querySelector("[data-search]"),
    filter: document.querySelector("[data-filter]"),
    sort: document.querySelector("[data-sort]"),
    total: document.querySelector("[data-stat-total]"),
    playable: document.querySelector("[data-stat-playable]"),
    shown: document.querySelector("[data-stat-shown]"),
    queueCount: document.querySelector("[data-queue-count]"),
    queueList: document.querySelector("[data-queue-list]"),
    status: document.querySelector("[data-status]"),
    trackList: document.querySelector("[data-track-list]"),
    loadMore: document.querySelector("[data-load-more]"),
    prev: document.querySelector("[data-prev-track]"),
    next: document.querySelector("[data-next-track]"),
    randomQueue: document.querySelector("[data-random-queue]"),
    clearQueue: document.querySelector("[data-clear-queue]"),
    dialog: document.querySelector("[data-correction-dialog]"),
    correctionForm: document.querySelector("[data-correction-form]"),
    correctionTitle: document.querySelector("[data-correction-title]"),
    correctionStatus: document.querySelector("[data-correction-status]")
  };

  function readStoredFeedback() {
    try {
      return JSON.parse(localStorage.getItem(feedbackKey)) || {};
    } catch {
      return {};
    }
  }

  function writeStoredFeedback() {
    try {
      localStorage.setItem(feedbackKey, JSON.stringify(state.feedback));
    } catch {
      // Local feedback memory is optional; the server record is the source of truth.
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function extractBvid(...values) {
    for (const value of values) {
      const match = String(value || "").match(/BV[0-9A-Za-z_-]{3,}/u);
      if (match) return match[0];
    }
    return "";
  }

  function bilibiliUrl(value) {
    const url = String(value || "");
    return /^https:\/\/(?:www\.)?bilibili\.com\/video\//u.test(url) ? url : "";
  }

  function itemTitle(item) {
    return item.originalSongName || item.title || item.videoTitle || item.bvid || "未命名 AI 翻唱";
  }

  function formatDate(item) {
    if (!item.publishedAt && !item.pubdate) return "未知日期";
    const date = item.publishedAt ? new Date(item.publishedAt) : new Date(Number(item.pubdate) * 1000);
    if (Number.isNaN(date.getTime())) return String(item.publishedAt || item.pubdate).slice(0, 10);
    return dateFormatter.format(date);
  }

  function compactTags(tags) {
    return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string" && tag.trim()).slice(0, 4) : [];
  }

  function sourceFromMeta(url, meta) {
    return bilibiliUrl(meta.videoUrl) || bilibiliUrl(meta.sourcePage) || bilibiliUrl(url);
  }

  function toItem([url, meta]) {
    const safeMeta = meta && typeof meta === "object" ? meta : {};
    const videoUrl = sourceFromMeta(url, safeMeta);
    const bvid = String(safeMeta.bvid || extractBvid(videoUrl, url)).trim();
    const audioUrl = safeMeta.resourceAvailable !== false && safeMeta.audioResourceUrl
      ? String(safeMeta.audioResourceUrl)
      : "";
    const item = {
      id: bvid || url,
      url,
      bvid,
      title: String(safeMeta.title || ""),
      videoTitle: String(safeMeta.videoTitle || ""),
      originalSongName: String(safeMeta.originalSongName || ""),
      author: String(safeMeta.author || ""),
      thumbnailUrl: String(safeMeta.thumbnailUrl || ""),
      publishedAt: String(safeMeta.publishedAt || ""),
      pubdate: Number(safeMeta.pubdate || 0),
      tags: Array.isArray(safeMeta.tags) ? safeMeta.tags : [],
      audioUrl,
      videoUrl,
      playable: Boolean(audioUrl),
      meta: safeMeta
    };
    item.searchText = [
      item.bvid,
      item.title,
      item.videoTitle,
      item.originalSongName,
      item.author,
      item.videoUrl,
      ...item.tags
    ].join(" ");
    return item;
  }

  function compareNewest(left, right) {
    const leftTime = left.pubdate || Date.parse(left.publishedAt || "") / 1000 || 0;
    const rightTime = right.pubdate || Date.parse(right.publishedAt || "") / 1000 || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return collator.compare(itemTitle(left), itemTitle(right));
  }

  function sortItems(items) {
    const mode = elements.sort.value;
    return [...items].sort((left, right) => {
      if (mode === "available") {
        if (left.playable !== right.playable) return left.playable ? -1 : 1;
        return compareNewest(left, right);
      }
      if (mode === "song") return collator.compare(itemTitle(left), itemTitle(right));
      if (mode === "author") return collator.compare(left.author || "", right.author || "");
      return compareNewest(left, right);
    });
  }

  function queueItems() {
    return state.queue.map((bvid) => state.byBvid.get(bvid)).filter(Boolean);
  }

  function activePool() {
    const filter = elements.filter.value;
    if (filter === "queue") return queueItems();
    let items = state.items;
    if (filter === "playable") items = items.filter((item) => item.playable);
    if (filter === "video") items = items.filter((item) => item.videoUrl);
    return sortItems(items);
  }

  function applyFilters() {
    const query = normalizeText(elements.search.value);
    state.filtered = activePool().filter((item) => !query || normalizeText(item.searchText).includes(query));
    state.rendered = 0;
    elements.trackList.innerHTML = "";
    updateStats();
    renderMore();
  }

  function updateStats() {
    elements.total.textContent = String(state.items.length);
    elements.playable.textContent = String(state.items.filter((item) => item.playable).length);
    elements.shown.textContent = String(state.filtered.length);
  }

  function updateCurrent(item) {
    if (!item) {
      elements.cover.replaceChildren(createElement("span", "", "香奈美"));
      elements.currentTitle.textContent = "香奈美正在等你点歌";
      elements.currentMeta.textContent = "随机歌单会从本地已下载音频里挑选。";
      elements.currentOpen.hidden = true;
      return;
    }

    elements.cover.innerHTML = "";
    if (item.thumbnailUrl) {
      const image = document.createElement("img");
      image.alt = itemTitle(item);
      image.src = item.thumbnailUrl;
      image.addEventListener("error", () => {
        elements.cover.replaceChildren(createElement("span", "", "香奈美"));
      }, { once: true });
      elements.cover.append(image);
    } else {
      elements.cover.append(createElement("span", "", "香奈美"));
    }
    elements.currentTitle.textContent = itemTitle(item);
    elements.currentMeta.textContent = `${item.author || "未知 UP"} · ${formatDate(item)} · ${item.bvid}`;
    if (item.videoUrl) {
      elements.currentOpen.href = item.videoUrl;
      elements.currentOpen.textContent = item.author ? `B站-${item.author}↗` : "B站↗";
      elements.currentOpen.hidden = false;
    } else {
      elements.currentOpen.hidden = true;
    }
  }

  function updateQueue() {
    const items = queueItems();
    elements.queueCount.textContent = `${items.length} 首`;
    elements.queueList.innerHTML = "";
    if (!items.length) {
      elements.queueList.append(createElement("span", "", "香奈美还没有排歌。"));
      return;
    }
    for (const item of items) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "vnami-queue-pill";
      pill.title = itemTitle(item);
      pill.textContent = itemTitle(item);
      pill.addEventListener("click", () => playItem(item));
      elements.queueList.append(pill);
    }
  }

  function renderMore() {
    const nextItems = state.filtered.slice(state.rendered, state.rendered + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    nextItems.forEach((item) => fragment.append(renderCard(item)));
    elements.trackList.append(fragment);
    state.rendered += nextItems.length;
    elements.loadMore.hidden = state.rendered >= state.filtered.length;

    if (!state.filtered.length) {
      setStatus("香奈美没有找到符合条件的 AI 翻唱。");
      return;
    }
    setStatus("");
  }

  function chip(text) {
    return createElement("span", "vnami-chip", text);
  }

  function renderMedia(item) {
    const media = createElement("div", "vnami-card-media");
    if (!item.thumbnailUrl) {
      media.append(createElement("div", "vnami-card-media-placeholder", "香奈美"));
      return media;
    }
    const image = document.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = itemTitle(item);
    image.src = item.thumbnailUrl;
    image.addEventListener("error", () => {
      media.replaceChildren(createElement("div", "vnami-card-media-placeholder", "香奈美"));
    }, { once: true });
    media.append(image);
    return media;
  }

  function renderCard(item) {
    const card = createElement("article", "vnami-track-card");
    card.dataset.bvid = item.bvid;
    card.dataset.current = String(item.bvid && item.bvid === state.currentBvid);
    const body = createElement("div", "vnami-card-body");
    body.append(createElement("h3", "vnami-card-title", itemTitle(item)));
    body.append(createElement("p", "vnami-card-subtitle", item.videoTitle || item.title || item.bvid));

    const chips = createElement("div", "vnami-chip-row");
    [
      item.playable ? "可收听" : "未下载",
      item.author || "未知 UP",
      formatDate(item),
      item.bvid
    ].filter(Boolean).forEach((value) => chips.append(chip(value)));
    compactTags(item.tags).forEach((tag) => chips.append(chip(tag)));
    body.append(chips);

    if (item.playable) {
      const audio = document.createElement("audio");
      audio.className = "vnami-card-audio";
      audio.controls = true;
      audio.preload = "none";
      audio.src = item.audioUrl;
      body.append(audio);
    } else {
      body.append(createElement("div", "vnami-card-empty", "香奈美还没下载好这首。"));
    }

    const actions = createElement("div", "vnami-card-actions");
    const playButton = createElement("button", "", "播放");
    playButton.type = "button";
    playButton.dataset.playTrack = item.bvid;
    playButton.disabled = !item.playable;
    playButton.addEventListener("click", () => playItem(item));
    actions.append(playButton);

    const queueButton = createElement("button", "", state.queue.includes(item.bvid) ? "移出歌单" : "加入歌单");
    queueButton.type = "button";
    queueButton.disabled = !item.playable;
    queueButton.addEventListener("click", () => toggleQueue(item));
    actions.append(queueButton);

    if (item.videoUrl) {
      const open = createElement("a", "", item.author ? `B站-${item.author}↗` : "B站↗");
      open.href = item.videoUrl;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      actions.append(open);
    }

    const correction = createElement("button", "", "纠错");
    correction.type = "button";
    correction.addEventListener("click", () => openCorrection(item));
    actions.append(correction);
    body.append(actions);

    if (item.playable) {
      const feedback = createElement("div", "vnami-feedback");
      Object.entries(feedbackLabels).forEach(([value, label]) => {
        const button = createElement("button", "", label);
        button.type = "button";
        button.setAttribute("aria-pressed", String(state.feedback[item.bvid] === value));
        button.addEventListener("click", () => sendFeedback(item, value));
        feedback.append(button);
      });
      body.append(feedback);
    }

    card.append(renderMedia(item), body);
    return card;
  }

  async function playItem(item) {
    if (!item?.playable) {
      setStatus("这首还不能在本地收听。");
      return;
    }
    state.currentBvid = item.bvid;
    elements.audio.src = item.audioUrl;
    updateCurrent(item);
    refreshCurrentCards();
    try {
      await elements.audio.play();
      setStatus("");
    } catch {
      setStatus("播放器已经准备好，香奈美等你按下播放。");
    }
  }

  function refreshCurrentCards() {
    document.querySelectorAll(".vnami-track-card").forEach((card) => {
      card.dataset.current = String(card.dataset.bvid === state.currentBvid);
    });
  }

  function toggleQueue(item) {
    if (!item.playable || !item.bvid) return;
    if (state.queue.includes(item.bvid)) {
      state.queue = state.queue.filter((bvid) => bvid !== item.bvid);
    } else {
      state.queue = [...state.queue, item.bvid];
    }
    updateQueue();
    applyFilters();
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[next]] = [copy[next], copy[index]];
    }
    return copy;
  }

  function randomQueue() {
    const filteredPlayable = state.filtered.filter((item) => item.playable);
    const pool = filteredPlayable.length ? filteredPlayable : state.items.filter((item) => item.playable);
    state.queue = shuffle(pool).slice(0, RANDOM_QUEUE_SIZE).map((item) => item.bvid);
    updateQueue();
    const first = state.byBvid.get(state.queue[0]);
    if (first) playItem(first);
    applyFilters();
  }

  function stepTrack(direction) {
    const pool = queueItems().length ? queueItems() : state.filtered.filter((item) => item.playable);
    if (!pool.length) {
      setStatus("香奈美还没有可播放的队列。");
      return;
    }
    const currentIndex = Math.max(0, pool.findIndex((item) => item.bvid === state.currentBvid));
    const nextIndex = (currentIndex + direction + pool.length) % pool.length;
    playItem(pool[nextIndex]);
  }

  async function sendFeedback(item, value) {
    try {
      const response = await fetch("/api/v-nami/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bvid: item.bvid, value, page: location.pathname })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "反馈提交失败");
      state.feedback[item.bvid] = value;
      writeStoredFeedback();
      setStatus("香奈美记下这次音频反馈啦。");
      applyFilters();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "反馈提交失败。");
    }
  }

  function openCorrection(item) {
    state.correctionItem = item;
    elements.correctionTitle.textContent = `纠错：${itemTitle(item)}`;
    elements.correctionStatus.textContent = "";
    elements.correctionForm.reset();
    if (typeof elements.dialog.showModal === "function") {
      elements.dialog.showModal();
    } else {
      elements.dialog.setAttribute("open", "");
    }
  }

  function closeCorrection() {
    elements.dialog.close();
  }

  async function submitCorrection(event) {
    event.preventDefault();
    const item = state.correctionItem;
    if (!item) return;
    const formData = new FormData(elements.correctionForm);
    try {
      const response = await fetch("/api/v-nami/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bvid: item.bvid,
          issueType: formData.get("issueType"),
          message: formData.get("message"),
          suggestion: formData.get("suggestion"),
          page: location.pathname
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "纠错提交失败");
      elements.correctionStatus.textContent = "香奈美收到这条纠错啦。";
      setTimeout(closeCorrection, 550);
    } catch (error) {
      elements.correctionStatus.textContent = error instanceof Error ? error.message : "纠错提交失败。";
    }
  }

  function bindEvents() {
    elements.search.addEventListener("input", applyFilters);
    elements.filter.addEventListener("change", applyFilters);
    elements.sort.addEventListener("change", applyFilters);
    elements.loadMore.addEventListener("click", renderMore);
    elements.prev.addEventListener("click", () => stepTrack(-1));
    elements.next.addEventListener("click", () => stepTrack(1));
    elements.randomQueue.addEventListener("click", randomQueue);
    elements.clearQueue.addEventListener("click", () => {
      state.queue = [];
      updateQueue();
      applyFilters();
    });
    elements.audio.addEventListener("ended", () => stepTrack(1));
    elements.correctionForm.addEventListener("submit", submitCorrection);
    document.querySelector("[data-correction-close]").addEventListener("click", closeCorrection);
    document.querySelector("[data-correction-cancel]").addEventListener("click", closeCorrection);
    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) closeCorrection();
    });
  }

  async function loadItems() {
    setStatus("香奈美正在整理 AI 歌单...");
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload || typeof payload !== "object") {
        throw new Error("AI 歌单数据读取失败");
      }
      state.items = Object.entries(payload)
        .map(toItem)
        .filter((item) => item.bvid || item.videoUrl || item.audioUrl);
      state.byBvid = new Map(state.items.filter((item) => item.bvid).map((item) => [item.bvid, item]));
      updateQueue();
      applyFilters();
    } catch (error) {
      elements.trackList.innerHTML = "";
      setStatus(error instanceof Error ? error.message : "香奈美暂时没读到 AI 歌单。");
    }
  }

  if (!document.querySelector("[data-vnami-app]")) return;
  bindEvents();
  loadItems();
})();
