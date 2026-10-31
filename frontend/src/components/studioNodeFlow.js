import {
  createStudioNullRigLayer,
  defaultMotionDriverForProperty,
  isHiddenTrackMatteSource,
  reparentStudioLayerPreservingWorldPose,
  validateStudioTrackMattes,
} from "./studioCompRigging";
import { studioVectorUri, validateStudioVectorShape } from "./studioVectorShape";

export const NODE_FLOW_PORT_COLORS = {
  BG: "#facc15",      // AutoPromote Gold background input
  FG: "#34d399",      // AutoPromote Emerald foreground input
  Mask: "#22d3ee",    // AutoPromote Cyan effect/matte mask input
  Parent: "#a855f7",  // AutoPromote Purple parent rig input
  In: "#94a3b8",      // Neutral stream input
  Out: "#f8fafc",     // Clean white/cyan output
};

export const NODE_FLOW_PALETTE = [
  {
    id: "add_null_rig",
    kind: "NullRig",
    label: "Null Controller",
    accent: "#a855f7",
    description: "Invisible transform parent rig with Motion Drivers",
  },
  {
    id: "add_title_node",
    kind: "MediaIn",
    label: "Kinetic Title",
    accent: "#22d3ee",
    description: "Add a vector-sharp title generator + Merge branch",
  },
  {
    id: "add_vector_shape",
    kind: "MediaIn",
    label: "Vector Shape",
    accent: "#34d399",
    description: "Add a Bezier gradient shape + Transform + Merge branch",
  },
  {
    id: "add_polygon_mask",
    kind: "PolygonMask",
    label: "Polygon / Ellipse Mask",
    accent: "#38bdf8",
    description: "Attach a feathered geometric mask to the selected layer",
  },
  {
    id: "add_glow_blur",
    kind: "GlowBlur",
    label: "Glow & Soft Blur",
    accent: "#f472b6",
    description: "Enable luminous glow + drop shadow on the selected layer",
  },
  {
    id: "add_adjustment_grade",
    kind: "Adjustment",
    label: "Adjustment Grade",
    accent: "#fbbf24",
    description: "Insert a timed adjustment grade node before MediaOut",
  },
];

export const SMART_FLOW_RIGS = [
  {
    id: "null_callout_rig",
    label: "Null-Parented Callout Rig",
    badge: "RIG",
    summary: "Null controller with Inertial Spring driving a parented callout title & accent badge",
  },
  {
    id: "alpha_matte_reveal",
    label: "Alpha Matte Title Stencil",
    badge: "MATTE",
    summary: "Gradient vector plate clipped live through a bold kinetic title Alpha Matte",
  },
  {
    id: "luma_spotlight_card",
    label: "Luma Glow Spotlight",
    badge: "LUMA",
    summary: "Screen-blended luminous glow plate shaped by a Luma Matte mask",
  },
  {
    id: "split_grade_glow",
    label: "Cinema Grade + Halation",
    badge: "GRADE",
    summary: "Precision color grade, film grain, subtle chromatic split & top adjustment node",
  },
];

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const isPlainObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const validateStudioNodeFlow = nodeFlow => {
  if (nodeFlow === undefined || nodeFlow === null) return true;
  if (!isPlainObject(nodeFlow)) {
    fail("INVALID_NODE_FLOW", "nodeFlow settings must be an object.");
  }
  const allowed = ["version", "viewerA", "viewerB", "splitPosition", "positions", "bypassed"];
  for (const key of Object.keys(nodeFlow)) {
    if (!allowed.includes(key)) {
      fail("INVALID_NODE_FLOW", `Unsupported nodeFlow field ${key}.`);
    }
  }
  if (nodeFlow.version !== undefined && nodeFlow.version !== 1) {
    fail("INVALID_NODE_FLOW", "Unsupported nodeFlow schema version.");
  }
  for (const viewerField of ["viewerA", "viewerB"]) {
    const val = nodeFlow[viewerField];
    if (val !== undefined && val !== null && (typeof val !== "string" || val.length > 160)) {
      fail("INVALID_NODE_FLOW", `Invalid nodeFlow ${viewerField} node reference.`);
    }
  }
  if (
    nodeFlow.splitPosition !== undefined &&
    (typeof nodeFlow.splitPosition !== "number" ||
      !Number.isFinite(nodeFlow.splitPosition) ||
      nodeFlow.splitPosition < 0 ||
      nodeFlow.splitPosition > 100)
  ) {
    fail("INVALID_NODE_FLOW", "nodeFlow splitPosition must be between 0 and 100.");
  }
  if (nodeFlow.positions !== undefined) {
    if (!isPlainObject(nodeFlow.positions) || Object.keys(nodeFlow.positions).length > 512) {
      fail("INVALID_NODE_FLOW", "nodeFlow positions map is invalid.");
    }
    for (const [nodeId, pos] of Object.entries(nodeFlow.positions)) {
      if (
        !nodeId ||
        !isPlainObject(pos) ||
        typeof pos.x !== "number" ||
        typeof pos.y !== "number" ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y) ||
        Math.abs(pos.x) > 20000 ||
        Math.abs(pos.y) > 20000
      ) {
        fail("INVALID_NODE_FLOW", `Invalid coordinates for signal node ${nodeId}.`);
      }
    }
  }
  if (nodeFlow.bypassed !== undefined) {
    if (!isPlainObject(nodeFlow.bypassed) || Object.keys(nodeFlow.bypassed).length > 512) {
      fail("INVALID_NODE_FLOW", "nodeFlow bypassed map is invalid.");
    }
    for (const val of Object.values(nodeFlow.bypassed)) {
      if (typeof val !== "boolean") {
        fail("INVALID_NODE_FLOW", "nodeFlow bypass flag must be boolean.");
      }
    }
  }
  return true;
};

