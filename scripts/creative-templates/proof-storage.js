// Local QA storage limits. Never cleans source assets, projects or authentication.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const MIN_FREE_BYTES = 5 * 1024 ** 3;
const MAX_CAPTURE_BYTES = 256 * 1024 ** 2;

function requireProofSpace(folder) {
  let existing = path.resolve(folder);
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const stats = fs.statfsSync(existing);
  const available = stats.bavail * stats.bsize;
  assert(available >= MIN_FREE_BYTES,
    `QA stopped before allocating media: ${(available / 1024 ** 3).toFixed(2)} GiB free; keep at least 5 GiB free.`);
  return available;
}

function pruneRecordingScratch(frames) {
  assert.equal(path.basename(frames), 'studio-recording-frames');
  assert(!fs.lstatSync(frames).isSymbolicLink());
  assert(fs.statSync(path.join(path.dirname(frames), 'edited-in-studio.mp4')).size > 0,
    'Retain the encoded Studio recording before pruning scratch');
  const images = fs.readdirSync(frames).filter(name => /^\d+\.jpg$/.test(name)).sort();
  const keep = new Set([images[0], images[Math.floor(images.length / 2)], images.at(-1)]);
  let releasedBytes = 0;
  for (const name of images) {
    if (keep.has(name)) continue;
    const file = path.join(frames, name);
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink());
    if (stat.nlink === 1) releasedBytes += stat.blocks * 512;
    fs.unlinkSync(file);
  }
  fs.rmSync(path.join(frames, 'frames.ffconcat'), { force: true });
  return { releasedBytes, retainedSamples: [...keep].filter(Boolean) };
}

module.exports = { requireProofSpace, pruneRecordingScratch, MAX_CAPTURE_BYTES };
