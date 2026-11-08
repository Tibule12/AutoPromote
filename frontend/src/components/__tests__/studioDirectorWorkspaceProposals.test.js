import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from "../studioProjectDocument";
import { runStudioCommandOnSnapshot, dryRunStudioCommandBatch, undoStudioCommandBatch } from "../studioCommands";
import { prepareStudioDirectorProposal } from "../studioDirectorProposals";
import { buildDirectorReframeRequest, buildDirectorMomentRequest, validDirectorReframeEvidence } from "../studioDirectorWorkspaceProposals";
import { createSourceShotDirectorDraft, restoreSourceShotDirectorDraft } from "../studioDirectorSavedDraft";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder;
});
const copy = value => JSON.parse(JSON.stringify(value));
const fixture = (multiple = false) => {
  const source = { id: "source", start: 0, end: 12, duration: 12,
    contentHash: "e".repeat(64), storagePath: "studio/sources/owner/a.mp4" };
  const snapshot = { orderedClips: [source], selectedClipId: source.id,
    timeline: [{ ...source, id: "main", sourceClipId: "source", startRequest: 0, endRequest: 12 },
      ...(multiple ? [{ ...source, id: "later", sourceClipId: "source", startRequest: 0, endRequest: 5 }] : [])],
    smartCrop: false, smartCropMode: "off", reframeAspect: "16:9", speakerTrackZoom: 1,
    reframeKeyframes: [{ id: "original", time: 0, x: 20, y: 40 }], reframeModeCuts: [],
    overlays: [], motionScenes: [], threeDScenes: [], soundEffects: [], voiceovers: [], adjustmentLayers: [],
  };
  const document = adaptStudioSnapshotToDocument({ projectId: "director-project", snapshot });
  snapshot.studioDocument = document;
  const analysis = { mode: "source_shots", engine: "opencv-yunet-source-shot-follow", start: 0, end: 12,
    reviewRequired: true, sceneCuts: [5], decodeFailures: [], editPlan: { version: 1, preflight: { passed: true } },
    tracks: { solo: { coverage: .9, keyframes: [{ time: 0, x: 30, y: 40 }, { time: 5, x: 70, y: 45, cut: true }, { time: 11.5, x: 60, y: 50 }] } },
    sourceShotArtifact: { projectId: document.projectId, sourceAssetId: document.assets[0].assetId,
      artifactHash: "d".repeat(64), sourceSha256: "e".repeat(64),
      analysisRange: { space: "source", startTick: 0, endTick: 1080000 } },
  };
  const request = buildDirectorReframeRequest({ document, occurrenceId: "main", analysis,
    aspect: "9:16", zoom: 1.1, sourceAspect: 16 / 9, proposalId: "follow-proposal", idempotencyKey: "follow-command" });
  return { document, snapshot, analysis, request };
};

test("Director framing uses the shared command and exact canonical snapshot projection", async () => {
  const f = fixture(), before = copy(f.document);
  const { proposal, preview } = await prepareStudioDirectorProposal(f.document, f.request);
  expect(f.document).toEqual(before);
  expect(preview.previewDocument.clipOccurrences).toEqual(before.clipOccurrences);
  const result = runStudioCommandOnSnapshot({ snapshot: f.snapshot, projectId: f.document.projectId, batch: proposal.batch });
  expect(result.document.visualGraph.settings).toMatchObject({ reframeAspect: "9:16", videoFit: "cover" });
  expect(result.snapshot.reframeModeCuts).toEqual([expect.objectContaining({ mode: "speaker_track", time: 0 })]);
  expect(result.snapshot.reframeModeCuts[0]).not.toHaveProperty("zoom");
  expect(result.snapshot.reframeKeyframes).toHaveLength(4);
  expect(result.snapshot.reframeKeyframes[1]).toMatchObject({ time: 5, cut: true, sourceFocus: { x: 70, y: 45, aspect: 16 / 9 } });
  expect(result.document.revision).toBe(f.document.revision + 1);
});

test("Undo restores exact framing and output decisions while retaining the journal", async () => {
  const f = fixture(), { proposal } = await prepareStudioDirectorProposal(f.document, f.request);
  const result = runStudioCommandOnSnapshot({ snapshot: f.snapshot, projectId: f.document.projectId, batch: proposal.batch });
  const restored = undoStudioCommandBatch(result.document, { baseRevision: result.document.revision, actor: { type: "human", id: "owner" }, idempotencyKey: "undo-framing" });
  expect(restored.document.visualGraph).toEqual(f.document.visualGraph);
  expect(restored.document.output).toEqual(f.document.output);
  expect(restored.document.linkedTiming).toEqual(f.document.linkedTiming);
});

