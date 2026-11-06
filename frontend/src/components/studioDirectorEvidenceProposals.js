import { MINIMUM_SPLIT_DISTANCE_TICKS } from "./studioCommands";
import { validateStudioProjectDocument } from "./studioProjectDocument";
import { secondsToTicks, TICKS_PER_SECOND } from "./studioTime";

export const SOURCE_SHOT_DIRECTOR_ENGINE = "opencv-yunet-source-shot-follow";

// A detected source-camera cut is evidence for a possible clip boundary, not
// an editorial decision. Return one reviewable command request, never an edit.
export const buildSourceShotDirectorSplitRequest = ({
  document,
  occurrenceId,
  analysis,
  preferredSourceTick,
  proposalId,
  idempotencyKey,
}) => {
  validateStudioProjectDocument(document);
  if (typeof proposalId !== "string" || !proposalId || proposalId.length > 140 ||
      typeof idempotencyKey !== "string" || !idempotencyKey || idempotencyKey.length > 160) {
    throw new Error("Director proposal and idempotency IDs are required.");
  }
  const occurrence = document.clipOccurrences.find(item => item.occurrenceId === occurrenceId);
  if (!occurrence || occurrence.playback?.direction !== "forward" || occurrence.playback?.freeze) {
    return null;
  }
  const asset = document.assets.find(item => item.assetId === occurrence.assetId);
  const coverage = Number(analysis?.tracks?.solo?.coverage);
  const artifact = analysis?.sourceShotArtifact;
  const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (
    analysis?.mode !== "source_shots" ||
    analysis.engine !== SOURCE_SHOT_DIRECTOR_ENGINE ||
    analysis.reviewRequired !== true ||
    analysis.editPlan?.version !== 1 ||
    analysis.editPlan?.preflight?.passed !== true ||
    !Array.isArray(analysis.sceneCuts) ||
    !Number.isFinite(coverage) || coverage < 0.65 || coverage > 1 ||
    !Array.isArray(analysis.decodeFailures) || analysis.decodeFailures.length !== 0 ||
    !Number.isFinite(Number(analysis.start)) ||
    !Number.isFinite(Number(analysis.end)) ||
    Number(analysis.start) < 0 ||
    Number(analysis.end) <= Number(analysis.start) ||
    !asset ||
    !validHash(artifact?.artifactHash) ||
    !validHash(artifact?.sourceSha256) ||
    artifact.projectId !== document.projectId ||
    artifact.sourceAssetId !== asset.assetId ||
    (asset.identityState === "hash_verified" && asset.contentHash !== artifact.sourceSha256)
  ) return null;

  const analysisRange = {
    space: "source",
    startTick: secondsToTicks(Number(analysis.start)),
    endTick: secondsToTicks(Number(analysis.end)),
  };
  if (analysisRange.startTick < occurrence.sourceRange.startTick ||
      analysisRange.endTick > occurrence.sourceRange.endTick ||
      artifact.analysisRange?.space !== "source" ||
      artifact.analysisRange?.startTick !== analysisRange.startTick ||
      artifact.analysisRange?.endTick !== analysisRange.endTick) return null;
  const cuts = [...new Set(analysis.sceneCuts
    .filter(value => typeof value === "number" && Number.isFinite(value) &&
      value > Number(analysis.start) && value < Number(analysis.end))
    .map(secondsToTicks))]
    .filter(tick =>
      tick > analysisRange.startTick && tick < analysisRange.endTick &&
      tick - occurrence.sourceRange.startTick >= MINIMUM_SPLIT_DISTANCE_TICKS &&
      occurrence.sourceRange.endTick - tick >= MINIMUM_SPLIT_DISTANCE_TICKS);
  if (!cuts.length) return null;
  const preferred = Number.isSafeInteger(preferredSourceTick)
    ? preferredSourceTick
    : Math.floor((occurrence.sourceRange.startTick + occurrence.sourceRange.endTick) / 2);
  cuts.sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred) || left - right);
  const boundaryTick = cuts[0];
  return {
    proposalId,
    idempotencyKey,
    directorId: "studio-source-shot-analysis-v1",
    operation: {
      type: "split_clip",
      target: { occurrenceId },
      at: { space: "source", ticks: boundaryTick },
      newOccurrenceIds: {
        left: `${proposalId}-left`,
        right: `${proposalId}-right`,
      },
    },
    evidence: {
      schemaVersion: 1,
      type: "source_shot_boundary",
      provider: "studio_face_tracking",
      engine: SOURCE_SHOT_DIRECTOR_ENGINE,
      sourceAssetId: asset.assetId,
      sourceIdentityState: asset.identityState,
      sourceContentHash: asset.contentHash || null,
      artifactHash: artifact.artifactHash,
      sourceSha256: artifact.sourceSha256,
      analysisRange,
      boundaryTick,
      sampleCoverage: Number(coverage.toFixed(6)),
      verification: "needs_review",
      decodeFailures: 0,
    },
  };
};


// Keep each choice inside the existing one-operation review protocol. A list
// of detected boundaries is not permission to apply a batch or execute work.
export const buildSourceShotDirectorSplitCandidates = options => {
  if (typeof options?.proposalId !== "string" || options.proposalId.length > 130 ||
      typeof options?.idempotencyKey !== "string" || options.idempotencyKey.length > 150) {
    throw new Error("Director candidate IDs leave room for a unique cut suffix.");
  }
  const sourceCuts = options.analysis?.sceneCuts;
  if (!Array.isArray(sourceCuts) || sourceCuts.length > 10000) return [];
  if (!buildSourceShotDirectorSplitRequest(options)) return [];
  const times = [...new Set(sourceCuts.filter(time => typeof time === "number" && Number.isFinite(time) &&
    time >= 0 && Number.isSafeInteger(Math.round(time * TICKS_PER_SECOND))))]
    .sort((a, b) => a - b);
  const requests = [];
  const seen = new Set();
  for (const time of times) {
    const tick = secondsToTicks(time);
    const request = buildSourceShotDirectorSplitRequest({ ...options,
      // Select a boundary actually present in this result; retain the exact
      // artifact/source proof. Server settlement still verifies that artifact.
      analysis: { ...options.analysis, sceneCuts: [time] },
      preferredSourceTick: tick,
      proposalId: `${options.proposalId}-${requests.length + 1}`,
      idempotencyKey: `${options.idempotencyKey}-${requests.length + 1}`,
    });
    if (!request || request.operation.at.ticks !== tick || seen.has(tick)) continue;
    seen.add(tick); requests.push(request);
    if (requests.length === 64) break;
  }
  return requests;
};
