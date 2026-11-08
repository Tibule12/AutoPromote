import { validateStudioProjectDocument } from "./studioProjectDocument";
import { validateStudioReframeOperation } from "./studioReframeCommand";
import { secondsToTicks } from "./studioTime";

export const sourceShotWorkerResult = analysis => {
  const { sourceShotArtifact: _sourceShot, analysisArtifact: _analysis, ...workerResult } = analysis || {};
  return workerResult;
};

const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export const validDirectorReframeEvidence = (evidence, operation) => {
  try {
    const keys = ["schemaVersion", "type", "provider", "engine", "sourceAssetId", "sourceIdentityState",
      "sourceContentHash", "artifactHash", "sourceSha256", "analysisRange", "sampleCoverage", "verification", "decodeFailures", "workerResult"];
    if (!evidence || Object.keys(evidence).length !== keys.length || !keys.every(key => Object.prototype.hasOwnProperty.call(evidence, key)) ||
        evidence.schemaVersion !== 1 || evidence.type !== "source_shot_reframe" || evidence.provider !== "studio_face_tracking" ||
        evidence.engine !== "opencv-yunet-source-shot-follow" || evidence.verification !== "needs_review" || evidence.decodeFailures !== 0 ||
        !/^[a-f0-9]{64}$/.test(evidence.artifactHash || "") || !/^[a-f0-9]{64}$/.test(evidence.sourceSha256 || "") ||
        !["hash_verified", "legacy_reference_unverified"].includes(evidence.sourceIdentityState) ||
        (evidence.sourceIdentityState === "hash_verified" ? evidence.sourceContentHash !== evidence.sourceSha256 : evidence.sourceContentHash !== null) ||
        evidence.sampleCoverage !== Number(evidence.workerResult?.tracks?.solo?.coverage?.toFixed(6)) ||
        evidence.analysisRange?.space !== "source" || Object.keys(evidence.analysisRange).length !== 3 ||
        evidence.analysisRange.startTick !== secondsToTicks(evidence.workerResult.start) ||
        evidence.analysisRange.endTick !== secondsToTicks(evidence.workerResult.end)) return false;
    const { preconditions: _preconditions, ...withoutPreconditions } = operation;
    const rebuilt = buildDirectorReframeOperation({ ...operation, occurrenceId: operation.target.occurrenceId, analysis: evidence.workerResult });
    return stable(rebuilt) === stable(withoutPreconditions);
  } catch (_) { return false; }
};

// This operation changes framing only. Grades, captions, split layouts and
// unrelated sources are not inferred from a face detector's edit-plan hints.
export const buildDirectorReframeOperation = ({ occurrenceId, analysis, aspect, zoom, sourceAspect }) => {
  const track = analysis?.tracks?.solo;
  if (analysis?.mode !== "source_shots" || analysis.engine !== "opencv-yunet-source-shot-follow" ||
      analysis.reviewRequired !== true || analysis.editPlan?.version !== 1 || analysis.editPlan?.preflight?.passed !== true ||
      analysis.decodeFailures?.length !== 0 || !Number.isFinite(track?.coverage) || track.coverage < .65 || track.coverage > 1 ||
      ![analysis.start, analysis.end].every(value => typeof value === "number" && Number.isFinite(value)) ||
      !Array.isArray(track.keyframes) || track.keyframes.length < 2 || track.keyframes.length > 126) {
    throw new Error("Director needs complete, sufficiently covered source-shot tracking before proposing framing.");
  }
  const start = secondsToTicks(analysis.start), end = secondsToTicks(analysis.end);
  if (!(end > start)) throw new Error("The tracked source range is invalid.");
  const points = track.keyframes.map(mark => ({ sourceTick: secondsToTicks(mark.time),
    x: mark.x, y: mark.y, cut: mark.cut === true }));
  if (points.some(point => point.sourceTick < start || point.sourceTick > end))
    throw new Error("Tracking points extend beyond the analyzed source range.");
  if (points[0].sourceTick > start) points.unshift({ ...points[0], sourceTick: start });
  if (points.at(-1).sourceTick < end) points.push({ ...points.at(-1), sourceTick: end, cut: false });
  return validateStudioReframeOperation({ type: "reframe", target: { occurrenceId }, aspect, zoom, sourceAspect, keyframes: points });
};

