const { sanitizeConnectionForApi } = require("../src/routes/platformRoutes");

(async () => {
  try {
    const doc = {
      tokens: { access_token: "secret", refresh_token: "secret2" },
      access_token: "x",
      refresh_token: "y",
      client_secret: "z",
      meta: { tokens: { access_token: "m" }, other: "val" },
    };
    const sanitized = sanitizeConnectionForApi(doc);
    if (
      sanitized.tokens ||
      sanitized.access_token ||
      sanitized.refresh_token ||
      sanitized.client_secret
    ) {
      console.error("Sanitization failed - token fields present");
      process.exit(1);
    }
    if (sanitized.meta && sanitized.meta.tokens) {
      console.error("Sanitization failed - meta tokens present");
      process.exit(1);
    }
    console.log("Sanitization test passed");
    console.log("OK");
  } catch (e) {
    console.error("Test failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
