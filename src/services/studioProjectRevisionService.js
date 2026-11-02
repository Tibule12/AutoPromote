const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const { subjectVfxRevision } = require("../../frontend/src/components/studioSubjectVfxContract");

const SCHEMA_VERSION = 1;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_ITEMS = 2_000;
const validModelArtifactReference = ref => {
  try { require('../generated/studioDirectorReplayKernel.cjs').createModelArtifactReference(ref); return true; }
  catch (_) { return false; }
};
const DOCUMENT_FIELDS = [
  "schemaVersion", "projectId", "revision", "clock", "output", "assets",
  "clipOccurrences", "timeMaps", "layers", "linkedTiming", "audioGraph",
  "constraints", "styleRef", "analysisRefs", "programmeSpeedKeys", "fallbackSpeed",
  "outputTimeMap", "journal", "idempotency", "directorReviewJournal", "compatibility",
  "projectIntelligenceRefs",
  "visualGraph", "editGraph",
];

const plain = value => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  // Firestore and Jest can materialize plain JSON in a different JS realm.
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};
const ownKeys = (value, keys) => plain(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const allowedKeys = (value, required, optional = []) => plain(value) &&
  required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const validId = value => typeof value === "string" && value.length > 0 &&
  value.length <= 160 && value === value.trim() && value !== "." && value !== ".." &&
  !/[\x00-\x1f\x7f/]/.test(value);
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validTick = value => Number.isSafeInteger(value) && value >= 0;
const validRange = (value, space) => ownKeys(value, ["space", "startTick", "endTick"]) &&
  value.space === space && validTick(value.startTick) &&
  validTick(value.endTick) && value.endTick > value.startTick;
const same = (left, right) => stableStringify(left) === stableStringify(right);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const stableStringify = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
);

const revisionError = (code, statusCode) => Object.assign(new Error(code), {
  code, statusCode,
});
const invalid = () => revisionError("STUDIO_PROJECT_REVISION_INVALID", 400);
const tooLarge = () => revisionError("STUDIO_PROJECT_REVISION_TOO_LARGE", 413);
const unavailable = () => revisionError("STUDIO_PROJECT_REVISION_UNAVAILABLE", 503);
const conflict = () => revisionError("STUDIO_PROJECT_REVISION_CONFLICT", 409);
const stale = () => revisionError("STUDIO_PROJECT_REVISION_STALE", 409);