test("a target occurrence preserves later clips and their original framing", async () => {
  const f = fixture(true);f.request.operation.zoom = 1;f.request.operation.aspect = "16:9";
  const { proposal } = await prepareStudioDirectorProposal(f.document, f.request);
  const after = dryRunStudioCommandBatch(f.document, proposal.batch).previewDocument;
  const state = projectStudioEditableStateToSnapshot(after, f.snapshot);
  expect(after.clipOccurrences).toEqual(f.document.clipOccurrences);
  expect(state.reframeModeCuts.at(-1)).toMatchObject({ time: 12, mode: "off" });
  expect(state.reframeKeyframes.at(-1)).toMatchObject({ time: 12, x: 20, y: 40, cut: true });
  expect(state.videoFit).toBe(f.snapshot.videoFit);
  expect(state.safeFaceFraming).toBe(f.snapshot.safeFaceFraming);
});

test.each(["points", "source", "unbounded", "incomplete", "reverse", "locks", "unverified-result"])("unsafe %s framing cannot prepare a review", async kind => {
  const f = fixture();
  if (kind === "points") f.request.operation.keyframes[1].x = NaN;
  if (kind === "source") f.request.evidence.sourceSha256 = "a".repeat(64);
  if (kind === "unbounded") f.request.operation.zoom = 50;
  if (kind === "incomplete") f.request.operation.keyframes.at(-1).sourceTick -= 1;
  if (kind === "reverse") f.document.clipOccurrences[0].playback.direction = "reverse";
  if (kind === "locks") f.document.constraints.locks.push({ lockId: "keep", occurrenceId: "main", sourceRange: f.document.clipOccurrences[0].sourceRange, mode: "preserve" });
  if (kind === "unverified-result") delete f.request.evidence;
  await expect(prepareStudioDirectorProposal(f.document, f.request)).rejects.toBeTruthy();
});

test("framing evidence cannot substitute different tracking coordinates", () => {
  const f = fixture(); expect(validDirectorReframeEvidence(f.request.evidence, f.request.operation)).toBe(true);
  f.request.operation.keyframes[1].x = 2;
  expect(validDirectorReframeEvidence(f.request.evidence, f.request.operation)).toBe(false);
});

test("Director picks an owned scored moment and trims both boundaries through the existing command", async () => {
  const f = fixture();
  const request = buildDirectorMomentRequest({ document: f.document, occurrenceId: "main",
    proposalId: "moment", idempotencyKey: "moment-command", candidates: [
      { start: 1, end: 10, storagePath: "studio/sources/other/not-owned.mp4", score: 100 },
      { start: 2, end: 9, storagePath: "studio/sources/owner/a.mp4", score: 80 },
      { start: 1, end: 8, storagePath: "studio/sources/owner/a.mp4", score: 70 },
    ] });
  expect(request.operation.keep).toEqual({ space: "source", startTick: 180000, endTick: 810000 });
  const { proposal } = await prepareStudioDirectorProposal(f.document, request);
  const result = runStudioCommandOnSnapshot({ snapshot: f.snapshot, projectId: f.document.projectId, batch: proposal.batch });
  expect(result.snapshot.timeline[0]).toMatchObject({ startRequest: 2, endRequest: 9 });
  expect(f.snapshot.timeline[0]).toMatchObject({ startRequest: 0, endRequest: 12 });
});

test.each(["outside", "same", "tiny-edge", "other-source"])("Director does not invent a moment for %s candidates", kind => {
  const f = fixture();const candidate = { start: 2, end: 9, storagePath: "studio/sources/owner/a.mp4" };
  if (kind === "outside") candidate.end = 50;
  if (kind === "same") { candidate.start = 0; candidate.end = 12; }
  if (kind === "tiny-edge") candidate.start = .1;
  if (kind === "other-source") candidate.storagePath = "another";
  expect(buildDirectorMomentRequest({ document: f.document, occurrenceId: "main", candidates: [candidate] })).toBeNull();
});

test("unapproved framing and moment requests survive the same source-bound save/reopen contract", async () => {
  const f = fixture();
  const moment = buildDirectorMomentRequest({ document: f.document, occurrenceId: "main", proposalId: "moment", idempotencyKey: "moment-command",
    candidates: [{ start: 2, end: 9, storagePath: "studio/sources/owner/a.mp4" }] });
  for (const request of [f.request, moment]) {
    const state = await createSourceShotDirectorDraft(f.document, { request, occurrenceId: "main" });
    expect(state).not.toBeNull();
    const restored = await restoreSourceShotDirectorDraft(f.document, copy(state.savedDraft));
    expect(restored.request).toEqual(request);expect(restored).not.toHaveProperty("reviewReceipt");
  }
});
