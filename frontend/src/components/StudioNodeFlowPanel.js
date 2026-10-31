import React, { useMemo, useRef, useState } from "react";
import { STUDIO_EXPORT_BLEND_MODES } from "./studioBlendModes";
import { TRACK_MATTE_OPTIONS } from "./studioCompRigging";
import {
  NODE_FLOW_PALETTE,
  NODE_FLOW_PORT_COLORS,
  SMART_FLOW_RIGS,
  buildSmartFlowRigState,
  connectNodeFlowPorts,
  createNodePaletteAddition,
  deriveNodeFlowGraph,
  describeNodeViewerSignal,
  disconnectNodeFlowPort,
} from "./studioNodeFlow";
import "./StudioMotionFlow.css";
import StudioAdjustmentControls from "./StudioAdjustmentControls";
import StudioSourceGradeViewer from './StudioSourceGradeViewer';

const NODE_WIDTH = 158;
const NODE_BASE_HEIGHT = 76;

const getPortOffset = (node, portName, isOutput) => {
  if (isOutput) {
    return { x: node.x + NODE_WIDTH, y: node.y + 52 };
  }
  const idx = Math.max(0, (node.inputs || []).indexOf(portName));
  return { x: node.x, y: node.y + 46 + idx * 16 };
};

export default function StudioNodeFlow({
  overlays = [],
  mainTransform = {},
  finishFx = {},
  compositionOrder = null,
  adjustmentLayers = [],
  subjectVfxScenes = [],
  motionKeyframes = [],
  nodeFlow = {},
  activeOverlayId = null,
  currentTime = 0,
  programmeDuration = 8,
  onSelectOverlay,
  onChangeOverlays,
  onChangeMainTransform,
  onChangeFinishFx,
  onChangeCompositionOrder,
  onChangeAdjustmentLayers,
  onChangeNodeFlow,
  videoRef,
  mapTime,
  advancedColor,
}) {
  const [selectedNodeId, setSelectedNodeId] = useState("MediaOut");
  const [zoom, setZoom] = useState(0.95);
  const [pan, setPan] = useState({ x: 16, y: 12 });
  const [pendingWire, setPendingWire] = useState(null); // { fromNodeId, fromPort, mouseX, mouseY }
  const dragRef = useRef(null);
  const canvasRef = useRef(null);

  const canonicalSlice = useMemo(
    () => ({
      overlays,
      mainTransform,
      finishFx,
      compositionOrder,
      adjustmentLayers,
      subjectVfxScenes,
      motionKeyframes,
      nodeFlow,
    }),
    [
      overlays,
      mainTransform,
      finishFx,
      compositionOrder,
      adjustmentLayers,
      subjectVfxScenes,
      motionKeyframes,
      nodeFlow,
    ]
  );

  const graph = useMemo(() => deriveNodeFlowGraph(canonicalSlice), [canonicalSlice]);

  const nodesById = useMemo(
    () => new Map(graph.nodes.map(node => [node.id, node])),
    [graph.nodes]
  );

  const selectedNode = nodesById.get(selectedNodeId) || nodesById.get("MediaOut") || graph.nodes[0];

  const signalA = useMemo(
    () => describeNodeViewerSignal(graph.viewerA, graph, canonicalSlice),
    [graph, canonicalSlice]
  );
  const signalB = useMemo(
    () => (graph.viewerB ? describeNodeViewerSignal(graph.viewerB, graph, canonicalSlice) : null),
    [graph, canonicalSlice]
  );

  const patchNodeFlow = patch => {
    const next = {
      version: 1,
      ...(nodeFlow || {}),
      ...patch,
    };
    onChangeNodeFlow?.(next);
  };

  const applyCanonicalStateUpdate = updated => {
    if (!updated) return;
    if (updated.overlays && updated.overlays !== overlays) {
      onChangeOverlays?.(updated.overlays);
    }
    if (updated.compositionOrder && updated.compositionOrder !== compositionOrder) {
      onChangeCompositionOrder?.(updated.compositionOrder);
    }
    if (updated.finishFx && updated.finishFx !== finishFx) {
      onChangeFinishFx?.(updated.finishFx);
    }
    if (updated.adjustmentLayers && updated.adjustmentLayers !== adjustmentLayers) {
      onChangeAdjustmentLayers?.(updated.adjustmentLayers);
    }
    if (updated.selectOverlayId !== undefined) {
      onSelectOverlay?.(updated.selectOverlayId);
    }
  };

  const handlePaletteAdd = paletteId => {
    const addition = createNodePaletteAddition(paletteId, {
      overlays,
      adjustmentLayers,
      activeOverlayId,
      currentTime,
      programmeDuration,
    });
    applyCanonicalStateUpdate(addition);
  };

  const handleSmartRig = rigId => {
    const built = buildSmartFlowRigState(rigId, {
      overlays,
      adjustmentLayers,
      finishFx,
      currentTime,
      programmeDuration,
    });
    applyCanonicalStateUpdate(built);
  };

  const handleToggleBypass = node => {
    if (node.kind === "Adjustment") {
      onChangeAdjustmentLayers?.(
        (adjustmentLayers || []).map(adj =>
          String(adj.id) === String(node.targetId) ? { ...adj, enabled: adj.enabled === false } : adj
        )
      );
      return;
    }
    const nextBypassed = { ...(nodeFlow?.bypassed || {}) };
    if (nextBypassed[node.id]) delete nextBypassed[node.id];
    else nextBypassed[node.id] = true;
    patchNodeFlow({ bypassed: nextBypassed });
  };

  const handleSelectNode = node => {
    setSelectedNodeId(node.id);
    if (
      node.targetId &&
      !["main-video", "finish-color", "finish-texture", "programme-out"].includes(node.targetId)
    ) {
      onSelectOverlay?.(node.targetId);
    }
  };

  const handleNodeKeyDown = (event, node) => {
    if (event.key === "1") {
      event.preventDefault();
      patchNodeFlow({ viewerA: node.id });
    } else if (event.key === "2") {
      event.preventDefault();
      patchNodeFlow({ viewerB: graph.viewerB === node.id ? null : node.id });
    }
  };

  const handlePortClick = (event, node, portName, isOutput) => {
    event.stopPropagation();
    if (isOutput) {
      const pt = getPortOffset(node, portName, true);
      setPendingWire({
        fromNodeId: node.id,
        fromPort: portName,
        mouseX: pt.x + 28,
        mouseY: pt.y,
      });
      return;
    }
    if (pendingWire) {
      try {
        const updated = connectNodeFlowPorts(canonicalSlice, {
          fromNodeId: pendingWire.fromNodeId,
          fromPort: pendingWire.fromPort,
          toNodeId: node.id,
          toPort: portName,
          currentTime,
        });
        applyCanonicalStateUpdate(updated);
      } catch (_err) {
        // Invalid/cyclic port connection ignored safely
      }
      setPendingWire(null);
      return;
    }
    // Clicking an existing Parent or Mask input port disconnects it
    if (portName === "Parent" || portName === "Mask") {
      const hasWire = graph.wires.some(w => w.toNodeId === node.id && w.toPort === portName);
      if (hasWire) {
        const updated = disconnectNodeFlowPort(canonicalSlice, {
          toNodeId: node.id,
          toPort: portName,
          currentTime,
        });
        applyCanonicalStateUpdate(updated);
      }
    }
  };

  const handleNodeDragStart = (event, node) => {
    event.stopPropagation();
    handleSelectNode(node);
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = node.x;
    const origY = node.y;
    dragRef.current = { nodeId: node.id, startX, startY, origX, origY };

    const onMove = moveEv => {
      if (!dragRef.current) return;
      const dx = (moveEv.clientX - dragRef.current.startX) / zoom;
      const dy = (moveEv.clientY - dragRef.current.startY) / zoom;
      const nextPositions = {
        ...(nodeFlow?.positions || {}),
        [node.id]: {
          x: Math.round(dragRef.current.origX + dx),
          y: Math.round(dragRef.current.origY + dy),
        },
      };
      patchNodeFlow({ positions: nextPositions });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleCanvasMouseMove = event => {
    if (!pendingWire || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left - pan.x) / zoom;
    const mouseY = (event.clientY - rect.top - pan.y) / zoom;
    setPendingWire(prev => (prev ? { ...prev, mouseX, mouseY } : null));
  };

  const selectedOverlay = useMemo(
    () =>
      selectedNode
        ? (overlays || []).find(item => item && String(item.id) === String(selectedNode.targetId)) || null
        : null,
    [selectedNode, overlays]
  );

  const updateSelectedOverlay = patch => {
    if (!selectedOverlay) return;
    onChangeOverlays?.(
      (overlays || []).map(item =>
        item && String(item.id) === String(selectedOverlay.id) ? { ...item, ...patch } : item
      )
    );
  };

  const picture = signal => {
    const supported = signal && (signal.nodeId === 'MediaIn:main-video' || signal.nodeId === 'ColorCorrector:finish' || signal.nodeId.startsWith('Adjustment:'));
    return supported && videoRef ? <><StudioSourceGradeViewer nodeId={signal.nodeId} videoRef={videoRef}
      mapTime={mapTime} time={currentTime} finishFx={finishFx} advancedColor={advancedColor} adjustmentLayers={adjustmentLayers} />
      <small>Source grade · graphics excluded</small></> : <small>Signal settings · inspect full composition in the programme monitor</small>;
  };

  return (
    <section
      className="ap-mfx-shell"
      data-testid="studio-node-flow"
      aria-label="AutoPromote Signal Node Flow"
    >
      <header className="ap-mfx-toolbar">
        <div className="ap-mfx-toolbar-group">
          <span className="ap-mfx-brand-pill" style={{ borderColor: "rgba(34,211,238,0.45)", color: "#a5f3fc" }}>
            AutoPromote Node Flow
          </span>
          {NODE_FLOW_PALETTE.map(entry => (
            <button
              key={entry.id}
              type="button"
              className="ap-mfx-btn"
              title={entry.description}
              onClick={() => handlePaletteAdd(entry.id)}
              data-testid={`flow-palette-${entry.id}`}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: entry.accent }} />
              + {entry.label}
            </button>
          ))}
        </div>

        <div className="ap-mfx-toolbar-group">
          <select
            className="ap-comp-select"
            style={{ width: 196 }}
            aria-label="Insert AutoPromote Smart Flow Rig"
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                handleSmartRig(e.target.value);
                e.target.value = "";
              }
            }}
            data-testid="flow-smart-rig-select"
          >
            <option value="">&#9889; Smart Flow Rigs (1-Click)...</option>
            {SMART_FLOW_RIGS.map(rig => (
              <option key={rig.id} value={rig.id}>
                [{rig.badge}] {rig.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="ap-mfx-btn"
            onClick={() => {
              patchNodeFlow({ positions: {} });
              setPan({ x: 16, y: 12 });
              setZoom(0.95);
            }}
          >
            Auto-Layout
          </button>
          <button type="button" className="ap-mfx-btn" onClick={() => setZoom(z => Math.max(0.55, +(z - 0.1).toFixed(2)))}>
            &minus;
          </button>
          <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 38, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="ap-mfx-btn" onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)))}>
            +
          </button>
        </div>
      </header>

      <div className="ap-flow-layout">
        {/* Interactive Signal Node Graph */}
        <div
          ref={canvasRef}
          className="ap-flow-canvas-wrap"
          onMouseMove={handleCanvasMouseMove}
          onClick={() => setPendingWire(null)}
          data-testid="flow-canvas"
        >
          <div
            className="ap-flow-stage"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <svg className="ap-flow-wires-svg">
              {graph.wires.map(wire => {
                const fromNode = nodesById.get(wire.fromNodeId);
                const toNode = nodesById.get(wire.toNodeId);
                if (!fromNode || !toNode) return null;
                const p1 = getPortOffset(fromNode, wire.fromPort, true);
                const p2 = getPortOffset(toNode, wire.toPort, false);
                const dx = Math.max(48, Math.abs(p2.x - p1.x) * 0.5);
                const stroke = NODE_FLOW_PORT_COLORS[wire.toPort] || "#38bdf8";
                const dashed = wire.toPort === "Parent" || wire.toPort === "Mask";
                return (
                  <path
                    key={wire.id}
                    d={`M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={wire.toPort === "BG" ? 2.4 : 2}
                    strokeDasharray={dashed ? "5 4" : undefined}
                    strokeOpacity="0.88"
                  />
                );
              })}
              {pendingWire && nodesById.has(pendingWire.fromNodeId) ? (() => {
                const src = getPortOffset(nodesById.get(pendingWire.fromNodeId), pendingWire.fromPort, true);
                const dx = Math.max(40, Math.abs(pendingWire.mouseX - src.x) * 0.45);
                return (
                  <path
                    d={`M ${src.x} ${src.y} C ${src.x + dx} ${src.y}, ${pendingWire.mouseX - dx} ${pendingWire.mouseY}, ${pendingWire.mouseX} ${pendingWire.mouseY}`}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.2"
                    strokeDasharray="4 3"
                  />
                );
              })() : null}
            </svg>

            {graph.nodes.map(node => {
              const isSelected = selectedNode?.id === node.id;
              const isV1 = graph.viewerA === node.id;
              const isV2 = graph.viewerB === node.id;
              const minHeight = NODE_BASE_HEIGHT + Math.max(0, (node.inputs.length - 1) * 14);

              return (
                <div
                  key={node.id}
                  data-testid={`flow-node-${node.id}`}
                  tabIndex={0}
                  onKeyDown={e => handleNodeKeyDown(e, node)}
                  onClick={e => {
                    e.stopPropagation();
                    handleSelectNode(node);
                  }}
                  className={`ap-flow-node ${isSelected ? "is-selected" : ""} ${node.bypassed ? "is-bypassed" : ""}`}
                  style={{ left: node.x, top: node.y, minHeight }}
                >
                  <div className="ap-flow-node-bar" style={{ background: node.accent }} />
                  <div
                    className="ap-flow-node-header"
                    onMouseDown={e => handleNodeDragStart(e, node)}
                  >
                    <span className="ap-flow-node-title" title={node.label}>
                      {node.label}
                    </span>
                    <div className="ap-flow-node-badges" onMouseDown={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`ap-flow-vbtn ${isV1 ? "is-v1" : ""}`}
                        aria-label={`Assign ${node.label} to Viewer 1`}
                        onClick={e => {
                          e.stopPropagation();
                          patchNodeFlow({ viewerA: node.id });
                        }}
                      >
                        1
                      </button>
                      <button
                        type="button"
                        className={`ap-flow-vbtn ${isV2 ? "is-v2" : ""}`}
                        aria-label={`Assign ${node.label} to Viewer 2`}
                        onClick={e => {
                          e.stopPropagation();
                          patchNodeFlow({ viewerB: isV2 ? null : node.id });
                        }}
                      >
                        2
                      </button>
                      {node.kind === "Adjustment" ? (
                        <button
                          type="button"
                          className="ap-flow-vbtn"
                          aria-label={`Bypass ${node.label}`}
                          title="Bypass node"
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleBypass(node);
                          }}
                        >
                          &#9211;
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="ap-flow-node-sub">{node.subtitle}</div>

                  <div className="ap-flow-ports">
                    <div className="ap-flow-port-group">
                      {node.inputs.map(port => (
                        <button
                          key={port}
                          type="button"
                          className="ap-flow-port"
                          data-testid={`flow-port-in-${node.id}-${port}`}
                          aria-label={`${node.label} input ${port}`}
                          onClick={e => handlePortClick(e, node, port, false)}
                        >
                          <span
                            className="ap-flow-port-dot"
                            style={{ background: NODE_FLOW_PORT_COLORS[port] || "#94a3b8", color: NODE_FLOW_PORT_COLORS[port] || "#94a3b8" }}
                          />
                          <span>{port}</span>
                        </button>
                      ))}
                    </div>
                    <div className="ap-flow-port-group">
                      {node.outputs.map(port => (
                        <button
                          key={port}
                          type="button"
                          className="ap-flow-port"
                          data-testid={`flow-port-out-${node.id}-${port}`}
                          aria-label={`${node.label} output ${port}`}
                          onClick={e => handlePortClick(e, node, port, true)}
                        >
                          <span>{port}</span>
                          <span
                            className="ap-flow-port-dot"
                            style={{ background: NODE_FLOW_PORT_COLORS[port] || "#f8fafc", color: "#22d3ee" }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pendingWire ? (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 12,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(8, 17, 31, 0.92)",
                border: "1px solid rgba(34, 211, 238, 0.55)",
                fontSize: 11,
                color: "#67e8f9",
              }}
            >
              Wiring from <strong>{pendingWire.fromNodeId}</strong> &mdash; click a target{" "}
              <strong>Parent</strong>, <strong>Mask</strong>, <strong>BG</strong>, or <strong>FG</strong> port
            </div>
          ) : null}
        </div>

        {/* Right Sidebar: Dual Viewer [1] / [2] + Contextual Node Inspector */}
        <aside className="ap-flow-sidebar">
          <div className="ap-flow-ab-monitor" data-testid="flow-ab-monitor">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#67e8f9", fontWeight: 700 }}>
                [1] {signalA.label} ({signalA.badge})
              </span>
              <span style={{ color: "#e9d5ff", fontWeight: 700 }}>
                {signalB ? `[2] ${signalB.label} (${signalB.badge})` : "[2] Off"}
              </span>
            </div>

            <div className="ap-flow-ab-screen">
              <div className="ap-flow-ab-half">
                <span style={{ fontSize: 9.5, color: "#67e8f9", fontWeight: 800 }}>VIEWER [1]</span>
                {picture(signalA)}
                <div style={{ fontSize: 10.5, color: "#cbd5e1" }}>
                  Grade: <strong>{signalA.includeGrade ? "On" : "Bypassed"}</strong> &middot; Overlays:{" "}
                  <strong>
                    {Array.isArray(signalA.includedOverlayIds) ? signalA.includedOverlayIds.length : "All"}
                  </strong>
                </div>
              </div>
              {signalB ? (
                <div
                  className="ap-flow-ab-half is-b"
                  style={{ left: 0, clipPath: `inset(0 0 0 ${graph.splitPosition}%)` }}
                >
                  <span style={{ fontSize: 9.5, color: "#f5d0fe", fontWeight: 800 }}>VIEWER [2]</span>
                  {picture(signalB)}
                  <div style={{ fontSize: 10.5, color: "#f8fafc" }}>
                    Grade: <strong>{signalB.includeGrade ? "On" : "Bypassed"}</strong> &middot; Overlays:{" "}
                    <strong>
                      {Array.isArray(signalB.includedOverlayIds) ? signalB.includedOverlayIds.length : "All"}
                    </strong>
                  </div>
                </div>
              ) : null}
            </div>

            {signalB ? (
              <label className="ap-comp-field">
                <span>A/B Wipe Split ({Math.round(graph.splitPosition)}%)</span>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={graph.splitPosition}
                  aria-label="Signal Flow A/B viewer wipe split"
                  onChange={e => patchNodeFlow({ splitPosition: Number(e.target.value) })}
                />
              </label>
            ) : (
              <span style={{ fontSize: 10, color: "#64748b" }}>
                Click <strong>[2]</strong> on any node (or press <code>2</code>) to compare node signals side-by-side.
              </span>
            )}
          </div>

          {/* Contextual Node Inspector */}
          {selectedNode ? (
            <div
              style={{
                background: "#060e1c",
                border: "1px solid rgba(148,163,184,0.16)",
                borderRadius: 10,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
              data-testid="flow-node-inspector"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 12, color: "#f8fafc" }}>{selectedNode.label}</strong>
                <span className="ap-comp-type-tag is-title">{selectedNode.kind}</span>
              </div>

              {selectedNode.kind === "Merge" && selectedOverlay ? (
                <>
                  <label className="ap-comp-field">
                    <span>Apply Mode (Blend)</span>
                    <select
                      className="ap-comp-select"
                      aria-label="Selected Merge blend mode"
                      value={selectedOverlay.blendMode || "normal"}
                      onChange={e => updateSelectedOverlay({ blendMode: e.target.value })}
                    >
                      {STUDIO_EXPORT_BLEND_MODES.map(modeId => (
                        <option key={modeId} value={modeId}>
                          {modeId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ap-comp-field">
                    <span>Blend Opacity ({Math.round(Number(selectedOverlay.opacity ?? 1) * 100)}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={selectedOverlay.opacity ?? 1}
                      onChange={e => updateSelectedOverlay({ opacity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="ap-comp-field">
                    <span>Matte Port Operator</span>
                    <select
                      className="ap-comp-select"
                      aria-label="Selected Merge matte mode"
                      value={selectedOverlay.trackMatte?.mode || "none"}
                      onChange={e => {
                        const mode = e.target.value;
                        if (mode === "none") {
                          updateSelectedOverlay({ trackMatte: { mode: "none", sourceLayerId: null } });
                        } else {
                          const fallbackSrc = (overlays || []).find(
                            o =>
                              o &&
                              !o.isCaption &&
                              !o.isNullRig &&
                              String(o.id) !== String(selectedOverlay.id)
                          )?.id;
                          if (selectedOverlay.trackMatte?.sourceLayerId || fallbackSrc) {
                            updateSelectedOverlay({
                              trackMatte: {
                                mode,
                                sourceLayerId: String(selectedOverlay.trackMatte?.sourceLayerId || fallbackSrc),
                              },
                            });
                          }
                        }
                      }}
                    >
                      {TRACK_MATTE_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              {(selectedNode.kind === "Transform" || selectedNode.kind === "NullRig") &&
              (selectedOverlay || selectedNode.targetId === "main-video") ? (
                <>
                  {(() => {
                    const xf = selectedNode.targetId === "main-video" ? mainTransform || {} : selectedOverlay;
                    const commitXf = patch =>
                      selectedNode.targetId === "main-video"
                        ? onChangeMainTransform?.({ ...(mainTransform || {}), ...patch })
                        : updateSelectedOverlay(patch);
                    return (
                      <>
                        <label className="ap-comp-field">
                          <span>Center X ({Math.round(Number(xf.x ?? 50))}%)</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={xf.x ?? 50}
                            onChange={e => commitXf({ x: Number(e.target.value) })}
                          />
                        </label>
                        <label className="ap-comp-field">
                          <span>Center Y ({Math.round(Number(xf.y ?? 50))}%)</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={xf.y ?? 50}
                            onChange={e => commitXf({ y: Number(e.target.value) })}
                          />
                        </label>
                        <label className="ap-comp-field">
                          <span>Size ({Number(xf.scale ?? 1).toFixed(2)}x)</span>
                          <input
                            type="range"
                            min="0.2"
                            max="2.5"
                            step="0.02"
                            value={xf.scale ?? 1}
                            onChange={e => commitXf({ scale: Number(e.target.value) })}
                          />
                        </label>
                        <label className="ap-comp-field">
                          <span>Angle ({Math.round(Number(xf.rotation ?? 0))}&deg;)</span>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={xf.rotation ?? 0}
                            onChange={e => commitXf({ rotation: Number(e.target.value) })}
                          />
                        </label>
                      </>
                    );
                  })()}
                </>
              ) : null}

              {selectedNode.kind === 'Adjustment' ? (() => {
                const index = adjustmentLayers.findIndex(layer => String(layer.id) === String(selectedNode.targetId));
                const layer = adjustmentLayers[index];
                return layer ? <StudioAdjustmentControls layer={layer} index={index} count={adjustmentLayers.length}
                  onChange={next => onChangeAdjustmentLayers?.(adjustmentLayers.map(item => item.id === layer.id ? next : item))}
                  onMove={delta => {
                    const next = [...adjustmentLayers];
                    [next[index], next[index + delta]] = [next[index + delta], next[index]];
                    onChangeAdjustmentLayers?.(next);
                  }} /> : null;
              })() : null}

              {selectedNode.kind === "ColorCorrector" ? (
                <>
                  <label className="ap-comp-field">
                    <span>Contrast ({finishFx?.contrast ?? 1}%)</span>
                    <input
                      type="range"
                      min="0.65"
                      max="1.75"
                      step="0.01"
                      value={finishFx?.contrast ?? 1}
                      onChange={e => onChangeFinishFx?.({ ...(finishFx || {}), contrast: Number(e.target.value) })}
                    />
                  </label>
                  <label className="ap-comp-field">
                    <span>Saturation ({finishFx?.saturation ?? 1}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="1.8"
                      step="0.01"
                      value={finishFx?.saturation ?? 1}
                      onChange={e => onChangeFinishFx?.({ ...(finishFx || {}), saturation: Number(e.target.value) })}
                    />
                  </label>
                  <label className="ap-comp-field">
                    <span>Warmth ({finishFx?.temperature ?? 0})</span>
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      value={finishFx?.temperature ?? 0}
                      onChange={e => onChangeFinishFx?.({ ...(finishFx || {}), temperature: Number(e.target.value) })}
                    />
                  </label>
                </>
              ) : null}

              {selectedNode.kind === "GlowBlur" && selectedNode.targetId === "finish-texture" ? (
                <>
                  <label className="ap-comp-field">
                    <span>Film Grain ({finishFx?.filmGrain ?? 0})</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={finishFx?.filmGrain ?? 0}
                      onChange={e => onChangeFinishFx?.({ ...(finishFx || {}), filmGrain: Number(e.target.value) })}
                    />
                  </label>
                  <label className="ap-comp-field">
                    <span>Chromatic Split ({finishFx?.chromaticAberration ?? 0})</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={finishFx?.chromaticAberration ?? 0}
                      onChange={e =>
                        onChangeFinishFx?.({ ...(finishFx || {}), chromaticAberration: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              ) : null}

              {selectedNode.kind === "PolygonMask" && selectedOverlay ? (
                <>
                  <label className="ap-comp-field">
                    <span>Mask Shape</span>
                    <select
                      className="ap-comp-select"
                      value={selectedOverlay.mask?.shape || "ellipse"}
                      onChange={e =>
                        updateSelectedOverlay({
                          mask: { ...(selectedOverlay.mask || {}), enabled: true, shape: e.target.value },
                        })
                      }
                    >
                      <option value="ellipse">Ellipse</option>
                      <option value="polygon">Polygon</option>
                      <option value="rectangle">Rounded Rect</option>
                    </select>
                  </label>
                  <label className="ap-comp-field">
                    <span>Feather ({selectedOverlay.mask?.feather ?? 8}px)</span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={selectedOverlay.mask?.feather ?? 8}
                      onChange={e =>
                        updateSelectedOverlay({
                          mask: { ...(selectedOverlay.mask || {}), enabled: true, feather: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              <div style={{ fontSize: 10, color: "#64748b", borderTop: "1px solid rgba(148,163,184,0.1)", paddingTop: 6 }}>
                Tip: Click output port <strong>Out</strong> then click <strong>Parent</strong> or <strong>Mask</strong> to wire hierarchy &amp; mattes live.
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