// Bound arbitrary display settings in layers, audio routing and command journals.
// The document is stored as canonical JSON so nested arrays do not depend on
// Firestore's array representation or its field-name restrictions.
const boundedJsonTree = root => {
  let nodes = 0;
  const subjectRevisionPaths = new Set([
    "layers[].parameters.preview.revision", "layers[].parameters.pending.revision",
  ]);
  const subjectRevisions = new Set((Array.isArray(root?.layers) ? root.layers : [])
    .filter(layer => layer?.type === "subject_vfx")
    .flatMap(layer => [layer.parameters?.preview?.revision, layer.parameters?.pending?.revision])
    .filter(value => typeof value === "string"));
  const subjectSelections = (Array.isArray(root?.layers) ? root.layers : [])
    .filter(layer => layer?.type === "subject_vfx" && typeof layer.parameters?.maskJob?.selectionJson === "string")
    .map(layer => ({ value: layer.parameters.maskJob.selectionJson, scene: layer.parameters.scene,
      finished:layer.parameters.maskJob.finished===true,ref:layer.parameters.modelArtifactRef }));
  const lut = root?.visualGraph?.settings?.advancedColor?.lutData;
  const lutPath = "visualGraph.settings.advancedColor.lutData.data";
  const completeLut = plain(lut) && Number.isInteger(lut.size) && lut.size >= 2 && lut.size <= 65 &&
    ownKeys(lut, ["size", "data", "domainMin", "domainMax"]) &&
    Array.isArray(lut.data) && lut.data.length === 3 * lut.size ** 3 &&
    [lut.domainMin, lut.domainMax].every(domain => Array.isArray(domain) && domain.length === 3 && domain.every(Number.isFinite)) &&
    lut.domainMax.every((value, index) => value > lut.domainMin[index]);
  const visit = (value, depth, path = "") => {
    nodes += 1;
    if (nodes > 60_000 || depth > 18) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "string") {
      if (value.length <= 16_384) return true;
      // A native fine-matting request serializes bounded source-specific
      // holdout groups inside its saved selection. Keep the ordinary text
      // limit; accept this exact field only after validating its source,
      // selection schema and decoded tree against the same global limits.
      if (path === "layers[].parameters.maskJob.selectionJson" && value.length <= 48 * 1024) {
        try {
          const selection=JSON.parse(value);
          const match=subjectSelections.find(item=>item.value===value && item.scene &&
            same(selection.sourceId,item.scene.sourceId) && same(selection.sourceStoragePath,item.scene.sourceStoragePath) &&
            same(selection.sourceRange,item.scene.sourceRange) && (same(selection.prompt,item.scene.prompt) ||
              item.finished && validModelArtifactReference(item.ref) && item.ref.capability==='segment_subject' &&
              item.ref.sourceAssetId===item.scene.sourceId));
          if (!match || !allowedKeys(selection,["sourceId","sourceStoragePath","sourceRange","prompt","box"],["components","refinement"]) ||
              stableStringify(selection)!==value) return false;
          // Imported model scenes may use their normalized mask prompt. The
          // finished request keeps its original selection for recovery/history.
          subjectVfxRevision({...match.scene,prompt:selection.prompt});
          const parameters={subjectId:match.scene.id,initialBox:selection.box,
            points:selection.prompt.points.map((position,i)=>({position,label:selection.prompt.labels[i]})),
            shotPrompts:selection.prompt.shotPrompts.map(shot=>({frameIndex:Math.round(shot.time*24),box:selection.box,
              points:shot.points.map((position,i)=>({position,label:shot.labels[i]}))})),
            ...(selection.components?{components:selection.components}:{}),...(selection.refinement?{refinement:selection.refinement}:{})};
          const sourceRange={space:"source",startTick:Math.round(selection.sourceRange.start*90000),endTick:Math.round(selection.sourceRange.end*90000)};
          require("../modelRuntime/contract").request({schemaVersion:1,requestId:"saved-mask-selection-validation",
            projectId:root.projectId,projectRevision:root.revision,sourceAssetId:selection.sourceId,
            sourceSha256:"a".repeat(64),sourceStoragePath:selection.sourceStoragePath,sourceRange,
            capability:"segment_subject",dependencyHashes:selection.refinement?[selection.refinement.maskArtifactHash]:[],parameters});
          return visit(selection,depth+1,`${path}.selection`);
        } catch (_) { return false; }
      }
      // Native subject revisions serialize the complete editable scene, including
      // detailed paths. Validate that scene instead of treating it as free text.
      // All ordinary strings and the document/node/depth limits stay bounded.
      if (!subjectRevisionPaths.has(path) || !subjectRevisions.has(value) ||
          value.length > 128 * 1024) return false;
      try {
        const scene = JSON.parse(value);
        return subjectVfxRevision(scene) === value && visit(scene, depth + 1, `${path}.scene`);
      } catch (_) { return false; }
    }
    if (typeof value === "number") return Number.isFinite(value);
    // A complete native colour cube is a flat numeric grid, not thousands of
    // timeline commands. Retain the global node/byte/depth bounds and allow
    // only this exact validated field to exceed the ordinary item limit.
    if (Array.isArray(value)) return (path === lutPath ? completeLut : value.length <= MAX_ITEMS) &&
      value.every(item => (path !== lutPath || typeof item === "number") && visit(item, depth + 1, `${path}[]`));
    if (!plain(value)) return false;
    const keys = Object.keys(value);
    return keys.length <= MAX_ITEMS && keys.every(key =>
      key.length <= 160 && !/[\x00-\x1f\x7f]/.test(key) &&
      !["__proto__", "constructor", "prototype"].includes(key) &&
      visit(value[key], depth + 1, path ? `${path}.${key}` : key)
    );
  };
  return visit(root, 0);
};

