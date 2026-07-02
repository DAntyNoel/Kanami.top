(() => {
  const DATA_URL = "/files/WIKI/custom_kanami_ai_covers.json";
  const PAGE_SIZE = 96;
  const RANDOM_QUEUE_SIZE = 10;
  const feedbackKey = "kanami:vnami:feedback:v1";
  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" });
  const ratingOptions = [
    { stars: 3, value: "great", label: "赞" },
    { stars: 2, value: "normal", label: "还行" },
    { stars: 1, value: "question", label: "疑问" },
    { stars: 0, value: "problem", label: "有问题" }
  ];

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
    playlistCover: document.querySelector("[data-playlist-cover]"),
    playlistCoverArt: document.querySelector("[data-playlist-cover-art]"),
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
    randomQueueButtons: Array.from(document.querySelectorAll("[data-random-queue]")),
    playAll: document.querySelector("[data-play-all]"),
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

  function randomSongName() {
    const candidates = state.items
      .map((item) => itemTitle(item))
      .filter((title) => title && title !== "未命名 AI 翻唱");
    if (!candidates.length) return "";
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function updateSearchPlaceholder() {
    const title = randomSongName();
    if (title) elements.search.placeholder = title;
  }

  function ratingLabel(stars, label) {
    const mark = stars ? `${"★".repeat(stars)} ` : "";
    return `${mark}${stars}星 ${label}`;
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
    if (elements.playable) {
      elements.playable.textContent = String(state.items.filter((item) => item.playable).length);
    }
    elements.shown.textContent = String(state.filtered.length);
  }

  function renderCover(container, item, fallback = "香奈美") {
    if (!container) return;
    container.innerHTML = "";
    if (item?.thumbnailUrl) {
      const image = document.createElement("img");
      image.alt = itemTitle(item);
      image.src = item.thumbnailUrl;
      image.addEventListener("error", () => {
        container.replaceChildren(createElement("span", "", fallback));
      }, { once: true });
      container.append(image);
      return;
    }
    container.append(createElement("span", "", fallback));
  }

  function updatePlaylistCover() {
    const item = state.items.find((entry) => entry.playable && entry.thumbnailUrl)
      || state.items.find((entry) => entry.thumbnailUrl)
      || null;
    renderCover(elements.playlistCoverArt || elements.playlistCover, item);
    if (elements.playable) {
      elements.playable.textContent = String(state.items.filter((entry) => entry.playable).length);
    }
  }

  function updateCurrent(item) {
    if (!item) {
      renderCover(elements.cover, null);
      elements.currentTitle.textContent = "香奈美正在等你点歌";
      elements.currentMeta.textContent = "随机歌单会从本地已下载音频里挑选。";
      elements.currentOpen.hidden = true;
      return;
    }

    renderCover(elements.cover, item);
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
    nextItems.forEach((item, offset) => fragment.append(renderRow(item, state.rendered + offset)));
    elements.trackList.append(fragment);
    state.rendered += nextItems.length;
    elements.loadMore.hidden = state.rendered >= state.filtered.length;

    if (!state.filtered.length) {
      setStatus("香奈美没有找到符合条件的 AI 翻唱。");
      return;
    }
    setStatus("");
  }

  function renderRowCover(item) {
    const cover = createElement("div", "vnami-row-cover");
    if (!item.thumbnailUrl) {
      cover.append(createElement("span", "", "香奈美"));
      return cover;
    }
    const image = document.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = itemTitle(item);
    image.src = item.thumbnailUrl;
    image.addEventListener("error", () => {
      cover.replaceChildren(createElement("span", "", "香奈美"));
    }, { once: true });
    cover.append(image);
    return cover;
  }

  function renderTitleCell(item) {
    const cell = createElement("div", "vnami-title-cell");
    const copy = createElement("div", "vnami-title-copy");
    copy.append(createElement("div", "vnami-title-main", itemTitle(item)));
    const tags = compactTags(item.tags).slice(0, 2);
    const subtitle = [
      item.playable ? "本地音频" : "未下载",
      item.author || "未知 UP",
      ...tags
    ].join(" · ");
    copy.append(createElement("div", "vnami-title-sub", subtitle));
    cell.append(renderRowCover(item), copy);
    return cell;
  }

  function renderFeedbackMenu(item) {
    const cell = createElement("div", "vnami-feedback-cell");
    const menu = createElement("details", "vnami-feedback-menu");
    const summary = createElement("summary", "", "反馈");
    const panel = createElement("div", "vnami-feedback-panel");
    panel.append(createElement("p", "", "香奈美想知道这首怎么样"));

    const ratings = createElement("div", "vnami-rating-list");
    ratingOptions.forEach(({ stars, value, label }) => {
      const button = createElement("button", "vnami-rating-button", ratingLabel(stars, label));
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.feedback[item.bvid] === value));
      button.addEventListener("click", () => {
        menu.open = false;
        sendFeedback(item, value);
      });
      ratings.append(button);
    });

    const correction = createElement("button", "vnami-feedback-correction", "信息纠错");
    correction.type = "button";
    correction.addEventListener("click", () => {
      menu.open = false;
      openCorrection(item);
    });
    panel.append(ratings, correction);
    menu.append(summary, panel);
    cell.append(menu);
    return cell;
  }

  function renderRow(item, index) {
    const row = createElement("article", "vnami-track-row");
    row.dataset.bvid = item.bvid;
    row.dataset.current = String(item.bvid && item.bvid === state.currentBvid);
    row.append(createElement("span", "vnami-row-index", String(index + 1).padStart(2, "0")));
    row.append(renderTitleCell(item));

    const source = createElement("div", "vnami-source-cell");
    source.append(createElement("div", "vnami-source-main", item.videoTitle || item.title || "B站 AI 翻唱"));
    source.append(createElement("div", "vnami-source-sub", `${formatDate(item)} · ${item.bvid}`));
    row.append(source);
    row.append(renderFeedbackMenu(item));

    const actions = createElement("div", "vnami-status-cell");
    const playButton = createElement("button", "vnami-row-action", "▶");
    playButton.type = "button";
    playButton.dataset.playTrack = item.bvid;
    playButton.title = item.playable ? "播放" : "尚未下载";
    playButton.setAttribute("aria-label", item.playable ? "播放" : "尚未下载");
    playButton.disabled = !item.playable;
    playButton.addEventListener("click", () => playItem(item));
    actions.append(playButton);

    const queueButton = createElement("button", "vnami-row-action", state.queue.includes(item.bvid) ? "−" : "+");
    queueButton.type = "button";
    queueButton.title = state.queue.includes(item.bvid) ? "移出队列" : "加入队列";
    queueButton.setAttribute("aria-label", state.queue.includes(item.bvid) ? "移出队列" : "加入队列");
    queueButton.disabled = !item.playable;
    queueButton.addEventListener("click", () => toggleQueue(item));
    actions.append(queueButton);

    if (item.videoUrl) {
      const open = createElement("a", "vnami-row-action", "↗");
      open.href = item.videoUrl;
      open.title = item.author ? `B站-${item.author}` : "B站";
      open.setAttribute("aria-label", open.title);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      actions.append(open);
    }

    actions.append(createElement("span", "vnami-row-badge", item.playable ? "可听" : "待下"));

    row.append(actions);
    return row;
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
    document.querySelectorAll(".vnami-track-row").forEach((row) => {
      row.dataset.current = String(row.dataset.bvid === state.currentBvid);
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

  function playAll() {
    const firstPlayable = state.filtered.find((item) => item.playable)
      || state.items.find((item) => item.playable);
    if (!firstPlayable) {
      setStatus("香奈美还没有找到可播放的本地音频。");
      return;
    }
    const pool = state.filtered.filter((item) => item.playable);
    state.queue = (pool.length ? pool : state.items.filter((item) => item.playable)).map((item) => item.bvid);
    updateQueue();
    playItem(firstPlayable);
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
    elements.randomQueueButtons.forEach((button) => button.addEventListener("click", randomQueue));
    elements.playAll.addEventListener("click", playAll);
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
    document.addEventListener("click", (event) => {
      document.querySelectorAll(".vnami-feedback-menu[open]").forEach((menu) => {
        if (!menu.contains(event.target)) menu.open = false;
      });
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
      updateSearchPlaceholder();
      updatePlaylistCover();
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
