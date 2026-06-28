(() => {
  const STORAGE_KEY = "kanami-china-ex-levels-v1";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const EXPORT_WIDTH = 1600;
  const EXPORT_HEIGHT = 1600;

  const LEVELS = [
    { value: 5, label: "居住", score: "+5", color: "#ff7878" },
    { value: 4, label: "短居", score: "+4", color: "#ffb46f" },
    { value: 3, label: "游玩", score: "+3", color: "#ffe27a" },
    { value: 2, label: "出差", score: "+2", color: "#9fe6b5" },
    { value: 1, label: "路过", score: "+1", color: "#88aeff" },
    { value: 0, label: "没去过", score: "+0", color: "#ffffff" },
  ];

  const levelByValue = new Map(LEVELS.map((level) => [level.value, level]));
  const map = document.querySelector("#china-map");
  const regions = Array.from(document.querySelectorAll("#regions path"));
  const levelList = document.querySelector("#level-list");
  const popover = document.querySelector("#level-popover");
  const popoverTitle = document.querySelector("#popover-title");
  const popoverLevels = document.querySelector("#popover-levels");
  const selectedRegion = document.querySelector("#selected-region");
  const message = document.querySelector("#message");
  const score = document.querySelector("#score");
  const svgScore = document.querySelector("#svg-score");
  const visitedCount = document.querySelector("#visited-count");
  const topLevel = document.querySelector("#top-level");
  const saveButton = document.querySelector("#save-image");
  const resetButton = document.querySelector("#reset-map");
  const outputModal = document.querySelector("#output-modal");
  const outputImage = document.querySelector("#output-image");
  const downloadLink = document.querySelector("#download-link");
  const closeOutput = document.querySelector("#close-output");

  let activeRegion = null;
  let generatedImageUrl = "";

  function readSavedLevels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveLevels() {
    const levels = {};
    let total = 0;
    let visited = 0;
    regions.forEach((region) => {
      const level = Number(region.dataset.level || 0);
      levels[region.id] = level;
      total += level;
      if (level > 0) visited += 1;
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
      window.KanamiGameScore?.record({
        gameId: "china-ex",
        gameTitle: "香奈美中国制霸",
        score: total,
        detail: { visited, totalRegions: regions.length }
      });
    } catch (error) {
      message.textContent = "本地存储暂时不可用，不过这次舞台上的颜色我会先保留到刷新前。";
    }
  }

  function clampLevel(value) {
    const numeric = Number.parseInt(value, 10);
    return levelByValue.has(numeric) ? numeric : 0;
  }

  function setRegionLevel(region, value, shouldSave = true) {
    const level = clampLevel(value);
    const levelInfo = levelByValue.get(level);
    region.dataset.level = String(level);
    region.setAttribute("aria-label", `${region.id}：${levelInfo.label}`);

    if (shouldSave) {
      saveLevels();
    }

    updateStats();
    updateLevelButtons();
  }

  function updateStats() {
    let total = 0;
    let visited = 0;
    let highest = 0;

    regions.forEach((region) => {
      const level = clampLevel(region.dataset.level);
      total += level;
      if (level > 0) {
        visited += 1;
        highest = Math.max(highest, level);
      }
    });

    score.textContent = String(total);
    svgScore.textContent = `分数: ${total}`;
    visitedCount.textContent = `${visited}/${regions.length}`;
    topLevel.textContent = highest > 0 ? levelByValue.get(highest).label : "还没开始";
  }

  function updateLevelButtons() {
    const activeLevel = activeRegion ? clampLevel(activeRegion.dataset.level) : -1;
    document.querySelectorAll("[data-level-button]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.level) === activeLevel));
    });
  }

  function selectRegion(region, shouldOpenPopover = false) {
    if (activeRegion) {
      activeRegion.removeAttribute("data-active");
    }

    activeRegion = region;
    activeRegion.dataset.active = "true";
    selectedRegion.textContent = region.id;
    message.textContent = `${region.id} 已选中，我等你给它贴上制霸等级。`;
    updateLevelButtons();

    if (shouldOpenPopover) {
      showPopover(region);
    }
  }

  function hidePopover() {
    popover.hidden = true;
  }

  function showPopover(region) {
    popoverTitle.textContent = region.id;
    popover.hidden = false;

    requestAnimationFrame(() => {
      const regionRect = region.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const padding = 10;
      let left = regionRect.left + regionRect.width / 2 - popoverRect.width / 2;
      let top = regionRect.top + regionRect.height / 2 - popoverRect.height / 2;

      left = Math.max(padding, Math.min(left, window.innerWidth - popoverRect.width - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - popoverRect.height - padding));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    });
  }

  function applyLevelToActive(value) {
    if (!activeRegion) {
      message.textContent = "先点一下地图上的地区吧，我才知道要给哪里上色。";
      return;
    }

    const level = clampLevel(value);
    const levelInfo = levelByValue.get(level);
    setRegionLevel(activeRegion, level);
    message.textContent = `${activeRegion.id} 标记为「${levelInfo.label}」，我已经记下啦。`;
  }

  function createLevelButton(level, target) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-button";
    button.dataset.level = String(level.value);
    button.dataset.levelButton = target;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `
      <span class="swatch" data-level="${level.value}" aria-hidden="true"></span>
      <span>${level.label}</span>
      <span class="level-score">${level.score}</span>
    `;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      applyLevelToActive(level.value);
      if (target === "popover") {
        hidePopover();
      }
    });
    return button;
  }

  function buildLevelControls() {
    LEVELS.forEach((level) => {
      levelList.append(createLevelButton(level, "side"));
      popoverLevels.append(createLevelButton(level, "popover"));
    });
  }

  function resetMap() {
    const confirmed = window.confirm("我要把这张制霸地图清空吗？");
    if (!confirmed) {
      return;
    }

    regions.forEach((region) => setRegionLevel(region, 0, false));
    saveLevels();
    message.textContent = "地图已经清空啦，下一次旅程也交给我记录吧。";
    hidePopover();
  }

  function getExportSvgText() {
    const clone = map.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", "1134");
    clone.setAttribute("height", "976");

    clone.querySelectorAll("#regions path").forEach((region) => {
      const level = clampLevel(region.dataset.level);
      region.setAttribute("fill", levelByValue.get(level).color);
      region.removeAttribute("data-active");
      region.removeAttribute("tabindex");
      region.removeAttribute("role");
      region.removeAttribute("aria-label");
    });

    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = `
      text{font-family:"PingFang SC","Microsoft YaHei",sans-serif;fill:#18131f;font-size:30px}
      #svg-title,#svg-score{font-size:58px;font-weight:800}
      #svg-signature{fill:#5c5370;font-size:32px;font-weight:800}
      .small-label{font-size:24px}
      #regions path,#south-sea,.legend-border{fill-rule:evenodd;clip-rule:evenodd;stroke:#18131f;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
      #south-sea,.legend-border{fill:none}
      .level-5{fill:#ff7878}.level-4{fill:#ffb46f}.level-3{fill:#ffe27a}.level-2{fill:#9fe6b5}.level-1{fill:#88aeff}.level-0{fill:#fff}
      .legend-box{stroke:none}
    `;
    clone.insertBefore(style, clone.firstChild);

    return new XMLSerializer().serializeToString(clone);
  }

  function setBusy(isBusy) {
    saveButton.disabled = isBusy;
    saveButton.textContent = isBusy ? "生成中" : "保存图片";
  }

  function showGeneratedImage(blob) {
    if (generatedImageUrl) {
      URL.revokeObjectURL(generatedImageUrl);
    }

    generatedImageUrl = URL.createObjectURL(blob);
    outputImage.src = generatedImageUrl;
    downloadLink.href = generatedImageUrl;
    outputModal.hidden = false;
  }

  function saveImage() {
    setBusy(true);
    hidePopover();

    const svgText = getExportSvgText();
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const imageHeight = Math.round((EXPORT_WIDTH * 976) / 1134);
      const y = Math.round((EXPORT_HEIGHT - imageHeight) / 2);

      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;
      context.fillStyle = "#f2d9e5";
      context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      context.drawImage(image, 0, y, EXPORT_WIDTH, imageHeight);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl);
        setBusy(false);

        if (!blob) {
          message.textContent = "图片生成失败了，我会再试一次。";
          return;
        }

        showGeneratedImage(blob);
        message.textContent = "图片已经做好啦，可以下载保存。";
      }, "image/png");
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(svgUrl);
      setBusy(false);
      message.textContent = "图片生成遇到问题了，刷新后再交给我试试。";
    });

    image.src = svgUrl;
  }

  function closeGeneratedImage() {
    outputModal.hidden = true;
  }

  function initRegions() {
    const savedLevels = readSavedLevels();

    regions.forEach((region) => {
      region.dataset.level = String(clampLevel(savedLevels[region.id]));
      region.setAttribute("tabindex", "0");
      region.setAttribute("role", "button");
      region.setAttribute("aria-label", `${region.id}：${levelByValue.get(clampLevel(region.dataset.level)).label}`);
      region.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRegion(region, true);
      });
      region.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRegion(region, true);
        }
      });
    });
  }

  buildLevelControls();
  initRegions();
  updateStats();
  saveButton.addEventListener("click", saveImage);
  resetButton.addEventListener("click", resetMap);
  closeOutput.addEventListener("click", closeGeneratedImage);
  outputModal.addEventListener("click", (event) => {
    if (event.target === outputModal) {
      closeGeneratedImage();
    }
  });
  document.addEventListener("click", (event) => {
    if (!popover.contains(event.target)) {
      hidePopover();
    }
  });
  window.addEventListener("resize", hidePopover);
})();
