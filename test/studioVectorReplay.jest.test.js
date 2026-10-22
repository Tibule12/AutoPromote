const crypto = require("node:crypto");
const {
  adaptStudioSnapshotToDocument,
} = require("../frontend/src/components/studioProjectDocument");
const { TEXT_ANIMATOR_DEFAULT } = require("../frontend/src/components/studioTextAnimator");
const { dryRunStudioCommandBatch } = require("../frontend/src/components/studioCommands");
const { createStudioVectorShape } = require("../frontend/src/components/studioVectorShape");
const {
  computeStudioDirectorPreviewFingerprint,
} = require("../src/services/studioDirectorReplayService");
const canonicalHash = value =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.keys(item)
                .sort()
                .map(k => [k, item[k]])
            )
          : item
      )
    )
    .digest("hex");

test("Director replay preserves single-copy choreography, selectors and ordinary progress keys", () => {
  const spec = { ...TEXT_ANIMATOR_DEFAULT, order: 'center_out', fromRotation: -150, rangeStart: 20, rangeEnd: 80 };
  const document = adaptStudioSnapshotToDocument({ projectId: 'text-replay', snapshot: {
    orderedClips: [{ id: 'source', start: 0, end: 10 }], selectedClipId: 'source',
    timeline: [{ id: 'main', sourceClipId: 'source', startRequest: 0, endRequest: 10 }],
    overlays: [{ id: 'type', type: 'text', text: 'MAKE IT MOVE', startTime: 2, duration: 4, textAnimator: spec, textProgress: 100 }],
    compositionOrder: ['type'], motionKeyframes: [2, 4].map((time, i) => ({ id: `text${i}`, targetId: 'type', property: 'textProgress', time, value: i*100, easing: 'linear' })),
    motionScenes: [], threeDScenes: [], speedKeyframes: [] } });
  const batch = { projectId: document.projectId, baseRevision: document.revision, idempotencyKey: 'text-source-trim', actor: { type: 'ai', id: 'director' },
    operations: [{ type: 'trim_clip', target: { occurrenceId: 'main' }, keep: { space: 'source', startTick: 90000, endTick: 8*90000 } }] };
  const preview = dryRunStudioCommandBatch(document, batch).previewDocument;
  expect(preview.layers.find(l => l.layerId === 'type').parameters.textAnimator).toEqual(spec);
  expect(preview.layers.find(l => l.layerId === 'type').parameters.text).toBe('MAKE IT MOVE');
  expect(preview.linkedTiming.keys.motionKeyframes.map(k => k.parameters.value)).toEqual([0, 100]);
  expect(computeStudioDirectorPreviewFingerprint({ document, batch })).toEqual(canonicalHash(preview));
});

test.each([1, 2])("Director replay and manual source trim preserve vector version %s", version => {
  let shape = createStudioVectorShape();
  if (version === 2) { const { closed, nodes, ...style } = shape; shape = { ...style, version: 2, contours: [{closed,nodes}, {closed,nodes:nodes.map(n=>({...n,x:40+n.x*.2,y:40+n.y*.2,in:n.in.map(v=>v*.2),out:n.out.map(v=>v*.2)}))}] }; }
  shape.stroke.width = 2;
  const document = adaptStudioSnapshotToDocument({
    projectId: "vector-replay",
    snapshot: {
      orderedClips: [{ id: "source", start: 0, end: 10 }],
      selectedClipId: "source",
      timeline: [{ id: "main", sourceClipId: "source", startRequest: 0, endRequest: 10 }],
      overlays: [
        {
          id: "art",
          type: "image",
          vectorShape: shape,
          strokeStart: 10,
          strokeOffset: -40,
          strokeEnd: 90,
          sourceStoragePath: "owned/art.png",
          startTime: 2,
          duration: 4,
        },
      ],
      compositionOrder: ["art"],
      motionKeyframes: [
        {
          id: "draw0",
          targetId: "art",
          property: "strokeEnd",
          time: 2,
          value: 0,
          easing: "linear",
        },
        {
          id: "draw1",
          targetId: "art",
          property: "strokeEnd",
          time: 4,
          value: 100,
          easing: "ease_in_out",
        },
      ],
      motionScenes: [],
      threeDScenes: [],
      speedKeyframes: [],
    },
  });
  const batch = {
    projectId: document.projectId,
    baseRevision: document.revision,
    idempotencyKey: "vector-source-trim",
    actor: { type: "ai", id: "director" },
    operations: [
      {
        type: "trim_clip",
        target: { occurrenceId: "main" },
        keep: { space: "source", startTick: 90000, endTick: 8 * 90000 },
      },
    ],
  };
  const preview = dryRunStudioCommandBatch(document, batch).previewDocument;
  expect(preview.layers.find(l => l.layerId === "art").parameters.vectorShape).toEqual(shape);
  expect(preview.layers.find(l => l.layerId === "art").parameters.strokeStart).toBe(10);
  expect(preview.layers.find(l => l.layerId === "art").parameters.strokeOffset).toBe(-40);
  expect(preview.linkedTiming.keys.motionKeyframes.map(key => key.parameters.value)).toEqual([
    0, 100,
  ]);
  expect(computeStudioDirectorPreviewFingerprint({ document, batch })).toEqual(
    canonicalHash(preview)
  );
});
