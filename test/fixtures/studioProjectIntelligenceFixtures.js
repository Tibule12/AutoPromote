const { createProjectIntelligenceRevision } =
  require("../../src/services/studioProjectIntelligenceContract");

const ownerUid = "fixture-owner";
const projectId = "fixture-project";
const sourceRange = (startTick, endTick) => ({ space: "source", startTick, endTick });
const provenance = (method = "fixture declaration") => ({
  origin: "human_declared", producerId: ownerUid, method,
});
const uncertain = (level = "low", basis = "Fixture supplied claim; no automatic detection") =>
  ({ level, basis });
const lifecycle = (state = "proposed", evidenceRefs = [], method) => ({
  state, provenance: provenance(method), uncertainty: uncertain(),
  review: ["human_verified", "rejected"].includes(state)
    ? { reviewerUid: ownerUid, reviewedAt: "2026-10-02T00:00:00.000Z" } : null,
  evidenceRefs, supersedes: null,
});
const asset = (assetId, mediaType = "video", index = 1) => {
  const audio = mediaType === "audio";
  const streamId = `${assetId}:${audio ? "audio" : "video"}:0`;
  return {
    assetId, projectId, ownerUid, contentHash: index.toString(16).padStart(64, "0"),
    sourceRef: { kind: "studio_source_binding", sourceAssetId: assetId },
    durationTicks: 1_800_000, mediaType,
    streams: [{ streamId, assetId, kind: audio ? "audio" : "video",
      timebase: { numerator: 1, denominator: audio ? 48_000 : 90_000 },
      durationTicks: 1_800_000,
      sampleRateHz: audio ? 48_000 : null,
      frameRate: audio ? null : { numerator: 24, denominator: 1 },
      channelLayout: audio ? "mono" : null }],
    technical: { container: audio ? "wav" : "mp4", codec: audio ? "pcm" : "h264" },
    provenance: { origin: "user_declared", method: "controlled fixture" },
  };
};
const declaration = (item, statement, kind = "human_declaration", suffix = "") => ({
  evidenceId: `evidence:${item.assetId}${suffix}`, kind,
  sourceAssetId: item.assetId, sourceContentHash: item.contentHash,
  artifactHash: null, analysisType: null, modelRevision: null, configHash: null,
  dependencyHashes: [], statement,
});
const assertion = (assertionId, relation, fromId, toKind, toId, state = "proposed",
  evidenceId = `evidence:${fromId}`) => ({
  assertionId, relation, from: { kind: "asset", id: fromId },
  to: { kind: toKind, id: toId }, sourceRange: null,
  ...lifecycle(state, [evidenceId]),
});
const coverage = (coverageId, beatId, assetId, options = {}) => ({
  coverageId, beatId, assetId, sourceRange: sourceRange(90_000, 270_000),
  takeAssertionId: options.takeAssertionId || null,
  shotRoleAssertionId: options.shotRoleAssertionId || null,
  dialogueUnitId: options.dialogueUnitId || null,
  audioEvidenceRefs: options.audioEvidenceRefs || [],
  technicalEvidenceRefs: options.technicalEvidenceRefs || [],
  continuityEvidenceRefs: options.continuityEvidenceRefs || [],
  warnings: options.warnings || [],
  ...lifecycle(options.state || "proposed", [`evidence:${assetId}`]),
});
const core = assets => ({
  schemaVersion: 1, projectId, ownerUid, baseRevisionId: null,
  createdBy: { kind: "human", id: ownerUid },
  assets, evidenceRefs: assets.map(item => declaration(item,
    `User supplied metadata for ${item.assetId}`)),
  captureGroups: [], assertions: [], syncMappings: [], dialogueUnits: [],
  beats: [], coverage: [], continuityObservations: [],
});

