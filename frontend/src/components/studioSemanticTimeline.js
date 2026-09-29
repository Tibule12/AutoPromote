import { TICKS_PER_SECOND } from "./studioTime";

/**
 * Semantic evidence contract for Viral Clip Studio.
 *
 * This module describes analysis artifacts, not edits. A renderer or editor must
 * never treat an editorial hypothesis as an accepted command. Large word, track,
 * waveform, and matte payloads live in immutable artifacts referenced by hash.
 */

export const SEMANTIC_TIMELINE_VERSION = 1;
export const SEMANTIC_TICKS_PER_SECOND = TICKS_PER_SECOND;

export const SEMANTIC_RECORD_TYPES = Object.freeze([
  "observation",
  "utterance",
  "word_alignment_ref",
  "voice_cluster",
  "visual_track",
  "speaker_visible_person_association",
  "shot_boundary",
  "scene_boundary",
  "audio_event",
  "music_speech_activity",
  "prosody_emphasis",
  "ocr_entity",
  "editorial_hypothesis",
  "chapter",
  "coverage",
]);

const SHA256 = /^[a-f0-9]{64}$/i;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/;
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}$/;
const RECORD_TYPE_SET = new Set(SEMANTIC_RECORD_TYPES);
const VERIFICATION_STATES = new Set(["unverified", "needs_review", "human_verified", "rejected"]);
const UNCERTAINTY_LEVELS = new Set(["unknown", "low", "medium", "high"]);

const RECORD_FIELDS = {
  observation: ["observationKind", "label"],
  utterance: ["text", "voiceClusterId", "wordAlignmentId"],
  word_alignment_ref: ["utteranceId", "alignmentFormat"],
  voice_cluster: ["clusterLabel"],
  visual_track: ["trackLabel"],
  speaker_visible_person_association: [
    "voiceClusterId",
    "visualTrackId",
    "association",
    "evidenceIds",
  ],
  shot_boundary: ["boundaryKind"],
  scene_boundary: ["boundaryKind"],
  audio_event: ["eventKind", "label"],
  music_speech_activity: ["activity"],
  prosody_emphasis: ["cue", "label"],
  ocr_entity: ["evidenceKind", "text", "entityType"],
  editorial_hypothesis: ["hypothesisKind", "rationale", "evidenceIds"],
  chapter: ["title", "evidenceIds"],
  coverage: ["analysisType", "coverageState"],
};
const COMMON_RECORD_FIELDS = new Set([
  "schemaVersion",
  "id",
  "type",
  "sourceRange",
  "provenance",
  "verification",
  "uncertainty",
  "artifactRefs",
]);

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.trim().length > 0;
const isToken = value => typeof value === "string" && TOKEN.test(value);
const isTick = value => Number.isSafeInteger(value) && value >= 0;
const hasHash = value => typeof value === "string" && SHA256.test(value);
const addError = (errors, code, path) => errors.push({ code, path });
const rejectUnknownFields = (value, allowed, path, errors) => {
  if (!isObject(value)) return;
  Object.keys(value).forEach(field => {
    if (!allowed.includes(field)) addError(errors, "UNSUPPORTED_FIELD", `${path}.${field}`);
  });
};

/**
 * A cache key is valid only after hashing the source bytes and the exact
 * settings/configuration. Filenames, source URLs, and mutable storage paths are
 * deliberately absent. The settings revision identifies the config schema;
 * configHash changes when any setting value changes within that revision.
 */
export function buildSemanticAnalysisCacheKey({
  sourceContentHash,
  analysisType,
  modelRevision,
  configRevision,
  configHash,
} = {}) {
  if (!hasHash(sourceContentHash)) throw new Error("sourceContentHash must be a SHA-256 digest");
  if (!isToken(analysisType)) throw new Error("analysisType must be a stable token");
  if (!isToken(modelRevision)) throw new Error("modelRevision must be a stable token");
  if (!isToken(configRevision)) throw new Error("configRevision must be a stable token");
  if (!hasHash(configHash)) throw new Error("configHash must be a SHA-256 digest");
  return [
    "semantic",
    SEMANTIC_TIMELINE_VERSION,
    sourceContentHash.toLowerCase(),
    analysisType,
    modelRevision,
    configRevision,
    configHash.toLowerCase(),
  ].join(":");
}

