import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import {
  compileStudioCompositionForRender,
  compileStudioOverlaysForRender,
} from "../studioRenderCompiler";
import {
  bakeLayerMotionToKeyframes,
  buildTrackMatteStageSvgDataUri,
  createStudioNullRigLayer,
  defaultMotionDriverForProperty,
  evaluateMotionDriverValue,
  evaluateWorldLayerPose,
  isHiddenTrackMatteSource,
  removeStudioLayerSafely,
  reparentStudioLayerPreservingWorldPose,
  validateStudioMotionDrivers,
  validateStudioParentGraph,
  validateStudioTrackMattes,
} from "../studioCompRigging";

describe("studioCompRigging — AutoPromote Parenting, Track Mattes, Motion Drivers & Canonical Render Parity", () => {
  test("Pick-Whip reparenting and unparenting preserve exact world-space pose with zero jump", () => {
    const masterNull = {
      ...createStudioNullRigLayer({ id: "null-master", name: "Master Null", x: 35, y: 25 }),
      scale: 1.5,
      rotation: 90,
    };
    const child = {
      id: "callout-1",
      type: "text",
      text: "PRO RIG",
      x: 65,
      y: 40,
      scale: 0.9,
      rotation: -15,
      opacity: 0.8,
    };
    const overlays = [masterNull, child];

    const beforePose = evaluateWorldLayerPose(child, overlays, [], 0.5);
    const parentedChild = reparentStudioLayerPreservingWorldPose(
      child,
      "null-master",
      overlays,
      [],
      0.5
    );
    expect(parentedChild.parentId).toBe("null-master");

    const afterParentPose = evaluateWorldLayerPose(
      parentedChild,
      [masterNull, parentedChild],
      [],
      0.5
    );
    expect(afterParentPose.x).toBeCloseTo(beforePose.x, 3);
    expect(afterParentPose.y).toBeCloseTo(beforePose.y, 3);
    expect(afterParentPose.scale).toBeCloseTo(beforePose.scale, 3);
    expect(afterParentPose.rotation).toBeCloseTo(beforePose.rotation, 3);
    // Parent opacity does not multiply child opacity
    expect(afterParentPose.opacity).toBeCloseTo(0.8, 4);

    // Moving the parent Null translates/scales/rotates the child in world space
    const movedNull = { ...masterNull, x: 45, y: 35 };
    const shiftedPose = evaluateWorldLayerPose(
      parentedChild,
      [movedNull, parentedChild],
      [],
      0.5
    );
    expect(shiftedPose.x).toBeCloseTo(beforePose.x + 10, 3);
    expect(shiftedPose.y).toBeCloseTo(beforePose.y + 10, 3);

    // Unparenting bakes world pose back onto child with zero jump
    const unparented = reparentStudioLayerPreservingWorldPose(
      parentedChild,
      null,
      [movedNull, parentedChild],
      [],
      0.5
    );
    expect(unparented.parentId).toBeUndefined();
    expect(unparented.x).toBeCloseTo(shiftedPose.x, 3);
    expect(unparented.y).toBeCloseTo(shiftedPose.y, 3);
  });

  test("validateStudioParentGraph rejects self-parenting, missing targets, and cycles", () => {
    expect(() =>
      validateStudioParentGraph([{ id: "a", type: "text", parentId: "a" }])
    ).toThrow(/cannot parent to itself/);
    expect(() =>
      validateStudioParentGraph([{ id: "a", type: "text", parentId: "missing" }])
    ).toThrow(/missing parent/);
    expect(() =>
      validateStudioParentGraph([
        { id: "a", type: "text", parentId: "b" },
        { id: "b", type: "text", parentId: "a" },
      ])
    ).toThrow(/cycle/);
  });

  test("validateStudioTrackMattes enforces valid alpha/luma sources and rejects chains or Null mattes", () => {
    const valid = [
      { id: "matte-txt", type: "text", text: "MASK" },
      {
        id: "fill-img",
        type: "image",
        trackMatte: { mode: "luma_inverted", sourceLayerId: "matte-txt" },
      },
    ];
    expect(validateStudioTrackMattes(valid)).toBe(true);
    expect(isHiddenTrackMatteSource(valid[0], valid)).toBe(true);
    expect(isHiddenTrackMatteSource(valid[1], valid)).toBe(false);

    const svgUri = buildTrackMatteStageSvgDataUri({
      matteLayer: valid[0],
      overlays: valid,
      mode: "luma_inverted",
      time: 0.5,
    });
    expect(svgUri.startsWith('url("data:image/svg+xml,')).toBe(true);

    // Reject Null Rig as matte source
    expect(() =>
      validateStudioTrackMattes([
        createStudioNullRigLayer({ id: "null-1" }),
        { id: "fill", type: "image", trackMatte: { mode: "alpha", sourceLayerId: "null-1" } },
      ])
    ).toThrow(/Null Rig/);

    // Reject chained track mattes
    expect(() =>
      validateStudioTrackMattes([
        { id: "c", type: "text" },
        { id: "b", type: "image", trackMatte: { mode: "alpha", sourceLayerId: "c" } },
        { id: "a", type: "image", trackMatte: { mode: "luma", sourceLayerId: "b" } },
      ])
    ).toThrow(/Chained track mattes/);
  });

  test("all 6 AutoPromote Motion Drivers evaluate deterministically and validate strictly", () => {
    const layer = { id: "drv-layer", startTime: 0, duration: 4, x: 50, scale: 1, rotation: 0 };
    const keys = [
      { id: "k1", targetId: "drv-layer", property: "x", time: 0, value: 20, easing: "linear" },
      { id: "k2", targetId: "drv-layer", property: "x", time: 0.5, value: 70, easing: "linear" },
    ];

    for (const type of ["wiggle", "spring", "pulse", "spin", "loop", "beat_pump"]) {
      const driver = defaultMotionDriverForProperty(type, "x");
      validateStudioMotionDrivers({ motionDrivers: { x: driver } });
      const v1 = evaluateMotionDriverValue({
        driver,
        property: "x",
        baseValue: 70,
        time: 0.72,
        layer,
        layerKeyframes: keys,
      });
      const v2 = evaluateMotionDriverValue({
        driver,
        property: "x",
        baseValue: 70,
        time: 0.72,
        layer,
        layerKeyframes: keys,
      });
      expect(Number.isFinite(v1)).toBe(true);
      expect(v1).toBe(v2);
    }

    // Spring produces positive velocity overshoot right after arriving at k2 (t=0.55)
    const springVal = evaluateMotionDriverValue({
      driver: defaultMotionDriverForProperty("spring", "x"),
      property: "x",
      baseValue: 70,
      time: 0.55,
      layer,
      layerKeyframes: keys,
    });
    expect(springVal).toBeGreaterThan(70);

    // Loop cycles back into 20..70 after t > 0.5
    const loopedVal = evaluateMotionDriverValue({
      driver: { type: "loop", enabled: true, loopMode: "cycle" },
      property: "x",
      baseValue: 70,
      time: 0.75,
      layer,
      layerKeyframes: keys,
    });
    expect(loopedVal).toBeCloseTo(45, 2);

    expect(() =>
      validateStudioMotionDrivers({
        motionDrivers: { x: { type: "wiggle", frequencyHz: -5, amplitude: 4 } },
      })
    ).toThrow(/Invalid wiggle/);
  });

  test("Null Rig parenting, Motion Drivers, Track Mattes and nodeFlow round-trip canonical save/reopen and compile for FFmpeg", () => {
    const nullRig = {
      ...createStudioNullRigLayer({ id: "null-ctrl", name: "Master Rig", startTime: 0, duration: 3 }),
      motionDrivers: {
        x: { type: "pulse", enabled: true, waveform: "sine", frequencyHz: 1, amplitude: 10, phaseDeg: 0 },
      },
    };
    const matteTitle = {
      id: "stencil-title",
      name: "Stencil",
      type: "text",
      text: "VIRAL",
      parentId: "null-ctrl",
      x: 50,
      y: 45,
      width: 70,
      height: 20,
      scale: 1,
      rotation: 0,
      opacity: 1,
      startTime: 0,
      duration: 3,
    };
    const fillImage = {
      id: "grad-fill",
      name: "Fill",
      type: "image",
      src: "https://example.com/plate.png",
      x: 50,
      y: 45,
      width: 75,
      height: 24,
      scale: 1,
      rotation: 0,
      opacity: 1,
      trackMatte: { mode: "alpha", sourceLayerId: "stencil-title" },
      startTime: 0,
      duration: 3,
    };

    const document = adaptStudioSnapshotToDocument({
      projectId: "autopromote-flow-canonical",
      snapshot: {
        orderedClips: [{ id: "src-1", start: 0, end: 3 }],
        selectedClipId: "src-1",
        timeline: [{ id: "occ-1", sourceClipId: "src-1", startRequest: 0, endRequest: 3 }],
        overlays: [nullRig, matteTitle, fillImage],
        compositionOrder: ["null-ctrl", "stencil-title", "grad-fill"],
        nodeFlow: {
          version: 1,
          viewerA: "ColorCorrector:finish",
          viewerB: "MediaOut",
          splitPosition: 42,
          positions: { "Merge:grad-fill": { x: 620, y: 250 } },
          bypassed: {},
        },
        hideShyLayers: true,
      },
    });

    validateStudioProjectDocument(document);

    // Cold reopen projection preserves all rigging, mattes, drivers & Signal Node Flow layout
    const transport = {
      orderedClips: [{ id: "src-1", url: "https://example.com/main.mp4" }],
      timeline: [{ id: "occ-1", sourceClipId: "src-1", url: "https://example.com/main.mp4" }],
      overlays: [{ id: "grad-fill", src: "https://example.com/plate.png" }],
    };
    const reopened = projectStudioEditableStateToSnapshot(document, transport);
    expect(reopened.hideShyLayers).toBe(true);
    expect(reopened.nodeFlow.viewerA).toBe("ColorCorrector:finish");
    expect(reopened.nodeFlow.splitPosition).toBe(42);
    expect(reopened.overlays.find(o => o.id === "null-ctrl").isNullRig).toBe(true);
    expect(reopened.overlays.find(o => o.id === "stencil-title").parentId).toBe("null-ctrl");
    expect(reopened.overlays.find(o => o.id === "grad-fill").trackMatte).toEqual({
      mode: "alpha",
      sourceLayerId: "stencil-title",
    });

    // Render compiler strips Null Rig from pixel outputs, bakes parent's pulse driver onto child stencil-title, and emits track_matte!
    const compiledOverlays = compileStudioOverlaysForRender(document, transport);
    expect(compiledOverlays.map(o => o.id)).toEqual(["stencil-title", "grad-fill"]);

    const compPlan = compileStudioCompositionForRender(document);
    expect(compPlan.order).toEqual(["stencil-title", "grad-fill"]);
    expect(compPlan.layers.some(l => l.id === "null-ctrl")).toBe(false);

    const compiledStencil = compPlan.layers.find(l => l.id === "stencil-title");
    expect(compiledStencil.motion_keyframes.some(k => k.property === "x" && Math.abs(k.value - 50) > 4)).toBe(true);

    const compiledFill = compPlan.layers.find(l => l.id === "grad-fill");
    expect(compiledFill.track_matte).toEqual({
      mode: "alpha",
      source_layer_id: "stencil-title",
    });
  });

  test("removeStudioLayerSafely atomically detaches bound trackMatte consumers and preserves child world poses on parent deletion", () => {
    const matteParent = {
      id: "matte-parent",
      type: "text",
      text: "MASK",
      x: 40,
      y: 30,
      scale: 1.5,
      rotation: 0,
      opacity: 1,
    };
    const fillChild = {
      id: "fill-child",
      type: "image",
      parentId: "matte-parent",
      trackMatte: { mode: "alpha", sourceLayerId: "matte-parent" },
      x: 60,
      y: 50,
      scale: 0.8,
      rotation: 0,
      opacity: 1,
    };
    const overlays = [matteParent, fillChild];
    const worldBefore = evaluateWorldLayerPose(fillChild, overlays, [], 1.0);

    const cleaned = removeStudioLayerSafely(
      {
        overlays,
        compositionOrder: ["matte-parent", "fill-child"],
        motionKeyframes: [
          { id: "k1", targetId: "matte-parent", property: "x", time: 0, value: 40 },
          { id: "k2", targetId: "fill-child", property: "opacity", time: 0, value: 1 },
        ],
      },
      "matte-parent",
      1.0
    );

    expect(cleaned.overlays).toHaveLength(1);
    const survivor = cleaned.overlays[0];
    expect(survivor.id).toBe("fill-child");
    expect(survivor.parentId).toBeUndefined();
    expect(survivor.trackMatte).toEqual({ mode: "none", sourceLayerId: null });
    expect(survivor.x).toBeCloseTo(worldBefore.x, 3);
    expect(survivor.y).toBeCloseTo(worldBefore.y, 3);
    expect(survivor.scale).toBeCloseTo(worldBefore.scale, 3);
    expect(validateStudioParentGraph(cleaned.overlays)).toBe(true);
    expect(validateStudioTrackMattes(cleaned.overlays)).toBe(true);
    expect(cleaned.compositionOrder).toEqual(["fill-child"]);
    expect(cleaned.motionKeyframes.map(k => k.targetId)).toEqual(["fill-child"]);
  });
});
