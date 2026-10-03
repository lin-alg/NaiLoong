const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("assets/js/ghimg.js", "utf8"), context);
const toRaw = context.window.GhImg.toRaw;
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
  context.window.GhImg.preview(
    `contributor/${commit}/assets/memes/meme.gif`,
    "naiwa",
    "animated"
  ),
  `https://raw.githubusercontent.com/lin-alg/NaiLoong/preview/previews/naiwa/animated/contributor/${commit}/assets/memes/meme.gif.webp`
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
  ghimg.preview(mixed, "naiwa", "static"),
  ghimg.preview(`https://github.com/MixedOwner/NaiLoong/blob/${commit}/assets/memes/Laugh.png`, "naiwa", "static")
);
assert.strictEqual(
  ghimg.preview(mixed, "naiwa", "static"),
  `https://raw.githubusercontent.com/lin-alg/NaiLoong/preview/previews/naiwa/static/mixedowner/${commit}/assets/memes/Laugh.png.webp`
);
assert.notStrictEqual(
  ghimg.preview(mixed, "naiwa", "static"),
  ghimg.preview(mixed.replace(".png", ".gif"), "naiwa", "static")
);
assert.strictEqual(
  ghimg.preview(`contributor/${commit}/meme%20one%2Epng`, "naiwa", "static"),
  `https://raw.githubusercontent.com/lin-alg/NaiLoong/preview/previews/naiwa/static/contributor/${commit}/meme%20one.png.webp`
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
  getAttribute: (name) => ({ src: originalPreview, "data-preview-legacy": legacyPreview })[name] || null
};
ghimg.decorate(image);
assert.strictEqual(image._gh.list[0], originalPreview);
assert.strictEqual(ghimg.advance(image), legacyPreview);
assert.strictEqual(ghimg.advance(image), null);

console.log("GitHub image URL conversion passed");
