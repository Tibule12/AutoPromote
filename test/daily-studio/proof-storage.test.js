const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const storage = require("../../scripts/creative-templates/proof-storage");

test("capture cleanup refuses to remove frames without a preserved movie", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "studio-capture-guard-"));
  try {
    const frames = path.join(parent, "studio-recording-frames");
    fs.mkdirSync(frames);
    fs.writeFileSync(path.join(frames, "000000.jpg"), "retained picture");
    assert.throws(() => storage.pruneRecordingScratch(frames));
    assert.equal(fs.readFileSync(path.join(frames, "000000.jpg"), "utf8"), "retained picture");
    fs.writeFileSync(path.join(parent, "edited-in-studio.mp4"), "encoded movie");
    const link = path.join(parent, "linked");
    fs.mkdirSync(link);
    fs.symlinkSync(frames, path.join(link, "studio-recording-frames"));
    assert.throws(() => storage.pruneRecordingScratch(path.join(link, "studio-recording-frames")));
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("RAM capture preserves movie, first/middle/last samples and unrelated files", {
  skip: !fs.existsSync("/dev/shm"),
}, () => {
  const temporaryParent = fs.mkdtempSync("/dev/shm/autopromote-studio-recording-");
  const proof = fs.mkdtempSync(path.join(os.tmpdir(), "studio-capture-proof-"));
  try {
    const frames = path.join(temporaryParent, "studio-recording-frames");
    const retained = path.join(proof, "studio-recording-frames");
    fs.mkdirSync(frames);
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(frames, `00000${i}.jpg`), `picture ${i}`);
    fs.writeFileSync(path.join(frames, "frames.ffconcat"), "scratch only");
    const recording = path.join(proof, "edited-in-studio.mp4");
    fs.writeFileSync(recording, "encoded completed recording");
    fs.writeFileSync(path.join(proof, "source.mp4"), "preserved source");
    const result = storage.finishRecordingScratch({ frames, retained, temporaryParent }, recording);
    assert.equal(result.ramBacked, true);
    assert.deepEqual(fs.readdirSync(retained), ["000000.jpg", "000002.jpg", "000004.jpg"]);
    assert.equal(fs.readFileSync(path.join(retained, "000002.jpg"), "utf8"), "picture 2");
    assert.equal(fs.readFileSync(recording, "utf8"), "encoded completed recording");
    assert.equal(fs.readFileSync(path.join(proof, "source.mp4"), "utf8"), "preserved source");
    assert(!fs.existsSync(temporaryParent));
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
    fs.rmSync(proof, { recursive: true, force: true });
  }
});
