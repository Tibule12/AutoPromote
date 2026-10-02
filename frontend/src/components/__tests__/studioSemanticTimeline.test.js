import {
  SEMANTIC_RECORD_TYPES,
  SEMANTIC_TICKS_PER_SECOND,
  appendSemanticAnalysisReference,
  buildSemanticAnalysisCacheKey,
  createSemanticAnalysisReference,
  createSemanticTimelineManifest,
  validateSemanticTimeline,
} from "../studioSemanticTimeline";

const SOURCE_HASH = "a".repeat(64);
const CONFIG_HASH = "b".repeat(64);
const ARTIFACT_HASH = "c".repeat(64);
const MANIFEST_HASH = "d".repeat(64);

const analysis = (overrides = {}) => {
  const descriptor = {
    sourceContentHash: SOURCE_HASH,
    analysisType: "speech_visual_v1",
    modelRevision: "model.1",
    configRevision: "settings.1",
    configHash: CONFIG_HASH,
    ...overrides,
  };
  return { ...descriptor, cacheKey: buildSemanticAnalysisCacheKey(descriptor) };
};

const record = (id, type, fields = {}) => ({
  schemaVersion: 1,
  id,
  type,
  sourceRange: {
    space: "source",
    startTick: 0,
    endTick: type.endsWith("_boundary") ? 0 : SEMANTIC_TICKS_PER_SECOND,
  },
  provenance: {
    provider: "fixture-analyzer",
    model: "fixture-model",
    modelRevision: "model.1",
    configHash: CONFIG_HASH,
    runId: "run-1",
  },
  verification: { state: "unverified" },
  uncertainty: { level: "unknown", basis: "Awaiting creator review" },
  artifactRefs: [],
  ...fields,
});

const fixture = () => {
  const descriptor = analysis();
  return {
    schemaVersion: 1,
    artifactId: "semantic-manifest-1",
    source: {
      assetId: "asset-1",
      contentHash: SOURCE_HASH,
      durationTicks: 2 * SEMANTIC_TICKS_PER_SECOND,
      ticksPerSecond: SEMANTIC_TICKS_PER_SECOND,
    },
    analysis: {
      analysisType: descriptor.analysisType,
      modelRevision: descriptor.modelRevision,
      configRevision: descriptor.configRevision,
      configHash: descriptor.configHash,
      cacheKey: descriptor.cacheKey,
    },
    artifacts: [
      {
        artifactId: "words-1",
        contentHash: ARTIFACT_HASH,
        storageKey: "analysis/asset-1/words-1.json",
        mediaType: "application/json",
      },
      {
        artifactId: "track-1",
        contentHash: "e".repeat(64),
        storageKey: "analysis/asset-1/track-1.json",
        mediaType: "application/json",
      },
    ],
    records: [
      record("signal-1", "observation", { observationKind: "visible_motion" }),
      record("voice-1", "voice_cluster", { clusterLabel: "voice_1" }),
      record("person-track-1", "visual_track", {
        trackLabel: "visible_person_1",
        artifactRefs: ["track-1"],
      }),
      record("words-ref-1", "word_alignment_ref", {
        utteranceId: "utterance-1",
        alignmentFormat: "word_ticks_v1",
        artifactRefs: ["words-1"],
      }),
      record("utterance-1", "utterance", {
        text: "A short statement",
        voiceClusterId: "voice-1",
        wordAlignmentId: "words-ref-1",
      }),
      record("association-1", "speaker_visible_person_association", {
        voiceClusterId: "voice-1",
        visualTrackId: "person-track-1",
        association: "speaking_likely",
        evidenceIds: ["signal-1"],
      }),
      record("shot-1", "shot_boundary", { boundaryKind: "cut" }),
      record("scene-1", "scene_boundary", { boundaryKind: "start" }),
      record("audio-1", "audio_event", { eventKind: "applause" }),
      record("activity-1", "music_speech_activity", { activity: "both" }),
      record("prosody-1", "prosody_emphasis", { cue: "emphasis" }),
      record("ocr-1", "ocr_entity", { evidenceKind: "ocr", text: "EXIT" }),
      record("hypothesis-1", "editorial_hypothesis", {
        hypothesisKind: "hook",
        rationale: "A question opens the source",
        evidenceIds: ["utterance-1"],
      }),
      record("chapter-1", "chapter", { title: "Opening", evidenceIds: ["shot-1", "utterance-1"] }),
      record("coverage-1", "coverage", { analysisType: "speech", coverageState: "complete" }),
    ],
  };
};

const errorCodes = manifest => validateSemanticTimeline(manifest).errors.map(error => error.code);

