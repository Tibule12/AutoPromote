import {
  createStudioNullRigLayer,
  defaultMotionDriverForProperty,
  isHiddenTrackMatteSource,
  removeStudioLayerSafely,
  reparentStudioLayerPreservingWorldPose,
  validateStudioTrackMattes,
} from "./studioCompRigging";
import { studioVectorUri, validateStudioVectorShape } from "./studioVectorShape";
import { PERSPECTIVE_LEFT, validateStudioPerspective } from "./studioPerspective";

export const FLOW_NODE_KINDS = {
  MediaIn: { label: "MediaIn", badge: "IN", color: "#38bdf8", icon: "▶" },
  Transform: { label: "Transform", badge: "XF", color: "#8b5cf6", icon: "✥" },
  ColorCorrector: { label: "ColorCorrector", badge: "CC", color: "#f59e0b", icon: "◐" },
  GlowBlur: { label: "GlowBlur", badge: "FX", color: "#ec4899", icon: "✦" },
  PolygonMask: { label: "PolygonMask", badge: "MSK", color: "#22d3ee", icon: "⬠" },
  ChromaKeyer: { label: "DeltaKeyer", badge: "KEY", color: "#14b8a6", icon: "◈" },
  CornerPin: { label: "CornerPin", badge: "PIN", color: "#f97316", icon: "◰" },
  CompoundMacro: { label: "MacroGroup", badge: "GRP", color: "#6366f1", icon: "❖" },
  NullRig: { label: "NullRig", badge: "RIG", color: "#a855f7", icon: "⊕" },
  Merge: { label: "Merge", badge: "MRG", color: "#10b981", icon: "⨂" },
  Adjustment: { label: "GradeNode", badge: "ADJ", color: "#fbbf24", icon: "◈" },
  SubjectMatte: { label: "SubjectMatte", badge: "MAT", color: "#2dd4bf", icon: "◉" },
  MediaOut: { label: "MediaOut", badge: "OUT", color: "#22d3ee", icon: "▣" },
};

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
    description: "Attach a feathered geometric & boolean mask stack to the selected layer",
  },
  {
    id: "add_chroma_keyer",
    kind: "ChromaKeyer",
    label: "Delta Keyer",
    accent: "#14b8a6",
    description: "Attach a Chroma / Luma / HSL Delta Keyer with Spill Suppression & Matte Choke",
  },
  {
    id: "add_corner_pin",
    kind: "CornerPin",
    label: "2.5D Corner Pin",
    accent: "#f97316",
    description: "Attach a 4-Corner Homography Perspective Pin node to the selected media plane",
  },
  {
    id: "add_glow_blur",
    kind: "GlowBlur",
    label: "Glow & Optical FX",
    accent: "#f472b6",
    description: "Enable luminous glow, halation, anamorphic streak & displacement warp",
  },
  {
    id: "add_adjustment_grade",
    kind: "Adjustment",
    label: "Adjustment Grade",
    accent: "#fbbf24",
    description: "Insert a timed adjustment grade node with optional Power Window Mask before MediaOut",
  },
  {
    id: "add_compound_macro",
    kind: "CompoundMacro",
    label: "Macro Pre-Comp",
    accent: "#6366f1",
    description: "Package active layers into a reusable Macro Group with published controls",
  },
];

export const FLOW_NODE_PALETTE = NODE_FLOW_PALETTE;

export const SMART_FLOW_RIGS = [
  {
    id: "null_callout_rig",
    label: "Null-Parented Callout Rig",
    badge: "RIG",
    summary: "Null controller with Inertial Spring driving a parented callout title & accent badge",
    description: "Null controller with Inertial Spring driving a parented callout title & accent badge",
  },
  {
    id: "alpha_matte_reveal",
    label: "Alpha Matte Title Stencil",
    badge: "MATTE",
    summary: "Gradient vector plate clipped live through a bold kinetic title Alpha Matte",
    description: "Gradient vector plate clipped live through a bold kinetic title Alpha Matte",
  },
  {
    id: "luma_spotlight_card",
    label: "Luma Glow Spotlight",
    badge: "LUMA",
    summary: "Screen-blended luminous glow plate shaped by a Luma Matte mask",
    description: "Screen-blended luminous glow plate shaped by a Luma Matte mask",
  },
  {
    id: "split_grade_glow",
    label: "Cinema Grade + Halation",
    badge: "GRADE",
    summary: "Precision color grade, film grain, subtle chromatic split & top adjustment node",
    description: "Precision color grade, film grain, subtle chromatic split & top adjustment node",
  },
  {
    id: "corner_pin_holo_rig",
    label: "2.5D Perspective Holo Screen",
    badge: "2.5D PIN",
    summary: "Null-driven 2.5D Corner-Pin holo screen with optical glow & spring overshoot",
    description: "Null-driven 2.5D Corner-Pin holo screen with optical glow & spring overshoot",
  },
  {
    id: "chroma_key_composite_rig",
    label: "Delta Keyer + Power Window",
    badge: "KEYER",
    summary: "Delta Keyer spill-suppressed composite with tracked polygon mask & cinema grade",
    description: "Delta Keyer spill-suppressed composite with tracked polygon mask & cinema grade",
  },
];

