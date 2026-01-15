/* eslint-disable no-console */
test("debug require cache for ContentUploadForm", () => {
  require("path");
  // Try to require the module
  let mod;
  try {
    mod = require("../ContentUploadForm");
  } catch (e) {
    console.error("REQUIRE_ERROR", e && e.message);
  }

  // Find matching cache entry
  const cache = require.cache || {};
  const entries = Object.keys(cache).filter(k => k.endsWith("ContentUploadForm.js"));
  console.error("CACHE_ENTRIES", entries);
  if (entries.length > 0) {
    const key = entries[0];
    const cm = cache[key];
    console.error("CACHE_MODULE_ID", cm && cm.id);
    console.error("CACHE_MODULE_KEYS", Object.keys(cm || {}));
    console.error("CACHE_MODULE_EXPORTS_KEYS", Object.keys((cm && cm.exports) || {}));
    console.error("CACHE_MODULE_LOADED", !!(cm && cm.loaded));
    try {
      console.error("CACHE_MODULE_EXPORTS_RAW", cm && cm.exports);
    } catch (e) {
      console.error("CACHE_MODULE_EXPORTS_RAW_ERROR", e && e.message);
    }
    console.error("CACHE_MODULE_PARENT", (cm && cm.parent && cm.parent.id) || null);
    console.error("CACHE_MODULE_CHILD_COUNT", (cm && cm.children && cm.children.length) || 0);
  }

  console.error("REQUIRED_MOD_SHAPE", typeof mod, mod && Object.getOwnPropertyNames(mod || {}));
  expect(true).toBe(true);
});
