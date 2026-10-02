const crypto = require("crypto");

const VERSION = 1;
const MAX_BYTES = 256 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/;
const STATES = ["unknown", "proposed", "human_verified", "rejected"];
// Rows are the state being replaced; columns are permitted successor states.
// Only a new human review may correct or reopen a human decision.
const SUCCESSOR_STATES = Object.freeze({
  unknown: ["proposed", "human_verified", "rejected"],
  proposed: ["proposed", "human_verified", "rejected"],
  human_verified: ["human_verified", "rejected"],
  rejected: ["human_verified"],
});
const LEVELS = ["unknown", "low", "medium", "high"];
const ORIGINS = ["human_declared", "heuristic", "model_inferred"];
const SHOT_ROLES = ["unknown", "establishing", "wide", "medium", "medium_close_up",
  "close_up", "extreme_close_up", "over_the_shoulder", "two_shot", "reaction",
  "insert", "cutaway", "pov"];
const CAMERA_MOTIONS = ["unknown", "static", "handheld", "pan", "tilt", "push",
  "pull", "tracking"];
const CONTINUITY_TYPES = ["screen_direction", "gaze_direction", "body_orientation",
  "pose_state", "action_state", "action_event", "object_interaction", "prop_state",
  "wardrobe_state", "lighting_state", "location_state"];
const RELATIONS = {
  same_capture: ["asset", "asset"], alternate_take: ["asset", "asset"],
  external_audio_for: ["asset", "asset"], simultaneous_with: ["asset", "asset"],
  scene_membership: ["asset", "scene"], take_membership: ["asset", "take"],
  camera_role: ["asset", "camera"], reaction_for: ["asset", "beat"],
  insert_for: ["asset", "beat"], cutaway_for: ["asset", "beat"],
  shot_role: ["asset", "shot_role"], camera_motion: ["asset", "camera_motion"],
};

