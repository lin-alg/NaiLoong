/* 站内文档阅读器：把仓库里的 Markdown 指南渲染成网页。
   路由形如 docs.html#/github-beginner-guide，#/文档id/文内锚点 可直接定位小节。 */
(function () {
  "use strict";

  const CONFIG = { repo: "https://github.com/lin-alg/NaiLoong" };
  const DOCS = [
    { id: "github-beginner-guide", file: "docs/github-beginner-guide.md", title: "GitHub 新手投稿教程" },
    { id: "meme-submissions", file: "docs/meme-submissions.md", title: "社区表情包投稿" },
    { id: "project-maintainers-guide", file: "docs/project-maintainers-guide.md", title: "项目结构与开发指南" },
    { id: "contributing", file: "CONTRIBUTING.md", title: "贡献指南" }
  ];

  const el = {};
  const cache = new Map();
  // icons.js 没加载时按空图标处理，文档正文照常渲染。
  const ICONS = window.NaiIcons || { svg: () => "", markup: () => "", hydrate: () => {} };
  let currentId = null;

  function $(id) {
    return document.getElementById(id);
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
    }
  }

  function applyTheme(mode) {
    const icons = {
      auto: "lucide:sun-moon",
      light: "lucide:sun",
      dark: "lucide:moon",
      naiwa: "tabler:baby-bottle"
    };
    const names = { auto: "主题：跟随系统", light: "主题：浅色", dark: "主题：深色", naiwa: "主题：奶蛙" };
    const theme = names[mode] ? mode : "auto";
    document.documentElement.dataset.theme = theme;
    storageSet("nai-theme", theme);
    el.themeIcon.innerHTML = ICONS.svg(icons[theme], 18);
    el.themeToggle.title = names[theme];
    el.themeToggle.setAttribute("aria-label", names[theme]);
  }

  function cycleTheme() {
    const order = ["auto", "dark", "light", "naiwa"];
    const next = order[(order.indexOf(document.documentElement.dataset.theme) + 1) % order.length];
    applyTheme(next);
  }

  function docById(id) {
    return DOCS.find((doc) => doc.id === id) || null;
  }

  function resolveDoc(path) {
    const doc = DOCS.find((item) => item.file === path);
    return doc ? doc.id : null;
  }

  function baseOf(file) {
    const at = file.lastIndexOf("/");
    return at === -1 ? "" : file.slice(0, at + 1);
  }

  async function fetchText(path) {
    if (cache.has(path)) return cache.get(path);
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(path + " → HTTP " + res.status);
    const text = await res.text();
    cache.set(path, text);
    return text;
  }

  function renderNav() {
    el.docNav.innerHTML = DOCS.map((doc) =>
      '<a class="side-item' + (doc.id === currentId ? " is-active" : "") + '" href="#/' + doc.id + '">' +
      '<span class="side-name">' + doc.title + "</span></a>"
    ).join("");
  }

  function showIndex() {
    currentId = null;
    document.title = "文档 · 奶-hub";
    el.sourceLink.hidden = true;
    renderNav();
    el.content.innerHTML =
      "<h1>站点文档</h1><ul>" +
      DOCS.map((doc) => '<li><a href="#/' + doc.id + '">' + doc.title + "</a></li>").join("") +
      "</ul>";
    scrollTop();
  }

  function scrollTop() {
    try {
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      window.scrollTo(0, 0);
    }
  }

  function scrollToAnchor(anchor) {
    if (!anchor) {
      scrollTop();
      return;
    }
    let id = anchor;
    try {
      id = decodeURIComponent(anchor);
    } catch (err) {
    }
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function showDoc(id, anchor) {
    const doc = docById(id);
    if (!doc) {
      showIndex();
      return;
    }
    if (id === currentId) {
      scrollToAnchor(anchor);
      return;
    }
    currentId = id;
    renderNav();
    document.title = doc.title + " · 奶-hub 文档";
    el.sourceLink.href = CONFIG.repo + "/blob/main/" + doc.file;
    el.sourceLink.hidden = false;
    el.content.innerHTML = '<p class="docs-loading">正在加载文档…</p>';
    try {
      const text = await fetchText(doc.file);
      if (currentId !== id) return; // 加载期间已切走
      el.content.innerHTML = window.MD.render(text, {
        base: baseOf(doc.file),
        resolveDoc: resolveDoc,
        repoUrl: CONFIG.repo
      });
    } catch (err) {
      if (currentId !== id) return;
      el.content.innerHTML =
        '<div class="empty-state"><h3>文档加载失败</h3><p>' +
        String(err && err.message ? err.message : err) +
        '</p><p><a class="link" href="' + CONFIG.repo + "/blob/main/" + doc.file +
        '" target="_blank" rel="noopener noreferrer">在 GitHub 上查看原文 →</a></p></div>';
      return;
    }
    scrollToAnchor(anchor);
  }

  function route() {
    const raw = location.hash.slice(1);
    if (!raw || raw === "/") {
      showIndex();
      return;
    }
    if (raw.charAt(0) === "/") {
      const parts = raw.slice(1).split("/");
      showDoc(parts[0], parts.slice(1).join("/"));
      return;
    }
    // 文档内锚点（如 #再次投稿怎么操作）
    if (currentId) scrollToAnchor(raw);
    else showIndex();
  }

  function init() {
    el.docNav = $("docNav");
    el.content = $("docContent");
    el.sourceLink = $("sourceLink");
    el.themeToggle = $("themeToggle");
    el.themeIcon = $("themeIcon");

    ICONS.hydrate(document);
    applyTheme(storageGet("nai-theme") || "auto");
    el.themeToggle.addEventListener("click", cycleTheme);
    window.addEventListener("hashchange", route);
    route();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
