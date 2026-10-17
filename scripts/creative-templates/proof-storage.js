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

function recordingScratch(folder, name) {
  requireProofSpace(folder);
  const retained = path.join(folder, name, 'studio-recording-frames');
  // TMPDIR=/dev/shm is an explicit caller choice for bounded transient capture.
  // Keep the encoded movie and three review samples in the normal proof folder.
  let temporaryParent = null;
  if (process.env.TMPDIR === '/dev/shm') {
    assert.equal(fs.statfsSync('/dev/shm').type, 0x01021994, 'Capture scratch must be tmpfs');
    requireProofSpace('/dev/shm');
    temporaryParent = fs.mkdtempSync('/dev/shm/autopromote-studio-recording-');
  }
  const frames = temporaryParent ? path.join(temporaryParent, 'studio-recording-frames') : retained;
  fs.mkdirSync(frames, { recursive: true });
  return { frames, retained, temporaryParent };
}

function pruneRecordingScratch(frames, recording = path.join(path.dirname(frames), 'edited-in-studio.mp4')) {
  assert.equal(path.basename(frames), 'studio-recording-frames');
  assert(!fs.lstatSync(frames).isSymbolicLink());
  assert.equal(path.basename(recording), 'edited-in-studio.mp4');
  assert(fs.statSync(recording).size > 0,
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

function finishRecordingScratch(scratch, recording) {
  const result = pruneRecordingScratch(scratch.frames, recording);
  if (scratch.temporaryParent) {
    assert(path.basename(scratch.temporaryParent).startsWith('autopromote-studio-recording-'));
    assert.equal(path.dirname(scratch.temporaryParent), '/dev/shm');
    fs.mkdirSync(scratch.retained, { recursive: true });
    for (const name of result.retainedSamples) {
      fs.copyFileSync(path.join(scratch.frames, name), path.join(scratch.retained, name));
      fs.unlinkSync(path.join(scratch.frames, name));
    }
    fs.rmdirSync(scratch.frames);
    fs.rmdirSync(scratch.temporaryParent);
  }
  return { ...result, ramBacked: !!scratch.temporaryParent };
}

module.exports = { requireProofSpace, pruneRecordingScratch, recordingScratch,
  finishRecordingScratch, MAX_CAPTURE_BYTES };
