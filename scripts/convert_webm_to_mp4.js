#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

function findLatestWebm(dir) {
  // If dir is a directory, walk recursively; if it's a file, evaluate directly
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    const items = fs.readdirSync(d);
    for (const it of items) {
      const full = path.join(d, it);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && full.endsWith(".webm") && stat.size > 0)
        results.push({ full, m: stat.mtimeMs, size: stat.size });
    }
  }
  walk(dir);
  if (!results.length) return null;
  results.sort((a, b) => b.m - a.m || b.size - a.size);
  return results[0].full;
}

async function main() {
  const artifacts = path.resolve(__dirname, "../test/e2e/playwright/artifacts");
  const testResults = path.resolve(__dirname, "../test-results");
  const candidates = [artifacts, testResults];
  let webm = null;
  for (const c of candidates) {
    webm = findLatestWebm(c);
    if (webm) {
      console.log("Found recording in", c);
      break;
    }
  }
  if (!webm) {
    console.error("No non-empty .webm recordings found in:", candidates.join(", "));
    process.exit(2);
  }

  // Parse optional CLI args for quality overrides
  const argv = require("minimist")(process.argv.slice(2));
  const preset = argv.preset || argv.p || "veryfast";
  const crf = argv.crf || argv.c || 23;

  // Attempt to use bundled ffmpeg (ffmpeg-static) if available
  let ffmpegPath;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch (e) {
    // fallback to system ffmpeg
    ffmpegPath = "ffmpeg";
  }

  const downloads = path.join(os.homedir(), "Downloads");
  if (!fs.existsSync(downloads)) {
    console.error("Downloads folder not found at", downloads);
    process.exit(3);
  }

  const outName = `tiktok_direct_post_${Date.now()}.mp4`;
  const outPath = path.join(downloads, outName);

  console.log("Converting", webm, "->", outPath, "preset=", preset, "crf=", crf);

  const args = [
    "-y",
    "-i",
    webm,
    "-c:v",
    "libx264",
    "-preset",
    String(preset),
    "-crf",
    String(crf),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outPath,
  ];
  const res = spawnSync(ffmpegPath, args, { stdio: "inherit" });
  if (res.error) {
    console.error(
      "ffmpeg not found or failed to execute. Install ffmpeg or add `ffmpeg-static` to devDependencies."
    );
    console.error(res.error.message);
    process.exit(4);
  }
  if (res.status !== 0) {
    console.error("ffmpeg exited with code", res.status);
    process.exit(res.status);
  }

  console.log("Saved MP4 to", outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
