const { createProjectIntelligenceRevision, validateProjectIntelligenceRevision, summarizeProjectIntelligence,
  digest } = require("./studioProjectIntelligenceContract");
// Called only after byte verification and asset review in the private worker.
// Customer registration continues to reject all server-generated provenance.
function buildFactoryIntelligence({ projectId, ownerUid, assets, direction }) {
  const accepted = assets.filter(a => a.status === "accepted");
  const revision = createProjectIntelligenceRevision({ schemaVersion: 1, projectId, ownerUid,
    baseRevisionId: null, createdBy: { kind: "content_factory", id: ownerUid },
    assets: accepted.map(a => {
      const durationTicks = Math.round(a.artifact.duration * 90000);
      const kind = a.type === "audio" ? "audio" : a.artifact.container==="png" ? "image" : "video";
      return { assetId: a.assetId, projectId, ownerUid, contentHash: a.artifact.sha256,
        sourceRef: { kind: "studio_source_binding", sourceAssetId: a.assetId }, durationTicks, mediaType: kind,
        streams: kind === "image" ? [] : [{ streamId: `${a.assetId}:${kind}`, assetId: a.assetId, kind,
          timebase: { numerator: 1, denominator: 90000 }, durationTicks,
          sampleRateHz: kind === "audio" ? 48000 : null,
          frameRate: kind === "video" ? { numerator: a.artifact.fps || 24, denominator: 1 } : null,
          channelLayout: kind === "audio" ? "stereo" : null }],
        technical: { container: a.artifact.container || (kind === "audio" ? "wav" : "mp4"), codec: a.artifact.codec || (kind === "audio" ? "pcm_s16le" : "h264") },
        provenance: { origin: "server_generated", method: `Content Factory receipt ${digest(a.provenance)}` } };
    }),
    evidenceRefs: accepted.map(a => ({ evidenceId: `generation:${a.assetId}`, kind: "generated_asset",
      sourceAssetId: a.assetId, sourceContentHash: a.artifact.sha256,
      artifactHash: digest({ provenance: a.provenance, artifact: a.artifact, review: a.review }),
      analysisType: "content_generation", modelRevision: digest({ model: a.provenance.model, revision: a.provenance.modelRevision }),
      configHash: digest(a.provenance.settings), dependencyHashes: [a.provenance.sourceBriefHash, a.provenance.directionHash,
        ...[a.provenance.sourceLineage?.sourceSha256, a.provenance.sourceLineage?.scenePlanHash, a.provenance.sourceLineage?.continuityBibleHash].filter(Boolean)], statement: null })),
    beats: direction.script.map(s => ({ beatId: s.beatId, title: s.action.slice(0, 512), origin: "model_generated" })),
    captureGroups: [], assertions: [], syncMappings: [], dialogueUnits: [], continuityObservations: [],
    coverage: accepted.filter(a => a.beatId).map(a => ({ coverageId: `coverage:${a.assetId}`, beatId: a.beatId, assetId: a.assetId,
      sourceRange: { space: "source", startTick: 0, endTick: Math.round(a.artifact.duration * 90000) },
      takeAssertionId: null, shotRoleAssertionId: null, dialogueUnitId: null,
      audioEvidenceRefs: [], technicalEvidenceRefs: [`generation:${a.assetId}`], continuityEvidenceRefs: [],
      warnings: ["Generated asset; machine-reviewed, founder approval remains pending"], state: "proposed",
      provenance: { origin: "model_inferred", producerId: "content_factory", method: "Story beat asset requirement and generated artifact receipt" },
      uncertainty: { level: "medium", basis: "Visual review is model-assisted; not a human-verified recording" },
      review: null, evidenceRefs: [`generation:${a.assetId}`], supersedes: null })),
  });
  validateProjectIntelligenceRevision(revision, { allowServerGenerated: true });
  return { revision, summary: summarizeProjectIntelligence(revision, { allowServerGenerated: true }) };
}
module.exports = { buildFactoryIntelligence };