export const buildDirectorReframeRequest = ({ document, occurrenceId, analysis, aspect, zoom, sourceAspect, proposalId, idempotencyKey }) => {
  validateStudioProjectDocument(document);
  const occurrence = document.clipOccurrences.find(item => item.occurrenceId === occurrenceId);
  const asset = document.assets.find(item => item.assetId === occurrence?.assetId);
  const artifact = analysis?.sourceShotArtifact;
  if (!asset || artifact?.projectId !== document.projectId || artifact.sourceAssetId !== asset.assetId ||
      !/^[a-f0-9]{64}$/.test(artifact.artifactHash || "") || !/^[a-f0-9]{64}$/.test(artifact.sourceSha256 || "") ||
      (asset.identityState === "hash_verified" && asset.contentHash !== artifact.sourceSha256) ||
      artifact.analysisRange?.startTick !== occurrence.sourceRange.startTick ||
      artifact.analysisRange?.endTick !== occurrence.sourceRange.endTick) {
    throw new Error("Director framing requires analysis bound to this project's exact owned source range.");
  }
  return { proposalId, idempotencyKey, directorId: "studio-reviewed-follow-v1",
    operation: buildDirectorReframeOperation({ occurrenceId, analysis, aspect, zoom, sourceAspect }),
    evidence: { schemaVersion: 1, type: "source_shot_reframe", provider: "studio_face_tracking",
      engine: analysis.engine, sourceAssetId: asset.assetId, sourceIdentityState: asset.identityState,
      sourceContentHash: asset.contentHash || null, artifactHash: artifact.artifactHash,
      sourceSha256: artifact.sourceSha256, analysisRange: artifact.analysisRange,
      sampleCoverage: Number(analysis.tracks.solo.coverage.toFixed(6)), verification: "needs_review",
      decodeFailures: 0, workerResult: sourceShotWorkerResult(analysis) } };
};

// Rank only the existing source-bound suggestions; scores are editorial hints,
// never a promise of virality or model confidence. The owner reviews the range.
export const buildDirectorMomentRequest = ({ document, occurrenceId, candidates, proposalId, idempotencyKey }) => {
  validateStudioProjectDocument(document);
  const occurrence = document.clipOccurrences.find(item => item.occurrenceId === occurrenceId);
  const asset = document.assets.find(item => item.assetId === occurrence?.assetId);
  if (!occurrence || !asset) return null;
  const eligible = (candidates || []).flatMap(candidate => {
    const clip = candidate.clip || candidate;
    const path = clip.sourceStoragePath || clip.storagePath;
    const hash = clip.contentHash || clip.sha256;
    if (!(asset.storagePath && path === asset.storagePath) && !(asset.contentHash && hash === asset.contentHash)) return [];
    if (hash && asset.contentHash && hash !== asset.contentHash) return [];
    const start = Number(clip.start), end = Number(clip.end);
    if (![start, end].every(Number.isFinite) || start < 0 || end <= start) return [];
    const keep = { space: "source", startTick: secondsToTicks(start), endTick: secondsToTicks(end) };
    const removed = [keep.startTick - occurrence.sourceRange.startTick, occurrence.sourceRange.endTick - keep.endTick];
    if (keep.endTick - keep.startTick < 18000 || removed.some(value => value < 0 || (value > 0 && value < 18000)) ||
        removed.every(value => value === 0)) return [];
    const score = Number(candidate.score ?? clip.guidedScore ?? clip.score ?? clip.viralScore ?? 0);
    return [{ keep, score: Number.isFinite(score) ? score : 0 }];
  }).sort((a, b) => b.score - a.score || a.keep.startTick - b.keep.startTick);
  return eligible.length ? { proposalId, idempotencyKey, directorId: "studio-moment-ranking-v1",
    operation: { type: "trim_clip", target: { occurrenceId }, keep: eligible[0].keep } } : null;
};
