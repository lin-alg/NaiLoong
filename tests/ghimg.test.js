const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("assets/js/ghimg.js", "utf8"), context);
const toRaw = context.window.GhImg.toRaw;
const toCdn = context.window.GhImg.toCdn;
const sourceDetails = context.window.GhImg.sourceDetails;
const commit = "a".repeat(40);

assert.strictEqual(
  toRaw("https://github.com/contributor/NaiLoong/blob/image/assets/memes/meme.png"),
  "https://raw.githubusercontent.com/contributor/NaiLoong/image/assets/memes/meme.png"
);
assert.strictEqual(
  toRaw("https://github.com/contributor/NaiLoong/raw/image/assets/memes/meme.png"),
  "https://raw.githubusercontent.com/contributor/NaiLoong/image/assets/memes/meme.png"
);
assert.strictEqual(
  toRaw("https://github.com/contributor/NaiLoong/raw/refs/heads/image/assets/memes/meme.png"),
  "https://raw.githubusercontent.com/contributor/NaiLoong/refs/heads/image/assets/memes/meme.png"
);
assert.strictEqual(
  toRaw("https://raw.githubusercontent.com/contributor/NaiLoong/image/assets/memes/meme.png"),
  "https://raw.githubusercontent.com/contributor/NaiLoong/image/assets/memes/meme.png"
);
assert.strictEqual(
  toRaw(`https://github.com/contributor/NaiLoong/blob/${commit}/assets/memes/meme.png`),
  `https://raw.githubusercontent.com/contributor/NaiLoong/${commit}/assets/memes/meme.png`
);
assert.strictEqual(
  toRaw(`contributor/${commit}/assets/memes/meme.png`),
  `https://raw.githubusercontent.com/contributor/NaiLoong/${commit}/assets/memes/meme.png`
);
assert.strictEqual(
  toCdn(`contributor/${commit}/assets/memes/meme.png`),
  `https://cdn.jsdelivr.net/gh/contributor/NaiLoong@${commit}/assets/memes/meme.png`
);
assert.strictEqual(
  toCdn(`https://raw.githubusercontent.com/Musemantic/NaiLoong/${commit}/assets/memes/meme%20one.png`),
  `https://cdn.jsdelivr.net/gh/musemantic/NaiLoong@${commit}/assets/memes/meme%20one.png`
);
assert.strictEqual(
  toCdn(`https://cdn.jsdelivr.net/gh/Musemantic/NaiLoong@${commit}/assets/memes/meme.png`),
  `https://cdn.jsdelivr.net/gh/musemantic/NaiLoong@${commit}/assets/memes/meme.png`
);
const compactSource = sourceDetails(`Musemantic/${commit}/assets/memes/meme.png`);
assert.strictEqual(compactSource.owner, "Musemantic");
assert.strictEqual(compactSource.profileUrl, "https://github.com/Musemantic");
assert.strictEqual(
  compactSource.url,
  `https://github.com/Musemantic/NaiLoong/blob/${commit}/assets/memes/meme.png`
);
const rawSource = sourceDetails(
  `https://raw.githubusercontent.com/Musemantic/NaiLoong/${commit}/assets/memes/meme%20one.png`
);
assert.strictEqual(rawSource.owner, "Musemantic");
assert.strictEqual(
  rawSource.url,
  `https://github.com/Musemantic/NaiLoong/blob/${commit}/assets/memes/meme%20one.png`
);
assert.strictEqual(
  context.window.GhImg.preview(
    `contributor/${commit}/assets/memes/meme.gif`,
    "naiwa",
    "animated"
  ),
  `https://cdn.jsdelivr.net/gh/lin-alg/NaiLoong@preview/previews/naiwa/animated/contributor/${commit}/assets/memes/meme.gif.webp`
);
assert.strictEqual(
  context.window.GhImg.preview(
    "assets/placeholders/fallback.gif",
    "naiwa",
    "animated"
  ),
  null
);

