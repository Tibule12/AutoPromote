import {
  adaptStudioSnapshotToDocument,
  projectDocumentToLegacyTimeline,
  rebaseStudioHistoryRestore,
  reconcileStudioDocument,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { secondsToTicks } from "../studioTime";

const snapshot = () => ({
  orderedClips: [{ id: "source-a", start: 2, end: 12 }],
  selectedClipId: "source-a",
  timeline: [
    {
      id: "first",
      sourceClipId: "source-a",
      sourceStoragePath: "owned/a.mp4",
      startRequest: 2,
      endRequest: 5,
      url: "https://signed/old",
    },
    {
      id: "second",
      sourceClipId: "source-a",
      sourceStoragePath: "owned/a.mp4",
      startRequest: 7,
      endRequest: 12,
      url: "https://signed/new",
    },
  ],
  overlays: [{ id: "title-1", type: "text", startTime: 1, duration: 2, text: "Hello" }],
  motionScenes: [{ id: "motion-1", startTime: 0, duration: 2 }],
  threeDScenes: [{ id: "3d-1", startTime: 2, duration: 2 }],
  speedKeyframes: [
    { time: 0, value: 1 },
    { time: 4, value: 2 },
  ],
  captionSegments: [{ id: "caption-1", text: "Large transcript", words: Array(500).fill("word") }],
  analysisRefs: [
    {
      artifactId: "words-sha256",
      manifestContentHash: "a".repeat(64),
      sourceContentHash: "b".repeat(64),
      cacheKey: `semantic:1:${"b".repeat(64)}:words:model-1:config-1:${"c".repeat(64)}`,
    },
  ],
});

test("adapts duplicate source occurrences with separate IDs and half-open programme ranges", () => {
  const document = adaptStudioSnapshotToDocument({ snapshot: snapshot(), projectId: "project-1" });
  expect(document.assets).toHaveLength(1);
  expect(document.clipOccurrences.map(item => item.occurrenceId)).toEqual(["first", "second"]);
  expect(document.clipOccurrences[0].sourceRange).toEqual({
    space: "source",
    startTick: secondsToTicks(2),
    endTick: secondsToTicks(5),
  });
  expect(document.clipOccurrences[1].programmeRange).toEqual({
    space: "programme",
    startTick: secondsToTicks(3),
    endTick: secondsToTicks(8),
  });
  expect(document.assets[0].assetId).toBe("source:source-a");
  expect(document.layers.map(item => item.compositionStage)).toEqual([
    "worker_overlay",
    "worker_motion",
    "final_alpha",
    "worker_caption",
  ]);
  expect(document.layers.at(-1).parameters.text).toBe("Large transcript");
  expect(JSON.stringify(document)).not.toContain('"words"');
  expect(JSON.stringify(document)).not.toContain("https://signed/");
  expect(document.analysisRefs[0]).toMatchObject({
    artifactId: "words-sha256",
    kind: "semantic_timeline",
  });
});

test("Project Intelligence reference survives serialization without dense evidence", () => {
  const ref = { revisionId: "a".repeat(64), manifestHash: "b".repeat(64),
    dependencyDigest: "c".repeat(64) };
  const first = adaptStudioSnapshotToDocument({
    snapshot: { ...snapshot(), projectIntelligenceRefs: [ref],
      denseAnalysis: { wordArray: Array(1000).fill("private") } },
    projectId: "project-1",
  });
  const roundTrip = JSON.parse(JSON.stringify(first));
  expect(roundTrip.projectIntelligenceRefs).toEqual([ref]);
  expect(JSON.stringify(roundTrip)).not.toContain("private");
  expect(adaptStudioSnapshotToDocument({ snapshot: snapshot(), projectId: "project-1",
    previousDocument: roundTrip }).projectIntelligenceRefs).toEqual([ref]);
  expect(() => validateStudioProjectDocument({ ...first,
    projectIntelligenceRefs: [{ ...ref, denseAnalysis: { words: ["oops"] } }] })).toThrow();
  expect(() => validateStudioProjectDocument({ ...first,
    projectIntelligenceRefs: [ref, { ...ref, revisionId: "d".repeat(64) }] })).toThrow();
  const restored = rebaseStudioHistoryRestore({ currentDocument: first,
    restoredSnapshot: snapshot(), projectId: "project-1" });
  expect(restored.projectIntelligenceRefs).toEqual([ref]);
  expect(() => validateStudioProjectDocument({ ...first,
    projectIntelligenceRefs: [] })).not.toThrow();
});

test("legacy projection retains source media metadata while using canonical source ranges", () => {
  const legacy = snapshot();
  const document = adaptStudioSnapshotToDocument({ snapshot: legacy, projectId: "project-1" });
  expect(projectDocumentToLegacyTimeline(document, legacy.timeline)).toEqual(legacy.timeline);
});

test("document validation rejects duplicate occurrences and discontinuous programme ranges", () => {
  const document = adaptStudioSnapshotToDocument({ snapshot: snapshot(), projectId: "project-1" });
  expect(() =>
    validateStudioProjectDocument({
      ...document,
      clipOccurrences: [document.clipOccurrences[0], document.clipOccurrences[0]],
    })
  ).toThrow(/unique ID/);
  expect(() =>
    validateStudioProjectDocument({
      ...document,
      clipOccurrences: [
        document.clipOccurrences[0],
        {
          ...document.clipOccurrences[1],
          programmeRange: {
            space: "programme",
            startTick: secondsToTicks(4),
            endTick: secondsToTicks(9),
          },
        },
      ],
    })
  ).toThrow(/discontinuous/);
});

test("adapting an unchanged snapshot retains revision and locks", () => {
  const legacy = snapshot();
  const first = adaptStudioSnapshotToDocument({ snapshot: legacy, projectId: "project-1" });
  const previous = {
    ...first,
    revision: 5,
    constraints: {
      locks: [
        {
          lockId: "keep",
          occurrenceId: "first",
          mode: "preserve",
          sourceRange: {
            space: "source",
            startTick: secondsToTicks(3),
            endTick: secondsToTicks(4),
          },
        },
      ],
    },
  };
  const next = adaptStudioSnapshotToDocument({
    snapshot: legacy,
    projectId: "project-1",
    previousDocument: previous,
  });
  expect(next.revision).toBe(5);
  expect(next.constraints.locks).toEqual(previous.constraints.locks);
  expect(next.journal).toEqual(previous.journal);
});

test("source replacement and title edits advance the project revision", () => {
  const legacy = snapshot();
  const first = adaptStudioSnapshotToDocument({ snapshot: legacy, projectId: "project-1" });
  const changedAsset = {
    ...legacy,
    timeline: legacy.timeline.map(item => ({ ...item, contentHash: "a".repeat(64) })),
  };
  const second = adaptStudioSnapshotToDocument({
    snapshot: changedAsset,
    projectId: "project-1",
    previousDocument: first,
  });
  expect(second.revision).toBe(first.revision + 1);
  expect(second.assets[0].assetId).toBe(`source:source-a:sha256:${"a".repeat(64)}`);
  expect(first.assets[0].assetId).toBe("source:source-a");
  const changedTitle = {
    ...changedAsset,
    overlays: [{ ...changedAsset.overlays[0], text: "New title" }],
  };
  const third = adaptStudioSnapshotToDocument({
    snapshot: changedTitle,
    projectId: "project-1",
    previousDocument: second,
  });
  expect(third.revision).toBe(second.revision + 1);
  const changedCaption = {
    ...changedTitle,
    captionSegments: [{ ...changedTitle.captionSegments[0], text: "Edited caption" }],
  };
  const fourth = adaptStudioSnapshotToDocument({
    snapshot: changedCaption,
    projectId: "project-1",
    previousDocument: third,
  });
  expect(fourth.revision).toBe(third.revision + 1);
});

test("output configuration tracks requested frame rate without inventing a fixed audio sample rate", () => {
  const legacy = { ...snapshot(), exportSettings: { fps: "source", resolution: "source", codec: "h265" } };
  const document = adaptStudioSnapshotToDocument({ snapshot: legacy, projectId: "project-1" });
  expect(document.output).toMatchObject({
    frameRate: { mode: "source" },
    requestedResolution: "source",
    codec: "h265",
    audioSampleRate: null,
    audioSampleRatePolicy: "worker_selected",
  });
});

test("long alternating ramps produce a complete piecewise post-speed output map", () => {
  const legacy = snapshot();
  legacy.timeline = [
    {
      id: "long",
      sourceClipId: "source-a",
      startRequest: 0,
      endRequest: 76,
    },
  ];
  legacy.speedKeyframes = Array.from({ length: 20 }, (_, index) => ({
    property: "speed",
    time: index * 4,
    value: index % 2 ? 2 : 1,
    easing: "linear",
  }));
  const document = adaptStudioSnapshotToDocument({ snapshot: legacy, projectId: "project-1" });
  expect(document.outputTimeMap.length).toBeLessThanOrEqual(240);
  expect(document.outputTimeMap[0].programmeRange.startTick).toBe(0);
  expect(document.outputTimeMap.at(-1).programmeRange.endTick).toBe(secondsToTicks(76));
  expect(document.outputTimeMap.at(-1).outputRange.endTick).toBeLessThan(secondsToTicks(76));
  expect(validateStudioProjectDocument(document)).toBe(document);
});

test("validation rejects missing maps and malformed preserve locks", () => {
  const document = adaptStudioSnapshotToDocument({ snapshot: snapshot(), projectId: "project-1" });
  expect(() => validateStudioProjectDocument({ ...document, timeMaps: [] })).toThrow(/time map/);
  expect(() =>
    validateStudioProjectDocument({
      ...document,
      outputTimeMap: [
        {
          ...document.outputTimeMap[0],
          rateNumerator: 2,
        },
      ],
    })
  ).toThrow(/Output map/);
  expect(() =>
    validateStudioProjectDocument({
      ...document,
      constraints: {
        locks: [
          {
            lockId: "bad",
            mode: "preserve",
            occurrenceId: "first",
            sourceRange: { space: "source", startTick: 0, endTick: secondsToTicks(3) },
          },
        ],
      },
    })
  ).toThrow(/Lock/);
});

test("a saved legacy snapshot and versioned document reopen without duplicating analysis", () => {
  const legacy = snapshot();
  const document = adaptStudioSnapshotToDocument({ snapshot: legacy, projectId: "project-1" });
  const storedSnapshot = JSON.parse(JSON.stringify({ ...legacy, studioDocument: document }));
  const reopened = reconcileStudioDocument({
    snapshot: storedSnapshot,
    projectId: "project-1",
    storedDocument: storedSnapshot.studioDocument,
  });
  expect(reopened.revision).toBe(document.revision);
  expect(reopened.analysisRefs).toEqual(document.analysisRefs);
  expect(reopened.clipOccurrences).toEqual(document.clipOccurrences);
});

test("document rejects embedded analysis payloads", () => {
  const document = adaptStudioSnapshotToDocument({ snapshot: snapshot(), projectId: "project-1" });
  expect(() =>
    validateStudioProjectDocument({
      ...document,
      analysisRefs: [{ ...document.analysisRefs[0], words: ["should stay in an artifact"] }],
    })
  ).toThrow(/immutable artifact identity/);
});