const resolvePos = (positions, id, defaultX, defaultY) => {
  const saved = positions?.[id];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: saved.x, y: saved.y };
  }
  return { x: defaultX, y: defaultY };
};

export const deriveNodeFlowGraph = (state = {}) => {
  const flow = state.nodeFlow || {};
  const positions = flow.positions || {};
  const bypassed = flow.bypassed || {};
  const visualOverlays = (state.overlays || []).filter(item => item && !item.isCaption);
  const rankMap = new Map(
    (state.compositionOrder || []).map((id, index) => [String(id), index])
  );
  const orderedOverlays = [...visualOverlays].sort(
    (a, b) =>
      (rankMap.get(String(a.id)) ?? 1000) - (rankMap.get(String(b.id)) ?? 1000)
  );

  const nodes = [];
  const wires = [];

  const spineY = 250;
  let spineX = 56;

  // 1. Main MediaIn + Transform + Color + Finish Texture spine
  const mainMediaId = "MediaIn:main-video";
  const mainXfId = "Transform:main-video";
  const colorId = "ColorCorrector:finish";
  const textureId = "GlowBlur:finish";

  nodes.push({
    id: mainMediaId,
    kind: "MediaIn",
    category: "source",
    targetId: "main-video",
    label: "MainIn",
    subtitle: "Programme Source",
    accent: "#38bdf8",
    bypassed: false,
    inputs: [],
    outputs: ["Out"],
    ...resolvePos(positions, mainMediaId, spineX, spineY),
  });
  spineX += 196;

  nodes.push({
    id: mainXfId,
    kind: "Transform",
    category: "transform",
    targetId: "main-video",
    label: "MainXf",
    subtitle: `Scale ${Number(state.mainTransform?.scale ?? 1).toFixed(2)}x`,
    accent: "#8b5cf6",
    bypassed: !!bypassed[mainXfId],
    inputs: ["In"],
    outputs: ["Out"],
    ...resolvePos(positions, mainXfId, spineX, spineY),
  });
  wires.push({
    id: `${mainMediaId}->${mainXfId}`,
    fromNodeId: mainMediaId,
    fromPort: "Out",
    toNodeId: mainXfId,
    toPort: "In",
  });
  spineX += 196;

  const fx = state.finishFx || {};
  nodes.push({
    id: colorId,
    kind: "ColorCorrector",
    category: "color",
    targetId: "finish-color",
    label: "ColorGrade",
    subtitle: fx.preset && fx.preset !== "natural" ? String(fx.preset) : `Contrast ${fx.contrast ?? 100}%`,
    accent: "#f59e0b",
    bypassed: !!bypassed[colorId],
    inputs: ["In"],
    outputs: ["Out"],
    ...resolvePos(positions, colorId, spineX, spineY),
  });
  wires.push({
    id: `${mainXfId}->${colorId}`,
    fromNodeId: mainXfId,
    fromPort: "Out",
    toNodeId: colorId,
    toPort: "In",
  });
  spineX += 196;

  nodes.push({
    id: textureId,
    kind: "GlowBlur",
    category: "fx",
    targetId: "finish-texture",
    label: "FinishFX",
    subtitle: `Grain ${fx.filmGrain || 0} · Chroma ${fx.chromaticAberration || 0}`,
    accent: "#ec4899",
    bypassed: !!bypassed[textureId],
    inputs: ["In"],
    outputs: ["Out"],
    ...resolvePos(positions, textureId, spineX, spineY),
  });
  wires.push({
    id: `${colorId}->${textureId}`,
    fromNodeId: colorId,
    fromPort: "Out",
    toNodeId: textureId,
    toPort: "In",
  });

  let currentSpineId = textureId;

  // 4. Adjustment Grade Cues on Spine
  let adjustmentX = spineX + 196;
  (state.adjustmentLayers || []).forEach((adj, idx) => {
    const adjNodeId = `Adjustment:${adj.id || idx}`;
    nodes.push({
      id: adjNodeId,
      kind: "Adjustment",
      category: "color",
      targetId: String(adj.id || idx),
      label: adj.name || adj.label || `AdjGrade_${idx + 1}`,
      subtitle: `${adj.preset || "Contrast"} · ${Math.round(Number(adj.opacity ?? 1) * 100)}%`,
      accent: "#fbbf24",
      bypassed: adj.enabled === false,
      inputs: ["In"],
      outputs: ["Out"],
      ...resolvePos(positions, adjNodeId, adjustmentX, spineY),
    });
    wires.push({
      id: `${currentSpineId}->${adjNodeId}`,
      fromNodeId: currentSpineId,
      fromPort: "Out",
      toNodeId: adjNodeId,
      toPort: "In",
    });
    currentSpineId = adjNodeId;
    adjustmentX += 204;
  });

  spineX = adjustmentX - 196;

  // Optional Subject Isolation branch
  (state.subjectVfxScenes || []).forEach((item, idx) => {
    const subId = `SubjectMatte:${item.scene?.id || idx}`;
    nodes.push({
      id: subId,
      kind: "SubjectMatte",
      category: "matte",
      targetId: String(item.scene?.id || idx),
      label: "SubjectMatte",
      subtitle: item.scene?.preset || "Foreground Roto",
      accent: "#2dd4bf",
      bypassed: item.enabled === false,
      inputs: ["In"],
      outputs: ["Out"],
      ...resolvePos(positions, subId, 252, spineY - 132 - idx * 96),
    });
    wires.push({
      id: `${mainMediaId}->${subId}`,
      fromNodeId: mainMediaId,
      fromPort: "Out",
      toNodeId: subId,
      toPort: "In",
    });
  });

  // 2. Null Rig Controllers (positioned in upper rig lane)
  const nullLayers = orderedOverlays.filter(ov => ov.isNullRig);
  nullLayers.forEach((nullLayer, idx) => {
    const nodeId = `NullRig:${nullLayer.id}`;
    const hasDrivers = Boolean(
      nullLayer.motionDrivers &&
        Object.values(nullLayer.motionDrivers).some(d => d && d.enabled !== false)
    );
    nodes.push({
      id: nodeId,
      kind: "NullRig",
      category: "rig",
      targetId: String(nullLayer.id),
      label: nullLayer.name || `Null_${idx + 1}`,
      subtitle: hasDrivers ? "Null + Driver" : "Transform Rig",
      accent: "#a855f7",
      bypassed: false,
      inputs: nullLayer.parentId ? ["Parent"] : [],
      outputs: ["Out"],
      ...resolvePos(positions, nodeId, 440 + idx * 220, 44),
    });
  });

  // 3. Visual Overlay Branches & Spine Merges
  const nonNullOverlays = orderedOverlays.filter(ov => !ov.isNullRig);
  let mergeIndex = 0;

  nonNullOverlays.forEach((ov, idx) => {
    const ovId = String(ov.id);
    const hiddenMatte = isHiddenTrackMatteSource(ov, orderedOverlays);
    const colX = spineX + 216 + mergeIndex * 224;
    const branchBaseY = hiddenMatte ? spineY + 218 : spineY - 150 - (idx % 2) * 86;

    const mediaNodeId = `MediaIn:${ovId}`;
    const xfNodeId = `Transform:${ovId}`;

    nodes.push({
      id: mediaNodeId,
      kind: "MediaIn",
      category: "source",
      targetId: ovId,
      label: (ov.name || ov.text || `${ov.type || "Layer"}_${idx + 1}`).slice(0, 18),
      subtitle: ov.vectorShape ? "Vector Shape" : ov.type === "text" ? "Title Gen" : `${ov.type || "Media"} In`,
      accent: ov.type === "text" ? "#22d3ee" : "#34d399",
      bypassed: false,
      inputs: [],
      outputs: ["Out"],
      ...resolvePos(positions, mediaNodeId, colX - 180, branchBaseY),
    });

    let branchUpstreamId = mediaNodeId;

    const hasLayerFx = Boolean(ov.glow?.enabled || ov.layerShadow?.enabled || Number(ov.blur || 0) > 0);
    if (hasLayerFx) {
      const fxNodeId = `GlowBlur:${ovId}`;
      nodes.push({
        id: fxNodeId,
        kind: "GlowBlur",
        category: "fx",
        targetId: ovId,
        label: "LayerGlow",
        subtitle: `Glow ${ov.glow?.enabled ? "On" : "Off"} · Blur ${ov.blur || 0}`,
        accent: "#f472b6",
        bypassed: !!bypassed[fxNodeId],
        inputs: ["In"],
        outputs: ["Out"],
        ...resolvePos(positions, fxNodeId, colX - 92, branchBaseY + 56),
      });
      wires.push({
        id: `${branchUpstreamId}->${fxNodeId}`,
        fromNodeId: branchUpstreamId,
        fromPort: "Out",
        toNodeId: fxNodeId,
        toPort: "In",
      });
      branchUpstreamId = fxNodeId;
    }

    nodes.push({
      id: xfNodeId,
      kind: "Transform",
      category: "transform",
      targetId: ovId,
      label: `Xf_${idx + 1}`,
      subtitle: `${Math.round(Number(ov.x ?? 50))},${Math.round(Number(ov.y ?? 50))}% · ${Number(ov.scale ?? 1).toFixed(2)}x`,
      accent: "#8b5cf6",
      bypassed: !!bypassed[xfNodeId],
      inputs: ["In", "Mask", "Parent"],
      outputs: ["Out"],
      ...resolvePos(positions, xfNodeId, colX, branchBaseY),
    });
    wires.push({
      id: `${branchUpstreamId}->${xfNodeId}`,
      fromNodeId: branchUpstreamId,
      fromPort: "Out",
      toNodeId: xfNodeId,
      toPort: "In",
    });

    if (ov.mask?.enabled) {
      const maskNodeId = `PolygonMask:${ovId}`;
      nodes.push({
        id: maskNodeId,
        kind: "PolygonMask",
        category: "matte",
        targetId: ovId,
        label: ov.mask.shape === "ellipse" ? "EllipseMask" : ov.mask.shape === "polygon" ? "PolyMask" : "RectMask",
        subtitle: `Feather ${ov.mask.feather || 0}px`,
        accent: "#22d3ee",
        bypassed: false,
        inputs: [],
        outputs: ["Out"],
        ...resolvePos(positions, maskNodeId, colX - 168, branchBaseY - 68),
      });
      wires.push({
        id: `${maskNodeId}->${xfNodeId}:Mask`,
        fromNodeId: maskNodeId,
        fromPort: "Out",
        toNodeId: xfNodeId,
        toPort: "Mask",
      });
    }

    if (!hiddenMatte) {
      const mergeNodeId = `Merge:${ovId}`;
      const blendLabel = ov.blendMode && ov.blendMode !== "normal" ? ov.blendMode : "Over";
      const matteMode = ov.trackMatte?.mode && ov.trackMatte.mode !== "none" ? ` · ${ov.trackMatte.mode}` : "";
      nodes.push({
        id: mergeNodeId,
        kind: "Merge",
        category: "merge",
        targetId: ovId,
        label: `Merge_${mergeIndex + 1}`,
        subtitle: `${blendLabel}${matteMode}`,
        accent: "#34d399",
        bypassed: !!bypassed[mergeNodeId],
        inputs: ["BG", "FG", "Mask"],
        outputs: ["Out"],
        ...resolvePos(positions, mergeNodeId, colX, spineY),
      });
      wires.push({
        id: `${currentSpineId}->${mergeNodeId}:BG`,
        fromNodeId: currentSpineId,
        fromPort: "Out",
        toNodeId: mergeNodeId,
        toPort: "BG",
      });
      wires.push({
        id: `${xfNodeId}->${mergeNodeId}:FG`,
        fromNodeId: xfNodeId,
        fromPort: "Out",
        toNodeId: mergeNodeId,
        toPort: "FG",
      });
      currentSpineId = mergeNodeId;
      mergeIndex += 1;
    }
  });

  // Wire Parent connections & Track Matte Mask connections now that all Transform/Merge nodes exist
  const nodeIds = new Set(nodes.map(n => n.id));
  orderedOverlays.forEach(ov => {
    const ovId = String(ov.id);
    if (ov.parentId) {
      const parentSourceId =
        ov.parentId === "main-video"
          ? mainXfId
          : nodeIds.has(`NullRig:${ov.parentId}`)
            ? `NullRig:${ov.parentId}`
            : `Transform:${ov.parentId}`;
      const childTargetId = ov.isNullRig ? `NullRig:${ovId}` : `Transform:${ovId}`;
      if (nodeIds.has(parentSourceId) && nodeIds.has(childTargetId)) {
        wires.push({
          id: `${parentSourceId}->${childTargetId}:Parent`,
          fromNodeId: parentSourceId,
          fromPort: "Out",
          toNodeId: childTargetId,
          toPort: "Parent",
        });
      }
    }
    if (!ov.isNullRig && ov.trackMatte?.mode && ov.trackMatte.mode !== "none" && ov.trackMatte.sourceLayerId) {
      const matteXfId = `Transform:${ov.trackMatte.sourceLayerId}`;
      const mergeNodeId = `Merge:${ovId}`;
      if (nodeIds.has(matteXfId) && nodeIds.has(mergeNodeId)) {
        wires.push({
          id: `${matteXfId}->${mergeNodeId}:Mask`,
          fromNodeId: matteXfId,
          fromPort: "Out",
          toNodeId: mergeNodeId,
          toPort: "Mask",
        });
      }
    }
  });

  const outX = spineX + 216 + mergeIndex * 224;
  // 5. MediaOut Sink
  const mediaOutId = "MediaOut";
  nodes.push({
    id: mediaOutId,
    kind: "MediaOut",
    category: "output",
    targetId: "programme-out",
    label: "MediaOut",
    subtitle: "Canonical Render Out",
    accent: "#22d3ee",
    bypassed: false,
    inputs: ["In"],
    outputs: [],
    ...resolvePos(positions, mediaOutId, outX, spineY),
  });
  wires.push({
    id: `${currentSpineId}->MediaOut`,
    fromNodeId: currentSpineId,
    fromPort: "Out",
    toNodeId: mediaOutId,
    toPort: "In",
  });

  const viewerNodeIds = new Set(nodes.map(node => node.id));
  const viewerA = viewerNodeIds.has(flow.viewerA) ? flow.viewerA : "MediaOut";
  const viewerB = flow.viewerB && viewerNodeIds.has(flow.viewerB) ? flow.viewerB : null;

  return {
    nodes,
    wires,
    viewerA,
    viewerB,
    splitPosition: Number.isFinite(flow.splitPosition) ? flow.splitPosition : 50,
  };
};

