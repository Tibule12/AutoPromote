/* eslint-disable no-console */
test("trace require parents for ContentUploadForm", () => {
  require("path");

  let mod;
  try {
    mod = require("../ContentUploadForm");
  } catch (e) {
    console.error("REQUIRE_ERROR", e && e.message);
  }

  const cache = require.cache || {};
  const entries = Object.keys(cache).filter(k => k.endsWith("ContentUploadForm.js"));
  console.error("CACHE_ENTRIES", entries);
  // Ensure we have at least one cache entry for inspection
  expect(entries.length).toBeGreaterThan(0);

  const key = entries[0];
  const seen = new Set();

  function dumpModule(id, depth = 0) {
    if (!id) return;
    if (seen.has(id)) {
      console.error("CYCLE_DETECTED_AT", id);
      return;
    }
    seen.add(id);
    const cm = cache[id];
    const indent = " ".repeat(depth * 2);
    console.error(`${indent}MODULE_ID:`, id);
    console.error(`${indent}  loaded:`, !!(cm && cm.loaded));
    try {
      console.error(`${indent}  exportsKeys:`, Object.keys((cm && cm.exports) || {}));
    } catch (e) {
      console.error(`${indent}  exports_read_error:`, e && e.message);
    }
    console.error(`${indent}  childrenCount:`, (cm && cm.children && cm.children.length) || 0);
    if (cm && cm.parent && cm.parent.id) {
      console.error(`${indent}  parentId:`, cm.parent.id);
      dumpModule(cm.parent.id, depth + 1);
    }
  }

  console.error("--- PARENT CHAIN (closest -> root) ---");
  dumpModule(key);

  // Also print immediate children of ContentUploadForm for visibility
  try {
    const cm = cache[key];
    if (cm && cm.children && cm.children.length) {
      console.error("--- CHILDREN ---");
      cm.children.forEach((c, i) => {
        try {
          console.error("child", i, c.id, "exportsKeys", Object.keys(c.exports || {}));
        } catch (e) {
          console.error("child_read_error", i, e && e.message);
        }
      });
    } else {
      console.error("NO_CHILDREN");
    }
  } catch (e) {
    console.error("CHILD_ENUM_ERROR", e && e.message);
  }

  console.error("REQUIRED_MOD_SHAPE", typeof mod, mod && Object.getOwnPropertyNames(mod || {}));
  expect(true).toBe(true);
});
