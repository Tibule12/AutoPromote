"use strict";

const fs = require("fs");
const path = require("path");

const projectDir = process.cwd();
const lockPath = path.join(projectDir, "package-lock.json");
const marker = "module.exports = Object.assign(exports.expand, exports);";

if (!fs.existsSync(lockPath)) {
  process.exit(0);
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packagePaths = Object.entries(lock.packages || {})
  .filter(
    ([packagePath, metadata]) =>
      packagePath.endsWith("node_modules/brace-expansion") && metadata.version === "5.0.8"
  )
  .map(([packagePath]) => packagePath);

for (const packagePath of packagePaths) {
  const entryPath = path.join(projectDir, packagePath, "dist/commonjs/index.js");
  if (!fs.existsSync(entryPath)) continue;

  const source = fs.readFileSync(entryPath, "utf8");
  if (!source.includes(marker)) {
    fs.writeFileSync(entryPath, `${source.trimEnd()}\n${marker}\n`);
  }
}
