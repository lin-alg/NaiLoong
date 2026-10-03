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
    timeout: 2600,
    headStart: 350
  };

  let config = Object.assign({}, DEFAULTS);
  let started = false;

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
    return null;
  }

  function sourceParts(url) {
    if (typeof url !== "string") return null;
    const clean = url.trim().split(/[?#]/)[0];
    let match = /^([A-Za-z0-9-]+)\/([0-9a-f]{40})\/(.+)$/i.exec(clean);
    if (match) return { owner: match[1], commit: match[2].toLowerCase(), path: match[3] };
    match = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(?:blob|raw)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match && /^[0-9a-f]{40}$/i.test(match[3])) {
      return { owner: match[1], commit: match[3].toLowerCase(), path: match[4] };
    }
    match = /^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.+)$/.exec(clean);
    if (match && /^[0-9a-f]{40}$/i.test(match[3])) {
      return { owner: match[1], commit: match[3].toLowerCase(), path: match[4] };
    }
    return null;
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
    return "https://raw.githubusercontent.com/" + repoPath() + "/" + config.previewRef + "/" +
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
    if (!raw) return [url];
    const chosen = route === undefined ? readRoute() : route;
    const list = [routeUrl(chosen, raw)];
    if (list[0] !== raw) list.push(raw);
    config.proxies.forEach((tpl, i) => {
      const next = routeUrl("p" + i, raw);
      if (list.indexOf(next) === -1) list.push(next);
    });
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
    return "https://raw.githubusercontent.com/" + repo + "/" + config.ref + "/assets/icons/favicon.svg";
  }

  function pickRoute() {
    const base = probeBase();
    if (!base || typeof fetch !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const done = (route) => {
        if (settled) return;
        settled = true;
        if (route) writeRoute(route);
        resolve(route);
      };
      probe(base).then((ok) => {
        if (ok) done("direct");
      });
      config.proxies.forEach((tpl, i) => {
        setTimeout(() => {
          if (settled) return;
          probe(tpl.replace("{u}", base)).then((ok) => {
            if (ok) done("p" + i);
          });
        }, config.headStart);
      });
      setTimeout(() => done(null), config.timeout + config.headStart + 200);
    });
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
      const list = candidates(orig);
      const legacy = img.getAttribute("data-preview-legacy");
      if (legacy) {
        candidates(legacy).forEach((url) => {
          if (list.indexOf(url) === -1) list.push(url);
        });
      }
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
    preview,
    previewLegacy,
    candidates,
    decorate,
    advance,
    start,
    link: (url) => toRaw(url) || url,
    route: { get: readRoute, set: writeRoute },
    _pick: pickRoute
  };
})();