export const SMART_FLOW_RIG_PRESETS = SMART_FLOW_RIGS;

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

  const spineY = 88;
  let spineX = 36;

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
    removable: false,
    inputs: [],
    outputs: ["Out"],
    ...resolvePos(positions, mainMediaId, spineX, spineY),
  });
  spineX += 182;

  nodes.push({
    id: mainXfId,
    kind: "Transform",
    category: "transform",
    targetId: "main-video",
    label: "MainXf",
    subtitle: `Scale ${Number(state.mainTransform?.scale ?? 1).toFixed(2)}x`,
    accent: "#8b5cf6",
    bypassed: !!bypassed[mainXfId],
    removable: false,
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
  spineX += 182;

  const fx = state.finishFx || {};
  const rawContrast = Number(fx.contrast ?? 1);
  const contrastPct = rawContrast > 10 ? Math.round(rawContrast) : Math.round(rawContrast * 100);
  const finishMaskSource =
    fx.advancedColor?.maskSourceNodeId || state.advancedColor?.maskSourceNodeId || null;
  nodes.push({
    id: colorId,
    kind: "ColorCorrector",
    category: "color",
    targetId: "finish-color",
    label: "ColorGrade",
    subtitle:
      fx.preset && fx.preset !== "natural"
        ? String(fx.preset)
        : `Contrast ${contrastPct}%${finishMaskSource ? " · Masked" : ""}`,
    accent: "#f59e0b",
    bypassed: !!bypassed[colorId],
    removable: false,
    badge: finishMaskSource ? "MASKED" : null,
    inputs: ["In", "Mask"],
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
  spineX += 182;

  const rawGrain = Number(fx.filmGrain || 0);
  const rawChroma = Number(fx.chromaticAberration || 0);
  const grainDisplay = rawGrain > 1 ? Math.round(rawGrain) : Math.round(rawGrain * 100);
  const chromaDisplay = rawChroma > 1 ? Math.round(rawChroma) : Math.round(rawChroma * 100);
  nodes.push({
    id: textureId,
    kind: "GlowBlur",
    category: "fx",
    targetId: "finish-texture",
    label: "FinishFX",
    subtitle: `Grain ${grainDisplay} · Chroma ${chromaDisplay}`,
    accent: "#ec4899",
    bypassed: !!bypassed[textureId],
    removable: false,
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
  let adjustmentX = spineX + 182;
  (state.adjustmentLayers || []).forEach((adj, idx) => {
    const adjNodeId = `Adjustment:${adj.id || idx}`;
    nodes.push({
      id: adjNodeId,
      kind: "Adjustment",
      category: "color",
      targetId: String(adj.id || idx),
      label: adj.name || adj.label || `AdjGrade_${idx + 1}`,
      subtitle: `${adj.preset || "Contrast"} · ${Math.round(Number(adj.opacity ?? 1) * 100)}%${adj.maskSourceNodeId ? " · Masked" : ""}`,
      accent: "#fbbf24",
      bypassed: adj.enabled === false,
      removable: true,
      badge: adj.maskSourceNodeId || adj.mask?.enabled ? "MASKED" : null,
      inputs: ["In", "Mask"],
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
    adjustmentX += 188;
  });

  spineX = adjustmentX - 182;

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
      removable: false,
      inputs: ["In"],
      outputs: ["Out"],
      ...resolvePos(positions, subId, 218 + idx * 188, 6),
    });
    wires.push({
      id: `${mainMediaId}->${subId}`,
      fromNodeId: mainMediaId,
      fromPort: "Out",
      toNodeId: subId,
      toPort: "In",
    });
  });

  // 2. Null Rig & Compound Macro Controllers (positioned in upper rig lane)
  const nullLayers = orderedOverlays.filter(
    ov => ov.isNullRig && !ov.isMacroGroup && !ov.isCompoundMacro
  );
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
      bypassed: !!nullLayer.disabled || !!bypassed[nodeId],
      removable: true,
      badge: hasDrivers ? "DRV" : "RIG",
      inputs: ["Parent"],
      outputs: ["Out"],
      ...resolvePos(positions, nodeId, 400 + idx * 196, 6),
    });
  });

  const macroLayers = orderedOverlays.filter(ov => ov.isMacroGroup || ov.isCompoundMacro);
  macroLayers.forEach((macroLayer, idx) => {
    const nodeId = `CompoundMacro:${macroLayer.id}`;
    const memberCount = Array.isArray(macroLayer.macroMemberIds)
      ? macroLayer.macroMemberIds.length
      : Array.isArray(macroLayer.macroGroup?.memberIds)
        ? macroLayer.macroGroup.memberIds.length
        : orderedOverlays.filter(o => String(o.parentId) === String(macroLayer.id)).length;
    nodes.push({
      id: nodeId,
      kind: "CompoundMacro",
      category: "rig",
      targetId: String(macroLayer.id),
      label: macroLayer.name || `Macro_${idx + 1}`,
      subtitle: `Pre-Comp · ${memberCount} Layers`,
      accent: "#6366f1",
      bypassed: !!macroLayer.disabled || !!bypassed[nodeId],
      removable: true,
      badge: "MACRO",
      inputs: ["In", "Mask"],
      outputs: ["Out"],
      ...resolvePos(positions, nodeId, 580 + idx * 196, 6),
    });
  });

  // 3. Visual Overlay Branches & Spine Merges
  const nonNullOverlays = orderedOverlays.filter(
    ov => !ov.isNullRig && !ov.isMacroGroup && !ov.isCompoundMacro
  );
  let mergeIndex = 0;

  nonNullOverlays.forEach((ov, idx) => {
    const ovId = String(ov.id);
    const hiddenMatte = isHiddenTrackMatteSource(ov, orderedOverlays);
    const colX = spineX + 196 + mergeIndex * 212;
    const branchBaseY = hiddenMatte ? spineY + 80 : 6 + (idx % 2) * 10;

    const mediaNodeId = `MediaIn:${ovId}`;
    const xfNodeId = `Transform:${ovId}`;
    const hasDrivers = Boolean(
      ov.motionDrivers && Object.values(ov.motionDrivers).some(d => d && d.enabled !== false)
    );
    const hasKeys = (state.motionKeyframes || []).some(k => String(k?.targetId) === ovId);
    const hasExpr = Array.isArray(ov.parameterLinks) && ov.parameterLinks.some(l => l && l.enabled !== false);

    nodes.push({
      id: mediaNodeId,
      kind: "MediaIn",
      category: "source",
      targetId: ovId,
      label: (ov.name || ov.text || `${ov.type || "Layer"}_${idx + 1}`).slice(0, 18),
      subtitle: ov.vectorShape ? "Vector Shape" : ov.type === "text" ? "Title Gen" : `${ov.type || "Media"} In`,
      accent: ov.type === "text" ? "#22d3ee" : "#34d399",
      bypassed: !!ov.disabled,
      removable: true,
      badge: hiddenMatte ? "MATTE SRC" : ov.vectorShape ? "VEC" : ov.type === "text" ? "TXT" : "MED",
      inputs: [],
      outputs: ["Out"],
      ...resolvePos(positions, mediaNodeId, colX - 172, branchBaseY),
    });

    let branchUpstreamId = mediaNodeId;

    // Optional Chroma / Luma / HSL Delta Keyer node on branch
    const keyerNodeId = `ChromaKeyer:${ovId}`;
    const hasChromaKeyer = Boolean(
      ov.chromaKey?.enabled || (ov.chromaKey && bypassed[keyerNodeId])
    );
    if (hasChromaKeyer) {
      const keyMode = ov.chromaKey?.mode || "chroma";
      const spillPct = Math.round(Number(ov.chromaKey?.spillSuppression ?? 0.65) * 100);
      nodes.push({
        id: keyerNodeId,
        kind: "ChromaKeyer",
        category: "matte",
        targetId: ovId,
        label: "DeltaKeyer",
        subtitle: `${keyMode.toUpperCase()} · Spill ${spillPct}%`,
        accent: "#14b8a6",
        bypassed: Boolean(bypassed[keyerNodeId] || ov.chromaKey?.enabled === false),
        removable: true,
        badge: "KEY",
        inputs: ["In"],
        outputs: ["Out"],
        ...resolvePos(positions, keyerNodeId, colX - 128, branchBaseY - 36),
      });
      wires.push({
        id: `${branchUpstreamId}->${keyerNodeId}`,
        fromNodeId: branchUpstreamId,
        fromPort: "Out",
        toNodeId: keyerNodeId,
        toPort: "In",
      });
      branchUpstreamId = keyerNodeId;
    }

    const fxNodeId = `GlowBlur:${ovId}`;
    const hasLayerFx = Boolean(
      ov.glow?.enabled ||
        ov.layerShadow?.enabled ||
        Number(ov.blur || 0) > 0 ||
        Number(ov.opticalFx?.halation || 0) > 0 ||
        Number(ov.opticalFx?.displacementScale || 0) > 0 ||
        ((ov.glow || ov.layerShadow || ov.opticalFx) && bypassed[fxNodeId])
    );
    if (hasLayerFx) {
      const disp = Math.round(Number(ov.opticalFx?.displacementScale || 0));
      nodes.push({
        id: fxNodeId,
        kind: "GlowBlur",
        category: "fx",
        targetId: ovId,
        label: "LayerGlow",
        subtitle: `Glow ${ov.glow?.enabled ? "On" : "Off"} · Blur ${ov.blur || 0}${disp > 0 ? ` · Warp ${disp}` : ""}`,
        accent: "#f472b6",
        bypassed: Boolean(
          bypassed[fxNodeId] ||
            (!ov.glow?.enabled &&
              !ov.layerShadow?.enabled &&
              Number(ov.blur || 0) <= 0 &&
              Number(ov.opticalFx?.halation || 0) <= 0 &&
              Number(ov.opticalFx?.displacementScale || 0) <= 0)
        ),
        removable: true,
        inputs: ["In"],
        outputs: ["Out"],
        ...resolvePos(positions, fxNodeId, colX - 86, branchBaseY + (hiddenMatte ? -42 : 42)),
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
      subtitle: `${Math.round(Number(ov.x ?? 50))},${Math.round(Number(ov.y ?? 50))}% · ${Number(ov.scale ?? 1).toFixed(2)}x${Number(ov.zDepth || 0) !== 0 ? ` · Z${Math.round(Number(ov.zDepth))}` : ""}`,
      accent: "#8b5cf6",
      bypassed: !!bypassed[xfNodeId],
      removable: true,
      badge: hasExpr ? "EXPR" : hasDrivers ? "DRV" : hasKeys ? "KEY" : ov.parentId ? "PAR" : null,
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

    let branchMergeSourceId = xfNodeId;

    // Optional 2.5D Homography CornerPin node on branch
    const cornerPinNodeId = `CornerPin:${ovId}`;
    const hasCornerPin = Boolean(
      Array.isArray(ov.perspective?.corners) && ov.perspective.corners.length === 4
    );
    if (hasCornerPin) {
      const pinPct = Math.round(Number(ov.perspectiveProgress ?? 100));
      nodes.push({
        id: cornerPinNodeId,
        kind: "CornerPin",
        category: "transform",
        targetId: ovId,
        label: "CornerPin",
        subtitle: `Quad Pin · ${pinPct}%`,
        accent: "#f97316",
        bypassed: Boolean(bypassed[cornerPinNodeId] || Number(ov.perspectiveProgress ?? 100) <= 0),
        removable: true,
        badge: "2.5D",
        inputs: ["In"],
        outputs: ["Out"],
        ...resolvePos(positions, cornerPinNodeId, colX + 88, branchBaseY + 36),
      });
      wires.push({
        id: `${xfNodeId}->${cornerPinNodeId}`,
        fromNodeId: xfNodeId,
        fromPort: "Out",
        toNodeId: cornerPinNodeId,
        toPort: "In",
      });
      branchMergeSourceId = cornerPinNodeId;
    }

    const maskNodeId = `PolygonMask:${ovId}`;
    if (ov.mask?.enabled || (ov.mask && bypassed[maskNodeId])) {
      const subMaskCount = Array.isArray(ov.mask?.secondaryMasks) ? ov.mask.secondaryMasks.length : 0;
      nodes.push({
        id: maskNodeId,
        kind: "PolygonMask",
        category: "matte",
        targetId: ovId,
        label: ov.mask.shape === "ellipse" ? "EllipseMask" : ov.mask.shape === "polygon" ? "PolyMask" : "RectMask",
        subtitle: `Feather ${ov.mask.feather || 0}px${ov.mask.inverted ? " · Inv" : ""}${subMaskCount > 0 ? ` · +${subMaskCount} Bool` : ""}`,
        accent: "#22d3ee",
        bypassed: Boolean(bypassed[maskNodeId] || ov.mask.enabled === false),
        removable: true,
        badge: subMaskCount > 0 ? "BOOL" : null,
        inputs: [],
        outputs: ["Out"],
        ...resolvePos(positions, maskNodeId, colX - 172, branchBaseY + (hiddenMatte ? 78 : 78)),
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
        bypassed: !!ov.disabled || !!bypassed[mergeNodeId],
        removable: true,
        badge: ov.trackMatte?.mode && ov.trackMatte.mode !== "none" ? "MATTE" : null,
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
        id: `${branchMergeSourceId}->${mergeNodeId}:FG`,
        fromNodeId: branchMergeSourceId,
        fromPort: "Out",
        toNodeId: mergeNodeId,
        toPort: "FG",
      });
      currentSpineId = mergeNodeId;
      mergeIndex += 1;
    }
  });

  // Wire Parent connections, Track Matte Mask connections & Masked Grade connections
  const nodeIds = new Set(nodes.map(n => n.id));
  if (finishMaskSource && nodeIds.has(finishMaskSource)) {
    wires.push({
      id: `${finishMaskSource}->${colorId}:Mask`,
      fromNodeId: finishMaskSource,
      fromPort: "Out",
      toNodeId: colorId,
      toPort: "Mask",
      removable: true,
    });
  }
  (state.adjustmentLayers || []).forEach((adj, idx) => {
    const adjNodeId = `Adjustment:${adj.id || idx}`;
    if (adj.maskSourceNodeId && nodeIds.has(adj.maskSourceNodeId) && nodeIds.has(adjNodeId)) {
      wires.push({
        id: `${adj.maskSourceNodeId}->${adjNodeId}:Mask`,
        fromNodeId: adj.maskSourceNodeId,
        fromPort: "Out",
        toNodeId: adjNodeId,
        toPort: "Mask",
        removable: true,
      });
    }
  });

  orderedOverlays.forEach(ov => {
    const ovId = String(ov.id);
    if (ov.parentId) {
      const parentSourceId =
        ov.parentId === "main-video"
          ? mainXfId
          : nodeIds.has(`CompoundMacro:${ov.parentId}`)
            ? `CompoundMacro:${ov.parentId}`
            : nodeIds.has(`NullRig:${ov.parentId}`)
              ? `NullRig:${ov.parentId}`
              : `Transform:${ov.parentId}`;
      const childTargetId = ov.isMacroGroup
        ? `CompoundMacro:${ovId}`
        : ov.isNullRig
          ? `NullRig:${ovId}`
          : `Transform:${ovId}`;
      if (nodeIds.has(parentSourceId) && nodeIds.has(childTargetId)) {
        wires.push({
          id: `${parentSourceId}->${childTargetId}:Parent`,
          fromNodeId: parentSourceId,
          fromPort: "Out",
          toNodeId: childTargetId,
          toPort: "Parent",
          removable: true,
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
          removable: true,
        });
      }
    }
  });

  const outX = spineX + 196 + mergeIndex * 212;
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
    removable: false,
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
  const selectedNodeId =
    flow.selectedNodeId && viewerNodeIds.has(flow.selectedNodeId)
      ? flow.selectedNodeId
      : "MediaOut";

  const normalizedNodes = nodes.map(node => ({
    ...node,
    bypassable: Boolean(node.kind !== "MediaOut" && node.id !== "MediaIn:main-video"),
    ports: {
      in: Array.isArray(node.inputs) ? node.inputs : [],
      out: Array.isArray(node.outputs) ? node.outputs : [],
    },
  }));

  const normalizedWires = wires.map(wire => {
    const kind =
      wire.toPort === "Parent"
        ? "Parent"
        : wire.toPort === "Mask"
          ? "Mask"
          : wire.toPort === "FG"
            ? "FG"
            : wire.toNodeId?.startsWith("Transform:") || wire.toNodeId?.startsWith("GlowBlur:")
              ? "Branch"
              : "Spine";
    return {
      ...wire,
      from: wire.fromNodeId,
      to: wire.toNodeId,
      kind,
      label:
        wire.label ||
        (wire.toPort === "Parent"
          ? "Parent"
          : wire.toPort === "Mask"
            ? "Mask"
            : null),
      removable: Boolean(wire.removable || wire.toPort === "Parent" || wire.toPort === "Mask"),
    };
  });

  return {
    nodes: normalizedNodes,
    wires: normalizedWires,
    viewerA,
    viewerB,
    selectedNodeId,
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
  const adjustmentLayers = [...(state.adjustmentLayers || [])];
  const finishFx = state.finishFx && typeof state.finishFx === "object" ? state.finishFx : {};
  const fromLayerId = extractLayerId(fromNodeId);
  const toLayerId = extractLayerId(toNodeId);

  // Case 1: Wiring into a Transform / NullRig / CompoundMacro Parent port -> Pick-Whip Parenting!
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

  // Case 3b: Wiring a Mask / Matte / ChromaKeyer into ColorCorrector:finish.Mask -> Masked Primary Grade!
  if (toNodeId === "ColorCorrector:finish" && toPort === "Mask" && fromNodeId) {
    const nextAdvancedColor = {
      ...(finishFx.advancedColor && typeof finishFx.advancedColor === "object"
        ? finishFx.advancedColor
        : state.advancedColor && typeof state.advancedColor === "object"
          ? state.advancedColor
          : {}),
      maskSourceNodeId: fromNodeId,
      powerWindow: {
        ...(finishFx.advancedColor?.powerWindow || state.advancedColor?.powerWindow || {}),
        enabled: true,
        shape: "ellipse",
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.36,
        radiusY: 0.36,
        feather: 0.22,
      },
    };
    return {
      ...state,
      advancedColor: nextAdvancedColor,
      finishFx: {
        ...finishFx,
        advancedColor: nextAdvancedColor,
        maskSourceNodeId: fromNodeId,
      },
    };
  }

  // Case 3c: Wiring a Mask / Matte / ChromaKeyer into Adjustment:<id>.Mask -> Masked Adjustment Grade!
  if (toNodeId?.startsWith("Adjustment:") && toPort === "Mask" && toLayerId && fromNodeId) {
    return {
      ...state,
      adjustmentLayers: adjustmentLayers.map(adj =>
        String(adj.id) === String(toLayerId)
          ? {
              ...adj,
              maskSourceNodeId: fromNodeId,
              mask: {
                shape: "ellipse",
                feather: 14,
                inverted: false,
                ...(adj.mask || {}),
                enabled: true,
              },
            }
          : adj
      ),
    };
  }

  // Case 3d: Wiring a Mask into CompoundMacro:<id>.Mask
  if (toNodeId?.startsWith("CompoundMacro:") && toPort === "Mask" && toLayerId) {
    return {
      ...state,
      overlays: overlays.map(item =>
        String(item.id) === String(toLayerId)
          ? {
              ...item,
              mask: {
                shape: "ellipse",
                radius: 12,
                feather: 10,
                inverted: false,
                ...(item.mask || {}),
                enabled: true,
              },
            }
          : item
      ),
    };
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
  const adjustmentLayers = [...(state.adjustmentLayers || [])];
  const finishFx = state.finishFx && typeof state.finishFx === "object" ? state.finishFx : {};
  const toLayerId = extractLayerId(toNodeId);

  if (toNodeId === "ColorCorrector:finish" && toPort === "Mask") {
    const nextAdvancedColor = {
      ...(finishFx.advancedColor && typeof finishFx.advancedColor === "object"
        ? finishFx.advancedColor
        : state.advancedColor && typeof state.advancedColor === "object"
          ? state.advancedColor
          : {}),
      maskSourceNodeId: null,
    };
    return {
      ...state,
      advancedColor: nextAdvancedColor,
      finishFx: {
        ...finishFx,
        advancedColor: nextAdvancedColor,
        maskSourceNodeId: null,
      },
    };
  }

  if (toNodeId?.startsWith("Adjustment:") && toPort === "Mask" && toLayerId) {
    return {
      ...state,
      adjustmentLayers: adjustmentLayers.map(adj =>
        String(adj.id) === String(toLayerId)
          ? {
              ...adj,
              maskSourceNodeId: null,
              mask: adj.mask ? { ...adj.mask, enabled: false } : undefined,
            }
          : adj
      ),
    };
  }

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

  if ((toNodeId?.startsWith("Transform:") || toNodeId?.startsWith("CompoundMacro:")) && toPort === "Mask") {
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

export const toggleNodeFlowBypass = (state, nodeId) => {
  if (!nodeId || nodeId === "MediaOut" || nodeId === "MediaIn:main-video") return state;
  const overlays = [...(state.overlays || [])];
  const adjustmentLayers = [...(state.adjustmentLayers || [])];
  const nodeFlow = state.nodeFlow && typeof state.nodeFlow === "object" ? state.nodeFlow : {};
  const bypassedMap = { ...(nodeFlow.bypassed || {}) };
  const targetId = extractLayerId(nodeId);

  if (nodeId.startsWith("Adjustment:") && targetId) {
    const adj = adjustmentLayers.find(a => String(a.id) === String(targetId));
    const nextEnabled = adj ? adj.enabled === false : false;
    bypassedMap[nodeId] = !nextEnabled;
    return {
      ...state,
      adjustmentLayers: adjustmentLayers.map(a =>
        String(a.id) === String(targetId) ? { ...a, enabled: nextEnabled } : a
      ),
      nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
    };
  }

  if (nodeId.startsWith("PolygonMask:") && targetId) {
    const ov = overlays.find(o => String(o.id) === String(targetId));
    const currentlyBypassed = Boolean(bypassedMap[nodeId] || ov?.mask?.enabled === false);
    const nextBypassed = !currentlyBypassed;
    bypassedMap[nodeId] = nextBypassed;
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? { ...o, mask: { ...(o.mask || { shape: "ellipse", feather: 8, radius: 10 }), enabled: !nextBypassed } }
          : o
      ),
      nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
    };
  }

  if (nodeId.startsWith("ChromaKeyer:") && targetId) {
    const ov = overlays.find(o => String(o.id) === String(targetId));
    const currentlyBypassed = Boolean(bypassedMap[nodeId] || ov?.chromaKey?.enabled === false);
    const nextBypassed = !currentlyBypassed;
    bypassedMap[nodeId] = nextBypassed;
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? {
              ...o,
              chromaKey: {
                mode: "chroma",
                keyColor: "#00d455",
                similarity: 0.32,
                smoothness: 0.14,
                spillSuppression: 0.45,
                ...(o.chromaKey || {}),
                enabled: !nextBypassed,
              },
            }
          : o
      ),
      nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
    };
  }

  if (nodeId.startsWith("CornerPin:") && targetId) {
    const nextBypassed = !bypassedMap[nodeId];
    bypassedMap[nodeId] = nextBypassed;
    return {
      ...state,
      nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
    };
  }

  if (nodeId.startsWith("GlowBlur:") && nodeId !== "GlowBlur:finish" && targetId) {
    const ov = overlays.find(o => String(o.id) === String(targetId));
    const currentlyBypassed = Boolean(
      bypassedMap[nodeId] || (ov?.glow?.enabled === false && ov?.layerShadow?.enabled === false)
    );
    const nextBypassed = !currentlyBypassed;
    bypassedMap[nodeId] = nextBypassed;
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? {
              ...o,
              glow: o.glow ? { ...o.glow, enabled: !nextBypassed } : o.glow,
              layerShadow: o.layerShadow ? { ...o.layerShadow, enabled: !nextBypassed } : o.layerShadow,
            }
          : o
      ),
      nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
    };
  }

  if ((nodeId.startsWith("Merge:") || nodeId.startsWith("MediaIn:") || nodeId.startsWith("CompoundMacro:")) && targetId) {
    const ov = overlays.find(o => String(o.id) === String(targetId));
    const currentlyBypassed = Boolean(bypassedMap[nodeId] || ov?.hidden || Number(ov?.opacity ?? 1) <= 0.01);
    const nextBypassed = !currentlyBypassed;
    bypassedMap[nodeId] = nextBypassed;
    return {
      ...state,
      overlays: overlays.map(o => {
        if (String(o.id) !== String(targetId)) return o;
        const restoredOpacity = Number(o._prevOpacity) > 0.05 ? Number(o._prevOpacity) : 1;
        return {
          ...o,
          hidden: nextBypassed,
          _prevOpacity: nextBypassed ? Number(o.opacity ?? 1) : o._prevOpacity,
          opacity: nextBypassed ? 0 : restoredOpacity,
        };
      }),
      nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
    };
  }

  bypassedMap[nodeId] = !bypassedMap[nodeId];
  return {
    ...state,
    nodeFlow: { ...nodeFlow, bypassed: bypassedMap },
  };
};