const validOutput = value => allowedKeys(value, [
  "aspectRatio", "requestedResolution", "frameRate", "codec", "audioCodec",
  "audioSampleRate", "audioSampleRatePolicy",
]) && ["aspectRatio", "requestedResolution", "codec", "audioCodec"].every(
  key => typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 160
) && value.audioSampleRate === null &&
  value.audioSampleRatePolicy === "worker_selected" &&
  (ownKeys(value.frameRate, ["mode"]) && value.frameRate.mode === "source" ||
    ownKeys(value.frameRate, ["numerator", "denominator"]) &&
    Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0 &&
    Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0);

const validAsset = asset => allowedKeys(asset,
  ["assetId", "sourceId", "identityState"], ["storagePath", "contentHash"]) &&
  validId(asset.assetId) && validId(asset.sourceId) &&
  (asset.storagePath === undefined || typeof asset.storagePath === "string" &&
    asset.storagePath.length > 0 && asset.storagePath.length <= 4_096) &&
  (asset.identityState === "hash_verified"
    ? validHash(asset.contentHash) &&
      asset.assetId === `source:${asset.sourceId}:sha256:${asset.contentHash}`
    : asset.identityState === "legacy_reference_unverified" &&
      asset.contentHash === undefined && asset.assetId === `source:${asset.sourceId}`);

const validOccurrence = (occurrence, assetIds, programmeStart) =>
  allowedKeys(occurrence, [
    "occurrenceId", "assetId", "sourceRange", "programmeRange", "timeMapId", "playback",
  ], ["inheritedFromOccurrenceId", "legacyParentIds", "parameterSchemaVersion", "parameters"]) &&
  validId(occurrence.occurrenceId) && assetIds.has(occurrence.assetId) &&
  occurrence.timeMapId === `map:${occurrence.occurrenceId}` &&
  validRange(occurrence.sourceRange, "source") &&
  validRange(occurrence.programmeRange, "programme") &&
  occurrence.programmeRange.startTick === programmeStart &&
  occurrence.programmeRange.endTick - programmeStart ===
    occurrence.sourceRange.endTick - occurrence.sourceRange.startTick &&
  ownKeys(occurrence.playback, ["direction", "freeze", "rate"]) &&
  occurrence.playback.direction === "forward" && occurrence.playback.freeze === false &&
  ownKeys(occurrence.playback.rate, ["numerator", "denominator"]) &&
  occurrence.playback.rate.numerator === 1 && occurrence.playback.rate.denominator === 1 &&
  (occurrence.inheritedFromOccurrenceId === undefined ||
    validId(occurrence.inheritedFromOccurrenceId)) &&
  (occurrence.legacyParentIds === undefined ||
    Array.isArray(occurrence.legacyParentIds) && occurrence.legacyParentIds.length <= 64 &&
    occurrence.legacyParentIds.every(validId));

const validTimeMap = (map, occurrence) => {
  if (!ownKeys(map, ["timeMapId", "occurrenceId", "segments"]) ||
      map.timeMapId !== occurrence.timeMapId ||
      map.occurrenceId !== occurrence.occurrenceId ||
      !Array.isArray(map.segments) || map.segments.length !== 1) return false;
  const segment = map.segments[0];
  const duration = occurrence.sourceRange.endTick - occurrence.sourceRange.startTick;
  return ownKeys(segment, [
    "sourceRange", "clipLocalRange", "programmeRange", "rate", "direction", "freeze",
  ]) && same(segment.sourceRange, occurrence.sourceRange) &&
    same(segment.programmeRange, occurrence.programmeRange) &&
    same(segment.clipLocalRange, { space: "clip_local", startTick: 0, endTick: duration }) &&
    same(segment.rate, { numerator: 1, denominator: 1 }) &&
    segment.direction === "forward" && segment.freeze === false;
};

const validOutputMap = (segments, programmeDuration) => {
  if (!Array.isArray(segments) || segments.length > MAX_ITEMS ||
      (programmeDuration > 0 && segments.length === 0)) return false;
  let programmeCursor = 0;
  let outputCursor = 0;
  for (const segment of segments) {
    if (!ownKeys(segment, [
      "programmeRange", "outputRange", "rateNumerator", "rateDenominator",
    ]) || !validRange(segment.programmeRange, "programme") ||
        !validRange(segment.outputRange, "output") ||
        segment.programmeRange.startTick !== programmeCursor ||
        segment.outputRange.startTick !== outputCursor ||
        !Number.isSafeInteger(segment.rateNumerator) || segment.rateNumerator <= 0 ||
        !Number.isSafeInteger(segment.rateDenominator) || segment.rateDenominator <= 0)
      return false;
    programmeCursor = segment.programmeRange.endTick;
    outputCursor = segment.outputRange.endTick;
  }
  return programmeCursor === programmeDuration;
};

