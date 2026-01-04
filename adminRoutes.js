// Wrapper: canonical implementation moved to src/adminRoutes.js
try {
  module.exports = require("./src/adminRoutes");
  if (process.env.ROUTE_WRAPPER_LOG === "1") {
    console.log("[wrapper] adminRoutes -> src/adminRoutes.js");
  }
} catch (e) {
  console.error("[wrapper] Failed loading src/adminRoutes.js:", e.message);
  throw e;
}
