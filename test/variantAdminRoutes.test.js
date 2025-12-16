// Basic smoke test for variant admin routes (requires FIREBASE_EMULATOR or valid credentials)
const fetch = require("node-fetch");

(async () => {
  const base = process.env.TEST_BASE_URL || "http://localhost:5000";
  console.log("Variant Admin Routes smoke test against", base);
  // Not performing authenticated calls here (would need a token); just ensure endpoint 404/401 gracefully
  const res = await fetch(base + "/api/admin/variants/anomalies");
  console.log("GET /anomalies status:", res.status);
})();
