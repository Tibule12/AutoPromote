import React, { useMemo, useRef, useState } from "react";
import { STUDIO_EXPORT_BLEND_MODES } from "./studioBlendModes";
import {
  interpolateAutomationValue,
  sortAutomationKeyframes,
  upsertAutomationKeyframe,
} from "./studioAutomation";
import {
  COMP_CURVE_PRESETS,
  MOTION_DRIVER_CATALOG,
  MOTION_DRIVER_PROPERTIES,
  TRACK_MATTE_OPTIONS,
  bakeLayerMotionToKeyframes,
  createStudioNullRigLayer,
  defaultMotionDriverForProperty,
  evaluateWorldLayerPose,
  isHiddenTrackMatteSource,
  reparentStudioLayerPreservingWorldPose,
} from "./studioCompRigging";
import "./StudioMotionFlow.css";
import StudioCurveHandles from './StudioCurveHandles';

const PROP_META = {
  x: { label: "Pos X", color: "#fb7185", unit: "%", min: 0, max: 100, fallback: 50 },
  y: { label: "Pos Y", color: "#34d399", unit: "%", min: 0, max: 100, fallback: 50 },
  scale: { label: "Scale", color: "#22d3ee", unit: "x", min: 0.2, max: 2.5, fallback: 1 },
  rotation: { label: "Rotate", color: "#facc15", unit: "deg", min: -180, max: 180, fallback: 0 },
  opacity: { label: "Opacity", color: "#a855f7", unit: "", min: 0, max: 1, fallback: 1 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export default function StudioCompWorkbench({
  overlays = [],
  mainTransform = {},
  motionKeyframes = [],
  adjustmentLayers = [],
  activeOverlayId = null,
  hideShyLayers = false,
  currentTime = 0,
  programmeDuration = 8,
  initialGraphMode = "value",
  onSelectOverlay,
  onChangeOverlays,
  onChangeMainTransform,
  onChangeMotionKeyframes,
  onChangeAdjustmentLayers,
  onChangeHideShyLayers,
  onSeek,
  onInteractionStart,
  onInteractionEnd,
}) {
  const [graphMode, setGraphMode] = useState(initialGraphMode); // "dope" | "value" | "speed"
  const [visibleProps, setVisibleProps] = useState(["x", "scale"]);
  const [driverProp, setDriverProp] = useState("scale");
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [whipDragFromId, setWhipDragFromId] = useState(null);
  const svgRef = useRef(null);

  const visualOverlays = useMemo(
    () => (overlays || []).filter(item => item && !item.isCaption),
    [overlays]
  );

  const displayedOverlays = useMemo(
    () => (hideShyLayers ? visualOverlays.filter(item => !item.shy) : visualOverlays),
    [visualOverlays, hideShyLayers]
  );

  const selectedTargetId = activeOverlayId || "main-video";
  const selectedLayer = useMemo(() => {
    if (selectedTargetId === "main-video") {
      return { id: "main-video", name: "Main Programme Video", type: "video", x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, ...mainTransform };
    }
    return visualOverlays.find(item => String(item.id) === String(selectedTargetId)) || {
      id: "main-video",
      name: "Main Programme Video",
      type: "video",
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      opacity: 1,
      ...mainTransform,
    };
  }, [selectedTargetId, visualOverlays, mainTransform]);

  const targetKeyframes = useMemo(
    () =>
      sortAutomationKeyframes(
        (motionKeyframes || []).filter(k => String(k.targetId) === String(selectedLayer.id))
      ),
    [motionKeyframes, selectedLayer.id]
  );

  const selectedKeyframe = useMemo(
    () =>
      targetKeyframes.find(k => String(k.id) === String(selectedKeyId)) ||
      targetKeyframes.filter(k => visibleProps.includes(k.property)).at(-1) ||
      null,
    [targetKeyframes, selectedKeyId, visibleProps]
  );

  const updateOverlayById = (layerId, updater) => {
    if (layerId === "main-video") {
      const nextMain = typeof updater === "function" ? updater(mainTransform || {}) : { ...mainTransform, ...updater };
      onChangeMainTransform?.(nextMain);
      return;
    }
    const next = (overlays || []).map(item => {
      if (!item || String(item.id) !== String(layerId)) return item;
      return typeof updater === "function" ? updater(item) : { ...item, ...updater };
    });
    onChangeOverlays?.(next);
  };

  const handleReparent = (childId, nextParentId) => {
    if (!childId || childId === "main-video" || String(childId) === String(nextParentId)) return;
    try {
      const next = (overlays || []).map(item =>
        item && String(item.id) === String(childId)
          ? reparentStudioLayerPreservingWorldPose(
              item,
              nextParentId || null,
              overlays,
              motionKeyframes,
              currentTime,
              mainTransform
            )
          : item
      );
      onChangeOverlays?.(next);
    } catch (_err) {
      // Cycle or invalid parent rejected cleanly
    }
  };

  const handleTrackMatteModeChange = (layer, nextMode) => {
    if (nextMode === "none") {
      updateOverlayById(layer.id, { trackMatte: { mode: "none", sourceLayerId: null } });
      return;
    }
    const candidates = visualOverlays.filter(
      other =>
        String(other.id) !== String(layer.id) &&
        !other.isNullRig &&
        (!other.trackMatte?.mode || other.trackMatte.mode === "none")
    );
    const chosenSource =
      candidates.find(c => String(c.id) === String(layer.trackMatte?.sourceLayerId))?.id ||
      candidates[0]?.id ||
      null;
    if (!chosenSource) return;
    updateOverlayById(layer.id, {
      trackMatte: { mode: nextMode, sourceLayerId: String(chosenSource) },
    });
  };

  const handleAddNullRig = () => {
    const count = visualOverlays.filter(item => item.isNullRig).length + 1;
    const nullLayer = createStudioNullRigLayer({
      id: `null-rig-${Date.now()}`,
      name: `Null Rig ${count}`,
      startTime: Math.max(0, Number(currentTime) || 0),
      duration: Math.max(.2, (Number(programmeDuration) || 8) - (Number(currentTime) || 0)),
    });
    onChangeOverlays?.([...(overlays || []), nullLayer]);
    onSelectOverlay?.(nullLayer.id);
  };

  const handleAddAdjustmentLayer = () => {
    const idx = (adjustmentLayers || []).length + 1;
    const cueStart = Math.max(0, Number(currentTime) || 0);
    const cueDur = Math.max(.05, Math.min(5, (Number(programmeDuration) || 8) - cueStart));
    const nextAdj = {
      id: `adj-layer-${Date.now()}`,
      name: `Adjustment Grade ${idx}`,
      label: `Adjustment Grade ${idx}`,
      enabled: true,
      preset: "cinema_pop",
      opacity: 1,
      intensity: 100,
      startTime: cueStart,
      duration: cueDur,
      finishFx: { contrast: 1.12, saturation: 1.08, vignette: 16 },
    };
    onChangeAdjustmentLayers?.([...(adjustmentLayers || []), nextAdj]);
  };

  const togglePropertyLane = prop => {
    setVisibleProps(prev =>
      prev.includes(prop) ? (prev.length > 1 ? prev.filter(p => p !== prop) : prev) : [...prev, prop]
    );
    setDriverProp(prop);
  };

  const handleAddKeyframeAtPlayhead = () => {
    const activeProp = driverProp || visibleProps[0] || "scale";
    if (!visibleProps.includes(activeProp)) {
      setVisibleProps(prev => [...prev, activeProp]);
    }
    // Keys store authored local values. Parenting and live motion drivers are
    // evaluated afterwards in both preview and export; stamping their output
    // here applies those transforms a second time and makes the layer jump.
    const localValue = interpolateAutomationValue({
      keyframes: targetKeyframes,
      property: activeProp,
      time: currentTime,
      fallback: selectedLayer[activeProp] ?? PROP_META[activeProp].fallback,
    });
    const nextKey = {
      id: `kf-${selectedLayer.id}-${activeProp}-${Date.now()}`,
      targetId: String(selectedLayer.id),
      property: activeProp,
      time: Number(clamp(currentTime, 0, Math.max(0.2, programmeDuration)).toFixed(3)),
      value: Number(localValue.toFixed(4)),
      easing: "bezier",
      curve: [0.22, 1, 0.36, 1],
    };
    const nextList = upsertAutomationKeyframe(motionKeyframes || [], nextKey);
    onChangeMotionKeyframes?.(nextList);
    setSelectedKeyId(nextKey.id);
  };

  const handleSelectedKeyframeValueChange = rawValue => {
    if (!selectedKeyframe || String(rawValue).trim() === "") return;
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return;
    const meta = PROP_META[selectedKeyframe.property] || PROP_META.scale;
    const clampedValue = Number(clamp(numeric, meta.min, meta.max).toFixed(4));
    const nextList = (motionKeyframes || []).map(k =>
      String(k.id) === String(selectedKeyframe.id) ? { ...k, value: clampedValue } : k
    );
    onChangeMotionKeyframes?.(nextList);
  };

  const handleApplyCurvePreset = preset => {
    if (!selectedKeyframe) return;
    const nextList = (motionKeyframes || []).map(k =>
      String(k.id) === String(selectedKeyframe.id)
        ? {
            ...k,
            easing: preset.easing,
            curve: [...preset.curve],
          }
        : k
    );
    onChangeMotionKeyframes?.(nextList);
  };

  const handleDriverTypeChange = nextType => {
    const existingDrivers = { ...(selectedLayer.motionDrivers || {}) };
    if (!nextType || nextType === "none") {
      delete existingDrivers[driverProp];
    } else {
      existingDrivers[driverProp] = defaultMotionDriverForProperty(nextType, driverProp);
    }
    updateOverlayById(selectedLayer.id, {
      motionDrivers: Object.keys(existingDrivers).length ? existingDrivers : undefined,
    });
  };

  const handleDriverParamChange = (field, rawValue) => {
    const currentDriver = selectedLayer.motionDrivers?.[driverProp];
    if (!currentDriver) return;
    const nextVal =
      field === "waveform" || field === "loopMode" ? String(rawValue) : Number(rawValue);
    updateOverlayById(selectedLayer.id, {
      motionDrivers: {
        ...(selectedLayer.motionDrivers || {}),
        [driverProp]: {
          ...currentDriver,
          [field]: nextVal,
        },
      },
    });
  };

  const handleBakeRigAndDrivers = () => {
    const { initialPose, keyframes: bakedKeys } = bakeLayerMotionToKeyframes({
      layer: selectedLayer,
      overlays,
      motionKeyframes,
      mainTransform,
      programmeDuration: Math.max(0.5, Number(programmeDuration) || 8),
      fps: selectedLayer.id === "main-video" ? 15 : 30,
      maxSamples: selectedLayer.id === "main-video" ? 40 : 180,
    });
    const remainingKeys = (motionKeyframes || []).filter(
      k =>
        String(k.targetId) !== String(selectedLayer.id) ||
        !MOTION_DRIVER_PROPERTIES.includes(k.property)
    );
    onChangeMotionKeyframes?.([...remainingKeys, ...bakedKeys]);
    updateOverlayById(selectedLayer.id, item => {
      const cleaned = {
        ...item,
        x: Number(initialPose.x.toFixed(4)),
        y: Number(initialPose.y.toFixed(4)),
        scale: Number(initialPose.scale.toFixed(4)),
        rotation: Number(initialPose.rotation.toFixed(4)),
        opacity: Number(initialPose.opacity.toFixed(4)),
      };
      delete cleaned.motionDrivers;
      delete cleaned.parentId;
      return cleaned;
    });
  };

  const durationSafe = Math.max(1, Number(programmeDuration) || 8);
  const activeDriver = selectedLayer.motionDrivers?.[driverProp] || null;
  const hasAnySolo = visualOverlays.some(item => item.solo);

  // Sample curves for Value / Speed Graph
  const sampledSeries = useMemo(() => {
    const sampleCount = 72;
    return visibleProps.map(prop => {
      const meta = PROP_META[prop];
      const propKeys = targetKeyframes.filter(k => k.property === prop);
      const basePoints = [];
      const drivenPoints = [];
      for (let i = 0; i <= sampleCount; i += 1) {
        const t = (durationSafe * i) / sampleCount;
        const baseVal = interpolateAutomationValue({
          keyframes: propKeys,
          property: prop,
          time: t,
          fallback: selectedLayer[prop] ?? meta.fallback,
        });
        const worldVal = evaluateWorldLayerPose(
          selectedLayer,
          overlays,
          motionKeyframes,
          t,
          mainTransform
        )[prop];
        basePoints.push({ t, v: baseVal });
        drivenPoints.push({ t, v: worldVal });
      }
      if (graphMode === "speed") {
        const speedPts = drivenPoints.map((pt, idx) => {
          if (idx === 0) return { t: pt.t, v: 0 };
          const prev = drivenPoints[idx - 1];
          const dt = Math.max(1e-4, pt.t - prev.t);
          return { t: pt.t, v: Math.abs((pt.v - prev.v) / dt) };
        });
        const maxSpeed = Math.max(1, ...speedPts.map(p => p.v));
        return { prop, meta, points: speedPts, drivenPoints: null, min: 0, max: maxSpeed * 1.15, keys: propKeys };
      }
      const allVals = [...basePoints.map(p => p.v), ...drivenPoints.map(p => p.v), meta.min, meta.max];
      const min = Math.min(...allVals);
      const max = Math.max(min + 0.01, ...allVals);
      const hasDelta = drivenPoints.some((pt, idx) => Math.abs(pt.v - basePoints[idx].v) > 1e-3);
      return {
        prop,
        meta,
        points: basePoints,
        drivenPoints: hasDelta ? drivenPoints : null,
        min,
        max,
        keys: propKeys,
      };
    });
  }, [visibleProps, targetKeyframes, durationSafe, selectedLayer, overlays, motionKeyframes, mainTransform, graphMode]);

  const toSvgX = t => 38 + (clamp(t, 0, durationSafe) / durationSafe) * 446;
  const toSvgY = (v, min, max) => 186 - ((v - min) / Math.max(1e-5, max - min)) * 154;

  const handleGraphSvgClick = event => {
    if (!svgRef.current || !onSeek) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const relX = ((event.clientX - rect.left) / rect.width) * 500;
    const nextTime = clamp(((relX - 38) / 446) * durationSafe, 0, durationSafe);
    onSeek(Number(nextTime.toFixed(3)));
  };

  return (
    <section
      className="ap-mfx-shell"
      data-testid="studio-comp-workbench"
      aria-label="AutoPromote Comp Workbench"
    >
      <header className="ap-mfx-toolbar">
        <div className="ap-mfx-toolbar-group">
          <span className="ap-mfx-brand-pill">AutoPromote Comp &amp; Rig</span>
          <div className="ap-mfx-seg" role="tablist" aria-label="Graph view mode">
            {[
              { id: "dope", label: "Dope Sheet" },
              { id: "value", label: "Value Graph" },
              { id: "speed", label: "Speed Graph" },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={graphMode === tab.id}
                className={`ap-mfx-seg-btn ${graphMode === tab.id ? "is-active" : ""}`}
                onClick={() => setGraphMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ap-mfx-toolbar-group">
          <button
            type="button"
            className="ap-mfx-btn is-accent"
            onClick={handleAddNullRig}
            data-testid="comp-add-null-rig"
          >
            + Null Rig
          </button>
          <button
            type="button"
            className="ap-mfx-btn"
            onClick={handleAddAdjustmentLayer}
            data-testid="comp-add-adjustment-layer"
          >
            + Adjustment Grade ({adjustmentLayers.length})
          </button>
          <button
            type="button"
            className={`ap-mfx-btn ${hideShyLayers ? "is-active" : ""}`}
            onClick={() => onChangeHideShyLayers?.(!hideShyLayers)}
            title="Hide or reveal Shy layers in the stack"
          >
            {hideShyLayers ? "Showing Non-Shy" : "Hide Shy"}
          </button>
          {hasAnySolo ? (
            <button
              type="button"
              className="ap-mfx-btn is-active"
              onClick={() =>
                onChangeOverlays?.((overlays || []).map(item => (item ? { ...item, solo: false } : item)))
              }
            >
              Clear Solo
            </button>
          ) : null}
          <button
            type="button"
            className="ap-mfx-btn"
            onClick={handleBakeRigAndDrivers}
            disabled={!selectedLayer.parentId && !selectedLayer.motionDrivers}
            title="Convert live Parenting and Motion Drivers into editable canonical keyframes"
            data-testid="comp-bake-rig-button"
          >
            Bake Rig &rarr; Keys
          </button>
        </div>
      </header>

      <div className="ap-comp-workbench-body">
        {/* Left: Layer Switches, Pick-Whip Parenting, Track Mattes & Motion Drivers */}
        <div className="ap-comp-matrix-pane">
          <div className="ap-comp-matrix-head">
            <span>#</span>
            <span>Switches</span>
            <span>Layer</span>
            <span>Parent (Whip)</span>
            <span>Track Matte</span>
            <span>Mode</span>
            <span>Drivers</span>
          </div>

          {/* Base Programme Row */}
          <div
            className={`ap-comp-matrix-row ${selectedLayer.id === "main-video" ? "is-selected" : ""}`}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (whipDragFromId) handleReparent(whipDragFromId, "main-video");
              setWhipDragFromId(null);
            }}
          >
            <span>0</span>
            <div className="ap-comp-switches">
              <span className="ap-comp-sw is-on" title="Base programme stream">V</span>
            </div>
            <div
              className="ap-comp-layer-title"
              onClick={() => onSelectOverlay?.(null)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && onSelectOverlay?.(null)}
            >
              <span className="ap-comp-type-tag is-media">BASE</span>
              <span className="ap-comp-layer-name">Main Programme</span>
            </div>
            <span style={{ color: "#64748b", fontSize: 10 }}>Root Stage</span>
            <span style={{ color: "#64748b", fontSize: 10 }}>&mdash;</span>
            <span style={{ color: "#94a3b8", fontSize: 10 }}>{mainTransform?.blendMode || "normal"}</span>
            <div className="ap-comp-driver-pills">
              {MOTION_DRIVER_PROPERTIES.filter(p => mainTransform?.motionDrivers?.[p]?.enabled !== false && mainTransform?.motionDrivers?.[p]).map(p => (
                <span key={p} className="ap-comp-driver-chip" onClick={() => { onSelectOverlay?.(null); setDriverProp(p); }}>
                  {p.toUpperCase()}:{mainTransform.motionDrivers[p].type.slice(0, 3).toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          {displayedOverlays.map((layer, index) => {
            const isSelected = String(selectedLayer.id) === String(layer.id);
            const matteHidden = isHiddenTrackMatteSource(layer, visualOverlays);
            const parentCandidates = visualOverlays.filter(other => String(other.id) !== String(layer.id));
            const matteCandidates = visualOverlays.filter(
              other =>
                String(other.id) !== String(layer.id) &&
                !other.isNullRig &&
                (!other.trackMatte?.mode || other.trackMatte.mode === "none")
            );
            const activeLayerDrivers = MOTION_DRIVER_PROPERTIES.filter(
              p => layer.motionDrivers?.[p] && layer.motionDrivers[p].enabled !== false
            );

            return (
              <div
                key={layer.id}
                data-testid={`comp-layer-row-${layer.id}`}
                className={`ap-comp-matrix-row ${isSelected ? "is-selected" : ""} ${matteHidden ? "is-matte-hidden" : ""}`}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (whipDragFromId && String(whipDragFromId) !== String(layer.id)) {
                    handleReparent(whipDragFromId, layer.id);
                  }
                  setWhipDragFromId(null);
                }}
              >
                <span>{index + 1}</span>
                <div className="ap-comp-switches">
                  <button
                    type="button"
                    className={`ap-comp-sw ${layer.enabled !== false ? "is-on" : ""}`}
                    aria-label={`Toggle visibility for ${layer.name || layer.text || layer.id}`}
                    title="Visibility"
                    onClick={() => updateOverlayById(layer.id, { enabled: layer.enabled === false })}
                  >
                    👁
                  </button>
                  <button
                    type="button"
                    className={`ap-comp-sw is-solo ${layer.solo ? "is-on" : ""}`}
                    aria-label={`Solo ${layer.name || layer.text || layer.id}`}
                    title="Solo layer"
                    onClick={() => updateOverlayById(layer.id, { solo: !layer.solo })}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    className={`ap-comp-sw ${layer.shy ? "is-on" : ""}`}
                    aria-label={`Shy ${layer.name || layer.text || layer.id}`}
                    title="Shy layer"
                    onClick={() => updateOverlayById(layer.id, { shy: !layer.shy })}
                  >
                    H
                  </button>
                  <button
                    type="button"
                    className={`ap-comp-sw is-lock ${layer.locked ? "is-on" : ""}`}
                    aria-label={`Lock ${layer.name || layer.text || layer.id}`}
                    title="Lock layer"
                    onClick={() => updateOverlayById(layer.id, { locked: !layer.locked })}
                  >
                    🔒
                  </button>
                  <button
                    type="button"
                    className={`ap-comp-sw ${layer.motionBlur?.enabled ? "is-on" : ""}`}
                    aria-label={`Motion blur for ${layer.name || layer.text || layer.id}`}
                    title="Motion Blur"
                    onClick={() =>
                      updateOverlayById(layer.id, {
                        motionBlur: {
                          samples: 5,
                          shutter: 180,
                          ...(layer.motionBlur || {}),
                          enabled: !layer.motionBlur?.enabled,
                        },
                      })
                    }
                  >
                    M
                  </button>
                </div>

                <div
                  className="ap-comp-layer-title"
                  onClick={() => onSelectOverlay?.(layer.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && onSelectOverlay?.(layer.id)}
                >
                  <span
                    className={`ap-comp-type-tag ${
                      layer.isNullRig
                        ? "is-null"
                        : layer.vectorShape
                          ? "is-vec"
                          : layer.type === "text"
                            ? "is-title"
                            : "is-media"
                    }`}
                  >
                    {layer.isNullRig ? "NULL" : layer.vectorShape ? "VEC" : layer.type === "text" ? "TXT" : "MED"}
                  </span>
                  <span className="ap-comp-layer-name">
                    {layer.name || layer.text || `Layer ${index + 1}`}
                    {matteHidden ? " (Matte Src)" : ""}
                  </span>
                </div>

                {/* Pick-Whip + Parent Selector */}
                <div className="ap-comp-whip-cell">
                  <span
                    draggable
                    onDragStart={() => setWhipDragFromId(layer.id)}
                    onDragEnd={() => setWhipDragFromId(null)}
                    className="ap-comp-whip-handle"
                    title="Drag Pick-Whip onto any parent layer or Null Rig"
                    data-testid={`pick-whip-${layer.id}`}
                  >
                    ◎
                  </span>
                  <select
                    className="ap-comp-select"
                    aria-label={`Parent layer for ${layer.name || layer.text || layer.id}`}
                    value={layer.parentId || ""}
                    onChange={e => handleReparent(layer.id, e.target.value || null)}
                  >
                    <option value="">None</option>
                    <option value="main-video">0. Main Programme</option>
                    {parentCandidates.map(cand => (
                      <option key={cand.id} value={cand.id}>
                        {cand.isNullRig ? "[Null] " : ""}
                        {cand.name || cand.text || cand.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Track Matte Selector */}
                {layer.isNullRig ? (
                  <span style={{ color: "#64748b", fontSize: 10 }}>Transform Rig</span>
                ) : (
                  <div className="ap-comp-matte-cell">
                    <select
                      className="ap-comp-select"
                      aria-label={`Track matte mode for ${layer.name || layer.text || layer.id}`}
                      value={layer.trackMatte?.mode || "none"}
                      onChange={e => handleTrackMatteModeChange(layer, e.target.value)}
                    >
                      {TRACK_MATTE_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.shortLabel}
                        </option>
                      ))}
                    </select>
                    {layer.trackMatte?.mode && layer.trackMatte.mode !== "none" ? (
                      <select
                        className="ap-comp-select"
                        aria-label={`Track matte source for ${layer.name || layer.text || layer.id}`}
                        value={layer.trackMatte.sourceLayerId || ""}
                        onChange={e =>
                          updateOverlayById(layer.id, {
                            trackMatte: {
                              mode: layer.trackMatte.mode,
                              sourceLayerId: e.target.value || null,
                            },
                          })
                        }
                      >
                        {matteCandidates.map(cand => (
                          <option key={cand.id} value={cand.id}>
                            {cand.name || cand.text || cand.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: "#475569", fontSize: 10, alignSelf: "center" }}>No Src</span>
                    )}
                  </div>
                )}

                {/* Blend Mode */}
                {layer.isNullRig ? (
                  <span style={{ color: "#64748b", fontSize: 10 }}>&mdash;</span>
                ) : (
                  <select
                    className="ap-comp-select"
                    aria-label={`Blend mode for ${layer.name || layer.text || layer.id}`}
                    value={layer.blendMode || "normal"}
                    onChange={e => updateOverlayById(layer.id, { blendMode: e.target.value })}
                  >
                    {STUDIO_EXPORT_BLEND_MODES.map(modeId => (
                      <option key={modeId} value={modeId}>
                        {modeId}
                      </option>
                    ))}
                  </select>
                )}

                {/* Motion Drivers */}
                <div className="ap-comp-driver-pills">
                  {activeLayerDrivers.map(prop => (
                    <button
                      key={prop}
                      type="button"
                      className="ap-comp-driver-chip"
                      onClick={() => {
                        onSelectOverlay?.(layer.id);
                        setDriverProp(prop);
                      }}
                    >
                      {prop.toUpperCase()}:{layer.motionDrivers[prop].type.slice(0, 3).toUpperCase()}
                    </button>
                  ))}
                  {activeLayerDrivers.length === 0 ? (
                    <button
                      type="button"
                      className="ap-mfx-btn"
                      style={{ padding: "2px 6px", fontSize: 10 }}
                      onClick={() => onSelectOverlay?.(layer.id)}
                    >
                      + Driver
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Selected Layer Motion Driver Drawer */}
          <div className="ap-comp-driver-drawer" data-testid="comp-motion-driver-drawer">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 11.5, color: "#e2e8f0" }}>
                AutoPromote Motion Driver &middot;{" "}
                <span style={{ color: "#22d3ee" }}>
                  {selectedLayer.name || selectedLayer.text || selectedLayer.id}
                </span>
              </strong>
              <div className="ap-mfx-toolbar-group">
                <select
                  className="ap-comp-select"
                  style={{ width: 96 }}
                  aria-label="Motion driver target property"
                  value={driverProp}
                  onChange={e => setDriverProp(e.target.value)}
                >
                  {MOTION_DRIVER_PROPERTIES.map(prop => (
                    <option key={prop} value={prop}>
                      {PROP_META[prop].label}
                    </option>
                  ))}
                </select>
                <select
                  className="ap-comp-select"
                  style={{ width: 148 }}
                  aria-label="Motion driver expression type"
                  value={activeDriver?.type || "none"}
                  onChange={e => handleDriverTypeChange(e.target.value)}
                >
                  <option value="none">Manual Keyframes Only</option>
                  {MOTION_DRIVER_CATALOG.map(entry => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeDriver ? (
              <div className="ap-comp-driver-controls">
                {activeDriver.type === "wiggle" ? (
                  <>
                    <label className="ap-comp-field">
                      <span>Freq ({activeDriver.frequencyHz} Hz)</span>
                      <input
                        type="range"
                        min="0.2"
                        max="12"
                        step="0.2"
                        value={activeDriver.frequencyHz}
                        onChange={e => handleDriverParamChange("frequencyHz", e.target.value)}
                      />
                    </label>
                    <label className="ap-comp-field">
                      <span>Amp ({activeDriver.amplitude})</span>
                      <input
                        type="range"
                        min="0"
                        max={driverProp === "scale" || driverProp === "opacity" ? "0.6" : "30"}
                        step={driverProp === "scale" || driverProp === "opacity" ? "0.02" : "0.5"}
                        value={activeDriver.amplitude}
                        onChange={e => handleDriverParamChange("amplitude", e.target.value)}
                      />
                    </label>
                    <label className="ap-comp-field">
                      <span>Octaves ({activeDriver.octaves || 3})</span>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={activeDriver.octaves || 3}
                        onChange={e => handleDriverParamChange("octaves", e.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {activeDriver.type === "spring" ? (
                  <>
                    <label className="ap-comp-field">
                      <span>Bounce ({activeDriver.frequencyHz} Hz)</span>
                      <input
                        type="range"
                        min="0.5"
                        max="8"
                        step="0.1"
                        value={activeDriver.frequencyHz}
                        onChange={e => handleDriverParamChange("frequencyHz", e.target.value)}
                      />
                    </label>
                    <label className="ap-comp-field">
                      <span>Damping ({activeDriver.damping})</span>
                      <input
                        type="range"
                        min="1"
                        max="18"
                        step="0.5"
                        value={activeDriver.damping}
                        onChange={e => handleDriverParamChange("damping", e.target.value)}
                      />
                    </label>
                    <label className="ap-comp-field">
                      <span>Amount ({activeDriver.amount}x)</span>
                      <input
                        type="range"
                        min="0.1"
                        max="2.5"
                        step="0.1"
                        value={activeDriver.amount}
                        onChange={e => handleDriverParamChange("amount", e.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {activeDriver.type === "pulse" ? (
                  <>
                    <label className="ap-comp-field">
                      <span>Wave</span>
                      <select
                        className="ap-comp-select"
                        value={activeDriver.waveform || "sine"}
                        onChange={e => handleDriverParamChange("waveform", e.target.value)}
                      >
                        <option value="sine">Sine</option>
                        <option value="triangle">Triangle</option>
                        <option value="square">Square</option>
                      </select>
                    </label>
                    <label className="ap-comp-field">
                      <span>Freq ({activeDriver.frequencyHz} Hz)</span>
                      <input
                        type="range"
                        min="0.2"
                        max="10"
                        step="0.2"
                        value={activeDriver.frequencyHz}
                        onChange={e => handleDriverParamChange("frequencyHz", e.target.value)}
                      />
                    </label>
                    <label className="ap-comp-field">
                      <span>Amplitude ({activeDriver.amplitude})</span>
                      <input
                        type="range"
                        min="0"
                        max={driverProp === "scale" || driverProp === "opacity" ? "0.6" : "25"}
                        step={driverProp === "scale" || driverProp === "opacity" ? "0.02" : "0.5"}
                        value={activeDriver.amplitude}
                        onChange={e => handleDriverParamChange("amplitude", e.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {activeDriver.type === "spin" ? (
                  <label className="ap-comp-field">
                    <span>Velocity ({activeDriver.ratePerSecond}/s)</span>
                    <input
                      type="range"
                      min="-360"
                      max="360"
                      step="5"
                      value={activeDriver.ratePerSecond}
                      onChange={e => handleDriverParamChange("ratePerSecond", e.target.value)}
                    />
                  </label>
                ) : null}

                {activeDriver.type === "loop" ? (
                  <label className="ap-comp-field">
                    <span>Loop Mode</span>
                    <select
                      className="ap-comp-select"
                      value={activeDriver.loopMode || "cycle"}
                      onChange={e => handleDriverParamChange("loopMode", e.target.value)}
                    >
                      <option value="cycle">Cycle (Repeat Start &rarr; End)</option>
                      <option value="pingpong">Ping-Pong (Back &amp; Forth)</option>
                    </select>
                  </label>
                ) : null}

                {activeDriver.type === "beat_pump" ? (
                  <>
                    <label className="ap-comp-field">
                      <span>Tempo ({activeDriver.bpm} BPM)</span>
                      <input
                        type="range"
                        min="60"
                        max="200"
                        step="2"
                        value={activeDriver.bpm}
                        onChange={e => handleDriverParamChange("bpm", e.target.value)}
                      />
                    </label>
                    <label className="ap-comp-field">
                      <span>Kick ({activeDriver.amount})</span>
                      <input
                        type="range"
                        min="0.02"
                        max={driverProp === "scale" || driverProp === "opacity" ? "0.5" : "20"}
                        step="0.02"
                        value={activeDriver.amount}
                        onChange={e => handleDriverParamChange("amount", e.target.value)}
                      />
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: Multi-Property Dope Sheet & Value / Speed Graph */}
        <div className="ap-comp-graph-pane">
          <div className="ap-comp-prop-toggles">
            <div className="ap-mfx-toolbar-group">
              {MOTION_DRIVER_PROPERTIES.map(prop => {
                const meta = PROP_META[prop];
                const active = visibleProps.includes(prop);
                return (
                  <button
                    key={prop}
                    type="button"
                    style={{ color: active ? meta.color : undefined }}
                    className={`ap-comp-prop-pill ${active ? "is-active" : ""}`}
                    onClick={() => togglePropertyLane(prop)}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: meta.color,
                      }}
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="ap-mfx-toolbar-group">
              <button
                type="button"
                className="ap-mfx-btn is-accent"
                onClick={handleAddKeyframeAtPlayhead}
                data-testid="comp-add-keyframe-playhead"
              >
                &#9670; + Key @ {Number(currentTime || 0).toFixed(2)}s
              </button>
              {selectedKeyframe ? (
                <>
                  <input
                    type="number"
                    className="ap-comp-select"
                    style={{ width: 68 }}
                    step={selectedKeyframe.property === "scale" || selectedKeyframe.property === "opacity" ? "0.05" : "1"}
                    aria-label="Selected keyframe value"
                    value={selectedKeyframe.value}
                    onChange={e => handleSelectedKeyframeValueChange(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ap-mfx-btn"
                    onClick={() =>
                      onChangeMotionKeyframes?.(
                        (motionKeyframes || []).filter(k => String(k.id) !== String(selectedKeyframe.id))
                      )
                    }
                  >
                    Delete Key
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <svg
            ref={svgRef}
            className="ap-comp-graph-svg"
            viewBox="0 0 500 210"
            onClick={handleGraphSvgClick}
            data-testid="comp-graph-canvas"
          >
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
              const x = 38 + frac * 446;
              return (
                <g key={frac}>
                  <line x1={x} y1={18} x2={x} y2={190} stroke="rgba(148,163,184,0.1)" strokeWidth="1" />
                  <text x={x} y={203} fill="#64748b" fontSize="9" textAnchor="middle">
                    {(frac * durationSafe).toFixed(1)}s
                  </text>
                </g>
              );
            })}

            {graphMode === "dope" ? (
              /* Dope Sheet Diamond Lanes */
              visibleProps.map((prop, laneIdx) => {
                const meta = PROP_META[prop];
                const laneY = 38 + laneIdx * 32;
                const keys = targetKeyframes.filter(k => k.property === prop);
                return (
                  <g key={prop}>
                    <line x1={38} y1={laneY} x2={484} y2={laneY} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                    <text x={6} y={laneY + 3} fill={meta.color} fontSize="9.5" fontWeight="700">
                      {prop.toUpperCase()}
                    </text>
                    {keys.map(k => {
                      const kx = toSvgX(k.time);
                      const isSel = selectedKeyframe && String(selectedKeyframe.id) === String(k.id);
                      return (
                        <polygon
                          key={k.id}
                          points={`${kx},${laneY - 6} ${kx + 6},${laneY} ${kx},${laneY + 6} ${kx - 6},${laneY}`}
                          fill={isSel ? "#ffffff" : meta.color}
                          stroke="#020617"
                          strokeWidth="1.5"
                          style={{ cursor: "pointer" }}
                          onClick={ev => {
                            ev.stopPropagation();
                            setSelectedKeyId(k.id);
                          }}
                        />
                      );
                    })}
                  </g>
                );
              })
            ) : (
              /* Value Graph or Speed Graph Curves + Driven Waveform Overlay */
              sampledSeries.map(series => {
                const pathD = series.points
                  .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${toSvgX(pt.t).toFixed(1)} ${toSvgY(pt.v, series.min, series.max).toFixed(1)}`)
                  .join(" ");
                const drivenD = series.drivenPoints
                  ? series.drivenPoints
                      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${toSvgX(pt.t).toFixed(1)} ${toSvgY(pt.v, series.min, series.max).toFixed(1)}`)
                      .join(" ")
                  : "";
                return (
                  <g key={series.prop}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={series.meta.color}
                      strokeWidth="2"
                      strokeOpacity={series.drivenPoints ? 0.55 : 0.95}
                    />
                    {drivenD ? (
                      <path
                        d={drivenD}
                        fill="none"
                        stroke={series.meta.color}
                        strokeWidth="2.2"
                        strokeDasharray="4 3"
                      />
                    ) : null}
                    {graphMode === "value" &&
                      series.keys.map(k => {
                        const kx = toSvgX(k.time);
                        const ky = toSvgY(k.value, series.min, series.max);
                        const isSel = selectedKeyframe && String(selectedKeyframe.id) === String(k.id);
                        return (
                          <polygon
                            key={k.id}
                            points={`${kx},${ky - 5.5} ${kx + 5.5},${ky} ${kx},${ky + 5.5} ${kx - 5.5},${ky}`}
                            fill={isSel ? "#ffffff" : series.meta.color}
                            stroke="#020617"
                            strokeWidth="1.4"
                            style={{ cursor: "pointer" }}
                            onClick={ev => {
                              ev.stopPropagation();
                              setSelectedKeyId(k.id);
                            }}
                          />
                        );
                      })}
                  </g>
                );
              })
            )}

            {/* Playhead */}
            <line
              x1={toSvgX(currentTime)}
              y1={12}
              x2={toSvgX(currentTime)}
              y2={192}
              stroke="#22d3ee"
              strokeWidth="1.6"
            />
            <circle cx={toSvgX(currentTime)} cy={12} r="3.5" fill="#22d3ee" />
          </svg>

          {selectedKeyframe && graphMode !== 'dope' ? <StudioCurveHandles
            value={selectedKeyframe.curve}
            onInteractionStart={onInteractionStart} onInteractionEnd={onInteractionEnd}
            onChange={curve => onChangeMotionKeyframes?.((motionKeyframes || []).map(key =>
              String(key.id) === String(selectedKeyframe.id) ? { ...key, easing: 'bezier', curve } : key))}
          /> : null}

          {/* 1-Click AutoPromote Curve Presets */}
          <div className="ap-comp-preset-strip">
            <span style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700 }}>Curve Feel:</span>
            {COMP_CURVE_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="ap-mfx-btn"
                style={{ padding: "3px 8px", fontSize: 10.5 }}
                disabled={!selectedKeyframe}
                onClick={() => handleApplyCurvePreset(preset)}
                data-testid={`comp-curve-preset-${preset.id}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
