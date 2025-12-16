// Smoke test for admin cache routes
try {
  const router = require("../src/routes/adminCacheRoutes");
  if (!router) throw new Error("adminCacheRoutes missing");
  console.log("Admin cache routes loaded");
} catch (e) {
  console.error("Admin cache routes test failed:", e.message);
  process.exit(1);
}