describe("semantic analysis cache identity", () => {
  it("uses source bytes, analysis type, model revision and exact config digest", () => {
    const key = analysis().cacheKey;
    expect(key).toContain(SOURCE_HASH);
    expect(analysis({ sourceContentHash: "f".repeat(64) }).cacheKey).not.toBe(key);
    expect(analysis({ analysisType: "visual_tracks" }).cacheKey).not.toBe(key);
    expect(analysis({ modelRevision: "model.2" }).cacheKey).not.toBe(key);
    expect(analysis({ configRevision: "settings.2" }).cacheKey).not.toBe(key);
    expect(analysis({ configHash: "f".repeat(64) }).cacheKey).not.toBe(key);
    expect(() => analysis({ sourceContentHash: "video.mp4" })).toThrow("SHA-256");
    expect(() => analysis({ modelRevision: "model:1" })).toThrow("stable token");
  });

  it("keeps reruns as separate references without changing accepted edit state", () => {
    const first = createSemanticAnalysisReference({
      artifactId: "manifest-1",
      manifestContentHash: MANIFEST_HASH,
      sourceContentHash: SOURCE_HASH,
      cacheKey: analysis().cacheKey,
    });
    const second = createSemanticAnalysisReference({
      artifactId: "manifest-2",
      manifestContentHash: "e".repeat(64),
      sourceContentHash: SOURCE_HASH,
      cacheKey: analysis().cacheKey,
    });
    const project = { revision: 4, acceptedHumanEdits: [{ id: "trim-1" }], analysisRefs: [first] };
    const nextRefs = appendSemanticAnalysisReference(project.analysisRefs, second);
    expect(nextRefs).toEqual([first, second]);
    expect(project).toEqual({
      revision: 4,
      acceptedHumanEdits: [{ id: "trim-1" }],
      analysisRefs: [first],
    });
    expect(appendSemanticAnalysisReference(nextRefs, second)).toEqual(nextRefs);
    expect(() =>
      appendSemanticAnalysisReference(nextRefs, {
        ...second,
        manifestContentHash: "f".repeat(64),
      })
    ).toThrow("cannot be reused");
    expect(() =>
      createSemanticAnalysisReference({
        artifactId: "bad",
        manifestContentHash: MANIFEST_HASH,
        sourceContentHash: "f".repeat(64),
        cacheKey: analysis().cacheKey,
      })
    ).toThrow("Invalid immutable");
  });
});

describe("semantic timeline evidence contract", () => {
  it("validates all versioned record categories with provenance and typed links", () => {
    const manifest = createSemanticTimelineManifest(fixture());
    expect(validateSemanticTimeline(manifest)).toEqual({ valid: true, errors: [] });
    expect(new Set(manifest.records.map(item => item.type))).toEqual(
      new Set(SEMANTIC_RECORD_TYPES)
    );
  });

  it("rejects foreign time space, out-of-source ranges and duplicate record IDs", () => {
    const manifest = fixture();
    manifest.records[0].sourceRange.space = "programme";
    manifest.records[1].sourceRange.endTick = manifest.source.durationTicks + 1;
    manifest.records[2].id = "voice-1";
    expect(errorCodes(manifest)).toEqual(
      expect.arrayContaining(["INVALID_SOURCE_RANGE", "DUPLICATE_RECORD_ID"])
    );
  });

  it("does not equate a voice with a visible track or a person identity", () => {
    const manifest = fixture();
    const association = manifest.records.find(
      item => item.type === "speaker_visible_person_association"
    );
    association.voiceClusterId = "person-track-1";
    association.visualTrackId = "voice-1";
    association.actualIdentity = "Alice";
    expect(errorCodes(manifest)).toEqual(
      expect.arrayContaining(["INVALID_TYPED_REFERENCE", "UNSUPPORTED_RECORD_FIELD"])
    );
  });

  it("requires evidence for editorial hypotheses and review for confirmed associations", () => {
    const manifest = fixture();
    const hypothesis = manifest.records.find(item => item.type === "editorial_hypothesis");
    hypothesis.evidenceIds = ["coverage-1"];
    const association = manifest.records.find(
      item => item.type === "speaker_visible_person_association"
    );
    association.association = "human_confirmed";
    expect(errorCodes(manifest)).toEqual(
      expect.arrayContaining(["INVALID_EVIDENCE_REF", "ASSOCIATION_REQUIRES_REVIEW"])
    );
  });

  it("rejects confidence masquerading as calibrated probability and unverifiable artifacts", () => {
    const manifest = fixture();
    manifest.records[0].confidence = 0.99;
    manifest.records[0].uncertainty.probability = 0.99;
    manifest.records[0].artifactRefs = ["missing-blob"];
    manifest.artifacts[0].storageKey = "https://signed.example/expiring-url";
    manifest.artifacts[1].storageKey = "analysis/../other-owner/track.json";
    expect(errorCodes(manifest)).toEqual(
      expect.arrayContaining([
        "UNSUPPORTED_RECORD_FIELD",
        "INVALID_UNCERTAINTY",
        "UNKNOWN_ARTIFACT_REF",
        "INVALID_ARTIFACT_STORAGE_KEY",
      ])
    );
  });

  it("rejects a stale cache key and unreviewed human verification", () => {
    const manifest = fixture();
    manifest.analysis.modelRevision = "model.2";
    manifest.records[0].verification = { state: "human_verified" };
    expect(errorCodes(manifest)).toEqual(
      expect.arrayContaining(["CACHE_KEY_MISMATCH", "INVALID_VERIFICATION"])
    );
  });

  it("requires an explicit schema upgrade for new fields or record versions", () => {
    const manifest = fixture();
    manifest.records[0].schemaVersion = 2;
    manifest.source.filename = "clip.mp4";
    expect(errorCodes(manifest)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_RECORD_VERSION", "UNSUPPORTED_FIELD"])
    );
    expect(() => createSemanticTimelineManifest({ ...fixture(), schemaVersion: 2 })).toThrow(
      "UNSUPPORTED_SEMANTIC_VERSION"
    );
  });
});
