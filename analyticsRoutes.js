// Wrapper for relocated file at src/analyticsRoutes.js
try {
  module.exports = require("./src/analyticsRoutes");
  if (process.env.ROUTE_WRAPPER_LOG === "1")
    console.log("[wrapper] analyticsRoutes -> src/analyticsRoutes.js");
} catch (e) {
  console.error("[wrapper] Failed loading src/analyticsRoutes.js:", e.message);
  throw e;
}