function validateArtifactRef(ref, path, errors) {
  if (!isObject(ref)) return addError(errors, "INVALID_ARTIFACT_REF", path);
  rejectUnknownFields(ref, ["artifactId", "contentHash", "storageKey", "mediaType"], path, errors);
  if (!isText(ref.artifactId)) addError(errors, "MISSING_ARTIFACT_ID", `${path}.artifactId`);
  if (!hasHash(ref.contentHash)) addError(errors, "INVALID_ARTIFACT_HASH", `${path}.contentHash`);
  if (
    !isText(ref.storageKey) ||
    !STORAGE_KEY.test(ref.storageKey) ||
    ref.storageKey.split("/").some(part => part === ".." || part === "")
  ) {
    addError(errors, "INVALID_ARTIFACT_STORAGE_KEY", `${path}.storageKey`);
  }
  if (!isText(ref.mediaType)) addError(errors, "MISSING_ARTIFACT_MEDIA_TYPE", `${path}.mediaType`);
}

function validateRecord(record, index, durationTicks, artifactIds, errors) {
  const path = `records[${index}]`;
  if (!isObject(record)) return addError(errors, "INVALID_RECORD", path);
  if (record.schemaVersion !== SEMANTIC_TIMELINE_VERSION) {
    addError(errors, "UNSUPPORTED_RECORD_VERSION", `${path}.schemaVersion`);
  }
  if (!isText(record.id)) addError(errors, "MISSING_RECORD_ID", `${path}.id`);
  if (!RECORD_TYPE_SET.has(record.type)) {
    addError(errors, "UNKNOWN_RECORD_TYPE", `${path}.type`);
    return;
  }
  const allowed = new Set([...COMMON_RECORD_FIELDS, ...RECORD_FIELDS[record.type]]);
  Object.keys(record).forEach(field => {
    if (!allowed.has(field)) addError(errors, "UNSUPPORTED_RECORD_FIELD", `${path}.${field}`);
  });

  const range = record.sourceRange;
  const point = record.type === "shot_boundary" || record.type === "scene_boundary";
  rejectUnknownFields(range, ["space", "startTick", "endTick"], `${path}.sourceRange`, errors);
  if (
    !isObject(range) ||
    range.space !== "source" ||
    !isTick(range.startTick) ||
    !isTick(range.endTick) ||
    range.endTick > durationTicks ||
    (point ? range.endTick !== range.startTick : range.endTick <= range.startTick)
  ) {
    addError(errors, "INVALID_SOURCE_RANGE", `${path}.sourceRange`);
  }

  const provenance = record.provenance;
  rejectUnknownFields(
    provenance,
    ["provider", "model", "modelRevision", "configHash", "runId"],
    `${path}.provenance`,
    errors
  );
  if (
    !isObject(provenance) ||
    !isText(provenance.provider) ||
    !isText(provenance.model) ||
    !isText(provenance.modelRevision) ||
    !hasHash(provenance.configHash) ||
    !isText(provenance.runId)
  ) {
    addError(errors, "INVALID_PROVENANCE", `${path}.provenance`);
  }
  const verification = record.verification;
  rejectUnknownFields(
    verification,
    ["state", "reviewerId", "reviewedAt"],
    `${path}.verification`,
    errors
  );
  if (
    !isObject(verification) ||
    !VERIFICATION_STATES.has(verification.state) ||
    (["human_verified", "rejected"].includes(verification.state) &&
      (!isText(verification.reviewerId) || !isText(verification.reviewedAt)))
  ) {
    addError(errors, "INVALID_VERIFICATION", `${path}.verification`);
  }
  const uncertainty = record.uncertainty;
  rejectUnknownFields(uncertainty, ["level", "basis"], `${path}.uncertainty`, errors);
  if (
    !isObject(uncertainty) ||
    !UNCERTAINTY_LEVELS.has(uncertainty.level) ||
    !isText(uncertainty.basis) ||
    "probability" in uncertainty ||
    "confidence" in uncertainty
  ) {
    addError(errors, "INVALID_UNCERTAINTY", `${path}.uncertainty`);
  }

  if (!Array.isArray(record.artifactRefs)) {
    addError(errors, "INVALID_RECORD_ARTIFACT_REFS", `${path}.artifactRefs`);
  } else {
    record.artifactRefs.forEach((id, artifactIndex) => {
      if (!isText(id) || !artifactIds.has(id)) {
        addError(errors, "UNKNOWN_ARTIFACT_REF", `${path}.artifactRefs[${artifactIndex}]`);
      }
    });
  }

  const requireText = field => {
    if (!isText(record[field])) addError(errors, "MISSING_RECORD_FIELD", `${path}.${field}`);
  };
  const requireEnum = (field, choices) => {
    if (!choices.includes(record[field]))
      addError(errors, "INVALID_RECORD_FIELD", `${path}.${field}`);
  };
  switch (record.type) {
    case "observation":
      requireText("observationKind");
      break;
    case "utterance":
      requireText("text");
      break;
    case "word_alignment_ref":
      requireText("utteranceId");
      requireText("alignmentFormat");
      if (!record.artifactRefs?.length)
        addError(errors, "MISSING_ALIGNMENT_ARTIFACT", `${path}.artifactRefs`);
      break;
    case "voice_cluster":
      requireText("clusterLabel");
      break;
    case "visual_track":
      requireText("trackLabel");
      break;
    case "speaker_visible_person_association":
      requireText("voiceClusterId");
      requireText("visualTrackId");
      requireEnum("association", ["cooccurs", "speaking_likely", "human_confirmed"]);
      break;
    case "shot_boundary":
    case "scene_boundary":
      requireEnum("boundaryKind", ["start", "end", "cut"]);
      break;
    case "audio_event":
      requireText("eventKind");
      break;
    case "music_speech_activity":
      requireEnum("activity", ["speech", "music", "both", "neither", "unknown"]);
      break;
    case "prosody_emphasis":
      requireEnum("cue", ["emphasis", "pitch_change", "loudness_change", "pause", "pace_change"]);
      break;
    case "ocr_entity":
      requireEnum("evidenceKind", ["ocr", "entity"]);
      requireText("text");
      break;
    case "editorial_hypothesis":
      requireEnum("hypothesisKind", [
        "hook",
        "payoff",
        "important_claim",
        "reaction",
        "boring_section",
        "other",
      ]);
      requireText("rationale");
      break;
    case "chapter":
      requireText("title");
      break;
    case "coverage":
      requireText("analysisType");
      requireEnum("coverageState", ["complete", "partial", "failed", "not_analyzed"]);
      break;
    default:
      break;
  }
}

