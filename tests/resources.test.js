const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("assets/js/app.js", "utf8").replace(
  'document.addEventListener("DOMContentLoaded", init);',
  "window.resources = { fetchJSON, loadHomeImage, loadPetSheet };"
);

function setup(fetch, extra = {}) {
  const timers = new Set();
  const context = {
    window: {}, fetch, AbortController,
    setTimeout(callback, delay) {
      const timer = setTimeout(callback, delay === 10000 ? delay : 0);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
    ...extra
  };
  vm.runInNewContext(source, context);
  return { ...context.window.resources, timers };
}

(async () => {
  let requests = 0;
  const recovered = setup(async () => {
    requests += 1;
    if (requests === 1) throw new TypeError("Failed to fetch");
    return { ok: true, json: async () => ({ ready: true }) };
  });
  assert.strictEqual((await recovered.fetchJSON("retry.json")).ready, true);
  assert.strictEqual(requests, 2, "a transient network failure should recover");
  await recovered.fetchJSON("retry.json");
  assert.strictEqual(requests, 2, "successfully loaded JSON should be reused");

  for (const failure of ["network", "http", "json", "timeout"]) {
    let attempts = 0;
    const broken = setup(async () => {
      attempts += 1;
      if (failure === "network") throw new TypeError("Failed to fetch");
      if (failure === "timeout") throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      return {
        ok: failure !== "http", status: 404,
        json: async () => { throw new SyntaxError("Invalid JSON"); }
      };
    });
    await assert.rejects(broken.fetchJSON(`${failure}.json`));
    assert.strictEqual(attempts, failure === "network" ? 3 : 1, "retries must be bounded and limited to temporary network failures");
  }

  function imageLoader(cachedUrl, failures = [], persist = false) {
    const requested = [];
    const cacheReads = [];
    const downloads = [];
    let configRequests = 0;
    class Image {
      constructor() { this.listeners = new Map(); this.complete = false; this.naturalWidth = 0; }
      set src(url) {
        this.url = url;
        requested.push(url);
        queueMicrotask(() => {
          this.complete = true;
          this.naturalWidth = failures.includes(url) ? 0 : 1536;
          const callback = this.listeners.get(this.naturalWidth ? "load" : "error");
          if (callback) callback();
        });
      }
      get src() { return this.url; }
      addEventListener(name, callback) { this.listeners.set(name, callback); }
      removeEventListener(name) { this.listeners.delete(name); }
      decode() { return Promise.resolve(); }
    }
    const resources = setup(async () => {
      configRequests++;
      return { ok: true, json: async () => ({ sheet: "assets/pet/shared.webp", animations: [{ id: "idle" }] }) };
    }, {
      Image,
      window: { GhImg: {
        cachedAsset: async (source) => { cacheReads.push(source); return cachedUrl; },
        compressedAsset: () => "assets/pet/shared-compressed.webp",
        ...(persist ? { cacheAsset: async (source) => {
          downloads.push(source);
          cachedUrl = "blob:downloaded";
          return true;
        } } : {})
      } }
    });
    return { ...resources, requested, cacheReads, downloads, configRequests: () => configRequests };
  }

  const cold = imageLoader(null);
  const [pet, other] = await Promise.all([cold.loadPetSheet(), cold.loadPetSheet()]);
  assert.strictEqual(pet.image, other.image, "pet and menu must share the decoded image");
  assert.strictEqual(cold.configRequests(), 1, "shared sheet must read pet configuration once");
  assert.deepStrictEqual(cold.requested, ["assets/pet/shared-compressed.webp"], "first visit must only load the compressed sheet for display");

  const warm = imageLoader("blob:cached-original");
  const [game, duplicate] = await Promise.all([warm.loadHomeImage("games.webp"), warm.loadHomeImage("games.webp")]);
  assert.strictEqual(game, duplicate);
  assert.deepStrictEqual(warm.requested, ["blob:cached-original"], "warm cache must avoid the original network URL");
  assert.deepStrictEqual(warm.cacheReads, ["games.webp"], "concurrent consumers share one cache lookup");
  await warm.loadPetSheet();
  assert.deepStrictEqual(warm.requested, ["blob:cached-original", "blob:cached-original"], "cached pet sheet must skip compressed and original network requests");

  const uncachedMenu = imageLoader(null);
  await uncachedMenu.loadHomeImage("games.webp");
  assert.deepStrictEqual(uncachedMenu.requested, ["games.webp"], "uncached menu art must still load from the network");

  const persistedMenu = imageLoader(null, [], true);
  await Promise.all([persistedMenu.loadHomeImage("games.webp"), persistedMenu.loadHomeImage("games.webp")]);
  assert.deepStrictEqual(persistedMenu.downloads, ["games.webp"], "cold menu must download once to populate the cache");
  assert.deepStrictEqual(persistedMenu.requested, ["blob:downloaded"], "display must reuse the saved download instead of requesting the original again");

  const broken = imageLoader("blob:broken", ["blob:broken", "assets/pet/shared-compressed.webp"]);
  assert(await broken.loadPetSheet(), "an unusable cache and preview must recover using the original");
  assert.deepStrictEqual(broken.requested, ["blob:broken", "assets/pet/shared-compressed.webp", "assets/pet/shared.webp"]);
  console.log("resource loading recovery passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
