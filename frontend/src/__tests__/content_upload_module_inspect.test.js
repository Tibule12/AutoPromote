test("inspect ContentUploadForm module export shape", () => {
  let mod;
  try {
    mod = require("../ContentUploadForm");
  } catch (e) {
    console.error("REQUIRE_ERROR", e && e.stack);
    throw e;
  }
  // log the module shape

  console.log("MODULE_KEYS", Object.keys(mod || {}));

  console.log("MODULE_OWN_NAMES", Object.getOwnPropertyNames(mod || {}));
  const val = mod && (mod.default || mod);

  console.log("DEFAULT_TYPE", typeof val, val && Object.getOwnPropertyNames(val));
  expect(mod).toBeDefined();
});