/** Validate an immutable manifest before persisting it or attaching a project ref. */
export function validateSemanticTimeline(manifest) {
  const errors = [];
  if (!isObject(manifest))
    return { valid: false, errors: [{ code: "INVALID_MANIFEST", path: "" }] };
  rejectUnknownFields(
    manifest,
    ["schemaVersion", "artifactId", "source", "analysis", "artifacts", "records"],
    "manifest",
    errors
  );
  if (manifest.schemaVersion !== SEMANTIC_TIMELINE_VERSION) {
    addError(errors, "UNSUPPORTED_SEMANTIC_VERSION", "schemaVersion");
  }
  if (!isText(manifest.artifactId)) addError(errors, "MISSING_MANIFEST_ID", "artifactId");
  const source = manifest.source;
  rejectUnknownFields(
    source,
    ["assetId", "contentHash", "durationTicks", "ticksPerSecond"],
    "source",
    errors
  );
  if (
    !isObject(source) ||
    !isText(source.assetId) ||
    !hasHash(source.contentHash) ||
    !isTick(source.durationTicks) ||
    source.ticksPerSecond !== SEMANTIC_TICKS_PER_SECOND
  ) {
    addError(errors, "INVALID_SOURCE", "source");
  }
  const analysis = manifest.analysis;
  rejectUnknownFields(
    analysis,
    ["analysisType", "modelRevision", "configRevision", "configHash", "cacheKey"],
    "analysis",
    errors
  );
  if (!isObject(analysis)) {
    addError(errors, "INVALID_ANALYSIS", "analysis");
  } else {
    try {
      const expected = buildSemanticAnalysisCacheKey({
        sourceContentHash: source?.contentHash,
        analysisType: analysis.analysisType,
        modelRevision: analysis.modelRevision,
        configRevision: analysis.configRevision,
        configHash: analysis.configHash,
      });
      if (analysis.cacheKey !== expected)
        addError(errors, "CACHE_KEY_MISMATCH", "analysis.cacheKey");
    } catch (_error) {
      addError(errors, "INVALID_ANALYSIS", "analysis");
    }
  }
  const artifactIds = new Set();
  if (!Array.isArray(manifest.artifacts)) {
    addError(errors, "INVALID_ARTIFACTS", "artifacts");
  } else {
    manifest.artifacts.forEach((artifact, index) => {
      validateArtifactRef(artifact, `artifacts[${index}]`, errors);
      if (isText(artifact?.artifactId)) {
        if (artifactIds.has(artifact.artifactId))
          addError(errors, "DUPLICATE_ARTIFACT_ID", `artifacts[${index}].artifactId`);
        artifactIds.add(artifact.artifactId);
      }
    });
  }
  const recordById = new Map();
  if (!Array.isArray(manifest.records)) {
    addError(errors, "INVALID_RECORDS", "records");
  } else {
    manifest.records.forEach((record, index) => {
      validateRecord(record, index, source?.durationTicks, artifactIds, errors);
      if (isText(record?.id)) {
        if (recordById.has(record.id))
          addError(errors, "DUPLICATE_RECORD_ID", `records[${index}].id`);
        recordById.set(record.id, record);
      }
    });
    manifest.records.forEach((record, index) => {
      if (!isObject(record)) return;
      const path = `records[${index}]`;
      const checkRef = (field, expectedType) => {
        if (record[field] && recordById.get(record[field])?.type !== expectedType) {
          addError(errors, "INVALID_TYPED_REFERENCE", `${path}.${field}`);
        }
      };
      if (record.type === "utterance") {
        checkRef("voiceClusterId", "voice_cluster");
        checkRef("wordAlignmentId", "word_alignment_ref");
      }
      if (record.type === "word_alignment_ref") checkRef("utteranceId", "utterance");
      if (record.type === "speaker_visible_person_association") {
        checkRef("voiceClusterId", "voice_cluster");
        checkRef("visualTrackId", "visual_track");
      }
      if (
        ["speaker_visible_person_association", "editorial_hypothesis", "chapter"].includes(
          record.type
        )
      ) {
        if (!Array.isArray(record.evidenceIds) || record.evidenceIds.length === 0) {
          addError(errors, "MISSING_EVIDENCE_REFS", `${path}.evidenceIds`);
        } else {
          record.evidenceIds.forEach((id, evidenceIndex) => {
            const evidence = recordById.get(id);
            if (
              !evidence ||
              evidence.id === record.id ||
              ["editorial_hypothesis", "chapter", "coverage"].includes(evidence.type)
            ) {
              addError(errors, "INVALID_EVIDENCE_REF", `${path}.evidenceIds[${evidenceIndex}]`);
            }
          });
        }
      }
      if (
        record.type === "speaker_visible_person_association" &&
        record.association === "human_confirmed" &&
        record.verification?.state !== "human_verified"
      ) {
        addError(errors, "ASSOCIATION_REQUIRES_REVIEW", `${path}.verification`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export function createSemanticTimelineManifest(input) {
  const manifest = { ...input, schemaVersion: input?.schemaVersion ?? SEMANTIC_TIMELINE_VERSION };
  const result = validateSemanticTimeline(manifest);
  if (!result.valid) {
    throw new Error(
      `Invalid semantic timeline: ${result.errors.map(error => `${error.code} at ${error.path}`).join(", ")}`
    );
  }
  return manifest;
}

/** A project stores only this small reference, never inline alignment/tracks. */
export function createSemanticAnalysisReference({
  artifactId,
  manifestContentHash,
  sourceContentHash,
  cacheKey,
} = {}) {
  const keyParts = typeof cacheKey === "string" ? cacheKey.split(":") : [];
  if (
    !isText(artifactId) ||
    !hasHash(manifestContentHash) ||
    !hasHash(sourceContentHash) ||
    keyParts.length !== 7 ||
    keyParts[0] !== "semantic" ||
    keyParts[1] !== String(SEMANTIC_TIMELINE_VERSION) ||
    keyParts[2] !== sourceContentHash.toLowerCase() ||
    !isToken(keyParts[3]) ||
    !isToken(keyParts[4]) ||
    !isToken(keyParts[5]) ||
    !hasHash(keyParts[6])
  ) {
    throw new Error("Invalid immutable semantic analysis reference");
  }
  return {
    kind: "semantic_timeline",
    schemaVersion: SEMANTIC_TIMELINE_VERSION,
    artifactId,
    manifestContentHash: manifestContentHash.toLowerCase(),
    sourceContentHash: sourceContentHash.toLowerCase(),
    cacheKey,
  };
}

/** Preserve every prior artifact when a model is rerun. This never touches edits. */
export function appendSemanticAnalysisReference(existingRefs, incomingRef) {
  if (!Array.isArray(existingRefs)) throw new Error("existingRefs must be an array");
  const ref = createSemanticAnalysisReference(incomingRef);
  if (
    existingRefs.some(
      existing =>
        existing.artifactId === ref.artifactId &&
        existing.manifestContentHash !== ref.manifestContentHash
    )
  )
    throw new Error("Semantic artifact ID cannot be reused for different content");
  if (
    existingRefs.some(
      existing =>
        existing.artifactId === ref.artifactId &&
        existing.manifestContentHash === ref.manifestContentHash
    )
  )
    return [...existingRefs];
  return [...existingRefs, ref];
}