export const deleteNodeFromFlow = (state, nodeId, currentTime = 0) => {
  if (!nodeId || nodeId === "MediaOut" || nodeId === "MediaIn:main-video" || nodeId === "Transform:main-video") {
    return state;
  }
  const overlays = [...(state.overlays || [])];
  const adjustmentLayers = [...(state.adjustmentLayers || [])];
  const nodeFlow = state.nodeFlow && typeof state.nodeFlow === "object" ? state.nodeFlow : {};
  const targetId = extractLayerId(nodeId);

  if (nodeId.startsWith("Adjustment:") && targetId) {
    const nextAdj = adjustmentLayers.filter(a => String(a.id) !== String(targetId));
    const nextPositions = { ...(nodeFlow.positions || {}) };
    const nextBypassed = { ...(nodeFlow.bypassed || {}) };
    delete nextPositions[nodeId];
    delete nextBypassed[nodeId];
    return {
      ...state,
      adjustmentLayers: nextAdj,
      nodeFlow: {
        ...nodeFlow,
        positions: nextPositions,
        bypassed: nextBypassed,
      },
      selectNodeId: "MediaOut",
    };
  }

  if (nodeId.startsWith("PolygonMask:") && targetId) {
    const nextPositions = { ...(nodeFlow.positions || {}) };
    const nextBypassed = { ...(nodeFlow.bypassed || {}) };
    delete nextPositions[nodeId];
    delete nextBypassed[nodeId];
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? { ...o, mask: undefined }
          : o
      ),
      nodeFlow: {
        ...nodeFlow,
        positions: nextPositions,
        bypassed: nextBypassed,
      },
      selectNodeId: `Transform:${targetId}`,
    };
  }

  if (nodeId.startsWith("ChromaKeyer:") && targetId) {
    const nextPositions = { ...(nodeFlow.positions || {}) };
    const nextBypassed = { ...(nodeFlow.bypassed || {}) };
    delete nextPositions[nodeId];
    delete nextBypassed[nodeId];
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? { ...o, chromaKey: undefined }
          : o
      ),
      nodeFlow: {
        ...nodeFlow,
        positions: nextPositions,
        bypassed: nextBypassed,
      },
      selectNodeId: `Transform:${targetId}`,
    };
  }

  if (nodeId.startsWith("CornerPin:") && targetId) {
    const nextPositions = { ...(nodeFlow.positions || {}) };
    const nextBypassed = { ...(nodeFlow.bypassed || {}) };
    delete nextPositions[nodeId];
    delete nextBypassed[nodeId];
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? { ...o, perspective: undefined, cornerKeys: undefined, perspectiveProgress: undefined }
          : o
      ),
      nodeFlow: {
        ...nodeFlow,
        positions: nextPositions,
        bypassed: nextBypassed,
      },
      selectNodeId: `Transform:${targetId}`,
    };
  }

  if (nodeId.startsWith("GlowBlur:") && nodeId !== "GlowBlur:finish" && targetId) {
    const nextPositions = { ...(nodeFlow.positions || {}) };
    const nextBypassed = { ...(nodeFlow.bypassed || {}) };
    delete nextPositions[nodeId];
    delete nextBypassed[nodeId];
    return {
      ...state,
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? {
              ...o,
              blur: 0,
              glow: undefined,
              layerShadow: undefined,
              opticalFx: undefined,
              displacementWarp: undefined,
            }
          : o
      ),
      nodeFlow: {
        ...nodeFlow,
        positions: nextPositions,
        bypassed: nextBypassed,
      },
      selectNodeId: `Transform:${targetId}`,
    };
  }

  if (
    (nodeId.startsWith("NullRig:") ||
      nodeId.startsWith("CompoundMacro:") ||
      nodeId.startsWith("MediaIn:") ||
      nodeId.startsWith("Transform:") ||
      nodeId.startsWith("Merge:")) &&
    targetId &&
    targetId !== "main-video"
  ) {
    const cleaned = removeStudioLayerSafely(state, targetId, currentTime);
    const nextPositions = { ...(nodeFlow.positions || {}) };
    const nextBypassed = { ...(nodeFlow.bypassed || {}) };
    for (const key of Object.keys(nextPositions)) {
      if (key.endsWith(`:${targetId}`)) delete nextPositions[key];
    }
    for (const key of Object.keys(nextBypassed)) {
      if (key.endsWith(`:${targetId}`)) delete nextBypassed[key];
    }
    return {
      ...state,
      ...cleaned,
      nodeFlow: {
        ...nodeFlow,
        positions: nextPositions,
        bypassed: nextBypassed,
      },
      selectNodeId: "MediaOut",
    };
  }

  return state;
};

