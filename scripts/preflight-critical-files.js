// Preflight: ensure critical runtime files exist. Exit 1 if any missing.
const fs = require("fs");
const path = require("path");
const critical = [
  "src/server.js",
  "src/middleware/rateLimit.js",
  "src/middleware/validate.js",
  "src/contentRoutes.js",
  "src/routes/monetizationRoutes.js",
  "src/routes/promotionTaskRoutes.js",
];
let missing = [];
critical.forEach(f => {
  if (!fs.existsSync(path.join(process.cwd(), f))) missing.push(f);
});
if (missing.length) {
  console.error("Preflight failed. Missing critical files:", missing.join(", "));
  process.exit(1);
}
console.log("Preflight OK. All critical files present.");