const validateStudioProjectRevisionDocument = document => {
  if (!allowedKeys(document, DOCUMENT_FIELDS.filter(key =>
    !["projectIntelligenceRefs", "visualGraph", "editGraph"].includes(key)), ["projectIntelligenceRefs", "visualGraph", "editGraph"]) ||
      !boundedJsonTree(document) ||
      document.schemaVersion !== SCHEMA_VERSION || !validId(document.projectId) ||
      !Number.isSafeInteger(document.revision) || document.revision < 0 ||
      !ownKeys(document.clock, ["ticksPerSecond", "interval"]) ||
      document.clock.ticksPerSecond !== 90_000 || document.clock.interval !== "half_open" ||
      !validOutput(document.output) ||
      !Array.isArray(document.assets) || document.assets.length > MAX_ITEMS ||
      !document.assets.every(validAsset) ||
      !Array.isArray(document.clipOccurrences) || document.clipOccurrences.length > MAX_ITEMS ||
      !Array.isArray(document.timeMaps) ||
      document.timeMaps.length !== document.clipOccurrences.length ||
      !Array.isArray(document.layers) || document.layers.length > MAX_ITEMS ||
      !plain(document.linkedTiming) || !plain(document.linkedTiming.cues) ||
      !plain(document.linkedTiming.keys) || !plain(document.audioGraph) ||
      !plain(document.constraints) || !Array.isArray(document.constraints.locks) ||
      !Array.isArray(document.analysisRefs) || !Array.isArray(document.programmeSpeedKeys) ||
      !Number.isFinite(document.fallbackSpeed) || document.fallbackSpeed <= 0 ||
      !Array.isArray(document.outputTimeMap) || !Array.isArray(document.journal) ||
      !plain(document.idempotency) || !Array.isArray(document.directorReviewJournal) ||
      !plain(document.compatibility)) throw invalid();
  const assetIds = new Set(document.assets.map(asset => asset.assetId));
  if (assetIds.size !== document.assets.length) throw invalid();
  const occurrenceIds = new Set();
  let programmeDuration = 0;
  for (const occurrence of document.clipOccurrences) {
    if (!validOccurrence(occurrence, assetIds, programmeDuration) ||
        occurrenceIds.has(occurrence.occurrenceId)) throw invalid();
    occurrenceIds.add(occurrence.occurrenceId);
    programmeDuration = occurrence.programmeRange.endTick;
  }
  if (!document.timeMaps.every((map, index) =>
    validTimeMap(map, document.clipOccurrences[index])) ||
      !validOutputMap(document.outputTimeMap, programmeDuration)) throw invalid();
  if (!document.layers.every(layer => plain(layer) && validId(layer.layerId) &&
      ["caption", "title", "b_roll", "motion", "three_d", "subject_vfx"].includes(layer.type) &&
      plain(layer.parameters))) throw invalid();
  if (!Object.values(document.linkedTiming.cues).every(Array.isArray) ||
      !Object.values(document.linkedTiming.keys).every(Array.isArray) ||
      !document.constraints.locks.every(lock => plain(lock) && validId(lock.lockId) &&
        occurrenceIds.has(lock.occurrenceId) && lock.mode === "preserve" &&
        validRange(lock.sourceRange, "source"))) throw invalid();
  if (!document.analysisRefs.every(ref => ref?.kind === "model_capability" ?
      validModelArtifactReference(ref) : plain(ref) &&
      ref.kind === "semantic_timeline" && Number.isSafeInteger(ref.schemaVersion) &&
      validId(ref.artifactId) && validHash(ref.manifestContentHash) &&
      validHash(ref.sourceContentHash) && typeof ref.cacheKey === "string" &&
      ref.cacheKey.length <= 512)) throw invalid();
  for (const layer of document.layers.filter(item => item.type === 'subject_vfx')) {
    for (const [field,capability] of [['modelArtifactRef','segment_subject'],['trackingArtifactRef','track_object']]) {
      const ref=layer.parameters[field],scene=layer.parameters.scene;
      if(ref && (!validModelArtifactReference(ref) || ref.capability!==capability || ref.sourceAssetId!==scene?.sourceId ||
        ref.sourceRange.startTick!==Math.round(scene?.sourceRange?.start*90000) ||
        ref.sourceRange.endTick!==Math.round(scene?.sourceRange?.end*90000)))throw invalid();
    }
  }
  if (document.projectIntelligenceRefs !== undefined &&
      (!Array.isArray(document.projectIntelligenceRefs) ||
        document.projectIntelligenceRefs.length > 1 ||
        !document.projectIntelligenceRefs.every(ref => ownKeys(ref,
          ["revisionId", "manifestHash", "dependencyDigest"]) &&
          validHash(ref.revisionId) && validHash(ref.manifestHash) &&
          validHash(ref.dependencyDigest)) ||
        new Set(document.projectIntelligenceRefs.map(ref => ref.revisionId)).size !==
          document.projectIntelligenceRefs.length)) throw invalid();
  if (!document.programmeSpeedKeys.every(key => allowedKeys(key,
    ["atProgrammeTick", "rate", "easing"], ["id"]) &&
    (key.id === undefined || validId(key.id)) && validTick(key.atProgrammeTick) &&
    Number.isFinite(key.rate) && key.rate > 0 && typeof key.easing === "string")) throw invalid();
  let documentJson;
  try {
    documentJson = stableStringify(document);
  } catch (_) {
    throw invalid();
  }
  if (Buffer.byteLength(documentJson, "utf8") > MAX_DOCUMENT_BYTES) throw tooLarge();
  // Use the same versioned parameter contract as manual editing and Director.
  // Keep the existing ownership, JSON bounds and time-map checks above.
  if (document.compatibility.editableStateVersion !== undefined) {
    try {
      require("../generated/studioDirectorReplayKernel.cjs").validateStudioProjectDocument(document);
    } catch (_) {
      throw invalid();
    }
  }
  return { documentJson, documentFingerprint: sha256(documentJson) };
};