export const computeNodeFlowBounds = (nodes = []) => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 960, maxY: 260, width: 960, height: 260 };
  }
  const NODE_W = 166;
  const NODE_H = 82;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach(node => {
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + NODE_W > maxX) maxX = x + NODE_W;
    if (y + NODE_H > maxY) maxY = y + NODE_H;
  });
  return {
    minX: Math.max(0, minX - 16),
    minY: Math.max(0, minY - 12),
    maxX: maxX + 24,
    maxY: maxY + 18,
    width: Math.max(320, maxX - Math.min(0, minX) + 40),
    height: Math.max(180, maxY - Math.min(0, minY) + 30),
  };
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
    return { overlays: [...overlays, nullLayer], selectOverlayId: nullLayer.id, selectNodeId: `NullRig:${nullLayer.id}` };
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
    return { overlays: [...overlays, titleLayer], selectOverlayId: titleLayer.id, selectNodeId: `MediaIn:${titleLayer.id}` };
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
    return { overlays: [...overlays, vecLayer], selectOverlayId: vecLayer.id, selectNodeId: `MediaIn:${vecLayer.id}` };
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
                booleanMode: o.mask?.booleanMode || "add",
                secondaryMasks: Array.isArray(o.mask?.secondaryMasks) ? o.mask.secondaryMasks : [],
              },
            }
          : o
      ),
      selectOverlayId: targetId,
      selectNodeId: `PolygonMask:${targetId}`,
    };
  }

  if (paletteId === "add_chroma_keyer") {
    const targetId = activeOverlayId || overlays.find(o => o && !o.isCaption && !o.isNullRig)?.id;
    if (!targetId) return null;
    return {
      overlays: overlays.map(o =>
        String(o.id) === String(targetId)
          ? {
              ...o,
              chromaKey: {
                enabled: true,
                mode: "chroma",
                keyColor: "#00d455",
                similarity: 0.32,
                smoothness: 0.14,
                spillSuppression: 0.48,
                choke: 0,
                despillTint: 0.12,
                invert: false,
                ...(o.chromaKey || {}),
              },
            }
          : o
      ),
      selectOverlayId: targetId,
      selectNodeId: `ChromaKeyer:${targetId}`,
    };
  }

  if (paletteId === "add_corner_pin") {
    const defaultPerspective = validateStudioPerspective({
      version: 1,
      corners: PERSPECTIVE_LEFT.map(pt => [...pt]),
    });
    const targetId = activeOverlayId || overlays.find(o => o && !o.isCaption && !o.isNullRig)?.id;
    if (targetId) {
      return {
        overlays: overlays.map(o =>
          String(o.id) === String(targetId)
            ? {
                ...o,
                perspective: o.perspective || defaultPerspective,
                perspectiveProgress: Number.isFinite(Number(o.perspectiveProgress))
                  ? Number(o.perspectiveProgress)
                  : 1,
              }
            : o
        ),
        selectOverlayId: targetId,
        selectNodeId: `CornerPin:${targetId}`,
      };
    }
    const holoLayer = {
      id: `flow-pin-${stamp}`,
      name: "Holo Screen Plane",
      type: "image",
      src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' rx='24' fill='%230f172a' stroke='%2338bdf8' stroke-width='6'/%3E%3C/svg%3E",
      x: 50,
      y: 48,
      width: 56,
      height: 32,
      scale: 1,
      rotation: 0,
      opacity: 0.96,
      blendMode: "normal",
      perspective: defaultPerspective,
      perspectiveProgress: 1,
      startTime: cueStart,
      duration: cueDur,
    };
    return {
      overlays: [...overlays, holoLayer],
      selectOverlayId: holoLayer.id,
      selectNodeId: `CornerPin:${holoLayer.id}`,
    };
  }

  if (paletteId === "add_compound_macro") {
    const memberIds = overlays
      .filter(o => o && !o.isCaption && !o.isNullRig && !o.isCompoundMacro)
      .slice(0, 3)
      .map(o => String(o.id));
    const macroId = `macro-${stamp}`;
    const macroLayer = {
      ...createStudioNullRigLayer({
        id: macroId,
        name: `Macro Group ${overlays.filter(o => o?.isCompoundMacro).length + 1}`,
        startTime: cueStart,
        duration: cueDur,
        x: 50,
        y: 50,
      }),
      isCompoundMacro: true,
      macroGroup: {
        id: macroId,
        memberIds,
        collapsed: false,
        publishedControls: {
          macroScale: 1,
          macroOpacity: 1,
          macroGlowBoost: 0.4,
          macroBlendMode: "normal",
        },
      },
    };
    const nextOverlays = overlays.map(o =>
      memberIds.includes(String(o.id)) && !o.parentId
        ? { ...o, parentId: macroId }
        : o
    );
    return {
      overlays: [...nextOverlays, macroLayer],
      selectOverlayId: macroId,
      selectNodeId: `CompoundMacro:${macroId}`,
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
              opticalFx: {
                halation: 0.28,
                anamorphicStreak: 0.22,
                chromaticSplit: 0.14,
                ...(o.opticalFx || {}),
              },
              displacementWarp: {
                enabled: false,
                amountX: 8,
                amountY: 6,
                frequency: 2.2,
                ...(o.displacementWarp || {}),
              },
            }
          : o
      ),
      selectOverlayId: targetId,
      selectNodeId: `GlowBlur:${targetId}`,
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
      finishFx: { contrast: 1.12, saturation: 1.08, vignette: 0.18 },
    };
    return { adjustmentLayers: [...adjustmentLayers, adj], selectNodeId: `Adjustment:${adj.id}` };
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
      selectNodeId: `NullRig:${nullId}`,
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
      selectNodeId: `Merge:${gradientFill.id}`,
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
      selectNodeId: `Merge:${glowFill.id}`,
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
      finishFx: { contrast: 1.14, saturation: 1.06, vignette: 0.22 },
    };
    return {
      finishFx: {
        ...finishFx,
        contrast: Math.max(1.08, Number(finishFx.contrast || 1)),
        saturation: Math.max(1.06, Number(finishFx.saturation || 1)),
        temperature: Math.min(1, Number(finishFx.temperature || 0) + 0.12),
        vignette: Math.max(0.18, Number(finishFx.vignette || 0)),
        filmGrain: Math.max(0.12, Number(finishFx.filmGrain || 0)),
        chromaticAberration: Math.max(0.04, Number(finishFx.chromaticAberration || 0)),
      },
      adjustmentLayers: [...adjustmentLayers, adj],
      selectNodeId: `Adjustment:${adj.id}`,
    };
  }

  if (rigId === "corner_pin_holo_rig") {
    const nullId = `holo-null-${stamp}`;
    const holoNull = {
      ...createStudioNullRigLayer({
        id: nullId,
        name: "Holo Camera Null",
        startTime: cueStart,
        duration: cueDur,
        x: 50,
        y: 46,
      }),
      zDepth: -18,
      motionDrivers: {
        y: { type: "wiggle", enabled: true, frequencyHz: 0.9, amplitude: 1.2, octaves: 2, seed: 41 },
      },
    };
    const defaultPerspective = validateStudioPerspective({
      version: 1,
      corners: PERSPECTIVE_LEFT.map(pt => [...pt]),
    });
    const holoScreen = {
      id: `holo-screen-${stamp}`,
      name: "2.5D Holo Screen",
      type: "image",
      src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' rx='22' fill='%230b132b' stroke='%2322d3ee' stroke-width='6'/%3E%3C/svg%3E",
      parentId: nullId,
      x: 50,
      y: 48,
      width: 62,
      height: 36,
      scale: 1,
      rotation: 0,
      opacity: 0.94,
      blendMode: "screen",
      perspective: defaultPerspective,
      perspectiveProgress: 1,
      glow: { enabled: true, color: "#22d3ee", radius: 22, intensity: 0.82 },
      opticalFx: { halation: 0.34, anamorphicStreak: 0.28, chromaticSplit: 0.12 },
      startTime: cueStart,
      duration: cueDur,
    };
    return {
      overlays: [...overlays, holoNull, holoScreen],
      selectOverlayId: holoScreen.id,
      selectNodeId: `CornerPin:${holoScreen.id}`,
    };
  }

  if (rigId === "chroma_key_composite_rig") {
    const keyPlate = {
      id: `key-plate-${stamp}`,
      name: "Keyed Foreground Plate",
      type: "image",
      src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect width='512' height='512' fill='%2300d455'/%3E%3Ccircle cx='256' cy='256' r='168' fill='%23f8fafc'/%3E%3C/svg%3E",
      x: 50,
      y: 52,
      width: 54,
      height: 54,
      scale: 1,
      rotation: 0,
      opacity: 1,
      blendMode: "normal",
      chromaKey: {
        enabled: true,
        mode: "chroma",
        keyColor: "#00d455",
        similarity: 0.34,
        smoothness: 0.14,
        spillSuppression: 0.58,
        choke: -1,
        despillTint: 0.15,
        invert: false,
      },
      glow: { enabled: true, color: "#38bdf8", radius: 14, intensity: 0.45 },
      startTime: cueStart,
      duration: cueDur,
    };
    return {
      overlays: [...overlays, keyPlate],
      selectOverlayId: keyPlate.id,
      selectNodeId: `ChromaKeyer:${keyPlate.id}`,
    };
  }

  return null;
};

