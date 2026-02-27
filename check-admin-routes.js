// Script to check if adminSystemRoutes loads correctly
require("dotenv").config();
const path = require("path");

console.log("Checking adminSystemRoutes...");
try {
  require("./src/routes/adminSystemRoutes");
  console.log("✅ adminSystemRoutes loaded successfully!");
} catch (e) {
  console.error("❌ adminSystemRoutes failed to load:");
  console.error(e.message);
  if (e.code === "MODULE_NOT_FOUND") {
    console.error("Dependency missing: " + e.message);
  }
  console.error(e.stack);
}
