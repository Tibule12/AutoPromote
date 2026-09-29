import { MINIMUM_SPLIT_DISTANCE_TICKS } from "./studioCommands";
import { validateStudioProjectDocument } from "./studioProjectDocument";
import { secondsToTicks } from "./studioTime";

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
  if (
    analysis?.mode !== "source_shots" ||
    analysis.engine !== SOURCE_SHOT_DIRECTOR_ENGINE ||
    analysis.reviewRequired !== true ||
    analysis.editPlan?.version !== 1 ||
    analysis.editPlan?.preflight?.passed !== true ||
    !Array.isArray(analysis.sceneCuts) ||
    !Number.isFinite(coverage) || coverage < 0.65 || coverage > 1 ||
    Number(analysis.decodeFailures) !== 0 ||
    !Number.isFinite(Number(analysis.start)) ||
    !Number.isFinite(Number(analysis.end)) ||
    Number(analysis.start) < 0 ||
    Number(analysis.end) <= Number(analysis.start) ||
    !asset
  ) return null;

  const analysisRange = {
    space: "source",
    startTick: secondsToTicks(Number(analysis.start)),
    endTick: secondsToTicks(Number(analysis.end)),
  };
  if (analysisRange.startTick < occurrence.sourceRange.startTick ||
      analysisRange.endTick > occurrence.sourceRange.endTick) return null;
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
      analysisRange,
      boundaryTick,
      sampleCoverage: Number(coverage.toFixed(6)),
      verification: "needs_review",
      decodeFailures: 0,
    },
  };
};
