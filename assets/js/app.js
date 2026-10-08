(function () {
  "use strict";

  const CONFIG = {
    repo: "https://github.com/lin-alg/NaiLoong",
    dataBase: "data/",
    tagDimensions: "data/tag-translations.json",
    fallback: "assets/placeholders/fallback.gif",
    uploadUrl: "https://wplace-gallery.linalg.tech/api/images/upload"
  };

  const PAGE_SIZES = [4, 8, 16, 32, 64];
  const DEFAULT_PAGE_SIZE = 8;
  const STAGGER_CAP = 14;
  const MAX_UPLOAD_FILES = 10;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);
  const UPLOAD_EXTENSIONS = /\.(?:jpe?g|png|gif)$/i;

  const el = {};
  const state = {
    manifest: [],
    tagDimensions: {},
    chars: new Map(),
    charId: null,
    subId: null,
    query: "",
    selected: new Map(),
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  };
  const uploadState = {
    entries: [],
    uploading: false
  };
  const cache = new Map();
  const context = { url: "", title: "", anchor: null };
  let eggAudio = null;
  let eggAudioSrc = "";

  const EASTER_EGG = {
    defaultSrc: "assets/audio/nailong_laugh.mp3",
    naiwaSources: [
      "assets/audio/nailong_laugh.mp3",
      "assets/audio/hola_ganbadie.mp3",
      "assets/audio/gajiaosai.mp3",
      "assets/audio/gagadilashui.mp3",
      "assets/audio/dupu.mp3"
    ],
    naidanSrc: "assets/audio/andi.mp3",
    chance: 0.25,
    volume: 0.7
  };

  const ICON_DOWNLOAD =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.78 1.78V2A.75.75 0 0 1 8 1.25Z"/><path fill="currentColor" d="M2.75 10a.75.75 0 0 1 .75.75v2.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-2.5a.75.75 0 0 1 .75-.75Z"/></svg>';
  const ICON_ZOOM =
    '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/><path d="M7 4.75v4.5M4.75 7h4.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>';
  const ICON_LINK =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/></svg>';
  const ICON_MARKDOWN =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M14.85 3c.63 0 1.15.52 1.15 1.15v7.7c0 .63-.52 1.15-1.15 1.15H1.15c-.63 0-1.15-.52-1.15-1.15v-7.7C0 3.52.52 3 1.15 3ZM9 11v-4H7v4H5.5L8 13.5 10.5 7H9Zm4.5 0h-2V6h-2v5h-2l3 3.5 3-3.5Z"/></svg>';

  const CTX_ACTIONS = [
    { action: "download", label: "下载图片", icon: ICON_DOWNLOAD },
    { action: "copy-url", label: "复制图片 URL", icon: ICON_LINK },
    { action: "copy-markdown", label: "复制为 Markdown", icon: ICON_MARKDOWN }
  ];
  const CTX_MARGIN = 8;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }

  async function fetchJSON(path) {
    if (cache.has(path)) return cache.get(path);
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " → HTTP " + res.status);
    const data = await res.json();
    cache.set(path, data);
    return data;
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add("is-on"));
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      el.toast.classList.remove("is-on");
      setTimeout(() => {
        el.toast.hidden = true;
      }, 200);
    }, 1800);
  }

  function applyRepoLinks() {
    document.querySelectorAll("[data-repo-link]").forEach((node) => {
      node.href = CONFIG.repo + (node.dataset.repoSuffix || "");
    });
    document.querySelectorAll("a[href]").forEach((node) => {
      let url = null;
      try {
        url = new URL(node.href, location.href);
      } catch (err) {
        return;
      }
      const external = (url.protocol === "https:" || url.protocol === "http:") && url.host !== location.host;
      if (!external) return;
      node.target = "_blank";
      node.rel = "noopener noreferrer";
    });
  }

  function uploadFileError(file) {
    if (!UPLOAD_EXTENSIONS.test(file.name) || (file.type && !UPLOAD_TYPES.has(file.type))) {
      return "仅支持 JPG、PNG 或 GIF 图片";
    }
    if (!file.size) return "文件为空，请重新选择";
    if (file.size > MAX_UPLOAD_BYTES) return "图片超过 5 MB，请压缩后重新选择";
    return "";
  }

  function releaseUploadFiles() {
    uploadState.entries.forEach((entry) => {
      if (entry.preview) URL.revokeObjectURL(entry.preview);
    });
    uploadState.entries = [];
  }

  function renderUploadList() {
    const labels = { pending: "等待上传", uploading: "上传中", success: "上传成功", error: "上传失败", invalid: "无法上传" };
    el.uploadList.innerHTML = uploadState.entries.map((entry, index) => {
      const file = entry.file;
      const size = file.size < 1024 * 1024
        ? Math.max(1, Math.round(file.size / 1024)) + " KB"
        : (file.size / (1024 * 1024)).toFixed(1) + " MB";
      return '<li class="upload-item" data-status="' + entry.status + '">' +
        (entry.preview ? '<img class="upload-thumbnail" src="' + esc(entry.preview) + '" alt="">' : '<span class="upload-thumbnail"></span>') +
        '<div class="upload-item-info"><span class="upload-item-name">' + esc(file.name) + '</span>' +
        '<span class="upload-item-size">' + size + '</span>' +
        (entry.message ? '<p class="upload-item-message">' + esc(entry.message) + '</p>' : '') + '</div>' +
        '<span class="upload-item-status">' + (entry.status === "uploading" ? '<span class="upload-spinner" aria-hidden="true"></span>' : '') +
        labels[entry.status] + '</span>' +
        '<button class="btn btn-ghost icon-btn upload-remove" type="button" data-upload-remove="' + index + '" aria-label="移除 ' + esc(file.name) + '" title="移除图片"' +
        (uploadState.uploading ? ' disabled' : '') + '>' + el.uploadDialogClose.innerHTML + '</button></li>';
    }).join("");
    const entries = uploadState.entries;
    const invalid = entries.some((entry) => entry.status === "invalid");
    const remaining = entries.filter((entry) => entry.status !== "success");
    el.uploadSubmit.disabled = uploadState.uploading || !remaining.length || invalid;
    el.uploadSubmit.textContent = entries.some((entry) => entry.status === "error") ? "重试失败图片" : "开始上传";
    el.uploadSelection.classList.toggle("is-error", invalid);
    el.uploadSelection.textContent = entries.length
      ? "已选择 " + entries.length + " / " + MAX_UPLOAD_FILES + " 张" + (invalid ? "，请移除不符合要求的图片。" : "")
      : "尚未选择图片";
  }

  function setUploadProgress(percent, processed, total, message) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    el.uploadProgressBar.style.width = value + "%";
    el.uploadProgressTrack.setAttribute("aria-valuenow", String(value));
    el.uploadProgressCount.textContent = processed + " / " + total;
    el.uploadProgressStatus.textContent = message;
  }

  function selectUploadFiles() {
    if (uploadState.uploading) return;
    const files = Array.from(el.uploadInput.files || []);
    el.uploadInput.value = "";
    if (!files.length) return;
    if (files.length > MAX_UPLOAD_FILES) {
      el.uploadSelection.textContent = "每次最多选择 10 张图片，请重新选择。";
      el.uploadSelection.classList.add("is-error");
      el.uploadSubmit.disabled = true;
      return;
    }
    releaseUploadFiles();
    uploadState.entries = files.map((file) => {
      const error = uploadFileError(file);
      return { file, status: error ? "invalid" : "pending", message: error, preview: error ? "" : URL.createObjectURL(file) };
    });
    el.uploadCancel.textContent = "取消";
    renderUploadList();
    setUploadProgress(0, 0, files.length, "等待上传");
  }

  function uploadOne(entry, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", CONFIG.uploadUrl);
      request.timeout = 120000;
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total) onProgress(event.loaded / event.total);
      });
      request.addEventListener("load", () => {
        let payload;
        try {
          payload = JSON.parse(request.responseText);
        } catch (error) {
          reject(new Error("服务器返回异常，请稍后重试。"));
          return;
        }
        if (request.status < 200 || request.status >= 300 || !payload || payload.success !== true) {
          reject(new Error(payload && payload.error ? payload.error : "上传失败（HTTP " + request.status + "）。"));
          return;
        }
        resolve(payload);
      });
      request.addEventListener("error", () => reject(new Error("无法连接上传服务，请检查网络或稍后重试。")));
      request.addEventListener("timeout", () => reject(new Error("上传超时，请稍后重试。")));
      const formData = new FormData();
      formData.append("file", entry.file, entry.file.name);
      request.send(formData);
    });
  }

  async function startUpload() {
    const entries = uploadState.entries;
    if (uploadState.uploading || !entries.length || entries.some((entry) => entry.status === "invalid")) return;
    const pending = entries.filter((entry) => entry.status !== "success");
    if (!pending.length) return;
    uploadState.uploading = true;
    [el.uploadInput, el.uploadChoose, el.uploadCancel, el.uploadDialogClose].forEach((node) => { node.disabled = true; });
    el.uploadDialog.setAttribute("aria-busy", "true");
    let processed = entries.length - pending.length;
    try {
      for (const entry of pending) {
        entry.status = "uploading";
        entry.message = "";
        renderUploadList();
        setUploadProgress(processed / entries.length * 100, processed, entries.length, "正在上传：" + entry.file.name);
        try {
          await uploadOne(entry, (fraction) => {
            setUploadProgress((processed + fraction) / entries.length * 100, processed, entries.length,
              (fraction === 1 ? "正在保存：" : "正在上传：") + entry.file.name);
          });
          entry.status = "success";
        } catch (error) {
          entry.status = "error";
          entry.message = error.message || "上传失败，请稍后重试。";
        }
        processed += 1;
        renderUploadList();
        setUploadProgress(processed / entries.length * 100, processed, entries.length, "已处理 " + processed + " 张");
      }
    } finally {
      uploadState.uploading = false;
      [el.uploadInput, el.uploadChoose, el.uploadCancel, el.uploadDialogClose].forEach((node) => { node.disabled = false; });
      el.uploadDialog.setAttribute("aria-busy", "false");
      renderUploadList();
    }
    const failed = entries.filter((entry) => entry.status === "error").length;
    setUploadProgress(100, entries.length, entries.length, failed
      ? "成功 " + (entries.length - failed) + " 张，失败 " + failed + " 张"
      : "全部 " + entries.length + " 张图片上传成功");
    el.uploadCancel.textContent = "关闭";
  }

  function closeUploadDialog() {
    if (!uploadState.uploading) el.uploadDialog.close();
  }

  function openUploadDialog() {
    closeContextMenu(false);
    setMobileMenu(false);
    if (el.uploadDialog.open) return;
    if (typeof el.uploadDialog.showModal === "function") el.uploadDialog.showModal();
    else el.uploadDialog.setAttribute("open", "");
  }

  function setMobileMenu(open) {
    el.mobileNav.hidden = !open;
    el.mobileMenuToggle.setAttribute("aria-expanded", String(open));
    el.mobileMenuToggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    el.mobileMenuToggle.title = open ? "关闭菜单" : "打开菜单";
  }

  function charDir(meta) {
    const first = meta.subcategories && meta.subcategories[0] ? meta.subcategories[0].file : "";
    const cut = first.indexOf("/") === -1 ? "" : first.slice(0, first.indexOf("/") + 1);
    return cut;
  }

  async function loadChar(meta) {
    const subEntries = await Promise.all(
      (meta.subcategories || []).map(async (sub) => {
        const items = await fetchJSON(CONFIG.dataBase + sub.file);
        return [sub.id, { meta: sub, items: Array.isArray(items) ? items : [] }];
      })
    );

    let tagsJson = {};
    try {
      const tagsPath = meta.tags
        ? CONFIG.dataBase + meta.tags
        : CONFIG.dataBase + charDir(meta) + "tags.json";
      tagsJson = await fetchJSON(tagsPath);
    } catch (err) {
      tagsJson = {};
    }

    const tagIndex = window.MemeSearch.buildTagIndex(tagsJson, state.tagDimensions);
    const subs = new Map();
    subEntries.forEach(([subId, sub]) => {
      sub.rows = window.MemeSearch.buildList(sub.items, tagIndex);
      subs.set(subId, sub);
    });

    let total = 0;
    subs.forEach((sub) => {
      total += sub.items.length;
    });

    return { meta, subs, tagIndex, total };
  }

  function currentChar() {
    return state.charId ? state.chars.get(state.charId) : null;
  }

  function currentSub() {
    const char = currentChar();
    if (!char || !state.subId) return null;
    return char.subs.get(state.subId) || null;
  }

  function activeTokens() {
    return window.MemeSearch.tokenize(state.query);
  }

  function matchTokens(row, tokens) {
    if (!tokens.length) return true;
    return tokens.every((token) => row.hay.indexOf(token) !== -1);
  }

  function matchFacets(row) {
    if (!state.selected.size) return true;
    for (const indexes of state.selected.values()) {
      if (!indexes.size) continue;
      let hit = false;
      for (const idx of indexes) {
        if (row.tags.has(idx)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    return true;
  }

  function filteredRows(char, sub) {
    const tokens = activeTokens();
    const withFacets = char === currentChar();
    return sub.rows.filter((row) => matchTokens(row, tokens) && (!withFacets || matchFacets(row)));
  }

  function charMatchedCount(char) {
    const tokens = activeTokens();
    const withFacets = char.meta.id === state.charId;
    let n = 0;
    char.subs.forEach((sub) => {
      sub.rows.forEach((row) => {
        if (matchTokens(row, tokens) && (!withFacets || matchFacets(row))) n += 1;
      });
    });
    return n;
  }

  function renderSidebar() {
    el.sidebarNav.innerHTML = state.manifest
      .map((meta) => {
        const data = state.chars.get(meta.id);
        const active = meta.id === state.charId ? " is-active" : "";
        const count = data ? charMatchedCount(data) : "…";
        return (
          '<a class="side-item' +
          active +
          '" href="#/' +
          esc(meta.id) +
          '" data-char="' +
          esc(meta.id) +
          '">' +
          '<span class="side-icon" aria-hidden="true">' +
          esc(meta.icon || "🍼") +
          "</span>" +
          '<span class="side-name">' +
          esc(meta.name) +
          "</span>" +
          '<span class="side-count" data-total="' +
          (data ? data.total : 0) +
          '">' +
          count +
          "</span>" +
          "</a>"
        );
      })
      .join("");
  }

  function renderTabs() {
    const char = currentChar();
    if (!char) {
      el.subTabs.innerHTML = "";
      return;
    }
    el.subTabs.innerHTML = char.meta.subcategories
      .map((sub) => {
        const data = char.subs.get(sub.id);
        const active = sub.id === state.subId ? " is-active" : "";
        const matched = data ? filteredRows(char, data).length : 0;
        return (
          '<button class="tab' +
          active +
          '" type="button" role="tab" aria-selected="' +
          (sub.id === state.subId) +
          '" data-sub="' +
          esc(sub.id) +
          '">' +
          esc(sub.name) +
          '<span class="tab-count">' +
          matched +
          "</span></button>"
        );
      })
      .join("");
  }

  function renderTagPanel() {
    const char = currentChar();
    if (!char || !char.tagIndex.cats.length) {
      el.tagPanel.innerHTML = "";
      return;
    }
    el.tagPanel.innerHTML = char.tagIndex.cats
      .map((cat) => {
        const activeSet = state.selected.get(cat.key) || new Set();
        const chips = cat.items
          .map((rec) => {
            const on = activeSet.has(rec.flat) ? " is-on" : "";
            return (
              '<button class="chip' +
              on +
              '" type="button" data-flat="' +
              rec.flat +
              '" data-cat="' +
              esc(cat.key) +
              '" aria-pressed="' +
              (on ? "true" : "false") +
              '">' +
              esc(rec.label) +
              "</button>"
            );
          })
          .join("");
        return (
          '<div class="tag-group"><span class="tag-group-label">' +
          esc(cat.label) +
          '</span><div class="chip-row">' +
          chips +
          "</div></div>"
        );
      })
      .join("");
  }

  function skeletonMarkup(count) {
    let out = "";
    for (let i = 0; i < count; i += 1) {
      out +=
        '<div class="skeleton"><div class="skeleton-media"></div>' +
        '<div class="skeleton-line"></div><div class="skeleton-line short"></div></div>';
    }
    return out;
  }

  function imageCardData(url, title) {
    const source = window.GhImg && window.GhImg.sourceDetails
      ? window.GhImg.sourceDetails(url)
      : null;
    return {
      originalUrl: window.GhImg ? window.GhImg.link(url) : url,
      imageTitle: title || "原图",
      sourceOwner: source ? source.owner : "",
      sourceOwnerUrl: source ? source.profileUrl : "",
      sourceFile: source ? source.url : ""
    };
  }

  function cardMarkup(item, charMeta, index) {
    const alt = item.title + " · " + charMeta.name;
    const sub = currentSub();
    const preview = window.GhImg && sub
      ? window.GhImg.preview(item.url, charMeta.id, sub.meta.id)
      : null;
    const legacyPreview = window.GhImg && sub
      ? window.GhImg.previewLegacy(item.url, charMeta.id, sub.meta.id)
      : null;
    const localFallback = typeof item.url === "string" && item.url.indexOf("assets/placeholders/") === 0
      ? item.url
      : CONFIG.fallback;
    const src = esc(preview || localFallback);
    const cardData = imageCardData(item.url, item.title);
    const link = esc(cardData.originalUrl);
    const tags = window.MemeSearch.labelsOf(
      window.MemeSearch.resolveRawTags(item.tags, currentChar().tagIndex),
      currentChar().tagIndex
    )
      .map((label) => '<span class="tag">' + esc(label) + "</span>")
      .join("");

    return (
      '<article class="card" style="--i:' +
      Math.min(index, STAGGER_CAP) +
      '" data-original-url="' +
      link +
      '" data-image-title="' +
      esc(item.title) +
      '" data-source-owner="' +
      esc(cardData.sourceOwner) +
      '" data-source-owner-url="' +
      esc(cardData.sourceOwnerUrl) +
      '" data-source-file="' +
      esc(cardData.sourceFile) +
      '">' +
      '<button class="card-open" type="button" aria-label="查看原图：' +
      esc(item.title) +
      '">' +
      ICON_ZOOM +
      "</button>" +
      '<div class="card-media"><img src="' +
      src +
      '"' +
      (legacyPreview && legacyPreview !== preview
        ? ' data-preview-legacy="' + esc(legacyPreview) + '"'
        : "") +
      ' alt="' +
      esc(alt) +
      '" loading="lazy" decoding="async"></div>' +
      '<div class="card-body"><div class="card-head">' +
      '<h3 class="card-title">' +
      esc(item.title) +
      "</h3>" +
      '<a class="btn btn-ghost icon-btn download-btn" href="' +
      link +
      '" download title="下载原图" aria-label="下载原图">' +
      ICON_DOWNLOAD +
      "</a></div>" +
      (tags ? '<div class="card-tags">' + tags + "</div>" : "") +
      "</div></article>"
    );
  }

  function pageNumbers(page, pageCount) {
    if (pageCount <= 7) {
      const all = [];
      for (let i = 1; i <= pageCount; i += 1) all.push(i);
      return all;
    }
    const pages = [1, pageCount];
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i += 1) {
      pages.push(i);
    }
    pages.sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    pages.forEach((p) => {
      if (prev && p - prev > 1) out.push("…");
      out.push(p);
      prev = p;
    });
    return out;
  }

  function pagerMarkup(page, pageCount, matched, rangeStart, rangeEnd) {
    const options = PAGE_SIZES.map(
      (size) =>
        '<option value="' +
        size +
        '"' +
        (size === state.pageSize ? " selected" : "") +
        ">" +
        size +
        "</option>"
    ).join("");

    const numbers = pageNumbers(page, pageCount)
      .map((p) => {
        if (p === "…") return '<span class="pager-ellipsis" aria-hidden="true">…</span>';
        const on = p === page ? " is-on" : "";
        return (
          '<button class="pager-btn pager-num' +
          on +
          '" type="button" data-page="' +
          p +
          '" aria-label="第 ' +
          p +
          ' 页"' +
          (p === page ? ' aria-current="page"' : "") +
          ">" +
          p +
          "</button>"
        );
      })
      .join("");

    return (
      '<div class="pager-info"><strong>' +
      matched +
      "</strong> 条结果 · 第 " +
      rangeStart +
      "-" +
      rangeEnd +
      ' 条</div>' +
      '<div class="pager-nav">' +
      '<button class="pager-btn" type="button" data-page="prev"' +
      (page <= 1 ? " disabled" : "") +
      ">‹ 上一页</button>" +
      numbers +
      '<button class="pager-btn" type="button" data-page="next"' +
      (page >= pageCount ? " disabled" : "") +
      ">下一页 ›</button>" +
      "</div>" +
      '<label class="pager-size">每页 <select class="page-size-select" aria-label="每页表情数">' +
      options +
      "</select>条</label>"
    );
  }

  function renderPager(matched, pageCount, rangeStart, rangeEnd) {
    const markup = pagerMarkup(state.page, pageCount, matched, rangeStart, rangeEnd);
    [el.pagerBottom].forEach((node) => {
      node.innerHTML = markup;
      node.hidden = matched === 0;
    });
  }

  function renderGrid() {
    const char = currentChar();
    const sub = currentSub();

    if (!char || !sub) {
      el.grid.innerHTML = "";
      el.resultCount.textContent = "—";
      el.pagerBottom.hidden = true;
      return;
    }

    const list = filteredRows(char, sub);
    const total = list.length;
    const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    if (state.page < 1) state.page = 1;

    const start = (state.page - 1) * state.pageSize;
    const pageItems = list.slice(start, start + state.pageSize).map((row) => row.item);
    const rangeStart = total === 0 ? 0 : start + 1;
    const rangeEnd = total === 0 ? 0 : start + pageItems.length;

    const filtering = state.query.trim() !== "" || state.selected.size > 0;
    el.clearFilters.hidden = !filtering;
    el.resultCount.textContent = "显示 " + total + " / " + sub.items.length;
    el.emptyState.hidden = total !== 0;

    el.grid.innerHTML = pageItems.map((item, i) => cardMarkup(item, char.meta, i)).join("");

    el.grid.querySelectorAll("img").forEach((img) => {
      if (window.GhImg) window.GhImg.decorate(img);
      if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
    });

    renderPager(total, pageCount, rangeStart, rangeEnd);
  }

  function renderIntro() {
    const char = currentChar();
    const desc = char && char.meta && char.meta.desc ? String(char.meta.desc) : "";
    if (!desc) {
      el.roleIntro.hidden = true;
      el.roleIntro.textContent = "";
      return;
    }
    el.roleIntro.hidden = false;
    el.roleIntro.textContent = (char.meta.icon ? char.meta.icon + " " : "") + desc;
  }

  function render() {
    renderSidebar();
    renderIntro();
    renderTabs();
    renderTagPanel();
    renderGrid();
  }

  function scrollToGallery() {
    const target = $("gallery");
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function ensureSelection() {
    if (!state.charId || !state.chars.has(state.charId)) {
      state.charId = state.manifest[0].id;
      state.subId = null;
    }
    const char = currentChar();
    if (!state.subId || !char.subs.has(state.subId)) {
      state.subId = char.meta.subcategories[0].id;
    }
  }

  function applyRoute() {
    if (!state.manifest.length) return;

    const raw = location.hash.slice(1);
    // 普通锚点（如 #gallery、#contribute）只负责页面内滚动，不改变当前角色。
    if (!raw.startsWith("/")) {
      ensureSelection();
      render();
      return;
    }

    const parts = raw.replace(/^\//, "").split("/").filter(Boolean);

    let charId = parts[0];
    if (!charId || !state.chars.has(charId)) charId = state.manifest[0].id;
    const char = state.chars.get(charId);

    let subId = parts[1];
    if (!subId || !char.subs.has(subId)) subId = char.meta.subcategories[0].id;

    const charChanged = charId !== state.charId;
    const subChanged = subId !== state.subId;
    if (charChanged) state.selected.clear();
    if (charChanged || subChanged) state.page = 1;

    state.charId = charId;
    state.subId = subId;

    if (raw !== "/" + charId + "/" + subId) {
      try {
        history.replaceState(null, "", "#/" + charId + "/" + subId);
      } catch (err) {
      }
    }

    render();
  }

  function resetFilters() {
    state.query = "";
    state.selected.clear();
    state.page = 1;
    el.searchInput.value = "";
    render();
  }

  function toggleChip(flat, catKey) {
    const set = state.selected.get(catKey) || new Set();
    if (set.has(flat)) set.delete(flat);
    else set.add(flat);
    if (set.size) state.selected.set(catKey, set);
    else state.selected.delete(catKey);
    state.page = 1;
    render();
  }

  function goToPage(target) {
    const sub = currentSub();
    if (!sub) return;
    const list = filteredRows(currentChar(), sub);
    const pageCount = Math.max(1, Math.ceil(list.length / state.pageSize));
    let next = state.page;
    if (target === "prev") next = state.page - 1;
    else if (target === "next") next = state.page + 1;
    else next = Number(target);
    if (!Number.isFinite(next)) return;
    next = Math.min(Math.max(next, 1), pageCount);
    if (next === state.page) return;
    state.page = next;
    renderGrid();
    scrollToGallery();
  }

  function applySearch() {
    state.query = el.searchInput.value.trim();
    state.page = 1;
    render();
    scrollToGallery();
  }

  function markBroken(img) {
    const media = img.closest(".card-media");
    if (!media) return;
    img.remove();
    media.classList.add("is-broken");
    media.innerHTML = "<span>图裂了 · broken link</span>";
  }

  async function downloadOriginal(url) {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    const path = new URL(url).pathname;
    download.href = objectUrl;
    download.download = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || "meme";
    document.body.appendChild(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function markdownOf(target) {
    const alt = String(target.title || "").replace(/\s+/g, " ").replace(/[[\]]/g, "\\$&").trim();
    return "![" + (alt || "表情") + "](" + target.url + ")";
  }

  function legacyCopy(text, stage) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
    stage.appendChild(area);
    let ok = false;
    try {
      area.select();
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  async function copyText(text, stage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
      }
    }
    return legacyCopy(text, stage || document.body);
  }

  function buildContextMenu() {
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctxMenu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "图片操作");
    menu.innerHTML = CTX_ACTIONS.map(
      (item) =>
        '<button class="ctx-item" type="button" role="menuitem" tabindex="-1" data-action="' +
        esc(item.action) +
        '"><span class="ctx-icon" aria-hidden="true">' +
        item.icon +
        '</span><span class="ctx-label">' +
        esc(item.label) +
        "</span></button>"
    ).join("");
    document.body.appendChild(menu);
    return menu;
  }

  function imageTargetOf(node) {
    if (!node || node.nodeType !== 1) return null;
    const card = node.closest(".card");
    if (card && card.dataset.originalUrl) {
      return {
        url: card.dataset.originalUrl,
        title: card.dataset.imageTitle || "",
        anchor: card.querySelector(".card-open") || card
      };
    }
    const dialogImage = node.closest("#imageDialogImage");
    if (dialogImage && dialogImage.dataset.originalUrl) {
      return {
        url: dialogImage.dataset.originalUrl,
        title: dialogImage.dataset.imageTitle || "",
        // 图片本身不可聚焦，键盘焦点交回弹窗内的关闭按钮，避免落到 inert 的 body 上。
        anchor: el.imageDialogClose || dialogImage
      };
    }
    return null;
  }

  function focusQuietly(node) {
    if (!node) return;
    try {
      node.focus({ preventScroll: true });
    } catch (err) {
      node.focus();
    }
  }

  function contextPoint(event, anchor) {
    if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
    const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    return rect ? { x: rect.left, y: rect.bottom } : { x: CTX_MARGIN, y: CTX_MARGIN };
  }

  function openContextMenu(event, target) {
    const menu = el.ctxMenu;
    const host = el.imageDialog.open ? el.imageDialog : document.body;
    if (menu.parentNode !== host) host.appendChild(menu);

    context.url = target.url;
    context.title = target.title;
    context.anchor = target.anchor;
    menu.hidden = false;

    const point = contextPoint(event, target.anchor);
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const maxLeft = Math.max(CTX_MARGIN, window.innerWidth - CTX_MARGIN - width);
    const maxTop = Math.max(CTX_MARGIN, window.innerHeight - CTX_MARGIN - height);
    menu.style.left = Math.round(Math.min(Math.max(point.x, CTX_MARGIN), maxLeft)) + "px";
    menu.style.top = Math.round(Math.min(Math.max(point.y, CTX_MARGIN), maxTop)) + "px";

    const first = menu.querySelector(".ctx-item");
    if (first) focusQuietly(first);
  }

  function closeContextMenu(restoreFocus) {
    const menu = el.ctxMenu;
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const anchor = context.anchor;
    context.url = "";
    context.title = "";
    context.anchor = null;
    if (restoreFocus && anchor && document.contains(anchor)) focusQuietly(anchor);
  }

  async function runContextAction(action) {
    const target = { url: context.url, title: context.title };
    const stage = el.ctxMenu.parentNode || document.body;
    closeContextMenu(true);
    if (!target.url) return;

    if (action === "download") {
      try {
        await downloadOriginal(target.url);
        toast("原图下载已开始");
      } catch (err) {
        window.open(target.url, "_blank", "noopener,noreferrer");
        toast("无法直接下载，已在新窗口打开原图");
      }
      return;
    }

    const text = action === "copy-markdown" ? markdownOf(target) : target.url;
    if (await copyText(text, stage)) {
      toast(action === "copy-markdown" ? "已复制 Markdown" : "已复制图片 URL");
    } else {
      window.prompt("复制失败，请手动复制：", text);
    }
  }

  function moveMenuFocus(step) {
    const items = Array.prototype.slice.call(el.ctxMenu.querySelectorAll(".ctx-item"));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const index =
      step === "first"
        ? 0
        : step === "last"
          ? items.length - 1
          : (current + step + items.length) % items.length;
    focusQuietly(items[index]);
  }

  function menuKeydown(event) {
    if (event.key === "Escape") {
      // 让 Esc 只关掉菜单：阻止事件继续冒泡并取消默认行为，模态弹窗因此不会一起关闭。
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu(true);
      return;
    }
    if (event.key === "Tab") {
      closeContextMenu(true);
      return;
    }
    const moves = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: "first",
      End: "last"
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    moveMenuFocus(moves[event.key]);
  }

  function showOriginalImage(card) {
    if (!card || !card.dataset) return;
    const url = card.dataset.originalUrl || "";
    if (!url) return;
    if (typeof el.imageDialog.showModal !== "function") {
      window.open(url, "_blank", "noopener noreferrer");
      return;
    }

    const name = card.dataset.imageTitle || "原图";
    const sourceFile = card.dataset.sourceFile || "";
    const sourceOwner = card.dataset.sourceOwner || "";
    const image = el.imageDialogImage;
    el.imageDialogTitle.textContent = name;
    el.imageDialogOwner.textContent = sourceOwner;
    el.imageDialogOwner.href = card.dataset.sourceOwnerUrl || "#";
    el.imageDialogOwner.hidden = !sourceOwner;
    el.imageDialogSourceLink.href = sourceFile || "#";
    el.imageDialogSource.hidden = !sourceFile;
    el.imageDialogDownload.href = url;
    el.imageDialogDownload.hidden = !url;
    image.alt = name;
    image.dataset.originalUrl = url;
    image.dataset.imageTitle = name;
    image.hidden = false;
    el.imageDialogStatus.textContent = "正在加载原图…";
    el.imageDialogStatus.hidden = false;
    delete image._gh;
    image.src = url;
    if (window.GhImg) window.GhImg.decorate(image);
    el.imageDialog.showModal();
  }

  // 从当前（可能被搜索/标签筛选过的）结果里随机抽一张打开。
  function randomMeme() {
    const char = currentChar();
    const sub = currentSub();
    if (!char || !sub) {
      toast("数据还在加载，稍候再试");
      return;
    }
    const list = filteredRows(char, sub);
    if (!list.length) {
      toast("当前筛选下没有表情，先清除筛选试试");
      return;
    }
    const row = list[Math.floor(Math.random() * list.length)];
    const card = { dataset: imageCardData(row.item.url, row.item.title) };
    showOriginalImage(card);
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      return;
    }
  }

  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    storageSet("nai-theme", mode);
    const icons = { auto: "🌗", light: "☀️", dark: "🌙" };
    const names = { auto: "主题：跟随系统", light: "主题：浅色", dark: "主题：深色" };
    el.themeIcon.textContent = icons[mode] || icons.auto;
    el.themeToggle.title = names[mode] || names.auto;
    el.themeToggle.setAttribute("aria-label", names[mode] || names.auto);
  }

  function cycleTheme() {
    const order = ["auto", "dark", "light"];
    const next = order[(order.indexOf(document.documentElement.dataset.theme) + 1) % order.length];
    applyTheme(next);
    toast("已切换主题：" + ({ auto: "跟随系统", dark: "深色", light: "浅色" })[next]);
  }

  function formatStars(n) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
  }

  // 从 GitHub API 拉取仓库 Star 数，本地缓存 1 小时；失败时按钮保持显示 "Star"。
  function loadStars() {
    const node = $("starCount");
    if (!node || !/^https?:$/.test(location.protocol)) return;
    const api = CONFIG.repo.replace("https://github.com/", "https://api.github.com/repos/");
    if (api === CONFIG.repo) return;

    let cached = null;
    try {
      cached = JSON.parse(storageGet("nai-stars") || "null");
    } catch (err) {
      cached = null;
    }
    if (cached && typeof cached.n === "number" && Date.now() - cached.at < 3600000) {
      node.textContent = formatStars(cached.n);
      return;
    }

    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : 0;
    fetch(api, ctrl ? { signal: ctrl.signal } : {})
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((data) => {
        if (typeof data.stargazers_count !== "number") return;
        node.textContent = formatStars(data.stargazers_count);
        storageSet("nai-stars", JSON.stringify({ n: data.stargazers_count, at: Date.now() }));
      })
      .catch(() => {})
      .then(() => clearTimeout(timer));
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function countUp(node, target, delay) {
    if (!node) return;
    const value = Number(target) || 0;
    if (prefersReducedMotion()) {
      node.textContent = value;
      return;
    }
    const duration = 1200;
    const start = performance.now() + (delay || 0);
    node.textContent = "0";
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(value * eased);
      if (t < 1) requestAnimationFrame(step);
      else node.textContent = value;
    };
    requestAnimationFrame(step);
  }

  function renderStats() {
    let items = 0;
    let tags = 0;
    state.chars.forEach((char) => {
      items += char.total;
      tags += char.tagIndex.size;
    });
    countUp($("statItems"), items, 0);
    countUp($("statChars"), state.manifest.length, 120);
    countUp($("statTags"), tags, 240);
  }

  function setupReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;
    if (typeof IntersectionObserver !== "function") {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    nodes.forEach((node, i) => {
      node.style.setProperty("--d", (i % 5) * 70 + "ms");
      observer.observe(node);
    });
  }

  function easterEggSource() {
    if (state.charId === "naidan") return EASTER_EGG.naidanSrc;
    if (state.charId === "naiwa") {
      const sources = EASTER_EGG.naiwaSources;
      return sources[Math.floor(Math.random() * sources.length)];
    }
    return EASTER_EGG.defaultSrc;
  }

  function primeEasterEgg(src) {
    if (eggAudio || typeof Audio !== "function") return;
    try {
      eggAudio = new Audio(src || EASTER_EGG.defaultSrc);
      eggAudioSrc = src || EASTER_EGG.defaultSrc;
      eggAudio.preload = "auto";
      eggAudio.volume = EASTER_EGG.volume;
      // 提前缓冲，首次触发听不出加载延迟。
      eggAudio.load();
    } catch (err) {
      eggAudio = null;
      eggAudioSrc = "";
    }
  }

  // 彩蛋：不弹提示、不打断操作，播放失败也保持静默。
  function playEasterEgg() {
    const src = easterEggSource();
    if (eggAudioSrc !== src) {
      if (eggAudio) {
        try {
          eggAudio.pause();
          eggAudio.src = "";
        } catch (err) {
        }
      }
      eggAudio = null;
      eggAudioSrc = "";
    }
    primeEasterEgg(src);
    if (!eggAudio) return;
    try {
      eggAudio.currentTime = 0;
      const playback = eggAudio.play();
      if (playback && typeof playback.catch === "function") playback.catch(() => {});
    } catch (err) {
    }
  }

  function bindEvents() {
    window.addEventListener("hashchange", applyRoute);

    document.querySelectorAll("[data-upload-trigger]").forEach((button) => {
      button.addEventListener("click", openUploadDialog);
    });
    el.uploadChoose.addEventListener("click", () => el.uploadInput.click());
    el.uploadInput.addEventListener("change", selectUploadFiles);
    el.uploadSubmit.addEventListener("click", startUpload);
    el.uploadCancel.addEventListener("click", closeUploadDialog);
    el.uploadDialogClose.addEventListener("click", closeUploadDialog);
    el.uploadDialog.addEventListener("cancel", (event) => {
      if (uploadState.uploading) event.preventDefault();
    });
    el.uploadDialog.addEventListener("click", (event) => {
      if (event.target !== el.uploadDialog) return;
      const rect = el.uploadDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeUploadDialog();
    });
    el.uploadList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-upload-remove]");
      if (!button || uploadState.uploading) return;
      const index = Number(button.dataset.uploadRemove);
      const entry = uploadState.entries[index];
      if (entry.preview) URL.revokeObjectURL(entry.preview);
      uploadState.entries.splice(index, 1);
      renderUploadList();
      setUploadProgress(0, 0, uploadState.entries.length, "等待上传");
    });
    el.uploadDialog.addEventListener("close", () => {
      releaseUploadFiles();
      el.uploadInput.value = "";
      el.uploadCancel.textContent = "取消";
      renderUploadList();
      setUploadProgress(0, 0, 0, "等待选择图片");
    });

    el.mobileMenuToggle.addEventListener("click", () => setMobileMenu(el.mobileNav.hidden));
    el.mobileNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMobileMenu(false);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!el.mobileNav.hidden && !el.mobileNav.contains(event.target) && !el.mobileMenuToggle.contains(event.target)) setMobileMenu(false);
    });
    window.matchMedia("(max-width: 1011px)").addEventListener("change", () => setMobileMenu(false));

    el.subTabs.addEventListener("click", (event) => {
      const btn = event.target.closest(".tab");
      if (!btn) return;
      location.hash = "#/" + state.charId + "/" + btn.dataset.sub;
    });

    el.sidebarNav.addEventListener("click", (event) => {
      const link = event.target.closest(".side-item");
      if (!link) return;
      if (location.hash === "#/" + link.dataset.char) applyRoute();
    });

    el.tagPanel.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      toggleChip(Number(chip.dataset.flat), chip.dataset.cat);
    });

    [el.pagerBottom].forEach((node) => {
      node.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-page]");
        if (!btn || btn.disabled) return;
        goToPage(btn.dataset.page);
      });
      node.addEventListener("change", (event) => {
        const select = event.target.closest(".page-size-select");
        if (!select) return;
        const size = Number(select.value);
        if (!PAGE_SIZES.includes(size)) return;
        state.pageSize = size;
        state.page = 1;
        storageSet("nai-page-size", String(size));
        renderGrid();
        scrollToGallery();
      });
    });

    el.grid.addEventListener(
      "error",
      (event) => {
        const img = event.target;
        if (!img || img.tagName !== "IMG") return;
        if (window.GhImg && window.GhImg.advance(img)) return;
        if (img.dataset.fallback) {
          markBroken(img);
          return;
        }
        img.dataset.fallback = "1";
        img.src = CONFIG.fallback;
      },
      true
    );

    el.grid.addEventListener(
      "load",
      (event) => {
        const img = event.target;
        if (img && img.tagName === "IMG") img.classList.add("is-loaded");
      },
      true
    );

    el.grid.addEventListener("click", async (event) => {
      const link = event.target.closest(".download-btn");
      if (link) {
        event.preventDefault();
        try {
          await downloadOriginal(link.href);
          toast("原图下载已开始");
        } catch (err) {
          window.open(link.href, "_blank", "noopener,noreferrer");
          toast("无法直接下载，已在新窗口打开原图");
        }
        return;
      }
      const openButton = event.target.closest(".card-open");
      if (openButton) showOriginalImage(openButton.closest(".card"));
    });

    document.addEventListener("contextmenu", (event) => {
      const target = imageTargetOf(event.target);
      if (!target) return;
      event.preventDefault();
      openContextMenu(event, target);
    });

    // 页面任意位置右键都有机会触发彩蛋，和图片菜单互不影响。
    document.addEventListener("contextmenu", () => {
      if (Math.random() < EASTER_EGG.chance) playEasterEgg();
    });

    el.ctxMenu.addEventListener("click", (event) => {
      const item = event.target.closest(".ctx-item");
      if (item) runContextAction(item.dataset.action);
    });

    el.ctxMenu.addEventListener("keydown", menuKeydown);

    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!el.ctxMenu.hidden && !el.ctxMenu.contains(event.target)) closeContextMenu(false);
      },
      true
    );

    document.addEventListener("scroll", () => closeContextMenu(false), true);
    window.addEventListener("resize", () => closeContextMenu(false));
    window.addEventListener("blur", () => closeContextMenu(false));

    el.imageDialogClose.addEventListener("click", () => el.imageDialog.close());
    el.imageDialogDownload.addEventListener("click", async (event) => {
      event.preventDefault();
      const url = el.imageDialogDownload.href;
      if (!url || url === "#") return;
      try {
        await downloadOriginal(url);
        toast("原图下载已开始");
      } catch (err) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast("无法直接下载，已在新窗口打开原图");
      }
    });
    el.imageDialog.addEventListener("click", (event) => {
      if (event.target === el.imageDialog) el.imageDialog.close();
    });
    el.imageDialog.addEventListener("close", () => {
      closeContextMenu(false);
      if (el.ctxMenu.parentNode !== document.body) document.body.appendChild(el.ctxMenu);
      el.imageDialogImage.removeAttribute("src");
      el.imageDialogImage.removeAttribute("data-original-url");
      el.imageDialogImage.removeAttribute("data-image-title");
      el.imageDialogSource.hidden = true;
      el.imageDialogOwner.textContent = "";
      el.imageDialogOwner.hidden = true;
      el.imageDialogOwner.removeAttribute("href");
      el.imageDialogSourceLink.removeAttribute("href");
      el.imageDialogDownload.hidden = true;
      el.imageDialogDownload.removeAttribute("href");
      delete el.imageDialogImage._gh;
      el.imageDialogImage.hidden = false;
      el.imageDialogStatus.textContent = "正在加载原图…";
      el.imageDialogStatus.hidden = true;
    });
    el.imageDialogImage.addEventListener("load", () => {
      el.imageDialogStatus.hidden = true;
    });
    el.imageDialogImage.addEventListener("error", (event) => {
      const image = event.currentTarget;
      if (window.GhImg && window.GhImg.advance(image)) return;
      image.hidden = true;
      el.imageDialogStatus.textContent = "原图加载失败";
      el.imageDialogStatus.hidden = false;
    });

    el.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      applySearch();
    });

    // 输入即筛选（轻微防抖），回车仍会滚动到表情库。
    let searchTimer = 0;
    el.searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = el.searchInput.value.trim();
        state.page = 1;
        render();
      }, 140);
    });

    el.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        el.searchInput.value = "";
        state.query = "";
        state.page = 1;
        render();
        el.searchInput.blur();
      }
    });

    el.clearFilters.addEventListener("click", resetFilters);
    el.emptyReset.addEventListener("click", resetFilters);
    el.retryBtn.addEventListener("click", () => location.reload());
    el.themeToggle.addEventListener("click", cycleTheme);
    el.randomBtn.addEventListener("click", randomMeme);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !el.mobileNav.hidden) {
        setMobileMenu(false);
        focusQuietly(el.mobileMenuToggle);
      }
      if (el.uploadDialog.open || el.imageDialog.open) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        event.preventDefault();
        el.searchInput.focus();
        el.searchInput.select();
      }
    });
  }

  async function init() {
    el.searchForm = $("searchForm");
    el.searchInput = $("searchInput");
    el.randomBtn = $("randomBtn");
    el.roleIntro = $("roleIntro");
    el.sidebarNav = $("sidebarNav");
    el.subTabs = $("subTabs");
    el.tagPanel = $("tagPanel");
    el.grid = $("grid");
    el.pagerBottom = $("pagerBottom");
    el.resultCount = $("resultCount");
    el.clearFilters = $("clearFilters");
    el.emptyState = $("emptyState");
    el.emptyReset = $("emptyReset");
    el.errorState = $("errorState");
    el.errorMsg = $("errorMsg");
    el.retryBtn = $("retryBtn");
    el.toast = $("toast");
    el.themeToggle = $("themeToggle");
    el.themeIcon = $("themeIcon");
    el.mobileMenuToggle = $("mobileMenuToggle");
    el.mobileNav = $("mobileNav");
    el.uploadDialog = $("uploadDialog");
    el.uploadDialogClose = $("uploadDialogClose");
    el.uploadChoose = $("uploadChoose");
    el.uploadInput = $("uploadInput");
    el.uploadSelection = $("uploadSelection");
    el.uploadList = $("uploadList");
    el.uploadProgressStatus = $("uploadProgressStatus");
    el.uploadProgressCount = $("uploadProgressCount");
    el.uploadProgressTrack = $("uploadProgressTrack");
    el.uploadProgressBar = $("uploadProgressBar");
    el.uploadSubmit = $("uploadSubmit");
    el.uploadCancel = $("uploadCancel");
    el.imageDialog = $("imageDialog");
    el.imageDialogTitle = $("imageDialogTitle");
    el.imageDialogSource = $("imageDialogSource");
    el.imageDialogOwner = $("imageDialogOwner");
    el.imageDialogSourceLink = $("imageDialogSourceLink");
    el.imageDialogDownload = $("imageDialogDownload");
    el.imageDialogImage = $("imageDialogImage");
    el.imageDialogStatus = $("imageDialogStatus");
    el.imageDialogClose = $("imageDialogClose");
    el.ctxMenu = buildContextMenu();

    const storedSize = Number(storageGet("nai-page-size"));
    if (PAGE_SIZES.includes(storedSize)) state.pageSize = storedSize;

    applyRepoLinks();
    applyTheme(storageGet("nai-theme") || "auto");
    if (window.GhImg) {
      window.GhImg.configure({ repo: CONFIG.repo });
      window.GhImg.decorate(document.querySelectorAll(".hero-visual img"));
      window.GhImg.start();
    }
    bindEvents();
    primeEasterEgg();
    setupReveal();
    loadStars();
    el.grid.innerHTML = skeletonMarkup(8);

    try {
      const [manifest, tagDimensions] = await Promise.all([
        fetchJSON(CONFIG.dataBase + "manifest.json"),
        fetchJSON(CONFIG.tagDimensions)
      ]);
      if (!Array.isArray(manifest) || !manifest.length) throw new Error("manifest 为空");

      state.manifest = manifest;
      state.tagDimensions = tagDimensions;
      const loaded = await Promise.all(manifest.map((meta) => loadChar(meta)));
      loaded.forEach((data) => state.chars.set(data.meta.id, data));

      renderStats();
      applyRoute();
    } catch (err) {
      el.grid.innerHTML = "";
      el.pagerBottom.hidden = true;
      el.errorState.hidden = false;
      el.errorMsg.textContent = "数据加载失败：" + (err && err.message ? err.message : err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