const extractLayerId = nodeId => {
  if (!nodeId || !nodeId.includes(":")) return null;
  return nodeId.slice(nodeId.indexOf(":") + 1);
};

export const connectNodeFlowPorts = (
  state,
  { fromNodeId, toNodeId, toPort, currentTime = 0 }
) => {
  const overlays = [...(state.overlays || [])];
  const fromLayerId = extractLayerId(fromNodeId);
  const toLayerId = extractLayerId(toNodeId);

  // Case 1: Wiring into a Transform / NullRig Parent port -> Pick-Whip Parenting!
  if (toPort === "Parent" && toLayerId && fromLayerId) {
    const nextOverlays = overlays.map(item =>
      String(item.id) === String(toLayerId)
        ? reparentStudioLayerPreservingWorldPose(
            item,
            fromLayerId,
            overlays,
            state.motionKeyframes || [],
            currentTime,
            state.mainTransform || null
          )
        : item
    );
    return { ...state, overlays: nextOverlays };
  }

  // Case 2: Wiring a layer branch into a Merge.Mask port -> Alpha Track Matte!
  if (toNodeId?.startsWith("Merge:") && toPort === "Mask" && toLayerId && fromLayerId) {
    const nextOverlays = overlays.map(item =>
      String(item.id) === String(toLayerId)
        ? {
            ...item,
            trackMatte: {
              mode: item.trackMatte?.mode && item.trackMatte.mode !== "none" ? item.trackMatte.mode : "alpha",
              sourceLayerId: String(fromLayerId),
            },
          }
        : item
    );
    validateStudioTrackMattes(nextOverlays);
    return { ...state, overlays: nextOverlays };
  }

  // Case 3: Wiring PolygonMask into Transform.Mask -> Enable geometric mask
  if (fromNodeId?.startsWith("PolygonMask:") && toNodeId?.startsWith("Transform:") && toPort === "Mask" && toLayerId) {
    const nextOverlays = overlays.map(item =>
      String(item.id) === String(toLayerId)
        ? {
            ...item,
            mask: {
              shape: "ellipse",
              radius: 12,
              feather: 8,
              inverted: false,
              ...(item.mask || {}),
              enabled: true,
            },
          }
        : item
    );
    return { ...state, overlays: nextOverlays };
  }

  // Case 4: Wiring Merge_A.Out -> Merge_B.BG -> Reorder composition stack!
  if (fromNodeId?.startsWith("Merge:") && toNodeId?.startsWith("Merge:") && (toPort === "BG" || toPort === "FG")) {
    if (fromLayerId && toLayerId && fromLayerId !== toLayerId) {
      const baseOrder = Array.isArray(state.compositionOrder) && state.compositionOrder.length
        ? [...state.compositionOrder]
        : overlays.filter(o => !o.isCaption).map(o => String(o.id));
      const filtered = baseOrder.filter(id => id !== fromLayerId);
      const targetIdx = filtered.indexOf(toLayerId);
      if (targetIdx >= 0) {
        filtered.splice(toPort === "BG" ? targetIdx : targetIdx + 1, 0, fromLayerId);
        return { ...state, compositionOrder: filtered };
      }
    }
  }

  return state;
};

