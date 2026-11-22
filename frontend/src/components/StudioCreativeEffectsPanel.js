import React, { useEffect, useMemo, useRef, useState } from "react";
import StudioKeyframeCurveEditor from "./StudioKeyframeCurveEditor";
import { motionKeyAtPlayhead, motionKeyframeTolerance } from "./studioMotionProperties";
import { STUDIO_EXPORT_BLEND_MODES } from "./studioBlendModes";
import {
  STUDIO_CREATIVE_EFFECT_CATALOG,
  buildSpeedRampingKeyframes,
  createCreativeEffectInstance,
  creativeEffectPropertiesForTarget,
  evaluateCreativeEffectParams,
  getAvailableCreativeCategories,
  getCreativeEffectCatalogEntry,
  renderCreativeEffectsToCanvas,
} from "./studioCreativeEffects";
import "./StudioCreativeEffects.css";

function EffectThumbnail({ effectId }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof navigator === "undefined" || /jsdom/i.test(navigator.userAgent || "")) {
      return undefined;
    }
    let ctx = null;
    try {
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    } catch (_) {
      return undefined;
    }
    if (!ctx || typeof ctx.createLinearGradient !== "function") return undefined;

    let rafId = 0;
    let disposed = false;
    const sample = createCreativeEffectInstance(effectId, {
      id: `thumb-${effectId}`,
      startTime: 0,
      duration: 3.0,
    });
    const w = canvas.width;
    const h = canvas.height;
    const started = performance.now();

    const drawThumb = () => {
      if (disposed) return;
      const t = ((performance.now() - started) / 1000) % 3.0;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#1e293b");
      grad.addColorStop(0.55, "#0f172a");
      grad.addColorStop(1, "#334155");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Moving geometric subject silhouette so effect dynamics are clear
      const cx = w * (0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.1)));
      const cy = h * 0.52;
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f43f5e";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(cx - 12, cy + 2, 24, 22, 6) : ctx.rect(cx - 12, cy + 2, 24, 22);
      ctx.fill();

      renderCreativeEffectsToCanvas(ctx, w, h, [sample], [], t, { fps: 24 });
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" && !process.env.JEST_WORKER_ID) {
        rafId = window.requestAnimationFrame(drawThumb);
      }
    };

    drawThumb();
    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [effectId]);

  return <canvas ref={canvasRef} className="creative-fx-thumb-canvas" width={136} height={76} aria-hidden="true" />;
}

