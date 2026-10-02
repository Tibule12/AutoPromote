const {
  createProjectIntelligenceRevision, validateAssetManifest,
  validateProjectIntelligenceRevision, assertRevisionTransition,
  mapCaptureClockTick, summarizeProjectIntelligence, stableStringify,
  findProjectIntelligenceFindings,
} = require("../src/services/studioProjectIntelligenceContract");
const { miniFilmFixture, promoFixture } =
  require("./fixtures/studioProjectIntelligenceFixtures");

const clone = value => structuredClone(value);
const next = (previous, transform) => {
  const core = clone(previous);
  delete core.revisionId;
  core.baseRevisionId = previous.revisionId;
  transform(core);
  return createProjectIntelligenceRevision(core);
};

describe("Project Intelligence V1 contracts", () => {
  test("asset manifest serializes scoped content identities and streams", () => {
    const film = miniFilmFixture();
    const manifest = { schemaVersion: 1, projectId: film.projectId,
      ownerUid: film.ownerUid, assets: film.assets };
    expect(validateAssetManifest(JSON.parse(stableStringify(manifest))).assetIds.size).toBe(9);
    expect(film.assets[2].streams[0]).toMatchObject({ kind: "audio",
      timebase: { numerator: 1, denominator: 48_000 }, sampleRateHz: 48_000 });
    const invalid = clone(manifest);
    invalid.assets[0].streams[0].streamId = invalid.assets[1].streams[0].streamId;
    expect(() => validateAssetManifest(invalid)).toThrow();
    invalid.assets[0].streams[0].streamId = manifest.assets[0].streams[0].streamId;
    invalid.assets[0].ownerUid = "foreign-owner";
    expect(() => validateAssetManifest(invalid)).toThrow();
  });

  test("film captures are explicit while unknown relationship stays unknown", () => {
    const film = miniFilmFixture();
    const summary = summarizeProjectIntelligence(film);
    expect(summary.captureGroups).toHaveLength(2);
    expect(summary.captureGroups[0]).toMatchObject({
      captureEventId: "scene1:take1", anchorAssetId: "scene1_take1_camA",
    });
    expect(summary.captureGroups[0].members.map(member => member.role))
      .toEqual(["camera", "camera", "external_audio"]);
    expect(summary.assertions.find(item => item.assertionId === "unknown:reaction").state)
      .toBe("unknown");
    expect(summary.assertions.filter(item => item.relation === "external_audio_for"))
      .toHaveLength(2);
    expect(summary.assertions.find(item => item.assertionId === "take:t1a").state)
      .toBe("human_verified");
    expect(summary.assets.find(item => item.assetId === "roomtone").streams[0].kind)
      .toBe("audio");
  });

  test("proposed claims can be human verified or rejected by new immutable assertions", () => {
    const film = miniFilmFixture();
    const verified = next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t1")),
      assertionId: "external:t1:verified", state: "human_verified",
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T01:00:00Z" },
      supersedes: "external:t1",
    }));
    expect(() => assertRevisionTransition(film, verified)).not.toThrow();
    expect(verified.assertions.find(item => item.assertionId === "external:t1").state)
      .toBe("proposed");
    expect(summarizeProjectIntelligence(verified).assertions.find(
      item => item.assertionId === "external:t1")).toBeUndefined();
    const rejected = next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t2")),
      assertionId: "external:t2:rejected", state: "rejected",
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T01:00:00Z" },
      supersedes: "external:t2",
    }));
    expect(() => assertRevisionTransition(film, rejected)).not.toThrow();
    const changed = next(film, core => {
      core.assertions.find(item => item.assertionId === "external:t1").to.id = "reaction";
    });
    expect(() => assertRevisionTransition(film, changed)).toThrow();
    const sameRevisionSupersession = next(film, core => {
      const first = { ...clone(core.assertions[0]), assertionId: "new:first" };
      const second = { ...clone(core.assertions[0]), assertionId: "new:second",
        supersedes: "new:first" };
      core.assertions.push(first, second);
    });
    expect(() => assertRevisionTransition(film, sameRevisionSupersession)).toThrow();
    expect(verified.revisionId).toBe(next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t1")),
      assertionId: "external:t1:verified", state: "human_verified",
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T01:00:00Z" },
      supersedes: "external:t1",
    })).revisionId);
  });

  test("human supersession retains a prior model claim and its artifact reference", () => {
    const film = miniFilmFixture();
    const core = clone(film);
    delete core.revisionId;
    delete core.sourceAssetSetDigest;
    delete core.analysisDependencyDigests;
    core.evidenceRefs.push({ evidenceId: "evidence:model:t1", kind: "source_shot_artifact",
      sourceAssetId: film.assets[0].assetId, sourceContentHash: film.assets[0].contentHash,
      artifactHash: "a".repeat(64), analysisType: "source_shots",
      modelRevision: "shot-engine-v1", configHash: null,
      dependencyHashes: ["b".repeat(64)], statement: null });
    const claim = core.assertions.find(item => item.assertionId === "external:t1");
    claim.provenance = { origin: "model_inferred", producerId: "shot-engine-v1",
      method: "source shot artifact" };
    claim.evidenceRefs = ["evidence:model:t1"];
    const machine = createProjectIntelligenceRevision(core);
    expect(() => validateProjectIntelligenceRevision(machine)).not.toThrow();
    const corrected = next(machine, value => value.assertions.push({
      ...clone(claim), assertionId: "external:t1:human", state: "human_verified",
      provenance: { origin: "human_declared", producerId: film.ownerUid,
        method: "reviewed source footage" },
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T01:00:00Z" },
      evidenceRefs: ["evidence:scene1_take1_external"], supersedes: "external:t1",
    }));
    expect(() => assertRevisionTransition(machine, corrected)).not.toThrow();
    expect(corrected.assertions.find(item => item.assertionId === "external:t1"))
      .toEqual(claim);
    expect(corrected.evidenceRefs).toContainEqual(core.evidenceRefs.at(-1));
  });

  test.each([
    ["captureGroups", "groupId", "capture:t2", "captureEventId", "unrelated:event"],
    ["captureGroups", "groupId", "capture:t2", "anchorAssetId", "scene1_take2_camB"],
    ["assertions", "assertionId", "external:t1", "relation", "simultaneous_with"],
    ["assertions", "assertionId", "external:t1", "from.id", "scene1_take2_external"],
    ["assertions", "assertionId", "external:t1", "to.id", "scene1_take2_camA"],
    ["syncMappings", "mappingId", "sync:t1external", "sourceStreamId",
      "scene1_take2_external:audio:0"],
    ["syncMappings", "mappingId", "sync:t1external", "referenceStreamId",
      "scene1_take1_camB:video:0"],
    ["dialogueUnits", "dialogueUnitId", "dialogue:leaving", "dialogueKey",
      "unrelated:dialogue"],
    ["dialogueUnits", "dialogueUnitId", "dialogue:leaving", "scriptUnitId",
      "script:unrelated"],
    ["coverage", "coverageId", "coverage:wide", "beatId", "exit"],
    ["coverage", "coverageId", "coverage:wide", "sourceRange.endTick", 360_000],
    ["coverage", "coverageId", "coverage:reaction", "assetId", "insert"],
    ["continuityObservations", "observationId", "continuity:red", "beatId", "exit"],
    ["continuityObservations", "observationId", "continuity:red", "continuityKey",
      "wardrobe"],
    ["continuityObservations", "observationId", "continuity:red", "subjectId",
      "actor:two"],
    ["continuityObservations", "observationId", "continuity:red", "type",
      "wardrobe_state"],
  ])("%s cannot supersede an unrelated %s through %s", (field, key, priorId,
    changedField, newValue) => {
    const film = miniFilmFixture();
    const altered = next(film, core => {
      const prior = core[field].find(item => item[key] === priorId);
      const successor = clone(prior);
      successor[key] = `${priorId}:unrelated`;
      successor.supersedes = priorId;
      const parts = changedField.split(".");
      if (parts.length === 1) successor[parts[0]] = newValue;
      else successor[parts[0]][parts[1]] = newValue;
      core[field].push(successor);
    });
    expect(() => validateProjectIntelligenceRevision(altered))
      .toThrow(expect.objectContaining({ code: "PROJECT_INTELLIGENCE_SUPERSESSION" }));
  });

  test("camera role cannot supersede take membership for the same asset", () => {
    const film = miniFilmFixture();
    const altered = next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "camera:t1a")),
      assertionId: "take:cam-disguised", relation: "take_membership",
      to: { kind: "take", id: "take2" }, supersedes: "camera:t1a",
    }));
    expect(() => validateProjectIntelligenceRevision(altered))
      .toThrow(expect.objectContaining({ code: "PROJECT_INTELLIGENCE_SUPERSESSION" }));
  });

  test("value correction and same capture event membership correction retain identity", () => {
    const film = miniFilmFixture();
    const corrected = next(film, core => {
      core.assertions.push({ ...clone(core.assertions.find(item =>
        item.assertionId === "camera:t1a")), assertionId: "camera:t1a:corrected",
      to: { kind: "camera", id: "cameraC" }, supersedes: "camera:t1a" });
      core.captureGroups.push({ ...clone(core.captureGroups[1]),
        groupId: "capture:t2:corrected", supersedes: "capture:t2",
        members: core.captureGroups[1].members.slice(0, 2) });
    });
    expect(() => assertRevisionTransition(film, corrected)).not.toThrow();
    const summary = summarizeProjectIntelligence(corrected);
    expect(summary.assertions.find(item => item.assertionId === "camera:t1a"))
      .toBeUndefined();
    expect(summary.captureGroups.find(item => item.groupId === "capture:t2"))
      .toBeUndefined();
  });

  test.each([
    ["captureGroups", "groupId", "capture:t1"],
    ["assertions", "assertionId", "conflict:alternate"],
    ["dialogueUnits", "dialogueUnitId", "dialogue:leaving"],
    ["continuityObservations", "observationId", "continuity:red"],
  ])("proposed %s cannot deactivate a verified human decision", (field, key, priorId) => {
    const film = miniFilmFixture();
    const attacked = next(film, core => {
      const successor = clone(core[field].find(item => item[key] === priorId));
      successor[key] = `${priorId}:proposed_attack`;
      successor.state = "proposed";
      successor.review = null;
      successor.supersedes = priorId;
      core[field].push(successor);
    });
    expect(() => validateProjectIntelligenceRevision(attacked))
      .toThrow(expect.objectContaining({ code: "PROJECT_INTELLIGENCE_SUPERSESSION" }));
    if (field === "assertions") {
      const findings = findProjectIntelligenceFindings(attacked);
      expect(findings.some(item => item.code === "PROJECT_INTELLIGENCE_CONFLICT"))
        .toBe(true);
    }
  });

  test("a rejected human decision requires a new human review to reopen", () => {
    const film = miniFilmFixture();
    const rejected = next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t1")),
      assertionId: "external:t1:rejected", state: "rejected",
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T01:00:00Z" },
      supersedes: "external:t1",
    }));
    expect(() => assertRevisionTransition(film, rejected)).not.toThrow();
    const proposed = next(rejected, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t1:rejected")),
      assertionId: "external:t1:unreviewed", state: "proposed", review: null,
      supersedes: "external:t1:rejected",
    }));
    expect(() => validateProjectIntelligenceRevision(proposed))
      .toThrow(expect.objectContaining({ code: "PROJECT_INTELLIGENCE_SUPERSESSION" }));
    const reopened = next(rejected, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t1:rejected")),
      assertionId: "external:t1:reopened", state: "human_verified",
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T02:00:00Z" },
      supersedes: "external:t1:rejected",
    }));
    expect(() => assertRevisionTransition(rejected, reopened)).not.toThrow();
  });

  test("unknown cannot supersede a claim and a reviewed rejection may replace verification", () => {
    const film = miniFilmFixture();
    const unknown = next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "external:t1")),
      assertionId: "external:t1:unknown", state: "unknown", review: null,
      supersedes: "external:t1",
    }));
    expect(() => validateProjectIntelligenceRevision(unknown))
      .toThrow(expect.objectContaining({ code: "PROJECT_INTELLIGENCE_SUPERSESSION" }));
    const rejected = next(film, core => core.assertions.push({
      ...clone(core.assertions.find(item => item.assertionId === "camera:t1a")),
      assertionId: "camera:t1a:rejected", state: "rejected",
      review: { reviewerUid: film.ownerUid, reviewedAt: "2026-10-02T01:00:00Z" },
      supersedes: "camera:t1a",
    }));
    expect(() => assertRevisionTransition(film, rejected)).not.toThrow();
    expect(summarizeProjectIntelligence(rejected).assertions.find(item =>
      item.assertionId === "camera:t1a")).toBeUndefined();
  });

  test("verified contradictions block dependent planning", () => {
    const { findings, planningBlocked } = validateProjectIntelligenceRevision(miniFilmFixture());
    expect(planningBlocked).toBe(true);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PROJECT_INTELLIGENCE_CONFLICT" }),
      expect.objectContaining({ code: "CONTINUITY_MISMATCH", beatId: "leaving" }),
      expect.objectContaining({ code: "MISSING_BEAT_COVERAGE", beatId: "exit" }),
    ]));
  });

  test("sync mapping preserves exact offset, drift, fit error and coverage", () => {
    const mapping = miniFilmFixture().syncMappings[0];
    expect(mapCaptureClockTick(mapping, 0).floorTick).toBe(9_000);
    expect(mapCaptureClockTick(mapping, 900_000).floorTick).toBe(909_090);
    expect(mapping.residualMaxTicks).toBe(90);
    expect(mapping.uncertainty.level).toBe("low");
    expect(() => mapCaptureClockTick(mapping, 900_001)).toThrow();
    const invalid = next(miniFilmFixture(), core => {
      core.syncMappings[0].coveredSourceRange.endTick = 1_800_000;
    });
    expect(() => validateProjectIntelligenceRevision(invalid)).toThrow();
  });

  test("reviewed wording and cross-take unit do not rewrite raw transcription", () => {
    const film = miniFilmFixture();
    const dialogue = film.dialogueUnits[0];
    expect(dialogue.origin).toBe("scripted");
    expect(dialogue.candidates).toHaveLength(2);
    const raw = film.evidenceRefs.find(item =>
      item.evidenceId === dialogue.candidates[0].utteranceEvidenceId);
    expect(raw.kind).toBe("human_transcription");
    expect(raw.statement).not.toBe(dialogue.reviewedWording);
    const revised = next(film, core => core.dialogueUnits.push({
      ...clone(core.dialogueUnits[0]), dialogueUnitId: "dialogue:leaving:revision",
      reviewedWording: "I'm leaving tomorrow.", supersedes: "dialogue:leaving",
    }));
    expect(() => assertRevisionTransition(film, revised)).not.toThrow();
    expect(revised.evidenceRefs).toEqual(film.evidenceRefs);
    const unscripted = next(promoFixture(), core => core.dialogueUnits.push({
      dialogueUnitId: "dialogue:promo", dialogueKey: "promo:dialogue:fix",
      origin: "unscripted", scriptUnitId: null,
      reviewedWording: "We fixed the upload issue.", candidates: [{
        assetId: "talking_head", sourceRange: { space: "source", startTick: 0,
          endTick: 90_000 }, utteranceEvidenceId: "evidence:talking_head",
        takeAssertionId: null,
      }], state: "proposed", provenance: { origin: "human_declared",
        producerId: film.ownerUid, method: "fixture declaration" },
      uncertainty: { level: "low", basis: "Fixture supplied claim; no automatic detection" },
      review: null, evidenceRefs: ["evidence:talking_head"], supersedes: null,
    }));
    expect(validateProjectIntelligenceRevision(unscripted).findings).toEqual([]);
  });

  test("beat coverage retains exact ranges, evidence and warnings", () => {
    const film = summarizeProjectIntelligence(miniFilmFixture());
    const beat = film.beats.find(item => item.beatId === "leaving");
    expect(beat.candidates).toHaveLength(3);
    expect(beat.candidates[1]).toMatchObject({ assetId: "scene1_take2_camA",
      sourceRange: { space: "source", startTick: 90_000, endTick: 270_000 },
      takeAssertionId: "take:t2a", audioEvidenceRefs: ["evidence:scene1_take2_camA"] });
    expect(beat.candidates[1].warnings[0]).toMatch(/Bad camera audio/);
    expect(film.beats.find(item => item.beatId === "exit").coverageState).toBe("missing");
    expect(() => validateProjectIntelligenceRevision(next(miniFilmFixture(), core => {
      core.coverage.push({ ...clone(core.coverage[0]), coverageId: "bad:coverage",
        sourceRange: { space: "programme", startTick: 0, endTick: 90_000 } });
    }))).toThrow();
  });

  test("promo maps supplied beats to explainable media without an edit", () => {
    const promo = promoFixture();
    const summary = summarizeProjectIntelligence(promo);
    expect(summary.beats.map(beat => [beat.beatId, beat.candidates[0].assetId]))
      .toEqual([["result_tease", "result"], ["process", "screen_recording"],
        ["problem", "failure"], ["fix", "fix"], ["proof", "product_ui"],
        ["payoff", "talking_head"], ["cta", "cta"]]);
    expect(summary.beats.every(beat => beat.candidates[0].evidenceRefs.length > 0))
      .toBe(true);
    expect(summary.planningBlocked).toBe(false);
    expect(Object.keys(promo)).not.toContain("clipOccurrences");
  });
});
