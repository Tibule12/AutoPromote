import React, { useState } from "react";
import {
  BROLL_AUDIO_CUT_PRESETS,
  BROLL_CHOREOGRAPHY_PRESETS,
  BROLL_LAYOUT_PRESETS,
  BROLL_LOOK_POLISH_PRESETS,
  applyBRollAudioCutPreset,
  applyBRollChoreographyPreset,
  applyBRollLayoutPreset,
  applyBRollLookPolishPreset,
  buildBRollBeatMontage,
} from "./studioBRollPowerhouse";

export default function StudioBRollPowerhousePanel({
  activeOverlay = null,
  disabled = false,
  overlays = [],
  keyframes = [],
  beatMarkers = [],
  playheadTime = 0,
  programmeDuration = 30,
  onUpdateOverlay,
  onApplyChoreography,
  onApplyBatchMontage,
}) {
  const [montageStepDuration, setMontageStepDuration] = useState(2.0);
  const [statusNote, setStatusNote] = useState("");

  const brollCount = (overlays || []).filter(
    item =>
      item &&
      !item.isCaption &&
      !item.isNullRig &&
      !item.vectorShape &&
      (Boolean(item.bRollMode) || ["video", "image"].includes(item.type))
  ).length;

  const handleLayoutPreset = preset => {
    if (disabled || !activeOverlay || typeof onUpdateOverlay !== "function") return;
    const updated = applyBRollLayoutPreset(activeOverlay, preset.id);
    onUpdateOverlay(updated, `${preset.label} B-roll framing applied.`);
    setStatusNote(`${preset.label} framing applied (${preset.summary}).`);
  };

  const handleChoreographyPreset = preset => {
    if (disabled || !activeOverlay) return;
    const result = applyBRollChoreographyPreset({
      overlay: activeOverlay,
      keyframes,
      presetId: preset.id,
    });
    if (typeof onApplyChoreography === "function") {
      onApplyChoreography(result, `${preset.label} choreography keyframes baked onto B-roll.`);
    } else if (typeof onUpdateOverlay === "function") {
      onUpdateOverlay(result.overlay, `${preset.label} choreography applied.`);
    }
    setStatusNote(`${preset.label} motion choreography baked.`);
  };

  const handleAudioCutPreset = preset => {
    if (disabled || !activeOverlay || typeof onUpdateOverlay !== "function") return;
    const updated = applyBRollAudioCutPreset(activeOverlay, preset.id, programmeDuration);
    onUpdateOverlay(updated, `${preset.label} audio/cut recipe applied.`);
    setStatusNote(`${preset.label}: ${preset.summary}`);
  };

  const handleLookPolishPreset = preset => {
    if (disabled || !activeOverlay || typeof onUpdateOverlay !== "function") return;
    const updated = applyBRollLookPolishPreset(activeOverlay, preset.id);
    onUpdateOverlay(updated, `${preset.label} visual polish applied.`);
    setStatusNote(`${preset.label} look polish applied.`);
  };

  const handleBatchMontage = (mode, label) => {
    if (disabled || typeof onApplyBatchMontage !== "function") return;
    const result = buildBRollBeatMontage({
      overlays,
      keyframes,
      beatMarkers,
      startTime: playheadTime,
      clipDuration: montageStepDuration,
      mode,
      programmeDuration,
    });
    onApplyBatchMontage(
      result,
      `${label} applied across ${result.updatedCount} B-roll clip${result.updatedCount === 1 ? "" : "s"}.`
    );
    setStatusNote(
      `${label} sequenced ${result.updatedCount} B-roll clip${result.updatedCount === 1 ? "" : "s"}.`
    );
  };

  return (
    <fieldset disabled={disabled}
      className="inspector-field studio-broll-powerhouse-panel"
      aria-label="B-Roll Powerhouse Studio"
      data-testid="studio-broll-powerhouse-panel"
      style={{
        padding: 12,
        borderRadius: 12,
        background: "linear-gradient(145deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.65))",
        border: "1px solid rgba(56, 189, 248, 0.28)",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#38bdf8",
              display: "block",
            }}
          >
            Director Cutaway Rig
          </span>
          <strong style={{ fontSize: 13, color: "#f8fafc" }}>
            B-Roll Powerhouse Studio
          </strong>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(56, 189, 248, 0.16)",
            color: "#bae6fd",
          }}
        >
          {brollCount} B-Roll · {beatMarkers.length} Beats
        </span>
      </div>

      {brollCount > 0 ? (
        <div
          style={{
            padding: 9,
            borderRadius: 9,
            background: "rgba(2, 6, 23, 0.5)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            marginBottom: activeOverlay ? 12 : 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
              Multi-Clip Beat Montage & Sequencer
            </span>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
              Pace
              <select
                aria-label="Montage clip pace"
                value={montageStepDuration}
                onChange={e => setMontageStepDuration(Number(e.target.value))}
                style={{
                  background: "#0f172a",
                  color: "#f8fafc",
                  border: "1px solid rgba(148,163,184,0.3)",
                  borderRadius: 6,
                  padding: "2px 5px",
                  fontSize: 11,
                }}
              >
                <option value={1.2}>1.2s Fast Cut</option>
                <option value={2.0}>2.0s Story Beat</option>
                <option value={3.2}>3.2s Documentary</option>
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            <button
              type="button"
              data-testid="broll-montage-sequence"
              onClick={() => handleBatchMontage("sequential_montage", "Beat Montage")}
              style={{
                padding: "6px 8px",
                borderRadius: 7,
                border: "1px solid rgba(56, 189, 248, 0.4)",
                background: "rgba(14, 165, 233, 0.18)",
                color: "#e0f2fe",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⚡ Sequence Beat Montage
            </button>
            <button
              type="button"
              data-testid="broll-montage-corners"
              onClick={() => handleBatchMontage("cycle_corners", "Corner Callout Cycle")}
              style={{
                padding: "6px 8px",
                borderRadius: 7,
                border: "1px solid rgba(168, 85, 247, 0.4)",
                background: "rgba(168, 85, 247, 0.16)",
                color: "#f3e8ff",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ❖ Cycle Corner Cards
            </button>
            <button
              type="button"
              data-testid="broll-montage-push-all"
              onClick={() => handleBatchMontage("cinema_push_all", "Cinema Push-In All")}
              style={{
                padding: "6px 8px",
                borderRadius: 7,
                border: "1px solid rgba(245, 158, 11, 0.4)",
                background: "rgba(245, 158, 11, 0.16)",
                color: "#fef3c7",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🎬 Push-In All B-Roll
            </button>
          </div>
        </div>
      ) : null}

      {activeOverlay ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#cbd5e1",
                display: "block",
                marginBottom: 5,
              }}
            >
              1-Click Framing & Split-Screen Studio
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 5,
              }}
            >
              {BROLL_LAYOUT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`broll-layout-${preset.id}`}
                  onClick={() => handleLayoutPreset(preset)}
                  title={preset.summary}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: 7,
                    border: "1px solid rgba(148, 163, 184, 0.24)",
                    background: "rgba(15, 23, 42, 0.75)",
                    color: "#f1f5f9",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{preset.label}</span>
                  <small
                    style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "rgba(56, 189, 248, 0.18)",
                      color: "#7dd3fc",
                    }}
                  >
                    {preset.badge}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#cbd5e1",
                display: "block",
                marginBottom: 5,
              }}
            >
              1-Click Motion Choreography (Video & Image)
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 5,
              }}
            >
              {BROLL_CHOREOGRAPHY_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`broll-choreo-${preset.id}`}
                  onClick={() => handleChoreographyPreset(preset)}
                  title={preset.summary}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 7,
                    border: "1px solid rgba(56, 189, 248, 0.28)",
                    background: "rgba(14, 165, 233, 0.12)",
                    color: "#e0f2fe",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#cbd5e1",
                display: "block",
                marginBottom: 5,
              }}
            >
              Cutaway Timing & Audio Mix
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 5,
              }}
            >
              {BROLL_AUDIO_CUT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`broll-audio-${preset.id}`}
                  disabled={disabled || activeOverlay.type !== "video"}
                  onClick={() => handleAudioCutPreset(preset)}
                  title={preset.summary}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 7,
                    border: "1px solid rgba(16, 185, 129, 0.28)",
                    background: "rgba(16, 185, 129, 0.11)",
                    color: "#d1fae5",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#cbd5e1",
                display: "block",
                marginBottom: 5,
              }}
            >
              1-Click Visual Grade & Depth Polish
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 5,
              }}
            >
              {BROLL_LOOK_POLISH_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`broll-look-${preset.id}`}
                  onClick={() => handleLookPolishPreset(preset)}
                  title={preset.summary}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 7,
                    border: "1px solid rgba(244, 114, 182, 0.28)",
                    background: "rgba(244, 114, 182, 0.11)",
                    color: "#fce7f3",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <small style={{ color: "#94a3b8", display: "block", fontSize: 11 }}>
          Select a B-roll video or image on the timeline to unlock 1-click Split-Screens, Circle
          Portals, Whip-Pan Choreography, J-Cuts/L-Cuts, and Cinema Grade Matching.
        </small>
      )}

      {statusNote ? (
        <small
          role="status"
          data-testid="broll-powerhouse-status"
          style={{
            display: "block",
            marginTop: 8,
            color: "#7dd3fc",
            fontSize: 11,
          }}
        >
          ✓ {statusNote}
        </small>
      ) : null}
    </fieldset>
  );
}