const ghimg = context.window.GhImg;
const mixed = `MixedOwner/${commit.toUpperCase()}/assets/memes/Laugh.png`;
assert.strictEqual(
  ghimg.asset("assets/pet/naifrog-sheet.webp"),
  "https://cdn.jsdelivr.net/gh/lin-alg/NaiLoong@main/assets/pet/naifrog-sheet.webp"
);
assert.strictEqual(ghimg.pageAsset("/assets/placeholders/naijing.jpg"), "assets/placeholders/naijing.jpg");
assert.strictEqual(
  ghimg.compressedAsset("assets/placeholders/naiwa_laugh.gif"),
  "assets/placeholders/naiwa_laugh_compressed.webp"
);
assert.strictEqual(
  ghimg.compressedAsset("assets/placeholders/fallback.gif"),
  "assets/placeholders/fallback_compressed.webp"
);
assert.strictEqual(
  ghimg.compressedAsset("assets/placeholders/naijing.jpg"),
  "assets/placeholders/naijing_compressed.jpg"
);
assert.strictEqual(
  ghimg.compressedAsset("assets/pet/naifrog-sheet.webp"),
  "assets/pet/naifrog-sheet-compressed.webp"
);
assert.strictEqual(
  ghimg.candidates(mixed, "direct")[0],
  `https://cdn.jsdelivr.net/gh/mixedowner/NaiLoong@${commit}/assets/memes/Laugh.png`
);
const candidateUrls = ghimg.candidates(mixed, "direct");
assert(candidateUrls[1].startsWith("https://gh-proxy.com/"), "gh-proxy.com must be the first fallback after jsDelivr");
assert(candidateUrls.indexOf(candidateUrls.find((url) => url.startsWith("https://cdn.jsdelivr.net/"))) < candidateUrls.length - 1, "jsDelivr must be tried before raw");
assert.strictEqual(candidateUrls[candidateUrls.length - 1], ghimg.toRaw(mixed), "raw must be the final fallback");
assert.strictEqual(
  ghimg.preview(mixed, "naiwa", "static"),
  ghimg.preview(`https://github.com/MixedOwner/NaiLoong/blob/${commit}/assets/memes/Laugh.png`, "naiwa", "static")
);
assert.strictEqual(
  ghimg.preview(mixed, "naiwa", "static"),
  `https://cdn.jsdelivr.net/gh/lin-alg/NaiLoong@preview/previews/naiwa/static/mixedowner/${commit}/assets/memes/Laugh.png.webp`
);
assert.notStrictEqual(
  ghimg.preview(mixed, "naiwa", "static"),
  ghimg.preview(mixed.replace(".png", ".gif"), "naiwa", "static")
);
assert.strictEqual(
  ghimg.preview(`contributor/${commit}/meme%20one%2Epng`, "naiwa", "static"),
  `https://cdn.jsdelivr.net/gh/lin-alg/NaiLoong@preview/previews/naiwa/static/contributor/${commit}/meme%20one.png.webp`
);
assert.strictEqual(
  toRaw(`https://github.com/MixedOwner/NaiLoong/blob/FeatureBranch/Laugh.png`),
  "https://raw.githubusercontent.com/mixedowner/NaiLoong/FeatureBranch/Laugh.png"
);

ghimg.configure({ proxies: [] });
const originalPreview = ghimg.preview(mixed, "naiwa", "static");
const legacyPreview = ghimg.previewLegacy(mixed, "naiwa", "static");
assert(legacyPreview.includes(`/MixedOwner/${commit}/assets/memes/Laugh.webp`));
assert(
  ghimg.previewLegacy(`https://github.com/MixedOwner/NaiLoong/blob/${commit}/assets/memes/Laugh.png`, "naiwa", "static")
    .includes(`/mixedowner/${commit}/assets/memes/Laugh.webp`)
);
const image = {
  tagName: "IMG",
  getAttribute: (name) => ({
    src: originalPreview,
    "data-preview-legacy": legacyPreview,
    "data-original-url": ghimg.link(mixed)
  })[name] || null
};
ghimg.decorate(image);
assert.strictEqual(image._gh.list[0], originalPreview);
assert.strictEqual(ghimg.advance(image), legacyPreview);
assert(image._gh.list.includes(ghimg.link(mixed)), "preview failures should fall back to the original image URL");

// 模拟网络，覆盖真实线路探测入口，避免只验证图片候选列表。
async function checkProbe(successIndex, expectedRoute) {
  const requests = [];
  const probeContext = {
    window: {}, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      requests.push(url);
      if (requests.length - 1 !== successIndex) throw new TypeError("Failed to fetch");
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync("assets/js/ghimg.js", "utf8"), probeContext);
  const api = probeContext.window.GhImg;
  const raw = "https://raw.githubusercontent.com/lin-alg/NaiLoong/main/assets/icons/favicon.svg";
  const expected = [
    "https://cdn.jsdelivr.net/gh/lin-alg/NaiLoong@main/assets/icons/favicon.svg",
    "https://gh-proxy.com/" + raw,
    "https://ghproxy.net/" + raw,
    "https://ghfast.top/" + raw,
    raw
  ];
  assert.deepStrictEqual(Array.from(api.candidates(api.asset("assets/icons/favicon.svg"))), expected);
  assert.strictEqual(await api._pick(), expectedRoute);
  assert.deepStrictEqual(requests, expected.slice(0, successIndex + 1), "probe must follow image priority and stop after success");
  assert(!requests.some((url) => /https:\/\/(?:gh-proxy\.com|ghproxy\.net|ghfast\.top)\/https:\/\/cdn\.jsdelivr\.net\//.test(url)), "proxies must never wrap CDN URLs");
}

(async () => {
  await checkProbe(0, "cdn");
  await checkProbe(1, "p0");
  await checkProbe(3, "p2");
  await checkProbe(4, "direct");
  for (const indexedDB of [undefined, { open() { throw new Error("Storage disabled"); } }]) {
    const unavailable = { window: {}, indexedDB };
    vm.runInNewContext(fs.readFileSync("assets/js/ghimg.js", "utf8"), unavailable);
    assert.strictEqual(await unavailable.window.GhImg.cachedAsset("assets/pet/naifrog-sheet.webp"), null);
    assert.strictEqual(await unavailable.window.GhImg.cacheAsset("assets/pet/naifrog-sheet.webp"), false);
  }
  console.log("GitHub image URL conversion and route probing passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