const fail = (code, path) => {
  const error = new Error(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  throw error;
};
const object = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === null ||
    Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
const exact = (value, required, optional, path) => {
  if (!object(value) || required.some(key => !Object.prototype.hasOwnProperty.call(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key)))
    fail("PROJECT_INTELLIGENCE_SCHEMA", path);
};
const id = (value, path) => { if (typeof value !== "string" || !ID.test(value)) fail("PROJECT_INTELLIGENCE_ID", path); };
const hash = (value, path) => { if (typeof value !== "string" || !HASH.test(value)) fail("PROJECT_INTELLIGENCE_HASH", path); };
const text = (value, path, max = 512) => {
  if (typeof value !== "string" || value.trim() !== value || !value.length ||
      value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
    fail("PROJECT_INTELLIGENCE_TEXT", path);
};
const tick = (value, path) => {
  if (!Number.isSafeInteger(value) || value < 0) fail("PROJECT_INTELLIGENCE_TICK", path);
};
const list = (value, max, path) => {
  if (!Array.isArray(value) || value.length > max) fail("PROJECT_INTELLIGENCE_LIST", path);
};
const unique = (items, key, path) => {
  if (new Set(items.map(item => item[key])).size !== items.length)
    fail("PROJECT_INTELLIGENCE_DUPLICATE", path);
};
const range = (value, duration, path) => {
  exact(value, ["space", "startTick", "endTick"], [], path);
  if (value.space !== "source") fail("PROJECT_INTELLIGENCE_SPACE", path);
  tick(value.startTick, path); tick(value.endTick, path);
  if (value.endTick <= value.startTick || value.endTick > duration)
    fail("PROJECT_INTELLIGENCE_RANGE", path);
};
const stableStringify = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
const sourceAssetSetDigest = assets => digest(assets.map(asset =>
  [asset.assetId, asset.contentHash]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const dependencyDigests = evidenceRefs => [...new Set(evidenceRefs
  .filter(item => item.kind === "source_shot_artifact")
  .map(item => item.artifactHash))].sort();
const RECORD_IDS = Object.freeze({ captureGroups: "groupId", assertions: "assertionId",
  syncMappings: "mappingId", dialogueUnits: "dialogueUnitId",
  coverage: "coverageId", continuityObservations: "observationId" });
const valueRelations = new Set(["scene_membership", "take_membership", "camera_role",
  "shot_role", "camera_motion"]);
const compatibleSuccessor = (field, prior, next) => {
  switch (field) {
    case "captureGroups":
      return prior.captureEventId === next.captureEventId &&
        prior.anchorAssetId === next.anchorAssetId;
    case "assertions":
      return prior.relation === next.relation &&
        stableStringify(prior.from) === stableStringify(next.from) &&
        prior.to.kind === next.to.kind &&
        stableStringify(prior.sourceRange) === stableStringify(next.sourceRange) &&
        (valueRelations.has(prior.relation) || prior.to.id === next.to.id);
    case "syncMappings":
      return prior.sourceStreamId === next.sourceStreamId &&
        prior.referenceStreamId === next.referenceStreamId;
    case "dialogueUnits":
      return prior.dialogueKey === next.dialogueKey && prior.origin === next.origin &&
        prior.scriptUnitId === next.scriptUnitId;
    case "coverage":
      return prior.beatId === next.beatId && prior.assetId === next.assetId &&
        stableStringify(prior.sourceRange) === stableStringify(next.sourceRange);
    case "continuityObservations":
      return prior.beatId === next.beatId && prior.subjectId === next.subjectId &&
        prior.continuityKey === next.continuityKey && prior.type === next.type &&
        prior.assetId === next.assetId &&
        stableStringify(prior.sourceRange) === stableStringify(next.sourceRange);
    default:
      return false;
  }
};

const provenance = (value, path) => {
  exact(value, ["origin", "producerId", "method"], [], path);
  if (!ORIGINS.includes(value.origin)) fail("PROJECT_INTELLIGENCE_PROVENANCE", path);
  id(value.producerId, path); text(value.method, path, 160);
};
const uncertainty = (value, path) => {
  exact(value, ["level", "basis"], [], path);
  if (!LEVELS.includes(value.level)) fail("PROJECT_INTELLIGENCE_UNCERTAINTY", path);
  text(value.basis, path);
};
const lifecycle = (value, path, evidenceIds, ownerUid) => {
  if (!STATES.includes(value.state)) fail("PROJECT_INTELLIGENCE_STATE", path);
  provenance(value.provenance, `${path}.provenance`);
  uncertainty(value.uncertainty, `${path}.uncertainty`);
  list(value.evidenceRefs, 32, `${path}.evidenceRefs`);
  value.evidenceRefs.forEach(ref => {
    id(ref, `${path}.evidenceRefs`);
    if (!evidenceIds.has(ref)) fail("PROJECT_INTELLIGENCE_EVIDENCE_REF", path);
  });
  if (value.state === "human_verified" || value.state === "rejected") {
    exact(value.review, ["reviewerUid", "reviewedAt"], [], `${path}.review`);
    id(value.review.reviewerUid, `${path}.review.reviewerUid`);
    if (value.review.reviewerUid !== ownerUid) fail("PROJECT_INTELLIGENCE_SCOPE", path);
    if (typeof value.review.reviewedAt !== "string" ||
        Number.isNaN(Date.parse(value.review.reviewedAt)))
      fail("PROJECT_INTELLIGENCE_REVIEW", path);
    if (value.provenance.origin !== "human_declared")
      fail("PROJECT_INTELLIGENCE_REVIEW", path);
  } else if (value.review !== null) fail("PROJECT_INTELLIGENCE_REVIEW", path);
  if (value.supersedes !== null) id(value.supersedes, `${path}.supersedes`);
};

const validateAssetManifest = manifest => {
  exact(manifest, ["schemaVersion", "projectId", "ownerUid", "assets"], [], "manifest");
  if (manifest.schemaVersion !== VERSION) fail("PROJECT_INTELLIGENCE_VERSION", "manifest");
  id(manifest.projectId, "manifest.projectId"); id(manifest.ownerUid, "manifest.ownerUid");
  list(manifest.assets, 200, "manifest.assets");
  const streamIds = new Set();
  manifest.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    exact(asset, ["assetId", "projectId", "ownerUid", "contentHash", "sourceRef",
      "durationTicks", "mediaType", "streams", "technical", "provenance"], [], path);
    id(asset.assetId, path); hash(asset.contentHash, path);
    if (asset.projectId !== manifest.projectId || asset.ownerUid !== manifest.ownerUid)
      fail("PROJECT_INTELLIGENCE_SCOPE", path);
    exact(asset.sourceRef, ["kind", "sourceAssetId"], [], `${path}.sourceRef`);
    if (asset.sourceRef.kind !== "studio_source_binding") fail("PROJECT_INTELLIGENCE_SOURCE", path);
    id(asset.sourceRef.sourceAssetId, path);
    tick(asset.durationTicks, path);
    if (asset.durationTicks < 1 || !["video", "audio", "image"].includes(asset.mediaType))
      fail("PROJECT_INTELLIGENCE_MEDIA", path);
    exact(asset.technical, ["container", "codec"], [], `${path}.technical`);
    text(asset.technical.container, path, 80); text(asset.technical.codec, path, 80);
    exact(asset.provenance, ["origin", "method"], [], `${path}.provenance`);
    if (asset.provenance.origin !== "user_declared") fail("PROJECT_INTELLIGENCE_PROVENANCE", path);
    text(asset.provenance.method, path, 160);
    list(asset.streams, 16, `${path}.streams`);
    if (asset.mediaType !== "image" && !asset.streams.length)
      fail("PROJECT_INTELLIGENCE_STREAM", path);
    if (asset.mediaType === "video" && !asset.streams.some(stream => stream.kind === "video"))
      fail("PROJECT_INTELLIGENCE_STREAM", path);
    if (asset.mediaType === "image" && asset.streams.length)
      fail("PROJECT_INTELLIGENCE_STREAM", path);
    asset.streams.forEach((stream, streamIndex) => {
      const streamPath = `${path}.streams[${streamIndex}]`;
      exact(stream, ["streamId", "assetId", "kind", "timebase", "durationTicks",
        "sampleRateHz", "frameRate", "channelLayout"], [], streamPath);
      id(stream.streamId, streamPath);
      if (streamIds.has(stream.streamId) || stream.assetId !== asset.assetId ||
          !["video", "audio"].includes(stream.kind) ||
          (asset.mediaType === "audio" && stream.kind !== "audio"))
        fail("PROJECT_INTELLIGENCE_STREAM", streamPath);
      streamIds.add(stream.streamId);
      exact(stream.timebase, ["numerator", "denominator"], [], `${streamPath}.timebase`);
      for (const part of ["numerator", "denominator"])
        if (!Number.isSafeInteger(stream.timebase[part]) || stream.timebase[part] < 1)
          fail("PROJECT_INTELLIGENCE_TIMEBASE", streamPath);
      tick(stream.durationTicks, streamPath);
      if (stream.durationTicks < 1 || stream.durationTicks > asset.durationTicks)
        fail("PROJECT_INTELLIGENCE_STREAM", streamPath);
      if (stream.kind === "audio") {
        if (!Number.isSafeInteger(stream.sampleRateHz) || stream.sampleRateHz < 1 ||
            stream.frameRate !== null || !["mono", "stereo", "5.1", "unknown"].includes(stream.channelLayout))
          fail("PROJECT_INTELLIGENCE_STREAM", streamPath);
      } else {
        if (stream.sampleRateHz !== null || stream.channelLayout !== null ||
            !object(stream.frameRate)) fail("PROJECT_INTELLIGENCE_STREAM", streamPath);
        exact(stream.frameRate, ["numerator", "denominator"], [], `${streamPath}.frameRate`);
        if (![stream.frameRate.numerator, stream.frameRate.denominator]
          .every(value => Number.isSafeInteger(value) && value > 0))
          fail("PROJECT_INTELLIGENCE_STREAM", streamPath);
      }
    });
  });
  unique(manifest.assets, "assetId", "manifest.assets");
  return { assetIds: new Set(manifest.assets.map(asset => asset.assetId)), streamIds };
};

const revisionCore = revision => {
  const { revisionId: _revisionId, ...core } = revision;
  return core;
};
const createProjectIntelligenceRevision = core => {
  const withoutId = { ...core,
    sourceAssetSetDigest: sourceAssetSetDigest(core.assets),
    analysisDependencyDigests: dependencyDigests(core.evidenceRefs) };
  return { ...withoutId, revisionId: digest(withoutId) };
};

const validateProjectIntelligenceRevision = revision => {
  exact(revision, ["schemaVersion", "projectId", "ownerUid", "baseRevisionId",
    "sourceAssetSetDigest", "analysisDependencyDigests", "createdBy", "assets",
    "evidenceRefs", "captureGroups", "assertions", "syncMappings", "dialogueUnits",
    "beats", "coverage", "continuityObservations", "revisionId"], [], "revision");
  const json = stableStringify(revision);
  if (!json || Buffer.byteLength(json, "utf8") > MAX_BYTES)
    fail("PROJECT_INTELLIGENCE_TOO_LARGE", "revision");
  if (revision.schemaVersion !== VERSION) fail("PROJECT_INTELLIGENCE_VERSION", "revision");
  if (revision.baseRevisionId !== null) hash(revision.baseRevisionId, "baseRevisionId");
  hash(revision.revisionId, "revisionId");
  hash(revision.sourceAssetSetDigest, "sourceAssetSetDigest");
  if (revision.revisionId !== digest(revisionCore(revision)) ||
      revision.sourceAssetSetDigest !== sourceAssetSetDigest(revision.assets))
    fail("PROJECT_INTELLIGENCE_DIGEST", "revision");
  exact(revision.createdBy, ["kind", "id"], [], "createdBy");
  if (revision.createdBy.kind !== "human" || revision.createdBy.id !== revision.ownerUid)
    fail("PROJECT_INTELLIGENCE_AUTHOR", "createdBy");
  const { assetIds, streamIds } = validateAssetManifest({
    schemaVersion: VERSION, projectId: revision.projectId,
    ownerUid: revision.ownerUid, assets: revision.assets,
  });
  const assets = new Map(revision.assets.map(asset => [asset.assetId, asset]));
  const streams = new Map(revision.assets.flatMap(asset => asset.streams.map(stream =>
    [stream.streamId, { ...stream, asset }] )));
  list(revision.evidenceRefs, 500, "evidenceRefs");
  revision.evidenceRefs.forEach((evidence, index) => {
    const path = `evidenceRefs[${index}]`;
    exact(evidence, ["evidenceId", "kind", "sourceAssetId", "sourceContentHash",
      "artifactHash", "analysisType", "modelRevision", "configHash", "dependencyHashes",
      "statement"], [], path);
    id(evidence.evidenceId, path); id(evidence.sourceAssetId, path);
    const asset = revision.assets.find(item => item.sourceRef.sourceAssetId === evidence.sourceAssetId);
    if (!asset || evidence.sourceContentHash !== asset.contentHash)
      fail("PROJECT_INTELLIGENCE_EVIDENCE_SOURCE", path);
    hash(evidence.sourceContentHash, path);
    list(evidence.dependencyHashes, 16, path);
    evidence.dependencyHashes.forEach(value => hash(value, path));
    if (evidence.kind === "human_declaration" || evidence.kind === "human_transcription") {
      if (evidence.artifactHash !== null || evidence.analysisType !== null ||
          evidence.modelRevision !== null || evidence.configHash !== null ||
          evidence.dependencyHashes.length !== 0)
        fail("PROJECT_INTELLIGENCE_EVIDENCE", path);
      text(evidence.statement, path);
    } else if (evidence.kind === "source_shot_artifact") {
      hash(evidence.artifactHash, path);
      // Existing source-shot records expose one engine identifier. This V1
      // adapter is not the generic analysis artifact identity planned later.
      if (evidence.configHash !== null) fail("PROJECT_INTELLIGENCE_EVIDENCE", path);
      id(evidence.modelRevision, path);
      if (evidence.analysisType !== "source_shots" || evidence.statement !== null)
        fail("PROJECT_INTELLIGENCE_EVIDENCE", path);
    } else fail("PROJECT_INTELLIGENCE_EVIDENCE", path);
  });
  unique(revision.evidenceRefs, "evidenceId", "evidenceRefs");
  const evidenceIds = new Set(revision.evidenceRefs.map(item => item.evidenceId));
  list(revision.analysisDependencyDigests, 500, "analysisDependencyDigests");
  revision.analysisDependencyDigests.forEach(value => hash(value, "analysisDependencyDigests"));
  if (stableStringify(revision.analysisDependencyDigests) !==
      stableStringify(dependencyDigests(revision.evidenceRefs)))
    fail("PROJECT_INTELLIGENCE_DIGEST", "analysisDependencyDigests");
  list(revision.beats, 200, "beats");
  revision.beats.forEach((beat, index) => {
    const path = `beats[${index}]`;
    exact(beat, ["beatId", "title", "origin"], [], path);
    id(beat.beatId, path); text(beat.title, path);
    if (beat.origin !== "human_supplied") fail("PROJECT_INTELLIGENCE_PROVENANCE", path);
  });
  unique(revision.beats, "beatId", "beats");
  const beatIds = new Set(revision.beats.map(item => item.beatId));
  list(revision.captureGroups, 200, "captureGroups");
  revision.captureGroups.forEach((group, index) => {
    const path = `captureGroups[${index}]`;
    exact(group, ["groupId", "captureEventId", "anchorAssetId", "members",
      "state", "provenance", "uncertainty",
      "review", "evidenceRefs", "supersedes"], [], path);
    id(group.groupId, path); id(group.captureEventId, path);
    id(group.anchorAssetId, path); list(group.members, 16, path);
    if (!group.members.length) fail("PROJECT_INTELLIGENCE_CAPTURE_GROUP", path);
    if (!group.members.some(member => member.assetId === group.anchorAssetId))
      fail("PROJECT_INTELLIGENCE_CAPTURE_GROUP", path);
    group.members.forEach(member => {
      exact(member, ["assetId", "role"], [], path);
      if (!assetIds.has(member.assetId) ||
          !["camera", "external_audio", "other"].includes(member.role) ||
          (member.role === "camera" && assets.get(member.assetId).mediaType !== "video") ||
          (member.role === "external_audio" &&
            assets.get(member.assetId).mediaType !== "audio"))
        fail("PROJECT_INTELLIGENCE_CAPTURE_GROUP", path);
    });
    unique(group.members, "assetId", path);
    lifecycle(group, path, evidenceIds, revision.ownerUid);
  });
  unique(revision.captureGroups, "groupId", "captureGroups");
  list(revision.assertions, 1000, "assertions");
  revision.assertions.forEach((assertion, index) => {
    const path = `assertions[${index}]`;
    exact(assertion, ["assertionId", "relation", "from", "to", "sourceRange", "state",
      "provenance", "uncertainty", "review", "evidenceRefs", "supersedes"], [], path);
    id(assertion.assertionId, path);
    const kinds = RELATIONS[assertion.relation];
    if (!kinds) fail("PROJECT_INTELLIGENCE_RELATION", path);
    for (const [endpoint, kind] of [[assertion.from, kinds[0]], [assertion.to, kinds[1]]]) {
      exact(endpoint, ["kind", "id"], [], path);
      if (endpoint.kind !== kind) fail("PROJECT_INTELLIGENCE_ENDPOINT", path);
      id(endpoint.id, path);
    }
    if (!assetIds.has(assertion.from.id) ||
        (kinds[1] === "asset" && !assetIds.has(assertion.to.id)) ||
        (kinds[1] === "beat" && !beatIds.has(assertion.to.id)) ||
        (kinds[1] === "shot_role" && !SHOT_ROLES.includes(assertion.to.id)) ||
        (kinds[1] === "camera_motion" && !CAMERA_MOTIONS.includes(assertion.to.id)))
      fail("PROJECT_INTELLIGENCE_ENDPOINT", path);
    if ((kinds[1] === "asset" && assertion.from.id === assertion.to.id) ||
        (assertion.relation === "external_audio_for" &&
          (assets.get(assertion.from.id).mediaType !== "audio" ||
            assets.get(assertion.to.id).mediaType !== "video")))
      fail("PROJECT_INTELLIGENCE_RELATION", path);
    if (assertion.sourceRange !== null)
      range(assertion.sourceRange, assets.get(assertion.from.id).durationTicks, path);
    lifecycle(assertion, path, evidenceIds, revision.ownerUid);
  });
  unique(revision.assertions, "assertionId", "assertions");
  const assertions = new Map(revision.assertions.map(item => [item.assertionId, item]));
  list(revision.syncMappings, 200, "syncMappings");
  revision.syncMappings.forEach((mapping, index) => {
    const path = `syncMappings[${index}]`;
    exact(mapping, ["mappingId", "sourceStreamId", "referenceStreamId",
      "coveredSourceRange", "offsetTicks", "rateNumerator", "rateDenominator",
      "residualMaxTicks", "method", "state", "provenance", "uncertainty",
      "review", "evidenceRefs", "supersedes"], [], path);
    id(mapping.mappingId, path);
    if (!streamIds.has(mapping.sourceStreamId) || !streamIds.has(mapping.referenceStreamId) ||
        mapping.sourceStreamId === mapping.referenceStreamId ||
        !["metadata", "timecode", "audio_correlation", "clap_event",
          "human_supplied", "other"].includes(mapping.method))
      fail("PROJECT_INTELLIGENCE_SYNC", path);
    range(mapping.coveredSourceRange,
      streams.get(mapping.sourceStreamId).durationTicks, path);
    if (!Number.isSafeInteger(mapping.offsetTicks) ||
        ![mapping.rateNumerator, mapping.rateDenominator]
          .every(value => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000) ||
        (mapping.residualMaxTicks !== null &&
          (!Number.isSafeInteger(mapping.residualMaxTicks) || mapping.residualMaxTicks < 0)))
      fail("PROJECT_INTELLIGENCE_SYNC", path);
    const mappedStart = mapCaptureClockTick(mapping, mapping.coveredSourceRange.startTick);
    const mappedEnd = mapCaptureClockTick(mapping, mapping.coveredSourceRange.endTick);
    if (mappedStart.floorTick < 0 ||
        mappedEnd.floorTick > streams.get(mapping.referenceStreamId).durationTicks)
      fail("PROJECT_INTELLIGENCE_SYNC_COVERAGE", path);
    lifecycle(mapping, path, evidenceIds, revision.ownerUid);
  });
  unique(revision.syncMappings, "mappingId", "syncMappings");
  list(revision.dialogueUnits, 500, "dialogueUnits");
  revision.dialogueUnits.forEach((unit, index) => {
    const path = `dialogueUnits[${index}]`;
    exact(unit, ["dialogueUnitId", "dialogueKey", "origin", "scriptUnitId", "reviewedWording",
      "candidates", "state", "provenance", "uncertainty", "review", "evidenceRefs",
      "supersedes"], [], path);
    id(unit.dialogueUnitId, path); id(unit.dialogueKey, path);
    if (!["scripted", "unscripted"].includes(unit.origin) ||
        (unit.origin === "scripted" ? unit.scriptUnitId === null : unit.scriptUnitId !== null))
      fail("PROJECT_INTELLIGENCE_DIALOGUE", path);
    if (unit.scriptUnitId !== null) id(unit.scriptUnitId, path);
    if (unit.reviewedWording !== null) text(unit.reviewedWording, path, 1024);
    list(unit.candidates, 30, path);
    unit.candidates.forEach(candidate => {
      exact(candidate, ["assetId", "sourceRange", "utteranceEvidenceId", "takeAssertionId"], [], path);
      if (!assetIds.has(candidate.assetId) ||
          !evidenceIds.has(candidate.utteranceEvidenceId) ||
          revision.evidenceRefs.find(item => item.evidenceId ===
            candidate.utteranceEvidenceId)?.sourceAssetId !==
            assets.get(candidate.assetId)?.sourceRef.sourceAssetId ||
          (candidate.takeAssertionId !== null &&
            (!assertions.has(candidate.takeAssertionId) ||
              assertions.get(candidate.takeAssertionId).relation !== "take_membership" ||
              assertions.get(candidate.takeAssertionId).from.id !== candidate.assetId)))
        fail("PROJECT_INTELLIGENCE_DIALOGUE", path);
      range(candidate.sourceRange, assets.get(candidate.assetId).durationTicks, path);
    });
    lifecycle(unit, path, evidenceIds, revision.ownerUid);
  });
  unique(revision.dialogueUnits, "dialogueUnitId", "dialogueUnits");
  const dialogueIds = new Set(revision.dialogueUnits.map(item => item.dialogueUnitId));
  list(revision.coverage, 1000, "coverage");
  revision.coverage.forEach((candidate, index) => {
    const path = `coverage[${index}]`;
    exact(candidate, ["coverageId", "beatId", "assetId", "sourceRange",
      "takeAssertionId", "shotRoleAssertionId", "dialogueUnitId", "audioEvidenceRefs",
      "technicalEvidenceRefs", "continuityEvidenceRefs", "warnings", "state",
      "provenance", "uncertainty", "review", "evidenceRefs", "supersedes"], [], path);
    id(candidate.coverageId, path);
    if (!beatIds.has(candidate.beatId) || !assetIds.has(candidate.assetId) ||
        (candidate.dialogueUnitId !== null && !dialogueIds.has(candidate.dialogueUnitId)))
      fail("PROJECT_INTELLIGENCE_COVERAGE", path);
    range(candidate.sourceRange, assets.get(candidate.assetId).durationTicks, path);
    for (const [field, relation] of [["takeAssertionId", "take_membership"],
      ["shotRoleAssertionId", "shot_role"]]) {
      const assertionId = candidate[field];
      if (assertionId !== null && (!assertions.has(assertionId) ||
          assertions.get(assertionId).relation !== relation ||
          assertions.get(assertionId).from.id !== candidate.assetId))
        fail("PROJECT_INTELLIGENCE_COVERAGE", path);
    }
    for (const field of ["audioEvidenceRefs", "technicalEvidenceRefs", "continuityEvidenceRefs"]) {
      list(candidate[field], 16, `${path}.${field}`);
      candidate[field].forEach(ref => {
        if (!evidenceIds.has(ref)) fail("PROJECT_INTELLIGENCE_EVIDENCE_REF", path);
      });
    }
    list(candidate.warnings, 16, path);
    candidate.warnings.forEach(warning => text(warning, path, 160));
    lifecycle(candidate, path, evidenceIds, revision.ownerUid);
  });
  unique(revision.coverage, "coverageId", "coverage");
  list(revision.continuityObservations, 500, "continuityObservations");
  revision.continuityObservations.forEach((observation, index) => {
    const path = `continuityObservations[${index}]`;
    exact(observation, ["observationId", "beatId", "assetId", "sourceRange", "subjectId",
      "continuityKey", "type", "value", "state", "provenance", "uncertainty",
      "review", "evidenceRefs", "supersedes"], [], path);
    id(observation.observationId, path);
    if (!beatIds.has(observation.beatId) || !assetIds.has(observation.assetId) ||
        !CONTINUITY_TYPES.includes(observation.type))
      fail("PROJECT_INTELLIGENCE_CONTINUITY", path);
    range(observation.sourceRange, assets.get(observation.assetId).durationTicks, path);
    if (observation.subjectId !== null) id(observation.subjectId, path);
    id(observation.continuityKey, path); text(observation.value, path, 160);
    lifecycle(observation, path, evidenceIds, revision.ownerUid);
  });
  unique(revision.continuityObservations, "observationId", "continuityObservations");
  const collections = [["captureGroups", revision.captureGroups],
    ["assertions", revision.assertions], ["syncMappings", revision.syncMappings],
    ["dialogueUnits", revision.dialogueUnits], ["coverage", revision.coverage],
    ["continuityObservations", revision.continuityObservations]];
  for (const [field, items] of collections) {
    const recordId = item => item[RECORD_IDS[field]];
    const byId = new Map(items.map(item => [recordId(item), item]));
    for (const item of items) {
      if (item.supersedes === null) continue;
      const prior = byId.get(item.supersedes);
      if (!prior || prior === item || !compatibleSuccessor(field, prior, item) ||
          !SUCCESSOR_STATES[prior.state].includes(item.state))
        fail("PROJECT_INTELLIGENCE_SUPERSESSION", item.supersedes);
    }
    const superseded = items.filter(item => item.supersedes !== null).map(item => item.supersedes);
    if (new Set(superseded).size !== superseded.length)
      fail("PROJECT_INTELLIGENCE_SUPERSESSION", "ambiguous successor");
    for (const item of items) {
      let cursor = item;
      const seen = new Set();
      while (cursor.supersedes !== null) {
        if (seen.has(cursor.supersedes))
          fail("PROJECT_INTELLIGENCE_SUPERSESSION", "cycle");
        seen.add(cursor.supersedes);
        cursor = byId.get(cursor.supersedes);
      }
    }
  }
  const findings = findProjectIntelligenceFindings(revision);
  return { findings, planningBlocked:
    findings.some(finding => finding.code === "PROJECT_INTELLIGENCE_CONFLICT") };
};

const mapCaptureClockTick = (mapping, sourceTick) => {
  tick(sourceTick, "sourceTick");
  if (sourceTick < mapping.coveredSourceRange.startTick ||
      sourceTick > mapping.coveredSourceRange.endTick)
    fail("PROJECT_INTELLIGENCE_SYNC_COVERAGE", "sourceTick");
  const denominator = BigInt(mapping.rateDenominator);
  const numerator = BigInt(mapping.offsetTicks) * denominator +
    BigInt(sourceTick) * BigInt(mapping.rateNumerator);
  const floor = numerator >= 0n ? numerator / denominator :
    -((-numerator + denominator - 1n) / denominator);
  if (floor < BigInt(Number.MIN_SAFE_INTEGER) || floor > BigInt(Number.MAX_SAFE_INTEGER))
    fail("PROJECT_INTELLIGENCE_SYNC", "mappedTick");
  return { numerator: numerator.toString(), denominator: denominator.toString(),
    floorTick: Number(floor), remainderNumerator: (numerator - floor * denominator).toString() };
};

const active = (items, field) => {
  const byId = new Map(items.map(item => [item[RECORD_IDS[field]], item]));
  const superseded = new Set(items.filter(item => {
    const prior = byId.get(item.supersedes);
    return prior && compatibleSuccessor(field, prior, item) &&
      SUCCESSOR_STATES[prior.state]?.includes(item.state);
  }).map(item => item.supersedes));
  return items.filter(item => !superseded.has(item[RECORD_IDS[field]]));
};
const findProjectIntelligenceFindings = revision => {
  const findings = [];
  const verified = active(revision.assertions, "assertions")
    .filter(item => item.state === "human_verified");
  const single = ["scene_membership", "take_membership", "camera_role"];
  for (const relation of single) {
    const groups = new Map();
    for (const item of verified.filter(candidate => candidate.relation === relation)) {
      const key = item.from.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const [assetId, claims] of groups) {
      if (new Set(claims.map(item => item.to.id)).size > 1)
        findings.push({ code: "PROJECT_INTELLIGENCE_CONFLICT", kind: relation,
          assetId, assertionIds: claims.map(item => item.assertionId) });
    }
  }
  const parent = new Map(revision.assets.map(asset => [asset.assetId, asset.assetId]));
  const root = value => {
    while (parent.get(value) !== value) value = parent.get(value);
    return value;
  };
  const sameCapture = verified.filter(item => item.relation === "same_capture");
  for (const item of sameCapture) parent.set(root(item.from.id), root(item.to.id));
  for (const item of verified.filter(candidate => candidate.relation === "alternate_take")) {
    if (root(item.from.id) === root(item.to.id))
      findings.push({ code: "PROJECT_INTELLIGENCE_CONFLICT",
        kind: "same_capture_vs_alternate_take", assertionIds: [item.assertionId,
          ...sameCapture.filter(claim => root(claim.from.id) === root(item.from.id))
            .map(claim => claim.assertionId)] });
  }
  const observations = active(revision.continuityObservations, "continuityObservations")
    .filter(item => item.state === "human_verified");
  const byKey = new Map();
  for (const item of observations) {
    const key = [item.beatId, item.subjectId, item.continuityKey, item.type].join("\0");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }
  for (const claims of byKey.values()) {
    if (new Set(claims.map(item => item.value)).size > 1)
      findings.push({ code: "CONTINUITY_MISMATCH", observationIds:
        claims.map(item => item.observationId), beatId: claims[0].beatId });
  }
  for (const beat of revision.beats) {
    if (!active(revision.coverage, "coverage").some(item => item.beatId === beat.beatId &&
        item.state !== "rejected"))
      findings.push({ code: "MISSING_BEAT_COVERAGE", beatId: beat.beatId });
  }
  return findings;
};

const assertRevisionTransition = (previous, next) => {
  validateProjectIntelligenceRevision(next);
  if (!previous) {
    if (next.baseRevisionId !== null) fail("PROJECT_INTELLIGENCE_LINEAGE", "baseRevisionId");
    for (const field of ["captureGroups", "assertions", "syncMappings", "dialogueUnits",
      "coverage", "continuityObservations"])
      if (next[field].some(item => item.supersedes !== null))
        fail("PROJECT_INTELLIGENCE_LINEAGE", `${field}.supersedes`);
    return;
  }
  validateProjectIntelligenceRevision(previous);
  if (next.projectId !== previous.projectId || next.ownerUid !== previous.ownerUid ||
      next.baseRevisionId !== previous.revisionId)
    fail("PROJECT_INTELLIGENCE_LINEAGE", "baseRevisionId");
  for (const [field, key] of [["assets", "assetId"], ["evidenceRefs", "evidenceId"],
    ["captureGroups", "groupId"], ["assertions", "assertionId"],
    ["syncMappings", "mappingId"], ["dialogueUnits", "dialogueUnitId"],
    ["beats", "beatId"], ["coverage", "coverageId"],
    ["continuityObservations", "observationId"]]) {
    const current = new Map(next[field].map(item => [item[key], item]));
    const oldIds = new Set(previous[field].map(item => item[key]));
    for (const item of previous[field]) {
      if (!current.has(item[key]) || stableStringify(current.get(item[key])) !== stableStringify(item))
        fail("PROJECT_INTELLIGENCE_LINEAGE", `${field}.${item[key]}`);
    }
    for (const item of next[field]) {
      if (item.supersedes !== undefined && item.supersedes !== null &&
          !oldIds.has(item.supersedes))
        fail("PROJECT_INTELLIGENCE_LINEAGE", `${field}.${item[key]}.supersedes`);
    }
  }
};

const summarizeProjectIntelligence = revision => {
  const { findings, planningBlocked } = validateProjectIntelligenceRevision(revision);
  return {
    projectId: revision.projectId, revisionId: revision.revisionId,
    assets: revision.assets.map(asset => ({ assetId: asset.assetId,
      sourceRef: asset.sourceRef, contentHash: asset.contentHash,
      durationTicks: asset.durationTicks, mediaType: asset.mediaType,
      technical: asset.technical, streams: asset.streams })),
    evidenceCatalog: revision.evidenceRefs,
    captureGroups: active(revision.captureGroups, "captureGroups").map(group => ({
      groupId: group.groupId, captureEventId: group.captureEventId,
      anchorAssetId: group.anchorAssetId, members: group.members, state: group.state,
      evidenceRefs: group.evidenceRefs, provenance: group.provenance,
      uncertainty: group.uncertainty, review: group.review })),
    assertions: active(revision.assertions, "assertions"),
    syncMappings: active(revision.syncMappings, "syncMappings")
      .map(item => ({ mappingId: item.mappingId,
      sourceStreamId: item.sourceStreamId, referenceStreamId: item.referenceStreamId,
      offsetTicks: item.offsetTicks, rateNumerator: item.rateNumerator,
      rateDenominator: item.rateDenominator, residualMaxTicks: item.residualMaxTicks,
      method: item.method, coveredSourceRange: item.coveredSourceRange,
      uncertainty: item.uncertainty, state: item.state, evidenceRefs: item.evidenceRefs,
      provenance: item.provenance, review: item.review })),
    dialogueUnits: active(revision.dialogueUnits, "dialogueUnits"),
    continuityObservations: active(revision.continuityObservations, "continuityObservations"),
    beats: revision.beats.map(beat => ({ ...beat,
      candidates: active(revision.coverage, "coverage").filter(item => item.beatId === beat.beatId &&
        item.state !== "rejected"),
      coverageState: active(revision.coverage, "coverage").some(item => item.beatId === beat.beatId &&
        item.state !== "rejected") ? "candidate_available" : "missing" })),
    findings, planningBlocked,
  };
};

module.exports = { VERSION, MAX_BYTES, SHOT_ROLES, CAMERA_MOTIONS, CONTINUITY_TYPES,
  validateAssetManifest, validateProjectIntelligenceRevision,
  createProjectIntelligenceRevision, assertRevisionTransition,
  mapCaptureClockTick, findProjectIntelligenceFindings, summarizeProjectIntelligence,
  stableStringify, digest };
