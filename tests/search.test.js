const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { Map, Set };
vm.runInNewContext(fs.readFileSync("assets/js/search.js", "utf8"), context);
const search = context.MemeSearch;
const dimensionNames = JSON.parse(fs.readFileSync("data/tag-translations.json", "utf8"));
const tags = search.buildTagIndex({
  smile: { "0": "轻松绷住", "1": "憋笑", "2": "大笑" },
  "age limit": { "0": "老少咸宜", "1": "朋友整活", "2": "重口" },
  "artistic merit": { "0": "下里巴人", "1": "日常", "2": "阳春白雪" }
}, dimensionNames);

assert.strictEqual(tags.cats[0].label, "笑容强度");
assert.strictEqual(tags.cats[1].label, "年龄限制");
assert.strictEqual(tags.cats[2].label, "艺术价值");

function assertLabels(actual, expected) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

assertLabels(
  search.labelsOf(search.resolveRawTags([2, 0, 0], tags), tags),
  ["大笑", "老少咸宜", "下里巴人"]
);
assertLabels(
  search.labelsOf(search.resolveRawTags([2, null, 0], tags), tags),
  ["大笑", "下里巴人"]
);
assertLabels(
  search.labelsOf(
    search.resolveRawTags({ smile: 2, "age limit": null, "artistic merit": 0 }, tags),
    tags
  ),
  ["大笑", "下里巴人"]
);

const rows = search.buildList(
  [
    { title: "狂笑", tags: [2, 0, 0] },
    { title: "憋笑", tags: [1, null, 0] }
  ],
  tags
);
assert.strictEqual(search.search(rows, "大笑", new Map()).length, 1);
assert.strictEqual(search.search(rows, "下里巴人", new Map()).length, 2);
const smileTag = tags.cats[0].items.find((item) => item.local === 2);
const smileFilter = new Map([["smile", new Set([smileTag.flat])]]);
assert.strictEqual(search.search(rows, "", smileFilter).length, 1);

const numericLabels = search.buildTagIndex({ dimension: { "0": "2", "2": "other" } });
assertLabels(
  search.labelsOf(search.resolveRawTags({ dimension: "2" }, numericLabels), numericLabels),
  ["2"]
);
assertLabels(
  search.labelsOf(search.resolveRawTags({ dimension: 2 }, numericLabels), numericLabels),
  ["other"]
);

console.log("search semantics passed");
