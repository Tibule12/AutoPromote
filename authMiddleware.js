// Wrapper: canonical authMiddleware moved to src/authMiddleware.js
try {
  module.exports = require("./src/authMiddleware");
  if (process.env.ROUTE_WRAPPER_LOG === "1")
    console.log("[wrapper] authMiddleware -> src/authMiddleware.js");
} catch (e) {
  console.error("[wrapper] Failed loading src/authMiddleware.js:", e.message);
  throw e;
}