const headIdFor = projectId => sha256(projectId);
const revisionIdFor = (projectId, revision) => sha256(`${projectId}\0${revision}`);
const headRefFor = (firestore, uid, projectId) => firestore.collection("users").doc(uid)
  .collection("studioDirectorProjects").doc(headIdFor(projectId));
const revisionRefFor = (firestore, uid, projectId, revision) =>
  firestore.collection("users").doc(uid)
    .collection("studioDirectorProjectRevisions")
    .doc(revisionIdFor(projectId, revision));

const parseStudioProjectHeadRecord = (record, uid, projectId) => {
  if (!plain(record) || record.schemaVersion !== SCHEMA_VERSION ||
      record.ownerUid !== uid || record.projectId !== projectId ||
      !Number.isSafeInteger(record.revision) || record.revision < 0 ||
      record.serverRevisionId !== revisionIdFor(projectId, record.revision) ||
      !validHash(record.documentFingerprint) ||
      typeof record.documentJson !== "string" ||
      Buffer.byteLength(record.documentJson, "utf8") > MAX_DOCUMENT_BYTES ||
      typeof record.registeredAt !== "string" ||
      Number.isNaN(Date.parse(record.registeredAt)) ||
      sha256(record.documentJson) !== record.documentFingerprint) throw unavailable();
  let document;
  try {
    document = JSON.parse(record.documentJson);
    const validated = validateStudioProjectRevisionDocument(document);
    if (document.projectId !== projectId || document.revision !== record.revision ||
        validated.documentJson !== record.documentJson ||
        validated.documentFingerprint !== record.documentFingerprint) throw unavailable();
  } catch (_) {
    throw unavailable();
  }
  return { ...record, document };
};

const receiptFor = (record, duplicate) => ({
  ok: true,
  projectId: record.projectId,
  revision: record.revision,
  documentFingerprint: record.documentFingerprint,
  serverRevisionId: record.serverRevisionId,
  registeredAt: record.registeredAt,
  duplicate,
});

