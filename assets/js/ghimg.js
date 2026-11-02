(function () {
  "use strict";

  const DEFAULTS = {
    repo: "https://github.com/lin-alg/NaiLoong",
    proxies: ["https://gh-proxy.com/{u}", "https://ghproxy.net/{u}", "https://ghfast.top/{u}"],
    ref: "main",
    previewRef: "preview",
    previewDir: "previews",
    ttl: 6 * 60 * 60 * 1000,
    storeKey: "nai-gh-route",
    timeout: 2600
  };

  let config = Object.assign({}, DEFAULTS);
  let started = false;
  let assetDbPromise = null;
  const assetUrls = new Map();

  function repoPath() {
    const match = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/.exec(config.repo);
    return match ? match[1] + "/" + match[2].replace(/\.git$/, "") : null;
  }

  function toRaw(url) {
    if (typeof url !== "string") return null;
    const clean = url.trim().split(/[?#]/)[0];
    let match = /^([A-Za-z0-9-]+)\/([0-9a-f]{40})\/(.+)$/i.exec(clean);
    if (match) {
      return "https://raw.githubusercontent.com/" + match[1].toLowerCase() + "/NaiLoong/" + match[2].toLowerCase() + "/" + match[3];
    }
    match = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(?:blob|raw)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match) {
      const ref = /^[0-9a-f]{40}$/i.test(match[3]) ? match[3].toLowerCase() : match[3];
      return "https://raw.githubusercontent.com/" + match[1].toLowerCase() + "/" + match[2] + "/" + ref + "/" + match[4];
    }
    match = /^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match) {
      const ref = /^[0-9a-f]{40}$/i.test(match[3]) ? match[3].toLowerCase() : match[3];
      return "https://raw.githubusercontent.com/" + match[1].toLowerCase() + "/" + match[2] + "/" + ref + "/" + match[4];
    }
    match = /^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/?#]+)\/([^/@?#]+)@([^/?#]+)\/(.+)$/.exec(clean);
    if (match) {
      return "https://raw.githubusercontent.com/" + match[1].toLowerCase() + "/" + match[2] + "/" + match[3] + "/" + match[4];
    }
    return null;
  }

  function toCdn(url) {
    if (typeof url !== "string") return null;
    const clean = url.trim().split(/[?#]/)[0];
    let match = /^([A-Za-z0-9-]+)\/([0-9a-f]{40})\/(.+)$/i.exec(clean);
    if (match) {
      return "https://cdn.jsdelivr.net/gh/" + match[1].toLowerCase() + "/NaiLoong@" +
        match[2].toLowerCase() + "/" + match[3];
    }
    match = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(?:blob|raw)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match) {
      return "https://cdn.jsdelivr.net/gh/" + match[1].toLowerCase() + "/" + match[2] + "@" +
        match[3] + "/" + match[4];
    }
    match = /^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match) {
      return "https://cdn.jsdelivr.net/gh/" + match[1].toLowerCase() + "/" + match[2] + "@" +
        match[3] + "/" + match[4];
    }
    match = /^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/?#]+)\/([^/@?#]+)@([^/?#]+)\/(.+)$/.exec(clean);
    if (match) {
      return "https://cdn.jsdelivr.net/gh/" + match[1].toLowerCase() + "/" + match[2] + "@" +
        match[3] + "/" + match[4];
    }
    return null;
  }

  function asset(path, ref) {
    if (typeof path !== "string" || !repoPath()) return null;
    const clean = path.trim().replace(/^\/+/, "");
    if (!clean) return null;
    return "https://cdn.jsdelivr.net/gh/" + repoPath() + "@" + (ref || config.ref) + "/" +
      clean.split("/").map(encodePathPart).join("/");
  }

  function sourceParts(url) {
    if (typeof url !== "string") return null;
    const clean = url.trim().split(/[?#]/)[0];
    let match = /^([A-Za-z0-9-]+)\/([0-9a-f]{40})\/(.+)$/i.exec(clean);
    if (match) return { owner: match[1], repo: "NaiLoong", commit: match[2].toLowerCase(), path: match[3] };
    match = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(?:blob|raw)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match && /^[0-9a-f]{40}$/i.test(match[3])) {
      return { owner: match[1], repo: match[2], commit: match[3].toLowerCase(), path: match[4] };
    }
    match = /^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match && /^[0-9a-f]{40}$/i.test(match[3])) {
      return { owner: match[1], repo: match[2], commit: match[3].toLowerCase(), path: match[4] };
    }
    match = /^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/?#]+)\/([^/@?#]+)@([^/?#]+)\/(.+)$/.exec(clean);
    if (match && /^[0-9a-f]{40}$/i.test(match[3])) {
      return { owner: match[1], repo: match[2], commit: match[3].toLowerCase(), path: match[4] };
    }
    return null;
  }

  function sourceDetails(url) {
    const source = sourceParts(url);
    if (!source) return null;
    return {
      owner: source.owner,
      profileUrl: "https://github.com/" + source.owner,
      url: "https://github.com/" + source.owner + "/" + source.repo + "/blob/" +
        source.commit + "/" + source.path.split("/").map(encodePathPart).join("/")
    };
  }

  function encodePathPart(value) {
    try {
      return encodeURIComponent(decodeURIComponent(value));
    } catch (err) {
      return encodeURIComponent(value);
    }
  }

  function previewPath(url, roleId, categoryId, legacy) {
    const source = sourceParts(url);
    if (!source || !roleId || !categoryId) return null;
    const parts = source.path.split("/");
    const filename = parts.pop() || "image";
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const compact = /^([A-Za-z0-9-]+)\/([0-9a-f]{40})\//i.test(url.trim());
    const owner = legacy && compact ? source.owner : source.owner.toLowerCase();
    const path = [
      config.previewDir,
      roleId,
      categoryId,
      owner,
      source.commit
    ].concat(parts, (legacy ? (stem || "image") : filename) + ".webp");
    return "https://cdn.jsdelivr.net/gh/" + repoPath() + "@" + config.previewRef + "/" +
      path.map(encodePathPart).join("/");
  }

  function preview(url, roleId, categoryId) {
    return previewPath(url, roleId, categoryId, false);
  }

  function previewLegacy(url, roleId, categoryId) {
    return previewPath(url, roleId, categoryId, true);
  }

  function readRoute() {
    try {
      const saved = JSON.parse(localStorage.getItem(config.storeKey) || "null");
      if (!saved || typeof saved.route !== "string") return null;
      if (Date.now() - (saved.at || 0) > config.ttl) return null;
      return saved.route;
    } catch (err) {
      return null;
    }
  }

  function writeRoute(route) {
    try {
      localStorage.setItem(config.storeKey, JSON.stringify({ route: route, at: Date.now() }));
    } catch (err) {
    }
  }

  function routeUrl(route, raw) {
    if (!route || route === "direct") return raw;
    if (!/^p\d+$/.test(route)) return raw;
    const tpl = config.proxies[Number(route.slice(1))];
    return tpl ? tpl.replace("{u}", raw) : raw;
  }

  function candidates(url, route) {
    const raw = toRaw(url);
    const cdn = toCdn(url);
    if (!raw && cdn) return [cdn];
    if (!raw) return [url];
    const list = cdn ? [cdn] : [];
    config.proxies.forEach((tpl, i) => {
      const next = routeUrl("p" + i, raw);
      if (list.indexOf(next) === -1) list.push(next);
    });
    if (list.indexOf(raw) === -1) list.push(raw);
    return list;
  }

  function probe(url) {
    if (typeof fetch !== "function") return Promise.resolve(false);
    if (typeof AbortController === "function") {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), config.timeout);
      return fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal }).then(
        () => {
          clearTimeout(timer);
          return true;
        },
        () => {
          clearTimeout(timer);
          return false;
        }
      );
    }
    let done = false;
    const settle = (value) => {
      if (done) return Promise.resolve(value);
      done = true;
      return Promise.resolve(value);
    };
    return new Promise((resolve) => {
      setTimeout(() => resolve(settle(false)), config.timeout);
      fetch(url, { mode: "no-cors", cache: "no-store" }).then(
        () => resolve(settle(true)),
        () => resolve(settle(false))
      );
    });
  }

  function probeBase() {
    const repo = repoPath();
    if (!repo) return null;
    return "https://cdn.jsdelivr.net/gh/" + repo + "@" + config.ref + "/assets/icons/favicon.svg";
  }

  async function pickRoute() {
    const base = probeBase();
    if (!base || typeof fetch !== "function") return null;
    const raw = toRaw(base);
    // 探测和图片使用同一候选列表；代理只包裹 GitHub raw，不包裹 CDN。
    for (const url of candidates(base)) {
      if (!await probe(url)) continue;
      const proxy = config.proxies.findIndex((tpl) => tpl.replace("{u}", raw) === url);
      const route = proxy >= 0 ? "p" + proxy : url === raw ? "direct" : "cdn";
      writeRoute(route);
      return route;
    }
    return null;
  }

  function pageAsset(path) {
    if (typeof path !== "string") return null;
    const clean = path.trim().replace(/^\/+/, "");
    return clean || null;
  }

  function compressedAsset(path) {
    const clean = pageAsset(path);
    if (!clean) return null;
    if (clean === "assets/pet/naifrog-sheet.webp") {
      return "assets/pet/naifrog-sheet-compressed.webp";
    }
    if (/\.gif$/i.test(clean)) return clean.replace(/\.gif$/i, "_compressed.webp");
    return clean.replace(/(\.[^./]+)$/, "_compressed$1");
  }

  function assetDb() {
    if (assetDbPromise) return assetDbPromise;
    assetDbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      let request;
      try {
        request = indexedDB.open("nai-image-cache", 1);
      } catch (err) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return assetDbPromise;
  }

  async function cachedAsset(path) {
    const key = pageAsset(path);
    if (!key) return null;
    if (assetUrls.has(key)) return assetUrls.get(key);
    const db = await assetDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const request = db.transaction("images", "readonly").objectStore("images").get(key);
        request.onsuccess = () => {
          if (request.result instanceof Blob) {
            const url = URL.createObjectURL(request.result);
            assetUrls.set(key, url);
            resolve(url);
          } else resolve(null);
        };
        request.onerror = () => resolve(null);
      } catch (err) { resolve(null); }
    });
  }

  async function cacheAsset(path) {
    const key = pageAsset(path);
    const db = await assetDb();
    if (!key || !db || typeof fetch !== "function") return false;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const response = await fetch(key, controller ? { cache: "force-cache", signal: controller.signal } : { cache: "force-cache" });
      if (!response.ok) return false;
      const blob = await response.blob();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("images", "readwrite");
        transaction.objectStore("images").put(blob, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch (err) { return false; }
    finally { if (timer !== null) clearTimeout(timer); }
  }

  function start() {
    if (started) return;
    started = true;
    const kick = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      pickRoute();
    };
    if (document.readyState === "complete") setTimeout(kick, 100);
    else window.addEventListener("load", () => setTimeout(kick, 100));
  }

  function decorate(imgs) {
    const nodes = imgs && typeof imgs.length === "number" ? imgs : [imgs];
    Array.prototype.forEach.call(nodes, (img) => {
      if (!img || img.tagName !== "IMG" || img._gh) return;
      const orig = img.getAttribute("src");
      if (!orig) return;
      const list = [];
      const raw = [];
      const add = (url) => {
        if (!url) return;
        candidates(url).forEach((candidate) => {
          const target = /^https?:\/\/raw\.githubusercontent\.com\//.test(candidate) ? raw : list;
          if (target.indexOf(candidate) === -1) target.push(candidate);
        });
      };
      add(orig);
      add(img.getAttribute("data-preview-legacy"));
      add(img.getAttribute("data-original-url"));
      raw.forEach((url) => {
        if (list.indexOf(url) === -1) list.push(url);
      });
      img._gh = { list: list, i: 0 };
      if (list[0] !== orig) img.src = list[0];
    });
  }

  function advance(img) {
    const gh = img && img._gh;
    if (!gh || gh.i >= gh.list.length - 1) return null;
    gh.i += 1;
    img.src = gh.list[gh.i];
    return gh.list[gh.i];
  }

  window.GhImg = {
    configure: (opts) => {
      config = Object.assign({}, config, opts || {});
    },
    toRaw,
    toCdn,
    asset,
    pageAsset,
    compressedAsset,
    cachedAsset,
    cacheAsset,
    sourceDetails,
    preview,
    previewLegacy,
    candidates,
    decorate,
    advance,
    start,
    link: (url) => toCdn(url) || toRaw(url) || url,
    route: { get: readRoute, set: writeRoute },
    _pick: pickRoute
  };
})();