export const evaluateParameterLinks = (overlays = [], mainTransform = null) => {
  if (!Array.isArray(overlays) || overlays.length === 0) return overlays;
  const byId = new Map(overlays.map(item => [String(item.id), item]));
  if (mainTransform && typeof mainTransform === "object") {
    byId.set("main-video", { id: "main-video", ...mainTransform });
  }
  return overlays.map(item => {
    const links = item?.parameterLinks && typeof item.parameterLinks === "object" ? item.parameterLinks : null;
    if (!links) return item;
    let patched = null;
    for (const [targetProp, spec] of Object.entries(links)) {
      if (!spec || spec.enabled === false || !spec.sourceLayerId || !spec.sourceProperty) continue;
      const sourceLayer = byId.get(String(spec.sourceLayerId));
      if (!sourceLayer) continue;
      const rawVal = Number(sourceLayer[spec.sourceProperty]);
      if (!Number.isFinite(rawVal)) continue;
      const mult = Number.isFinite(Number(spec.multiplier)) ? Number(spec.multiplier) : 1;
      const offset = Number.isFinite(Number(spec.offset)) ? Number(spec.offset) : 0;
      const evaluated = rawVal * mult + offset;
      patched = patched || { ...item };
      patched[targetProp] = Number(evaluated.toFixed(3));
    }
    return patched || item;
  });
};

