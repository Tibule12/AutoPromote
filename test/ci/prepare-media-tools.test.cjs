"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { prepareMediaTools } = require("../../scripts/ci/prepare-media-tools.cjs");

test("the browser image matches the locked SDK and setup never requests apt downloads", () => {
  const yaml = require("yaml");
  const job = yaml.parse(fs.readFileSync(path.join(__dirname, "../../.github/workflows/playwright-e2e.yml"), "utf8")).jobs["playwright-e2e"];
  const locked = require("../../package-lock.json").packages["node_modules/playwright"].version;
  assert(job.container.image.startsWith(`mcr.microsoft.com/playwright:v${locked}-noble@sha256:`));
  assert.match(job.container.image, /@sha256:[a-f0-9]{64}$/);
  assert(!job.steps.some(step => /apt-get|playwright install/.test(step.run || "")));
});

test("emulator media setup uses locked binaries before Python checks", () => {
  const yaml = require("yaml");
  const job = yaml.parse(fs.readFileSync(path.join(__dirname, "../../.github/workflows/test-emulator.yml"), "utf8")).jobs["emulator-tests"];
  assert.equal(job["runs-on"], "ubuntu-24.04");
  const tools = job.steps.findIndex(step => step.name === "Prepare locked media tools");
  const preview = job.steps.findIndex(step => step.name === "Install and verify CPU preview runtime");
  assert(tools >= 0 && tools < preview);
  assert.match(job.steps[tools].run, /node scripts\/ci\/prepare-media-tools\.cjs/);
  assert(!job.steps.some(step => /apt-get/.test(step.run || "")));
  assert.match(job.steps[preview].run, /import numpy, PIL, studio_voice_bus_preview/);
});

test("locked media tools work across Actions steps and encode/decode video with sound", { timeout: 30000 }, () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-media-setup-test-"));
  try {
    const githubPath = path.join(scratch, "github-path"), githubEnv = path.join(scratch, "github-env");
    fs.writeFileSync(githubPath, "/existing-runner-bin\n");
    const result = prepareMediaTools({ temporaryRoot: scratch, githubPath, githubEnv });
    const additions = fs.readFileSync(githubPath, "utf8").trim().split("\n");
    assert.equal(additions[0], "/existing-runner-bin");
    assert.equal(additions.at(-1), result.directory);
    assert.equal(fs.readFileSync(githubEnv, "utf8"),
      `FFMPEG_PATH=${result.tools.ffmpeg.path}\nFFPROBE_PATH=${result.tools.ffprobe.path}\n`);
    const env = { ...process.env, PATH: result.directory + path.delimiter + process.env.PATH };
    const video = path.join(scratch, "real-test-media.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x48:rate=10:duration=0.4",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4", "-c:v", "libx264",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", video], { env, timeout: 15000 });
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
      { env, encoding: "utf8", timeout: 15000 }));
    assert.equal(info.streams.find(stream => stream.codec_type === "video").codec_name, "h264");
    assert.equal(info.streams.find(stream => stream.codec_type === "audio").codec_name, "aac");
    assert(Number(info.format.duration) >= .3);
    execFileSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { env, timeout: 15000 });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