export const disconnectNodeFlowPort = (
  state,
  { toNodeId, toPort, currentTime = 0 }
) => {
  const overlays = [...(state.overlays || [])];
  const toLayerId = extractLayerId(toNodeId);
  if (!toLayerId) return state;

  if (toPort === "Parent") {
    return {
      ...state,
      overlays: overlays.map(item =>
        String(item.id) === String(toLayerId)
          ? reparentStudioLayerPreservingWorldPose(
              item,
              null,
              overlays,
              state.motionKeyframes || [],
              currentTime,
              state.mainTransform || null
            )
          : item
      ),
    };
  }

  if (toNodeId?.startsWith("Merge:") && toPort === "Mask") {
    return {
      ...state,
      overlays: overlays.map(item =>
        String(item.id) === String(toLayerId)
          ? { ...item, trackMatte: { mode: "none", sourceLayerId: null } }
          : item
      ),
    };
  }

  if (toNodeId?.startsWith("Transform:") && toPort === "Mask") {
    return {
      ...state,
      overlays: overlays.map(item =>
        String(item.id) === String(toLayerId)
          ? { ...item, mask: { ...(item.mask || {}), enabled: false } }
          : item
      ),
    };
  }

  return state;
};

export const createNodePaletteAddition = (
  paletteId,
  {
    overlays = [],
    adjustmentLayers = [],
    activeOverlayId = null,
    currentTime = 0,
    programmeDuration = 8,
  } = {}
) => {
  const stamp = Date.now();
  const cueStart = Math.max(0, Number(currentTime) || 0);
  const cueDur = Math.max(1.5, Math.min(5, Math.max(2, (Number(programmeDuration) || 8) - cueStart)));

  if (paletteId === "add_null_rig") {
    const nullLayer = createStudioNullRigLayer({
      id: `null-${stamp}`,
      name: `Null Rig ${overlays.filter(o => o?.isNullRig).length + 1}`,
      startTime: cueStart,
      duration: cueDur,
    });
    return { overlays: [...overlays, nullLayer], selectOverlayId: nullLayer.id };
  }

  if (paletteId === "add_title_node") {
    const titleLayer = {
      id: `flow-title-${stamp}`,
      name: `Flow Title ${overlays.filter(o => o?.type === "text" && !o?.isNullRig).length + 1}`,
      type: "text",
      text: "SIGNAL LOCKED",
      x: 50,
      y: 28,
      width: 72,
      height: 16,
      scale: 1,
      rotation: 0,
      opacity: 1,
      color: "#f8fafc",
      bg: "rgba(15, 23, 42, 0.72)",
      fontSize: 44,
      fontWeight: 900,
      blendMode: "normal",
      startTime: cueStart,
      duration: cueDur,
    };
    return { overlays: [...overlays, titleLayer], selectOverlayId: titleLayer.id };
  }

  if (paletteId === "add_vector_shape") {
    const shapeSpec = validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 12, y: 18, in: [0, 0], out: [0, 0] },
        { x: 88, y: 18, in: [0, 0], out: [0, 0] },
        { x: 88, y: 82, in: [0, 0], out: [0, 0] },
        { x: 12, y: 82, in: [0, 0], out: [0, 0] },
      ],
      fill: {
        kind: "linear",
        color: "#8b5cf6",
        endColor: "#22d3ee",
        start: [0, 0],
        end: [100, 100],
      },
      stroke: { color: "#f8fafc", width: 2 },
    });
    const vecLayer = {
      id: `flow-vec-${stamp}`,
      name: `Vector Plate ${overlays.filter(o => o?.vectorShape).length + 1}`,
      type: "image",
      src: studioVectorUri(shapeSpec),
      vectorShape: shapeSpec,
      x: 50,
      y: 50,
      width: 46,
      height: 26,
      scale: 1,
      rotation: 0,
      opacity: 0.92,
      frameShape: "edge",
      blendMode: "normal",
      startTime: cueStart,
      duration: cueDur,
    };
    return { overlays: [...overlays, vecLayer], selectOverlayId: vecLayer.id };
  }

  if (paletteId === "add_polygon_mask") {
    const targetId = activeOverlayId || overlays.find(o => o && !o.isCaption && !o.isNullRig)?.id;
    if (!targetId) return null;
    return {
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? {
              ...o,
              mask: {
                enabled: true,
                shape: "polygon",
                path: o.mask?.path || "polygon(50% 4%, 96% 36%, 80% 96%, 20% 96%, 4% 36%)",
                radius: 8,
                feather: 10,
                inverted: false,
              },
            }
          : o
      ),
      selectOverlayId: targetId,
    };
  }

  if (paletteId === "add_glow_blur") {
    const targetId = activeOverlayId || overlays.find(o => o && !o.isCaption && !o.isNullRig)?.id;
    if (!targetId) return null;
    return {
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? {
              ...o,
              glow: { enabled: true, color: "#22d3ee", radius: 20, intensity: 0.8 },
              layerShadow: { enabled: true, color: "#020617", blur: 22, opacity: 0.6, x: 0, y: 10 },
            }
          : o
      ),
      selectOverlayId: targetId,
    };
  }

  if (paletteId === "add_adjustment_grade") {
    const adj = {
      id: `adj-${stamp}`,
      name: `Grade Node ${adjustmentLayers.length + 1}`,
      label: `Grade Node ${adjustmentLayers.length + 1}`,
      enabled: true,
      preset: "cinema_contrast",
      opacity: 0.85,
      intensity: 75,
      startTime: cueStart,
      duration: cueDur,
      finishFx: { contrast: 1.12, saturation: 1.08, vignette: 18 },
    };
    return { adjustmentLayers: [...adjustmentLayers, adj] };
  }

  return null;
};

