import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from 'react-dom';
import {
  FLOW_NODE_KINDS,
  FLOW_NODE_PALETTE,
  SMART_FLOW_RIG_PRESETS,
  buildSmartFlowRigState,
  computeNodeFlowBounds,
  connectNodeFlowPorts as connectNodeFlowPortsUnsafe,
  createNodePaletteAddition,
  deleteNodeFromFlow,
  deriveNodeFlowGraph,
  describeNodeViewerSignal,
  disconnectNodeFlowPort,
  evaluateParameterLinks,
  spliceNodeIntoWire,
  toggleNodeFlowBypass,
  restoreAllNodeFlowBypasses,
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
  computeSmoothMaskBezierHandles,
  parseStudioMaskPolygon,
  studioMaskPolygonPath,
  validateStudioMaskAnimation,
} from "./studioMaskGeometry";
import { SKY_REPLACEMENT_PRESETS } from "./studioEnvironmentVfx";
import { STUDIO_EXPORT_BLEND_MODES } from "./studioBlendModes";
import { trackPolygonMaskAcrossFrames } from "./studioCreativeEffects";
import { trackPlanarCornersOnVideo } from "./studioPlanarTracker";
import {
  PERSPECTIVE_IDENTITY,
  PERSPECTIVE_LEFT,
  PERSPECTIVE_RIGHT,
  validateStudioPerspective,
} from "./studioPerspective";
import { CINEMATIC_PRESETS } from "../hooks/useCinematicEffects";
import {
  CINEMA_3D_LUT_PRESETS,
  buildAdvancedColorCube,
  buildProceduralColorCube,
  exportColorCubeText,
  parseColorCube,
} from "./studioColorCube";
import {
  CAMERA_COLOR_PROFILES,
  DEAD_CONTENT_REVITALIZER_PRESETS,
  FILM_EMULATION_PRESETS,
  HSL_QUALIFIER_PRESETS,
  POWER_WINDOW_PRESETS,
  diagnoseDeadFootageAndSolveRevival,
  solveShotMatchGrade,
} from "./studioColorScience";
import {
  parseStudioPresetBundle,
  serializeStudioPresetBundle,
} from "./studioPresetExchange";
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
import StudioNodeSignalViewer from "./StudioNodeSignalViewer";
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
      (targetNode.kind === "Transform" ||
        targetNode.kind === "NullRig" ||
        targetNode.kind === "CompoundMacro") &&
      targetNode.id !== "Transform:main-video" &&
      (pendingWire.fromNodeId.startsWith("NullRig:") ||
        pendingWire.fromNodeId.startsWith("CompoundMacro:") ||
        pendingWire.fromNodeId.startsWith("Transform:") ||
        pendingWire.fromNodeId.startsWith("Merge:"))
    );
  }
  if (inPort === "Mask") {
    if (pendingWire.fromNodeId.startsWith("SubjectMatte:")) {
      return false;
    }
    if (targetNode.kind === "Merge") {
      return (
        pendingWire.fromNodeId.startsWith("Transform:") ||
        pendingWire.fromNodeId.startsWith("GlowBlur:") ||
        pendingWire.fromNodeId.startsWith("MediaIn:") ||
        pendingWire.fromNodeId.startsWith("ChromaKeyer:") ||
        pendingWire.fromNodeId.startsWith("PolygonMask:")
      );
    }
    if (targetNode.kind === "Transform" || targetNode.kind === "CompoundMacro") {
      return (
        pendingWire.fromNodeId.startsWith("PolygonMask:") ||
        pendingWire.fromNodeId.startsWith("ChromaKeyer:")
      );
    }
    if (targetNode.kind === "ColorCorrector" || targetNode.kind === "Adjustment") {
      return (
        pendingWire.fromNodeId.startsWith("PolygonMask:") ||
        pendingWire.fromNodeId.startsWith("ChromaKeyer:") ||
        pendingWire.fromNodeId.startsWith("Transform:") ||
        pendingWire.fromNodeId.startsWith("MediaIn:")
      );
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
  onApplyNodeChange,
}) {
  const emitNodeFlow = onApplyNodeChange ? value => onApplyNodeChange({ nodeFlow: value }) : onChangeNodeFlow || onUpdateNodeFlow;
  const emitOverlays = onApplyNodeChange ? value => onApplyNodeChange({ overlays: value }) : onChangeOverlays || onUpdateOverlays;
  const emitCompositionOrder = onApplyNodeChange ? value => onApplyNodeChange({ compositionOrder: value }) : onChangeCompositionOrder || onUpdateCompositionOrder;
  const emitAdjustmentLayers = onApplyNodeChange ? value => onApplyNodeChange({ adjustmentLayers: value }) : onChangeAdjustmentLayers || onUpdateAdjustmentLayers;
  const emitFinishFx = onApplyNodeChange ? value => onApplyNodeChange({ finishFx: value }) : onChangeFinishFx || onUpdateFinishFx;
  const emitFinishKeyframes = onApplyNodeChange ? value => onApplyNodeChange({ finishKeyframes: value }) : onChangeFinishKeyframes || onUpdateFinishKeyframes;
  const emitAdvancedColor = onApplyNodeChange ? value => onApplyNodeChange({ advancedColor: value }) : onChangeAdvancedColor || onUpdateAdvancedColor;
  const emitMainTransform = onApplyNodeChange ? value => onApplyNodeChange({ mainTransform: value }) : onChangeMainTransform || onUpdateMainTransform;
  const emitMotionKeyframes = onApplyNodeChange ? value => onApplyNodeChange({ motionKeyframes: value }) : onChangeMotionKeyframes || onUpdateMotionKeyframes;

  const [actionError, setActionError] = useState("");
  const [expandedWorkspace, setExpandedWorkspace] = useState(false);
  const rootRef = useRef(null);
  const completedPortOnMouseUp = useRef(null);
  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 8, y: 6 });
  const [selectedNodeId, setSelectedNodeId] = useState("MediaOut");
  const [selectedVectorNodeIdx, setSelectedVectorNodeIdx] = useState(0);
  const [draggingMaskVertex, setDraggingMaskVertex] = useState(null);
  const [draggingBezierHandle, setDraggingBezierHandle] = useState(null);
  const [maskTrackBusy, setMaskTrackBusy] = useState(false);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState(null);
  const [autoKeyMaskVertices, setAutoKeyMaskVertices] = useState(false);
  const [scopeMode, setScopeMode] = useState("waveform");
  const [shotMatchRefPixels, setShotMatchRefPixels] = useState(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState("");
  const [paramLinkTargetProp, setParamLinkTargetProp] = useState("scale");
  const [paramLinkSourceId, setParamLinkSourceId] = useState("main-video");
  const [paramLinkSourceProp, setParamLinkSourceProp] = useState("scale");
  const [paramLinkMult, setParamLinkMult] = useState(1);
  const [paramLinkOffset, setParamLinkOffset] = useState(0);
  const [draggingNode, setDraggingNode] = useState(null);
  const [panningCanvas, setPanningCanvas] = useState(null);
  const [pendingWire, setPendingWire] = useState(null);
  const [hoverPort, setHoverPort] = useState(null);
  const [showSplitCompare, setShowSplitCompare] = useState(false);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const canvasWrapRef = useRef(null);
  const viewerScreenRef = useRef(null);

  useEffect(() => {
    if (!expandedWorkspace) return undefined;
    const previous=document.activeElement;
    const root=rootRef.current;
    const focusable=()=>[...root.querySelectorAll('button,input,select,[tabindex="0"]')]
      .filter(element=>!element.disabled&&element.getClientRects().length);
    const trap=event=>{
      if(event.key!=='Tab')return;
      const controls=focusable();if(!controls.length)return;
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    };
    root.addEventListener('keydown',trap);
    return ()=>{root.removeEventListener('keydown',trap);previous?.focus?.()};
  },[expandedWorkspace]);

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
  const connectNodeFlowPorts=useCallback((...args)=>{try{return connectNodeFlowPortsUnsafe(...args)}catch(error){setActionError(error.message);return null;}},[]);

  const updateFlowPatch = useCallback(
    patch => {
      if (typeof emitNodeFlow === "function") {
        const base = nodeFlow && typeof nodeFlow === "object" ? nodeFlow : {};
        emitNodeFlow({
          ...base,
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
      if (!res) return false;
      if (typeof onApplyNodeChange === 'function') {
        const patch={};
        for(const field of ['overlays','compositionOrder','adjustmentLayers','finishFx','advancedColor',
          'nodeFlow','mainTransform','motionKeyframes','finishKeyframes'])
          if(Object.prototype.hasOwnProperty.call(res,field))patch[field]=res[field];
        if(onApplyNodeChange(patch)===false){setActionError('This change is unavailable for the selected layer or a locked track. Corner Pin needs an ordinary image or video plane without masks or crop.');return false;}
        setActionError('');
        if(res.selectNodeId)setSelectedNodeId(res.selectNodeId);
        return true;
      }
      if (res.mainTransform && typeof emitMainTransform === 'function') emitMainTransform(res.mainTransform);
      if (res.motionKeyframes && typeof emitMotionKeyframes === 'function') emitMotionKeyframes(res.motionKeyframes);
      if (res.finishKeyframes && typeof emitFinishKeyframes === 'function') emitFinishKeyframes(res.finishKeyframes);
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
      if (res.advancedColor && typeof emitAdvancedColor === "function") {
        emitAdvancedColor(res.advancedColor);
      }
      if (res.nodeFlow && typeof emitNodeFlow === "function") {
        const base = res.nodeFlow;
        emitNodeFlow({
          ...base,
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
      onApplyNodeChange,
      emitMainTransform,
      emitMotionKeyframes,
      emitFinishKeyframes,
      emitOverlays,
      emitCompositionOrder,
      emitAdjustmentLayers,
      emitFinishFx,
      emitAdvancedColor,
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
        { overlays, adjustmentLayers, nodeFlow, mainTransform, finishFx, advancedColor, motionKeyframes, finishKeyframes },
        node.id
      );
      applyCanonicalGraphResult(res);
    },
    [overlays, adjustmentLayers, nodeFlow, mainTransform, finishFx, advancedColor, motionKeyframes, finishKeyframes, applyCanonicalGraphResult]
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
          finishFx, advancedColor, finishKeyframes,
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
      nodeFlow, finishFx, advancedColor, finishKeyframes,
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
      if (!(e.target instanceof Node) || !rootRef.current?.contains(e.target)) return;
      if (e.key === "Escape" && quickSearchOpen) {
        e.preventDefault();
        setQuickSearchOpen(false);
        return;
      }
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) {
        return;
      }
      if (e.key === "/" || (e.shiftKey && e.code === "Space")) {
        e.preventDefault();
        setQuickSearchQuery("");
        setQuickSearchOpen(true);
      } else if (e.key === "1" && selectedNode) {
        e.preventDefault();
        handleAssignViewer("A", selectedNode.id);
      } else if (e.key === "2" && selectedNode) {
        e.preventDefault();
        handleAssignViewer("B", selectedNode.id);
      } else if (e.key === "Escape" && pendingWire) {
        setPendingWire(null);
      } else if (e.key === "Escape" && expandedWorkspace) {
        setExpandedWorkspace(false);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedNode?.removable) {
        e.preventDefault();
        handleDeleteNode(selectedNode);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode, pendingWire, quickSearchOpen, expandedWorkspace, handleAssignViewer, handleDeleteNode]);

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
      try {
      setActionError("");
      const res = connectNodeFlowPorts(
        {
          overlays,
          compositionOrder,
          adjustmentLayers,
          finishFx,
          advancedColor,
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
      } catch(error) { setActionError(error.message); }
      setPendingWire(null);
    },
    [
      pendingWire,
      connectNodeFlowPorts,
      overlays,
      compositionOrder,
      adjustmentLayers,
      finishFx,
      advancedColor,
      motionKeyframes,
      mainTransform,
      currentTime,
      applyCanonicalGraphResult,
    ]
  );

  const handlePortClick = (e, node, side, portName) => {
    e.stopPropagation();
    if (side === "out") {
      setPendingWire({ fromNodeId: node.id, fromPort: portName });
      return;
    }

    if (side === "in") {
      const completed=completedPortOnMouseUp.current;
      if(completed?.nodeId===node.id&&completed.port===portName) {
        completedPortOnMouseUp.current=null;
        return;
      }
      if (!pendingWire) {
        if (portName === "Parent" || portName === "Mask") {
          const res = disconnectNodeFlowPort(
            {
              overlays,
              adjustmentLayers,
              finishFx,
              advancedColor,
              motionKeyframes,
              mainTransform,
            },
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
    try {
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
    } catch(error) { setActionError(error.message); }
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

  const sampleCurrentVideoRgba = useCallback(() => {
    const media = videoRef?.current;
    if (!media || typeof document === "undefined") return null;
    try {
      const probe = document.createElement("canvas");
      probe.width = 48;
      probe.height = 27;
      const ctx = probe.getContext?.("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(media, 0, 0, 48, 27);
      return ctx.getImageData(0, 0, 48, 27).data;
    } catch (_err) {
      return null;
    }
  }, [videoRef]);

  const resolvedAdvancedColor = useMemo(() => {
    const raw = advancedColor || finishFx?.advancedColor || {};
    return {
      ...raw,
      maskSourceNodeId: raw.maskSourceNodeId || finishFx?.advancedColor?.maskSourceNodeId || finishFx?.maskSourceNodeId || null,
      maskInvert: raw.maskInvert === true,
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
      lut: raw.lut || raw.lutData || null,
      lutData: raw.lutData || raw.lut || null,
      lutName: raw.lutName || "",
      lutPresetId: raw.lutPresetId || "",
      lutIntensity: Number(raw.lutIntensity ?? 1),
      cameraProfile: raw.cameraProfile || "rec709",
      qualifierPresetId: raw.qualifierPresetId || "",
      qualifier: raw.qualifier || null,
      powerWindowPresetId: raw.powerWindowPresetId || "",
      powerWindow: raw.powerWindow || null,
    };
  }, [advancedColor, finishFx?.advancedColor, finishFx?.maskSourceNodeId]);

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

  const scopeCanvasRef = useRef(null);
  const [liveVideoFrameBytes, setLiveVideoFrameBytes] = useState(null);

  useEffect(() => {
    const videoEl = videoRef?.current;
    if (!videoEl || typeof document === "undefined") {
      setLiveVideoFrameBytes(null);
      return undefined;
    }
    const sampleFrame = () => {
      try {
        if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return;
        if (!scopeCanvasRef.current) {
          const c = document.createElement("canvas");
          c.width = 48;
          c.height = 27;
          scopeCanvasRef.current = c;
        }
        const ctx = scopeCanvasRef.current.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(videoEl, 0, 0, 48, 27);
        const imageData = ctx.getImageData(0, 0, 48, 27);
        if (imageData?.data?.length === 48 * 27 * 4) {
          setLiveVideoFrameBytes(new Uint8ClampedArray(imageData.data));
        }
      } catch (_) {
        setLiveVideoFrameBytes(null);
      }
    };
    sampleFrame();
    const events = ["loadeddata", "canplay", "seeked", "timeupdate"];
    events.forEach(ev => videoEl.addEventListener?.(ev, sampleFrame));
    return () => {
      events.forEach(ev => videoEl.removeEventListener?.(ev, sampleFrame));
    };
  }, [videoRef, currentTime, clipUrl]);

  const liveColorScopes = useMemo(
    () =>
      computeLiveGradeScopes({
        finishFx: interpolateFinishKeyframes(finishFx, normalizedFinishKeyframes, currentTime),
        advancedColor: resolvedAdvancedColor,
        rgbaBytes: liveVideoFrameBytes,
        width: 48,
        height: 27,
      }),
    [finishFx, normalizedFinishKeyframes, currentTime, resolvedAdvancedColor, liveVideoFrameBytes]
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

  const stampCornerPinKeyframes = useCallback(
    (targetOverlay, corners, atTime = currentTime, onlyIndex = null) => {
      if (!targetOverlay || typeof emitMotionKeyframes !== "function") return;
      const safeTime = Math.max(0, Number(atTime) || 0);
      let nextKeys = Array.isArray(motionKeyframes) ? [...motionKeyframes] : [];
      corners.forEach(([cx, cy], idx) => {
        if (onlyIndex !== null && idx !== onlyIndex) return;
        nextKeys = upsertAutomationKeyframe(nextKeys, {
          id: `pin-pt-${targetOverlay.id}-${idx}-x-${Math.round(safeTime * 100)}`,
          targetId: targetOverlay.id,
          property: `planeCorner${idx}X`,
          time: safeTime,
          value: Number(cx),
          easing: "linear",
        });
        nextKeys = upsertAutomationKeyframe(nextKeys, {
          id: `pin-pt-${targetOverlay.id}-${idx}-y-${Math.round(safeTime * 100)}`,
          targetId: targetOverlay.id,
          property: `planeCorner${idx}Y`,
          time: safeTime,
          value: Number(cy),
          easing: "linear",
        });
      });
      emitMotionKeyframes(nextKeys);
    },
    [currentTime, emitMotionKeyframes, motionKeyframes]
  );

  const anyBypassed = useMemo(
    () => graph.nodes.some(n => n.bypassed),
    [graph.nodes]
  );

  const workspace = (
    <div ref={rootRef} role={expandedWorkspace ? 'dialog' : 'region'} aria-label="Node Flow workspace"
      aria-modal={expandedWorkspace ? true : undefined}
      className={`ap-node-flow-root${expandedWorkspace ? ' is-expanded-workspace' : ''}`} data-testid="studio-node-flow">
      {actionError && <div role="alert" className="ap-flow-action-error">{actionError}</div>}
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
          <button type="button" className="ap-flow-ctrl-btn" data-testid="flow-expand-workspace"
            aria-pressed={expandedWorkspace}
            onClick={() => { setExpandedWorkspace(value => !value); requestAnimationFrame(() => handleFitView()); }}>
            {expandedWorkspace ? 'Return to Studio' : 'Expand workspace'}
          </button>
          <button
            type="button"
            className={`ap-flow-ctrl-btn ${quickSearchOpen ? "is-active" : ""}`}
            data-testid="flow-open-quick-search"
            onClick={() => {
              setQuickSearchQuery("");
              setQuickSearchOpen(prev => !prev);
            }}
            title="Open Instant Fuzzy Node Command Launcher (/ or Shift+Space)"
          >
            ⌕ Quick Node (/)
          </button>
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

      {/* Instant Fuzzy Node Command Launcher (/ or Shift+Space) */}
      {quickSearchOpen && (
        <div
          className="ap-flow-quick-search-modal"
          data-testid="flow-quick-search-modal"
          role="dialog"
          aria-label="Quick Node Command Launcher"
        >
          <div className="ap-flow-quick-search-head">
            <input
              type="search"
              data-testid="flow-quick-search-input"
              aria-label="Search signal nodes and rigs"
              placeholder="Search node to insert, splice into active branch, or jump to…"
              value={quickSearchQuery}
              onChange={e => setQuickSearchQuery(e.target.value)}
            />
            <button
              type="button"
              className="ap-flow-mini-btn"
              onClick={() => setQuickSearchOpen(false)}
            >
              Esc
            </button>
          </div>
          <div className="ap-flow-quick-search-list">
            {FLOW_NODE_PALETTE.filter(item => {
              const q = quickSearchQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                item.label.toLowerCase().includes(q) ||
                item.kind.toLowerCase().includes(q) ||
                (item.description || "").toLowerCase().includes(q)
              );
            }).map(item => (
              <div key={item.id} className="ap-flow-quick-search-item">
                <div>
                  <strong>+ {item.label}</strong>
                  <span>{item.description}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="ap-flow-mini-btn"
                    data-testid={`flow-quick-insert-${item.id}`}
                    onClick={() => {
                      handlePaletteAdd(item.id);
                      setQuickSearchOpen(false);
                    }}
                  >
                    Insert
                  </button>
                  <button
                    type="button"
                    className="ap-flow-mini-btn is-active"
                    data-testid={`flow-splice-into-branch-${item.id}`}
                    onClick={() => {
                      const activeWire =
                        graph.wires.find(
                          w => w.from === selectedNode?.id || w.to === selectedNode?.id
                        ) || graph.wires[0] || null;
                      const res = spliceNodeIntoWire(
                        {
                          overlays,
                          adjustmentLayers,
                          activeOverlayId: selectedOverlay?.id || activeOverlayId,
                        },
                        {
                          paletteId: item.id,
                          wire: activeWire,
                          currentTime,
                          programmeDuration,
                        }
                      );
                      applyCanonicalGraphResult(res);
                      setQuickSearchOpen(false);
                    }}
                  >
                    Splice Into Pipe
                  </button>
                </div>
              </div>
            ))}
            {SMART_FLOW_RIG_PRESETS.filter(rig => {
              const q = quickSearchQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                rig.label.toLowerCase().includes(q) ||
                (rig.description || "").toLowerCase().includes(q)
              );
            }).map(rig => (
              <div key={rig.id} className="ap-flow-quick-search-item">
                <div>
                  <strong>⚡ Rig: {rig.label}</strong>
                  <span>{rig.description}</span>
                </div>
                <button
                  type="button"
                  className="ap-flow-mini-btn"
                  data-testid={`flow-quick-rig-${rig.id}`}
                  onClick={() => {
                    handleInjectSmartRig(rig.id);
                    setQuickSearchOpen(false);
                  }}
                >
                  Build Rig
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  aria-pressed={isSelected}
                  aria-label={`${node.label} ${node.kind} node`}
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
                        aria-label={`${node.label} ${inPort} input`}
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
                            completedPortOnMouseUp.current={nodeId:node.id,port:inPort};
                            window.setTimeout(()=>{completedPortOnMouseUp.current=null;},0);
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
                        aria-label={`${node.label} ${outPort} output`}
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
              <div
                className="ap-flow-viewer-pane is-pane-a"
                style={{ width: "100%", clipPath: `inset(0 ${100-graph.splitPosition}% 0 0)` }}
              >
                <span className="ap-flow-pane-watermark">
                  [1] {viewerSignalA.label} — {viewerSignalA.badge}
                </span>
                <StudioNodeSignalViewer signal={viewerSignalA} videoRef={videoRef} overlays={overlays} time={currentTime} mapTime={mapTime} finishFx={finishFx} advancedColor={advancedColor} adjustmentLayers={adjustmentLayers} mainTransform={mainTransform} motionKeyframes={motionKeyframes} />
              </div>
              <div
                className="ap-flow-viewer-pane is-pane-b"
                style={{
                  left: 0,
                  width: "100%", clipPath: `inset(0 0 0 ${graph.splitPosition}%)`,
                }}
              >
                <span className="ap-flow-pane-watermark">
                  [2] {viewerSignalB.label} — {viewerSignalB.badge}
                </span>
                <StudioNodeSignalViewer signal={viewerSignalB} videoRef={videoRef} overlays={overlays} time={currentTime} mapTime={mapTime} finishFx={finishFx} advancedColor={advancedColor} adjustmentLayers={adjustmentLayers} mainTransform={mainTransform} motionKeyframes={motionKeyframes} />
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
                onKeyDown={e => {
                  if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
                  e.preventDefault();e.stopPropagation();
                  const next=e.key==='Home'?10:e.key==='End'?90:Math.max(10,Math.min(90,graph.splitPosition+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1)));
                  updateFlowPatch({splitPosition:next});
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

                      {/* 2.5D Virtual Camera Depth Plane & Rack Focus DOF */}
                      <div
                        className="ap-flow-grade-subcard"
                        data-testid="flow-depth-parallax-controls"
                      >
                        <p className="ap-flow-empty">Depth changes the layer’s perspective scale; defocus softens its pixels in preview and export.</p>
                        <div className="ap-flow-vector-editor-head">
                          <span>2.5D Depth &amp; Defocus</span>
                          <span className="ap-flow-node-chip">
                            Z {Math.round(Number(selectedOverlay.zDepth ?? 0))}
                          </span>
                        </div>
                        <div className="ap-flow-field-row">
                          <label className="ap-flow-field">
                            <span>
                              Z-Depth Plane ({Math.round(Number(selectedOverlay.zDepth ?? 0))})
                            </span>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              step="2"
                              data-testid="flow-zdepth-slider"
                              value={Number(selectedOverlay.zDepth ?? 0)}
                              onMouseDown={() => onInteractionStart?.()}
                              onMouseUp={() => onInteractionEnd?.()}
                              onChange={e =>
                                updateSelectedOverlayField({ zDepth: Number(e.target.value) })
                              }
                            />
                          </label>
                          <label className="ap-flow-field">
                            <span>
                              DOF Defocus ({Number(selectedOverlay.dofBlur ?? 0).toFixed(1)}px)
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="20"
                              step="0.5"
                              data-testid="flow-dof-blur-slider"
                              value={Number(selectedOverlay.dofBlur ?? 0)}
                              onMouseDown={() => onInteractionStart?.()}
                              onMouseUp={() => onInteractionEnd?.()}
                              onChange={e =>
                                updateSelectedOverlayField({ dofBlur: Number(e.target.value) })
                              }
                            />
                          </label>
                        </div>
                      </div>

                      {/* Cross-Node Parameter Expression Pick-Whip */}
                      <div
                        className="ap-flow-grade-subcard"
                        data-testid="flow-parameter-link-card"
                      >
                        <div className="ap-flow-vector-editor-head">
                          <span>Parameter Expression Pick-Whip</span>
                          <span className="ap-flow-node-chip">EXPR</span>
                        </div>
                        <div className="ap-flow-field-row">
                          <label className="ap-flow-field">
                            <span>Target Prop</span>
                            <select
                              data-testid="flow-param-link-target-prop"
                              value={paramLinkTargetProp}
                              onChange={e => setParamLinkTargetProp(e.target.value)}
                            >
                              <option value="scale">Scale</option>
                              <option value="rotation">Rotation</option>
                              <option value="opacity">Opacity</option>
                              <option value="x">Center X</option>
                              <option value="y">Center Y</option>
                            </select>
                          </label>
                          <label className="ap-flow-field">
                            <span>Source Node</span>
                            <select
                              data-testid="flow-param-link-source-id"
                              value={paramLinkSourceId}
                              onChange={e => setParamLinkSourceId(e.target.value)}
                            >
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
                                    {candidate.name || candidate.text || candidate.id}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="ap-flow-field">
                            <span>Source Channel</span>
                            <select
                              data-testid="flow-param-link-source-prop"
                              value={paramLinkSourceProp}
                              onChange={e => setParamLinkSourceProp(e.target.value)}
                            >
                              <option value="scale">Scale</option>
                              <option value="rotation">Rotation</option>
                              <option value="opacity">Opacity</option>
                              <option value="x">Center X</option>
                              <option value="y">Center Y</option>
                            </select>
                          </label>
                        </div>
                        <div className="ap-flow-field-row">
                          <label className="ap-flow-field">
                            <span>Multiplier (×{Number(paramLinkMult).toFixed(2)})</span>
                            <input
                              type="range"
                              min="-2"
                              max="3"
                              step="0.05"
                              data-testid="flow-param-link-mult"
                              value={paramLinkMult}
                              onChange={e => setParamLinkMult(Number(e.target.value))}
                            />
                          </label>
                          <label className="ap-flow-field">
                            <span>Offset ({Number(paramLinkOffset).toFixed(1)})</span>
                            <input
                              type="range"
                              min="-50"
                              max="50"
                              step="1"
                              data-testid="flow-param-link-offset"
                              value={paramLinkOffset}
                              onChange={e => setParamLinkOffset(Number(e.target.value))}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="ap-flow-mini-btn is-active"
                          data-testid="flow-bind-param-link"
                          onClick={() => {
                            const nextLinks = {
                              ...(selectedOverlay.parameterLinks || {}),
                              [paramLinkTargetProp]: {
                                enabled: true,
                                sourceLayerId: paramLinkSourceId,
                                sourceProperty: paramLinkSourceProp,
                                multiplier: Number(paramLinkMult),
                                offset: Number(paramLinkOffset),
                              },
                            };
                            const updatedOverlays = overlays.map(item =>
                              String(item.id) === String(selectedOverlay.id)
                                ? { ...item, parameterLinks: nextLinks }
                                : item
                            );
                            try {
                              setActionError("");
                              emitOverlays?.(evaluateParameterLinks(updatedOverlays, mainTransform));
                            } catch(error) { setActionError(error.message); }
                          }}
                        >
                          ⛓ Bind Expression ({paramLinkTargetProp} = {paramLinkSourceId}.{paramLinkSourceProp} × {paramLinkMult})
                        </button>
                        {selectedOverlay.parameterLinks &&
                          Object.entries(selectedOverlay.parameterLinks).map(
                            ([prop, link]) =>
                              link?.enabled !== false && (
                                <div
                                  key={prop}
                                  className="ap-flow-param-link-pill"
                                  data-testid={`flow-active-param-link-${prop}`}
                                >
                                  <span>
                                    {prop} ← {link.sourceLayerId}.{link.sourceProperty} ×{" "}
                                    {link.multiplier ?? 1}
                                  </span>
                                  <button
                                    type="button"
                                    className="ap-flow-mini-btn"
                                    onClick={() => {
                                      const nextLinks = {
                                        ...(selectedOverlay.parameterLinks || {}),
                                      };
                                      delete nextLinks[prop];
                                      updateSelectedOverlayField({
                                        parameterLinks: nextLinks,
                                      });
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              )
                          )}
                      </div>
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

                      {/* Optical Halation, Anamorphic Streak & Turbulent Displacement Warp */}
                      {["image","video"].includes(selectedOverlay.type) && <div
                        className="ap-flow-grade-subcard"
                        data-testid="flow-optical-displacement-controls"
                      >
                        <p className="ap-flow-empty">Highlight bloom, horizontal streaks and animated warp apply before the layer mask.</p>
                        <div className="ap-flow-vector-editor-head">
                          <span>Optical Halation &amp; Displacement Warp</span>
                          <span className="ap-flow-node-chip">OPTICAL</span>
                        </div>
                        <div className="ap-flow-field-row">
                          <label className="ap-flow-field">
                            <span>
                              Halation Bloom ({Math.round(Number(selectedOverlay.opticalFx?.halation ?? 0) * 100)}%)
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              data-testid="flow-optical-halation-slider"
                              value={Number(selectedOverlay.opticalFx?.halation ?? 0)}
                              onChange={e =>
                                updateSelectedOverlayField({
                                  opticalFx: {
                                    ...(selectedOverlay.opticalFx || {}),
                                    halation: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="ap-flow-field">
                            <span>
                              Anamorphic Streak ({Math.round(Number(selectedOverlay.opticalFx?.anamorphicStreak ?? 0) * 100)}%)
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              data-testid="flow-anamorphic-streak-slider"
                              value={Number(selectedOverlay.opticalFx?.anamorphicStreak ?? 0)}
                              onChange={e =>
                                updateSelectedOverlayField({
                                  opticalFx: {
                                    ...(selectedOverlay.opticalFx || {}),
                                    anamorphicStreak: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <label className="ap-flow-checkbox-row">
                          <input
                            type="checkbox"
                            data-testid="flow-displacement-warp-toggle"
                            checked={Boolean(selectedOverlay.displacementWarp?.enabled)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                displacementWarp: {
                                  amountX: 8,
                                  amountY: 6,
                                  frequency: 2.2,
                                  ...(selectedOverlay.displacementWarp || {}),
                                  enabled: e.target.checked,
                                },
                              })
                            }
                          />
                          <span>Turbulent Displacement / Heat Haze Warp</span>
                        </label>
                        {selectedOverlay.displacementWarp?.enabled && (
                          <div className="ap-flow-field-row">
                            <label className="ap-flow-field">
                              <span>
                                Warp X ({Math.round(Number(selectedOverlay.displacementWarp?.amountX ?? 8))}px)
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="40"
                                step="1"
                                data-testid="flow-displacement-x-slider"
                                value={Number(selectedOverlay.displacementWarp?.amountX ?? 8)}
                                onChange={e =>
                                  updateSelectedOverlayField({
                                    displacementWarp: {
                                      ...(selectedOverlay.displacementWarp || {}),
                                      enabled: true,
                                      amountX: Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </label>
                            <label className="ap-flow-field">
                              <span>
                                Warp Y ({Math.round(Number(selectedOverlay.displacementWarp?.amountY ?? 6))}px)
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="40"
                                step="1"
                                data-testid="flow-displacement-y-slider"
                                value={Number(selectedOverlay.displacementWarp?.amountY ?? 6)}
                                onChange={e =>
                                  updateSelectedOverlayField({
                                    displacementWarp: {
                                      ...(selectedOverlay.displacementWarp || {}),
                                      enabled: true,
                                      amountY: Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}
                      </div>}
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
                        <div className="ap-flow-field-row" style={{ alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
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
                          <button
                            type="button"
                            className="ap-flow-mini-btn"
                            data-testid="flow-mask-bezier-toggle"
                            onClick={() => {
                              const hasCurves = Array.isArray(selectedOverlay.mask?.bezierHandles) && selectedOverlay.mask.bezierHandles.length === pts.length;
                              updateSelectedOverlayField({
                                mask: {
                                  enabled: true,
                                  shape: "polygon",
                                  ...(selectedOverlay.mask || {}),
                                  bezierHandles: hasCurves ? undefined : computeSmoothMaskBezierHandles(pts, 0.28),
                                },
                              });
                            }}
                          >
                            {Array.isArray(selectedOverlay.mask?.bezierHandles) && selectedOverlay.mask.bezierHandles.length === pts.length
                              ? "Linearize"
                              : "Auto Bézier"}
                          </button>
                          <button
                            type="button"
                            className="ap-flow-mini-btn"
                            data-testid="flow-mask-track-frames"
                            disabled={maskTrackBusy}
                            onClick={async () => {
                              const vid = videoRef?.current;
                              if (!vid || !vid.videoWidth || typeof emitMotionKeyframes !== "function") {
                                setActionError("Load a playing video frame before running automated mask tracking.");
                                return;
                              }
                              setMaskTrackBusy(true);
                              setActionError("");
                              try {
                                const t0 = Math.max(0, Number(currentTime || 0));
                                const dur = Math.min(3.0, Math.max(0.5, Number(programmeDuration || 4) - t0));
                                const trackedKeys = await trackPolygonMaskAcrossFrames({
                                  videoElement: vid,
                                  initialPoints: pts,
                                  startTime: t0,
                                  duration: dur,
                                  targetId: selectedOverlay.id,
                                  fps: 8,
                                });
                                let merged = Array.isArray(motionKeyframes) ? [...motionKeyframes] : [];
                                trackedKeys.forEach(k => { merged = upsertAutomationKeyframe(merged, k); });
                                emitMotionKeyframes(merged);
                              } catch (err) {
                                setActionError(err?.message || "Mask tracking could not complete.");
                              } finally {
                                setMaskTrackBusy(false);
                              }
                            }}
                          >
                            {maskTrackBusy ? "Tracking…" : "Track Mask"}
                          </button>
                        </div>
                        <svg
                          viewBox="0 0 100 100"
                          className="ap-flow-poly-mask-svg"
                          aria-label="Polygon mask vertex editor"
                          onPointerMove={e => {
                            if (draggingMaskVertex === null && !draggingBezierHandle) return;
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
                            if (draggingBezierHandle) {
                              const { idx: hIdx, side } = draggingBezierHandle;
                              const baseHandles = Array.isArray(selectedOverlay.mask?.bezierHandles) && selectedOverlay.mask.bezierHandles.length === pts.length
                                ? selectedOverlay.mask.bezierHandles.map(h => [...h])
                                : computeSmoothMaskBezierHandles(pts, 0.25);
                              const [vx, vy] = pts[hIdx] || [50, 50];
                              const dx = Math.max(-100, Math.min(100, nx - vx));
                              const dy = Math.max(-100, Math.min(100, ny - vy));
                              const hTuple = baseHandles[hIdx] || [0, 0, 0, 0];
                              baseHandles[hIdx] = side === "in"
                                ? [dx, dy, hTuple[2], hTuple[3]]
                                : [hTuple[0], hTuple[1], dx, dy];
                              updateSelectedOverlayField({
                                mask: {
                                  enabled: true,
                                  shape: "polygon",
                                  ...(selectedOverlay.mask || {}),
                                  bezierHandles: baseHandles,
                                },
                              });
                              return;
                            }
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
                          onPointerUp={() => {
                            setDraggingMaskVertex(null);
                            setDraggingBezierHandle(null);
                          }}
                          onPointerLeave={() => {
                            setDraggingMaskVertex(null);
                            setDraggingBezierHandle(null);
                          }}
                        >
                          {(() => {
                            const bezHandles = Array.isArray(selectedOverlay.mask?.bezierHandles) && selectedOverlay.mask.bezierHandles.length === pts.length
                              ? selectedOverlay.mask.bezierHandles
                              : null;
                            if (bezHandles) {
                              let d = "";
                              for (let i = 0; i < pts.length; i += 1) {
                                const nxt = (i + 1) % pts.length;
                                const [x0, y0] = pts[i], [x3, y3] = pts[nxt];
                                const h0 = bezHandles[i] || [0, 0, 0, 0], h1 = bezHandles[nxt] || [0, 0, 0, 0];
                                d += i === 0
                                  ? `M ${x0} ${y0} C ${x0 + h0[2]} ${y0 + h0[3]}, ${x3 + h1[0]} ${y3 + h1[1]}, ${x3} ${y3} `
                                  : `C ${x0 + h0[2]} ${y0 + h0[3]}, ${x3 + h1[0]} ${y3 + h1[1]}, ${x3} ${y3} `;
                              }
                              return (
                                <>
                                  <path d={`${d}Z`} fill="rgba(34, 211, 238, 0.18)" stroke="#22d3ee" strokeWidth="1.8" />
                                  {pts.map(([vx, vy], idx) => {
                                    const [ix, iy, ox, oy] = bezHandles[idx] || [0, 0, 0, 0];
                                    return (
                                      <g key={`bh-${idx}`}>
                                        <line x1={vx + ix} y1={vy + iy} x2={vx + ox} y2={vy + oy} stroke="#f59e0b" strokeWidth="0.9" strokeDasharray="1.8,1.2" />
                                        <circle cx={vx + ix} cy={vy + iy} r="2.6" fill="#f59e0b" style={{ cursor: "grab" }}
                                          data-testid={`flow-mask-bezier-in-${idx}`}
                                          onPointerDown={e => { e.stopPropagation(); setDraggingBezierHandle({ idx, side: "in" }); }} />
                                        <circle cx={vx + ox} cy={vy + oy} r="2.6" fill="#fb923c" style={{ cursor: "grab" }}
                                          data-testid={`flow-mask-bezier-out-${idx}`}
                                          onPointerDown={e => { e.stopPropagation(); setDraggingBezierHandle({ idx, side: "out" }); }} />
                                      </g>
                                    );
                                  })}
                                </>
                              );
                            }
                            return (
                              <polygon
                                points={polyPointsAttr}
                                fill="rgba(34, 211, 238, 0.18)"
                                stroke="#22d3ee"
                                strokeWidth="1.8"
                              />
                            );
                          })()}
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

                  {/* Multi-Mask Boolean Chaining Stack (Add / Subtract / Intersect / Difference) */}
                  <div
                    className="ap-flow-grade-subcard"
                    data-testid="flow-boolean-mask-stack"
                  >
                    <div className="ap-flow-vector-editor-head">
                      <span>Multi-Mask Boolean Stack</span>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-add-boolean-submask"
                        disabled={(selectedOverlay.mask?.secondaryMasks?.length||0)>=8}
                        onClick={() => {
                          const existing = Array.isArray(selectedOverlay.mask?.secondaryMasks)
                            ? selectedOverlay.mask.secondaryMasks
                            : [];
                          const nextSub = {
                            id: `submask-${Date.now()}-${existing.length + 1}`,
                            shape: "ellipse",
                            booleanOp: "subtract",
                            feather: 12,
                            inverted: false,
                          };
                          updateSelectedOverlayField({
                            mask: {
                              ...(selectedOverlay.mask || { enabled: true, shape: "polygon" }),
                              booleanMode: selectedOverlay.mask?.booleanMode || "add",
                              secondaryMasks: [...existing, nextSub],
                            },
                          });
                        }}
                      >
                        + Add Sub-Mask
                      </button>
                    </div>
                    <label className="ap-flow-field">
                      <span>Primary Boolean Mode</span>
                      <select
                        data-testid="flow-mask-boolean-op"
                        value={selectedOverlay.mask?.booleanMode || "add"}
                        onChange={e =>
                          updateSelectedOverlayField({
                            mask: {
                              ...(selectedOverlay.mask || { enabled: true, shape: "polygon" }),
                              booleanMode: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="add">Union / Add (A ∪ B)</option>
                        <option value="subtract">Subtract / Cutout (A − B)</option>
                        <option value="intersect">Intersect Matte (A ∩ B)</option>
                        <option value="difference">XOR Difference (A ⊕ B)</option>
                      </select>
                    </label>
                    {(selectedOverlay.mask?.secondaryMasks || []).map((sub, idx) => (
                      <div
                        key={sub.id || idx}
                        className="ap-flow-submask-card"
                        style={{ display: "grid", gap: 6 }}
                        data-testid={`flow-boolean-submask-row-${idx}`}
                      >
                        <div className="ap-flow-field-row">
                          <select
                            aria-label={`Sub-mask ${idx + 1} boolean operator`}
                            data-testid={`flow-submask-op-${idx}`}
                            value={sub.booleanOp || "subtract"}
                            onChange={e => {
                              const nextList = (selectedOverlay.mask?.secondaryMasks || []).map(
                                (item, i) =>
                                  i === idx ? { ...item, booleanOp: e.target.value } : item
                              );
                              updateSelectedOverlayField({
                                mask: {
                                  ...(selectedOverlay.mask || {}),
                                  secondaryMasks: nextList,
                                },
                              });
                            }}
                          >
                            <option value="add">Add</option>
                            <option value="subtract">Subtract</option>
                            <option value="intersect">Intersect</option>
                            <option value="difference">Difference</option>
                          </select>
                          <select
                            aria-label={`Sub-mask ${idx + 1} shape`}
                            data-testid={`flow-submask-shape-${idx}`}
                            value={sub.shape || "ellipse"}
                            onChange={e => {
                              const nextShape = e.target.value;
                              const nextList = (selectedOverlay.mask?.secondaryMasks || []).map(
                                (item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        shape: nextShape,
                                        ...(nextShape === "polygon" && !item.path
                                          ? { path: DEFAULT_STUDIO_MASK_POLYGON }
                                          : {}),
                                      }
                                    : item
                              );
                              updateSelectedOverlayField({
                                mask: {
                                  ...(selectedOverlay.mask || {}),
                                  secondaryMasks: nextList,
                                },
                              });
                            }}
                          >
                            <option value="ellipse">Ellipse</option>
                            <option value="rectangle">Rectangle</option>
                            <option value="diamond">Diamond</option>
                            <option value="inset">Inset</option>
                            <option value="polygon">Polygon</option>
                          </select>
                          <button
                            type="button"
                            className="ap-flow-mini-btn"
                            onClick={() => {
                              const nextList = (selectedOverlay.mask?.secondaryMasks || []).filter(
                                (_, i) => i !== idx
                              );
                              updateSelectedOverlayField({
                                mask: {
                                  ...(selectedOverlay.mask || {}),
                                  secondaryMasks: nextList,
                                },
                              });
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div className="ap-flow-field-row">
                          <label className="ap-flow-field" style={{ flex: 1 }}>
                            <span>Sub-Mask Feather ({Number(sub.feather ?? 0)}px)</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              data-testid={`flow-submask-feather-${idx}`}
                              value={Number(sub.feather ?? 0)}
                              onChange={e => {
                                const nextList = (selectedOverlay.mask?.secondaryMasks || []).map(
                                  (item, i) =>
                                    i === idx ? { ...item, feather: Number(e.target.value) } : item
                                );
                                updateSelectedOverlayField({
                                  mask: {
                                    ...(selectedOverlay.mask || {}),
                                    secondaryMasks: nextList,
                                  },
                                });
                              }}
                            />
                          </label>
                          <label className="ap-flow-checkbox" style={{ whiteSpace: "nowrap" }}>
                            <input
                              type="checkbox"
                              data-testid={`flow-submask-invert-${idx}`}
                              checked={Boolean(sub.inverted)}
                              onChange={e => {
                                const nextList = (selectedOverlay.mask?.secondaryMasks || []).map(
                                  (item, i) =>
                                    i === idx ? { ...item, inverted: e.target.checked } : item
                                );
                                updateSelectedOverlayField({
                                  mask: {
                                    ...(selectedOverlay.mask || {}),
                                    secondaryMasks: nextList,
                                  },
                                });
                              }}
                            />
                            <span>Invert</span>
                          </label>
                        </div>
                        {sub.shape === "polygon" && (
                          <label className="ap-flow-field">
                            <span>Sub-Mask Polygon Path</span>
                            <input
                              type="text"
                              data-testid={`flow-submask-path-${idx}`}
                              value={sub.path || DEFAULT_STUDIO_MASK_POLYGON}
                              onChange={e => {
                                const nextList = (selectedOverlay.mask?.secondaryMasks || []).map(
                                  (item, i) =>
                                    i === idx ? { ...item, path: e.target.value } : item
                                );
                                updateSelectedOverlayField({
                                  mask: {
                                    ...(selectedOverlay.mask || {}),
                                    secondaryMasks: nextList,
                                  },
                                });
                              }}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ChromaKeyer (Delta Chroma / Luma / HSL Keyer) Controls */}
              {selectedNode.kind === "ChromaKeyer" && selectedOverlay && (
                <div
                  className="ap-flow-inspector-controls"
                  data-testid="flow-chroma-keyer-controls"
                >
                  <p className="ap-flow-empty">The keyer removes the selected screen colour. Assign this node to a viewer to inspect its alpha matte.</p>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>Keyer Algorithm</span>
                      <select
                        data-testid="flow-chroma-mode-select"
                        value={selectedOverlay.chromaKey?.mode || "chroma"}
                        onChange={e =>
                          updateSelectedOverlayField({
                            chromaKey: {
                              enabled: true,
                              keyColor: "#00d455",
                              similarity: 0.32,
                              smoothness: 0.14,
                              spillSuppression: 0.48,
                              ...(selectedOverlay.chromaKey || {}),
                              mode: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="chroma">Delta Chroma Key (Green / Blue Screen)</option>
                        <option value="luma">Luminance Matte Keyer</option>
                        <option value="hsl_delta">Hue / Saturation Screen Key</option>
                      </select>
                    </label>
                    <label className="ap-flow-field is-color">
                      <span>Key Screen Color</span>
                      <input
                        type="color"
                        data-testid="flow-chroma-color-input"
                        disabled={selectedOverlay.chromaKey?.mode==='luma'}
                        value={
                          /^#[0-9a-fA-F]{6}$/.test(selectedOverlay.chromaKey?.keyColor || "")
                            ? selectedOverlay.chromaKey.keyColor
                            : "#00d455"
                        }
                        onChange={e =>
                          updateSelectedOverlayField({
                            chromaKey: {
                              enabled: true,
                              ...(selectedOverlay.chromaKey || {}),
                              keyColor: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>
                        Similarity ({Math.round(Number(selectedOverlay.chromaKey?.similarity ?? 0.32) * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0.02"
                        max="1"
                        step="0.02"
                        data-testid="flow-chroma-similarity-slider"
                        value={Number(selectedOverlay.chromaKey?.similarity ?? 0.32)}
                        onChange={e =>
                          updateSelectedOverlayField({
                            chromaKey: {
                              enabled: true,
                              ...(selectedOverlay.chromaKey || {}),
                              similarity: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>
                        Edge Smoothness ({Math.round(Number(selectedOverlay.chromaKey?.smoothness ?? 0.14) * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        data-testid="flow-chroma-smoothness-slider"
                        value={Number(selectedOverlay.chromaKey?.smoothness ?? 0.14)}
                        onChange={e =>
                          updateSelectedOverlayField({
                            chromaKey: {
                              enabled: true,
                              ...(selectedOverlay.chromaKey || {}),
                              smoothness: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>
                        Spill Suppression ({Math.round(Number(selectedOverlay.chromaKey?.spillSuppression ?? 0.48) * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        data-testid="flow-chroma-spill-slider"
                        disabled={selectedOverlay.chromaKey?.mode==='luma'}
                        value={Number(selectedOverlay.chromaKey?.spillSuppression ?? 0.48)}
                        onChange={e =>
                          updateSelectedOverlayField({
                            chromaKey: {
                              enabled: true,
                              ...(selectedOverlay.chromaKey || {}),
                              spillSuppression: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>
                        Matte Choke ({Math.round(Number(selectedOverlay.chromaKey?.choke ?? 0))}px)
                      </span>
                      <input
                        type="range"
                        min="-20"
                        max="20"
                        step="1"
                        data-testid="flow-chroma-choke-slider"
                        value={Number(selectedOverlay.chromaKey?.choke ?? 0)}
                        onChange={e =>
                          updateSelectedOverlayField({
                            chromaKey: {
                              enabled: true,
                              ...(selectedOverlay.chromaKey || {}),
                              choke: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="ap-flow-checkbox-row">
                    <input
                      type="checkbox"
                      data-testid="flow-chroma-invert-toggle"
                      checked={Boolean(selectedOverlay.chromaKey?.invert)}
                      onChange={e =>
                        updateSelectedOverlayField({
                          chromaKey: {
                            enabled: true,
                            ...(selectedOverlay.chromaKey || {}),
                            invert: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Invert Keyed Alpha Matte</span>
                  </label>
                  <button
                    type="button"
                    className="ap-flow-mini-btn"
                    data-testid="flow-chroma-stamp-keys"
                    onClick={() => {
                      if (typeof emitMotionKeyframes !== "function") return;
                      const t = Math.max(0, Number(currentTime) || 0);
                      const ck = selectedOverlay.chromaKey || {};
                      let next = Array.isArray(motionKeyframes) ? [...motionKeyframes] : [];
                      [
                        ["keySimilarity", Number(ck.similarity ?? 0.32)],
                        ["keySmoothness", Number(ck.smoothness ?? 0.14)],
                        ["keySpill", Number(ck.spillSuppression ?? 0.48)],
                        ["keyChoke", Number(ck.choke ?? 0)],
                      ].forEach(([prop, val]) => {
                        next = upsertAutomationKeyframe(next, {
                          id: `ck-${selectedOverlay.id}-${prop}-${Math.round(t * 100)}`,
                          targetId: selectedOverlay.id,
                          property: prop,
                          time: t,
                          value: val,
                          easing: "linear",
                        });
                      });
                      emitMotionKeyframes(next);
                    }}
                  >
                    + Key Keyer Params (@ {Number(currentTime || 0).toFixed(1)}s)
                  </button>
                </div>
              )}

              {/* CornerPin (2.5D Planar Homography Quad) Controls */}
              {selectedNode.kind === "CornerPin" && selectedOverlay && (() => {
                const rawCorners =
                  Array.isArray(selectedOverlay.perspective?.corners) &&
                  selectedOverlay.perspective.corners.length === 4
                    ? selectedOverlay.perspective.corners
                    : PERSPECTIVE_LEFT;
                const quadAttr = rawCorners.map(([cx, cy]) => `${cx},${cy}`).join(" ");
                return (
                  <div
                    className="ap-flow-inspector-controls"
                    data-testid="flow-corner-pin-editor"
                  >
                    <div className="ap-flow-vector-editor-head">
                      <span>2.5D Homography Quad Pin</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[
                          { label: "Identity", corners: PERSPECTIVE_IDENTITY },
                          { label: "Left Tilt", corners: PERSPECTIVE_LEFT },
                          { label: "Right Tilt", corners: PERSPECTIVE_RIGHT },
                        ].map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            className="ap-flow-mini-btn"
                            data-testid={`flow-corner-pin-preset-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
                            onClick={() =>
                              updateSelectedOverlayField({
                                perspective: validateStudioPerspective({
                                  version: 1,
                                  corners: preset.corners.map(pt => [...pt]),
                                }),
                              })
                            }
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 100 100"
                      className="ap-flow-poly-mask-svg"
                      aria-label="2.5D Corner Pin Homography Editor"
                      onPointerMove={e => {
                        if (draggingCornerIdx === null) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (!rect.width || !rect.height) return;
                        const nx = Math.max(
                          2,
                          Math.min(98, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                        );
                        const ny = Math.max(
                          2,
                          Math.min(98, Math.round(((e.clientY - rect.top) / rect.height) * 100))
                        );
                        const candidateCorners = rawCorners.map((pt, idx) =>
                          idx === draggingCornerIdx ? [nx, ny] : [...pt]
                        );
                        try {
                          const validSpec = validateStudioPerspective({
                            version: 1,
                            corners: candidateCorners,
                          });
                          updateSelectedOverlayField({ perspective: validSpec });
                        } catch (_err) {
                          // Ignore degenerate non-convex drag positions
                        }
                      }}
                      onPointerUp={() => setDraggingCornerIdx(null)}
                      onPointerLeave={() => setDraggingCornerIdx(null)}
                    >
                      <polygon
                        points={quadAttr}
                        fill="rgba(249, 115, 22, 0.18)"
                        stroke="#f97316"
                        strokeWidth="1.8"
                      />
                      {rawCorners.map(([cx, cy], idx) => (
                        <circle
                          key={idx}
                          cx={cx}
                          cy={cy}
                          r="4.5"
                          fill={draggingCornerIdx === idx ? "#facc15" : "#f97316"}
                          stroke="#0f172a"
                          strokeWidth="1.5"
                          style={{ cursor: "grab" }}
                          data-testid={`flow-corner-pin-handle-${idx}`}
                          onPointerDown={e => {
                            e.stopPropagation();
                            setDraggingCornerIdx(idx);
                          }}
                        />
                      ))}
                    </svg>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>
                          Perspective Blend ({Math.round(Number(selectedOverlay.perspectiveProgress ?? 100))}%)
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          data-testid="flow-corner-pin-progress"
                          value={Number(selectedOverlay.perspectiveProgress ?? 100)}
                          onChange={e =>
                            updateSelectedOverlayField({
                              perspectiveProgress: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-corner-pin-stamp-keys"
                        onClick={() =>
                          stampCornerPinKeyframes(selectedOverlay, rawCorners, currentTime)
                        }
                      >
                        + Key 4 Corners (@ {Number(currentTime || 0).toFixed(1)}s)
                      </button>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-corner-pin-track"
                        disabled={maskTrackBusy}
                        onClick={async () => {
                          const vid = videoRef?.current;
                          if (!vid || !vid.videoWidth || typeof emitMotionKeyframes !== "function") {
                            setActionError("Load a real video before tracking 4-corner planar surfaces.");
                            return;
                          }
                          setMaskTrackBusy(true);
                          setActionError("");
                          try {
                            const t0 = Math.max(0, Number(currentTime || 0));
                            const dur = Math.min(3.0, Math.max(0.5, Number(programmeDuration || 4) - t0));
                            const trackedKeys = await trackPlanarCornersOnVideo({
                              videoElement: vid,
                              initialCorners: rawCorners,
                              startTime: t0,
                              duration: dur,
                              targetId: selectedOverlay.id,
                              fps: 8,
                            });
                            let merged = Array.isArray(motionKeyframes) ? [...motionKeyframes] : [];
                            trackedKeys.forEach(k => { merged = upsertAutomationKeyframe(merged, k); });
                            updateSelectedOverlayField({ perspectiveProgress: 100 });
                            emitMotionKeyframes(merged);
                          } catch (err) {
                            setActionError(err?.message || "Planar surface tracking failed.");
                          } finally {
                            setMaskTrackBusy(false);
                          }
                        }}
                      >
                        {maskTrackBusy ? "Tracking…" : "Track 4 Corners"}
                      </button>
                    </div>
                    <div className="ap-flow-grade-subcard" data-testid="flow-corner-screen-replace">
                      <label className="ap-flow-checkbox-row">
                        <input
                          type="checkbox"
                          data-testid="flow-corner-screen-replace-toggle"
                          checked={Boolean(selectedOverlay.screenReplace?.enabled)}
                          onChange={e =>
                            updateSelectedOverlayField({
                              screenReplace: {
                                glarePreserve: 0.35,
                                ...(selectedOverlay.screenReplace || {}),
                                enabled: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>Screen Replacement Reflection / Glare Preserve</span>
                      </label>
                      {selectedOverlay.screenReplace?.enabled && (
                        <label className="ap-flow-field">
                          <span>Screen Glare Blend ({Math.round(Number(selectedOverlay.screenReplace?.glarePreserve ?? 0.35) * 100)}%)</span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            data-testid="flow-corner-screen-glare-slider"
                            value={Number(selectedOverlay.screenReplace?.glarePreserve ?? 0.35)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                screenReplace: {
                                  ...(selectedOverlay.screenReplace || {}),
                                  enabled: true,
                                  glarePreserve: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* CompoundMacro (Pre-Comp Macro Group) Controls */}
              {selectedNode.kind === "CompoundMacro" && selectedOverlay && (
                <div
                  className="ap-flow-inspector-controls"
                  data-testid="flow-macro-controls"
                >
                  <label className="ap-flow-field">
                    <span>Macro Group Name</span>
                    <input
                      type="text"
                      data-testid="flow-macro-name-input"
                      value={selectedOverlay.name || ""}
                      onChange={e => updateSelectedOverlayField({ name: e.target.value })}
                    />
                  </label>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>
                        Published Macro Scale ({Math.round(Number(selectedOverlay.macroGroup?.publishedControls?.macroScale ?? 1) * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0.3"
                        max="2.2"
                        step="0.02"
                        data-testid="flow-macro-scale-slider"
                        value={Number(
                          selectedOverlay.macroGroup?.publishedControls?.macroScale ?? 1
                        )}
                        onChange={e => {
                          const nextScale = Number(e.target.value);
                          emitOverlays?.(
                            overlays.map(item => {
                              if (String(item.id) === String(selectedOverlay.id)) {
                                return {
                                  ...item,
                                  scale: nextScale,
                                  macroGroup: {
                                    ...(item.macroGroup || {}),
                                    publishedControls: {
                                      ...(item.macroGroup?.publishedControls || {}),
                                      macroScale: nextScale,
                                    },
                                  },
                                };
                              }
                              return item;
                            })
                          );
                        }}
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>
                        Published Macro Opacity ({Math.round(Number(selectedOverlay.macroGroup?.publishedControls?.macroOpacity ?? 1) * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        data-testid="flow-macro-opacity-slider"
                        value={Number(
                          selectedOverlay.macroGroup?.publishedControls?.macroOpacity ?? 1
                        )}
                        onChange={e => {
                          const nextOpacity = Number(e.target.value);
                          const memberIds = selectedOverlay.macroGroup?.memberIds || [];
                          const previous=Number(selectedOverlay.macroGroup?.publishedControls?.macroOpacity ?? 1);
                          const original=selectedOverlay.macroGroup?.memberOpacities || Object.fromEntries(
                            overlays.filter(item=>memberIds.includes(String(item.id))).map(item=>
                              [String(item.id),previous>0?Number(item.opacity??1)/previous:Number(item.opacity??1)]));
                          emitOverlays?.(
                            overlays.map(item => {
                              if (String(item.id) === String(selectedOverlay.id)) {
                                return {
                                  ...item,
                                  opacity: nextOpacity,
                                  macroGroup: {
                                    ...(item.macroGroup || {}),
                                    publishedControls: {
                                      ...(item.macroGroup?.publishedControls || {}),
                                      macroOpacity: nextOpacity,
                                    },
                                    memberOpacities: original,
                                  },
                                };
                              }
                              if (memberIds.includes(String(item.id))) {
                                return { ...item, opacity: Number(original[String(item.id)]??1)*nextOpacity };
                              }
                              return item;
                            })
                          );
                        }}
                      />
                    </label>
                  </div>
                  <div className="ap-flow-field-row">
                    <label className="ap-flow-field">
                      <span>
                        Macro Glow Boost ({Math.round(Number(selectedOverlay.macroGroup?.publishedControls?.macroGlowBoost ?? 0.4) * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        data-testid="flow-macro-glow-slider"
                        value={Number(
                          selectedOverlay.macroGroup?.publishedControls?.macroGlowBoost ?? 0.4
                        )}
                        onChange={e => {
                          const nextGlow = Number(e.target.value);
                          const memberIds = selectedOverlay.macroGroup?.memberIds || [];
                          emitOverlays?.(
                            overlays.map(item => {
                              if (String(item.id) === String(selectedOverlay.id)) {
                                return {
                                  ...item,
                                  macroGroup: {
                                    ...(item.macroGroup || {}),
                                    publishedControls: {
                                      ...(item.macroGroup?.publishedControls || {}),
                                      macroGlowBoost: nextGlow,
                                    },
                                  },
                                };
                              }
                              if (memberIds.includes(String(item.id))) {
                                return {
                                  ...item,
                                  glow: {
                                    color: "#22d3ee",
                                    radius: 18,
                                    ...(item.glow || {}),
                                    enabled: nextGlow > 0.01,
                                    intensity: nextGlow,
                                  },
                                };
                              }
                              return item;
                            })
                          );
                        }}
                      />
                    </label>
                    <label className="ap-flow-field">
                      <span>Macro Blend Mode</span>
                      <select
                        aria-label="Macro Blend Mode"
                        data-testid="flow-macro-blend-select"
                        value={selectedOverlay.macroGroup?.publishedControls?.macroBlendMode || "normal"}
                        onChange={e => {
                          const nextBlend = e.target.value || "normal";
                          const memberIds = selectedOverlay.macroGroup?.memberIds || [];
                          emitOverlays?.(
                            overlays.map(item => {
                              if (String(item.id) === String(selectedOverlay.id)) {
                                return {
                                  ...item,
                                  blendMode: nextBlend,
                                  macroGroup: {
                                    ...(item.macroGroup || {}),
                                    publishedControls: {
                                      ...(item.macroGroup?.publishedControls || {}),
                                      macroBlendMode: nextBlend,
                                    },
                                  },
                                };
                              }
                              if (memberIds.includes(String(item.id))) {
                                return { ...item, blendMode: nextBlend };
                              }
                              return item;
                            })
                          );
                        }}
                      >
                        {STUDIO_EXPORT_BLEND_MODES.map(mode => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                    </label>
                  </div>
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
                      {STUDIO_EXPORT_BLEND_MODES.map(mode => (
                        <option key={mode} value={mode}>
                          {mode.replace(/(^|-)\w/g, m => m.toUpperCase())}
                        </option>
                      ))}
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

                  <div className="ap-flow-grade-subcard" data-testid="flow-light-wrap-controls">
                    <label className="ap-flow-checkbox-row">
                      <input
                        type="checkbox"
                        data-testid="flow-light-wrap-toggle"
                        checked={Boolean(selectedOverlay.lightWrap?.enabled)}
                        onChange={e =>
                          updateSelectedOverlayField({
                            lightWrap: {
                              intensity: 0.45,
                              radius: 14,
                              ...(selectedOverlay.lightWrap || {}),
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>Edge Light Wrap (Backdrop Bleed)</span>
                    </label>
                    {selectedOverlay.lightWrap?.enabled && (
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-field">
                          <span>Wrap Intensity ({Math.round(Number(selectedOverlay.lightWrap?.intensity ?? 0.45) * 100)}%)</span>
                          <input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.05"
                            data-testid="flow-light-wrap-intensity"
                            value={Number(selectedOverlay.lightWrap?.intensity ?? 0.45)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                lightWrap: {
                                  ...(selectedOverlay.lightWrap || {}),
                                  enabled: true,
                                  intensity: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="ap-flow-field">
                          <span>Wrap Radius ({Math.round(Number(selectedOverlay.lightWrap?.radius ?? 14))}px)</span>
                          <input
                            type="range"
                            min="2"
                            max="48"
                            step="1"
                            data-testid="flow-light-wrap-radius"
                            value={Number(selectedOverlay.lightWrap?.radius ?? 14)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                lightWrap: {
                                  ...(selectedOverlay.lightWrap || {}),
                                  enabled: true,
                                  radius: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                    <label className="ap-flow-checkbox-row">
                      <input
                        type="checkbox"
                        data-testid="flow-linear-light-toggle"
                        checked={Boolean(selectedOverlay.linearLight)}
                        onChange={e => updateSelectedOverlayField({ linearLight: e.target.checked })}
                      />
                      <span>Linear-Light Compositing (2.2γ)</span>
                    </label>
                    <label className="ap-flow-checkbox-row">
                      <input
                        type="checkbox"
                        data-testid="flow-mesh-warp-toggle"
                        checked={Boolean(selectedOverlay.meshWarp?.enabled)}
                        onChange={e =>
                          updateSelectedOverlayField({
                            meshWarp: {
                              strength: 0.35,
                              pinch: 0,
                              rows: 4,
                              cols: 4,
                              ...(selectedOverlay.meshWarp || {}),
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>Mesh / Grid Warp (Deform)</span>
                    </label>
                    {selectedOverlay.meshWarp?.enabled && (
                      <div className="ap-flow-field-row">
                        <label className="ap-flow-field">
                          <span>Mesh Strength ({Number(selectedOverlay.meshWarp?.strength ?? 0.35).toFixed(2)})</span>
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.02"
                            value={Number(selectedOverlay.meshWarp?.strength ?? 0.35)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                meshWarp: { ...(selectedOverlay.meshWarp || {}), enabled: true, strength: Number(e.target.value) },
                              })
                            }
                          />
                        </label>
                        <label className="ap-flow-field">
                          <span>Radial Pinch ({Number(selectedOverlay.meshWarp?.pinch ?? 0).toFixed(2)})</span>
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.02"
                            value={Number(selectedOverlay.meshWarp?.pinch ?? 0)}
                            onChange={e =>
                              updateSelectedOverlayField({
                                meshWarp: { ...(selectedOverlay.meshWarp || {}), enabled: true, pinch: Number(e.target.value) },
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>

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
                  {/* Live footage or reference chart scopes (Waveform / RGB Parade / Vectorscope) */}
                  <div className="ap-flow-grade-subcard" data-testid="flow-color-scopes-card">
                    <div className="ap-flow-vector-editor-head">
                      <span data-scope-source={liveVideoFrameBytes ? "footage" : "reference"}>
                        {liveVideoFrameBytes ? "Live footage scopes" : "Reference chart scopes"}
                      </span>
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
                      data-scope-source={liveVideoFrameBytes ? "footage" : "reference"}
                      aria-label={`${liveVideoFrameBytes ? "Live footage" : "Reference chart"} ${scopeMode} scope`}
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

                  <div className="ap-flow-field-group" style={{ marginTop: 8, padding: 8, borderRadius: 6, border: "1px solid rgba(148,163,184,0.22)" }}>
                    <label className="ap-flow-field-check" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        data-testid="flow-sky-replace-toggle"
                        checked={Boolean(finishFx?.skyReplace?.enabled)}
                        onChange={e =>
                          emitFinishFx?.({
                            ...finishFx,
                            skyReplace: {
                              preset: "sunset_gold",
                              horizonPct: 64,
                              threshold: 0.48,
                              tempMatch: 0.32,
                              ...(finishFx?.skyReplace || {}),
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>Sky Replacement &amp; Ambient Match</span>
                    </label>
                    {finishFx?.skyReplace?.enabled && (
                      <>
                        <label className="ap-flow-field">
                          <span>Sky Preset</span>
                          <select
                            data-testid="flow-sky-preset-select"
                            value={finishFx.skyReplace.preset || "sunset_gold"}
                            onChange={e =>
                              emitFinishFx?.({
                                ...finishFx,
                                skyReplace: { ...(finishFx.skyReplace || {}), enabled: true, preset: e.target.value },
                              })
                            }
                          >
                            {Object.values(SKY_REPLACEMENT_PRESETS).map(item => (
                              <option key={item.id} value={item.id}>{item.label}</option>
                            ))}
                          </select>
                        </label>
                        <div className="ap-flow-field-row">
                          <label className="ap-flow-field">
                            <span>Horizon Split ({Math.round(Number(finishFx.skyReplace.horizonPct ?? 64))}%)</span>
                            <input
                              type="range"
                              min="20"
                              max="90"
                              step="1"
                              value={Number(finishFx.skyReplace.horizonPct ?? 64)}
                              onChange={e =>
                                emitFinishFx?.({
                                  ...finishFx,
                                  skyReplace: { ...(finishFx.skyReplace || {}), enabled: true, horizonPct: Number(e.target.value) },
                                })
                              }
                            />
                          </label>
                          <label className="ap-flow-field">
                            <span>Ambient Match ({Math.round(Number(finishFx.skyReplace.tempMatch ?? 0.32) * 100)}%)</span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.02"
                              value={Number(finishFx.skyReplace.tempMatch ?? 0.32)}
                              onChange={e =>
                                emitFinishFx?.({
                                  ...finishFx,
                                  skyReplace: { ...(finishFx.skyReplace || {}), enabled: true, tempMatch: Number(e.target.value) },
                                })
                              }
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>

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
                          min="-0.15"
                          max="0.15"
                          step="0.01"
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
                          min="0.6"
                          max="1.6"
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
                          min="0.6"
                          max="1.4"
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
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", fontSize: 11, color: "#94a3b8" }}>Per-Channel R/G/B Lift &amp; Gain</summary>
                      <div className="ap-flow-field-row" style={{ marginTop: 4 }}>
                        {[
                          ["R Lift", "rLift", -0.25, 0.25, 0.01, 0],
                          ["G Lift", "gLift", -0.25, 0.25, 0.01, 0],
                          ["B Lift", "bLift", -0.25, 0.25, 0.01, 0],
                          ["R Gain", "rGain", 0.5, 1.5, 0.02, 1],
                          ["G Gain", "gGain", 0.5, 1.5, 0.02, 1],
                          ["B Gain", "bGain", 0.5, 1.5, 0.02, 1],
                        ].map(([lbl, key, lo, hi, stp, fb]) => (
                          <label className="ap-flow-field" key={key}>
                            <span>{lbl} ({Number(resolvedAdvancedColor.rgbOffsets?.[key] ?? fb).toFixed(2)})</span>
                            <input
                              type="range"
                              min={lo}
                              max={hi}
                              step={stp}
                              value={Number(resolvedAdvancedColor.rgbOffsets?.[key] ?? fb)}
                              onChange={e =>
                                updateAdvancedColorPatch({
                                  rgbOffsets: {
                                    ...(resolvedAdvancedColor.rgbOffsets || {}),
                                    [key]: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </details>
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
                            lutData: cube,
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
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-export-cube-lut"
                        onClick={() => {
                          if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return;
                          const cube = resolvedAdvancedColor.lut || buildAdvancedColorCube(resolvedAdvancedColor, 17);
                          if (!cube) return;
                          const cubeText = exportColorCubeText(cube, resolvedAdvancedColor.lutName || finishFx?.preset || "Studio Look");
                          const blob = new Blob([cubeText], { type: "text/plain" });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "autopromote-grade.cube";
                          link.click?.();
                          URL.revokeObjectURL?.(url);
                        }}
                      >
                        Export .cube LUT
                      </button>
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
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Camera Input CST</span>
                        <select
                          aria-label="Camera Input CST"
                          data-testid="flow-cst-profile-select"
                          value={resolvedAdvancedColor.cameraProfile || "rec709"}
                          onChange={e => {
                            const profileId = e.target.value || "rec709";
                            const hasLegacyCstOnlyLut = String(resolvedAdvancedColor.lutPresetId || "").startsWith("cst:");
                            updateAdvancedColorPatch({
                              cameraProfile: profileId,
                              ...(hasLegacyCstOnlyLut
                                ? { lut: null, lutData: null, lutName: "", lutPresetId: "" }
                                : {}),
                            });
                          }}
                        >
                          {CAMERA_COLOR_PROFILES.map(profile => (
                            <option key={profile.id} value={profile.id}>
                              {profile.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="ap-flow-field">
                        <span>Film Emulation</span>
                        <select
                          aria-label="Film Emulation"
                          data-testid="flow-film-emulation-select"
                          value={finishFx?.filmEmulation || "none"}
                          onChange={e => {
                            const presetId = e.target.value;
                            const fx = FILM_EMULATION_PRESETS[presetId] || FILM_EMULATION_PRESETS.none;
                            emitFinishFx?.({
                              ...finishFx,
                              filmEmulation: presetId,
                              halation: fx.halation,
                              chromaticAberration: fx.chromaticAberration,
                              filmGrain: fx.filmGrain,
                            });
                          }}
                        >
                          <option value="none">None (Clean Digital)</option>
                          <option value="35mm_halation">35mm Cinema Halation</option>
                          <option value="16mm_doc">16mm Documentary Grain</option>
                          <option value="anamorphic_prism">Anamorphic Prism</option>
                        </select>
                      </label>
                    </div>
                    <div className="ap-flow-field-row" data-testid="flow-optical-camera-row">
                      <label className="ap-flow-field">
                        <span>Lens Distort ({Number(finishFx?.lensDistortion ?? 0).toFixed(2)})</span>
                        <input
                          type="range"
                          min="-0.45"
                          max="0.45"
                          step="0.01"
                          aria-label="Optical Lens Distortion"
                          value={Number(finishFx?.lensDistortion ?? 0)}
                          onChange={e =>
                            emitFinishFx?.({ ...finishFx, lensDistortion: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Z Rack Focus ({Math.round(Number(finishFx?.rackFocus ?? 0) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          aria-label="Z-Depth Rack Focus Bokeh"
                          value={Number(finishFx?.rackFocus ?? 0)}
                          onChange={e =>
                            emitFinishFx?.({ ...finishFx, rackFocus: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Focus Plane ({Math.round(Number(finishFx?.focusDistance ?? 0.5) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          aria-label="Rack Focus Plane Depth"
                          value={Number(finishFx?.focusDistance ?? 0.5)}
                          onChange={e =>
                            emitFinishFx?.({ ...finishFx, focusDistance: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="ap-flow-field">
                        <span>Atmos Haze ({Math.round(Number(finishFx?.atmosphericHaze ?? 0) * 100)}%)</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.02"
                          aria-label="Atmospheric Depth Haze"
                          value={Number(finishFx?.atmosphericHaze ?? 0)}
                          onChange={e =>
                            emitFinishFx?.({ ...finishFx, atmosphericHaze: Number(e.target.value) })
                          }
                        />
                      </label>
                    </div>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>Dead-Content Revitalizer</span>
                        <select
                          aria-label="Dead-Content Revitalizer"
                          data-testid="flow-revitalizer-preset-select"
                          value={resolvedAdvancedColor.revitalizerPresetId || finishFx?.revitalizerPresetId || ""}
                          onChange={e => {
                            const key = e.target.value;
                            const preset = key ? DEAD_CONTENT_REVITALIZER_PRESETS[key] : null;
                            if (!preset) {
                              updateAdvancedColorPatch({
                                revitalizerPresetId: "",
                                revitalizer: null,
                              });
                              emitFinishFx?.({
                                ...finishFx,
                                revitalizerPresetId: "",
                                dehaze: 0,
                                clarity: 0,
                                shadowRecovery: 0,
                                highlightRollOff: 0,
                                vibrance: 0,
                              });
                              return;
                            }
                            const rev = {
                              dehaze: preset.dehaze,
                              clarity: preset.clarity,
                              shadowRecovery: preset.shadowRecovery,
                              highlightRollOff: preset.highlightRollOff,
                              vibrance: preset.vibrance,
                              skinToneProtect: preset.skinToneProtect,
                            };
                            updateAdvancedColorPatch({
                              revitalizerPresetId: key,
                              revitalizer: rev,
                            });
                            emitFinishFx?.({
                              ...finishFx,
                              precisionGrade: true,
                              revitalizerPresetId: key,
                              ...rev,
                              exposureStops: preset.exposureStops ?? finishFx?.exposureStops ?? 0,
                              contrast: preset.contrast ?? finishFx?.contrast ?? 1,
                              saturation: preset.saturation ?? finishFx?.saturation ?? 1,
                              sharpness: preset.sharpness ?? finishFx?.sharpness ?? 0,
                            });
                          }}
                        >
                          <option value="">Off (Raw Signal)</option>
                          {Object.values(DEAD_CONTENT_REVITALIZER_PRESETS).map(preset => (
                            <option key={preset.id} value={preset.id}>
                              {preset.icon} {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="ap-flow-field-row">
                      <label className="ap-flow-field">
                        <span>HSL Qualifier</span>
                        <select
                          aria-label="HSL Qualifier"
                          data-testid="flow-hsl-qualifier-select"
                          value={resolvedAdvancedColor.qualifierPresetId || ""}
                          onChange={e => {
                            const key = e.target.value;
                            updateAdvancedColorPatch({
                              qualifierPresetId: key,
                              qualifier: key && HSL_QUALIFIER_PRESETS[key] ? { ...HSL_QUALIFIER_PRESETS[key] } : null,
                            });
                          }}
                        >
                          <option value="">Off</option>
                          {Object.entries(HSL_QUALIFIER_PRESETS).map(([id, preset]) => (
                            <option key={id} value={id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="ap-flow-field">
                        <span>Power Window</span>
                        <select
                          aria-label="Power Window"
                          data-testid="flow-power-window-select"
                          value={resolvedAdvancedColor.powerWindowPresetId || ""}
                          onChange={e => {
                            const key = e.target.value;
                            updateAdvancedColorPatch({
                              powerWindowPresetId: key,
                              powerWindow: key && POWER_WINDOW_PRESETS[key] ? { ...POWER_WINDOW_PRESETS[key] } : null,
                            });
                          }}
                        >
                          <option value="">Off</option>
                          {Object.entries(POWER_WINDOW_PRESETS).map(([id, preset]) => (
                            <option key={id} value={id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="ap-flow-field-row" data-testid="flow-shot-match-row">
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-auto-revive-dead-clip"
                        onClick={() => {
                          const pixels = sampleCurrentVideoRgba();
                          if (!pixels) return;
                          const solved = diagnoseDeadFootageAndSolveRevival(pixels);
                          updateAdvancedColorPatch({
                            revitalizerPresetId: solved.presetId,
                            revitalizer: solved.revitalizer,
                          });
                          emitFinishFx?.({
                            ...finishFx,
                            ...solved.grade,
                            revitalizerPresetId: solved.presetId,
                          });
                        }}
                      >
                        ⚡ Auto Revive Dead Clip
                      </button>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-capture-shot-ref"
                        onClick={() => {
                          const pixels = sampleCurrentVideoRgba();
                          if (pixels) setShotMatchRefPixels(pixels);
                        }}
                      >
                        Capture Shot Ref
                      </button>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-apply-shot-match"
                        disabled={!shotMatchRefPixels}
                        onClick={() => {
                          const targetPixels = sampleCurrentVideoRgba();
                          if (!shotMatchRefPixels || !targetPixels) return;
                          const matched = solveShotMatchGrade(shotMatchRefPixels, targetPixels);
                          emitFinishFx?.({
                            ...finishFx,
                            ...matched,
                          });
                        }}
                      >
                        Auto Shot Match
                      </button>
                      <button
                        type="button"
                        className="ap-flow-mini-btn"
                        data-testid="flow-export-preset"
                        onClick={() => {
                          if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return;
                          const json = serializeStudioPresetBundle({
                            name: resolvedAdvancedColor.lutName || finishFx?.preset || "Studio Look",
                            finishFx,
                            advancedColor: resolvedAdvancedColor,
                          });
                          const blob = new Blob([json], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "studio-look-preset.json";
                          link.click?.();
                          URL.revokeObjectURL?.(url);
                        }}
                      >
                        Export Look JSON
                      </button>
                      <label className="ap-flow-field">
                        <span>Import Look</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          aria-label="Import Look Preset"
                          data-testid="flow-import-preset"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            try {
                              const parsed = parseStudioPresetBundle(await file.text());
                              if (parsed.finishFx) {
                                emitFinishFx?.({
                                  ...finishFx,
                                  ...parsed.finishFx,
                                  advancedColor: parsed.advancedColor || finishFx?.advancedColor || null,
                                });
                              }
                              if (parsed.advancedColor) {
                                updateAdvancedColorPatch(parsed.advancedColor);
                              }
                            } catch (_err) {
                              // Ignore invalid preset JSON
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Per-Node Masked Grading / Power Window Routing (Mask Port) */}
                  <div
                    className="ap-flow-grade-subcard"
                    data-testid="flow-masked-grade-controls"
                  >
                    <div className="ap-flow-vector-editor-head">
                      <span>Masked Grade / Power Window Routing</span>
                      <span className="ap-flow-node-chip">
                        {finishFx?.advancedColor?.maskSourceNodeId || finishFx?.maskSourceNodeId
                          ? "MASKED"
                          : "FULL FRAME"}
                      </span>
                    </div>
                    <label className="ap-flow-field">
                      <span>Mask Port Input Node</span>
                      <select
                        data-testid="flow-grade-mask-source-select"
                        value={
                          finishFx?.advancedColor?.maskSourceNodeId ||
                          finishFx?.maskSourceNodeId ||
                          ""
                        }
                        onChange={e => {
                          const nextSource = e.target.value || null;
                          if (!nextSource) {
                            const res = disconnectNodeFlowPort(
                              {
                                overlays,
                                adjustmentLayers,
                                finishFx,
                                advancedColor,
                                motionKeyframes,
                                mainTransform,
                              },
                              { toNodeId: "ColorCorrector:finish", toPort: "Mask", currentTime }
                            );
                            applyCanonicalGraphResult(res);
                          } else {
                            const res = connectNodeFlowPorts(
                              {
                                overlays,
                                compositionOrder,
                                adjustmentLayers,
                                finishFx,
                                advancedColor,
                                motionKeyframes,
                                mainTransform,
                              },
                              {
                                fromNodeId: nextSource,
                                toNodeId: "ColorCorrector:finish",
                                toPort: "Mask",
                                currentTime,
                              }
                            );
                            applyCanonicalGraphResult(res);
                          }
                        }}
                      >
                        <option value="">None (Grade Full Frame)</option>
                        {graph.nodes
                          .filter(
                            n =>
                              n.kind === "PolygonMask" ||
                              n.kind === "ChromaKeyer" || n.kind === "CornerPin" || (n.kind === "GlowBlur" && n.targetId!=="finish") ||
                              (n.kind === "Transform" && n.id !== "Transform:main-video" && overlays.some(layer=>String(layer.id)===String(n.targetId)&&["image","video","text"].includes(layer.type)))
                          )
                          .map(candidate => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label} ({candidate.id})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="ap-flow-checkbox-row">
                      <input
                        type="checkbox"
                        data-testid="flow-grade-mask-invert"
                        checked={Boolean(resolvedAdvancedColor.maskSourceNodeId?resolvedAdvancedColor.maskInvert:resolvedAdvancedColor.powerWindow?.invert)}
                        onChange={e => updateAdvancedColorPatch(resolvedAdvancedColor.maskSourceNodeId
                          ? {maskInvert:e.target.checked}
                          : {powerWindow:{...(resolvedAdvancedColor.powerWindow||{}),enabled:true,invert:e.target.checked}})}
                      />
                      <span>Invert Grade Mask (Grade Outside Selection)</span>
                    </label>
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
                  <div
                    className="ap-flow-grade-subcard"
                    data-testid="flow-adjustment-mask-controls"
                  >
                    <div className="ap-flow-vector-editor-head">
                      <span>Adjustment Mask Port</span>
                      <span className="ap-flow-node-chip">
                        {selectedAdjustment.maskSourceNodeId || selectedAdjustment.mask?.enabled
                          ? "MASKED"
                          : "FULL"}
                      </span>
                    </div>
                    <label className="ap-flow-field">
                      <span>Mask Input Source</span>
                      <select
                        data-testid="flow-adjustment-mask-source-select"
                        value={selectedAdjustment.maskSourceNodeId || ""}
                        onChange={e => {
                          const nextSource = e.target.value || null;
                          if (!nextSource) {
                            const res = disconnectNodeFlowPort(
                              {
                                overlays,
                                adjustmentLayers,
                                finishFx,
                                advancedColor,
                                motionKeyframes,
                                mainTransform,
                              },
                              { toNodeId: selectedNode.id, toPort: "Mask", currentTime }
                            );
                            applyCanonicalGraphResult(res);
                          } else {
                            const res = connectNodeFlowPorts(
                              {
                                overlays,
                                compositionOrder,
                                adjustmentLayers,
                                finishFx,
                                advancedColor,
                                motionKeyframes,
                                mainTransform,
                              },
                              {
                                fromNodeId: nextSource,
                                toNodeId: selectedNode.id,
                                toPort: "Mask",
                                currentTime,
                              }
                            );
                            applyCanonicalGraphResult(res);
                          }
                        }}
                      >
                        <option value="">None (Full Composite Stack)</option>
                        {graph.nodes
                          .filter(
                            n =>
                              n.kind === "PolygonMask" ||
                              n.kind === "ChromaKeyer" || n.kind === "CornerPin" || (n.kind === "GlowBlur" && n.targetId!=="finish") ||
                              (n.kind === "Transform" && n.id !== "Transform:main-video" && overlays.some(layer=>String(layer.id)===String(n.targetId)&&["image","video","text"].includes(layer.type)))
                          )
                          .map(candidate => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label} ({candidate.id})
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
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
                      onClick={() => applyCanonicalGraphResult(restoreAllNodeFlowBypasses({
                        overlays,compositionOrder,adjustmentLayers,finishFx,advancedColor,
                        motionKeyframes,finishKeyframes,mainTransform,nodeFlow,
                      }))}
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
  return expandedWorkspace ? createPortal(workspace, document.body) : workspace;
}
