(function () {
  "use strict";

  const CONFIG = {
    repo: "https://github.com/lin-alg/NaiLoong",
    dataBase: "data/",
    tagDimensions: "data/tag-translations.json",
    fallback: "assets/placeholders/fallback.gif",
    petData: "data/pet.json",
    uploadUrl: "https://wplace-gallery.linalg.tech/api/images/upload"
  };

  const PAGE_SIZES = [4, 8, 16, 32, 64];
  const DEFAULT_PAGE_SIZE = 8;
  const FAVORITES_KEY = "nai-favorites";
  const STAGGER_CAP = 14;
  const INTRO_SFX_VOLUME = 2.5; // 1 为基准
  const INTRO_FEAR = { src: "assets/audio/hola_ganbadie.mp3", duration: 0.9 };
  const MAX_UPLOAD_FILES = 10;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const UPLOAD_EXTENSIONS = /\.(?:jpe?g|png|gif|webp)$/i;

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
    pageSize: DEFAULT_PAGE_SIZE,
    favorites: [],
    favoritesView: false
  };
  const uploadState = {
    entries: [],
    uploading: false
  };
  const cache = new Map();
  const context = { url: "", title: "", anchor: null };
  let voiceAudio = null;
  let voiceAudioSrc = "";
  let voicePlaying = "";
  let voiceSource = null;
  let voiceStopTimer = 0;
  let voiceRequest = 0;
  let voiceEnded = null;
  const voiceBuffers = new Map();
  const voiceMedia = new Map();
  let introAudioPlayed = false;
  let collisionAudioContext = null;
  let collisionResumePromise = null;
  let lastIntroCollisionAt = 0;
  let lastIntroTypeAt = 0;
  let sidebarHintReady = false;
  let homeAssetsReady = Promise.resolve();
  let heroImagesReady = Promise.resolve(false);
  let petAnimationData = null;
  const menuSpriteFrames = new WeakMap();

  const THEME_NAMES = { auto: "跟随系统", light: "浅色", dark: "深色", naiwa: "奶蛙" };
  const THEME_ICONS = {
    auto: "lucide:sun-moon",
    light: "lucide:sun",
    dark: "lucide:moon",
    naiwa: "tabler:baby-bottle"
  };
  const FALLBACK_ICON = "tabler:baby-bottle";
  // icons.js 没加载时按空图标处理，页面其余功能不受影响。
  const ICONS = window.NaiIcons || { svg: () => "", markup: () => "", hydrate: () => {} };
  const EASTER_EGG = {
    fallbackSrc: "assets/audio/nailong_laugh.mp3",
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(path, { cache: "no-cache", signal: controller.signal });
        if (!res.ok) throw new Error(path + " → HTTP " + res.status);
        const data = await res.json();
        cache.set(path, data);
        return data;
      } catch (err) {
        // 并行预载时遇到临时断连可以重试；HTTP 错误、无效 JSON 和超时正常报错。
        if (err.name !== "TypeError" || attempt === 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      } finally { clearTimeout(timer); }
    }
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
      : "支持JPG、PNG、GIF格式";
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
    syncPetPause();
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

  async function loadVoice(meta) {
    if (!meta || !meta.voice) return [];
    let items;
    try {
      items = await fetchJSON(CONFIG.dataBase + meta.voice);
    } catch (err) {
      return [];
    }
    if (!Array.isArray(items)) return [];
    const sources = items.filter((item) => item && typeof item.src === "string" && item.src.trim());
    sources.forEach((item) => preloadVoice(item.src));
    return sources;
  }

  function voiceMetaFor(meta, manifest) {
    if (!meta || meta.voice || meta.id === "naidan") return meta;
    return manifest.find((item) => item.id === "naiwa") || meta;
  }

  async function loadChar(meta) {
    const [subEntries, voice] = await Promise.all([
      Promise.all(
        (meta.subcategories || []).map(async (sub) => {
          const items = await fetchJSON(CONFIG.dataBase + sub.file);
          return [sub.id, { meta: sub, items: Array.isArray(items) ? items : [] }];
        })
      ),
      loadVoice(voiceMetaFor(meta, state.manifest))
    ]);

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

    return { meta, subs, tagIndex, total, voice };
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
          ICONS.markup(meta.icon || FALLBACK_ICON, 16) +
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
    updateSidebarHint();
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

  function imageCardData(url, title, tags) {
    const source = window.GhImg && window.GhImg.sourceDetails
      ? window.GhImg.sourceDetails(url)
      : null;
    return {
      originalUrl: window.GhImg ? window.GhImg.link(url) : url,
      imageTitle: title || "原图",
      imageTags: JSON.stringify(Array.isArray(tags) ? tags : []),
      sourceOwner: source ? source.owner : "",
      sourceOwnerUrl: source ? source.profileUrl : "",
      sourceFile: source ? source.url : ""
    };
  }

  function favoriteId(entry) {
    return JSON.stringify([entry.charId, entry.subId, entry.url, entry.title]);
  }

  function saveFavorites() {
    storageSet(FAVORITES_KEY, JSON.stringify(state.favorites));
  }

  function toggleFavorite(card) {
    const entry = {
      charId: card.dataset.charId,
      charName: card.dataset.charName,
      subId: card.dataset.subId,
      url: card.dataset.favoriteUrl,
      title: card.dataset.imageTitle,
      tags: JSON.parse(card.dataset.favoriteTags || "[]"),
      displayTags: JSON.parse(card.dataset.imageTags || "[]")
    };
    const id = favoriteId(entry);
    const existing = state.favorites.findIndex((favorite) => favoriteId(favorite) === id);
    if (existing >= 0) state.favorites.splice(existing, 1);
    else state.favorites.push(entry);
    saveFavorites();
    if (state.favoritesView) renderGrid();
    else {
      const button = card.querySelector("[data-favorite-toggle]");
      const on = existing < 0;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", String(on));
      button.setAttribute("aria-label", (on ? "取消收藏：" : "收藏：") + entry.title);
      button.title = on ? "取消收藏" : "添加到收藏夹";
    }
  }

  function cardMarkup(item, charMeta, index) {
    const alt = item.title + " · " + charMeta.name;
    const subId = item.subId || (currentSub() && currentSub().meta.id) || "";
    const sub = charMeta.subcategories && charMeta.subcategories.find((entry) => entry.id === subId);
    const favorite = { charId: charMeta.id, subId, url: item.url, title: item.title };
    const favoriteKey = favoriteId(favorite);
    const isFavorite = state.favorites.some((entry) => favoriteId(entry) === favoriteKey);
    const preview = window.GhImg && sub
      ? window.GhImg.preview(item.url, charMeta.id, sub.id)
      : null;
    const legacyPreview = window.GhImg && sub
      ? window.GhImg.previewLegacy(item.url, charMeta.id, sub.id)
      : null;
    const localFallback = typeof item.url === "string" && item.url.indexOf("assets/placeholders/") === 0
      ? (window.GhImg ? window.GhImg.compressedAsset(item.url) : item.url)
      : (window.GhImg ? window.GhImg.compressedAsset(CONFIG.fallback) : CONFIG.fallback);
    const src = esc(preview || localFallback);
    const char = state.chars.get(charMeta.id);
    const labels = Array.isArray(item.displayTags) ? item.displayTags : window.MemeSearch.labelsOf(
      window.MemeSearch.resolveRawTags(item.tags, char.tagIndex),
      char.tagIndex
    );
    const cardData = imageCardData(item.url, item.title, labels);
    const link = esc(cardData.originalUrl);

    return (
      '<article class="card" style="--i:' +
      Math.min(index, STAGGER_CAP) +
      '" data-original-url="' +
      link +
      '" data-image-title="' +
      esc(item.title) +
      '" data-image-tags="' +
      esc(cardData.imageTags) +
      '" data-source-owner="' +
      esc(cardData.sourceOwner) +
      '" data-source-owner-url="' +
      esc(cardData.sourceOwnerUrl) +
      '" data-source-file="' +
      esc(cardData.sourceFile) +
      '" data-favorite-id="' + esc(favoriteKey) +
      '" data-char-id="' + esc(charMeta.id) +
      '" data-char-name="' + esc(charMeta.name) +
      '" data-sub-id="' + esc(subId) +
      '" data-favorite-url="' + esc(item.url) +
      '" data-favorite-tags="' + esc(JSON.stringify(Array.isArray(item.tags) ? item.tags : [])) +
      '">' +
      '<button class="card-open" type="button" aria-label="查看原图：' +
      esc(item.title) +
      '">' +
      ICON_ZOOM +
      "</button>" +
      '<div class="card-media"><img data-original-url="' +
      link +
      '" src="' +
      src +
      '"' +
      (legacyPreview && legacyPreview !== preview
        ? ' data-preview-legacy="' + esc(legacyPreview) + '"'
        : "") +
      ' alt="' +
      esc(alt) +
      '" loading="' + (document.documentElement.classList.contains("home-intro-active") ? "eager" : "lazy") + '" decoding="async"></div>' +
      '<div class="card-body"><div class="card-head">' +
      '<h3 class="card-title">' +
      esc(item.title) +
      "</h3>" +
      '<a class="btn btn-ghost icon-btn download-btn" href="' +
      link +
      '" download title="下载原图" aria-label="下载原图">' +
      ICON_DOWNLOAD +
      "</a>" +
      '<button class="btn btn-ghost icon-btn favorite-btn' + (isFavorite ? " is-on" : "") + '" type="button" data-favorite-toggle aria-pressed="' + isFavorite + '" aria-label="' + (isFavorite ? "取消收藏：" : "收藏：") + esc(item.title) + '" title="' + (isFavorite ? "取消收藏" : "添加到收藏夹") + '">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.75 1.94 3.93 4.34.63-3.14 3.06.74 4.32L8 11.65l-3.88 2.04.74-4.32L1.72 6.31l4.34-.63L8 1.75Z"/></svg></button>' +
      "</div>" +
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
    if (state.favoritesView) {
      renderFavorites();
      return;
    }
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
    el.emptyState.querySelector(".empty-icon").innerHTML = ICONS.markup("lucide:search", 40);
    el.emptyState.querySelector("h3").textContent = "没找到匹配的表情";
    el.emptyState.querySelector("p").textContent = "换个关键词，或者点掉几个标签试试。";
    el.emptyState.hidden = total !== 0;

    el.grid.innerHTML = pageItems.map((item, i) => cardMarkup(item, char.meta, i)).join("");

    el.grid.querySelectorAll("img").forEach((img) => {
      if (window.GhImg) window.GhImg.decorate(img);
      if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
    });

    renderPager(total, pageCount, rangeStart, rangeEnd);
  }

  function renderFavorites() {
    const entries = state.favorites.map((favorite) => {
      const char = state.chars.get(favorite.charId);
      if (!char) return null;
      return {
        char: char.meta,
        item: {
          url: favorite.url,
          title: favorite.title,
          tags: favorite.tags,
          displayTags: favorite.displayTags,
          subId: favorite.subId
        }
      };
    }).filter(Boolean);
    el.roleIntro.hidden = true;
    el.subTabs.hidden = true;
    el.tagPanel.hidden = true;
    el.randomBtn.hidden = true;
    el.clearFilters.hidden = true;
    el.favoritesHeading.hidden = false;
    el.favoritesCount.textContent = entries.length + " 张表情";
    el.resultCount.textContent = "收藏 " + entries.length + " 张";
    el.emptyState.hidden = entries.length !== 0;
    el.emptyState.querySelector(".empty-icon").innerHTML = ICONS.markup("lucide:star", 40);
    el.emptyState.querySelector("h3").textContent = "还没有收藏的表情";
    el.emptyState.querySelector("p").textContent = "在表情卡片上点星星，就能把喜欢的表情放进收藏夹。";
    el.emptyReset.hidden = true;
    el.grid.innerHTML = entries.map(({ char, item }, index) => cardMarkup(item, char, index)).join("");
    el.grid.querySelectorAll("img").forEach((img) => {
      if (window.GhImg) window.GhImg.decorate(img);
      if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
    });
    el.pagerBottom.hidden = true;
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
    const iconHtml = ICONS.markup(char.meta.icon || "", 16);
    el.roleIntro.innerHTML = (iconHtml ? iconHtml + " " : "") + esc(desc);
  }

  function render() {
    if (state.favoritesView) {
      renderGrid();
      return;
    }
    el.favoritesHeading.hidden = true;
    el.subTabs.hidden = false;
    el.tagPanel.hidden = false;
    el.randomBtn.hidden = false;
    el.emptyReset.hidden = false;
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
    if (raw === "favorites") {
      state.favoritesView = true;
      el.sidebar.hidden = true;
      renderGrid();
      requestAnimationFrame(() => {
        const header = document.querySelector(".site-header");
        const top = el.favoritesHeading.getBoundingClientRect().top + window.scrollY - (header ? header.getBoundingClientRect().height : 0) - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
      return;
    }
    state.favoritesView = false;
    el.sidebar.hidden = false;
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
    const candidates = window.GhImg ? window.GhImg.candidates(url) : [url];
    let blob = null;
    let sourceUrl = url;
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { mode: "cors" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        blob = await response.blob();
        sourceUrl = candidate;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!blob) throw lastError || new Error("图片下载失败");
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    const path = new URL(sourceUrl).pathname;
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
    let tags = [];
    try {
      const parsedTags = JSON.parse(card.dataset.imageTags || "[]");
      if (Array.isArray(parsedTags)) tags = parsedTags.filter((tag) => typeof tag === "string");
    } catch (err) {
      tags = [];
    }
    el.imageDialogTags.replaceChildren();
    tags.forEach((label) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = label;
      el.imageDialogTags.appendChild(tag);
    });
    el.imageDialogTags.hidden = !tags.length;
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
    syncPetPause();
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
    const labels = window.MemeSearch.labelsOf(row.tags, char.tagIndex);
    const card = { dataset: imageCardData(row.item.url, row.item.title, labels) };
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
    const theme = THEME_NAMES[mode] ? mode : "auto";
    document.documentElement.dataset.theme = theme;
    storageSet("nai-theme", theme);
    el.themeIcon.innerHTML = ICONS.svg(THEME_ICONS[theme], 18);
    el.themeToggle.title = "主题：" + THEME_NAMES[theme];
    el.themeToggle.setAttribute("aria-label", "主题：" + THEME_NAMES[theme]);
    setNaiwaButtons(theme === "naiwa");
  }

  function setNaiwaButtons(on) {
    (el.naiwaToggles || []).forEach((node) => {
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-pressed", String(on));
    });
  }

  function toggleNaiwaTheme() {
    if (document.documentElement.dataset.theme === "naiwa") {
      applyTheme("auto");
      toast("已切换主题：" + THEME_NAMES.auto);
    } else {
      applyTheme("naiwa");
      toast("已切换主题：奶蛙");
    }
  }

  function cycleTheme() {
    const order = ["auto", "dark", "light", "naiwa"];
    const current = order.indexOf(document.documentElement.dataset.theme);
    const next = order[(current + 1) % order.length];
    applyTheme(next);
    toast("已切换主题：" + THEME_NAMES[next]);
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

  function countUp(node, target, delay, format) {
    if (!node) return Promise.resolve();
    const value = Number(target) || 0;
    const display = format ? (count) => count.toLocaleString("zh-CN") : String;
    const duration = prefersReducedMotion() ? 360 : 1200;
    const start = performance.now() + (delay || 0);
    node.textContent = "0";
    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = 1 - Math.pow(1 - t, 3);
        node.textContent = display(Math.round(value * eased));
        if (t < 1) requestAnimationFrame(step);
        else {
          node.textContent = display(value);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  function renderStats() {
    let items = 0;
    let tags = 0;
    state.chars.forEach((char) => {
      items += char.total;
      tags += char.tagIndex.size;
    });
    return Promise.all([
      countUp($("statItems"), items, 0),
      countUp($("statChars"), state.manifest.length, 120),
      countUp($("statTags"), tags, 240)
    ]);
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

  function syncPetPause() {
    if (!window.NaiPet) return;
    const modalOpen = (el.imageDialog && el.imageDialog.open) || (el.uploadDialog && el.uploadDialog.open);
    window.NaiPet.setPaused(modalOpen);
  }

  function syncPetButton() {
    const off = !window.NaiPet || window.NaiPet.isHidden();
    document.querySelectorAll("[data-pet-toggle]").forEach((node) => {
      node.classList.toggle("is-on", !off);
      node.setAttribute("aria-pressed", String(!off));
      node.title = off ? "唤出奶蛙桌宠" : "让奶蛙躲起来";
    });
  }

  function togglePet() {
    if (!window.NaiPet) return;
    if (window.NaiPet.isHidden()) window.NaiPet.show();
    else window.NaiPet.hide();
    syncPetButton();
    toast(window.NaiPet.isHidden() ? "奶蛙躲起来了" : "奶蛙出来了");
  }

  async function startPet() {
    if (!window.NaiPet) return false;
    let pet;
    try {
      pet = await fetchJSON(CONFIG.petData);
    } catch (err) {
      return false;
    }
    if (!pet || !pet.sheet || !Array.isArray(pet.animations) || !pet.animations.some((item) => item && item.id === "idle")) return false;
    petAnimationData = pet;
    const cachedSheet = window.GhImg && window.GhImg.cachedAsset ? await window.GhImg.cachedAsset(pet.sheet) : null;
    const sheetUrl = cachedSheet || (window.GhImg && window.GhImg.compressedAsset
      ? window.GhImg.compressedAsset(pet.sheet)
      : pet.sheet);
    const sheet = new Image();
    sheet.src = sheetUrl;
    if (!await waitForImage(sheet, 5000)) return false;
    const narrow = (window.innerWidth || 1024) < 600;
    window.NaiPet.start({
      sheet: sheetUrl,
      frameWidth: pet.frameWidth,
      frameHeight: pet.frameHeight,
      columns: pet.columns,
      rows: pet.rows,
      animations: pet.animations,
      size: Math.round((Number(pet.size) || 104) * (narrow ? 0.9 : 1)),
      cheerSrc: EASTER_EGG.fallbackSrc,
      stopVoice: stopVoice,
      // 台词跟着当前角色走：奶蛙页说奶蛙话，奶蛋页只会“安~迪~”。
      lines: voiceSources,
      play: playVoiceSrc,
      onHide: syncPetButton
    });
    syncPetButton();
    syncPetPause();
    return true;
  }

  function voiceSources() {
    const char = currentChar();
    return char && Array.isArray(char.voice) ? char.voice : [];
  }

  function stopVoice() {
    voiceRequest += 1;
    clearTimeout(voiceStopTimer);
    voiceStopTimer = 0;
    voicePlaying = "";
    if (voiceSource) {
      try { voiceSource.stop(); } catch (err) {}
      voiceSource.disconnect();
      voiceSource = null;
    }
    if (voiceAudio) {
      try {
        voiceAudio.pause();
      } catch (err) {
      }
    }
    voiceEnded = null;
  }

  function preloadVoice(src) {
    if (voiceBuffers.has(src)) return voiceBuffers.get(src);
    const context = getIntroAudioContext();
    const media = () => {
      if (typeof Audio !== "function") return null;
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = EASTER_EGG.volume;
      audio.load();
      voiceMedia.set(src, audio);
      return new Promise((resolve) => {
        const complete = () => {
          clearTimeout(timer);
          audio.removeEventListener("canplaythrough", complete);
          audio.removeEventListener("error", complete);
          resolve(null);
        };
        const timer = setTimeout(complete, 5000);
        audio.addEventListener("canplaythrough", complete);
        audio.addEventListener("error", complete);
        if (audio.readyState >= 4) complete();
      });
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const ready = context ? fetch(src, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer();
    }).then((bytes) => context.decodeAudioData(bytes)).catch(media).finally(() => clearTimeout(timer)) : Promise.resolve(media());
    if (!context) clearTimeout(timer);
    voiceBuffers.set(src, ready);
    return ready;
  }

  async function playVoiceSrc(src, onEnded, duration) {
    if (!src || typeof Audio !== "function") {
      if (typeof onEnded === "function") onEnded();
      return false;
    }
    stopVoice();
    const request = voiceRequest;
    const segmentDuration = Number(duration) > 0 ? Number(duration) : 0;
    voicePlaying = src;
    voiceEnded = typeof onEnded === "function" ? onEnded : null;
    resumeIntroAudio();
    const buffer = await preloadVoice(src);
    if (collisionResumePromise) await collisionResumePromise;
    if (request !== voiceRequest) return false;
    const context = getIntroAudioContext();
    if (buffer && context && context.state === "running") {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = EASTER_EGG.volume;
      source.connect(gain);
      gain.connect(context.destination);
      voiceSource = source;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (voiceSource === source) {
          voiceSource = null;
          voicePlaying = "";
        }
        if (request === voiceRequest && voiceEnded) {
          const complete = voiceEnded;
          voiceEnded = null;
          complete();
        }
      };
      if (segmentDuration) source.start(0, 0, Math.min(segmentDuration, buffer.duration));
      else source.start();
      return true;
    }
    if (voiceAudioSrc !== src) {
      voiceAudio = voiceMedia.get(src) || new Audio(src);
      voiceAudio.volume = EASTER_EGG.volume;
      voiceAudio.addEventListener("ended", () => {
        if (voicePlaying !== src) return;
        const complete = voiceEnded;
        stopVoice();
        if (complete) complete();
      });
      voiceAudioSrc = src;
    }
    try {
      voiceAudio.currentTime = 0;
      await voiceAudio.play();
      if (segmentDuration && request === voiceRequest) {
        voiceStopTimer = window.setTimeout(() => {
          if (request === voiceRequest) stopVoice();
        }, segmentDuration * 1000);
      }
      return true;
    } catch (err) {
      if (voicePlaying === src) {
        const complete = voiceEnded;
        stopVoice();
        if (complete) complete();
      }
      return false;
    }
  }

  function easterEggSource() {
    const sources = voiceSources();
    if (!sources.length) return EASTER_EGG.fallbackSrc;
    return sources[Math.floor(Math.random() * sources.length)].src;
  }

  // 彩蛋：不弹提示，不打断正在播放的语音，播放失败也保持静默。
  function playEasterEgg() {
    if (voicePlaying) return;
    playVoiceSrc(easterEggSource());
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
        img.src = window.GhImg && window.GhImg.compressedAsset
          ? window.GhImg.compressedAsset(CONFIG.fallback)
          : CONFIG.fallback;
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
      const favoriteButton = event.target.closest("[data-favorite-toggle]");
      if (favoriteButton) {
        toggleFavorite(favoriteButton.closest(".card"));
        return;
      }
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

    (el.naiwaToggles || []).forEach((node) => {
      node.addEventListener("click", toggleNaiwaTheme);
    });

    document.querySelectorAll("[data-pet-toggle]").forEach((node) => {
      node.addEventListener("click", togglePet);
    });

    [el.imageDialog, el.uploadDialog].forEach((dlg) => {
      dlg.addEventListener("close", syncPetPause);
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

  function updateSidebarHint() {
    if (!el.sidebarNav || !el.sidebarScrollHint) return;
    const mobile = window.matchMedia("(max-width: 1011px)").matches;
    const dismissed = storageGet("nai-sidebar-scroll-hint") === "1";
    const maxScroll = el.sidebarNav.scrollWidth - el.sidebarNav.clientWidth;
    const hasMore = maxScroll > 2 && el.sidebarNav.scrollLeft < maxScroll - 2;
    el.sidebarScrollHint.hidden = !mobile || dismissed || !hasMore;
  }

  function setupSidebarHint() {
    if (sidebarHintReady) return;
    sidebarHintReady = true;
    el.sidebarNav.addEventListener("scroll", updateSidebarHint, { passive: true });
    window.addEventListener("resize", updateSidebarHint);
    el.sidebarScrollHint.addEventListener("click", () => {
      storageSet("nai-sidebar-scroll-hint", "1");
      el.sidebarScrollHint.hidden = true;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.sidebarNav.scrollBy({
        left: Math.max(120, el.sidebarNav.clientWidth * 0.72),
        behavior: reduced ? "auto" : "smooth"
      });
    });
    updateSidebarHint();
  }

  function setupSectionNavigation() {
    const nav = $("sectionNavigation");
    const previous = $("sectionPrevious");
    const next = $("sectionNext");
    const sections = [$("top"), $("main"), $("contribute")];
    const labels = ["首页", "表情库", "如何贡献"];
    if (!nav || sections.some((section) => !section)) return;
    let current = 0;
    let scheduled = false;
    let petPosition = null;
    let navSize = { width: 0, top: 0, bottom: 0 };
    const avoidPet = () => {
      let center = window.innerWidth / 2;
      if (petPosition && !petPosition.hidden && !nav.hidden) {
        const petTop = window.innerHeight - petPosition.height - petPosition.y;
        const petBottom = window.innerHeight - petPosition.y;
        const half = navSize.width / 2;
        if (petTop < navSize.bottom && petBottom > navSize.top &&
            petPosition.x < center + half + 12 && petPosition.x + petPosition.width > center - half - 12) {
          center = petPosition.x + petPosition.width / 2 >= center
            ? petPosition.x - half - 12 : petPosition.x + petPosition.width + half + 12;
          center = Math.max(half + 8, Math.min(window.innerWidth - half - 8, center));
        }
      }
      const left = center + "px";
      if (nav.style.left !== left) nav.style.left = left;
    };
    const headerHeight = () => document.querySelector(".site-header").getBoundingClientRect().height;
    const update = () => {
      scheduled = false;
      if (document.documentElement.classList.contains("home-intro-active")) { nav.hidden = true; return; }
      const offset = headerHeight();
      const viewportHeight = Math.max(1, window.innerHeight - offset);
      const visibleRatios = sections.map((section) => {
        const rect = section.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, offset));
        return visibleHeight / viewportHeight;
      });
      current = visibleRatios.reduce((best, ratio, index) => ratio > visibleRatios[best] ? index : best, 0);
      previous.hidden = current === 0;
      next.hidden = current === 2;
      nav.hidden = previous.hidden && next.hidden;
      if (!nav.hidden) {
        const rect = nav.getBoundingClientRect();
        navSize = { width: rect.width, top: rect.top, bottom: rect.bottom };
        avoidPet();
      }
      if (current > 0) {
        previous.setAttribute("aria-label", "回到" + labels[current - 1]);
        previous.setAttribute("aria-controls", sections[current - 1].id);
      }
      if (current < 2) {
        next.setAttribute("aria-label", "前往" + labels[current + 1]);
        next.setAttribute("aria-controls", sections[current + 1].id);
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    };
    const go = (index) => {
      window.scrollTo({
        top: index === 0 ? 0 : window.scrollY + sections[index].getBoundingClientRect().top - headerHeight(),
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
    };
    previous.addEventListener("click", () => go(Math.max(0, current - 1)));
    next.addEventListener("click", () => go(Math.min(2, current + 1)));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("home-intro-finished", schedule);
    document.addEventListener("pet-position", (event) => {
      petPosition = event.detail;
      avoidPet();
    });
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(schedule);
      sections.forEach((section) => observer.observe(section));
    }
    update();
  }

  function introHalfExtents(body) {
    const radians = body.rotation * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const half = body.size / 2;
    return { x: half * (cosine + sine), y: half * (cosine + sine) };
  }

  function constrainIntroBody(body, width, height) {
    const extent = introHalfExtents(body);
    body.x = Math.max(extent.x, Math.min(width - extent.x, body.x));
    body.y = Math.max(extent.y, Math.min(height - extent.y, body.y));
  }

  function makeIntroBodies(tiles, width, height) {
    const size = tiles[0].offsetWidth || 96;
    const inset = size * 0.72 + 24;
    const sides = ["left", "right", "top", "bottom"];
    for (let i = sides.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }

    return tiles.map((tile, index) => {
      const side = sides[index];
      const along = (min, max) => min + Math.random() * Math.max(0, max - min);
      let x = 0;
      let y = 0;
      if (side === "left") {
        x = inset;
        y = along(height * 0.28, height * 0.72);
      } else if (side === "right") {
        x = width - inset;
        y = along(height * 0.28, height * 0.72);
      } else if (side === "top") {
        x = along(width * 0.3, width * 0.7);
        y = inset;
      } else {
        x = along(width * 0.3, width * 0.7);
        y = height - inset;
      }

      const angleToCenter = Math.atan2(height / 2 - y, width / 2 - x);
      const angle = angleToCenter + (Math.random() - 0.5) * 0.7;
      const speed = Math.max(width, height) * (2.45 + Math.random() * 0.3);
      const rotation = (Math.random() - 0.5) * 34;
      const body = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        launchVx: Math.cos(angle) * speed,
        launchVy: Math.sin(angle) * speed,
        size,
        rotation,
        spin: (Math.random() - 0.5) * 20,
        side,
        launchFrame: 28,
        entered: true
      };
      tile.style.transform = "translate3d(" + (x - size / 2) + "px," + (y - size / 2) + "px,0)";
      return body;
    });
  }

  function introCollisionAxis(a, b) {
    const angleA = a.rotation * Math.PI / 180;
    const angleB = b.rotation * Math.PI / 180;
    const axes = [
      { x: Math.cos(angleA), y: Math.sin(angleA) },
      { x: -Math.sin(angleA), y: Math.cos(angleA) },
      { x: Math.cos(angleB), y: Math.sin(angleB) },
      { x: -Math.sin(angleB), y: Math.cos(angleB) }
    ];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const contacts = [];

    for (const axis of axes) {
      const aX = Math.cos(angleA);
      const aY = Math.sin(angleA);
      const bX = Math.cos(angleB);
      const bY = Math.sin(angleB);
      const projectionA = a.size / 2 * (Math.abs(axis.x * aX + axis.y * aY) + Math.abs(-axis.x * aY + axis.y * aX));
      const projectionB = b.size / 2 * (Math.abs(axis.x * bX + axis.y * bY) + Math.abs(-axis.x * bY + axis.y * bX));
      const distance = dx * axis.x + dy * axis.y;
      const overlap = projectionA + projectionB - Math.abs(distance);
      if (overlap <= 0) return null;
      const direction = distance < 0 ? -1 : 1;
      contacts.push({ overlap, normal: { x: axis.x * direction, y: axis.y * direction } });
    }
    return contacts.sort((a, b) => a.overlap - b.overlap);
  }

  function introTravel(body, directionX, directionY, extent, width, height) {
    let distance = Infinity;
    if (directionX < -0.0001) distance = Math.min(distance, (body.x - extent.x) / -directionX);
    else if (directionX > 0.0001) distance = Math.min(distance, (width - extent.x - body.x) / directionX);
    if (directionY < -0.0001) distance = Math.min(distance, (body.y - extent.y) / -directionY);
    else if (directionY > 0.0001) distance = Math.min(distance, (height - extent.y - body.y) / directionY);
    return Math.max(0, distance);
  }

  function simulateIntro(bases, width, height, targets, scales, limitMs) {
    const fps = 60;
    const maxSpeed = Math.max(...bases.map((base, index) => Math.hypot(base.vx, base.vy) * scales[index]));
    const substeps = Math.max(3, Math.ceil(maxSpeed / bases[0].size / fps * 2));
    const dt = 1 / (fps * substeps);
    const maxFrames = Math.ceil(limitMs * fps / 1000);
    const bodies = bases.map((base, index) => ({
      ...base,
      x: base.x,
      y: base.y,
      vx: base.vx * scales[index],
      vy: base.vy * scales[index],
      launchVx: base.launchVx * scales[index],
      launchVy: base.launchVy * scales[index],
      wallHits: 0,
      target: targets[index],
      exiting: false,
      entered: true,
      done: false
    }));
    const frames = [];
    const events = [];
    const record = (frame) => {
      const cues = [];
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index];
        const base = bases[index];
        if (frame > 58) continue;
        const speed = Math.hypot(body.launchVx, body.launchVy) || 1;
        const directionX = body.launchVx / speed;
        const directionY = body.launchVy / speed;
        const angle = body.rotation * Math.PI / 180;
        const support = body.size / 2 * (
          Math.abs(directionX * Math.cos(angle) + directionY * Math.sin(angle)) +
          Math.abs(-directionX * Math.sin(angle) + directionY * Math.cos(angle))
        );
        const ease = (t) => t * t * (3 - 2 * t);
        let gap;
        if (frame < 10) gap = 30 + 52 * ease(frame / 10);
        else if (frame < 28) gap = 82 * (1 - Math.pow((frame - 10) / 18, 3));
        else if (frame < 32) gap = -18 * ease((frame - 28) / 4);
        else gap = -18 + 156 * ease(Math.min(1, (frame - 32) / 26));
        const tipDistance = support + gap;
        cues.push({
          x: base.x - directionX * tipDistance,
          y: base.y - directionY * tipDistance,
          angle: Math.atan2(directionY, directionX) * 180 / Math.PI + Math.sin(frame / 58 * Math.PI) * 1.2,
          opacity: Math.min(1, frame / 6, (58 - frame) / 12)
        });
      }
      frames.push({
        bodies: bodies.map((body) => ({ x: body.x, y: body.y, rotation: body.rotation, done: body.done })),
        cues
      });
    };
    const collision = (frame, strength, edge) => events.push({
      frame,
      strength: Math.max(0.12, Math.min(1, strength)),
      edge
    });

    record(0);
    for (let frame = 0; frame < maxFrames; frame += 1) {
      for (let substep = 0; substep < substeps; substep += 1) {
        bodies.forEach((body) => {
          if (body.done || frame < body.launchFrame) return;
          const speed = Math.hypot(body.vx, body.vy);
          // 滚动摩擦与空气阻力持续耗能，碰撞也有损耗。
          const remainingSpeed = Math.max(0, speed * Math.exp(-0.18 * dt) - Math.max(width, height) * 0.2 * dt);
          const drag = speed > 0 ? remainingSpeed / speed : 0;
          body.vx *= drag;
          body.vy *= drag;
          body.spin *= drag;
          body.x += body.vx * dt;
          body.y += body.vy * dt;
          body.rotation += body.spin * dt;

          if (body.exiting) {
            const outside = body.size * Math.SQRT1_2;
            if (body.x < -outside || body.x > width + outside || body.y < -outside || body.y > height + outside) body.done = true;
            return;
          }

          const extent = introHalfExtents(body);
          if (!body.entered) {
            body.entered = body.x >= extent.x && body.x <= width - extent.x &&
              body.y >= extent.y && body.y <= height - extent.y;
            if (!body.entered) return;
          }
          const hitWall = (axis, direction) => {
            body.wallHits += 1;
            collision(frame + 1, Math.hypot(body.vx, body.vy) / 2400, true);
            if (body.wallHits >= body.target) {
              body.exiting = true;
              return;
            }
            if (axis === "x") {
              body.x = direction < 0 ? extent.x : width - extent.x;
              body.vx = -body.vx * 0.88;
            } else {
              body.y = direction < 0 ? extent.y : height - extent.y;
              body.vy = -body.vy * 0.88;
            }
          };

          if (body.x < extent.x) {
            if (body.vx < 0) hitWall("x", -1);
            else body.x = extent.x;
          } else if (body.x > width - extent.x) {
            if (body.vx > 0) hitWall("x", 1);
            else body.x = width - extent.x;
          }
          if (!body.exiting) {
            if (body.y < extent.y) {
              if (body.vy < 0) hitWall("y", -1);
              else body.y = extent.y;
            } else if (body.y > height - extent.y) {
              if (body.vy > 0) hitWall("y", 1);
              else body.y = height - extent.y;
            }
          }
        });

        for (let pass = 0; pass < 5; pass += 1) {
          for (let aIndex = 0; aIndex < bodies.length; aIndex += 1) {
            const a = bodies[aIndex];
            if (a.done || frame < a.launchFrame) continue;
            const extentA = introHalfExtents(a);
            if (a.x + extentA.x < 0 || a.x - extentA.x > width || a.y + extentA.y < 0 || a.y - extentA.y > height) continue;
            for (let bIndex = aIndex + 1; bIndex < bodies.length; bIndex += 1) {
              const b = bodies[bIndex];
              if (b.done || frame < b.launchFrame) continue;
              const extentB = introHalfExtents(b);
              if (b.x + extentB.x < 0 || b.x - extentB.x > width || b.y + extentB.y < 0 || b.y - extentB.y > height) continue;
              const contacts = introCollisionAxis(a, b);
              if (!contacts) continue;
              let contact = null;
              let moveA = 0;
              let moveB = 0;
              let correction = 0;
              for (const candidate of contacts) {
                const capacityA = introTravel(a, -candidate.normal.x, -candidate.normal.y, extentA, width, height);
                const capacityB = introTravel(b, candidate.normal.x, candidate.normal.y, extentB, width, height);
                const needed = candidate.overlap + 0.6;
                if (capacityA + capacityB < needed) continue;
                contact = candidate;
                correction = needed;
                moveA = Math.min(correction / 2, capacityA);
                moveB = Math.min(correction / 2, capacityB);
                let remaining = correction - moveA - moveB;
                const extraA = Math.min(remaining, capacityA - moveA);
                moveA += extraA;
                remaining -= extraA;
                moveB += Math.min(remaining, capacityB - moveB);
                break;
              }
              if (!contact) continue;
              const nx = contact.normal.x;
              const ny = contact.normal.y;
              a.x -= nx * moveA;
              a.y -= ny * moveA;
              b.x += nx * moveB;
              b.y += ny * moveB;
              if (a.entered) constrainIntroBody(a, width, height);
              if (b.entered) constrainIntroBody(b, width, height);

              const relativeSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
              if (relativeSpeed < -30) {
                const impulse = -(1 + 0.92) * relativeSpeed * 0.5;
                a.vx -= impulse * nx;
                a.vy -= impulse * ny;
                b.vx += impulse * nx;
                b.vy += impulse * ny;
                collision(frame + 1, Math.abs(relativeSpeed) / 2200, false);
              }
              [a, b].forEach((body) => {
                if (!body.exiting) return;
                const extent = introHalfExtents(body);
                const stillLeaving = (body.x <= extent.x && body.vx < 0) ||
                  (body.x >= width - extent.x && body.vx > 0) ||
                  (body.y <= extent.y && body.vy < 0) ||
                  (body.y >= height - extent.y && body.vy > 0);
                if (!stillLeaving) body.exiting = false;
              });
            }
          }
        }
      }

      record(frame + 1);
      if (bodies.every((body) => body.done)) break;
    }
    return { frames, events, complete: bodies.every((body) => body.done) };
  }

  function precomputeIntro(tiles) {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const limitMs = 6800;
    let completed = null;
    for (let launch = 0; launch < 48; launch += 1) {
      const bases = makeIntroBodies(tiles, width, height);
      // 开场静止阶段同样不能叠在一起。
      if (bases.some((a, i) => bases.slice(i + 1).some((b) => introCollisionAxis(a, b)))) continue;
      const targets = bases.map(() => 3 + Math.floor(Math.random() * 2));
      const scales = bases.map(() => 1 + Math.floor(launch / 12) * 0.12);
      const route = simulateIntro(bases, width, height, targets, scales, limitMs);
      if (!route.complete) continue;
      completed = route;
      if (route.events.some((event) => !event.edge)) return route;
    }
    return completed;
  }

  function getIntroAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!collisionAudioContext) collisionAudioContext = new AudioContextClass();
      return collisionAudioContext;
    } catch (err) {
      return null;
    }
  }

  function resumeIntroAudio() {
    const context = getIntroAudioContext();
    if (!context || context.state !== "suspended" || collisionResumePromise) return;
    collisionResumePromise = context.resume().catch(() => {}).finally(() => {
      collisionResumePromise = null;
    });
  }

  function unlockIntroAudio() {
    resumeIntroAudio();
    // Web Audio 的同一个 context 播放碰撞、键盘与已解码的语音。
    // 无 Web Audio 的浏览器在这次手势中激活预载的媒体元素。
    voiceMedia.forEach((audio) => {
      audio.muted = true;
      const playback = audio.play();
      if (playback) playback.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }).catch(() => { audio.muted = false; });
    });
  }

  function playIntroCollision(strength, edge) {
    const now = performance.now();
    if (now - lastIntroCollisionAt < 28) return;
    lastIntroCollisionAt = now;
    const context = getIntroAudioContext();
    if (!context) return;
    const playImpact = () => {
      if (context.state !== "running") return;
      const time = context.currentTime;
      const force = Math.max(0.2, Math.min(1, strength));
      const level = force * INTRO_SFX_VOLUME * (edge ? 0.78 : 1);
      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime((edge ? 185 : 220) + force * 110, time);
      body.frequency.exponentialRampToValueAtTime(edge ? 105 : 130, time + 0.11);
      bodyGain.gain.setValueAtTime(0.14 * level, time);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      body.connect(bodyGain);
      bodyGain.connect(context.destination);
      body.start(time);
      body.stop(time + 0.13);

      const ping = context.createOscillator();
      const pingGain = context.createGain();
      ping.type = "sine";
      ping.frequency.setValueAtTime((edge ? 760 : 970) + force * 260, time);
      ping.frequency.exponentialRampToValueAtTime(edge ? 540 : 690, time + 0.12);
      pingGain.gain.setValueAtTime(0.105 * level, time);
      pingGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      ping.connect(pingGain);
      pingGain.connect(context.destination);
      ping.start(time);
      ping.stop(time + 0.16);

      const echo = context.createOscillator();
      const echoGain = context.createGain();
      echo.type = "sine";
      echo.frequency.setValueAtTime((edge ? 460 : 590) + force * 90, time + 0.035);
      echo.frequency.exponentialRampToValueAtTime(edge ? 360 : 440, time + 0.16);
      echoGain.gain.setValueAtTime(0.065 * level, time + 0.035);
      echoGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      echo.connect(echoGain);
      echoGain.connect(context.destination);
      echo.start(time + 0.035);
      echo.stop(time + 0.19);
      playIntroNoise(context, time, 0.075 * level, 0.014, 1150);
    };
    if (context.state === "suspended") {
      resumeIntroAudio();
      if (collisionResumePromise) collisionResumePromise.then(playImpact);
    } else playImpact();
  }

  let introNoiseBuffer = null;

  function playIntroNoise(context, time, volume, duration, cutoff) {
    if (!introNoiseBuffer || introNoiseBuffer.sampleRate !== context.sampleRate) {
      const length = Math.ceil(context.sampleRate * 0.08);
      introNoiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const samples = introNoiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
      }
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = introNoiseBuffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(cutoff, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(time, Math.random() * 0.04, duration);
    source.stop(time + duration);
  }

  function playIntroTypeTick(character) {
    if (/\s/.test(character)) return;
    const now = performance.now();
    if (now - lastIntroTypeAt < 18) return;
    lastIntroTypeAt = now;
    const context = getIntroAudioContext();
    if (!context) return;
    const playTick = () => {
      if (context.state !== "running") return;
      const time = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const level = INTRO_SFX_VOLUME;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(1250 + Math.random() * 380, time);
      oscillator.frequency.exponentialRampToValueAtTime(820 + Math.random() * 160, time + 0.035);
      gain.gain.setValueAtTime(0.03 * level, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.045);
      playIntroNoise(context, time, 0.025 * level, 0.009, 2100);
    };
    if (context.state === "suspended") {
      resumeIntroAudio();
      if (collisionResumePromise) collisionResumePromise.then(playTick);
    } else playTick();
  }

  function prepareIntroAudio() {
    return Promise.all([preloadVoice(EASTER_EGG.fallbackSrc), preloadVoice(INTRO_FEAR.src)]);
  }

  function playIntroLaugh() {
    if (introAudioPlayed) return;
    introAudioPlayed = true;
    playVoiceSrc(EASTER_EGG.fallbackSrc);
  }

  function animateHeroText(copy, onReveal) {
    if (!copy) return Promise.resolve();
    const title = copy.querySelector(".hero-title");
    const rainNodes = title ? Array.from(title.querySelectorAll("[data-title-rain]")) : [];
    let charIndex = 0;
    rainNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      Array.from(node.textContent).forEach((character) => {
        const span = document.createElement("span");
        span.className = "hero-title-char";
        span.textContent = character;
        span.style.setProperty("--char-delay", charIndex * 65 + "ms");
        span.style.setProperty("--rain-x", ((charIndex % 3) - 1) * 0.16 + "em");
        fragment.appendChild(span);
        charIndex += 1;
      });
      node.replaceChildren(fragment);
    });

    const brand = title && title.querySelector(".hero-brand");
    const brandStart = Math.max(0, charIndex - 1) * 65 + 620;
    if (title) title.classList.add("is-animating");
    if (brand) {
      setTimeout(() => brand.classList.add("is-landed"), brandStart);
    }

    const lead = copy.querySelector(".hero-lead-type");
    const characters = [];
    if (lead) {
      const walker = document.createTreeWalker(lead, 4);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach((node) => {
        const fragment = document.createDocumentFragment();
        Array.from(node.nodeValue).forEach((character) => {
          const span = document.createElement("span");
          span.className = "hero-lead-char";
          span.textContent = character;
          characters.push(span);
          fragment.appendChild(span);
        });
        node.replaceWith(fragment);
      });
      const caret = document.createElement("span");
      caret.className = "hero-lead-caret";
      caret.setAttribute("aria-hidden", "true");
      lead.appendChild(caret);
      lead.classList.add("is-prepared");
    }
    copy.classList.remove("is-pending");
    copy.classList.add("is-revealed");
    let resolveText;
    const textFinished = new Promise((resolve) => { resolveText = resolve; });
    const finishText = () => {
      copy.classList.add("is-text-done");
      const statsReady = Promise.resolve().then(() => onReveal && onReveal());
      requestAnimationFrame(() => {
        // 等待按钮、背景等有限入场动画结束，跳过眨眼和光标等循环动画。
        const animations = document.getAnimations().filter((animation) =>
          animation.effect && animation.effect.getComputedTiming().iterations !== Infinity
        );
        Promise.all([
          statsReady,
          ...animations.map((animation) => animation.finished.catch(() => {}))
        ]).then(resolveText);
      });
    };
    const typeLead = () => {
      if (!lead || prefersReducedMotion()) {
        characters.forEach((character) => character.classList.add("is-shown"));
        finishText();
        return;
      }
      const caret = lead.querySelector(".hero-lead-caret");
      lead.classList.add("is-typing", "has-typed");
      characters.forEach((character, index) => {
        setTimeout(() => {
          character.classList.add("is-shown");
          if (caret && character.isConnected) character.insertAdjacentElement("afterend", caret);
          else if (caret) caret.hidden = true;
          playIntroTypeTick(character.textContent);
        }, index * 30);
      });
      setTimeout(() => {
        lead.classList.remove("is-typing");
        finishText();
      }, Math.max(0, characters.length - 1) * 30 + 120);
    };
    setTimeout(typeLead, brandStart + (brand ? 560 : 0));
    return textFinished;
  }

  function waitForImage(image, timeout) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", onError);
        if (loaded && typeof image.decode === "function") image.decode().catch(() => {}).then(() => resolve(true));
        else resolve(loaded);
      };
      const onLoad = () => finish(true);
      const onError = () => {
        // 表情图的 error 捕获处理会继续尝试代理或本地占位图。
        if (!image.isConnected || image.dataset.fallback) finish(false);
      };
      const timer = setTimeout(() => finish(false), timeout);
      image.addEventListener("load", onLoad);
      image.addEventListener("error", onError);
      if (image.complete && image.naturalWidth > 0) finish(true);
    });
  }

  async function prepareHomeAssets() {
    const previews = Array.from(el.grid.querySelectorAll("img"));
    await Promise.all([
      ...previews.map(async (image) => {
        image.loading = "eager";
        if (await waitForImage(image, 8000)) return;
        // 慢网或源图不可用时，提前显示现有占位图，保留原图链接。
        delete image._gh;
        image.dataset.fallback = "1";
        image.src = window.GhImg && window.GhImg.compressedAsset
          ? window.GhImg.compressedAsset(CONFIG.fallback)
          : CONFIG.fallback;
        await waitForImage(image, 1500);
      }),
      ...voiceBuffers.values(),
      heroImagesReady
    ]);
  }

  function paintMenuSpriteFrame(node, frame) {
    const sprite = menuSpriteFrames.get(node);
    if (!sprite) {
      node.style.backgroundPosition = (frame / 7 * 100) + "% 0";
      return;
    }
    const padding = 6;
    const sourceWidth = sprite.frameWidth - padding * 2;
    sprite.context.clearRect(0, 0, sprite.canvas.width, sprite.canvas.height);
    sprite.context.drawImage(
      sprite.image,
      frame * sprite.frameWidth + padding,
      0,
      sourceWidth,
      sprite.image.naturalHeight,
      0,
      0,
      sprite.canvas.width,
      sprite.canvas.height
    );
  }

  function preloadHeroImages() {
    const nodes = Array.from(document.querySelectorAll(".hero-visual [data-art], .intro-projectile img[data-src]"));
    const images = nodes.map((node) => {
      const source = node.dataset.src || (node.dataset.art === "pet-sheet" ? "assets/pet/naifrog-sheet.webp" : node.dataset.art);
      if (!source) return Promise.resolve(false);
      const image = new Image();
      image.src = source;
      if (node.dataset.src) node.src = image.src;
      else if (!node.matches(".hero-art-games, .hero-art-tools")) {
        node.style.backgroundImage = 'url("' + image.src.replace(/"/g, "%22") + '")';
      }
      return waitForImage(image, 8000).then((ready) => {
        if (!ready || !node.matches(".hero-art-games, .hero-art-tools")) return ready;
        const canvas = document.createElement("canvas");
        canvas.className = "hero-art-canvas";
        canvas.width = Math.round(image.naturalWidth / 8);
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return false;
        node.style.backgroundImage = "none";
        node.replaceChildren(canvas);
        menuSpriteFrames.set(node, { canvas, context, image, frameWidth: image.naturalWidth / 8 });
        paintMenuSpriteFrame(node, 0);
        return true;
      });
    });
    return Promise.all(images).then((results) => results.every(Boolean));
  }

  function cacheHomeOriginals() {
    if (!window.GhImg || !window.GhImg.cacheAsset) return;
    [
      "assets/placeholders/naiwa_laugh.gif",
      "assets/placeholders/naidan_andi.gif",
      "assets/placeholders/naiwa_redemption.gif",
      "assets/placeholders/naijing.jpg",
      "assets/pet/naiwa-games.webp",
      "assets/pet/naiwa-tools.webp",
      "assets/pet/Winners.webp",
      "assets/placeholders/fallback.gif",
      "assets/pet/naifrog-sheet.webp"
    ].forEach((path) => window.GhImg.cacheAsset(path));
  }

  function waitForHeroImages(timeout) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeout);
      heroImagesReady.then((ready) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ready === true);
      }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  function setupHomeIntro(petReady) {
    const visual = document.querySelector(".hero-visual");
    const hero = document.querySelector(".hero");
    const copy = document.querySelector(".hero-copy");
    const tiles = visual ? Array.from(visual.querySelectorAll(".intro-projectile")) : [];
    const links = visual ? Array.from(visual.querySelectorAll(":scope > .hero-tile")) : [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const homeVisits = Math.max(0, Number(storageGet("nai-home-visits")) || 0);
    const showSkip = homeVisits > 0;
    storageSet("nai-home-visits", String(homeVisits + 1));
    const finishWithoutMotion = () => {
      document.documentElement.classList.remove("home-intro-active");
      if (visual) visual.classList.add("is-finished");
      if (hero) hero.classList.add("hero-no-visual");
      if (copy) copy.classList.remove("is-pending");
      document.dispatchEvent(new Event("home-intro-finished"));
      cacheHomeOriginals();
    };
    if (!visual || !tiles.length || (location.hash && location.hash !== "#/")) {
      finishWithoutMotion();
      return;
    }

    document.documentElement.classList.add("home-intro-active");
    visual.classList.add("is-intro");
    copy.classList.add("is-pending");
    prepareIntroAudio();
    const cues = tiles.map(() => {
      const cue = document.createElement("div");
      cue.className = "intro-cue";
      cue.setAttribute("aria-hidden", "true");
      visual.appendChild(cue);
      return cue;
    });
    const skip = showSkip ? document.createElement("button") : null;
    if (skip) {
      skip.className = "intro-skip";
      skip.type = "button";
      skip.textContent = "跳过开场";
      document.body.appendChild(skip);
    }
    const inertNodes = Array.from(document.body.children).filter((node) => node !== visual && node !== hero && node !== skip && node.id !== "naiPet" && !["SCRIPT", "STYLE"].includes(node.tagName));
    const previousInert = inertNodes.map((node) => node.inert);
    inertNodes.forEach((node) => { node.inert = true; });
    const previousCopyInert = copy ? copy.inert : false;
    if (copy) copy.inert = true;
    const halfSizes = tiles.map((tile) => tile.offsetWidth / 2);
    let route = null;
    let frameIndex = 0;
    let eventIndex = 0;
    let startTime = 0;
    let active = true;
    let phase = "waiting";
    let raf = 0;
    let otherRaf = 0;
    let otherTime = 0;
    let otherElapsed = 0;
    let otherFrame = 0;
    let otherRow = 7 + Math.floor(Math.random() * 3);
    const otherSprite = visual.querySelector(".hero-art-other");
    const menuSprites = Array.from(visual.querySelectorAll(".hero-art-games, .hero-art-tools"));
    const menuSpriteFrames = menuSprites.map((node) => ({ node, frame: 0, elapsed: 0 }));
    const paintMenuSprite = (sprite) => {
      paintMenuSpriteFrame(sprite.node, sprite.frame);
    };
    const otherAnimation = () => petAnimationData && petAnimationData.animations.find((item) => item && item.row === otherRow - 1);
    const paintOtherFrame = () => {
      const animation = otherAnimation();
      if (!animation || !otherSprite) return;
      const columns = Number(petAnimationData.columns) || 8;
      const rows = Number(petAnimationData.rows) || 10;
      const column = Math.min((animation.durations || []).length - 1, otherFrame);
      otherSprite.style.backgroundPosition = (column / (columns - 1) * 100) + "% " + (animation.row / (rows - 1) * 100) + "%";
    };
    const animateOther = (now) => {
      if (!active || reduced.matches || !otherSprite) return;
      if (!otherTime) otherTime = now;
      const delta = Math.min(100, now - otherTime);
      otherElapsed += delta;
      otherTime = now;
      menuSpriteFrames.forEach((sprite) => {
        sprite.elapsed += delta;
        while (sprite.elapsed >= 120) {
          sprite.elapsed -= 120;
          sprite.frame = (sprite.frame + 1) % 8;
          paintMenuSprite(sprite);
        }
      });
      let animation = otherAnimation();
      let guard = 0;
      while (animation && otherElapsed >= (animation.durations[otherFrame] || 120) && guard++ < 32) {
        otherElapsed -= animation.durations[otherFrame] || 120;
        otherFrame += 1;
        if (otherFrame >= animation.durations.length) {
          const choices = [7, 8, 9].filter((row) => row !== otherRow);
          otherRow = choices[Math.floor(Math.random() * choices.length)];
          otherFrame = 0;
          animation = otherAnimation();
        }
      }
      paintOtherFrame();
      otherRaf = requestAnimationFrame(animateOther);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Tab") {
        const pet = $("naiPet");
        const focusable = (pet && !pet.hidden ? links.concat(pet) : links).concat(skip ? [skip] : []);
        if (!focusable.length) return;
        const index = focusable.indexOf(document.activeElement);
        event.preventDefault();
        focusQuietly(focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]);
      }
    };
    const onRoute = () => finish(false);
    const introViewport = { width: window.innerWidth, height: window.innerHeight };
    const onResize = () => {
      if (window.innerWidth !== introViewport.width || window.innerHeight !== introViewport.height) finish(false);
    };
    const onReducedMotion = (event) => {
      if (event.matches) finish(false);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(otherRaf);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("hashchange", onRoute);
      window.removeEventListener("resize", onResize);
      reduced.removeEventListener("change", onReducedMotion);
      inertNodes.forEach((node, index) => { node.inert = previousInert[index]; });
      if (copy) copy.inert = previousCopyInert;
    };
    const finish = (animateText) => {
      if (!active) return;
      active = false;
      cleanup();
      document.documentElement.classList.remove("home-intro-active");
      visual.classList.remove("is-intro");
      visual.classList.add("is-finished");
      hero.classList.add("hero-no-visual");
      cues.forEach((cue) => cue.remove());
      if (skip) skip.remove();
      tiles.forEach((tile) => {
        tile.style.removeProperty("transform");
        tile.style.removeProperty("opacity");
      });
      if (animateText) {
        animateHeroText(copy, renderStats)
          .then(() => window.NaiPet.returnIntro(playIntroLaugh))
          .then(syncPetButton);
      } else {
        copy.classList.remove("is-pending");
        renderStats();
      }
      document.dispatchEvent(new Event("home-intro-finished"));
      cacheHomeOriginals();
      if (!animateText) {
        if (window.NaiPet) window.NaiPet.cancelIntro();
        syncPetButton();
      }
      const title = copy.querySelector(".hero-title");
      title.tabIndex = -1;
      focusQuietly(title);
    };
    const finishBilliards = async () => {
      phase = "assets";
      await homeAssetsReady;
      if (active) finish(true);
    };
    const draw = (now) => {
      if (!active) return;
      if (!startTime) startTime = now;
      frameIndex = Math.min(route.frames.length - 1, Math.floor((now - startTime) * 60 / 1000));
      const frame = route.frames[frameIndex];
      frame.bodies.forEach((position, index) => {
        const tile = tiles[index];
        tile.style.transform = "translate3d(" + (position.x - halfSizes[index]) + "px," + (position.y - halfSizes[index]) + "px,0) rotate(" + position.rotation + "deg)";
        tile.style.opacity = position.done ? "0" : "1";
      });
      cues.forEach((cue, index) => {
        const position = frame.cues[index];
        if (!position) { cue.style.opacity = "0"; return; }
        cue.style.left = position.x + "px";
        cue.style.top = position.y + "px";
        cue.style.opacity = String(position.opacity);
        cue.style.transform = "rotate(" + position.angle + "deg) translate(-100%, -50%)";
      });
      while (eventIndex < route.events.length && route.events[eventIndex].frame <= frameIndex) {
        const event = route.events[eventIndex];
        playIntroCollision(event.strength, event.edge);
        eventIndex += 1;
      }
      if (frameIndex >= route.frames.length - 1) {
        finishBilliards();
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    const start = async () => {
      if (!active || phase !== "waiting") return;
      visual.classList.add("is-launching");
      if (reduced.matches) { finish(false); return; }
      phase = "fear";
      unlockIntroAudio();
      await preloadVoice(INTRO_FEAR.src);
      if (!active) return;
      playVoiceSrc(INTRO_FEAR.src, null, INTRO_FEAR.duration).catch(() => {});
      await window.NaiPet.fearIntro();
      if (!active) return;
      await waitForHeroImages(1000);
      if (!active) return;
      phase = "flee";
      await window.NaiPet.fleeIntro();
      if (!active) return;
      if (!route) {
        finish(true);
        return;
      }
      phase = "billiards";
      raf = requestAnimationFrame(draw);
    };
    if (skip) skip.addEventListener("click", () => { unlockIntroAudio(); finish(false); });
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("hashchange", onRoute, { once: true });
    window.addEventListener("resize", onResize, { once: true });
    reduced.addEventListener("change", onReducedMotion);
    petReady.then((ready) => {
      if (!active) return;
      if (!ready || !window.NaiPet.prepareIntro(start)) { finish(false); return; }
      menuSpriteFrames.forEach(paintMenuSprite);
      if (!reduced.matches) otherRaf = requestAnimationFrame(animateOther);
      else paintOtherFrame();
      if (reduced.matches) return;
      // 等待点击的时间也用于预演物理和加载素材。
      raf = requestAnimationFrame(() => { if (active) route = precomputeIntro(tiles); });
    }).catch(() => finish(false));
  }

  async function init() {
    document.addEventListener("visitor-stats-loaded", (event) => {
      const stats = event.detail || {};
      countUp($("statVisitors"), stats.visitors, 0, true);
      countUp($("statViews"), stats.views, 120, true);
    });
    ICONS.hydrate(document);
    el.searchForm = $("searchForm");
    el.searchInput = $("searchInput");
    el.randomBtn = $("randomBtn");
    el.roleIntro = $("roleIntro");
    el.sidebarNav = $("sidebarNav");
    el.sidebarScrollHint = $("sidebarScrollHint");
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
    el.naiwaToggles = Array.from(document.querySelectorAll("[data-naiwa-toggle]"));
    el.mobileMenuToggle = $("mobileMenuToggle");
    el.mobileNav = $("mobileNav");
    el.sidebar = document.querySelector(".sidebar");
    el.subTabs = $("subTabs");
    el.tagPanel = $("tagPanel");
    el.randomBtn = $("randomBtn");
    el.favoritesHeading = $("favoritesHeading");
    el.favoritesCount = $("favoritesCount");
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
    el.imageDialogTags = $("imageDialogTags");
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
    try {
      const favorites = JSON.parse(storageGet(FAVORITES_KEY) || "[]");
      if (Array.isArray(favorites)) state.favorites = favorites.filter((entry) =>
        entry && typeof entry.charId === "string" && typeof entry.subId === "string" &&
        typeof entry.url === "string" && typeof entry.title === "string"
      );
    } catch (err) {
      state.favorites = [];
    }

    applyRepoLinks();
    applyTheme(storageGet("nai-theme") || "naiwa");
    setupSidebarHint();
    if (window.GhImg) {
      window.GhImg.configure({ repo: CONFIG.repo });
      window.GhImg.start();
    }
    bindEvents();
    setupReveal();
    loadStars();
    const petReady = startPet();
    heroImagesReady = preloadHeroImages().catch(() => false);
    el.grid.innerHTML = skeletonMarkup(8);
    prepareIntroAudio();
    homeAssetsReady = (async () => {
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
        if (document.documentElement.classList.contains("home-intro-active")) await prepareHomeAssets();
      } catch (err) {
        el.grid.innerHTML = "";
        el.pagerBottom.hidden = true;
        el.errorState.hidden = false;
        el.errorMsg.textContent = "数据加载失败：" + (err && err.message ? err.message : err);
      }
    })();
    setupHomeIntro(petReady);
    setupSectionNavigation();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
