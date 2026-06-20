(() => {
  const pageSize = 96;
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" });
  const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

  const state = {
    folders: [],
    images: [],
    filtered: [],
    rendered: 0,
    activeIndex: -1
  };

  const elements = {
    total: document.querySelector("[data-stat-total]"),
    folders: document.querySelector("[data-stat-folders]"),
    shown: document.querySelector("[data-stat-shown]"),
    search: document.querySelector("[data-gallery-search]"),
    folder: document.querySelector("[data-gallery-folder]"),
    sort: document.querySelector("[data-gallery-sort]"),
    grid: document.querySelector("[data-gallery-grid]"),
    more: document.querySelector("[data-gallery-more]"),
    status: document.querySelector("[data-gallery-status]"),
    densityButtons: Array.from(document.querySelectorAll("[data-density]")),
    lightbox: document.querySelector("[data-lightbox]"),
    lightboxImage: document.querySelector("[data-lightbox-image]"),
    lightboxCaption: document.querySelector("[data-lightbox-caption]"),
    lightboxFolder: document.querySelector("[data-lightbox-folder]"),
    lightboxTitle: document.querySelector("[data-lightbox-title]"),
    lightboxFile: document.querySelector("[data-lightbox-file]"),
    lightboxCreated: document.querySelector("[data-lightbox-created]"),
    lightboxSize: document.querySelector("[data-lightbox-size]"),
    lightboxTags: document.querySelector("[data-lightbox-tags]"),
    lightboxDescription: document.querySelector("[data-lightbox-description]"),
    lightboxOpen: document.querySelector("[data-lightbox-open]"),
    lightboxCopy: document.querySelector("[data-lightbox-copy]"),
    lightboxCopyState: document.querySelector("[data-lightbox-copy-state]")
  };

  function setStatus(message) {
    elements.status.textContent = message;
    elements.status.hidden = !message;
  }

  function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) return "未知";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatDate(value) {
    if (!value) return "未知";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }
    return dateFormatter.format(date);
  }

  function imageText(image) {
    return [
      image.folder,
      image.id,
      image.filename,
      image.originalName,
      image.description,
      ...(image.tags || [])
    ].join(" ").toLowerCase();
  }

  function updateStats() {
    elements.total.textContent = String(state.images.length);
    elements.folders.textContent = String(state.folders.length);
    elements.shown.textContent = String(state.filtered.length);
  }

  function renderFolderOptions() {
    elements.folder.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = `全部分类 (${state.images.length})`;
    elements.folder.append(allOption);

    for (const folder of state.folders) {
      const option = document.createElement("option");
      option.value = folder.name;
      option.textContent = `${folder.name} (${folder.count})`;
      elements.folder.append(option);
    }
  }

  function compareCreated(left, right, newestFirst) {
    const leftTime = Date.parse(left.createdAt || "");
    const rightTime = Date.parse(right.createdAt || "");
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return newestFirst ? safeRight - safeLeft : safeLeft - safeRight;
  }

  function sortImages(images) {
    const sortMode = elements.sort.value;
    return [...images].sort((left, right) => {
      if (sortMode === "oldest") return compareCreated(left, right, false);
      if (sortMode === "name") return collator.compare(left.filename, right.filename);
      if (sortMode === "size") return (right.fileSize || 0) - (left.fileSize || 0);
      return compareCreated(left, right, true);
    });
  }

  function applyFilters() {
    const folder = elements.folder.value;
    const query = elements.search.value.trim().toLowerCase();
    const filtered = state.images.filter((image) => {
      if (folder && image.folder !== folder) return false;
      if (!query) return true;
      return imageText(image).includes(query);
    });

    state.filtered = sortImages(filtered);
    state.rendered = 0;
    elements.grid.innerHTML = "";
    updateStats();
    renderMore();
  }

  function tileTitle(image) {
    return image.originalName || image.filename || image.id || "未命名图片";
  }

  function createTile(image, index) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "gallery-tile";
    tile.addEventListener("click", () => openLightbox(index));

    const preview = document.createElement("img");
    preview.className = "gallery-tile-image";
    preview.loading = "lazy";
    preview.decoding = "async";
    preview.src = image.thumbUrl;
    preview.alt = `${image.folder} / ${tileTitle(image)}`;
    preview.addEventListener("error", () => {
      if (preview.src !== new URL(image.fileUrl, location.href).href) {
        preview.src = image.fileUrl;
      }
    }, { once: true });

    const meta = document.createElement("span");
    meta.className = "gallery-tile-meta";

    const title = document.createElement("span");
    title.className = "gallery-tile-title";
    title.textContent = tileTitle(image);

    const subtitle = document.createElement("span");
    subtitle.className = "gallery-tile-subtitle";
    subtitle.textContent = `${image.folder} · ${formatDate(image.createdAt)}`;

    meta.append(title, subtitle);
    tile.append(preview, meta);
    return tile;
  }

  function renderMore() {
    const next = state.filtered.slice(state.rendered, state.rendered + pageSize);
    const fragment = document.createDocumentFragment();

    next.forEach((image, offset) => {
      fragment.append(createTile(image, state.rendered + offset));
    });

    elements.grid.append(fragment);
    state.rendered += next.length;
    elements.more.hidden = state.rendered >= state.filtered.length;

    if (!state.filtered.length) {
      setStatus("香奈美没有找到符合条件的图片，换个关键词再看看吧。");
      return;
    }

    setStatus("");
  }

  function lightboxUrl(image) {
    return new URL(image.fileUrl, location.href).href;
  }

  function showLightbox(index) {
    const image = state.filtered[index];
    if (!image) return;

    state.activeIndex = index;
    const title = tileTitle(image);
    elements.lightboxImage.src = image.fileUrl;
    elements.lightboxImage.alt = `${image.folder} / ${title}`;
    elements.lightboxCaption.textContent = image.description || title;
    elements.lightboxFolder.textContent = image.folder;
    elements.lightboxTitle.textContent = title;
    elements.lightboxFile.textContent = `${image.filename} · ${image.fileType || "image"}`;
    elements.lightboxCreated.textContent = formatDate(image.createdAt);
    elements.lightboxSize.textContent = formatBytes(image.fileSize);
    elements.lightboxTags.textContent = image.tags.length ? image.tags.join("、") : "未标记";
    elements.lightboxDescription.textContent = image.description || "这张还没有备注，香奈美先帮你把图留在这里。";
    elements.lightboxOpen.href = image.fileUrl;
    elements.lightboxCopyState.textContent = "";
  }

  function openLightbox(index) {
    showLightbox(index);
    if (!elements.lightbox.open) {
      elements.lightbox.showModal();
    }
  }

  function stepLightbox(direction) {
    if (!state.filtered.length) return;
    const nextIndex = (state.activeIndex + direction + state.filtered.length) % state.filtered.length;
    showLightbox(nextIndex);
  }

  async function copyActiveUrl() {
    const image = state.filtered[state.activeIndex];
    if (!image) return;

    try {
      await navigator.clipboard.writeText(lightboxUrl(image));
      elements.lightboxCopyState.textContent = "链接已经交到剪贴板啦。";
    } catch {
      elements.lightboxCopyState.textContent = lightboxUrl(image);
    }
  }

  function setDensity(value) {
    elements.grid.dataset.density = value;
    for (const button of elements.densityButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.density === value));
    }
  }

  function bindEvents() {
    elements.search.addEventListener("input", applyFilters);
    elements.folder.addEventListener("change", applyFilters);
    elements.sort.addEventListener("change", applyFilters);
    elements.more.addEventListener("click", renderMore);
    elements.lightboxCopy.addEventListener("click", copyActiveUrl);
    document.querySelector("[data-lightbox-close]").addEventListener("click", () => elements.lightbox.close());
    document.querySelector("[data-lightbox-prev]").addEventListener("click", () => stepLightbox(-1));
    document.querySelector("[data-lightbox-next]").addEventListener("click", () => stepLightbox(1));

    for (const button of elements.densityButtons) {
      button.addEventListener("click", () => setDensity(button.dataset.density));
    }

    elements.lightbox.addEventListener("click", (event) => {
      if (event.target === elements.lightbox) {
        elements.lightbox.close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (!elements.lightbox.open) return;
      if (event.key === "ArrowLeft") stepLightbox(-1);
      if (event.key === "ArrowRight") stepLightbox(1);
    });
  }

  async function loadGallery() {
    setStatus("香奈美正在翻找图库...");
    try {
      const response = await fetch("/gallery/api", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "图库清单读取失败");
      }

      state.folders = Array.isArray(payload.folders) ? payload.folders : [];
      state.images = Array.isArray(payload.images) ? payload.images : [];
      renderFolderOptions();
      updateStats();
      applyFilters();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  bindEvents();
  loadGallery();
})();