const miniFilmFixture = () => {
  const assets = [
    asset("scene1_take1_camA", "video", 1), asset("scene1_take1_camB", "video", 2),
    asset("scene1_take1_external", "audio", 3),
    asset("scene1_take2_camA", "video", 4), asset("scene1_take2_camB", "video", 5),
    asset("scene1_take2_external", "audio", 6), asset("reaction", "video", 7),
    asset("insert", "video", 8), asset("roomtone", "audio", 9),
  ];
  const value = core(assets);
  value.evidenceRefs.push(declaration(assets[0], "Raw utterance: I am leaving tomorrow",
    "human_transcription", ":utterance:t1"));
  value.evidenceRefs.push(declaration(assets[3], "Raw utterance: I'm leaving tomorrow",
    "human_transcription", ":utterance:t2"));
  value.captureGroups = [
    { groupId: "capture:t1", captureEventId: "scene1:take1",
      anchorAssetId: assets[0].assetId, members: [
      { assetId: assets[0].assetId, role: "camera" },
      { assetId: assets[1].assetId, role: "camera" },
      { assetId: assets[2].assetId, role: "external_audio" },
    ], ...lifecycle("human_verified", ["evidence:scene1_take1_camA"]) },
    { groupId: "capture:t2", captureEventId: "scene1:take2",
      anchorAssetId: assets[3].assetId, members: [
      { assetId: assets[3].assetId, role: "camera" },
      { assetId: assets[4].assetId, role: "camera" },
      { assetId: assets[5].assetId, role: "external_audio" },
    ], ...lifecycle("proposed", ["evidence:scene1_take2_camA"]) },
  ];
  value.beats = [
    { beatId: "leaving", title: "I'm leaving tomorrow", origin: "human_supplied" },
    { beatId: "exit", title: "Exit from room", origin: "human_supplied" },
  ];
  value.assertions = [
    assertion("scene:t1a", "scene_membership", assets[0].assetId, "scene", "scene1", "human_verified"),
    assertion("take:t1a", "take_membership", assets[0].assetId, "take", "take1", "human_verified"),
    assertion("take:t2a", "take_membership", assets[3].assetId, "take", "take2", "human_verified"),
    assertion("camera:t1a", "camera_role", assets[0].assetId, "camera", "cameraA", "human_verified"),
    assertion("camera:t1b", "camera_role", assets[1].assetId, "camera", "cameraB", "human_verified"),
    assertion("shot:t1a", "shot_role", assets[0].assetId, "shot_role", "wide", "proposed"),
    assertion("shot:t2a", "shot_role", assets[3].assetId, "shot_role", "close_up", "proposed"),
    assertion("same:t1", "same_capture", assets[0].assetId, "asset", assets[1].assetId, "human_verified"),
    assertion("external:t1", "external_audio_for", assets[2].assetId, "asset", assets[0].assetId),
    assertion("external:t2", "external_audio_for", assets[5].assetId, "asset", assets[3].assetId),
    assertion("alternate:t1t2", "alternate_take", assets[0].assetId, "asset", assets[3].assetId,
      "human_verified"),
    assertion("unknown:reaction", "reaction_for", assets[6].assetId, "beat", "leaving", "unknown"),
    // Deliberate contradiction for the fixture's planning block.
    assertion("conflict:alternate", "alternate_take", assets[0].assetId, "asset", assets[1].assetId,
      "human_verified"),
  ];
  value.syncMappings = [{
    mappingId: "sync:t1external", sourceStreamId: "scene1_take1_external:audio:0",
    referenceStreamId: "scene1_take1_camA:video:0",
    coveredSourceRange: sourceRange(0, 900_000), offsetTicks: 9_000,
    rateNumerator: 1_000_100, rateDenominator: 1_000_000,
    residualMaxTicks: 90, method: "human_supplied",
    ...lifecycle("proposed", ["evidence:scene1_take1_external"]),
  }];
  value.dialogueUnits = [{
    dialogueUnitId: "dialogue:leaving", dialogueKey: "scene1:dialogue:leaving",
    origin: "scripted", scriptUnitId: "script:17",
    reviewedWording: "I can't keep doing this. I'm leaving tomorrow.",
    candidates: [
      { assetId: assets[0].assetId, sourceRange: sourceRange(90_000, 270_000),
        utteranceEvidenceId: "evidence:scene1_take1_camA:utterance:t1", takeAssertionId: "take:t1a" },
      { assetId: assets[3].assetId, sourceRange: sourceRange(90_000, 270_000),
        utteranceEvidenceId: "evidence:scene1_take2_camA:utterance:t2", takeAssertionId: "take:t2a" },
    ], ...lifecycle("human_verified", ["evidence:scene1_take1_camA:utterance:t1"]),
  }];
  value.coverage = [
    coverage("coverage:wide", "leaving", assets[0].assetId,
      { takeAssertionId: "take:t1a", shotRoleAssertionId: "shot:t1a",
        dialogueUnitId: "dialogue:leaving" }),
    coverage("coverage:close", "leaving", assets[3].assetId,
      { takeAssertionId: "take:t2a", shotRoleAssertionId: "shot:t2a",
        dialogueUnitId: "dialogue:leaving", audioEvidenceRefs: ["evidence:scene1_take2_camA"],
        warnings: ["Bad camera audio; external audio relationship remains proposed"] }),
    coverage("coverage:reaction", "leaving", assets[6].assetId),
  ];
  value.continuityObservations = [
    { observationId: "continuity:red", beatId: "leaving", assetId: assets[0].assetId,
      sourceRange: sourceRange(90_000, 270_000), subjectId: "actor:one",
      continuityKey: "hand_prop", type: "prop_state", value: "red_cup",
      ...lifecycle("human_verified", ["evidence:scene1_take1_camA"]) },
    { observationId: "continuity:blue", beatId: "leaving", assetId: assets[3].assetId,
      sourceRange: sourceRange(90_000, 270_000), subjectId: "actor:one",
      continuityKey: "hand_prop", type: "prop_state", value: "blue_cup",
      ...lifecycle("human_verified", ["evidence:scene1_take2_camA"]) },
  ];
  return createProjectIntelligenceRevision(value);
};

const promoFixture = () => {
  const names = ["talking_head", "screen_recording", "failure", "fix", "result",
    "product_ui", "cta"];
  const assets = names.map((name, index) => asset(name, "video", index + 20));
  const value = core(assets);
  value.beats = ["result_tease", "process", "problem", "fix", "proof", "payoff", "cta"]
    .map(name => ({ beatId: name, title: name.replace(/_/g, " "), origin: "human_supplied" }));
  const mapping = ["result", "screen_recording", "failure", "fix", "product_ui",
    "talking_head", "cta"];
  value.coverage = value.beats.map((beat, index) =>
    coverage(`coverage:${beat.beatId}`, beat.beatId, mapping[index]));
  value.assertions = [assertion("shot:talking", "shot_role", "talking_head",
    "shot_role", "medium", "proposed")];
  return createProjectIntelligenceRevision(value);
};

module.exports = { miniFilmFixture, promoFixture, asset, declaration, lifecycle,
  sourceRange, ownerUid, projectId };
