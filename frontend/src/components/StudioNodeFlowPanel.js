import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FLOW_NODE_KINDS,
  FLOW_NODE_PALETTE,
  SMART_FLOW_RIG_PRESETS,
  buildSmartFlowRigState,
  computeNodeFlowBounds,
  connectNodeFlowPorts,
  createNodePaletteAddition,
  deleteNodeFromFlow,
  deriveNodeFlowGraph,
  describeNodeViewerSignal,
  disconnectNodeFlowPort,
  toggleNodeFlowBypass,
} from "./studioNodeFlow";
import {
  defaultMotionDriverForProperty,
  reparentStudioLayerPreservingWorldPose,
  validateStudioTrackMattes,
} from "./studioCompRigging";
import {
  replaceStudioVectorContour,
  splitStudioVectorSegment,
  studioVectorContour,
  studioVectorUri,
  validateStudioVectorShape,
} from "./studioVectorShape";
import {
  DEFAULT_STUDIO_MASK_POLYGON,
  parseStudioMaskPolygon,
  studioMaskPolygonPath,
  validateStudioMaskAnimation,
} from "./studioMaskGeometry";
import { CINEMATIC_PRESETS } from "../hooks/useCinematicEffects";
import {
  CINEMA_3D_LUT_PRESETS,
  buildProceduralColorCube,
  parseColorCube,
} from "./studioColorCube";
import {
  SKIN_TONE_LINE_ANGLE_DEG,
  computeLiveGradeScopes,
} from "./studioColorScopes";
import {
  buildBeatSyncedGradePulses,
  interpolateFinishKeyframes,
  normalizeFinishKeyframes,
  upsertFinishKeyframe,
} from "./studioFinishKeyframes";
import { upsertAutomationKeyframe } from "./studioAutomation";
import StudioVectorPathEditor from "./StudioVectorPathEditor";
import StudioSourceGradeViewer from "./StudioSourceGradeViewer";
import StudioAdjustmentControls from "./StudioAdjustmentControls";
import "./StudioMotionFlow.css";

const NODE_WIDTH = 166;

const PORT_OFFSETS = {
  in: {
    In: { x: 0, y: 38 },
    BG: { x: 0, y: 28 },
    FG: { x: 0, y: 54 },
    Mask: { x: 83, y: 0 },
    Parent: { x: 126, y: 0 },
  },
  out: {
    Out: { x: NODE_WIDTH, y: 38 },
    Link: { x: NODE_WIDTH, y: 38 },
  },
};

const getPortCoords = (node, side, portName) => {
  if (!node) return { x: 0, y: 0 };
  const sideMap = PORT_OFFSETS[side] || PORT_OFFSETS.out;
  const offset = sideMap[portName] || { x: side === "in" ? 0 : NODE_WIDTH, y: 38 };
  return {
    x: (Number(node.x) || 0) + offset.x,
    y: (Number(node.y) || 0) + offset.y,
  };
};

const buildCubicWirePath = (fromPt, toPt, kind) => {
  if (kind === "Parent" || kind === "Mask") {
    const midY = (fromPt.y + toPt.y) * 0.5;
    return `M ${fromPt.x} ${fromPt.y} C ${fromPt.x + 36} ${fromPt.y}, ${toPt.x} ${midY - 28}, ${toPt.x} ${toPt.y}`;
  }
  const dx = Math.max(44, Math.abs(toPt.x - fromPt.x) * 0.45);
  return `M ${fromPt.x} ${fromPt.y} C ${fromPt.x + dx} ${fromPt.y}, ${toPt.x - dx} ${toPt.y}, ${toPt.x} ${toPt.y}`;
};

const WIRE_COLORS = {
  Spine: "#3b82f6",
  FG: "#10b981",
  Branch: "#22d3ee",
  Mask: "#a855f7",
  Parent: "#f59e0b",
};

const isPortCompatibleWithPending = (pendingWire, targetNode, inPort) => {
  if (!pendingWire || !targetNode || pendingWire.fromNodeId === targetNode.id) return false;
  if (inPort === "Parent") {
    return (
      (targetNode.kind === "Transform" || targetNode.kind === "NullRig") &&
      targetNode.id !== "Transform:main-video" &&
      (pendingWire.fromNodeId.startsWith("NullRig:") ||
        pendingWire.fromNodeId.startsWith("Transform:") ||
        pendingWire.fromNodeId.startsWith("Merge:"))
    );
  }
  if (inPort === "Mask") {
    if (targetNode.kind === "Merge") {
      return (
        pendingWire.fromNodeId.startsWith("Transform:") ||
        pendingWire.fromNodeId.startsWith("GlowBlur:") ||
        pendingWire.fromNodeId.startsWith("MediaIn:") ||
        pendingWire.fromNodeId.startsWith("SubjectMatte:")
      );
    }
    if (targetNode.kind === "Transform") {
      return pendingWire.fromNodeId.startsWith("PolygonMask:");
    }
  }
  if ((inPort === "BG" || inPort === "FG") && targetNode.kind === "Merge") {
    return pendingWire.fromNodeId.startsWith("Merge:");
  }
  return false;
};

