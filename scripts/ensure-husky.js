#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function hasHusky() {
  try {
    require.resolve("husky");
    return true;
  } catch (e) {
    return false;
  }
}

const projectRoot = path.resolve(__dirname, "..");

if (!hasHusky()) {
  console.log("Husky dependency not found; skipping husky install.");
  process.exit(0);
}

console.log("Husky found; attempting to run `npx husky install` in", projectRoot);
try {
  const res = spawnSync("npx", ["husky", "install"], {
    stdio: "inherit",
    cwd: projectRoot,
    shell: true,
  });
  if (res && res.status === 0) {
    console.log("husky install complete.");
  } else {
    console.warn(
      "husky install failed or exited non-zero; continuing without husky. status=",
      res && res.status
    );
  }
} catch (e) {
  console.warn(
    "Error running husky install; continuing without husky.",
    e && e.message ? e.message : e
  );
}

// Don't fail prepare when husky cannot be installed (e.g., devDependencies not present in subfolder installs)
process.exit(0);
