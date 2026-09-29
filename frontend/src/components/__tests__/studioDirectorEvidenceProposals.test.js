import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { buildSourceShotDirectorSplitRequest } from "../studioDirectorEvidenceProposals";
import {
  applyStudioDirectorProposal,
  createStudioDirectorReviewReceipt,
  prepareStudioDirectorProposal,
  recordStudioDirectorReviewRejection,
} from "../studioDirectorProposals";
import { adaptStudioSnapshotToDocument } from "../studioProjectDocument";
import { secondsToTicks } from "../studioTime";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder;
});

const document = () => adaptStudioSnapshotToDocument({
  projectId: "evidence-project",
  snapshot: {
    orderedClips: [{ id: "source", start: 0, end: 20 }],
    selectedClipId: "source",
    timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 20 }],
  },
});
const analysis = () => ({
  mode: "source_shots",
  engine: "opencv-yunet-source-shot-follow",
  start: 0,
  end: 20,
  sceneCuts: [-1, 0.1, 8, 14, 19.95],
  reviewRequired: true,
  decodeFailures: [],
  tracks: { solo: { coverage: 0.9 } },
  editPlan: { version: 1, preflight: { passed: true } },
  sourceShotArtifact: {
    artifactHash: "d".repeat(64),
    sourceSha256: "e".repeat(64),
    projectId: "evidence-project",
    sourceAssetId: "source:source",
    analysisRange: { space: "source", startTick: 0, endTick: secondsToTicks(20) },
    createdAt: "2026-09-29T17:00:00.000Z",
  },
});
const request = (project, response = analysis()) => buildSourceShotDirectorSplitRequest({
  document: project,
  occurrenceId: "main",
  analysis: response,
  preferredSourceTick: secondsToTicks(13),
  proposalId: "detected-shot-1",
  idempotencyKey: "detected-shot-command-1",
});

test("detected source shot produces one evidence-bound, reviewable split", async () => {
  const project = document();
  const suggested = request(project);
  expect(suggested.operation).toEqual({
    type: "split_clip",
    target: { occurrenceId: "main" },
    at: { space: "source", ticks: secondsToTicks(14) },
    newOccurrenceIds: { left: "detected-shot-1-left", right: "detected-shot-1-right" },
  });
  expect(suggested.evidence).toMatchObject({
    type: "source_shot_boundary",
    sourceAssetId: project.clipOccurrences[0].assetId,
    sourceIdentityState: "legacy_reference_unverified",
    sourceContentHash: null,
    artifactHash: "d".repeat(64),
    sourceSha256: "e".repeat(64),
    sampleCoverage: 0.9,
    verification: "needs_review",
  });
  const { proposal, preview } = await prepareStudioDirectorProposal(project, suggested);
  expect(proposal.evidence).toEqual(suggested.evidence);
  expect(preview.previewDocument.clipOccurrences).toHaveLength(2);
  expect(project.clipOccurrences).toHaveLength(1);

  const receipt = await createStudioDirectorReviewReceipt({
    proposal, reviewerId: "human-1", decision: "approve", reviewedAt: "2026-09-29T17:00:00Z",
  });
  const serverReview = {
    serverReviewId: "f".repeat(64), projectId: proposal.projectId,
    proposalId: proposal.proposalId, baseRevision: proposal.baseRevision,
    proposalFingerprint: proposal.proposalFingerprint, decision: "approve",
    reviewerUid: "human-1", reviewedAt: receipt.reviewedAt,
  };
  const applied = await applyStudioDirectorProposal({
    document: project, proposal, reviewReceipt: receipt, serverReview,
  });
  expect(applied.document.clipOccurrences.map(item => item.occurrenceId)).toEqual([
    "detected-shot-1-left", "detected-shot-1-right",
  ]);
  expect(applied.document.directorReviewJournal[0].serverReview).toEqual(serverReview);
  expect(applied.document.directorReviewJournal[0].identityStatus).toBe("client_claim_unverified");
});

test("reject record retains a matching server reference without an edit", async () => {
  const project = document();
  const { proposal } = await prepareStudioDirectorProposal(project, request(project));
  const receipt = await createStudioDirectorReviewReceipt({
    proposal, reviewerId: "human-1", decision: "reject", reviewedAt: "2026-09-29T17:00:00Z",
  });
  const serverReview = {
    serverReviewId: "a".repeat(64), projectId: proposal.projectId,
    proposalId: proposal.proposalId, baseRevision: proposal.baseRevision,
    proposalFingerprint: proposal.proposalFingerprint, decision: "reject",
    reviewerUid: receipt.reviewerId, reviewedAt: receipt.reviewedAt,
  };
  const rejected = await recordStudioDirectorReviewRejection({
    document: project, proposal, reviewReceipt: receipt, serverReview,
  });
  expect(rejected.document.revision).toBe(0);
  expect(rejected.document.directorReviewJournal[0].serverReview).toEqual(serverReview);
  await expect(recordStudioDirectorReviewRejection({
    document: project, proposal, reviewReceipt: receipt,
    serverReview: { ...serverReview, reviewerUid: "someone-else" },
  })).rejects.toMatchObject({ code: "INVALID_SERVER_REVIEW" });
});

test("bad analysis and inconsistent evidence never produce an editable proposal", async () => {
  const project = document();
  expect(request(project, { ...analysis(), mode: "anchored" })).toBeNull();
  expect(request(project, { ...analysis(), tracks: { solo: { coverage: 0.4 } } })).toBeNull();
  expect(request(project, { ...analysis(), decodeFailures: [0] })).toBeNull();
  expect(request(project, { ...analysis(), sourceShotArtifact: null })).toBeNull();
  expect(request(project, { ...analysis(), sourceShotArtifact: {
    ...analysis().sourceShotArtifact, sourceSha256: "not-a-sha256",
  } })).toBeNull();
  expect(request(project, { ...analysis(), sourceShotArtifact: {
    ...analysis().sourceShotArtifact, sourceAssetId: "wrong-asset",
  } })).toBeNull();
  expect(request(project, { ...analysis(), sceneCuts: [0.1, 19.95] })).toBeNull();
  const suggested = request(project);
  await expect(prepareStudioDirectorProposal(project, {
    ...suggested, evidence: { ...suggested.evidence, boundaryTick: secondsToTicks(8) },
  })).rejects.toMatchObject({ code: "INVALID_DIRECTOR_EVIDENCE" });
});
