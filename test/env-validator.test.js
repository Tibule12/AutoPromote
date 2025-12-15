// env validator smoke
try {
  const { validateEnv } = require("../src/utils/envValidator");
  const result = validateEnv({ strict: false });
  console.log("Env validator executed", result.errors.length, "errors");
} catch (e) {
  console.error("Env validator test failed", e.message);
  process.exit(1);
}