export default function StudioNodeFlow({
  overlays = [],
  compositionOrder = [],
  adjustmentLayers = [],
  finishFx = {},
  finishKeyframes = [],
  beatMarkers = [],
  mainTransform = { x: 50, y: 50, scale: 1, rotation: 0 },
  motionKeyframes = [],
  subjectIsolation = null,
  subjectVfxScenes = [],
  nodeFlow = {},
  activeOverlayId = null,
  currentTime = 0,
  programmeDuration = 8,
  videoRef = null,
  mapTime = null,
  advancedColor = null,
  clipUrl = "",
  onChangeNodeFlow,
  onUpdateNodeFlow,
  onChangeOverlays,
  onUpdateOverlays,
  onChangeCompositionOrder,
  onUpdateCompositionOrder,
  onChangeAdjustmentLayers,
  onUpdateAdjustmentLayers,
  onChangeFinishFx,
  onUpdateFinishFx,
  onChangeFinishKeyframes,
  onUpdateFinishKeyframes,
  onChangeAdvancedColor,
  onUpdateAdvancedColor,
  onChangeMainTransform,
  onUpdateMainTransform,
  onChangeMotionKeyframes,
  onUpdateMotionKeyframes,
  onSelectOverlay,
  onSeek,
  onInteractionStart,
  onInteractionEnd,
}) {
  const emitNodeFlow = onChangeNodeFlow || onUpdateNodeFlow;
  const emitOverlays = onChangeOverlays || onUpdateOverlays;
  const emitCompositionOrder = onChangeCompositionOrder || onUpdateCompositionOrder;
  const emitAdjustmentLayers = onChangeAdjustmentLayers || onUpdateAdjustmentLayers;
  const emitFinishFx = onChangeFinishFx || onUpdateFinishFx;
  const emitFinishKeyframes = onChangeFinishKeyframes || onUpdateFinishKeyframes;
  const emitAdvancedColor = onChangeAdvancedColor || onUpdateAdvancedColor;
  const emitMainTransform = onChangeMainTransform || onUpdateMainTransform;
  const emitMotionKeyframes = onChangeMotionKeyframes || onUpdateMotionKeyframes;

  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 8, y: 6 });
  const [selectedNodeId, setSelectedNodeId] = useState("MediaOut");
  const [selectedVectorNodeIdx, setSelectedVectorNodeIdx] = useState(0);
  const [draggingMaskVertex, setDraggingMaskVertex] = useState(null);
  const [autoKeyMaskVertices, setAutoKeyMaskVertices] = useState(false);
  const [scopeMode, setScopeMode] = useState("waveform");
  const [draggingNode, setDraggingNode] = useState(null);
  const [panningCanvas, setPanningCanvas] = useState(null);
  const [pendingWire, setPendingWire] = useState(null);
  const [hoverPort, setHoverPort] = useState(null);
  const [showSplitCompare, setShowSplitCompare] = useState(false);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const canvasWrapRef = useRef(null);
  const viewerScreenRef = useRef(null);

  const graph = useMemo(
    () =>
      deriveNodeFlowGraph({
        overlays,
        compositionOrder,
        adjustmentLayers,
        finishFx,
        mainTransform,
        motionKeyframes,
        subjectIsolation,
        subjectVfxScenes,
        nodeFlow,
      }),
    [
      overlays,
      compositionOrder,
      adjustmentLayers,
      finishFx,
      mainTransform,
      motionKeyframes,
      subjectIsolation,
      subjectVfxScenes,
      nodeFlow,
    ]
  );

  const bounds = useMemo(() => computeNodeFlowBounds(graph.nodes), [graph.nodes]);

  const nodeMap = useMemo(() => {
    const map = new Map();
    graph.nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [graph.nodes]);

  const selectedNode = useMemo(
    () => nodeMap.get(selectedNodeId) || nodeMap.get("MediaOut") || graph.nodes[0] || null,
    [nodeMap, selectedNodeId, graph.nodes]
  );

  const selectedOverlay = useMemo(() => {
    if (!selectedNode?.targetId || selectedNode.targetId === "main-video") return null;
    return overlays.find(o => String(o.id) === String(selectedNode.targetId)) || null;
  }, [overlays, selectedNode]);

  const selectedAdjustment = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "Adjustment") return null;
    return adjustmentLayers.find(a => String(a.id) === String(selectedNode.targetId)) || null;
  }, [adjustmentLayers, selectedNode]);

  const viewerSignalA = useMemo(
    () => describeNodeViewerSignal(graph.viewerA, graph, { nodeFlow }),
    [graph, nodeFlow]
  );
  const viewerSignalB = useMemo(
    () => describeNodeViewerSignal(graph.viewerB || "ColorCorrector:finish", graph, { nodeFlow }),
    [graph, nodeFlow]
  );

  const isSplitActive = Boolean(graph.viewerB || showSplitCompare);

  const updateFlowPatch = useCallback(
    patch => {
      if (typeof emitNodeFlow === "function") {
        const base = nodeFlow && typeof nodeFlow === "object" ? nodeFlow : {};
        emitNodeFlow({
          version: 1,
          viewerA: base.viewerA || "MediaOut",
          viewerB: base.viewerB ?? null,
          splitPosition: Number.isFinite(base.splitPosition) ? base.splitPosition : 50,
          positions: base.positions || {},
          bypassed: base.bypassed || {},
          ...patch,
        });
      }
    },
    [emitNodeFlow, nodeFlow]
  );

  const applyCanonicalGraphResult = useCallback(
    res => {
      if (!res) return;
      if (res.overlays && typeof emitOverlays === "function") {
        emitOverlays(res.overlays);
      }
      if (res.compositionOrder && typeof emitCompositionOrder === "function") {
        emitCompositionOrder(res.compositionOrder);
      }
      if (res.adjustmentLayers && typeof emitAdjustmentLayers === "function") {
        emitAdjustmentLayers(res.adjustmentLayers);
      }
      if (res.finishFx && typeof emitFinishFx === "function") {
        emitFinishFx(res.finishFx);
      }
      if (res.nodeFlow && typeof emitNodeFlow === "function") {
        const base = res.nodeFlow;
        emitNodeFlow({
          version: 1,
          viewerA: base.viewerA || "MediaOut",
          viewerB: base.viewerB ?? null,
          splitPosition: Number.isFinite(base.splitPosition) ? base.splitPosition : 50,
          positions: base.positions || {},
          bypassed: base.bypassed || {},
        });
      }
      if (res.selectNodeId) {
        setSelectedNodeId(res.selectNodeId);
      }
    },
    [
      emitOverlays,
      emitCompositionOrder,
      emitAdjustmentLayers,
      emitFinishFx,
      emitNodeFlow,
    ]
  );

  const handleSelectNode = useCallback(
    node => {
      if (!node) return;
      setSelectedNodeId(node.id);
      if (node.targetId && node.targetId !== "main-video" && typeof onSelectOverlay === "function") {
        const exists = overlays.some(o => String(o.id) === String(node.targetId));
        if (exists) onSelectOverlay(node.targetId);
      }
    },
    [overlays, onSelectOverlay]
  );

  const handleAssignViewer = useCallback(
    (slot, nodeId) => {
      if (slot === "A") {
        updateFlowPatch({ viewerA: nodeId });
      } else {
        const nextB = graph.viewerB === nodeId ? null : nodeId;
        if (!nextB) setShowSplitCompare(false);
        updateFlowPatch({ viewerB: nextB });
      }
    },
    [graph.viewerB, updateFlowPatch]
  );

  const handleToggleBypass = useCallback(
    node => {
      if (!node || !node.bypassable) return;
      const res = toggleNodeFlowBypass(
        { overlays, adjustmentLayers, nodeFlow },
        node.id
      );
      applyCanonicalGraphResult(res);
    },
    [overlays, adjustmentLayers, nodeFlow, applyCanonicalGraphResult]
  );

  const handleDeleteNode = useCallback(
    node => {
      if (!node || !node.removable) return;
      const res = deleteNodeFromFlow(
        {
          overlays,
          compositionOrder,
          adjustmentLayers,
          motionKeyframes,
          mainTransform,
          nodeFlow,
        },
        node.id,
        currentTime
      );
      applyCanonicalGraphResult(res);
    },
    [
      overlays,
      compositionOrder,
      adjustmentLayers,
      motionKeyframes,
      mainTransform,
      nodeFlow,
      currentTime,
      applyCanonicalGraphResult,
    ]
  );

  const handleFitView = useCallback(
    (customNodes = null) => {
      const targetBounds = customNodes ? computeNodeFlowBounds(customNodes) : bounds;
      const wrapEl = canvasWrapRef.current;
      const wrapW = wrapEl?.clientWidth || 680;
      const wrapH = wrapEl?.clientHeight || 200;
      const scaleX = (wrapW - 24) / Math.max(240, targetBounds.width);
      const scaleY = (wrapH - 20) / Math.max(150, targetBounds.height);
      const nextZoom = Number(Math.max(0.08, Math.min(1.15, Math.min(scaleX, scaleY))).toFixed(2));
      const nextPan = {
        x: Math.round(Math.max(4, (wrapW - targetBounds.width * nextZoom) * 0.5)),
        y: Math.round(Math.max(4, (wrapH - targetBounds.height * nextZoom) * 0.5)),
      };
      setZoom(nextZoom);
      setPan(nextPan);
    },
    [bounds]
  );

  useEffect(() => {
    const wrapEl = canvasWrapRef.current;
    if (!wrapEl) return;
    const wrapW = wrapEl.clientWidth || 680;
    if (wrapW < 360 && zoom > 0.65) {
      setZoom(0.55);
    }
  }, [zoom]);

  useEffect(() => {
    const onKeyDown = e => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) {
        return;
      }
      if (e.key === "1" && selectedNode) {
        e.preventDefault();
        handleAssignViewer("A", selectedNode.id);
      } else if (e.key === "2" && selectedNode) {
        e.preventDefault();
        handleAssignViewer("B", selectedNode.id);
      } else if (e.key === "Escape" && pendingWire) {
        setPendingWire(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedNode?.removable) {
        e.preventDefault();
        handleDeleteNode(selectedNode);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode, pendingWire, handleAssignViewer, handleDeleteNode]);

  // Node card dragging
  useEffect(() => {
    if (!draggingNode) return undefined;
    const onMove = e => {
      const dx = (e.clientX - draggingNode.startX) / zoom;
      const dy = (e.clientY - draggingNode.startY) / zoom;
      const nextX = Math.max(8, Math.round(draggingNode.origX + dx));
      const nextY = Math.max(6, Math.round(draggingNode.origY + dy));
      updateFlowPatch({
        positions: {
          ...(nodeFlow?.positions || {}),
          [draggingNode.id]: { x: nextX, y: nextY },
        },
      });
    };
    const onUp = () => {
      setDraggingNode(null);
      if (typeof onInteractionEnd === "function") onInteractionEnd();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingNode, zoom, nodeFlow?.positions, updateFlowPatch, onInteractionEnd]);

  // Empty canvas drag-to-pan
  useEffect(() => {
    if (!panningCanvas) return undefined;
    const onMove = e => {
      const nextPan = {
        x: Math.round(panningCanvas.origPanX + (e.clientX - panningCanvas.startX)),
        y: Math.round(panningCanvas.origPanY + (e.clientY - panningCanvas.startY)),
      };
      setPan(nextPan);
    };
    const onUp = () => {
      setPanningCanvas(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panningCanvas]);

  // Viewer A/B split handle drag
  useEffect(() => {
    if (!draggingSplit) return undefined;
    const onMove = e => {
      const el = viewerScreenRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const pct = Math.max(10, Math.min(90, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
      updateFlowPatch({ splitPosition: pct });
    };
    const onUp = () => {
      setDraggingSplit(false);
      if (typeof onInteractionEnd === "function") onInteractionEnd();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingSplit, updateFlowPatch, onInteractionEnd]);

  const completePortConnection = useCallback(
    (toNodeId, toPort) => {
      if (!pendingWire || pendingWire.fromNodeId === toNodeId) {
        setPendingWire(null);
        return;
      }
      const res = connectNodeFlowPorts(
        {
          overlays,
          compositionOrder,
          motionKeyframes,
          mainTransform,
        },
        {
          fromNodeId: pendingWire.fromNodeId,
          toNodeId,
          toPort,
          currentTime,
        }
      );
      applyCanonicalGraphResult(res);
      setPendingWire(null);
    },
    [
      pendingWire,
      overlays,
      compositionOrder,
      motionKeyframes,
      mainTransform,
      currentTime,
      applyCanonicalGraphResult,
    ]
  );

  const handlePortClick = (e, node, side, portName) => {
    e.stopPropagation();
    if (side === "out") {
      setPendingWire(prev =>
        prev?.fromNodeId === node.id && prev?.fromPort === portName
          ? null
          : { fromNodeId: node.id, fromPort: portName }
      );
      return;
    }

    if (side === "in") {
      if (!pendingWire) {
        if (portName === "Parent" || portName === "Mask") {
          const res = disconnectNodeFlowPort(
            { overlays, motionKeyframes, mainTransform },
            { toNodeId: node.id, toPort: portName, currentTime }
          );
          applyCanonicalGraphResult(res);
        }
        return;
      }
      completePortConnection(node.id, portName);
    }
  };

  const handlePaletteAdd = paletteId => {
    const res = createNodePaletteAddition(paletteId, {
      overlays,
      adjustmentLayers,
      activeOverlayId: selectedOverlay?.id || activeOverlayId,
      currentTime,
      programmeDuration,
    });
    if (!res) return;
    applyCanonicalGraphResult(res);
    if (res.selectOverlayId && typeof onSelectOverlay === "function") {
      onSelectOverlay(res.selectOverlayId);
    }
    if (res.selectNodeId) {
      setSelectedNodeId(res.selectNodeId);
    }
  };

  const handleInjectSmartRig = rigId => {
    const res = buildSmartFlowRigState(rigId, {
      overlays,
      adjustmentLayers,
      finishFx,
      currentTime,
      programmeDuration,
    });
    if (!res) return;
    applyCanonicalGraphResult(res);
    if (res.selectOverlayId && typeof onSelectOverlay === "function") {
      onSelectOverlay(res.selectOverlayId);
    }
    if (res.selectNodeId) {
      setSelectedNodeId(res.selectNodeId);
    }
    updateFlowPatch({
      positions: {},
    });
  };

  const handleAutoLayout = () => {
    updateFlowPatch({ positions: {} });
    setPan({ x: 8, y: 6 });
  };

  const handleCanvasWheel = e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      const nextZoom = Number(Math.max(0.45, Math.min(1.4, zoom + delta)).toFixed(2));
      setZoom(nextZoom);
    }
  };

  const updateSelectedOverlayField = (patch, useWorldReparent = false) => {
    if (!selectedOverlay || typeof emitOverlays !== "function") return;
    emitOverlays(
      overlays.map(item => {
        if (String(item.id) !== String(selectedOverlay.id)) return item;
        if (useWorldReparent && "parentId" in patch) {
          return reparentStudioLayerPreservingWorldPose(
            item,
            patch.parentId,
            overlays,
            motionKeyframes,
            currentTime,
            mainTransform
          );
        }
        return { ...item, ...patch };
      })
    );
  };

  const updateSelectedOverlayVector = shapePatch => {
    if (!selectedOverlay?.vectorShape) return;
    const mergedSpec = validateStudioVectorShape({
      ...selectedOverlay.vectorShape,
      ...shapePatch,
      fill: {
        ...(selectedOverlay.vectorShape.fill || {}),
        ...(shapePatch.fill || {}),
      },
      stroke: {
        ...(selectedOverlay.vectorShape.stroke || {}),
        ...(shapePatch.stroke || {}),
      },
    });
    updateSelectedOverlayField({
      vectorShape: mergedSpec,
      src: studioVectorUri(mergedSpec),
    });
  };

  const activeDriverType = useMemo(() => {
    if (!selectedOverlay?.motionDrivers) return "none";
    const entry = Object.values(selectedOverlay.motionDrivers).find(d => d && d.enabled !== false && d.type !== "none");
    return entry?.type || "none";
  }, [selectedOverlay]);

  const handleSelectMotionDriver = driverType => {
    if (!selectedOverlay) return;
    if (driverType === "none") {
      updateSelectedOverlayField({ motionDrivers: {} });
      return;
    }
    const targetProp =
      driverType === "spin"
        ? "rotation"
        : driverType === "spring"
        ? "scale"
        : driverType === "beat_pump"
        ? "opacity"
        : "y";
    updateSelectedOverlayField({
      motionDrivers: {
        [targetProp]: defaultMotionDriverForProperty(driverType, targetProp),
      },
    });
  };

  const resolvedAdvancedColor = useMemo(() => {
    const raw = advancedColor || finishFx?.advancedColor || {};
    return {
      curve: {
        shadows: Number(raw.curve?.shadows ?? 0),
        midtones: Number(raw.curve?.midtones ?? 0),
        highlights: Number(raw.curve?.highlights ?? 0),
      },
      hsl: {
        hue: Number(raw.hsl?.hue ?? 0),
        saturation: Number(raw.hsl?.saturation ?? 1),
        luminance: Number(raw.hsl?.luminance ?? 0),
      },
      lut: raw.lut || null,
      lutName: raw.lutName || "",
      lutPresetId: raw.lutPresetId || "",
      lutIntensity: Number(raw.lutIntensity ?? 1),
    };
  }, [advancedColor, finishFx?.advancedColor]);

  const updateAdvancedColorPatch = patch => {
    const next = {
      ...resolvedAdvancedColor,
      ...patch,
      curve: {
        ...resolvedAdvancedColor.curve,
        ...(patch.curve || {}),
      },
      hsl: {
        ...resolvedAdvancedColor.hsl,
        ...(patch.hsl || {}),
      },
    };
    emitAdvancedColor?.(next);
    emitFinishFx?.({
      ...finishFx,
      advancedColor: next,
    });
  };

  const normalizedFinishKeyframes = useMemo(
    () => normalizeFinishKeyframes(finishKeyframes),
    [finishKeyframes]
  );

  const liveColorScopes = useMemo(
    () =>
      computeLiveGradeScopes({
        finishFx: interpolateFinishKeyframes(finishFx, normalizedFinishKeyframes, currentTime),
        advancedColor: resolvedAdvancedColor,
        width: 48,
        height: 27,
      }),
    [finishFx, normalizedFinishKeyframes, currentTime, resolvedAdvancedColor]
  );

  const stampMaskVertexKeyframes = useCallback(
    (targetOverlay, polygonPts, atTime = currentTime, onlyIndex = null) => {
      if (!targetOverlay || typeof emitMotionKeyframes !== "function") return;
      const safeTime = Math.max(0, Number(atTime) || 0);
      let nextKeys = Array.isArray(motionKeyframes) ? [...motionKeyframes] : [];
      polygonPts.forEach(([px, py], idx) => {
        if (onlyIndex !== null && idx !== onlyIndex) return;
        nextKeys = upsertAutomationKeyframe(nextKeys, {
          id: `mask-pt-${targetOverlay.id}-${idx}-x-${Math.round(safeTime * 100)}`,
          targetId: targetOverlay.id,
          property: `maskPoint${idx}X`,
          time: safeTime,
          value: Number(px),
          easing: "easeInOut",
        });
        nextKeys = upsertAutomationKeyframe(nextKeys, {
          id: `mask-pt-${targetOverlay.id}-${idx}-y-${Math.round(safeTime * 100)}`,
          targetId: targetOverlay.id,
          property: `maskPoint${idx}Y`,
          time: safeTime,
          value: Number(py),
          easing: "easeInOut",
        });
      });
      const candidateLayer = {
        ...targetOverlay,
        type: ["image", "video"].includes(targetOverlay.type) ? targetOverlay.type : "image",
        mask: {
          enabled: true,
          shape: "polygon",
          ...(targetOverlay.mask || {}),
          path: studioMaskPolygonPath(polygonPts),
        },
      };
      validateStudioMaskAnimation(
        candidateLayer,
        nextKeys.filter(k => String(k.targetId) === String(targetOverlay.id))
      );
      emitMotionKeyframes(nextKeys);
    },
    [currentTime, emitMotionKeyframes, motionKeyframes]
  );

  const anyBypassed = useMemo(
    () => graph.nodes.some(n => n.bypassed),
    [graph.nodes]
  );

  const renderViewerStagePreview = (signal, slotKey) => {
    const visibleOverlays = overlays.filter(o => {
      if (!o || o.isCaption) return false;
      if (signal.includedOverlayIds === "all") return !o.hidden;
      if (Array.isArray(signal.includedOverlayIds)) {
        return signal.includedOverlayIds.includes(String(o.id));
      }
      return false;
    });
    const contrastPct = signal.includeGrade ? Math.round(Number(finishFx?.contrast ?? 1) * 100) : 100;
    const satPct = signal.includeGrade ? Math.round(Number(finishFx?.saturation ?? 1) * 100) : 100;
    const brightPct = signal.includeGrade ? Math.round(Number(finishFx?.brightness ?? 1) * 100) : 100;

    return (
      <div
        className={`ap-flow-stage-schematic is-${signal.stage}`}
        data-testid={`flow-viewer-stage-${slotKey}`}
        style={{
          filter: signal.includeGrade
            ? `brightness(${brightPct}%) contrast(${contrastPct}%) saturate(${satPct}%)`
            : "none",
        }}
      >
        <div className="ap-flow-stage-grid" />
        {signal.includeMainTransform && (
          <div className="ap-flow-stage-frame-box">
            <span>
              Primary Plate · {Math.round((Number(mainTransform?.scale) || 1) * 100)}%
            </span>
          </div>
        )}
        {visibleOverlays.map(ov => {
          const left = Math.max(10, Math.min(90, Number(ov.x) || 50));
          const top = Math.max(16, Math.min(84, Number(ov.y) || 50));
          return (
            <div
              key={ov.id}
              className={`ap-flow-stage-token ${ov.isNullRig ? "is-null" : ov.vectorShape ? "is-vector" : "is-layer"}`}
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              {ov.isNullRig ? "⊕" : ov.vectorShape ? "◆" : "T"}{" "}
              <span>{(ov.name || ov.text || ov.id).slice(0, 14)}</span>
            </div>
          );
        })}
        <div className="ap-flow-stage-telemetry">
          <span>{signal.stage.toUpperCase()}</span>
          <span>
            {signal.includeGrade ? `C ${contrastPct}% · S ${satPct}%` : "UNGRADED"}
          </span>
          <span>{visibleOverlays.length} LYR</span>
        </div>
      </div>
    );
  };

  return (
    <div className="ap-node-flow-root" data-testid="studio-node-flow">
      {/* Top Toolbar: Node Palette + Smart Flow Rigs + Viewer Controls */}
      <div className="ap-node-flow-toolbar">
        <div className="ap-node-flow-palette" role="toolbar" aria-label="Node Flow Palette">
          <span className="ap-flow-section-tag">ADD NODE</span>
          {FLOW_NODE_PALETTE.map(item => (
            <button
              key={item.id}
              type="button"
              className="ap-flow-palette-btn"
              data-testid={`flow-palette-${item.id}`}
              onClick={() => handlePaletteAdd(item.id)}
              title={item.description}
            >
              <span
                className="ap-flow-palette-dot"
                style={{ background: FLOW_NODE_KINDS[item.kind]?.color || "#38bdf8" }}
              />
              {item.label}
            </button>
          ))}
          <select
            className="ap-flow-palette-select"
            aria-label="Add Signal Node"
            value=""
            onChange={e => {
              if (e.target.value) handlePaletteAdd(e.target.value);
            }}
          >
            <option value="">+ Add Node…</option>
            {FLOW_NODE_PALETTE.map(item => (
              <option key={item.id} value={item.id}>
                + {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ap-node-flow-rigs" role="toolbar" aria-label="Smart Flow Rigs">
          <span className="ap-flow-section-tag">1-CLICK RIGS</span>
          {SMART_FLOW_RIG_PRESETS.map(rig => (
            <button
              key={rig.id}
              type="button"
              className="ap-flow-rig-btn"
              data-testid={`flow-smart-rig-${rig.id}`}
              onClick={() => handleInjectSmartRig(rig.id)}
              title={rig.description || rig.summary}
            >
              ⚡ {rig.label}
            </button>
          ))}
          <select
            className="ap-flow-rig-select"
            aria-label="Insert Smart Flow Rig"
            data-testid="flow-smart-rig-select"
            value=""
            onChange={e => {
              if (e.target.value) handleInjectSmartRig(e.target.value);
            }}
          >
            <option value="">+ Smart Rig Preset…</option>
            {SMART_FLOW_RIG_PRESETS.map(rig => (
              <option key={rig.id} value={rig.id}>
                {rig.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ap-node-flow-view-controls">
          <label className="ap-comp-field"><span>Inspect node</span>
            <select className="ap-comp-select" aria-label="Inspect node" value={selectedNode?.id || ''}
              onChange={event => { const node = nodeMap.get(event.target.value); handleSelectNode(node); handleFitView(); }}>
              {graph.nodes.map(node => <option key={node.id} value={node.id}>{node.label || node.id}</option>)}
            </select>
          </label>
          <button
            type="button"
            className={`ap-flow-ctrl-btn ${isSplitActive ? "is-active" : ""}`}
            data-testid="flow-toggle-ab-wipe"
            onClick={() => {
              const next = !isSplitActive;
              setShowSplitCompare(next);
              updateFlowPatch({
                viewerB: next ? graph.viewerB || "ColorCorrector:finish" : null,
              });
            }}
            title="Toggle Dual Viewer [1] / [2] Split Wipe Monitor"
          >
            ◧ Viewer [1]/[2] Wipe
          </button>
          <button
            type="button"
            className="ap-flow-ctrl-btn"
            data-testid="flow-fit-view"
            aria-label="Fit graph"
            onClick={() => handleFitView()}
            title="Fit entire node graph into viewport"
          >
            ⊡ Fit View
          </button>
          <button
            type="button"
            className="ap-flow-ctrl-btn"
            data-testid="flow-auto-layout"
            onClick={handleAutoLayout}
            title="Snap all nodes back to clean horizontal pipeline layout"
          >
            ⊞ Auto-Layout
          </button>
          <div className="ap-flow-zoom-pill">
            <button
              type="button"
              aria-label="Zoom node graph out"
              onClick={() => {
                const next = Math.max(0.08, Number((zoom - 0.1).toFixed(2)));
                setZoom(next);
              }}
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in node graph"
              onClick={() => {
                const next = Math.min(1.4, Number((zoom + 0.1).toFixed(2)));
                setZoom(next);
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Main Split: Interactive Node Canvas + Optional Viewer [1]/[2] Monitor + Contextual Node Inspector */}
      <div className={`ap-flow-stage ${isSplitActive ? "has-split-viewer" : ""}`}>
        <div
          ref={canvasWrapRef}
          className={`ap-flow-canvas-wrap ${pendingWire ? "is-wiring" : ""} ${panningCanvas ? "is-panning" : ""}`}
          onWheel={handleCanvasWheel}
          onMouseDown={e => {
            if (e.button !== 0) return;
            if (e.target.closest(".ap-flow-node") || e.target.closest(".ap-flow-wiring-banner")) {
              return;
            }
            setPanningCanvas({
              startX: e.clientX,
              startY: e.clientY,
              origPanX: pan.x,
              origPanY: pan.y,
            });
          }}
          onClick={() => {
            if (pendingWire) setPendingWire(null);
          }}
        >
          {pendingWire && (
            <div className="ap-flow-wiring-banner" data-testid="flow-wiring-banner">
              <span>
                🔗 Wiring from <strong>{pendingWire.fromNodeId}</strong> ({pendingWire.fromPort}) — click a glowing{" "}
                <strong>Parent</strong>, <strong>Mask</strong>, or <strong>Merge</strong> input port (or Esc to cancel)
              </span>
              <button type="button" onClick={() => setPendingWire(null)}>
                Cancel
              </button>
            </div>
          )}

          <div
            className="ap-flow-canvas"
            style={{
              width: `${Math.max(980, bounds.maxX + 60)}px`,
              height: `${Math.max(280, bounds.maxY + 40)}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              className="ap-flow-wires-svg"
              width={Math.max(980, bounds.maxX + 60)}
              height={Math.max(280, bounds.maxY + 40)}
            >
              <defs>
                {Object.entries(WIRE_COLORS).map(([kind, color]) => (
                  <marker
                    key={kind}
                    id={`ap-arrow-${kind}`}
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,1 L7,4 L0,7 Z" fill={color} />
                  </marker>
                ))}
              </defs>

              {graph.wires.map(wire => {
                const fromNode = nodeMap.get(wire.from);
                const toNode = nodeMap.get(wire.to);
                if (!fromNode || !toNode) return null;
                const fromPt = getPortCoords(fromNode, "out", wire.fromPort);
                const toPt = getPortCoords(toNode, "in", wire.toPort);
                const d = buildCubicWirePath(fromPt, toPt, wire.kind);
                const stroke = WIRE_COLORS[wire.kind] || "#38bdf8";
                const midX = (fromPt.x + toPt.x) * 0.5;
                const midY = (fromPt.y + toPt.y) * 0.5 - 6;

                return (
                  <g
                    key={wire.id}
                    className={`ap-flow-wire-group ${wire.removable ? "is-removable" : ""}`}
                    onClick={e => {
                      if (!wire.removable) return;
                      e.stopPropagation();
                      const res = disconnectNodeFlowPort(
                        { overlays, motionKeyframes, mainTransform },
                        { toNodeId: wire.to, toPort: wire.toPort, currentTime }
                      );
                      applyCanonicalGraphResult(res);
                    }}
                  >
                    <title>
                      {wire.removable
                        ? `${wire.label || wire.kind} link (${wire.from} → ${wire.to}) — click to disconnect`
                        : `${wire.from} → ${wire.to}`}
                    </title>
                    {wire.removable && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={12}
                        className="ap-flow-wire-hit"
                      />
                    )}
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={wire.kind === "Spine" ? 2.6 : 2}
                      strokeDasharray={
                        wire.kind === "Parent"
                          ? "5 4"
                          : wire.kind === "Mask"
                          ? "3 3"
                          : undefined
                      }
                      markerEnd={`url(#ap-arrow-${wire.kind})`}
                      className="ap-flow-wire-path"
                    />
                    {wire.label && (
                      <text
                        x={midX}
                        y={midY}
                        textAnchor="middle"
                        className="ap-flow-wire-label"
                        fill={stroke}
                      >
                        {wire.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {graph.nodes.map(node => {
              const kindMeta = FLOW_NODE_KINDS[node.kind] || FLOW_NODE_KINDS.Transform;
              const isSelected = selectedNode?.id === node.id;
              const isViewerA = graph.viewerA === node.id;
              const isViewerB = graph.viewerB === node.id;

              return (
                <div
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`flow-node-${node.id}`}
                  className={[
                    "ap-flow-node",
                    `is-kind-${node.kind}`,
                    isSelected ? "is-selected" : "",
                    node.bypassed ? "is-bypassed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    "--node-accent": kindMeta.color,
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    handleSelectNode(node);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectNode(node);
                    }
                  }}
                >
                  {/* Node Header */}
                  <div
                    className="ap-flow-node-header"
                    onMouseDown={e => {
                      if (e.button !== 0 || e.target.closest("button")) return;
                      e.stopPropagation();
                      handleSelectNode(node);
                      onInteractionStart?.();
                      setDraggingNode({
                        id: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: node.x,
                        origY: node.y,
                      });
                    }}
                  >
                    <span className="ap-flow-node-icon">{kindMeta.icon}</span>
                    <span className="ap-flow-node-title" title={node.label}>
                      {node.label}
                    </span>
                    {node.badge && (
                      <span className="ap-flow-node-chip" title={`Node status: ${node.badge}`}>
                        {node.badge}
                      </span>
                    )}
                    <div className="ap-flow-node-v-dots">
                      <button
                        type="button"
                        className={`ap-flow-v-dot ${isViewerA ? "is-active-a" : ""}`}
                        title="Send node to Left Viewer [1]"
                        aria-label={`Assign ${node.label} to Viewer 1`}
                        onClick={e => {
                          e.stopPropagation();
                          handleAssignViewer("A", node.id);
                        }}
                      >
                        1
                      </button>
                      <button
                        type="button"
                        className={`ap-flow-v-dot ${isViewerB ? "is-active-b" : ""}`}
                        title="Send node to Right Viewer [2]"
                        aria-label={`Assign ${node.label} to Viewer 2`}
                        onClick={e => {
                          e.stopPropagation();
                          handleAssignViewer("B", node.id);
                        }}
                      >
                        2
                      </button>
                      {node.bypassable && (
                        <button
                          type="button"
                          className={`ap-flow-v-dot ${node.bypassed ? "is-bypassed" : ""}`}
                          title={node.bypassed ? "Enable node" : "Bypass node"}
                          aria-label={`Bypass ${node.label}`}
                          data-testid={`flow-node-bypass-${node.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleBypass(node);
                          }}
                        >
                          ⏻
                        </button>
                      )}
                      {node.removable && (
                        <button
                          type="button"
                          className="ap-flow-v-dot is-delete"
                          title={`Remove ${node.label}`}
                          aria-label={`Delete ${node.label}`}
                          data-testid={`flow-node-delete-${node.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteNode(node);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Node Subtitle & Status */}
                  <div className="ap-flow-node-body">
                    <span className="ap-flow-node-kind-tag">{kindMeta.badge}</span>
                    <span className="ap-flow-node-sub" title={node.subtitle}>
                      {node.bypassed ? "BYPASSED" : node.subtitle}
                    </span>
                  </div>

                  {/* Input Ports */}
                  {(node.ports?.in || []).map(inPort => {
                    const offset = PORT_OFFSETS.in[inPort] || { x: 0, y: 38 };
                    const isTopPort = inPort === "Mask" || inPort === "Parent";
                    const isCompatible = isPortCompatibleWithPending(pendingWire, node, inPort);
                    const isHovered =
                      hoverPort?.nodeId === node.id &&
                      hoverPort?.port === inPort &&
                      hoverPort?.side === "in";
                    return (
                      <button
                        key={`in-${inPort}`}
                        type="button"
                        data-testid={`flow-port-in-${node.id}-${inPort}`}
                        className={[
                          "ap-flow-port",
                          "is-in",
                          `is-port-${inPort.toLowerCase()}`,
                          isTopPort ? "is-top-port" : "",
                          isCompatible ? "is-compatible-target" : "",
                          isHovered ? "is-hovered" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ left: `${offset.x}px`, top: `${offset.y}px` }}
                        title={
                          pendingWire
                            ? `Connect ${pendingWire.fromNodeId} → ${node.label}.${inPort}`
                            : `${node.label} · ${inPort} Input (click to connect or disconnect)`
                        }
                        onMouseEnter={() =>
                          setHoverPort({ nodeId: node.id, port: inPort, side: "in" })
                        }
                        onMouseLeave={() => setHoverPort(null)}
                        onMouseUp={e => {
                          if (pendingWire) {
                            e.stopPropagation();
                            completePortConnection(node.id, inPort);
                          }
                        }}
                        onClick={e => handlePortClick(e, node, "in", inPort)}
                      >
                        <span className="ap-flow-port-label">{inPort}</span>
                      </button>
                    );
                  })}

                  {/* Output Ports */}
                  {(node.ports?.out || []).map(outPort => {
                    const offset = PORT_OFFSETS.out[outPort] || { x: NODE_WIDTH, y: 38 };
                    const isWiringFrom =
                      pendingWire?.fromNodeId === node.id &&
                      pendingWire?.fromPort === outPort;
                    return (
                      <button
                        key={`out-${outPort}`}
                        type="button"
                        data-testid={`flow-port-out-${node.id}-${outPort}`}
                        className={[
                          "ap-flow-port",
                          "is-out",
                          `is-port-${outPort.toLowerCase()}`,
                          isWiringFrom ? "is-wiring-source" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ left: `${offset.x}px`, top: `${offset.y}px` }}
                        title={`Drag or click to wire from ${node.label}.${outPort}`}
                        onMouseDown={e => {
                          e.stopPropagation();
                          setPendingWire({ fromNodeId: node.id, fromPort: outPort });
                        }}
                        onClick={e => handlePortClick(e, node, "out", outPort)}
                      >
                        <span className="ap-flow-port-label">{outPort}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Optional Dual Viewer [1] / [2] Signal Monitor Column */}
        {isSplitActive && (
          <div className="ap-flow-viewer-monitor" data-testid="flow-viewer-monitor">
            <div className="ap-flow-viewer-header-row">
              <div className="ap-flow-viewer-slot is-slot-a">
                <span className="ap-flow-viewer-badge is-a">[1]</span>
                <strong>{viewerSignalA.label}</strong>
              </div>
              <div className="ap-flow-viewer-slot is-slot-b">
                <strong>{viewerSignalB.label}</strong>
                <span className="ap-flow-viewer-badge is-b">[2]</span>
              </div>
            </div>

            <div className="ap-flow-viewer-split-bar">
              <label htmlFor="ap-flow-split-range">Wipe {graph.splitPosition}%</label>
              <input
                id="ap-flow-split-range"
                type="range"
                min="10"
                max="90"
                aria-label="Signal Flow A/B viewer wipe split"
                value={graph.splitPosition}
                data-testid="flow-viewer-split-slider"
                onMouseDown={() => onInteractionStart?.()}
                onMouseUp={() => onInteractionEnd?.()}
                onChange={e => updateFlowPatch({ splitPosition: Number(e.target.value) })}
              />
            </div>

            <div
              ref={viewerScreenRef}
              className="ap-flow-viewer-screen"
              data-testid="flow-viewer-screen"
            >
              {videoRef &&
              (viewerSignalA.stage === "source" ||
                viewerSignalB.stage === "graded" ||
                viewerSignalB.stage === "adjustment_grade") ? (
                <div className="ap-flow-live-grade-viewer-wrap">
                  <StudioSourceGradeViewer
                    nodeId={
                      viewerSignalB.stage === "graded" ||
                      viewerSignalB.stage === "adjustment_grade"
                        ? viewerSignalB.nodeId
                        : viewerSignalA.nodeId
                    }
                    videoRef={videoRef}
                    mapTime={mapTime}
                    time={currentTime}
                    finishFx={finishFx}
                    advancedColor={advancedColor}
                    adjustmentLayers={adjustmentLayers}
                  />
                </div>
              ) : null}
              <div
                className="ap-flow-viewer-pane is-pane-a"
                style={{ width: `${graph.splitPosition}%` }}
              >
                <span className="ap-flow-pane-watermark">
                  [1] {viewerSignalA.label} — {viewerSignalA.badge}
                </span>
                {renderViewerStagePreview(viewerSignalA, "a")}
              </div>
              <div
                className="ap-flow-viewer-pane is-pane-b"
                style={{
                  left: `${graph.splitPosition}%`,
                  width: `${100 - graph.splitPosition}%`,
                }}
              >
                <span className="ap-flow-pane-watermark">
                  [2] {viewerSignalB.label} — {viewerSignalB.badge}
                </span>
                {renderViewerStagePreview(viewerSignalB, "b")}
              </div>
              <div
                role="slider"
                tabIndex={0}
                aria-label="Drag A/B Viewer Split Handle"
                aria-valuemin={10}
                aria-valuemax={90}
                aria-valuenow={graph.splitPosition}
                data-testid="flow-viewer-split-handle"
                className="ap-flow-viewer-divider"
                style={{ left: `${graph.splitPosition}%` }}
                onMouseDown={e => {
                  e.stopPropagation();
                  onInteractionStart?.();
                  setDraggingSplit(true);
                }}
              />
            </div>
          </div>
        )}

        {/* Right Contextual Node Inspector */}
        <aside className="ap-flow-sidebar" data-testid="flow-node-inspector">
          {selectedNode ? (
            <div className="ap-flow-inspector-card">
              <div className="ap-flow-inspector-head">
                <span
                  className="ap-flow-inspector-dot"
                  style={{
                    background:
                      FLOW_NODE_KINDS[selectedNode.kind]?.color || "#38bdf8",
                  }}
                />
                <div className="ap-flow-inspector-titles">
                  <strong>{selectedNode.label}</strong>
                  <span>
                    {selectedNode.kind} Node · {selectedNode.subtitle}
                  </span>
                </div>
              </div>

              <div className="ap-flow-inspector-viewer-row">
                <button
                  type="button"
                  className={graph.viewerA === selectedNode.id ? "is-active" : ""}
                  onClick={() => handleAssignViewer("A", selectedNode.id)}
                >
                  View [1]
                </button>
                <button
                  type="button"
                  className={graph.viewerB === selectedNode.id ? "is-active" : ""}
                  onClick={() => handleAssignViewer("B", selectedNode.id)}
                >
                  View [2]
                </button>
                {selectedNode.bypassable && (
                  <button
                    type="button"
                    className={selectedNode.bypassed ? "is-bypassed" : ""}
                    data-testid="flow-inspector-bypass-btn"
                    onClick={() => handleToggleBypass(selectedNode)}
                  >
                    {selectedNode.bypassed ? "Enable" : "Bypass"}
                  </button>
                )}
                {selectedNode.removable && (
                  <button
                    type="button"
                    className="is-danger"
                    data-testid="flow-delete-selected-node"
                    onClick={() => handleDeleteNode(selectedNode)}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* MediaIn (Layer Source: Title / Vector Shape / Media) */}
              {selectedNode.kind === "MediaIn" && selectedOverlay && (
                <div className="ap-flow-inspector-controls">
                  <label className="ap-flow-field">
                    <span>Layer Name</span>
                    <input
                      type="text"
                      data-testid="flow-inspector-layer-name"
                      value={selectedOverlay.name || ""}
                      placeholder="Layer Name"
                      onChange={e => updateSelectedOverlayField({ name: e.target.value })}
                    />
                  </label>

                  {selectedOverlay.type === "text" && (
                    <>
                      <label className="ap-flow-field">
                        <span>Title Copy</span>
                        <input
                          type="text"
                          data-testid="flow-inspector-title-text"
                          value={selectedOverlay.text || ""}
                          onChange={e =>
                            updateSelectedOverlayField({
                              text: e.target.value,
                              name: selectedOverlay.name || e.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-field">
                          <span>Font Size ({Math.round(Number(selectedOverlay.fontSize) || 40)}px)</span>
                          <input
                            type="range"
                            min="18"
                            max="96"
                            step="1"
                            value={Number(selectedOverlay.fontSize) || 40}
                            onMouseDown={() => onInteractionStart?.()}
                            onMouseUp={() => onInteractionEnd?.()}
                            onChange={e =>
                              updateSelectedOverlayField({ fontSize: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label className="ap-flow-field is-color">
                          <span>Color</span>
                          <input
                            type="color"
                            data-testid="flow-inspector-title-color"
                            value={
                              /^#[0-9a-fA-F]{6}$/.test(selectedOverlay.color || "")
                                ? selectedOverlay.color
                                : "#f8fafc"
                            }
                            onChange={e =>
                              updateSelectedOverlayField({ color: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {selectedOverlay.vectorShape && (
                    <>
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-field is-color">
                          <span>Primary Fill</span>
                          <input
                            type="color"
                            data-testid="flow-inspector-vector-color"
                            value={selectedOverlay.vectorShape.fill?.color || "#8b5cf6"}
                            onChange={e =>
                              updateSelectedOverlayVector({
                                fill: { color: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="ap-flow-field is-color">
                          <span>Gradient End</span>
                          <input
                            type="color"
                            data-testid="flow-inspector-vector-end-color"
                            value={selectedOverlay.vectorShape.fill?.endColor || "#22d3ee"}
                            onChange={e =>
                              updateSelectedOverlayVector({
                                fill: { kind: "linear", endColor: e.target.value },
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="ap-flow-field">
                        <span>
                          Stroke Width ({Number(selectedOverlay.vectorShape.stroke?.width ?? 2)}px)
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="8"
                          step="0.5"
                          value={Number(selectedOverlay.vectorShape.stroke?.width ?? 2)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            updateSelectedOverlayVector({
                              stroke: { width: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                      <div className="ap-flow-vector-editor-box" data-testid="flow-vector-bezier-box">
                        <div className="ap-flow-vector-editor-head">
                          <span>Bezier Contour Spline</span>
                          <button
                            type="button"
                            className="ap-flow-mini-btn"
                            data-testid="flow-split-vector-segment"
                            onClick={() => {
                              try {
                                const contour = studioVectorContour(selectedOverlay.vectorShape, 0);
                                const split = splitStudioVectorSegment(
                                  contour,
                                  Math.min(selectedVectorNodeIdx, contour.nodes.length - 1)
                                );
                                const nextShape = replaceStudioVectorContour(
                                  selectedOverlay.vectorShape,
                                  0,
                                  split
                                );
                                updateSelectedOverlayField({
                                  vectorShape: nextShape,
                                  src: studioVectorUri(nextShape),
                                });
                              } catch (_e) {
                                // Ignore if max vertices reached
                              }
                            }}
                          >
                            + Split Segment
                          </button>
                        </div>
                        <StudioVectorPathEditor
                          shape={studioVectorContour(selectedOverlay.vectorShape, 0)}
                          locked={Boolean(selectedOverlay.locked)}
                          selected={selectedVectorNodeIdx}
                          onSelect={setSelectedVectorNodeIdx}
                          onChange={nextContour => {
                            const nextShape = replaceStudioVectorContour(
                              selectedOverlay.vectorShape,
                              0,
                              nextContour
                            );
                            updateSelectedOverlayField({
                              vectorShape: nextShape,
                              src: studioVectorUri(nextShape),
                            });
                          }}
                        />
                      </div>
                    </>
                  )}

                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>Cue In ({Number(selectedOverlay.startTime || 0).toFixed(1)}s)</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, Number(programmeDuration) - 0.5)}
                        step="0.1"
                        value={Number(selectedOverlay.startTime || 0)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          updateSelectedOverlayField({ startTime: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>Length ({Number(selectedOverlay.duration || 3).toFixed(1)}s)</span>
                      <input
                        type="range"
                        min="0.5"
                        max={Math.max(2, Number(programmeDuration) || 8)}
                        step="0.1"
                        value={Number(selectedOverlay.duration || 3)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          updateSelectedOverlayField({ duration: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Transform / NullRig Controls */}
              {(selectedNode.kind === "Transform" || selectedNode.kind === "NullRig") && (
                <div className="ap-flow-inspector-controls">
                  {selectedNode.targetId === "main-video" ? (
                    <>
                      <label className="ap-flow-field">
                        <span>Center X ({Math.round(Number(mainTransform?.x ?? 50))}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Number(mainTransform?.x ?? 50)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitMainTransform?.({
                              ...mainTransform,
                              x: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Center Y ({Math.round(Number(mainTransform?.y ?? 50))}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Number(mainTransform?.y ?? 50)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitMainTransform?.({
                              ...mainTransform,
                              y: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Size ({Math.round(Number(mainTransform?.scale ?? 1) * 100)}%)</span>
                        <input
                          type="range"
                          min="0.4"
                          max="2.4"
                          step="0.02"
                          value={Number(mainTransform?.scale ?? 1)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitMainTransform?.({
                              ...mainTransform,
                              scale: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Angle ({Math.round(Number(mainTransform?.rotation ?? 0))}°)</span>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={Number(mainTransform?.rotation ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitMainTransform?.({
                              ...mainTransform,
                              rotation: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="ap-flow-reset-btn"
                        onClick={() =>
                          emitMainTransform?.({ x: 50, y: 50, scale: 1, rotation: 0 })
                        }
                      >
                        Reset Camera Transform
                      </button>
                    </>
                  ) : selectedOverlay ? (
                    <>
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-field">
                          <span>Center X ({Math.round(Number(selectedOverlay.x ?? 50))}%)</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Number(selectedOverlay.x ?? 50)}
                            onMouseDown={() => onInteractionStart?.()}
                            onMouseUp={() => onInteractionEnd?.()}
                            onChange={e =>
                              updateSelectedOverlayField({ x: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label className="ap-flow-field">
                          <span>Center Y ({Math.round(Number(selectedOverlay.y ?? 50))}%)</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Number(selectedOverlay.y ?? 50)}
                            onMouseDown={() => onInteractionStart?.()}
                            onMouseUp={() => onInteractionEnd?.()}
                            onChange={e =>
                              updateSelectedOverlayField({ y: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-field">
                          <span>Size ({Math.round(Number(selectedOverlay.scale ?? 1) * 100)}%)</span>
                          <input
                            type="range"
                            min="0.2"
                            max="2.5"
                            step="0.02"
                            value={Number(selectedOverlay.scale ?? 1)}
                            onMouseDown={() => onInteractionStart?.()}
                            onMouseUp={() => onInteractionEnd?.()}
                            onChange={e =>
                              updateSelectedOverlayField({ scale: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label className="ap-flow-field">
                          <span>Angle ({Math.round(Number(selectedOverlay.rotation ?? 0))}°)</span>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                            value={Number(selectedOverlay.rotation ?? 0)}
                            onMouseDown={() => onInteractionStart?.()}
                            onMouseUp={() => onInteractionEnd?.()}
                            onChange={e =>
                              updateSelectedOverlayField({ rotation: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>

                      <label className="ap-flow-field">
                        <span>Parent Rig (Pick-Whip)</span>
                        <select
                          data-testid="flow-inspector-parent-select"
                          value={selectedOverlay.parentId || ""}
                          onChange={e =>
                            updateSelectedOverlayField(
                              { parentId: e.target.value || null },
                              true
                            )
                          }
                        >
                          <option value="">None (World Space)</option>
                          <option value="main-video">Primary Video Plate</option>
                          {overlays
                            .filter(
                              o =>
                                o &&
                                !o.isCaption &&
                                String(o.id) !== String(selectedOverlay.id)
                            )
                            .map(candidate => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.isNullRig ? "⊕ " : ""}
                                {candidate.name || candidate.text || candidate.id}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="ap-flow-field">
                        <span>Procedural Motion Driver</span>
                        <select
                          data-testid="flow-inspector-driver-select"
                          value={activeDriverType}
                          onChange={e => handleSelectMotionDriver(e.target.value)}
                        >
                          <option value="none">None (Manual / Keyframes)</option>
                          <option value="spring">Inertial Spring Overshoot</option>
                          <option value="wiggle">Organic Camera Wiggle</option>
                          <option value="pulse">Sine Wave Drift</option>
                          <option value="beat_pump">BPM Beat Pump</option>
                          <option value="spin">Continuous Spin</option>
                          <option value="orbit">Circular Orbit</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              )}

              {/* GlowBlur Controls (FinishFX vs Overlay Layer FX) */}
              {selectedNode.kind === "GlowBlur" && (
                <div className="ap-flow-inspector-controls">
                  {selectedNode.id === "GlowBlur:finish" ? (
                    <>
                      <label className="ap-flow-field">
                        <span>Film Grain ({Math.round(Number(finishFx?.filmGrain ?? 0) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={Number(finishFx?.filmGrain ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              filmGrain: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>
                          Chromatic Split ({Math.round(Number(finishFx?.chromaticAberration ?? 0) * 100)}%)
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={Number(finishFx?.chromaticAberration ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              chromaticAberration: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Light Leak ({Math.round(Number(finishFx?.lightLeak ?? 0) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={Number(finishFx?.lightLeak ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              lightLeak: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Sharpness ({Math.round(Number(finishFx?.sharpen ?? 0) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          value={Number(finishFx?.sharpen ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              sharpen: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </>
                  ) : selectedOverlay ? (
                    <>
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-checkbox-row">
                          <input
                            type="checkbox"
                            data-testid="flow-inspector-glow-toggle"
                            checked={Boolean(selectedOverlay.glow?.enabled)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                glow: {
                                  color: "#22d3ee",
                                  radius: 20,
                                  intensity: 0.8,
                                  ...(selectedOverlay.glow || {}),
                                  enabled: e.target.checked,
                                },
                              })
                            }
                          />
                          <span>Optical Glow</span>
                        </label>
                        <input
                          type="color"
                          aria-label="Glow Color"
                          value={selectedOverlay.glow?.color || "#22d3ee"}
                          onChange={e =>
                            updateSelectedOverlayField({
                              glow: {
                                enabled: true,
                                radius: 20,
                                intensity: 0.8,
                                ...(selectedOverlay.glow || {}),
                                color: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <label className="ap-flow-field">
                        <span>Glow Radius ({Math.round(Number(selectedOverlay.glow?.radius ?? 20))}px)</span>
                        <input
                          type="range"
                          min="0"
                          max="48"
                          step="1"
                          value={Number(selectedOverlay.glow?.radius ?? 20)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            updateSelectedOverlayField({
                              glow: {
                                enabled: true,
                                color: "#22d3ee",
                                intensity: 0.8,
                                ...(selectedOverlay.glow || {}),
                                radius: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>
                          Glow Intensity ({Math.round(Number(selectedOverlay.glow?.intensity ?? 0.8) * 100)}%)
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={Number(selectedOverlay.glow?.intensity ?? 0.8)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            updateSelectedOverlayField({
                              glow: {
                                enabled: true,
                                color: "#22d3ee",
                                radius: 20,
                                ...(selectedOverlay.glow || {}),
                                intensity: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Gaussian Blur ({Math.round(Number(selectedOverlay.blur ?? 0))}px)</span>
                        <input
                          type="range"
                          min="0"
                          max="24"
                          step="0.5"
                          value={Number(selectedOverlay.blur ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            updateSelectedOverlayField({ blur: Number(e.target.value) })
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              )}

              {/* PolygonMask Controls */}
              {selectedNode.kind === "PolygonMask" && selectedOverlay && (
                <div className="ap-flow-inspector-controls">
                  <label className="ap-flow-field">
                    <span>Mask Stencil Shape</span>
                    <select
                      data-testid="flow-inspector-mask-shape"
                      value={selectedOverlay.mask?.shape || "polygon"}
                      onChange={e =>
                        updateSelectedOverlayField({
                          mask: {
                            enabled: true,
                            radius: 8,
                            feather: 10,
                            inverted: false,
                            path: selectedOverlay.mask?.path || DEFAULT_STUDIO_MASK_POLYGON,
                            ...(selectedOverlay.mask || {}),
                            shape: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="polygon">5-Point Polygon Spline</option>
                      <option value="ellipse">Soft Ellipse Matte</option>
                      <option value="rectangle">Rounded Rectangle</option>
                      <option value="diamond">Diamond Stencil</option>
                      <option value="inset">Inset Frame Crop</option>
                    </select>
                  </label>
                  {(selectedOverlay.mask?.shape || "polygon") === "polygon" && (() => {
                    let pts;
                    try {
                      pts = parseStudioMaskPolygon(
                        selectedOverlay.mask?.path || DEFAULT_STUDIO_MASK_POLYGON
                      );
                    } catch (_e) {
                      pts = parseStudioMaskPolygon(DEFAULT_STUDIO_MASK_POLYGON);
                    }
                    const polyPointsAttr = pts.map(([x, y]) => `${x},${y}`).join(" ");
                    const activeMaskKeysCount = (Array.isArray(motionKeyframes) ? motionKeyframes : []).filter(
                      k =>
                        String(k.targetId) === String(selectedOverlay.id) &&
                        String(k.property).startsWith("maskPoint")
                    ).length;
                    return (
                      <div className="ap-flow-vector-editor-box" data-testid="flow-polygon-mask-editor">
                        <div className="ap-flow-vector-editor-head">
                          <span>
                            Polygon Vertex Spline ({pts.length} pts
                            {activeMaskKeysCount > 0 ? ` · ${activeMaskKeysCount} keys` : ""})
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {[
                              {
                                label: "5-Pt",
                                path: DEFAULT_STUDIO_MASK_POLYGON,
                              },
                              {
                                label: "Hex",
                                path: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
                              },
                              {
                                label: "Oct",
                                path: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
                              },
                            ].map(preset => (
                              <button
                                key={preset.label}
                                type="button"
                                className="ap-flow-mini-btn"
                                onClick={() => {
                                  if (activeMaskKeysCount > 0 && typeof emitMotionKeyframes === "function") {
                                    emitMotionKeyframes(
                                      motionKeyframes.filter(
                                        k =>
                                          !(
                                            String(k.targetId) === String(selectedOverlay.id) &&
                                            String(k.property).startsWith("maskPoint")
                                          )
                                      )
                                    );
                                  }
                                  updateSelectedOverlayField({
                                    mask: {
                                      enabled: true,
                                      shape: "polygon",
                                      feather: 10,
                                      radius: 8,
                                      ...(selectedOverlay.mask || {}),
                                      path: preset.path,
                                    },
                                  });
                                }}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="ap-flow-field-row" style={{ alignItems: "center", marginBottom: 4 }}>
                          <label className="ap-flow-checkbox-row" style={{ margin: 0 }}>
                            <input
                              type="checkbox"
                              data-testid="flow-mask-autokey-toggle"
                              checked={autoKeyMaskVertices}
                              onChange={e => setAutoKeyMaskVertices(e.target.checked)}
                            />
                            <span>Auto-Key Vertices</span>
                          </label>
                          <button
                            type="button"
                            className="ap-flow-mini-btn"
                            data-testid="flow-mask-stamp-keys"
                            onClick={() => stampMaskVertexKeyframes(selectedOverlay, pts, currentTime)}
                          >
                            + Key Vertices (@ {Number(currentTime || 0).toFixed(1)}s)
                          </button>
                        </div>
                        <svg
                          viewBox="0 0 100 100"
                          className="ap-flow-poly-mask-svg"
                          aria-label="Polygon mask vertex editor"
                          onPointerMove={e => {
                            if (draggingMaskVertex === null) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (!rect.width || !rect.height) return;
                            const nx = Math.max(
                              0,
                              Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                            );
                            const ny = Math.max(
                              0,
                              Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100))
                            );
                            const nextPts = pts.map((pt, idx) =>
                              idx === draggingMaskVertex ? [nx, ny] : pt
                            );
                            updateSelectedOverlayField({
                              mask: {
                                enabled: true,
                                shape: "polygon",
                                feather: 10,
                                radius: 8,
                                ...(selectedOverlay.mask || {}),
                                path: studioMaskPolygonPath(nextPts),
                              },
                            });
                            if (autoKeyMaskVertices) {
                              stampMaskVertexKeyframes(
                                selectedOverlay,
                                nextPts,
                                currentTime,
                                draggingMaskVertex
                              );
                            }
                          }}
                          onPointerUp={() => setDraggingMaskVertex(null)}
                          onPointerLeave={() => setDraggingMaskVertex(null)}
                        >
                          <polygon
                            points={polyPointsAttr}
                            fill="rgba(34, 211, 238, 0.18)"
                            stroke="#22d3ee"
                            strokeWidth="1.8"
                          />
                          {pts.map(([vx, vy], idx) => (
                            <circle
                              key={idx}
                              cx={vx}
                              cy={vy}
                              r="4.5"
                              fill={draggingMaskVertex === idx ? "#facc15" : "#22d3ee"}
                              stroke="#0f172a"
                              strokeWidth="1.5"
                              style={{ cursor: "grab" }}
                              data-testid={`flow-mask-vertex-${idx}`}
                              onPointerDown={e => {
                                e.stopPropagation();
                                setDraggingMaskVertex(idx);
                              }}
                            />
                          ))}
                        </svg>
                      </div>
                    );
                  })()}
                  <label className="ap-flow-field">
                    <span>Edge Feather ({Math.round(Number(selectedOverlay.mask?.feather ?? 10))}px)</span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="1"
                      value={Number(selectedOverlay.mask?.feather ?? 10)}
                      onMouseDown={() => onInteractionStart?.()}
                      onMouseUp={() => onInteractionEnd?.()}
                      onChange={e =>
                        updateSelectedOverlayField({
                          mask: {
                            ...(selectedOverlay.mask || { enabled: true, shape: "polygon" }),
                            feather: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="ap-flow-field">
                    <span>Corner Radius ({Math.round(Number(selectedOverlay.mask?.radius ?? 8))}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={Number(selectedOverlay.mask?.radius ?? 8)}
                      onMouseDown={() => onInteractionStart?.()}
                      onMouseUp={() => onInteractionEnd?.()}
                      onChange={e =>
                        updateSelectedOverlayField({
                          mask: {
                            ...(selectedOverlay.mask || { enabled: true, shape: "polygon" }),
                            radius: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="ap-flow-checkbox-row">
                    <input
                      type="checkbox"
                      data-testid="flow-inspector-mask-invert"
                      checked={Boolean(selectedOverlay.mask?.inverted)}
                      onChange={e =>
                        updateSelectedOverlayField({
                          mask: {
                            ...(selectedOverlay.mask || { enabled: true, shape: "polygon" }),
                            inverted: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Invert Matte Polarity</span>
                  </label>
                </div>
              )}

              {/* Merge Node Controls */}
              {selectedNode.kind === "Merge" && selectedOverlay && (
                <div className="ap-flow-inspector-controls">
                  <label className="ap-flow-field">
                    <span>Apply Mode</span>
                    <select
                      value={selectedOverlay.blendMode || "normal"}
                      onChange={e =>
                        updateSelectedOverlayField({ blendMode: e.target.value })
                      }
                    >
                      <option value="normal">Normal</option>
                      <option value="screen">Screen</option>
                      <option value="multiply">Multiply</option>
                      <option value="overlay">Overlay</option>
                      <option value="lighten">Lighten</option>
                    </select>
                  </label>
                  <label className="ap-flow-field">
                    <span>Blend / Opacity ({Math.round(Number(selectedOverlay.opacity ?? 1) * 100)}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={Number(selectedOverlay.opacity ?? 1)}
                      onMouseDown={() => onInteractionStart?.()}
                      onMouseUp={() => onInteractionEnd?.()}
                      onChange={e =>
                        updateSelectedOverlayField({ opacity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="ap-flow-field">
                    <span>Track Matte Channel</span>
                    <select
                      data-testid="flow-inspector-matte-mode"
                      value={selectedOverlay.trackMatte?.mode || "none"}
                      onChange={e => {
                        const nextMode = e.target.value;
                        const fallbackSource =
                          selectedOverlay.trackMatte?.sourceLayerId ||
                          overlays.find(
                            o =>
                              o &&
                              !o.isCaption &&
                              !o.isNullRig &&
                              String(o.id) !== String(selectedOverlay.id)
                          )?.id ||
                          null;
                        updateSelectedOverlayField({
                          trackMatte: {
                            mode: nextMode,
                            sourceLayerId: nextMode === "none" ? null : fallbackSource,
                          },
                        });
                      }}
                    >
                      <option value="none">No Matte</option>
                      <option value="alpha">Alpha Matte</option>
                      <option value="alpha_inverted">Alpha Inverted</option>
                      <option value="luma">Luma Matte</option>
                      <option value="luma_inverted">Luma Inverted</option>
                    </select>
                  </label>
                  {selectedOverlay.trackMatte?.mode &&
                    selectedOverlay.trackMatte.mode !== "none" && (
                      <label className="ap-flow-field">
                        <span>Matte Source Layer</span>
                        <select
                          data-testid="flow-inspector-matte-source"
                          value={selectedOverlay.trackMatte?.sourceLayerId || ""}
                          onChange={e => {
                            const nextOverlays = overlays.map(item =>
                              String(item.id) === String(selectedOverlay.id)
                                ? {
                                    ...item,
                                    trackMatte: {
                                      mode: selectedOverlay.trackMatte?.mode || "alpha",
                                      sourceLayerId: e.target.value || null,
                                    },
                                  }
                                : item
                            );
                            validateStudioTrackMattes(nextOverlays);
                            emitOverlays?.(nextOverlays);
                          }}
                        >
                          <option value="">Select Matte Layer…</option>
                          {overlays
                            .filter(
                              o =>
                                o &&
                                !o.isCaption &&
                                !o.isNullRig &&
                                String(o.id) !== String(selectedOverlay.id)
                            )
                            .map(candidate => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name || candidate.text || candidate.id}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                  <div className="ap-flow-field-row">
                    <button
                      type="button"
                      className="ap-flow-reset-btn"
                      onClick={() => {
                        const order = Array.isArray(compositionOrder) && compositionOrder.length
                          ? [...compositionOrder]
                          : overlays.filter(o => !o.isCaption).map(o => String(o.id));
                        const idx = order.indexOf(String(selectedOverlay.id));
                        if (idx > 0) {
                          const next = [...order];
                          const [item] = next.splice(idx, 1);
                          next.splice(idx - 1, 0, item);
                          emitCompositionOrder?.(next);
                        }
                      }}
                    >
                      ← Merge Earlier
                    </button>
                    <button
                      type="button"
                      className="ap-flow-reset-btn"
                      onClick={() => {
                        const order = Array.isArray(compositionOrder) && compositionOrder.length
                          ? [...compositionOrder]
                          : overlays.filter(o => !o.isCaption).map(o => String(o.id));
                        const idx = order.indexOf(String(selectedOverlay.id));
                        if (idx >= 0 && idx < order.length - 1) {
                          const next = [...order];
                          const [item] = next.splice(idx, 1);
                          next.splice(idx + 1, 0, item);
                          emitCompositionOrder?.(next);
                        }
                      }}
                    >
                      Merge Later →
                    </button>
                  </div>
                </div>
              )}

              {/* ColorCorrector Controls */}
              {selectedNode.kind === "ColorCorrector" && (
                <div className="ap-flow-inspector-controls" data-testid="flow-color-grade-suite">
                  {/* Live Broadcast Color Scopes (Waveform / RGB Parade / Vectorscope) */}
                  <div className="ap-flow-grade-subcard" data-testid="flow-color-scopes-card">
                    <div className="ap-flow-vector-editor-head">
                      <span>Broadcast Color Scopes</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[
                          { id: "waveform", label: "Waveform" },
                          { id: "parade", label: "RGB Parade" },
                          { id: "vectorscope", label: "Vectorscope" },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            data-testid={`flow-scope-mode-${tab.id}`}
                            className={`ap-flow-mini-btn ${scopeMode === tab.id ? "is-active" : ""}`}
                            onClick={() => setScopeMode(tab.id)}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 120 68"
                      className="ap-flow-scope-svg"
                      data-testid="flow-color-scope-svg"
                      data-scope-mode={scopeMode}
                      aria-label={`Broadcast ${scopeMode} scope`}
                    >
                      <rect x="0" y="0" width="120" height="68" fill="#060b16" rx="4" />
                      {scopeMode === "waveform" && (
                        <>
                          <line x1="0" y1="8" x2="120" y2="8" stroke="rgba(148,163,184,0.18)" strokeDasharray="2 2" />
                          <line x1="0" y1="34" x2="120" y2="34" stroke="rgba(148,163,184,0.22)" strokeDasharray="2 2" />
                          <line x1="0" y1="60" x2="120" y2="60" stroke="rgba(148,163,184,0.18)" strokeDasharray="2 2" />
                          {liveColorScopes.waveform.map((col, idx) => {
                            const x = 4 + (idx / Math.max(1, liveColorScopes.waveform.length - 1)) * 112;
                            const yMax = 62 - (col.max / 100) * 56;
                            const yMin = 62 - (col.min / 100) * 56;
                            const yAvg = 62 - (col.avg / 100) * 56;
                            return (
                              <g key={idx}>
                                <line
                                  x1={x}
                                  y1={yMax}
                                  x2={x}
                                  y2={Math.max(yMax + 1.5, yMin)}
                                  stroke="rgba(56, 189, 248, 0.42)"
                                  strokeWidth="2.4"
                                />
                                <circle cx={x} cy={yAvg} r="1.4" fill="#facc15" />
                              </g>
                            );
                          })}
                        </>
                      )}
                      {scopeMode === "parade" && (
                        <>
                          <line x1="40" y1="0" x2="40" y2="68" stroke="rgba(148,163,184,0.2)" />
                          <line x1="80" y1="0" x2="80" y2="68" stroke="rgba(148,163,184,0.2)" />
                          {[
                            { key: "r", color: "#f87171", offset: 2 },
                            { key: "g", color: "#4ade80", offset: 42 },
                            { key: "b", color: "#60a5fa", offset: 82 },
                          ].map(ch =>
                            (liveColorScopes.parade[ch.key] || []).map((col, idx, arr) => {
                              const x = ch.offset + (idx / Math.max(1, arr.length - 1)) * 35;
                              const yMax = 62 - (col.max / 100) * 56;
                              const yMin = 62 - (col.min / 100) * 56;
                              const yAvg = 62 - (col.avg / 100) * 56;
                              return (
                                <g key={`${ch.key}-${idx}`}>
                                  <line
                                    x1={x}
                                    y1={yMax}
                                    x2={x}
                                    y2={Math.max(yMax + 1.5, yMin)}
                                    stroke={ch.color}
                                    strokeOpacity="0.48"
                                    strokeWidth="1.4"
                                  />
                                  <circle cx={x} cy={yAvg} r="1.1" fill={ch.color} />
                                </g>
                              );
                            })
                          )}
                        </>
                      )}
                      {scopeMode === "vectorscope" && (() => {
                        const cx = 60;
                        const cy = 34;
                        const radius = 28;
                        const skinRad = (SKIN_TONE_LINE_ANGLE_DEG * Math.PI) / 180;
                        const skinX = cx + Math.cos(skinRad) * radius;
                        const skinY = cy - Math.sin(skinRad) * radius;
                        const avgX = cx + (liveColorScopes.vectorscope.avgCb || 0) * radius * 1.6;
                        const avgY = cy - (liveColorScopes.vectorscope.avgCr || 0) * radius * 1.6;
                        return (
                          <>
                            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(148,163,184,0.28)" strokeWidth="1" />
                            <circle cx={cx} cy={cy} r={radius * 0.5} fill="none" stroke="rgba(148,163,184,0.18)" strokeDasharray="2 2" />
                            <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke="rgba(148,163,184,0.2)" />
                            <line x1={cx} y1={cy - radius} x2={cx} y2={cy + radius} stroke="rgba(148,163,184,0.2)" />
                            {/* 123-deg Skin-Tone I-Line */}
                            <line
                              x1={cx}
                              y1={cy}
                              x2={skinX}
                              y2={skinY}
                              stroke="#f59e0b"
                              strokeWidth="1.4"
                              strokeDasharray="2 1"
                            />
                            <circle cx={ avgX } cy={ avgY } r="3" fill="#22d3ee" stroke="#0f172a" strokeWidth="1" />
                          </>
                        );
                      })()}
                    </svg>
                    <div className="ap-flow-scope-telemetry" data-testid="flow-color-scope-telemetry">
                      <span>IRE Avg: <strong>{liveColorScopes.lumaStats.avgLuma}%</strong></span>
                      <span>
                        RGB: <strong>{liveColorScopes.parade.meanR}/{liveColorScopes.parade.meanG}/{liveColorScopes.parade.meanB}</strong>
                      </span>
                      <span>
                        Skin I-Line: <strong>{liveColorScopes.vectorscope.skinToneCompliancePct}%</strong>
                      </span>
                    </div>
                  </div>

                  {/* Keyframeable Grade & Beat-Sync Pulses */}
                  <div className="ap-flow-grade-subcard" data-testid="flow-grade-keyframes-card">
                    <div className="ap-flow-vector-editor-head">
                      <span>Grade Keyframes ({normalizedFinishKeyframes.length})</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          className="ap-flow-mini-btn"
                          data-testid="flow-stamp-grade-keyframe"
                          onClick={() => {
                            const next = upsertFinishKeyframe(
                              normalizedFinishKeyframes,
                              currentTime,
                              finishFx
                            );
                            emitFinishKeyframes?.(next);
                          }}
                        >
                          + Keyframe Grade (@ {Number(currentTime || 0).toFixed(1)}s)
                        </button>
                        <button
                          type="button"
                          className="ap-flow-mini-btn"
                          data-testid="flow-beat-sync-grade"
                          onClick={() => {
                            const next = buildBeatSyncedGradePulses(finishFx, beatMarkers, {
                              existingKeyframes: normalizedFinishKeyframes,
                            });
                            emitFinishKeyframes?.(next);
                          }}
                        >
                          ⚡ Beat-Sync Pulses
                        </button>
                      </div>
                    </div>
                    {normalizedFinishKeyframes.length > 0 && (
                      <div
                        className="ap-flow-keyframe-pill-row"
                        data-testid="flow-grade-keyframe-list"
                      >
                        {normalizedFinishKeyframes.slice(0, 8).map(kf => (
                          <span key={kf.id} className="ap-flow-keyframe-pill">
                            <button
                              type="button"
                              className="ap-flow-keyframe-pill-seek"
                              onClick={() => {
                                onSeek?.(kf.time);
                                emitFinishFx?.({
                                  ...finishFx,
                                  ...(kf.values || {}),
                                });
                              }}
                            >
                              ◆ {Number(kf.time).toFixed(2)}s
                            </button>
                            <button
                              type="button"
                              className="ap-flow-keyframe-pill-del"
                              aria-label={`Delete grade keyframe at ${Number(kf.time).toFixed(2)}s`}
                              onClick={() =>
                                emitFinishKeyframes?.(
                                  normalizedFinishKeyframes.filter(item => item.id !== kf.id)
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="ap-flow-field">
                    <span>Cinema Look Preset</span>
                    <select
                      data-testid="flow-color-preset-select"
                      value={finishFx?.preset || "natural"}
                      onChange={e => {
                        const presetId = e.target.value;
                        const presetMeta = CINEMATIC_PRESETS[presetId] || CINEMATIC_PRESETS.natural || {};
                        emitFinishFx?.({
                          ...finishFx,
                          ...presetMeta,
                          preset: presetId,
                        });
                      }}
                    >
                      {Object.entries(CINEMATIC_PRESETS).map(([key, item]) => (
                        <option key={key} value={key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Primaries */}
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>Brightness ({Math.round(Number(finishFx?.brightness ?? 1) * 100)}%)</span>
                      <input
                        type="range"
                        min="0.65"
                        max="1.4"
                        step="0.02"
                        value={Number(finishFx?.brightness ?? 1)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            brightness: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>Contrast ({Math.round(Number(finishFx?.contrast ?? 1) * 100)}%)</span>
                      <input
                        type="range"
                        min="0.65"
                        max="1.75"
                        step="0.02"
                        value={Number(finishFx?.contrast ?? 1)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            contrast: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>Saturation ({Math.round(Number(finishFx?.saturation ?? 1) * 100)}%)</span>
                      <input
                        type="range"
                        min="0"
                        max="1.8"
                        step="0.02"
                        value={Number(finishFx?.saturation ?? 1)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            saturation: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>Warmth ({Number(finishFx?.temperature ?? 0).toFixed(2)})</span>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={Number(finishFx?.temperature ?? 0)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            temperature: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>Tint ({Number(finishFx?.tint ?? 0).toFixed(2)})</span>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={Number(finishFx?.tint ?? 0)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            tint: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>Clarity ({Math.round(Number(finishFx?.clarity ?? 0) * 100)}%)</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        value={Number(finishFx?.clarity ?? 0)}
                        onMouseDown={() => onInteractionStart?.()}
                        onMouseUp={() => onInteractionEnd?.()}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            clarity: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="ap-flow-field">
                    <span>Vignette ({Math.round(Number(finishFx?.vignette ?? 0) * 100)}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="0.85"
                      step="0.02"
                      value={Number(finishFx?.vignette ?? 0)}
                      onMouseDown={() => onInteractionStart?.()}
                      onMouseUp={() => onInteractionEnd?.()}
                      onChange={e =>
                        emitFinishFx?.({
                          ...finishFx,
                          vignette: Number(e.target.value),
                        })
                      }
                    />
                  </label>

                  {/* Precision 3-Way Color Wheels */}
                  <div className="ap-flow-grade-subcard" data-testid="flow-3way-wheels-card">
                    <div className="ap-flow-vector-editor-head">
                      <span>3-Way Color Wheels (Lift / Gamma / Gain)</span>
                      <label className="ap-flow-checkbox-row" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          data-testid="flow-precision-grade-toggle"
                          checked={finishFx?.precisionGrade !== false}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              precisionGrade: e.target.checked,
                            })
                          }
                        />
                        <span>Active</span>
                      </label>
                    </div>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Exposure ({Number(finishFx?.exposureStops ?? 0).toFixed(2)} EV)</span>
                        <input
                          type="range"
                          min="-2"
                          max="2"
                          step="0.05"
                          aria-label="Grade Exposure Stops"
                          value={Number(finishFx?.exposureStops ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              precisionGrade: true,
                              exposureStops: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Lift / Shadows ({Number(finishFx?.lift ?? 0).toFixed(2)})</span>
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.02"
                          aria-label="Grade Lift Shadows"
                          value={Number(finishFx?.lift ?? 0)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              precisionGrade: true,
                              lift: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Gamma / Mid ({Number(finishFx?.gamma ?? 1).toFixed(2)})</span>
                        <input
                          type="range"
                          min="0.35"
                          max="2.2"
                          step="0.02"
                          aria-label="Grade Gamma Midtones"
                          value={Number(finishFx?.gamma ?? 1)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              precisionGrade: true,
                              gamma: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Gain / High ({Number(finishFx?.gain ?? 1).toFixed(2)})</span>
                        <input
                          type="range"
                          min="0.4"
                          max="2.0"
                          step="0.02"
                          aria-label="Grade Gain Highlights"
                          value={Number(finishFx?.gain ?? 1)}
                          onMouseDown={() => onInteractionStart?.()}
                          onMouseUp={() => onInteractionEnd?.()}
                          onChange={e =>
                            emitFinishFx?.({
                              ...finishFx,
                              precisionGrade: true,
                              gain: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>

                  {/* 5-Knot Tone Curve & Global HSL Qualifier */}
                  <div className="ap-flow-grade-subcard" data-testid="flow-tone-curve-card">
                    <div className="ap-flow-vector-editor-head">
                      <span>5-Knot Tone Curve &amp; HSL</span>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        onClick={() =>
                          updateAdvancedColorPatch({
                            curve: { shadows: 0, midtones: 0, highlights: 0 },
                            hsl: { hue: 0, saturation: 1, luminance: 0 },
                          })
                        }
                      >
                        Flat
                      </button>
                    </div>
                    {(() => {
                      const sh = Number(resolvedAdvancedColor.curve?.shadows ?? 0);
                      const md = Number(resolvedAdvancedColor.curve?.midtones ?? 0);
                      const hi = Number(resolvedAdvancedColor.curve?.highlights ?? 0);
                      const y0 = 100;
                      const y1 = Math.max(4, Math.min(96, 75 - sh * 80));
                      const y2 = Math.max(4, Math.min(96, 50 - md * 80));
                      const y3 = Math.max(4, Math.min(96, 25 - hi * 80));
                      const y4 = 0;
                      const pathD = `M 0 ${y0} Q 18 ${y1}, 25 ${y1} T 50 ${y2} T 75 ${y3} L 100 ${y4}`;
                      return (
                        <svg
                          viewBox="0 0 100 100"
                          className="ap-flow-tone-curve-svg"
                          data-testid="flow-tone-curve-svg"
                          aria-label="Tone curve response preview"
                        >
                          <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(148,163,184,0.25)" strokeDasharray="3 3" />
                          <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.2" />
                          <circle cx="25" cy={y1} r="3" fill="#38bdf8" />
                          <circle cx="50" cy={y2} r="3" fill="#facc15" />
                          <circle cx="75" cy={y3} r="3" fill="#34d399" />
                        </svg>
                      );
                    })()}
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Curve Shadows ({Number(resolvedAdvancedColor.curve?.shadows ?? 0).toFixed(2)})</span>
                        <input
                          type="range"
                          min="-0.45"
                          max="0.45"
                          step="0.01"
                          aria-label="Curve Shadows"
                          value={Number(resolvedAdvancedColor.curve?.shadows ?? 0)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              curve: { shadows: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Curve Midtones ({Number(resolvedAdvancedColor.curve?.midtones ?? 0).toFixed(2)})</span>
                        <input
                          type="range"
                          min="-0.45"
                          max="0.45"
                          step="0.01"
                          aria-label="Curve Midtones"
                          value={Number(resolvedAdvancedColor.curve?.midtones ?? 0)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              curve: { midtones: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Curve Highs ({Number(resolvedAdvancedColor.curve?.highlights ?? 0).toFixed(2)})</span>
                        <input
                          type="range"
                          min="-0.45"
                          max="0.45"
                          step="0.01"
                          aria-label="Curve Highlights"
                          value={Number(resolvedAdvancedColor.curve?.highlights ?? 0)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              curve: { highlights: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>HSL Hue ({Math.round(Number(resolvedAdvancedColor.hsl?.hue ?? 0))}°)</span>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          aria-label="HSL Hue Shift"
                          value={Number(resolvedAdvancedColor.hsl?.hue ?? 0)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              hsl: { hue: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>HSL Sat ({Math.round(Number(resolvedAdvancedColor.hsl?.saturation ?? 1) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.02"
                          aria-label="HSL Saturation"
                          value={Number(resolvedAdvancedColor.hsl?.saturation ?? 1)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              hsl: { saturation: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>HSL Luma ({Number(resolvedAdvancedColor.hsl?.luminance ?? 0).toFixed(2)})</span>
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.02"
                          aria-label="HSL Luminance"
                          value={Number(resolvedAdvancedColor.hsl?.luminance ?? 0)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              hsl: { luminance: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>

                  {/* 3D .cube LUT Lab */}
                  <div className="ap-flow-grade-subcard" data-testid="flow-lut-lab-card">
                    <div className="ap-flow-vector-editor-head">
                      <span>3D .cube LUT Lab</span>
                      {resolvedAdvancedColor.lut && (
                        <button
                          type="button"
                          className="ap-flow-mini-btn"
                          data-testid="flow-remove-lut"
                          onClick={() =>
                            updateAdvancedColorPatch({
                              lut: null,
                              lutName: "",
                              lutPresetId: "",
                            })
                          }
                        >
                          Clear LUT
                        </button>
                      )}
                    </div>
                    <label className="ap-flow-field">
                      <span>Procedural 3D Cinema LUT</span>
                      <select
                        aria-label="Procedural 3D Cinema LUT"
                        data-testid="flow-lut-preset-select"
                        value={resolvedAdvancedColor.lutPresetId || ""}
                        onChange={e => {
                          const presetId = e.target.value;
                          if (!presetId) {
                            updateAdvancedColorPatch({
                              lut: null,
                              lutName: "",
                              lutPresetId: "",
                            });
                            return;
                          }
                          const cube = buildProceduralColorCube(presetId, 17);
                          const presetMeta = CINEMA_3D_LUT_PRESETS.find(p => p.id === presetId);
                          updateAdvancedColorPatch({
                            lut: cube,
                            lutPresetId: presetId,
                            lutName: presetMeta ? `${presetMeta.label}.cube` : `${presetId}.cube`,
                            lutIntensity: Number(resolvedAdvancedColor.lutIntensity ?? 1),
                          });
                        }}
                      >
                        <option value="">None (Direct Matrix / Curve)</option>
                        {CINEMA_3D_LUT_PRESETS.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.label} — {p.summary}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Import .cube File</span>
                        <input
                          type="file"
                          accept=".cube,text/plain"
                          aria-label="Import 3D LUT file"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const parsed = parseColorCube(await file.text());
                              updateAdvancedColorPatch({
                                lut: parsed,
                                lutName: file.name,
                                lutPresetId: "",
                              });
                            } catch (_err) {
                              // Ignore invalid file
                            }
                          }}
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>
                          LUT Mix ({Math.round(Number(resolvedAdvancedColor.lutIntensity ?? 1) * 100)}%)
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          aria-label="LUT Mix Intensity"
                          value={Number(resolvedAdvancedColor.lutIntensity ?? 1)}
                          onChange={e =>
                            updateAdvancedColorPatch({
                              lutIntensity: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="ap-flow-reset-btn"
                    data-testid="flow-reset-grade"
                    onClick={() => {
                      emitFinishFx?.({
                        ...finishFx,
                        preset: "natural",
                        brightness: 1,
                        contrast: 1,
                        saturation: 1,
                        temperature: 0,
                        tint: 0,
                        clarity: 0,
                        vignette: 0,
                        exposureStops: 0,
                        lift: 0,
                        gamma: 1,
                        gain: 1,
                        advancedColor: null,
                      });
                      emitAdvancedColor?.({
                        curve: { shadows: 0, midtones: 0, highlights: 0 },
                        hsl: { hue: 0, saturation: 1, luminance: 0 },
                        lut: null,
                        lutName: "",
                        lutPresetId: "",
                        lutIntensity: 1,
                      });
                    }}
                  >
                    Reset All Color &amp; LUTs
                  </button>
                </div>
              )}

              {/* Adjustment Grade Node Inspector */}
              {selectedNode.kind === "Adjustment" && selectedAdjustment && (
                <div className="ap-flow-inspector-controls">
                  <StudioAdjustmentControls
                    layer={selectedAdjustment}
                    onUpdate={nextLayer => {
                      emitAdjustmentLayers?.(
                        adjustmentLayers.map(a =>
                          String(a.id) === String(nextLayer.id) ? nextLayer : a
                        )
                      );
                    }}
                  />
                </div>
              )}

              {/* MediaOut / Pipeline Summary */}
              {(selectedNode.kind === "MediaOut" ||
                selectedNode.kind === "SubjectMatte" ||
                (selectedNode.kind === "MediaIn" && !selectedOverlay)) && (
                <div className="ap-flow-inspector-controls">
                  <div className="ap-flow-pipeline-summary">
                    <div>
                      <span>Active Spine Nodes</span>
                      <strong>
                        {graph.nodes.filter(n => !n.bypassed).length} / {graph.nodes.length}
                      </strong>
                    </div>
                    <div>
                      <span>Composite Branches</span>
                      <strong>
                        {graph.nodes.filter(n => n.kind === "Merge").length}
                      </strong>
                    </div>
                  </div>
                  {anyBypassed && (
                    <button
                      type="button"
                      className="ap-flow-reset-btn"
                      data-testid="flow-clear-bypasses"
                      onClick={() => {
                        updateFlowPatch({ bypassed: {} });
                        emitAdjustmentLayers?.(
                          adjustmentLayers.map(a => ({ ...a, enabled: true }))
                        );
                      }}
                    >
                      Restore All Bypassed Nodes
                    </button>
                  )}
                </div>
              )}

              <div className="ap-flow-inspector-hint">
                <span>
                  💡 <strong>Tip:</strong> Drag any output port (`Out`/`Link`) onto `Parent` or `Mask`, click a dashed wire to disconnect, or press `1`/`2` to route to the split viewer.
                </span>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
