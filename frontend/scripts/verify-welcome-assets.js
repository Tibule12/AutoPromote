#!/usr/bin/env node
// Every deploy runs this after the ordinary production build. The welcome page
// must never depend on a local QA server or omitted, ignored media files.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const build = path.resolve(root, process.env.BUILD_PATH || "build");
const media = path.join(build, "welcome", "2026-10-21");
const manifest = JSON.parse(fs.readFileSync(path.join(media, "manifest.json"), "utf8"));
for (const file of manifest.files) {
  if (!/^[a-z0-9-]+\.(mp4|jpg|png|json)$/.test(file.name)) throw Error("Invalid welcome asset name");
  const bytes = fs.readFileSync(path.join(media, file.name));
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== file.bytes || sha256 !== file.sha256) {
    throw Error(`Welcome asset is missing or changed: ${file.name}`);
  }
}
const release = process.env.GITHUB_SHA || process.env.RENDER_GIT_COMMIT ||
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const info = { commit: release, builtAt: new Date().toISOString(), welcomeAssets: "2026-10-21" };
fs.writeFileSync(path.join(build, "build-info.json"), JSON.stringify(info) + "\n");
const index = path.join(build, "index.html");
if (!/^[a-f0-9]{40}$/.test(release)) throw Error("Invalid deployment commit");
fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace("</head>",
  `<meta name="autopromote-release" content="${release}"/></head>`));
console.log(`Verified ${manifest.files.length} versioned welcome assets; release ${release.slice(0, 8)}.`);