export const spliceNodeIntoWire = (
  state,
  {
    paletteId,
    wire,
    currentTime = 0,
    programmeDuration = 8,
  } = {}
) => {
  if (!state || !paletteId) return state;
  const targetLayerId =
    extractLayerId(wire?.fromNodeId) ||
    extractLayerId(wire?.toNodeId) ||
    state.activeOverlayId ||
    state.overlays?.find(o => o && !o.isCaption && !o.isNullRig)?.id ||
    null;
  const result = createNodePaletteAddition(paletteId, {
    overlays: state.overlays || [],
    adjustmentLayers: state.adjustmentLayers || [],
    activeOverlayId: targetLayerId,
    currentTime,
    programmeDuration,
  });
  if (!result) return state;
  return {
    ...state,
    ...(result.overlays ? { overlays: result.overlays } : {}),
    ...(result.adjustmentLayers ? { adjustmentLayers: result.adjustmentLayers } : {}),
    ...(result.selectOverlayId ? { activeOverlayId: result.selectOverlayId } : {}),
    ...(result.selectNodeId ? { selectNodeId: result.selectNodeId } : {}),
  };
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

  if (node.id.startsWith("Adjustment:")) {
    const adjId = extractLayerId(node.id);
    const allMergeIds = graph.nodes.filter(n => n.kind === "Merge" && !n.bypassed).map(n => n.targetId);
    return {
      nodeId: node.id,
      label: node.label,
      stage: "adjustment_grade",
      includeMainTransform: true,
      includeGrade: true,
      includeTexture: true,
      adjustmentId: adjId,
      includedOverlayIds: allMergeIds,
      badge: "ADJ GRADE",
    };
  }

  if (node.id.startsWith("SubjectMatte:")) {
    return {
      nodeId: node.id,
      label: node.label,
      stage: "subject_matte",
      includeMainTransform: true,
      includeGrade: true,
      includeTexture: false,
      includedOverlayIds: [],
      badge: "SUBJECT MATTE",
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
    node.id.startsWith("ChromaKeyer:") ||
    node.id.startsWith("CornerPin:") ||
    node.id.startsWith("GlowBlur:") ||
    node.id.startsWith("PolygonMask:") ||
    node.id.startsWith("NullRig:") ||
    node.id.startsWith("CompoundMacro:")
  ) {
    const layerId = extractLayerId(node.id);
    const badge =
      node.kind === "NullRig"
        ? "RIG GIZMO"
        : node.kind === "CompoundMacro"
          ? "MACRO GROUP"
          : node.kind === "ChromaKeyer"
            ? "KEYED MATTE"
            : node.kind === "CornerPin"
              ? "2.5D HOMOGRAPHY"
              : "BRANCH SOLO";
    return {
      nodeId: node.id,
      label: node.label,
      stage:
        node.id.startsWith("PolygonMask:") || node.id.startsWith("ChromaKeyer:")
          ? "matte_alpha"
          : "layer_isolated",
      includeMainTransform: false,
      includeGrade: false,
      includeTexture: false,
      isolatedLayerId: layerId,
      includedOverlayIds: layerId ? [layerId] : [],
      badge,
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