export default function StudioCreativeEffectsPanel({
  creativeEffects = [],
  activeEffectId,
  onSelectEffect,
  onChangeCreativeEffects,
  motionKeyframes = [],
  onToggleEffectKeyframe,
  onUpdateMotionKeyframe,
  overlays = [],
  captionSegments = [],
  activeOverlayId,
  onSelectOverlay,
  onChangeOverlays,
  onAddScrapbookPreset,
  onAddScrapbookElement,
  onToggleOverlayScrapbookFrame,
  onSyncSpeedRampEffect,
  onStartDoodleSubjectTrack,
  doodleTrackPickEffectId,
  doodleTrackingBusy = false,
  currentTime = 0,
  programmeDuration = 10,
  frameRate = 30,
  onSeek,
  onOpenCurveEditor,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showGraph, setShowGraph] = useState(false);

  const categories = useMemo(() => getAvailableCreativeCategories(), []);
  const availableEffects = useMemo(
    () => STUDIO_CREATIVE_EFFECT_CATALOG.filter(entry => entry.available),
    []
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableEffects.filter(item => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.shortDescription.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [availableEffects, selectedCategory, searchQuery]);

  const activeEffect = useMemo(
    () => creativeEffects.find(item => String(item.id) === String(activeEffectId)) || creativeEffects[0] || null,
    [creativeEffects, activeEffectId]
  );

  const activeSpec = activeEffect ? getCreativeEffectCatalogEntry(activeEffect.effectId) : null;
  const resolvedNow = useMemo(
    () => (activeEffect ? evaluateCreativeEffectParams(activeEffect, motionKeyframes, currentTime) : null),
    [activeEffect, motionKeyframes, currentTime]
  );
  const tolerance = motionKeyframeTolerance(frameRate || 30, 1);

  const applyNewEffect = effectId => {
    const start = Math.max(0, Math.min(Math.max(0.2, programmeDuration - 0.3), Number(currentTime || 0)));
    const spec = getCreativeEffectCatalogEntry(effectId);
    if (!spec) return;
    const duration = Math.min(Math.max(0.5, programmeDuration - start), spec.defaultDuration);
    const created = createCreativeEffectInstance(effectId, {
      startTime: start,
      duration,
      order: creativeEffects.length,
    });
    const next = [...creativeEffects, created];
    onChangeCreativeEffects?.(next);
    onSelectEffect?.(created.id);
    if (effectId === "speed_ramping") {
      onSyncSpeedRampEffect?.(created);
    }
  };

  const updateEffect = (id, patchOrFn) => {
    const next = creativeEffects.map((item, idx) => {
      if (String(item.id) !== String(id)) return item;
      const patch = typeof patchOrFn === "function" ? patchOrFn(item) : patchOrFn;
      return { ...item, ...patch, order: patch.order ?? idx };
    });
    onChangeCreativeEffects?.(next);
  };

  const duplicateEffect = item => {
    const copy = createCreativeEffectInstance(item.effectId, {
      ...item,
      id: undefined,
      name: `${item.name} Copy`,
      startTime: Math.min(Math.max(0, programmeDuration - 0.5), Number(item.startTime || 0) + 0.3),
      order: creativeEffects.length,
    });
    onChangeCreativeEffects?.([...creativeEffects, copy]);
    onSelectEffect?.(copy.id);
  };

  const moveEffect = (id, delta) => {
    const idx = creativeEffects.findIndex(item => String(item.id) === String(id));
    if (idx < 0) return;
    const swapIdx = idx + delta;
    if (swapIdx < 0 || swapIdx >= creativeEffects.length) return;
    const next = [...creativeEffects];
    const [moved] = next.splice(idx, 1);
    next.splice(swapIdx, 0, moved);
    onChangeCreativeEffects?.(next.map((item, orderIdx) => ({ ...item, order: orderIdx })));
  };

  const deleteEffect = id => {
    const next = creativeEffects.filter(item => String(item.id) !== String(id)).map((item, idx) => ({ ...item, order: idx }));
    onChangeCreativeEffects?.(next);
    if (String(activeEffectId) === String(id)) {
      onSelectEffect?.(next[0]?.id || null);
    }
  };

  const effectTargetKeyframes = useMemo(
    () => (activeEffect ? (motionKeyframes || []).filter(k => String(k.targetId) === String(activeEffect.id)) : []),
    [motionKeyframes, activeEffect]
  );

  const activeMediaOverlay = useMemo(
    () => overlays.find(ov => String(ov.id) === String(activeOverlayId) && ["image", "video"].includes(ov.type)) || null,
    [overlays, activeOverlayId]
  );

  return (
    <div className="clip-inspector-body creative-fx-panel" data-testid="creative-effects-panel" role="tabpanel">
      <div className="inspector-heading-row">
        <div>
          <span className="panel-kicker">Creative Effects &amp; Overlays</span>
          <h4>Search, layer, animate &amp; keyframe real video effects</h4>
        </div>
        <span className="inspector-status-dot is-ready">{creativeEffects.filter(e => e.enabled !== false).length} active</span>
      </div>

      <div className="creative-fx-search-bar">
        <input
          type="search"
          aria-label="Search creative effects"
          placeholder="Search ripped paper, Polaroid, doodles, 16mm grain, leaks..."
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          data-testid="creative-fx-search"
        />
      </div>

      <div className="creative-fx-category-pills" role="tablist" aria-label="Effect categories">
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat.id}
            className={selectedCategory === cat.id ? "is-active" : ""}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="creative-fx-catalog-grid" data-testid="creative-fx-catalog">
        {filteredCatalog.length ? (
          filteredCatalog.map(item => {
            const countApplied = creativeEffects.filter(e => e.effectId === item.id).length;
            return (
              <div key={item.id} className="creative-fx-card" data-testid={`creative-fx-card-${item.id}`}>
                <EffectThumbnail effectId={item.id} />
                <div className="creative-fx-card-body">
                  <div className="creative-fx-card-title">
                    <strong>{item.name}</strong>
                    {countApplied > 0 ? <span className="creative-fx-badge">{countApplied} applied</span> : null}
                  </div>
                  <p>{item.shortDescription}</p>
                  <button
                    type="button"
                    className="tool-btn creative-fx-apply-btn"
                    data-testid={`apply-fx-${item.id}`}
                    onClick={() => applyNewEffect(item.id)}
                  >
                    + Apply {item.name}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="creative-fx-empty">No effects match &ldquo;{searchQuery}&rdquo;.</p>
        )}
      </div>

      {/* Scrapbook multi-element collage builder tools */}
      <div className="creative-fx-scrapbook-tools">
        <div className="creative-fx-section-header">
          <strong>Scrapbook Collage Builder</strong>
          <small>Editable Polaroid cards, tape &amp; deckled layers</small>
        </div>
        <div className="creative-fx-quick-row">
          <button type="button" onClick={() => onAddScrapbookPreset?.("polaroid_duo")}>+ Polaroid Duo Collage</button>
          <button type="button" onClick={() => onAddScrapbookPreset?.("pinboard_trio")}>+ Pinboard Collage</button>
          <button type="button" onClick={() => onAddScrapbookElement?.("tape")}>+ Masking Tape</button>
          <button type="button" onClick={() => onAddScrapbookElement?.("paper_sheet")}>+ Paper Sheet</button>
          <button type="button" onClick={() => onAddScrapbookElement?.("sticker")}>+ Sticker</button>
        </div>
        {activeMediaOverlay ? (
          <button
            type="button"
            className="creative-fx-wrap-btn"
            onClick={() => onToggleOverlayScrapbookFrame?.(activeMediaOverlay.id)}
          >
            {activeMediaOverlay.scrapbookFrame?.enabled
              ? `Remove Polaroid Frame from "${activeMediaOverlay.name || "Media"}"`
              : `Wrap "${activeMediaOverlay.name || "Selected Photo/Video"}" in Polaroid Frame`}
          </button>
        ) : null}
      </div>

      {/* Applied Effects Layer Stack */}
      <div className="creative-fx-stack-section">
        <div className="creative-fx-section-header">
          <strong>Applied Effects Stack ({creativeEffects.length})</strong>
          <small>Order affects compositing from top to bottom</small>
        </div>
        {creativeEffects.length === 0 ? (
          <p className="creative-fx-empty">Apply any effect above to preview it live on your footage and customize its animation.</p>
        ) : (
          <ul className="creative-fx-stack-list" data-testid="creative-fx-stack">
            {creativeEffects.map((item, idx) => {
              const selected = String(item.id) === String(activeEffect?.id);
              return (
                <li
                  key={item.id}
                  className={`creative-fx-stack-row ${selected ? "is-selected" : ""} ${item.enabled === false ? "is-disabled" : ""}`}
                >
                  <button
                    type="button"
                    className="creative-fx-row-select"
                    onClick={() => {
                      onSelectEffect?.(item.id);
                      onSeek?.(item.startTime);
                    }}
                  >
                    <span className="creative-fx-row-name">{item.name}</span>
                    <small>{Number(item.startTime).toFixed(2)}s – {(Number(item.startTime) + Number(item.duration)).toFixed(2)}s</small>
                  </button>
                  <div className="creative-fx-row-actions">
                    <button type="button" title="Move up" disabled={idx === 0} onClick={() => moveEffect(item.id, -1)}>↑</button>
                    <button type="button" title="Move down" disabled={idx === creativeEffects.length - 1} onClick={() => moveEffect(item.id, 1)}>↓</button>
                    <button
                      type="button"
                      title={item.enabled === false ? "Enable effect" : "Disable effect"}
                      aria-pressed={item.enabled !== false}
                      onClick={() => updateEffect(item.id, { enabled: item.enabled === false })}
                    >
                      {item.enabled === false ? "Off" : "On"}
                    </button>
                    <button type="button" title="Duplicate effect" onClick={() => duplicateEffect(item)}>⎘</button>
                    <button type="button" title="Delete effect" aria-label={`Delete ${item.name}`} onClick={() => deleteEffect(item.id)}>×</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Parameter & Keyframe Inspector for Selected Effect */}
      {activeEffect && activeSpec && resolvedNow ? (
        <div className="creative-fx-inspector" data-testid="creative-fx-inspector">
          <div className="creative-fx-section-header">
            <strong>{activeEffect.name} Controls</strong>
            <div className="creative-fx-row-actions">
              <button
                type="button"
                aria-pressed={showGraph}
                onClick={() => setShowGraph(v => !v)}
              >
                {showGraph ? "Hide Curve Editor" : "Curve Editor"}
              </button>
              {onOpenCurveEditor ? (
                <button type="button" onClick={() => onOpenCurveEditor(activeEffect.id)}>
                  Timeline Keys
                </button>
              ) : null}
            </div>
          </div>

          <div className="creative-fx-timing-row">
            <label>
              <span>Start (s)</span>
              <input
                type="number"
                min={0}
                max={Math.max(0.5, programmeDuration)}
                step={0.05}
                value={activeEffect.startTime}
                onChange={e => updateEffect(activeEffect.id, { startTime: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label>
              <span>Duration (s)</span>
              <input
                type="number"
                min={0.1}
                max={3600}
                step={0.05}
                value={activeEffect.duration}
                onChange={e => updateEffect(activeEffect.id, { duration: Math.max(0.1, Number(e.target.value) || 0.5) })}
              />
            </label>
            <label>
              <span>Blend Mode</span>
              <select
                value={activeEffect.blendMode || "normal"}
                onChange={e => updateEffect(activeEffect.id, { blendMode: e.target.value })}
              >
                {STUDIO_EXPORT_BLEND_MODES.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Master opacity + Keyframe diamond */}
          <label className="inspector-range creative-fx-param-row">
            <span>
              <b>Opacity</b>
              <span className="creative-fx-key-group">
                <strong>{Math.round(resolvedNow.opacity * 100)}%</strong>
                <button
                  type="button"
                  className={`creative-fx-kf-btn ${motionKeyAtPlayhead(motionKeyframes, activeEffect.id, "opacity", currentTime, tolerance) ? "is-keyed" : ""}`}
                  title="Toggle opacity keyframe at playhead"
                  aria-label="Toggle opacity keyframe"
                  onClick={() => onToggleEffectKeyframe?.(activeEffect.id, "opacity", resolvedNow.opacity)}
                >
                  {motionKeyAtPlayhead(motionKeyframes, activeEffect.id, "opacity", currentTime, tolerance) ? "◆" : "◇"}
                </button>
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={resolvedNow.opacity}
              onChange={e => updateEffect(activeEffect.id, { opacity: Number(e.target.value) })}
            />
          </label>

          {/* Dynamic effect parameters */}
          {activeSpec.paramsSchema.map(field => {
            const currentVal = resolvedNow.params[field.key];
            const rawVal = activeEffect.params?.[field.key] ?? field.default;
            if (field.type === "range") {
              const hasKey = Boolean(motionKeyAtPlayhead(motionKeyframes, activeEffect.id, field.key, currentTime, tolerance));
              return (
                <label key={field.key} className="inspector-range creative-fx-param-row">
                  <span>
                    <b>{field.label}</b>
                    <span className="creative-fx-key-group">
                      <strong>{Number(currentVal).toFixed(field.step < 1 ? 2 : 0)}</strong>
                      {field.keyframable ? (
                        <button
                          type="button"
                          className={`creative-fx-kf-btn ${hasKey ? "is-keyed" : ""}`}
                          title={`Toggle ${field.label} keyframe at playhead`}
                          aria-label={`Toggle ${field.label} keyframe`}
                          onClick={() => onToggleEffectKeyframe?.(activeEffect.id, field.key, Number(currentVal))}
                        >
                          {hasKey ? "◆" : "◇"}
                        </button>
                      ) : null}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={currentVal}
                    onChange={e => {
                      const nextVal = Number(e.target.value);
                      if (effectTargetKeyframes.some(k => k.property === field.key)) {
                        onToggleEffectKeyframe?.(activeEffect.id, field.key, nextVal, true);
                      } else {
                        updateEffect(activeEffect.id, prev => ({
                          params: { ...prev.params, [field.key]: nextVal },
                        }));
                      }
                    }}
                  />
                </label>
              );
            }
            if (field.type === "select") {
              return (
                <label key={field.key} className="creative-fx-field">
                  <span>{field.label}</span>
                  <select
                    value={rawVal}
                    onChange={e => updateEffect(activeEffect.id, prev => ({ params: { ...prev.params, [field.key]: e.target.value } }))}
                  >
                    {field.options.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              );
            }
            if (field.type === "color") {
              return (
                <label key={field.key} className="creative-fx-field creative-fx-color-field">
                  <span>{field.label}</span>
                  <input
                    type="color"
                    value={rawVal || "#ffffff"}
                    onChange={e => updateEffect(activeEffect.id, prev => ({ params: { ...prev.params, [field.key]: e.target.value } }))}
                  />
                </label>
              );
            }
            if (field.type === "boolean") {
              return (
                <label key={field.key} className="creative-fx-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(rawVal)}
                    onChange={e => updateEffect(activeEffect.id, prev => ({ params: { ...prev.params, [field.key]: e.target.checked } }))}
                  />
                  <span>{field.label}</span>
                </label>
              );
            }
            return (
              <label key={field.key} className="creative-fx-field">
                <span>{field.label}</span>
                <input
                  type="text"
                  value={rawVal || ""}
                  onChange={e => updateEffect(activeEffect.id, prev => ({ params: { ...prev.params, [field.key]: e.target.value } }))}
                />
              </label>
            );
          })}

          {/* Ripped Paper behind-tear layer picker */}
          {activeEffect.effectId === "ripped_paper" ? (
            <div className="creative-fx-extra-box">
              <label className="creative-fx-field">
                <span>Reveal Overlay Layer Behind Tear</span>
                <select
                  value={activeEffect.params?.behindOverlayId || ""}
                  onChange={e =>
                    updateEffect(activeEffect.id, prev => ({
                      params: { ...prev.params, behindOverlayId: e.target.value },
                    }))
                  }
                >
                  <option value="">None (Use Backing Color / Text)</option>
                  {overlays
                    .filter(ov => !ov.isCaption && ["image", "video", "text"].includes(ov.type))
                    .map(ov => (
                      <option key={ov.id} value={ov.id}>
                        {ov.type.toUpperCase()} · {ov.name || ov.text || ov.id}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          ) : null}

          {/* Subject Motion Tracking Attachment for Doodles, Comic Bubbles & Subject Zooms */}
          {(activeEffect.effectId === "doodles" || activeEffect.effectId === "comic_pop_art" || activeEffect.effectId === "zoom_motion_blur") ? (
            <div className="creative-fx-extra-box">
              <strong>Subject Tracking Attachment</strong>
              <label className="creative-fx-field">
                <span>Follow Existing Tracked Layer</span>
                <select
                  value={activeEffect.tracking?.enabled ? activeEffect.tracking?.sourceLayerId || "" : ""}
                  onChange={e => {
                    const sourceLayerId = e.target.value || null;
                    updateEffect(activeEffect.id, {
                      tracking: {
                        ...(activeEffect.tracking || {}),
                        enabled: Boolean(sourceLayerId),
                        sourceLayerId,
                      },
                    });
                  }}
                >
                  <option value="">Manual Position / Keyframes</option>
                  {overlays
                    .filter(ov => !ov.isCaption && !ov.isNullRig)
                    .map(ov => (
                      <option key={ov.id} value={ov.id}>
                        Follow: {ov.name || ov.text || ov.id}
                      </option>
                    ))}
                </select>
              </label>
              {activeEffect.effectId === "doodles" ? (
                <button
                  type="button"
                  className={`tool-btn ${doodleTrackPickEffectId === activeEffect.id ? "is-active" : ""}`}
                  disabled={doodleTrackingBusy}
                  onClick={() => onStartDoodleSubjectTrack?.(activeEffect.id)}
                  data-testid="doodle-track-subject-btn"
                >
                  {doodleTrackingBusy
                    ? "Tracking Subject Across Video..."
                    : doodleTrackPickEffectId === activeEffect.id
                      ? "Click Subject on Video Preview..."
                      : "Track Moving Subject on Video"}
                </button>
              ) : null}
            </div>
          ) : null}

          {activeEffect.effectId === "speed_ramping" ? (() => {
            const rampPts = buildSpeedRampingKeyframes(activeEffect);
            const dur = Math.max(0.1, Number(activeEffect.duration || 1));
            const start = Number(activeEffect.startTime || 0);
            const pathD = rampPts
              .map((pt, idx) => {
                const sx = Math.max(4, Math.min(196, ((pt.time - start) / dur) * 192 + 4));
                const sy = Math.max(4, Math.min(56, 56 - ((pt.value - 0.2) / 3.8) * 50));
                return `${idx === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`;
              })
              .join(" ");
            return (
              <div className="creative-fx-extra-box" data-testid="speed-ramp-curve-box">
                <strong>Variable Speed Curve &amp; Audio Sync</strong>
                <svg viewBox="0 0 200 60" style={{ width: "100%", height: "60px", background: "rgba(2,6,23,0.7)", borderRadius: "6px", margin: "6px 0" }}>
                  <line x1="0" y1="45" x2="200" y2="45" stroke="rgba(148,163,184,0.28)" strokeDasharray="3 3" />
                  <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <button
                  type="button"
                  className="tool-btn"
                  data-testid="sync-speed-ramp-btn"
                  onClick={() => onSyncSpeedRampEffect?.(activeEffect)}
                >
                  Apply Speed Ramp to Timeline Clock
                </button>
              </div>
            );
          })() : null}

          {activeEffect.effectId === "freeze_cutout" ? (
            <div className="creative-fx-extra-box">
              <strong>Freeze-Frame Controls</strong>
              <button
                type="button"
                className="tool-btn"
                onClick={() =>
                  updateEffect(activeEffect.id, prev => ({
                    params: { ...prev.params, freezeTime: Number(Number(currentTime || 0).toFixed(2)) },
                  }))
                }
                data-testid="freeze-set-playhead-btn"
              >
                Set Freeze Frame to Playhead ({Number(currentTime || 0).toFixed(2)}s)
              </button>
            </div>
          ) : null}

          {activeEffect.effectId === "kinetic_typography" ? (
            <div className="creative-fx-extra-box">
              <strong>Speech Synchronization</strong>
              <button
                type="button"
                className="tool-btn"
                data-testid="kinetic-import-captions-btn"
                onClick={() => {
                  const effStart = Number(activeEffect.startTime || 0);
                  const effEnd = effStart + Number(activeEffect.duration || 3);
                  const overlapping = (captionSegments || []).filter(seg => {
                    const s = Number(seg.start ?? seg.startTime ?? 0);
                    const e = Number(seg.end ?? (s + Number(seg.duration || 1)));
                    return e > effStart && s < effEnd && !seg.reviewRequired;
                  });
                  const targetSeg = overlapping[0] || (captionSegments || []).find(seg => !seg.reviewRequired);
                  if (!targetSeg) return;
                  const words = (targetSeg.wordTimings || targetSeg.words || []).map((w, idx) => {
                    const ws = Number(w.start ?? w.startTime ?? (Number(targetSeg.start || 0) + idx * 0.25));
                    const we = Number(w.end ?? w.endTime ?? (ws + 0.24));
                    return {
                      word: String(w.word || w.text || "").trim(),
                      start: Math.max(0, Number((ws - effStart).toFixed(3))),
                      end: Math.max(0.05, Number((we - effStart).toFixed(3))),
                    };
                  }).filter(w => w.word);
                  updateEffect(activeEffect.id, prev => ({
                    params: {
                      ...prev.params,
                      text: words.length ? words.map(w => w.word).join(" ") : String(targetSeg.text || prev.params.text),
                      style: "karaoke_highlight",
                      wordTimings: words,
                    },
                  }));
                }}
              >
                Import Speech Word Timing from Captions
              </button>
            </div>
          ) : null}

          {showGraph && effectTargetKeyframes.length > 0 ? (
            <div className="creative-fx-graph-box">
              <StudioKeyframeCurveEditor
                keyframes={effectTargetKeyframes}
                focusId={effectTargetKeyframes[0]?.id}
                playhead={currentTime}
                kind="motion"
                valueBounds={Object.fromEntries(
                  creativeEffectPropertiesForTarget(activeEffect).map(p => [p.id, [p.min, p.max]])
                )}
                onUpdate={onUpdateMotionKeyframe}
              />
            </div>
          ) : showGraph ? (
            <p className="creative-fx-empty">Click any ◇ diamond next to a slider above to record keyframes and edit animation curves here.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