export const buildSmartFlowRigState = (
  rigId,
  {
    overlays = [],
    adjustmentLayers = [],
    finishFx = {},
    currentTime = 0,
    programmeDuration = 8,
  } = {}
) => {
  const stamp = Date.now();
  const cueStart = Math.max(0, Number(currentTime) || 0);
  const cueDur = Math.max(2, Math.min(5, Math.max(2.5, (Number(programmeDuration) || 8) - cueStart)));

  if (rigId === "null_callout_rig") {
    const nullId = `rig-null-${stamp}`;
    const badgeShape = validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 50, y: 6, in: [0, 0], out: [0, 0] },
        { x: 94, y: 50, in: [0, 0], out: [0, 0] },
        { x: 50, y: 94, in: [0, 0], out: [0, 0] },
        { x: 6, y: 50, in: [0, 0], out: [0, 0] },
      ],
      fill: { kind: "linear", color: "#22d3ee", endColor: "#8b5cf6", start: [0, 0], end: [100, 100] },
      stroke: { color: "#f8fafc", width: 3 },
    });
    const nullLayer = {
      ...createStudioNullRigLayer({
        id: nullId,
        name: "Callout Master Null",
        startTime: cueStart,
        duration: cueDur,
        x: 50,
        y: 34,
      }),
      motionDrivers: {
        scale: defaultMotionDriverForProperty("spring", "scale"),
        y: { type: "wiggle", enabled: true, frequencyHz: 1.4, amplitude: 1.6, octaves: 2, seed: 23 },
      },
    };
    const pointerBadge = {
      id: `rig-badge-${stamp}`,
      name: "Rig Accent Diamond",
      type: "image",
      src: studioVectorUri(badgeShape),
      vectorShape: badgeShape,
      parentId: nullId,
      x: 28,
      y: 50,
      width: 11,
      height: 11,
      scale: 1,
      rotation: 0,
      opacity: 1,
      frameShape: "edge",
      blendMode: "normal",
      glow: { enabled: true, color: "#22d3ee", radius: 16, intensity: 0.75 },
      startTime: cueStart,
      duration: cueDur,
      motionDrivers: {
        rotation: { type: "spin", enabled: true, ratePerSecond: 36 },
      },
    };
    const calloutTitle = {
      id: `rig-label-${stamp}`,
      name: "Rig Callout Label",
      type: "text",
      text: "KEY INSIGHT",
      parentId: nullId,
      x: 56,
      y: 50,
      width: 58,
      height: 14,
      scale: 1,
      rotation: 0,
      opacity: 1,
      color: "#f8fafc",
      bg: "rgba(8, 17, 31, 0.86)",
      fontSize: 38,
      fontWeight: 900,
      blendMode: "normal",
      startTime: cueStart,
      duration: cueDur,
    };
    return {
      overlays: [...overlays, nullLayer, pointerBadge, calloutTitle],
      selectOverlayId: nullId,
    };
  }

  if (rigId === "alpha_matte_reveal") {
    const matteId = `matte-title-${stamp}`;
    const fillShape = validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 4, y: 12, in: [0, 0], out: [0, 0] },
        { x: 96, y: 12, in: [0, 0], out: [0, 0] },
        { x: 96, y: 88, in: [0, 0], out: [0, 0] },
        { x: 4, y: 88, in: [0, 0], out: [0, 0] },
      ],
      fill: { kind: "linear", color: "#22d3ee", endColor: "#ec4899", start: [0, 20], end: [100, 80] },
      stroke: { color: "#ffffff", width: 0 },
    });
    const matteTitle = {
      id: matteId,
      name: "Stencil Matte Title",
      type: "text",
      text: "UNSTOPPABLE",
      x: 50,
      y: 44,
      width: 84,
      height: 22,
      scale: 1,
      rotation: 0,
      opacity: 1,
      color: "#ffffff",
      bg: "transparent",
      fontSize: 60,
      fontWeight: 900,
      blendMode: "normal",
      startTime: cueStart,
      duration: cueDur,
      motionDrivers: {
        scale: defaultMotionDriverForProperty("spring", "scale"),
      },
    };
    const gradientFill = {
      id: `matte-fill-${stamp}`,
      name: "Neon Gradient Fill",
      type: "image",
      src: studioVectorUri(fillShape),
      vectorShape: fillShape,
      x: 50,
      y: 44,
      width: 88,
      height: 28,
      scale: 1,
      rotation: 0,
      opacity: 1,
      frameShape: "edge",
      blendMode: "normal",
      trackMatte: { mode: "alpha", sourceLayerId: matteId },
      startTime: cueStart,
      duration: cueDur,
      motionDrivers: {
        x: { type: "pulse", enabled: true, waveform: "sine", frequencyHz: 0.8, amplitude: 5, phaseDeg: 0 },
      },
    };
    return {
      overlays: [...overlays, matteTitle, gradientFill],
      selectOverlayId: gradientFill.id,
    };
  }

  if (rigId === "luma_spotlight_card") {
    const lumaId = `luma-mask-${stamp}`;
    const glowPlateShape = validateStudioVectorShape({
      version: 1,
      closed: true,
      nodes: [
        { x: 8, y: 8, in: [0, 0], out: [0, 0] },
        { x: 92, y: 8, in: [0, 0], out: [0, 0] },
        { x: 92, y: 92, in: [0, 0], out: [0, 0] },
        { x: 8, y: 92, in: [0, 0], out: [0, 0] },
      ],
      fill: { kind: "linear", color: "#8b5cf6", endColor: "#22d3ee", start: [15, 0], end: [85, 100] },
      stroke: { color: "#22d3ee", width: 2 },
    });
    const lumaSource = {
      id: lumaId,
      name: "Luma Matte Card",
      type: "text",
      text: "SPOTLIGHT",
      x: 50,
      y: 50,
      width: 78,
      height: 24,
      scale: 1,
      rotation: 0,
      opacity: 1,
      color: "#ffffff",
      bg: "transparent",
      fontSize: 56,
      fontWeight: 900,
      blendMode: "normal",
      startTime: cueStart,
      duration: cueDur,
    };
    const glowFill = {
      id: `luma-glow-${stamp}`,
      name: "Screen Glow Plate",
      type: "image",
      src: studioVectorUri(glowPlateShape),
      vectorShape: glowPlateShape,
      x: 50,
      y: 50,
      width: 82,
      height: 30,
      scale: 1,
      rotation: 0,
      opacity: 1,
      frameShape: "edge",
      blendMode: "screen",
      glow: { enabled: true, color: "#22d3ee", radius: 24, intensity: 0.85 },
      trackMatte: { mode: "luma", sourceLayerId: lumaId },
      startTime: cueStart,
      duration: cueDur,
      motionDrivers: {
        opacity: { type: "beat_pump", enabled: true, bpm: 124, amount: 0.16, decay: 7.5 },
      },
    };
    return {
      overlays: [...overlays, lumaSource, glowFill],
      selectOverlayId: glowFill.id,
    };
  }

  if (rigId === "split_grade_glow") {
    const adj = {
      id: `adj-cinema-${stamp}`,
      name: "Halation Top Grade",
      label: "Halation Top Grade",
      enabled: true,
      preset: "cinema_halation",
      opacity: 1,
      intensity: 100,
      startTime: 0,
      duration: Math.max(2, Number(programmeDuration) || 8),
      finishFx: { contrast: 1.14, saturation: 1.06, vignette: 22 },
    };
    return {
      finishFx: {
        ...finishFx,
        contrast: Math.max(108, Number(finishFx.contrast || 100)),
        saturation: Math.max(106, Number(finishFx.saturation || 100)),
        temperature: Number(finishFx.temperature || 0) + 4,
        vignette: Math.max(18, Number(finishFx.vignette || 0)),
        filmGrain: Math.max(12, Number(finishFx.filmGrain || 0)),
        chromaticAberration: Math.max(4, Number(finishFx.chromaticAberration || 0)),
      },
      adjustmentLayers: [...adjustmentLayers, adj],
    };
  }

  return null;
};

