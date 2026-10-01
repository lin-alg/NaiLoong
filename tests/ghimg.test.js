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
  `https://raw.githubusercontent.com/lin-alg/NaiLoong/preview/previews/naiwa/animated/contributor/${commit}/assets/memes/meme.webp`
);
assert.strictEqual(
  context.window.GhImg.preview(
    "assets/placeholders/fallback.gif",
    "naiwa",
    "animated"
  ),
  null
);

console.log("GitHub image URL conversion passed");
