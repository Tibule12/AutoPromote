// Small compatibility wrapper for UUID generation.
// - Prefer `crypto.randomUUID()` when available (Node 14.17+, Node 20+ will have it).
// - Fall back to the `uuid` package's v4 implementation.
// This avoids importing internal paths like `uuid/dist/cjs/index.js` which can trip
// up packaging or static analysis tools.
// We return an object with a `v4` function to match usage in the project.
try {
  const { randomUUID } = require("crypto");
  if (typeof randomUUID === "function") {
    module.exports = { v4: () => randomUUID() };
  } else {
    throw new Error("randomUUID not available");
  }
} catch (_err) {
  // Fallback to uuid package. Use public API (avoid internal paths).
  try {
    const { v4 } = require("uuid");
    module.exports = { v4 };
  } catch (err2) {
    // Last resort: try to get default export shape used by older versions
    // of uuid. This should rarely be necessary but keeps compatibility.
    const uuid = require("uuid");
    module.exports = { v4: uuid && (uuid.v4 || (uuid.default && uuid.default.v4)) };
  }
}
