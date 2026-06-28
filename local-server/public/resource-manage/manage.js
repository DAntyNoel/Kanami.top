(() => {
  const tokenKey = "kanami.resourceManage.adminToken";
  const state = {
    token: sessionStorage.getItem(tokenKey) || "",
    groups: [],
    requiredFields: [],
    activeGroup: "",
    items: [],
    selectedId: "",
    selectedIds: new Set(),
    query: ""
  };

  const els = {
    loginPanel: document.querySelector("[data-login-panel]"),
    loginForm: document.querySelector("[data-login-form]"),
    localLogin: document.querySelector("[data-local-login]"),
    loginMessage: document.querySelector("[data-login-message]"),
    workbench: document.querySelector("[data-workbench]"),
    groupList: document.querySelector("[data-group-list]"),
    refreshGroups: document.querySelector("[data-refresh-groups]"),
    openGroup: document.querySelector("[data-open-group]"),
    groupPanel: document.querySelector("[data-group-panel]"),
    closeGroup: document.querySelector("[data-close-group]"),
    groupForm: document.querySelector("[data-group-form]"),
    groupMessage: document.querySelector("[data-group-message]"),
    activeGroupKicker: document.querySelector("[data-active-group-kicker]"),
    activeGroupTitle: document.querySelector("[data-active-group-title]"),
    search: document.querySelector("[data-search]"),
    openUpload: document.querySelector("[data-open-upload]"),
    openCsv: document.querySelector("[data-open-csv]"),
    uploadPanel: document.querySelector("[data-upload-panel]"),
    closeUpload: document.querySelector("[data-close-upload]"),
    uploadForm: document.querySelector("[data-upload-form]"),
    uploadMessage: document.querySelector("[data-upload-message]"),
    csvPanel: document.querySelector("[data-csv-panel]"),
    closeCsv: document.querySelector("[data-close-csv]"),
    csvForm: document.querySelector("[data-csv-form]"),
    csvMessage: document.querySelector("[data-csv-message]"),
    bulkBar: document.querySelector("[data-bulk-bar]"),
    selectAll: document.querySelector("[data-select-all]"),
    selectedCount: document.querySelector("[data-selected-count]"),
    bulkDelete: document.querySelector("[data-bulk-delete]"),
    bulkDeleteToolbar: document.querySelector("[data-bulk-delete-toolbar]"),
    bulkDeleteFiles: document.querySelector("[data-bulk-delete-files]"),
    listMeta: document.querySelector("[data-list-meta]"),
    itemList: document.querySelector("[data-item-list]"),
    emptyDetail: document.querySelector("[data-empty-detail]"),
    detailForm: document.querySelector("[data-detail-form]"),
    detailMessage: document.querySelector("[data-detail-message]"),
    customFields: document.querySelector("[data-custom-fields]"),
    preview: document.querySelector("[data-preview]"),
    moveTarget: document.querySelector("[data-move-target]"),
    moveItem: document.querySelector("[data-move-item]"),
    moveUp: document.querySelector("[data-move-up]"),
    moveDown: document.querySelector("[data-move-down]"),
    deleteItem: document.querySelector("[data-delete-item]"),
    deleteFile: document.querySelector("[data-delete-file]")
  };

  function message(element, text, type = "info") {
    if (!element) return;
    element.textContent = text;
    element.dataset.state = type;
  }

  function headers(extra = {}) {
    return {
      "Content-Type": "application/json",
      ...(state.token ? { "X-Kanami-Admin-Token": state.token } : {}),
      ...extra
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/resource/manage${path}`, {
      ...options,
      headers: headers(options.headers || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.message || `API ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function activeGroup() {
    return state.groups.find((group) => group.id === state.activeGroup) || null;
  }

  function normalizeGroupId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function normalizeFieldKey(value) {
    return String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  }

  function parseFieldLines(value) {
    const reserved = new Set(["url", "id", "title", "type", "section", "sourcePage", "subsection", "mediaType", "extension", "thumbnailUrl", "width", "height", "occurrences"]);
    const seen = new Set();
    return String(value || "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawKey, ...labelParts] = line.split(",");
        const key = normalizeFieldKey(rawKey);
        const label = labelParts.join(",").trim() || key;
        return { key, label };
      })
      .filter((field) => {
        if (!field.key || reserved.has(field.key) || seen.has(field.key)) return false;
        seen.add(field.key);
        return true;
      });
  }

  function selectedItem() {
    return state.items.find((item) => item.id === state.selectedId) || null;
  }

  function showWorkbench() {
    els.loginPanel.hidden = true;
    els.workbench.hidden = false;
  }

  function showLogin(text = "") {
    els.loginPanel.hidden = false;
    els.workbench.hidden = true;
    if (text) message(els.loginMessage, text, "error");
  }

  function encodeQuery(params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, value);
    });
    return query.toString();
  }

  function assetUrl(url) {
    if (!url) return "";
    if (url.startsWith("/files/") || url.startsWith("/res/")) return url;
    return url;
  }

  function createThumb(item) {
    const thumb = document.createElement("span");
    thumb.className = "resource-item-thumb";
    if (item.meta.mediaType === "image") {
      const img = document.createElement("img");
      img.src = assetUrl(item.url);
      img.alt = item.title || "香奈美收藏";
      img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      thumb.textContent = (item.meta.extension || item.meta.mediaType || "FILE").toUpperCase();
    }
    return thumb;
  }

  function renderGroups() {
    els.groupList.innerHTML = "";
    els.moveTarget.innerHTML = "";
    state.groups.filter((group) => group.manageable).forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "resource-group-button";
      button.setAttribute("aria-current", String(group.id === state.activeGroup));
      button.innerHTML = `<span>${group.label}${group.custom ? " · 自定义" : ""}</span><span class="resource-group-count">${group.count}</span>`;
      button.addEventListener("click", () => selectGroup(group.id));
      els.groupList.appendChild(button);

      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.label;
      els.moveTarget.appendChild(option);
    });
  }

  function renderItems() {
    const group = activeGroup();
    els.activeGroupKicker.textContent = group ? `${group.file} · ${state.items.length} 项` : "资源";
    els.activeGroupTitle.textContent = group ? group.label : "收藏列表";
    els.listMeta.textContent = group
      ? `香奈美已经展开 ${group.label}，可以拖拽排序，也可以点选后编辑。`
      : "香奈美正在读取收藏。";
    els.itemList.innerHTML = "";
    state.selectedIds = new Set([...state.selectedIds].filter((id) => state.items.some((item) => item.id === id)));

    state.items.forEach((item) => {
      const row = document.createElement("div");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.className = "resource-item-row";
      row.draggable = true;
      row.dataset.id = item.id;
      row.setAttribute("aria-selected", String(item.id === state.selectedId));
      const checkboxWrap = document.createElement("span");
      checkboxWrap.className = "resource-row-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedIds.has(item.id);
      checkbox.setAttribute("aria-label", `选择 ${item.title || item.id}`);
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener("change", (event) => {
        event.stopPropagation();
        setItemChecked(item.id, checkbox.checked);
      });
      checkboxWrap.appendChild(checkbox);
      row.appendChild(checkboxWrap);

      const index = document.createElement("span");
      index.className = "resource-item-index";
      index.textContent = `#${item.index + 1}`;
      row.appendChild(index);

      row.appendChild(createThumb(item));

      const main = document.createElement("span");
      main.className = "resource-item-main";
      const title = document.createElement("span");
      title.className = "resource-item-title";
      title.textContent = item.title || item.id;
      const url = document.createElement("span");
      url.className = "resource-item-url";
      url.textContent = item.url;
      main.append(title, url);
      row.appendChild(main);

      row.addEventListener("click", () => selectItem(item.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem(item.id);
        }
      });
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", item.id);
      });
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", async (event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== item.id) {
          await reorderItem(draggedId, item.index);
        }
      });
      els.itemList.appendChild(row);
    });

    renderBulkBar();
    renderDetail();
  }

  function renderBulkBar() {
    const selectedCount = state.selectedIds.size;
    els.bulkBar.hidden = false;
    els.selectedCount.textContent = selectedCount ? `已选择 ${selectedCount} 项` : "还没有选择收藏";
    els.selectAll.checked = state.items.length > 0 && state.items.every((item) => state.selectedIds.has(item.id));
    els.selectAll.indeterminate = selectedCount > 0 && !els.selectAll.checked;
    els.bulkDelete.disabled = selectedCount === 0;
    els.bulkDeleteToolbar.disabled = selectedCount === 0;
    els.bulkDeleteToolbar.textContent = selectedCount ? `批量删除 ${selectedCount} 项` : "批量删除";
  }

  function renderPreview(item) {
    els.preview.innerHTML = "";
    if (!item) return;
    if (item.meta.mediaType === "image") {
      const img = document.createElement("img");
      img.src = assetUrl(item.url);
      img.alt = item.title || "香奈美收藏";
      els.preview.appendChild(img);
      return;
    }
    if (item.meta.mediaType === "audio") {
      const audio = document.createElement("audio");
      audio.src = assetUrl(item.url);
      audio.controls = true;
      audio.preload = "none";
      els.preview.appendChild(audio);
      return;
    }
    const link = document.createElement("a");
    link.href = assetUrl(item.url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.meta.extension ? `打开 ${item.meta.extension.toUpperCase()} 文件` : "打开文件";
    els.preview.appendChild(link);
  }

  function renderDetail() {
    const item = selectedItem();
    const group = activeGroup();
    els.emptyDetail.hidden = Boolean(item);
    els.detailForm.hidden = !item;
    message(els.detailMessage, "");
    if (!item) {
      els.customFields.innerHTML = "";
      return;
    }

    const form = els.detailForm;
    form.elements.title.value = item.meta.title || item.title || "";
    form.elements.type.value = item.meta.type || "";
    form.elements.section.value = item.meta.section || "";
    form.elements.subsection.value = item.meta.subsection || "";
    form.elements.sourcePage.value = item.meta.sourcePage || "";
    form.elements.text.value = item.meta.text || "";
    form.elements.targetGroup.value = state.activeGroup;
    els.deleteFile.checked = item.url.startsWith("/files/WIKI/images/managed/");
    renderCustomFields(group, item);
    renderPreview(item);
  }

  function renderCustomFields(group, item) {
    els.customFields.innerHTML = "";
    const fields = Array.isArray(group?.fields) ? group.fields : [];
    if (!fields.length) return;

    const note = document.createElement("p");
    note.className = "resource-field-note";
    note.textContent = "这个分类组的自定义字段";
    els.customFields.appendChild(note);

    fields.forEach((field) => {
      const label = document.createElement("label");
      const text = document.createElement("span");
      text.textContent = field.label || field.key;
      const input = document.createElement("input");
      input.name = `custom_${field.key}`;
      input.type = "text";
      input.dataset.customField = field.key;
      input.value = item?.meta?.[field.key] ?? "";
      label.append(text, input);
      els.customFields.appendChild(label);
    });
  }

  async function loadGroups() {
    const payload = await api("/groups");
    state.groups = payload.groups;
    state.requiredFields = payload.requiredFields || [];
    if (!state.activeGroup || !state.groups.some((group) => group.id === state.activeGroup && group.manageable)) {
      state.activeGroup = state.groups.find((group) => group.manageable)?.id || "";
    }
    renderGroups();
  }

  async function loadItems() {
    if (!state.activeGroup) return;
    const query = encodeQuery({ group: state.activeGroup, query: state.query, limit: 1000 });
    const payload = await api(`/items?${query}`);
    state.items = payload.items;
    if (!state.items.some((item) => item.id === state.selectedId)) {
      state.selectedId = state.items[0]?.id || "";
    }
    renderItems();
  }

  async function refreshAll() {
    await loadGroups();
    await loadItems();
  }

  async function selectGroup(groupId) {
    state.activeGroup = groupId;
    state.selectedId = "";
    state.selectedIds.clear();
    renderGroups();
    await loadItems();
  }

  function selectItem(id) {
    state.selectedId = id;
    renderItems();
  }

  function setItemChecked(id, checked) {
    if (checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderItems();
  }

  function setAllChecked(checked) {
    state.selectedIds.clear();
    if (checked) {
      state.items.forEach((item) => state.selectedIds.add(item.id));
    }
    renderItems();
  }

  function formMetadata() {
    const form = els.detailForm;
    const metadata = {
      title: form.elements.title.value.trim(),
      type: form.elements.type.value.trim(),
      section: form.elements.section.value.trim(),
      subsection: form.elements.subsection.value.trim(),
      sourcePage: form.elements.sourcePage.value.trim(),
      text: form.elements.text.value.trim()
    };
    els.customFields.querySelectorAll("[data-custom-field]").forEach((input) => {
      metadata[input.dataset.customField] = input.value.trim();
    });
    return metadata;
  }

  async function saveDetail(event) {
    event.preventDefault();
    const item = selectedItem();
    if (!item) return;
    try {
      const metadata = formMetadata();
      await api("/item", {
        method: "PATCH",
        body: JSON.stringify({
          group: state.activeGroup,
          id: item.id,
          title: metadata.title,
          metadata
        })
      });
      message(els.detailMessage, "香奈美已经保存这项收藏。", "success");
      await refreshAll();
      state.selectedId = item.id;
      renderItems();
    } catch (error) {
      message(els.detailMessage, error.message, "error");
    }
  }

  async function moveSelected() {
    const item = selectedItem();
    const targetGroup = els.moveTarget.value;
    if (!item || !targetGroup || targetGroup === state.activeGroup) return;
    try {
      await api("/item", {
        method: "PATCH",
        body: JSON.stringify({
          group: state.activeGroup,
          id: item.id,
          targetGroup,
          metadata: formMetadata()
        })
      });
      state.activeGroup = targetGroup;
      state.selectedId = item.id;
      await refreshAll();
      message(els.detailMessage, "香奈美已经把它移动到新分类。", "success");
    } catch (error) {
      message(els.detailMessage, error.message, "error");
    }
  }

  async function reorderItem(id, toIndex) {
    try {
      await api("/reorder", {
        method: "POST",
        body: JSON.stringify({ group: state.activeGroup, id, toIndex })
      });
      state.selectedId = id;
      await refreshAll();
    } catch (error) {
      message(els.detailMessage, error.message, "error");
    }
  }

  async function moveBy(delta) {
    const item = selectedItem();
    if (!item) return;
    await reorderItem(item.id, item.index + delta);
  }

  async function deleteSelected() {
    const item = selectedItem();
    if (!item) return;
    const confirmed = window.confirm(`香奈美要删除「${item.title}」吗？这个动作会立刻改写当前 WIKI 映射。`);
    if (!confirmed) return;
    try {
      const query = encodeQuery({
        group: state.activeGroup,
        id: item.id,
        deleteFile: String(els.deleteFile.checked)
      });
      await api(`/item?${query}`, { method: "DELETE" });
      state.selectedId = "";
      state.selectedIds.delete(item.id);
      await refreshAll();
      message(els.listMeta, "香奈美已经删除这项收藏。", "success");
    } catch (error) {
      message(els.detailMessage, error.message, "error");
    }
  }

  async function bulkDeleteSelected() {
    const ids = [...state.selectedIds];
    if (!ids.length) return;
    const confirmed = window.confirm(`香奈美要批量删除 ${ids.length} 项收藏吗？这个动作会立刻改写当前 WIKI 映射。`);
    if (!confirmed) return;
    try {
      const deleted = [];
      for (const id of ids) {
        try {
          const query = encodeQuery({
            group: state.activeGroup,
            id,
            deleteFile: String(els.bulkDeleteFiles.checked)
          });
          await api(`/item?${query}`, { method: "DELETE" });
          deleted.push(id);
        } catch (singleError) {
          if (singleError.payload?.error === "ITEM_NOT_FOUND") {
            continue;
          }
          throw singleError;
        }
      }
      state.selectedIds.clear();
      if (ids.includes(state.selectedId)) state.selectedId = "";
      await refreshAll();
      message(els.listMeta, `香奈美已经批量删除 ${deleted.length} 项收藏。`, "success");
    } catch (error) {
      message(els.listMeta, error.message, "error");
    }
  }

  function imageDimensions(file) {
    if (!file.type.startsWith("image/")) return Promise.resolve({});
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  function readFileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(new Error("香奈美读取文件失败了。")));
      reader.readAsDataURL(file);
    });
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(new Error("香奈美读取 CSV 失败了。")));
      reader.readAsText(file);
    });
  }

  async function uploadResource(event) {
    event.preventDefault();
    const form = els.uploadForm;
    const file = form.elements.file.files?.[0];
    if (!file) {
      message(els.uploadMessage, "先选一个文件哦。", "error");
      return;
    }
    try {
      message(els.uploadMessage, "香奈美正在上传。");
      const dimensions = await imageDimensions(file);
      const dataUrl = await readFileDataUrl(file);
      const payload = await api("/upload", {
        method: "POST",
        body: JSON.stringify({
          group: state.activeGroup,
          fileName: file.name,
          mimeType: file.type,
          dataUrl,
          title: form.elements.title.value.trim() || file.name,
          metadata: {
            section: form.elements.section.value.trim() || "香奈美管理台",
            subsection: form.elements.subsection.value.trim() || "管理上传",
            width: dimensions.width ?? null,
            height: dimensions.height ?? null
          }
        })
      });
      state.selectedId = payload.item.id;
      form.reset();
      message(els.uploadMessage, "上传完成，我已经放进当前分类啦。", "success");
      await refreshAll();
    } catch (error) {
      message(els.uploadMessage, error.message, "error");
    }
  }

  async function importCsv(event) {
    event.preventDefault();
    const form = els.csvForm;
    const file = form.elements.csvFile.files?.[0];
    try {
      message(els.csvMessage, "香奈美正在读取 CSV。");
      const csv = file ? await readFileText(file) : form.elements.csvText.value;
      const payload = await api("/csv-import", {
        method: "POST",
        body: JSON.stringify({
          group: state.activeGroup,
          csv
        })
      });
      form.reset();
      state.selectedIds.clear();
      message(
        els.csvMessage,
        `导入完成：新增 ${payload.created} 项，更新 ${payload.updated} 项，跳过 ${payload.skipped.length} 行。`,
        "success"
      );
      await refreshAll();
    } catch (error) {
      message(els.csvMessage, error.message, "error");
    }
  }

  async function createGroup(event) {
    event.preventDefault();
    const form = els.groupForm;
    const label = form.elements.label.value.trim();
    const id = normalizeGroupId(form.elements.id.value || label);
    const fields = parseFieldLines(form.elements.fields.value);
    if (!label || !id) {
      message(els.groupMessage, "分类名称和 ID 要填好哦。", "error");
      return;
    }

    try {
      const payload = await api("/group", {
        method: "POST",
        body: JSON.stringify({ id, label, fields })
      });
      form.reset();
      state.activeGroup = payload.group.id;
      state.selectedId = "";
      state.selectedIds.clear();
      message(els.groupMessage, `香奈美已经创建「${payload.group.label}」。`, "success");
      await refreshAll();
    } catch (error) {
      message(els.groupMessage, error.message, "error");
    }
  }

  async function loginWithToken(token) {
    state.token = token || "";
    if (state.token) sessionStorage.setItem(tokenKey, state.token);
    try {
      await api("/session");
      showWorkbench();
      await refreshAll();
      message(els.loginMessage, "");
    } catch (error) {
      if (state.token) sessionStorage.removeItem(tokenKey);
      showLogin(error.message);
    }
  }

  function wireEvents() {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loginWithToken(els.loginForm.elements.token.value.trim());
    });
    els.localLogin.addEventListener("click", async () => loginWithToken(""));
    els.refreshGroups.addEventListener("click", refreshAll);
    els.openGroup.addEventListener("click", () => {
      els.groupPanel.hidden = false;
      els.groupForm.elements.label.focus();
    });
    els.closeGroup.addEventListener("click", () => {
      els.groupPanel.hidden = true;
    });
    els.groupForm.elements.label.addEventListener("input", () => {
      if (!els.groupForm.elements.id.value.trim()) {
        els.groupForm.elements.id.placeholder = normalizeGroupId(els.groupForm.elements.label.value) || "special-collection";
      }
    });
    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim();
      loadItems();
    });
    els.openUpload.addEventListener("click", () => {
      els.uploadPanel.hidden = false;
      els.uploadForm.elements.file.focus();
    });
    els.openCsv.addEventListener("click", () => {
      els.csvPanel.hidden = false;
      els.csvForm.elements.csvText.focus();
    });
    els.closeUpload.addEventListener("click", () => {
      els.uploadPanel.hidden = true;
    });
    els.closeCsv.addEventListener("click", () => {
      els.csvPanel.hidden = true;
    });
    els.uploadForm.addEventListener("submit", uploadResource);
    els.csvForm.addEventListener("submit", importCsv);
    els.groupForm.addEventListener("submit", createGroup);
    els.detailForm.addEventListener("submit", saveDetail);
    els.moveItem.addEventListener("click", moveSelected);
    els.moveUp.addEventListener("click", () => moveBy(-1));
    els.moveDown.addEventListener("click", () => moveBy(1));
    els.deleteItem.addEventListener("click", deleteSelected);
    els.selectAll.addEventListener("change", () => setAllChecked(els.selectAll.checked));
    els.bulkDelete.addEventListener("click", bulkDeleteSelected);
    els.bulkDeleteToolbar.addEventListener("click", bulkDeleteSelected);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    wireEvents();
    await loginWithToken(state.token);
  });
})();
