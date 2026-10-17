#!/usr/bin/env node
// Actual media/graph measurements only. Visual review and acceptance are separate.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const c = require("./contract"),
  root = path.resolve(__dirname, "../..");
const id = process.argv[2];
assert(["pacing-contrast", "editable-reveal", "visual-hierarchy", "sound-alignment"].includes(id));
const base = path.join(c.dayRoot(root, "2026-10-17"), id),
  proof = path.resolve(process.env.STUDIO_DAILY_REVIEW_PROOF || path.join(base, "proof")),
  config = JSON.parse(fs.readFileSync(path.join(base, "config.json")));
const dir = path.join(proof, id),
  movie = path.join(dir, "final.mp4"),
  recording = path.join(dir, "edited-in-studio.mp4");
const backup = JSON.parse(fs.readFileSync(path.join(proof, config.backupName))),
  request = JSON.parse(fs.readFileSync(path.join(proof, `${id}-render-request.private.json`)));
const keys = backup.snapshot.motionKeyframes,
  compiled = request.options.viralData.editor_timeline.motion_keyframes;
assert.deepEqual(compiled, keys, "Saved timing/value/curve tuples differ from the actual request");
const receipt = JSON.parse(fs.readFileSync(path.join(dir, "render-receipt.json"))),
  playback = JSON.parse(fs.readFileSync(path.join(dir, "studio-playback.json")));
assert.equal(receipt.outputSha256, c.sha(fs.readFileSync(movie)));
assert.equal(playback.outputSha256, receipt.outputSha256);
assert.equal(playback.projectId, backup.id);
assert(playback.playback.ended && playback.timelineVisible);
const frames = path.join(proof, "review");
fs.mkdirSync(frames, { recursive: true });
for (const seconds of [0, 0.8, 3.4, 6, 9.7])
  execFileSync(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-threads",
      "1",
      "-ss",
      String(seconds),
      "-i",
      movie,
      "-frames:v",
      "1",
      path.join(frames, `movie-${seconds}.png`),
    ],
    { stdio: "pipe" }
  );
execFileSync(
  "ffmpeg",
  [
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-threads",
    "1",
    "-i",
    movie,
    "-vf",
    "fps=2,scale=400:-1,tile=5x4",
    "-frames:v",
    "1",
    path.join(frames, "contact.jpg"),
  ],
  { stdio: "pipe" }
);
execFileSync(
  "ffmpeg",
  [
    "-nostdin",
    "-v",
    "error",
    "-threads",
    "1",
    "-i",
    recording,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-f",
    "null",
    "-",
  ],
  { stdio: "pipe" }
);
// ffmpeg writes loudness data to stderr; use spawnSync to retain that stream.
const measurement = require("node:child_process").spawnSync(
  "ffmpeg",
  [
    "-nostdin",
    "-hide_banner",
    "-threads",
    "1",
    "-i",
    movie,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ],
  { encoding: "utf8" }
);
assert.equal(measurement.status, 0);
const audio = JSON.parse(measurement.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
c.atomic(path.join(proof, "media-inspection.json"), {
  at: new Date().toISOString(),
  projectId: backup.id,
  movieSha256: receipt.outputSha256,
  recordingSha256: c.sha(fs.readFileSync(recording)),
  exactCompiledKeyTuples: keys.length,
  fullRecordingDecode: true,
  completeNativePlayback: playback.playback,
  recordingCapture: playback.recordingCapture,
  audioMeasurement: audio,
  humanListening: false,
  creativeAcceptance: false,
  reviewFrames: [0, 0.8, 3.4, 6, 9.7].map(t =>
    path.relative(root, path.join(frames, `movie-${t}.png`))
  ),
});
console.log(
  JSON.stringify({
    id,
    keys: keys.length,
    fullRecordingDecode: true,
    loudnessLUFS: audio.input_i,
    truePeakDbTP: audio.input_tp,
    creativeAcceptance: false,
  })
);
