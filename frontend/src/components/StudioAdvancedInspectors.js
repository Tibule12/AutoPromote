import React from "react";
import { STUDIO_EASINGS, groupMotionKeyframesByTime } from "./studioAutomation";

const Range = ({ label, valueLabel, ...props }) => (
  <label className="inspector-range">
    <span>
      <b>{label}</b>
      <strong>{valueLabel}</strong>
    </span>
    <input type="range" {...props} />
  </label>
);

export function MotionInspector({
  activeOverlay,
  overlays,
  playhead,
  keyframes,
  onSelectOverlay,
  onUpdateOverlay,
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
  onSeek,
  showMotionPath,
  onToggleMotionPath,
  onResetMotion,
}) {
  const targetKeyframes = activeOverlay
    ? keyframes.filter(keyframe => String(keyframe.targetId) === String(activeOverlay.id))
    : [];
  const keyframeGroups = groupMotionKeyframesByTime(targetKeyframes);

  const updateKeyframeGroup = (group, changes) => {
    group.keyframes.forEach(keyframe => onUpdateKeyframe(keyframe.id, changes));
  };

  const removeKeyframeGroup = group => {
    group.keyframes.forEach(keyframe => onRemoveKeyframe(keyframe.id));
  };

  return (
    <div className="clip-inspector-body advanced-inspector-body" role="tabpanel">
      <div className="inspector-heading-row">
        <div>
          <span className="panel-kicker">Motion automation</span>
          <h4>Animate transform, crop and opacity</h4>
        </div>
        <span className={`inspector-status-dot ${keyframeGroups.length ? "is-ready" : ""}`}>
          {keyframeGroups.length} {keyframeGroups.length === 1 ? "pose" : "poses"}
        </span>
      </div>

      <label className="inspector-select-field">
        <span>Target layer</span>
        <select
          value={activeOverlay?.id || ""}
          onChange={event => onSelectOverlay(event.target.value)}
        >
          <option value="">Select a layer</option>
          {overlays.map((overlay, index) => (
            <option key={overlay.id} value={overlay.id}>
              {overlay.name || overlay.file?.name || overlay.text || `Layer ${index + 1}`}
            </option>
          ))}
        </select>
      </label>

      {activeOverlay ? (
        <>
          <div className="motion-position-grid">
            <label>
              <span>X</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Number(activeOverlay.x ?? 50).toFixed(1)}
                onChange={event => onUpdateOverlay("x", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Y</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Number(activeOverlay.y ?? 50).toFixed(1)}
                onChange={event => onUpdateOverlay("y", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Scale</span>
              <input
                type="number"
                min={0.1}
                max={5}
                step={0.05}
                value={Number(activeOverlay.scale ?? 1).toFixed(2)}
                onChange={event => onUpdateOverlay("scale", Number(event.target.value))}
              />
            </label>
            <label>
              <span>Rotate</span>
              <input
                type="number"
                min={-360}
                max={360}
                step={1}
                value={Number(activeOverlay.rotation ?? 0).toFixed(0)}
                onChange={event => onUpdateOverlay("rotation", Number(event.target.value))}
              />
            </label>
          </div>

          <Range
            label="Opacity"
            valueLabel={`${Math.round(Number(activeOverlay.opacity ?? 1) * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            value={Number(activeOverlay.opacity ?? 1)}
            onChange={event => onUpdateOverlay("opacity", Number(event.target.value))}
          />

          {activeOverlay.type === "image" || activeOverlay.type === "video" ? (
            <>
              <details className="advanced-tool-section" open>
                <summary>Layer geometry & timing</summary>
                <div className="motion-position-grid">
                  <label>
                    <span>In</span>
                    <input type="number" min={0} step={0.05}
                      aria-label="Motion layer in point"
                      value={Number(activeOverlay.startTime ?? activeOverlay.start_time ?? 0).toFixed(2)}
                      onChange={event => onUpdateOverlay("startTime", Math.max(0, Number(event.target.value)))} />
                  </label>
                  <label>
                    <span>Duration</span>
                    <input type="number" min={0.1} max={60} step={0.05}
                      aria-label="Motion layer duration"
                      value={Number(activeOverlay.duration ?? 3).toFixed(2)}
                      onChange={event => onUpdateOverlay("duration", Math.max(0.1, Number(event.target.value)))} />
                  </label>
                  <label>
                    <span>Width</span>
                    <input type="number" min={1} max={100} step={0.5}
                      aria-label="Motion layer width"
                      value={Number(activeOverlay.width ?? 35)}
                      onChange={event => onUpdateOverlay("width", Number(event.target.value))} />
                  </label>
                  <label>
                    <span>Height</span>
                    <input type="number" min={1} max={100} step={0.5}
                      aria-label="Motion layer height"
                      value={Number(activeOverlay.height ?? 35)}
                      onChange={event => onUpdateOverlay("height", Number(event.target.value))} />
                  </label>
                  <label>
                    <span>Anchor X</span>
                    <input type="number" min={0} max={100} step={1}
                      aria-label="Motion layer anchor X"
                      value={Number(activeOverlay.anchorX ?? 50)}
                      onChange={event => onUpdateOverlay("anchorX", Number(event.target.value))} />
                  </label>
                  <label>
                    <span>Anchor Y</span>
                    <input type="number" min={0} max={100} step={1}
                      aria-label="Motion layer anchor Y"
                      value={Number(activeOverlay.anchorY ?? 50)}
                      onChange={event => onUpdateOverlay("anchorY", Number(event.target.value))} />
                  </label>
                </div>
              </details>

              <details className="advanced-tool-section" open>
                <summary>Professional layer effects</summary>
                <label className="inspector-toggle-row">
                  <span><b>Motion blur</b><small>Samples movement during the shutter interval.</small></span>
                  <input type="checkbox" aria-label="Enable layer motion blur"
                    checked={!!activeOverlay.motionBlur?.enabled}
                    onChange={event => onUpdateOverlay("motionBlur", {
                      ...(activeOverlay.motionBlur || {}), enabled: event.target.checked,
                      samples: activeOverlay.motionBlur?.samples || 4,
                      shutter: activeOverlay.motionBlur?.shutter ?? 0.5,
                    })} />
                </label>
                {activeOverlay.motionBlur?.enabled ? (
                  <div className="inspector-dual-range">
                    <Range label="Samples" valueLabel={String(activeOverlay.motionBlur?.samples || 4)}
                      min={2} max={8} step={1} value={activeOverlay.motionBlur?.samples || 4}
                      onChange={event => onUpdateOverlay("motionBlur", {
                        ...activeOverlay.motionBlur, samples: Number(event.target.value),
                      })} />
                    <Range label="Shutter" valueLabel={`${Math.round(Number(activeOverlay.motionBlur?.shutter ?? 0.5) * 360)}°`}
                      min={0.1} max={1} step={0.05} value={activeOverlay.motionBlur?.shutter ?? 0.5}
                      onChange={event => onUpdateOverlay("motionBlur", {
                        ...activeOverlay.motionBlur, shutter: Number(event.target.value),
                      })} />
                  </div>
                ) : null}
                <label className="inspector-toggle-row">
                  <span><b>Outer glow</b><small>Rendered from the real layer alpha, including transparency.</small></span>
                  <input type="checkbox" aria-label="Enable layer glow"
                    checked={!!activeOverlay.glow?.enabled}
                    onChange={event => onUpdateOverlay("glow", {
                      ...(activeOverlay.glow || {}), enabled: event.target.checked,
                      color: activeOverlay.glow?.color || "#8b5cf6",
                      radius: activeOverlay.glow?.radius || 16,
                      intensity: activeOverlay.glow?.intensity ?? 0.5,
                    })} />
                </label>
                {activeOverlay.glow?.enabled ? (
                  <>
                    <label className="composite-color-field"><span>Glow color</span>
                      <input type="color" aria-label="Layer glow color"
                        value={activeOverlay.glow?.color || "#8b5cf6"}
                        onChange={event => onUpdateOverlay("glow", { ...activeOverlay.glow, color: event.target.value })} />
                    </label>
                    <div className="inspector-dual-range">
                      <Range label="Glow radius" valueLabel={`${activeOverlay.glow?.radius || 16}px`}
                        min={0} max={60} step={1} value={activeOverlay.glow?.radius || 16}
                        onChange={event => onUpdateOverlay("glow", { ...activeOverlay.glow, radius: Number(event.target.value) })} />
                      <Range label="Glow strength" valueLabel={`${Math.round(Number(activeOverlay.glow?.intensity ?? 0.5) * 100)}%`}
                        min={0} max={1} step={0.05} value={activeOverlay.glow?.intensity ?? 0.5}
                        onChange={event => onUpdateOverlay("glow", { ...activeOverlay.glow, intensity: Number(event.target.value) })} />
                    </div>
                  </>
                ) : null}
                <label className="inspector-toggle-row">
                  <span><b>Drop shadow</b><small>Alpha-aware depth behind transparent artwork.</small></span>
                  <input type="checkbox" aria-label="Enable layer shadow"
                    checked={!!activeOverlay.layerShadow?.enabled}
                    onChange={event => onUpdateOverlay("layerShadow", {
                      ...(activeOverlay.layerShadow || {}), enabled: event.target.checked,
                      color: activeOverlay.layerShadow?.color || "#000000",
                      blur: activeOverlay.layerShadow?.blur || 18,
                      opacity: activeOverlay.layerShadow?.opacity ?? 0.55,
                      x: activeOverlay.layerShadow?.x ?? 0,
                      y: activeOverlay.layerShadow?.y ?? 10,
                    })} />
                </label>
                {activeOverlay.layerShadow?.enabled ? (
                  <>
                    <label className="composite-color-field"><span>Shadow color</span>
                      <input type="color" aria-label="Layer shadow color"
                        value={activeOverlay.layerShadow?.color || "#000000"}
                        onChange={event => onUpdateOverlay("layerShadow", { ...activeOverlay.layerShadow, color: event.target.value })} />
                    </label>
                    <div className="motion-position-grid">
                      <label><span>X offset</span><input type="number" min={-100} max={100} step={1}
                        aria-label="Layer shadow X offset" value={Number(activeOverlay.layerShadow?.x ?? 0)}
                        onChange={event => onUpdateOverlay("layerShadow", { ...activeOverlay.layerShadow, x: Number(event.target.value) })} /></label>
                      <label><span>Y offset</span><input type="number" min={-100} max={100} step={1}
                        aria-label="Layer shadow Y offset" value={Number(activeOverlay.layerShadow?.y ?? 10)}
                        onChange={event => onUpdateOverlay("layerShadow", { ...activeOverlay.layerShadow, y: Number(event.target.value) })} /></label>
                    </div>
                    <div className="inspector-dual-range">
                      <Range label="Shadow blur" valueLabel={`${activeOverlay.layerShadow?.blur || 18}px`}
                        min={0} max={80} step={1} value={activeOverlay.layerShadow?.blur || 18}
                        onChange={event => onUpdateOverlay("layerShadow", { ...activeOverlay.layerShadow, blur: Number(event.target.value) })} />
                      <Range label="Shadow opacity" valueLabel={`${Math.round(Number(activeOverlay.layerShadow?.opacity ?? 0.55) * 100)}%`}
                        min={0} max={1} step={0.05} value={activeOverlay.layerShadow?.opacity ?? 0.55}
                        onChange={event => onUpdateOverlay("layerShadow", { ...activeOverlay.layerShadow, opacity: Number(event.target.value) })} />
                    </div>
                  </>
                ) : null}
                <Range label="Layer blur" valueLabel={`${Number(activeOverlay.blur || 0)}px`}
                  min={0} max={30} step={0.5} value={Number(activeOverlay.blur || 0)}
                  onChange={event => onUpdateOverlay("blur", Number(event.target.value))} />
              </details>
            </>
          ) : null}

          <div className="motion-workspace-toolbar" aria-label="Motion path controls">
            <button
              type="button"
              className={showMotionPath ? "is-active" : ""}
              aria-pressed={showMotionPath}
              onClick={onToggleMotionPath}
            >
              ⤳ Motion path
            </button>
            <button type="button" onClick={onResetMotion}>
              Reset transform
            </button>
            <span>Set the transform, then save a pose at the current playhead.</span>
          </div>

          {activeOverlay.type !== "text" ? (
            <div className="inspector-dual-range">
              <Range
                label="Crop X"
                valueLabel={`${Math.round(Number(activeOverlay.cropX || 0))}%`}
                min={0}
                max={45}
                step={1}
                value={Number(activeOverlay.cropX || 0)}
                onChange={event => onUpdateOverlay("cropX", Number(event.target.value))}
              />
              <Range
                label="Crop Y"
                valueLabel={`${Math.round(Number(activeOverlay.cropY || 0))}%`}
                min={0}
                max={45}
                step={1}
                value={Number(activeOverlay.cropY || 0)}
                onChange={event => onUpdateOverlay("cropY", Number(event.target.value))}
              />
            </div>
          ) : null}

          <button type="button" className="inspector-primary-action" onClick={onAddKeyframe}>
            ◆ Add transform keyframe at {Number(playhead || 0).toFixed(2)}s
          </button>

          <div className="automation-keyframe-list motion-pose-list">
            {keyframeGroups.map(group => {
              const values = Object.fromEntries(
                group.keyframes.map(keyframe => [keyframe.property, keyframe.value])
              );
              const easing = group.keyframes[0]?.easing || "ease_in_out";
              return (
                <article key={`motion-pose-${group.time}`}>
                  <button type="button" onClick={() => onSeek(group.time)}>
                    <span>◆</span>
                    <strong>Transform pose</strong>
                    <small>
                      {Number(group.time).toFixed(2)}s · X {Number(values.x ?? 50).toFixed(1)} · Y{" "}
                      {Number(values.y ?? 50).toFixed(1)} · {Number(values.scale ?? 1).toFixed(2)}×
                    </small>
                  </button>
                  <select
                    aria-label={`Transform pose at ${Number(group.time).toFixed(2)} seconds easing`}
                    value={easing}
                    onChange={event => updateKeyframeGroup(group, { easing: event.target.value })}
                  >
                    {STUDIO_EASINGS.map(easing => (
                      <option key={easing.id} value={easing.id}>
                        {easing.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove transform pose at ${Number(group.time).toFixed(2)} seconds`}
                    onClick={() => removeKeyframeGroup(group)}
                  >
                    ×
                  </button>
                  {easing === "bezier" ? (
                    <div className="keyframe-bezier-controls">
                      <label>
                        <span>In</span>
                        <input
                          aria-label={`Transform pose at ${Number(group.time).toFixed(2)} seconds Bezier in handle`}
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={group.keyframes[0]?.curve?.[1] ?? 0}
                          onChange={event =>
                            updateKeyframeGroup(group, {
                              curve: [
                                group.keyframes[0]?.curve?.[0] ?? 0.33,
                                Number(event.target.value),
                                group.keyframes[0]?.curve?.[2] ?? 0.67,
                                group.keyframes[0]?.curve?.[3] ?? 1,
                              ],
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Out</span>
                        <input
                          aria-label={`Transform pose at ${Number(group.time).toFixed(2)} seconds Bezier out handle`}
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={group.keyframes[0]?.curve?.[3] ?? 1}
                          onChange={event =>
                            updateKeyframeGroup(group, {
                              curve: [
                                group.keyframes[0]?.curve?.[0] ?? 0.33,
                                group.keyframes[0]?.curve?.[1] ?? 0,
                                group.keyframes[0]?.curve?.[2] ?? 0.67,
                                Number(event.target.value),
                              ],
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="inspector-empty-state">
          <span>◆</span>
          <strong>Select a graphic, B-roll or image layer</strong>
          <small>Motion automation remains independent from color and finish keyframes.</small>
        </div>
      )}
    </div>
  );
}

export function CompositeInspector({
  activeOverlay,
  overlays,
  adjustmentLayers,
  onUpdateAdjustmentLayer,
  onDeleteAdjustmentLayer,
  onSelectOverlay,
  onUpdateOverlay,
  onAddAdjustmentLayer,
  onCreateCompound,
}) {
  return (
    <div className="clip-inspector-body advanced-inspector-body" role="tabpanel">
      <div className="inspector-heading-row">
        <div>
          <span className="panel-kicker">Compositing</span>
          <h4>Masks, keys, tracking and grouped effects</h4>
        </div>
        <span className="inspector-status-dot is-ready">Layer aware</span>
      </div>

      <div className="composite-quick-actions">
        <button type="button" onClick={onAddAdjustmentLayer}>
          ＋ Adjustment layer
        </button>
        <button type="button" onClick={onCreateCompound}>
          ▣ Compound selection
        </button>
      </div>
      {adjustmentLayers.length ? (
        <div className="advanced-feature-note">
          <p>{adjustmentLayers.length} timed color adjustment layer(s) affect the tracks beneath them in preview and export.</p>
          {adjustmentLayers.map((layer, index) => (
            <div key={layer.id} className="adjustment-layer-controls">
              <strong>{layer.name || `Adjustment ${index + 1}`}</strong>
              {[
                ["startTime", "Start", 0, 3600, 0.1],
                ["duration", "Duration", 0.2, 3600, 0.1],
                ["brightness", "Exposure", 0.65, 1.4, 0.01],
                ["contrast", "Contrast", 0.65, 1.75, 0.01],
                ["saturation", "Saturation", 0, 1.8, 0.01],
                ["temperature", "Warmth", -1, 1, 0.01],
              ].map(([field, label, min, max, step]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    type="number"
                    aria-label={`${layer.name || `Adjustment ${index + 1}`} ${label}`}
                    min={min}
                    max={max}
                    step={step}
                    value={Number(field === "startTime" || field === "duration"
                      ? layer[field] ?? 0
                      : layer.effects?.color?.[field] ?? (field === "temperature" ? 0 : 1))}
                    onChange={event => onUpdateAdjustmentLayer?.(layer.id, field, event.target.value)}
                  />
                </label>
              ))}
              <button type="button" onClick={() => onDeleteAdjustmentLayer?.(layer.id)}>
                Remove {layer.name || `Adjustment ${index + 1}`}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <label className="inspector-select-field">
        <span>Composite target</span>
        <select
          value={activeOverlay?.id || ""}
          onChange={event => onSelectOverlay(event.target.value)}
        >
          <option value="">Select a layer</option>
          {overlays.map((overlay, index) => (
            <option key={overlay.id} value={overlay.id}>
              {overlay.name || overlay.file?.name || overlay.text || `Layer ${index + 1}`}
            </option>
          ))}
        </select>
      </label>

      {activeOverlay ? (
        <>
          <label className="inspector-select-field">
            <span>Blend mode</span>
            <select
              value={activeOverlay.blendMode || "normal"}
              onChange={event => onUpdateOverlay("blendMode", event.target.value)}
            >
              {[
                ["normal", "Normal"],
                ["multiply", "Multiply"],
                ["screen", "Screen"],
                ["overlay", "Overlay"],
                ["soft-light", "Soft light"],
                ["hard-light", "Hard light"],
                ["difference", "Difference"],
                ["color-dodge", "Color dodge"],
                ["luminosity", "Luminosity"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <details className="advanced-tool-section" open>
            <summary>Mask / rotoscope</summary>
            <label className="inspector-toggle-row">
              <span>
                <b>Enable mask</b>
                <small>Shape, feather and animate the visible region.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.mask?.enabled}
                onChange={event =>
                  onUpdateOverlay("mask", {
                    ...(activeOverlay.mask || {}),
                    enabled: event.target.checked,
                  })
                }
              />
            </label>
            {activeOverlay.mask?.enabled ? (
              <>
                <div className="inspector-choice-grid is-three">
                  {["rectangle", "ellipse", "polygon"].map(shape => (
                    <button
                      key={shape}
                      type="button"
                      className={
                        (activeOverlay.mask?.shape || "rectangle") === shape ? "is-active" : ""
                      }
                      onClick={() => onUpdateOverlay("mask", { ...activeOverlay.mask, shape })}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
                <Range
                  label="Feather"
                  valueLabel={`${Number(activeOverlay.mask?.feather || 0)}px`}
                  min={0}
                  max={100}
                  step={1}
                  value={Number(activeOverlay.mask?.feather || 0)}
                  onChange={event =>
                    onUpdateOverlay("mask", {
                      ...activeOverlay.mask,
                      feather: Number(event.target.value),
                    })
                  }
                />
                <label className="inspector-check-row">
                  <input
                    type="checkbox"
                    checked={!!activeOverlay.mask?.inverted}
                    onChange={event =>
                      onUpdateOverlay("mask", {
                        ...activeOverlay.mask,
                        inverted: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Invert mask</strong>
                  </span>
                </label>
              </>
            ) : null}
          </details>

          <details className="advanced-tool-section">
            <summary>Chroma key / green screen</summary>
            <label className="inspector-toggle-row">
              <span>
                <b>Key a color</b>
                <small>Remove green, blue or a sampled backdrop.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.chromaKey?.enabled}
                onChange={event =>
                  onUpdateOverlay("chromaKey", {
                    ...(activeOverlay.chromaKey || {}),
                    enabled: event.target.checked,
                  })
                }
              />
            </label>
            {activeOverlay.chromaKey?.enabled ? (
              <>
                <label className="composite-color-field">
                  <span>Key color</span>
                  <input
                    type="color"
                    value={activeOverlay.chromaKey?.color || "#00ff00"}
                    onChange={event =>
                      onUpdateOverlay("chromaKey", {
                        ...activeOverlay.chromaKey,
                        color: event.target.value,
                      })
                    }
                  />
                </label>
                <Range
                  label="Tolerance"
                  valueLabel={`${Number(activeOverlay.chromaKey?.tolerance || 30)}%`}
                  min={0}
                  max={100}
                  value={Number(activeOverlay.chromaKey?.tolerance || 30)}
                  onChange={event =>
                    onUpdateOverlay("chromaKey", {
                      ...activeOverlay.chromaKey,
                      tolerance: Number(event.target.value),
                    })
                  }
                />
                <Range
                  label="Spill removal"
                  valueLabel={`${Number(activeOverlay.chromaKey?.spill || 35)}%`}
                  min={0}
                  max={100}
                  value={Number(activeOverlay.chromaKey?.spill || 35)}
                  onChange={event =>
                    onUpdateOverlay("chromaKey", {
                      ...activeOverlay.chromaKey,
                      spill: Number(event.target.value),
                    })
                  }
                />
              </>
            ) : null}
          </details>

          <details className="advanced-tool-section">
            <summary>Background & tracking</summary>
            <label className="inspector-toggle-row">
              <span>
                <b>Remove background</b>
                <small>Creates a subject matte; original pixels stay untouched.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.backgroundRemoval?.enabled}
                onChange={event =>
                  onUpdateOverlay("backgroundRemoval", {
                    ...(activeOverlay.backgroundRemoval || {}),
                    enabled: event.target.checked,
                    status: event.target.checked ? "analysis_required" : "off",
                  })
                }
              />
            </label>
            {activeOverlay.backgroundRemoval?.enabled ? (
              <>
                <label className="inspector-select-field">
                  <span>Replacement</span>
                  <select
                    value={activeOverlay.backgroundRemoval?.replacement || "transparent"}
                    onChange={event =>
                      onUpdateOverlay("backgroundRemoval", {
                        ...activeOverlay.backgroundRemoval,
                        replacement: event.target.value,
                      })
                    }
                  >
                    <option value="transparent">Transparent</option>
                    <option value="studio_black">Studio black</option>
                    <option value="soft_blur">Soft source blur</option>
                    <option value="color">Solid color</option>
                    <option value="media">Media layer beneath</option>
                  </select>
                </label>
                {activeOverlay.backgroundRemoval?.replacement === "color" ? (
                  <label className="composite-color-field">
                    <span>Background color</span>
                    <input
                      type="color"
                      value={activeOverlay.backgroundRemoval?.color || "#05070c"}
                      onChange={event =>
                        onUpdateOverlay("backgroundRemoval", {
                          ...activeOverlay.backgroundRemoval,
                          color: event.target.value,
                        })
                      }
                    />
                  </label>
                ) : null}
                <p className="advanced-feature-note">
                  Matte analysis runs before replacement; no guessed cutout is shown as final.
                </p>
              </>
            ) : null}
            <label className="inspector-toggle-row">
              <span>
                <b>Track layer to motion</b>
                <small>Attach graphics or masks to a face, object or point.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.tracking?.enabled}
                onChange={event =>
                  onUpdateOverlay("tracking", {
                    ...(activeOverlay.tracking || {}),
                    enabled: event.target.checked,
                    status: event.target.checked ? "analysis_required" : "off",
                  })
                }
              />
            </label>
            {activeOverlay.tracking?.enabled ? (
              <div className="inspector-choice-grid is-three">
                {["face", "object", "point"].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className={(activeOverlay.tracking?.mode || "face") === mode ? "is-active" : ""}
                    onClick={() => onUpdateOverlay("tracking", { ...activeOverlay.tracking, mode })}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            ) : null}
          </details>

          <details className="advanced-tool-section">
            <summary>Presenter polish</summary>
            <label className="inspector-toggle-row">
              <span>
                <b>Eye-contact correction</b>
                <small>Gently redirects off-camera reading toward the lens.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.presenterPolish?.eyeContact}
                onChange={event =>
                  onUpdateOverlay("presenterPolish", {
                    ...(activeOverlay.presenterPolish || {}),
                    eyeContact: event.target.checked,
                    status: event.target.checked ? "analysis_required" : "off",
                  })
                }
              />
            </label>
            <label className="inspector-toggle-row">
              <span>
                <b>Natural face polish</b>
                <small>Balances exposure and detail without changing identity.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.presenterPolish?.facePolish}
                onChange={event =>
                  onUpdateOverlay("presenterPolish", {
                    ...(activeOverlay.presenterPolish || {}),
                    facePolish: event.target.checked,
                    status: event.target.checked ? "analysis_required" : "off",
                  })
                }
              />
            </label>
            <label className="inspector-toggle-row">
              <span>
                <b>Studio background refinement</b>
                <small>Repairs distracting patches while preserving the real set.</small>
              </span>
              <input
                type="checkbox"
                checked={!!activeOverlay.presenterPolish?.setRefinement}
                onChange={event =>
                  onUpdateOverlay("presenterPolish", {
                    ...(activeOverlay.presenterPolish || {}),
                    setRefinement: event.target.checked,
                    status: event.target.checked ? "analysis_required" : "off",
                  })
                }
              />
            </label>
            <p className="advanced-feature-note">
              Identity lock is mandatory: facial structure and the real people stay unchanged.
            </p>
          </details>
        </>
      ) : (
        <div className="inspector-empty-state">
          <span>◫</span>
          <strong>Select a visual layer</strong>
          <small>Compositing controls apply per layer and remain non-destructive.</small>
        </div>
      )}
    </div>
  );
}

export function AudioRestorationPanel({
  settings,
  onUpdate,
  source,
  onSourceChange,
  keyframes,
  playhead,
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
  onSeek,
  recording,
  onToggleRecording,
  voiceoverCount,
}) {
  const sourceKeys = keyframes[source] || [];
  const repairPresets = {
    natural: { voiceIsolation: false, denoise: 22, deEsser: 18, humFrequency: 50, compressor: 35, limiter: -1, loudness: -14, eq: { low: 0, mid: 0, high: 0 } },
    podcast: { voiceIsolation: false, denoise: 30, deEsser: 28, humFrequency: 50, compressor: 52, limiter: -1, loudness: -14, eq: { low: 1, mid: 2, high: 1 } },
    noisy_room: { voiceIsolation: true, denoise: 70, deEsser: 35, humFrequency: 50, compressor: 48, limiter: -1.2, loudness: -15, eq: { low: -2, mid: 3, high: 0 } },
    broadcast: { voiceIsolation: true, denoise: 38, deEsser: 42, humFrequency: 50, compressor: 72, limiter: -.8, loudness: -13, eq: { low: 1, mid: 1, high: 2 } },
  };
  const applyRepairPreset = preset => {
    onUpdate("preset", preset);
    Object.entries(repairPresets[preset]).forEach(([field, value]) => onUpdate(field, value));
  };
  return (
    <section className="audio-restoration-lab">
      <div className="sound-effects-heading">
        <div>
          <span className="panel-kicker">Voice repair & automation</span>
          <strong>Clean dialogue before music and effects</strong>
        </div>
        <span className="sound-effect-count">{sourceKeys.length} keys</span>
      </div>

      <div className="audio-repair-preset-grid">
        {["natural", "podcast", "noisy_room", "broadcast"].map(preset => (
          <button
            key={preset}
            type="button"
            className={settings.preset === preset ? "is-active" : ""}
            onClick={() => applyRepairPreset(preset)}
          >
            {preset.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <label className="inspector-toggle-row">
        <span><b>Use voice repair on export</b><small>Bypass keeps the original programme audio untouched.</small></span>
        <input type="checkbox" aria-label="Use voice repair on export"
          checked={settings.enabled !== false} onChange={event => onUpdate("enabled", event.target.checked)} />
      </label>
      <label className="inspector-toggle-row">
        <span>
          <b>Voice isolation</b>
          <small>Reduce room, music bleed and competing noise.</small>
        </span>
        <input
          type="checkbox"
          checked={settings.voiceIsolation}
          onChange={event => onUpdate("voiceIsolation", event.target.checked)}
        />
      </label>
      <Range
        label="Denoise"
        valueLabel={`${settings.denoise}%`}
        min={0}
        max={100}
        value={settings.denoise}
        onChange={event => onUpdate("denoise", Number(event.target.value))}
      />
      <Range
        label="De-esser"
        valueLabel={`${settings.deEsser}%`}
        min={0}
        max={100}
        value={settings.deEsser}
        onChange={event => onUpdate("deEsser", Number(event.target.value))}
      />
      <div className="audio-eq-grid">
        {Object.entries(settings.eq || { low: 0, mid: 0, high: 0 }).map(([band, value]) => (
          <Range
            key={band}
            label={`EQ ${band}`}
            valueLabel={`${value > 0 ? "+" : ""}${value} dB`}
            min={-12}
            max={12}
            step={1}
            value={value}
            onChange={event =>
              onUpdate("eq", { ...settings.eq, [band]: Number(event.target.value) })
            }
          />
        ))}
      </div>
      <Range
        label="Hum removal"
        valueLabel={`${settings.humFrequency}Hz`}
        min={50}
        max={60}
        step={10}
        value={settings.humFrequency}
        onChange={event => onUpdate("humFrequency", Number(event.target.value))}
      />
      <Range
        label="Compressor"
        valueLabel={`${settings.compressor}%`}
        min={0}
        max={100}
        value={settings.compressor}
        onChange={event => onUpdate("compressor", Number(event.target.value))}
      />
      <Range
        label="Limiter ceiling"
        valueLabel={`${Number(settings.limiter).toFixed(1)} dB`}
        min={-6}
        max={-0.1}
        step={0.1}
        value={settings.limiter}
        onChange={event => onUpdate("limiter", Number(event.target.value))}
      />
      <Range
        label="Loudness target"
        valueLabel={`${settings.loudness} LUFS`}
        min={-24}
        max={-9}
        step={1}
        value={settings.loudness}
        onChange={event => onUpdate("loudness", Number(event.target.value))}
      />

      <div className="voiceover-card">
        <div>
          <span>●</span>
          <strong>Voice-over recording</strong>
          <small>{voiceoverCount} takes in the timeline</small>
        </div>
        <button
          type="button"
          className={recording ? "is-recording" : ""}
          onClick={onToggleRecording}
        >
          {recording ? "Stop recording" : "Record at playhead"}
        </button>
      </div>

      <div className="audio-automation-card">
        <label className="inspector-select-field">
          <span>Automation source</span>
          <select value={source} onChange={event => onSourceChange(event.target.value)}>
            <option value="originalAudio">Original audio</option>
            <option value="masterPodcast">Master podcast audio</option>
            <option value="voiceover">Voice-over</option>
            <option value="music">Music</option>
            <option value="broll">B-roll audio</option>
            <option value="sfx">Sound effects</option>
          </select>
        </label>
        <button type="button" className="inspector-primary-action" onClick={onAddKeyframe}>
          ◆ Add volume keyframe at {Number(playhead || 0).toFixed(2)}s
        </button>
        <div className="audio-envelope-preview" aria-label={`${source} volume envelope`}>
          <svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img">
            <path className="audio-envelope-wave" d="M0 23 C8 5 12 40 20 20 S32 8 40 24 S53 39 61 18 S74 5 82 24 S93 39 100 18" />
            {sourceKeys.length > 1 ? (
              <polyline
                points={sourceKeys
                  .slice()
                  .sort((left, right) => Number(left.time) - Number(right.time))
                  .map(keyframe => {
                    const maxTime = Math.max(0.1, ...sourceKeys.map(item => Number(item.time || 0)), Number(playhead || 0));
                    return `${Math.min(100, (Number(keyframe.time || 0) / maxTime) * 100)},${42 - Math.min(40, Number(keyframe.value || 0) * 0.2)}`;
                  })
                  .join(" ")}
                className="audio-envelope-line"
              />
            ) : null}
            {sourceKeys.map(keyframe => {
              const maxTime = Math.max(0.1, ...sourceKeys.map(item => Number(item.time || 0)), Number(playhead || 0));
              return <circle key={`env-${keyframe.id}`} cx={Math.min(100, (Number(keyframe.time || 0) / maxTime) * 100)} cy={42 - Math.min(40, Number(keyframe.value || 0) * 0.2)} r="2.2" />;
            })}
          </svg>
          <small>Waveform envelope · keyframe gain and timing update live</small>
        </div>
        <div className="automation-keyframe-list">
          {sourceKeys.map(keyframe => (
            <article key={keyframe.id} className="audio-keyframe-editor">
              <button type="button" onClick={() => onSeek(keyframe.time)}>
                <span>◆</span>
                <strong>{Math.round(Number(keyframe.value || 0))}%</strong>
                <small>
                  {Number(keyframe.time).toFixed(2)}s · {keyframe.easing || "smooth"}
                </small>
              </button>
              <input
                aria-label={`${source} volume at ${Number(keyframe.time).toFixed(2)} seconds`}
                type="range"
                min={0}
                max={200}
                step={1}
                value={Number(keyframe.value || 0)}
                onChange={event =>
                  onUpdateKeyframe(keyframe.id, { value: Number(event.target.value) })
                }
              />
              <label className="audio-keyframe-time">
                <span>Time</span>
                <input
                  aria-label={`${source} keyframe time`}
                  type="number"
                  min="0"
                  step="0.05"
                  value={Number(keyframe.time || 0).toFixed(2)}
                  onChange={event => onUpdateKeyframe(keyframe.id, { time: Math.max(0, Number(event.target.value || 0)) })}
                />
              </label>
              <select
                aria-label={`${source} volume keyframe easing`}
                value={keyframe.easing || "ease_in_out"}
                onChange={event => onUpdateKeyframe(keyframe.id, { easing: event.target.value })}
              >
                {STUDIO_EASINGS.map(easing => (
                  <option key={easing.id} value={easing.id}>
                    {easing.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Remove audio keyframe"
                onClick={() => onRemoveKeyframe(keyframe.id)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
