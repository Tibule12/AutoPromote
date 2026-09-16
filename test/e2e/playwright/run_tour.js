const { spawnSync } = require("child_process");

const result = spawnSync(
  "npx",
  [
    "playwright",
    "test",
    "viral-clip-studio-live.spec.js",
    "--grep",
    "records the complete frontend-first creator feature tour",
    "--workers=1",
  ],
  { cwd: __dirname, stdio: "inherit", env: process.env }
);

process.exit(result.status ?? 1);
