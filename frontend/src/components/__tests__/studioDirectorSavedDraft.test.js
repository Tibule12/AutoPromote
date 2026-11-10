import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { buildSourceShotDirectorSplitRequest, buildSourceShotDirectorSplitCandidates } from "../studioDirectorEvidenceProposals";
import { createSourceShotDirectorDraft, restoreSourceShotDirectorDraft, sourceShotDirectorDraftMatches } from "../studioDirectorSavedDraft";
import { prepareStudioDirectorProposal, createStudioDirectorReviewReceipt,
  recordStudioDirectorReviewRejection } from "../studioDirectorProposals";
import { secondsToTicks } from "../studioTime";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder;
});

const copy = value => JSON.parse(JSON.stringify(value));
const fixture = () => {
  const document = adaptStudioSnapshotToDocument({ projectId: "saved-director-project", snapshot: {
    orderedClips: [{ id: "source", start: 0, end: 20 }], selectedClipId: "source",
    timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 20,
      contentHash: "e".repeat(64), sourceStoragePath: "studio/sources/owner/source.mp4" }],
  } });
  const options = { document, occurrenceId: "main", preferredSourceTick: 0,
    proposalId: "saved-cut", idempotencyKey: "saved-command", analysis: {
      mode: "source_shots", engine: "opencv-yunet-source-shot-follow", start: 0, end: 20,
      sceneCuts: [8, 14], reviewRequired: true, decodeFailures: [],
      tracks: { solo: { coverage: .9 } }, editPlan: { version: 1, preflight: { passed: true } },
      sourceShotArtifact: { artifactHash: "d".repeat(64), sourceSha256: "e".repeat(64),
        projectId: document.projectId, sourceAssetId: document.assets[0].assetId,
        analysisRange: { space: "source", startTick: 0, endTick: secondsToTicks(20) } },
    } };
  return { document, options, request: buildSourceShotDirectorSplitRequest(options),
    choices: buildSourceShotDirectorSplitCandidates(options), occurrenceId: "main" };
};

test("a native JSON save/reopen retains the exact selected cut and command identities, without an approval", async () => {
  const f = fixture(), before = copy(f.document);
  const state = await createSourceShotDirectorDraft(f.document, f);
  state.savedDraft.selectedProposalId = state.choices[1].proposalId;
  const restored = await restoreSourceShotDirectorDraft(f.document, copy(state.savedDraft));
  expect(restored.request).toEqual(f.choices[1]);
  expect(restored.request).toBe(restored.choices[1]);
  expect(restored.choices).toEqual(f.choices);
  expect(restored).not.toHaveProperty("reviewReceipt");
  expect(restored).not.toHaveProperty("serverReview");
  expect(f.document).toEqual(before);
  expect(f.document.clipOccurrences).toHaveLength(1);
});

test("an unrelated later edit still needs a freshly prepared current revision", async () => {
  const f = fixture(), state = await createSourceShotDirectorDraft(f.document, f);
  const changed = { ...f.document, revision: f.document.revision + 1 };
  const restored = await restoreSourceShotDirectorDraft(changed, state.savedDraft);
  const { proposal } = await prepareStudioDirectorProposal(changed, restored.request);
  expect(proposal.baseRevision).toBe(changed.revision);
  expect(restored.request).not.toHaveProperty("proposalFingerprint");
});

test.each(["project", "path", "hash", "range", "occurrence", "playback"])("a changed %s cannot revive a stale suggestion", async kind => {
  const f = fixture(), state = await createSourceShotDirectorDraft(f.document, f), changed = copy(f.document);
  if (kind === "project") changed.projectId = "another-project";
  if (kind === "path") changed.assets[0].storagePath = "studio/sources/owner/other.mp4";
  if (kind === "hash") changed.assets[0].contentHash = "a".repeat(64);
  if (kind === "range") changed.clipOccurrences[0].sourceRange.startTick = secondsToTicks(1);
  if (kind === "occurrence") changed.clipOccurrences[0].occurrenceId = "replaced";
  if (kind === "playback") changed.clipOccurrences[0].playback.direction = "reverse";
  expect(sourceShotDirectorDraftMatches(changed, state.savedDraft)).toBe(false);
  expect(await restoreSourceShotDirectorDraft(changed, state.savedDraft)).toBeNull();
});

test.each(["approval", "duplicate-command", "missing-choice", "changed-time", "wrong-engine", "unbounded"])("malformed %s data is discarded without preventing project access", async kind => {
  const f = fixture(), state = await createSourceShotDirectorDraft(f.document, f), draft = copy(state.savedDraft);
  if (kind === "approval") draft.requests[0].serverReview = { decision: "approve" };
  if (kind === "duplicate-command") draft.requests[1].idempotencyKey = draft.requests[0].idempotencyKey;
  if (kind === "missing-choice") draft.choiceProposalIds.push("not-present");
  if (kind === "changed-time") draft.requests[0].operation.at.ticks = secondsToTicks(9);
  if (kind === "wrong-engine") draft.requests[0].evidence.engine = "client-claim";
  if (kind === "unbounded") draft.requests = Array(66).fill(draft.requests[0]);
  expect(await restoreSourceShotDirectorDraft(f.document, draft)).toBeNull();
  expect(f.document.clipOccurrences).toHaveLength(1);
});

test("a recorded rejection is not revived as approval-ready after recovery", async () => {
  const f = fixture(), state = await createSourceShotDirectorDraft(f.document, f);
  const { proposal } = await prepareStudioDirectorProposal(f.document, f.request);
  const receipt = await createStudioDirectorReviewReceipt({ proposal, reviewerId: "owner", decision: "reject", reviewedAt: "2026-11-07T08:00:00Z" });
  const rejected = await recordStudioDirectorReviewRejection({ document: f.document, proposal, reviewReceipt: receipt });
  const restored = await restoreSourceShotDirectorDraft(rejected.document, state.savedDraft);
  expect(restored.request.proposalId).not.toBe(proposal.proposalId);
  expect(restored.savedDraft.requests.some(item => item.proposalId === proposal.proposalId)).toBe(false);
  expect(restored).not.toHaveProperty("reviewReceipt");
  expect(rejected.document.clipOccurrences).toHaveLength(1);
});

test("applying a split removes its target, so the old suggestion cannot be restored", async () => {
  const f = fixture(), state = await createSourceShotDirectorDraft(f.document, f);
  const { preview } = await prepareStudioDirectorProposal(f.document, f.request);
  expect(await restoreSourceShotDirectorDraft(preview.previewDocument, state.savedDraft)).toBeNull();
});

test("64 eligible choices remain bounded and preserve their IDs across a save", async () => {
  const f = fixture(); f.options.analysis.sceneCuts = Array.from({ length: 95 }, (_, i) => .5 + i * .2);
  const choices = buildSourceShotDirectorSplitCandidates(f.options);
  const state = await createSourceShotDirectorDraft(f.document, { ...f, choices });
  expect(state.choices).toHaveLength(64);
  expect(new TextEncoder().encode(JSON.stringify(state.savedDraft)).byteLength).toBeLessThan(128 * 1024);
  expect((await restoreSourceShotDirectorDraft(f.document, copy(state.savedDraft))).choices).toEqual(choices);
});
