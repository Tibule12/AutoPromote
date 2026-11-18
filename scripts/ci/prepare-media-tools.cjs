"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// npm ci already supplies integrity-locked, platform-specific binaries. Copy
// them into owned scratch so executable permissions do not depend on package
// install hooks, and avoid a second download from the runner's apt mirror.
function prepareMediaTools({
  temporaryRoot = process.env.RUNNER_TEMP || os.tmpdir(),
  githubPath = process.env.GITHUB_PATH,
  githubEnv = process.env.GITHUB_ENV,
} = {}) {
  const directory = fs.mkdtempSync(path.join(path.resolve(temporaryRoot), "autopromote-media-"));
  const tools = {};
  for (const [name, packageName] of [
    ["ffmpeg", "@ffmpeg-installer/ffmpeg"],
    ["ffprobe", "@ffprobe-installer/ffprobe"],
  ]) {
    const destination = path.join(directory, name);
    fs.copyFileSync(require(packageName).path, destination);
    fs.chmodSync(destination, 0o755);
    const version = execFileSync(destination, ["-version"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }).split("\n")[0];
    tools[name] = { path: destination, version };
  }
  // These files are the Actions protocol for subsequent steps. No host PATH
  // or system packages are changed, and failed binary validation never exports
  // a half-prepared tool pair.
  if (githubPath) fs.appendFileSync(githubPath, `${directory}\n`);
  if (githubEnv) fs.appendFileSync(githubEnv,
    `FFMPEG_PATH=${tools.ffmpeg.path}\nFFPROBE_PATH=${tools.ffprobe.path}\n`);
  return { directory, tools };
}

if (require.main === module) {
  const result = prepareMediaTools();
  for (const tool of Object.values(result.tools)) console.log(tool.version);
}

module.exports = { prepareMediaTools };