export const describeNodeViewerSignal = (nodeId, graph, state = {}) => {
  const node = graph?.nodes?.find(item => item.id === nodeId) || graph?.nodes?.find(item => item.id === "MediaOut");
  if (!node) {
    return {
      nodeId: "MediaOut",
      label: "MediaOut",
      stage: "composite",
      includeMainTransform: true,
      includeGrade: true,
      includeTexture: true,
      includedOverlayIds: "all",
      badge: "FINAL COMP",
    };
  }

  if (node.id === "MediaIn:main-video") {
    return {
      nodeId: node.id,
      label: node.label,
      stage: "source",
      includeMainTransform: false,
      includeGrade: false,
      includeTexture: false,
      includedOverlayIds: [],
      badge: "RAW SOURCE",
    };
  }
  if (node.id === "Transform:main-video") {
    return {
      nodeId: node.id,
      label: node.label,
      stage: "transform",
      includeMainTransform: !node.bypassed,
      includeGrade: false,
      includeTexture: false,
      includedOverlayIds: [],
      badge: "PRE-GRADE XF",
    };
  }
  if (node.id === "ColorCorrector:finish") {
    return {
      nodeId: node.id,
      label: node.label,
      stage: "graded",
      includeMainTransform: true,
      includeGrade: !node.bypassed,
      includeTexture: false,
      includedOverlayIds: [],
      badge: "GRADED BASE",
    };
  }
  if (node.id === "GlowBlur:finish") {
    return {
      nodeId: node.id,
      label: node.label,
      stage: "textured",
      includeMainTransform: true,
      includeGrade: true,
      includeTexture: !node.bypassed,
      includedOverlayIds: [],
      badge: "PRE-MERGE FX",
    };
  }

  if (node.id.startsWith("Merge:")) {
    const mergeNodes = graph.nodes.filter(n => n.kind === "Merge");
    const stopIdx = mergeNodes.findIndex(n => n.id === node.id);
    const activeIds = mergeNodes
      .slice(0, stopIdx + 1)
      .filter(n => !n.bypassed)
      .map(n => n.targetId);
    return {
      nodeId: node.id,
      label: node.label,
      stage: "partial_merge",
      includeMainTransform: true,
      includeGrade: true,
      includeTexture: true,
      includedOverlayIds: activeIds,
      badge: `MERGE 1..${stopIdx + 1}`,
    };
  }

  if (
    node.id.startsWith("MediaIn:") ||
    node.id.startsWith("Transform:") ||
    node.id.startsWith("GlowBlur:") ||
    node.id.startsWith("PolygonMask:") ||
    node.id.startsWith("NullRig:")
  ) {
    const layerId = extractLayerId(node.id);
    return {
      nodeId: node.id,
      label: node.label,
      stage: node.id.startsWith("PolygonMask:") ? "matte_alpha" : "layer_isolated",
      includeMainTransform: false,
      includeGrade: false,
      includeTexture: false,
      isolatedLayerId: layerId,
      includedOverlayIds: layerId ? [layerId] : [],
      badge: node.kind === "NullRig" ? "RIG GIZMO" : "BRANCH SOLO",
    };
  }

  const allMergeIds = graph.nodes
    .filter(n => n.kind === "Merge" && !n.bypassed)
    .map(n => n.targetId);
  return {
    nodeId: node.id,
    label: node.label,
    stage: "composite",
    includeMainTransform: !state.nodeFlow?.bypassed?.["Transform:main-video"],
    includeGrade: !state.nodeFlow?.bypassed?.["ColorCorrector:finish"],
    includeTexture: !state.nodeFlow?.bypassed?.["GlowBlur:finish"],
    includedOverlayIds: allMergeIds,
    badge: "FINAL COMP",
  };
};

