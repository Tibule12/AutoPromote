const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const { createLocalEngine, hash } = require("../src/cinematic/localServer.cjs");
const { compileLocalProgramme } = require("../src/cinematic/programmePlan.cjs");
const { adaptStudioSnapshotToDocument } = require("../src/generated/studioDirectorReplayKernel.cjs");
const { buildCinematicGraph, createCinematicParameters } = require("../frontend/src/components/threeD/cinematicContract");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function snapshot(media) {
  return { orderedClips: [{ id: "source", start: 0, end: 4 }], selectedClipId: "source",
    timeline: [{ id: "first", sourceClipId: "source", contentHash: media.id, startRequest: 0, endRequest: 2 },
      { id: "second", sourceClipId: "source", contentHash: media.id, startRequest: 2, endRequest: 4 }],
    overlays: [], motionScenes: [], threeDScenes: [], reframeAspect: "16:9", smartCrop: false,
    previewSpeed: 1, audioRestoration: { enabled: false },
    mainTransform: { id: "main-video", type: "video", x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
  };
}
const document = state => adaptStudioSnapshotToDocument({ projectId: "local-programme-test", snapshot: state });

test("local programme uses actual canonical cuts, Inter title compositor, source audio and immutable cache", { timeout: 60000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cinematic-programme-"));
  const source = path.join(directory, "fixture.mp4");
  execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=24:d=4",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-pix_fmt", "yuv420p", source]);
  const engine = createLocalEngine({ directory });
  try {
    const media = engine.register(source), state = snapshot(media);
    state.overlays = [{ id: "ordinary-title", type: "text", text: "CANONICAL TITLE", startTime: 1, duration: 2,
      x: 50, y: 50, width: 70, fontFamily: "Inter", color: "#ffffff", fontWeight: 900 }];
    const d = document(state), job = engine.submitProgramme(d);
    for (let i = 0; i < 240 && !["completed", "failed", "cancelled"].includes(engine.status(job.id).status); i++) await wait(150);
    const done = engine.status(job.id);
    assert.equal(done.status, "completed", done.error);
    assert.equal(done.receipt.frames, 96); assert.equal(done.receipt.duration, 4);
    assert.equal(done.receipt.embeddedSceneAudioMixed, false);
    assert.equal(done.receipt.audioSource, "original_programme_bus");
    assert.equal(done.receipt.probe.streams.filter(s => s.codec_type === "audio").length, 1);
    const file = path.join(directory, "jobs", job.id, "movie.mp4");
    assert.equal(hash(fs.readFileSync(file)), done.outputSha256);
    const savedAgain = structuredClone(d); savedAgain.revision += 1;
    assert.equal(engine.submitProgramme(savedAgain).id, done.id);
    assert.equal(engine.submitProgramme(savedAgain).reused, true);
    // Cache corruption cannot be presented as a completed output.
    fs.writeFileSync(file, "corrupt");
    const retry = engine.submitProgramme(d);
    assert.equal(retry.reused, false);
    engine.cancel(retry.id);
    await wait(300);
  } finally { engine.shutdown(); await wait(200); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("changed scene content and forged export references fail before any render; placement reuses verified frames", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cinematic-binding-"));
  try {
    // Unit fixture bytes exercise graph/hash binding only, never visual quality.
    const file = path.join(directory, "synthetic-artifact"); fs.writeFileSync(file, "unit fixture");
    const id = hash(fs.readFileSync(file)), media = { id, path: file, duration: 12, hasAudio: false, width: 1280, height: 720 };
    const state = snapshot(media);
    state.timeline = [{ ...state.timeline[0], endRequest: 12 }];
    const scene = { version: 1, id: "evidence", sceneType: "cinematic_evidence", startTime: 0,
      duration: 8, endTime: 8, cinematic: createCinematicParameters(id), localExport: { jobId: "a".repeat(64), sha256: id } };
    state.threeDScenes = [scene];
    const prior = buildCinematicGraph(scene);
    const dependencies = { asset: () => media, rendered: () => ({ file,
      state: { status: "completed", outputSha256: id }, manifest: { quality: "export", graph: prior } }) };
    scene.startTime = 2; scene.endTime = 10;
    assert.equal(compileLocalProgramme(document(state), dependencies).plan.scenes[0].startTime, 2);
    scene.cinematic.camera.focalLength = 60;
    assert.throws(() => compileLocalProgramme(document(state), dependencies), /changed/);
    scene.cinematic.camera.focalLength = 42;
    scene.localExport.sha256 = "b".repeat(64);
    assert.throws(() => compileLocalProgramme(document(state), dependencies), /render each/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("unsupported saved effects are rejected instead of disappearing from local export", () => {
  const media = { id: "a".repeat(64) };
  for (const edit of [s => s.addHook = true, s => s.autoCaptions = true, s => s.audioRemix = { enabled: true },
    s => s.mainFrame = { enabled: true }, s => s.finishFx = { saturation: 0 },
    s => s.reframeKeyframes = [{ time: 0, x: 20 }], s => s.previewSpeed = 2,
    s => s.mainTransform.opacity = .5]) {
    const state = snapshot(media); edit(state);
    assert.throws(() => compileLocalProgramme(document(state), { asset: () => null, rendered: () => null }), /Programme export/);
  }
});
