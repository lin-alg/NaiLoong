(function (global) {
  "use strict";

  function buildTagIndex(tagsJson, dimensionNames) {
    const cats = [];
    const flat = [];
    const byFlat = new Map();
    const source = tagsJson && typeof tagsJson === "object" ? tagsJson : {};
    const names = dimensionNames && typeof dimensionNames === "object" ? dimensionNames : {};

    Object.keys(source).forEach((catKey) => {
      const values = source[catKey] || {};
      const localizedName = names[catKey] && names[catKey].zh;
      const cat = {
        key: catKey,
        label: typeof localizedName === "string" && localizedName ? localizedName : catKey,
        start: flat.length,
        items: []
      };
      Object.keys(values)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((localKey) => {
          const rec = {
            flat: flat.length,
            cat: catKey,
            local: Number(localKey),
            label: String(values[localKey])
          };
          cat.items.push(rec);
          flat.push(rec);
          byFlat.set(rec.flat, rec);
        });
      cats.push(cat);
    });

    return { cats, flat, byFlat, size: flat.length };
  }

  function findRecord(tagIndex, catKey, value) {
    const cat = tagIndex.cats.find((c) => c.key === catKey);
    if (!cat) return null;
    if (typeof value === "string") {
      return cat.items.find((item) => item.label === value) || null;
    }
    const local = Number(value);
    return cat.items.find((item) => item.local === local) || null;
  }

  function resolveRawTags(raw, tagIndex) {
    const out = new Set();
    if (raw === null || raw === undefined) return out;

    const takePair = (catKey, value) => {
      if (value === null || value === undefined) return;
      const rec = findRecord(tagIndex, catKey, value);
      if (rec) out.add(rec.flat);
    };

    if (Array.isArray(raw)) {
      tagIndex.cats.forEach((cat, dimensionIndex) => {
        const local = raw[dimensionIndex];
        if (local === null || !Number.isInteger(local)) return;
        const rec = cat.items.find((item) => item.local === local);
        if (rec) out.add(rec.flat);
      });
    } else if (typeof raw === "object") {
      Object.keys(raw).forEach((catKey) => takePair(catKey, raw[catKey]));
    }

    return out;
  }

  function labelsOf(indexes, tagIndex) {
    return Array.from(indexes)
      .map((i) => tagIndex.byFlat.get(i))
      .filter(Boolean)
      .sort((a, b) => a.flat - b.flat)
      .map((rec) => rec.label);
  }

  function tokenize(query) {
    return String(query || "")
      .toLowerCase()
      .split(/[\s,，、]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function buildList(items, tagIndex) {
    return (items || []).map((item) => {
      const tags = resolveRawTags(item.tags, tagIndex);
      const hay = (String(item.title || "") + " " + labelsOf(tags, tagIndex).join(" ")).toLowerCase();
      return { item, tags, hay };
    });
  }

  function search(rows, query, selected) {
    const tokens = tokenize(query);
    const facet = selected instanceof Map ? selected : new Map();

    return rows
      .filter((row) => {
        if (tokens.length && !tokens.every((token) => row.hay.indexOf(token) !== -1)) return false;
        for (const indexes of facet.values()) {
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
      })
      .map((row) => row.item);
  }

  function matchedCount(rows, query) {
    return search(rows, query, new Map()).length;
  }

  global.MemeSearch = {
    buildTagIndex,
    resolveRawTags,
    labelsOf,
    buildList,
    search,
    tokenize,
    matchedCount
  };
})(typeof window !== "undefined" ? window : globalThis);
