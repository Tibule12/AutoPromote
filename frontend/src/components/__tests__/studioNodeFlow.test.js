import {
  SMART_FLOW_RIGS,
  buildSmartFlowRigState,
  connectNodeFlowPorts,
  createNodePaletteAddition,
  deriveNodeFlowGraph,
  describeNodeViewerSignal,
  disconnectNodeFlowPort,
  validateStudioNodeFlow,
} from "../studioNodeFlow";

describe("studioNodeFlow — AutoPromote Signal Node Topology & Bidirectional State Sync", () => {
  test("derives spine, NullRig, Merge, PolygonMask and Track Matte wires from canonical state", () => {
    const state = {
      mainTransform: { scale: 1.1 },
      finishFx: { contrast: 112, filmGrain: 10 },
      overlays: [
        { id: "null-1", name: "RigNull", type: "text", isNullRig: true },
        { id: "matte-1", name: "TitleMatte", type: "text", text: "HERO", parentId: "null-1" },
        {
          id: "fill-1",
          name: "Plate",
          type: "image",
          mask: { enabled: true, shape: "ellipse", feather: 12 },
          glow: { enabled: true, color: "#22d3ee", radius: 18, intensity: 0.7 },
          trackMatte: { mode: "alpha", sourceLayerId: "matte-1" },
        },
      ],
      compositionOrder: ["null-1", "matte-1", "fill-1"],
      adjustmentLayers: [{ id: "adj-1", name: "TopLut", opacity: 0.8, enabled: true }],
      nodeFlow: { version: 1, viewerA: "ColorCorrector:finish", viewerB: "MediaOut", splitPosition: 60 },
    };

    const graph = deriveNodeFlowGraph(state);
    const ids = graph.nodes.map(n => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "MediaIn:main-video",
        "Transform:main-video",
        "ColorCorrector:finish",
        "GlowBlur:finish",
        "NullRig:null-1",
        "MediaIn:matte-1",
        "Transform:matte-1",
        "MediaIn:fill-1",
        "GlowBlur:fill-1",
        "PolygonMask:fill-1",
        "Transform:fill-1",
        "Merge:fill-1",
        "Adjustment:adj-1",
        "MediaOut",
      ])
    );
    expect(ids).not.toContain("Merge:matte-1");
    expect(
      graph.wires.some(
        w => w.fromNodeId === "Transform:matte-1" && w.toNodeId === "Merge:fill-1" && w.toPort === "Mask"
      )
    ).toBe(true);
    expect(
      graph.wires.some(
        w => w.fromNodeId === "NullRig:null-1" && w.toNodeId === "Transform:matte-1" && w.toPort === "Parent"
      )
    ).toBe(true);

    const sigA = describeNodeViewerSignal(graph.viewerA, graph, state);
    const sigB = describeNodeViewerSignal(graph.viewerB, graph, state);
    expect(sigA.stage).toBe("graded");
    expect(sigA.includedOverlayIds).toEqual([]);
    expect(sigB.stage).toBe("composite");
    expect(sigB.includedOverlayIds).toEqual(["fill-1"]);
  });

  test("wiring and disconnecting Parent, Mask, and Merge ports mutates canonical Studio state cleanly", () => {
    const initial = {
      mainTransform: { x: 50, y: 50, scale: 1, rotation: 0 },
      overlays: [
        { id: "null-a", type: "text", isNullRig: true, x: 40, y: 30, scale: 1, rotation: 0 },
        { id: "layer-m", type: "text", text: "MATTE", x: 50, y: 50, scale: 1, rotation: 0 },
        { id: "layer-f", type: "image", x: 60, y: 50, scale: 1, rotation: 0 },
      ],
      compositionOrder: ["null-a", "layer-m", "layer-f"],
      motionKeyframes: [],
    };

    const parented = connectNodeFlowPorts(initial, {
      fromNodeId: "NullRig:null-a",
      fromPort: "Out",
      toNodeId: "Transform:layer-f",
      toPort: "Parent",
      currentTime: 0,
    });
    const childAfter = parented.overlays.find(o => o.id === "layer-f");
    expect(childAfter.parentId).toBe("null-a");
    expect(childAfter.x).toBeCloseTo(70, 3);

    const matted = connectNodeFlowPorts(parented, {
      fromNodeId: "Transform:layer-m",
      fromPort: "Out",
      toNodeId: "Merge:layer-f",
      toPort: "Mask",
      currentTime: 0,
    });
    expect(matted.overlays.find(o => o.id === "layer-f").trackMatte).toEqual({
      mode: "alpha",
      sourceLayerId: "layer-m",
    });

    const unmatted = disconnectNodeFlowPort(matted, {
      toNodeId: "Merge:layer-f",
      toPort: "Mask",
      currentTime: 0,
    });
    expect(unmatted.overlays.find(o => o.id === "layer-f").trackMatte.mode).toBe("none");

    const unparented = disconnectNodeFlowPort(unmatted, {
      toNodeId: "Transform:layer-f",
      toPort: "Parent",
      currentTime: 0,
    });
    expect(unparented.overlays.find(o => o.id === "layer-f").parentId).toBeUndefined();
    expect(unparented.overlays.find(o => o.id === "layer-f").x).toBeCloseTo(60, 3);
  });

  test("Smart Flow Rigs and Palette Additions use AutoPromote badges and pass validation", () => {
    for (const rig of SMART_FLOW_RIGS) {
      expect(rig.badge).not.toMatch(/adobe|after\s*effects|davinci|fusion|\bae\b/i);
      const result = buildSmartFlowRigState(rig.id, {
        overlays: [],
        adjustmentLayers: [],
        finishFx: {},
        currentTime: 1,
        programmeDuration: 8,
      });
      expect(result).toBeTruthy();
    }

    const vecAdd = createNodePaletteAddition("add_vector_shape", { overlays: [], currentTime: 0.5 });
    expect(vecAdd.overlays).toHaveLength(1);
    expect(vecAdd.overlays[0].vectorShape).toBeDefined();

    expect(
      validateStudioNodeFlow({
        version: 1,
        viewerA: "MediaOut",
        viewerB: null,
        splitPosition: 50,
        positions: { MediaOut: { x: 800, y: 250 } },
        bypassed: { "ColorCorrector:finish": true },
      })
    ).toBe(true);
    expect(() => validateStudioNodeFlow({ splitPosition: 150 })).toThrow(/splitPosition/);
  });
});