const registerOwnedStudioProjectRevision = async ({ uid, document, firestore = db }) => {
  if (!validId(uid)) throw invalid();
  const { documentJson, documentFingerprint } =
    validateStudioProjectRevisionDocument(document);
  const { projectId, revision } = document;
  const headRef = headRefFor(firestore, uid, projectId);
  const revisionRef = revisionRefFor(firestore, uid, projectId, revision);
  const record = {
    schemaVersion: SCHEMA_VERSION,
    ownerUid: uid,
    projectId,
    revision,
    documentFingerprint,
    serverRevisionId: revisionIdFor(projectId, revision),
    documentJson,
    registeredAt: new Date().toISOString(),
  };
  try {
    return await firestore.runTransaction(async transaction => {
      const [headSnapshot, revisionSnapshot] = await Promise.all([
        transaction.get(headRef), transaction.get(revisionRef),
      ]);
      const head = headSnapshot.exists
        ? parseStudioProjectHeadRecord(headSnapshot.data(), uid, projectId) : null;
      const prior = revisionSnapshot.exists
        ? parseStudioProjectHeadRecord(revisionSnapshot.data(), uid, projectId) : null;
      const modelRefs=[...document.analysisRefs.filter(item => item.kind === 'model_capability'),
        ...document.layers.filter(layer=>layer.type==='subject_vfx').flatMap(layer=>
          [layer.parameters.modelArtifactRef,layer.parameters.trackingArtifactRef].filter(Boolean))];
      for (const ref of modelRefs) {
        const artifactDoc = await transaction.get(firestore.collection('studio_model_capability_artifacts').doc(ref.artifactHash));
        if (!artifactDoc.exists) throw invalid();
        let artifact;
        try { artifact = require('../modelRuntime/artifacts').verifyArtifact(JSON.parse(artifactDoc.data().artifactJson), {ownerUid:uid,projectId}); }
        catch (_) { throw invalid(); }
        if (artifact.sourceAssetId !== ref.sourceAssetId || artifact.sourceSha256 !== ref.sourceContentHash ||
            artifact.capability !== ref.capability || !same(artifact.sourceRange,ref.sourceRange) ||
            !document.assets.some(asset => (asset.sourceId === ref.sourceAssetId || asset.assetId === ref.sourceAssetId) && asset.contentHash === ref.sourceContentHash))
          throw invalid();
      }
      if (document.projectIntelligenceRefs?.length) {
        const { intelligenceRevisionRef, parseProjectIntelligenceRecord } =
          require("./studioProjectIntelligenceService");
        const referenced = await Promise.all(document.projectIntelligenceRefs.map(ref =>
          transaction.get(intelligenceRevisionRef(firestore, uid, projectId, ref.revisionId))));
        for (let index = 0; index < referenced.length; index += 1) {
          const ref = document.projectIntelligenceRefs[index];
          if (!referenced[index].exists) throw invalid();
          let stored;
          try {
            stored = parseProjectIntelligenceRecord(referenced[index].data(), {
              uid, projectId, revisionId: ref.revisionId,
            });
          } catch (_) { throw invalid(); }
          if (stored.manifestHash !== ref.manifestHash ||
              stored.dependencyDigest !== ref.dependencyDigest) throw invalid();
        }
      }
      if (prior) {
        if (prior.documentFingerprint !== documentFingerprint) throw conflict();
        if (!head || head.revision < revision) throw unavailable();
        return receiptFor(prior, true);
      }
      if (head && revision <= head.revision) throw stale();
      transaction.create(revisionRef, record);
      transaction.set(headRef, record);
      return receiptFor(record, false);
    });
  } catch (error) {
    if (error?.statusCode) throw error;
    throw unavailable();
  }
};

const getCurrentOwnedStudioProjectRevision = async ({ uid, projectId, firestore = db }) => {
  if (!validId(uid) || !validId(projectId)) throw invalid();
  try {
    const head = await headRefFor(firestore, uid, projectId).get();
    return head.exists ? parseStudioProjectHeadRecord(head.data(), uid, projectId) : null;
  } catch (error) {
    if (error?.statusCode) throw error;
    throw unavailable();
  }
};

module.exports = {
  MAX_DOCUMENT_BYTES,
  getCurrentOwnedStudioProjectRevision,
  parseStudioProjectHeadRecord,
  registerOwnedStudioProjectRevision,
  validateStudioProjectRevisionDocument,
};
