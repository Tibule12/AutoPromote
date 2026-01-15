/* eslint-disable no-console */
test("inspect ContentUploadForm module export shape", () => {
  let mod;
  try {
    mod = require("../ContentUploadForm");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("REQUIRE_ERROR", e && e.stack);
    throw e;
  }
  // log the module shape
  // eslint-disable-next-line no-console
  console.log("MODULE_KEYS", Object.keys(mod || {}));
  // eslint-disable-next-line no-console
  console.log("MODULE_OWN_NAMES", Object.getOwnPropertyNames(mod || {}));
  const val = mod && (mod.default || mod);
  // eslint-disable-next-line no-console
  console.log("DEFAULT_TYPE", typeof val, val && Object.getOwnPropertyNames(val));
  expect(mod).toBeDefined();
});
