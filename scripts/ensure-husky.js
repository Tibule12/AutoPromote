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

console.log("Husky found; running `npx husky install` in", projectRoot);
const res = spawnSync("npx", ["husky", "install"], { stdio: "inherit", cwd: projectRoot });
if (res.status !== 0) {
  console.error("husky install failed with code", res.status);
  process.exit(res.status || 1);
}

console.log("husky install complete.");
