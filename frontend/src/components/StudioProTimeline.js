import React from "react";

const EDIT_TOOLS = [
  ["select", "V", "Select"],
  ["razor", "C", "Razor"],
  ["ripple", "B", "Ripple"],
  ["roll", "N", "Roll"],
  ["slip", "Y", "Slip"],
  ["slide", "U", "Slide"],
  ["hand", "H", "Hand"],
];

const TRACK_DEFINITIONS = [
  ["video", "V1", "Source video", "video"],
  ["adjustment", "A1", "Adjustment", "adjustment"],
  ["framing", "RF", "Framing", "adjustment"],
  ["graphics", "G1", "Graphics", "graphics"],
  ["motion", "G2", "Motion + sound", "graphics"],
  ["broll", "V2", "B-roll", "broll"],
  ["captions", "CC", "Captions", "captions"],
  ["originalAudio", "A2", "Original audio", "audio"],
  ["voiceover", "VO", "Voice-over", "voice"],
  ["music", "M1", "Music", "music"],
  ["sfx", "FX", "Sound effects", "sfx"],
];

const percentAt = (time, duration) =>
  `${Math.max(0, Math.min(100, (Number(time || 0) / Math.max(0.1, duration)) * 100))}%`;

const TrackControls = ({ trackId, state, onChange }) => (
  <div className="pro-track-controls">
    <button
      type="button"
      className={state.visible === false ? "is-off" : ""}
      aria-label={`${state.visible === false ? "Show" : "Hide"} track`}
      onClick={() => onChange(trackId, { visible: state.visible === false })}
    >
      ◉
    </button>
    <button
      type="button"
      className={state.locked ? "is-on" : ""}
      aria-label={`${state.locked ? "Unlock" : "Lock"} track`}
      onClick={() => onChange(trackId, { locked: !state.locked })}
    >
      {state.locked ? "▣" : "□"}
    </button>
    <button
      type="button"
      className={state.muted ? "is-on" : ""}
      aria-label={`${state.muted ? "Unmute" : "Mute"} track`}
      onClick={() => onChange(trackId, { muted: !state.muted })}
    >
      M
    </button>
    <button
      type="button"
      className={state.solo ? "is-on" : ""}
      aria-label={`${state.solo ? "Unsolo" : "Solo"} track`}
      onClick={() => onChange(trackId, { solo: !state.solo })}
    >
      S
    </button>
  </div>
);

const AutomationDots = ({ items, duration, type }) =>
  (items || []).map(item => (
    <i
      key={item.id}
      className={`pro-automation-dot is-${type}`}
      style={{
        left: percentAt(item.time, duration),
        bottom: `${Math.max(4, Math.min(28, Number(item.value || 0) * 0.28))}px`,
      }}
      title={`${item.property || "volume"}: ${Number(item.value || 0).toFixed(2)} at ${Number(item.time || 0).toFixed(2)}s`}
    />
  ));

const BrollClip = ({
  item,
  index,
  trackId,
  start,
  duration,
  itemLabel,
  safeDuration,
  snapping,
  snapTargets,
  onOverlayMove,
  onOverlayTrim,
  onOverlaySlip,
  onClick,
}) => {
  const dragRef = React.useRef(null);
  const [isSnapped, setIsSnapped] = React.useState(false);

  const resolveSnap = (targetTime, threshold = 0.18) => {
    if (!snapping || !snapTargets || !snapTargets.length) return { time: targetTime, snapped: false };
    let closest = targetTime;
    let minDelta = threshold;
    let didSnap = false;
    for (const pt of snapTargets) {
      const delta = Math.abs(pt - targetTime);
      if (delta < minDelta) {
        minDelta = delta;
        closest = pt;
        didSnap = true;
      }
    }
    return { time: closest, snapped: didSnap };
  };

  const handlePointerDownBody = (e) => {
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    const isSlip = Boolean(e.altKey || e.shiftKey);
    dragRef.current = {
      type: isSlip ? "slip" : "move",
      startX: e.clientX,
      startParam: isSlip ? Number(item.sourceStartTime || 0) : start,
      laneWidth: e.target.parentElement.getBoundingClientRect().width,
    };
  };

  const handlePointerDownLeft = (e) => {
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = {
      type: "trim-start",
      startX: e.clientX,
      startParam: start,
      laneWidth: e.target.parentElement.parentElement.getBoundingClientRect().width,
    };
  };

  const handlePointerDownRight = (e) => {
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = {
      type: "trim-end",
      startX: e.clientX,
      startParam: duration,
      laneWidth: e.target.parentElement.parentElement.getBoundingClientRect().width,
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const { type, startX, startParam, laneWidth } = dragRef.current;
    const deltaX = e.clientX - startX;
    const deltaSeconds = (deltaX / laneWidth) * safeDuration;

    if (type === "slip") {
      const newSourceStart = Math.max(0, startParam - deltaSeconds);
      if (onOverlaySlip) onOverlaySlip(item.id, newSourceStart);
    } else if (type === "move") {
      const rawStart = Math.max(0, startParam + deltaSeconds);
      const snapStartRes = resolveSnap(rawStart);
      let finalStart = snapStartRes.time;
      let activeSnap = snapStartRes.snapped;

      if (!activeSnap) {
        const rawEnd = rawStart + duration;
        const snapEndRes = resolveSnap(rawEnd);
        if (snapEndRes.snapped) {
          finalStart = Math.max(0, snapEndRes.time - duration);
          activeSnap = true;
        }
      }
      setIsSnapped(activeSnap);
      if (onOverlayMove) onOverlayMove(item.id, finalStart);
    } else if (type === "trim-start") {
      const rawStart = Math.max(0, startParam + deltaSeconds);
      const snapRes = resolveSnap(rawStart);
      setIsSnapped(snapRes.snapped);
      if (onOverlayTrim) onOverlayTrim(item.id, "start", snapRes.time);
    } else if (type === "trim-end") {
      const rawEnd = Math.max(0.1, start + startParam + deltaSeconds);
      const snapRes = resolveSnap(rawEnd);
      const newDur = Math.max(0.1, snapRes.time - start);
      setIsSnapped(snapRes.snapped);
      if (onOverlayTrim) onOverlayTrim(item.id, "end", newDur);
    }
  };

  const handlePointerUp = (e) => {
    if (dragRef.current) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      dragRef.current = null;
      setIsSnapped(false);
    }
  };

  return (
    <div
      className={`pro-track-clip ${isSnapped ? "is-magnet-snapped" : ""}`}
      data-testid={`pro-${trackId}-clip-${index + 1}`}
      style={{
        left: percentAt(start, safeDuration),
        width: `${Math.max(1.2, (duration / safeDuration) * 100)}%`,
        position: "absolute",
        padding: 0,
        boxShadow: isSnapped ? "0 0 0 2px #38bdf8, 0 0 14px rgba(56, 189, 248, 0.7)" : undefined,
        transition: "box-shadow 0.15s ease",
      }}
      title={`${itemLabel} · ${start.toFixed(2)}s–${(start + duration).toFixed(2)}s · (Hold Alt/Option to Slip source footage)`}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "6px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 2,
        }}
        onPointerDown={handlePointerDownLeft}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={(e) => (e.target.style.background = "rgba(255,255,255,0.3)")}
        onMouseLeave={(e) => (e.target.style.background = "transparent")}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          boxSizing: "border-box",
        }}
        onPointerDown={handlePointerDownBody}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={onClick}
      >
        <span style={{ pointerEvents: 'none', overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{itemLabel}</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "6px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 2,
        }}
        onPointerDown={handlePointerDownRight}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={(e) => (e.target.style.background = "rgba(255,255,255,0.3)")}
        onMouseLeave={(e) => (e.target.style.background = "transparent")}
      />
    </div>
  );
};

const AudioSplitClip = ({
  item,
  index,
  start,
  duration,
  itemLabel,
  safeDuration,
  snapping,
  snapTargets,
  onAudioTrim,
  onClick,
}) => {
  const dragRef = React.useRef(null);

  const resolveSnap = (targetTime, threshold = 0.18) => {
    if (!snapping || !snapTargets || !snapTargets.length) return { time: targetTime, snapped: false };
    let closest = targetTime;
    let minDelta = threshold;
    let didSnap = false;
    for (const pt of snapTargets) {
      const delta = Math.abs(pt - targetTime);
      if (delta < minDelta) {
        minDelta = delta;
        closest = pt;
        didSnap = true;
      }
    }
    return { time: closest, snapped: didSnap };
  };

  const handlePointerDownLeft = (e) => {
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = {
      type: "trim-start",
      startX: e.clientX,
      startOffset: Number(item.audioTrimOffsetStart || 0),
      laneWidth: e.target.parentElement.parentElement?.getBoundingClientRect().width || 600,
    };
  };

  const handlePointerDownRight = (e) => {
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = {
      type: "trim-end",
      startX: e.clientX,
      startOffset: Number(item.audioTrimOffsetEnd || 0),
      laneWidth: e.target.parentElement.parentElement?.getBoundingClientRect().width || 600,
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const { type, startX, startOffset, laneWidth } = dragRef.current;
    const deltaX = e.clientX - startX;
    const deltaSeconds = (deltaX / laneWidth) * safeDuration;

    if (type === "trim-start") {
      const rawNewOffset = startOffset + deltaSeconds;
      const clamped = Math.max(-3.0, Math.min(0.5, rawNewOffset));
      const targetTime = Number(item.outputStart || 0) + clamped;
      const snapRes = resolveSnap(targetTime);
      const finalOffset = snapRes.snapped ? snapRes.time - Number(item.outputStart || 0) : clamped;
      if (onAudioTrim) {
        onAudioTrim(item.originalIndex ?? index, { audioTrimOffsetStart: Math.round(finalOffset * 100) / 100 });
      }
    } else if (type === "trim-end") {
      const rawNewOffset = startOffset + deltaSeconds;
      const clamped = Math.max(-0.5, Math.min(3.0, rawNewOffset));
      const targetTime = Number(item.outputStart || 0) + Number(item.videoDuration ?? item.duration ?? 0) + clamped;
      const snapRes = resolveSnap(targetTime);
      const finalOffset = snapRes.snapped ? snapRes.time - (Number(item.outputStart || 0) + Number(item.videoDuration ?? item.duration ?? 0)) : clamped;
      if (onAudioTrim) {
        onAudioTrim(item.originalIndex ?? index, { audioTrimOffsetEnd: Math.round(finalOffset * 100) / 100 });
      }
    }
  };

  const handlePointerUp = (e) => {
    if (dragRef.current) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      dragRef.current = null;
    }
  };

  const hasJCut = Number(item.audioTrimOffsetStart || 0) < -0.04;
  const hasLCut = Number(item.audioTrimOffsetEnd || 0) > 0.04;
  const jCutDur = hasJCut ? Math.abs(item.audioTrimOffsetStart).toFixed(1) : null;
  const lCutDur = hasLCut ? Number(item.audioTrimOffsetEnd).toFixed(1) : null;

  return (
    <div
      className="pro-track-clip pro-audio-track-clip"
      style={{
        left: percentAt(start, safeDuration),
        width: `${Math.max(1.2, (duration / safeDuration) * 100)}%`,
        cursor: "pointer",
        position: "absolute",
      }}
      onClick={onClick}
      title={`${itemLabel}${hasJCut ? ` | 🎧 J-Cut: -${jCutDur}s` : ""}${hasLCut ? ` | 🎧 L-Cut: +${lCutDur}s` : ""}`}
    >
      <div
        className="pro-audio-edge-handle is-left"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "8px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 3,
        }}
        onPointerDown={handlePointerDownLeft}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Drag left/right to adjust J-Cut dialogue pre-lap"
      />

      {hasJCut && (
        <div className="pro-jcut-wing" title={`J-Cut audio lead: ${jCutDur}s`}>
          <span>🎧 J -{jCutDur}s</span>
        </div>
      )}

      <div className="pro-audio-clip-body">
        <span className="pro-audio-label">{itemLabel}</span>
      </div>

      {hasLCut && (
        <div className="pro-lcut-wing" title={`L-Cut audio trail: ${lCutDur}s`}>
          <span>🎧 L +{lCutDur}s</span>
        </div>
      )}

      <div
        className="pro-audio-edge-handle is-right"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "8px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 3,
        }}
        onPointerDown={handlePointerDownRight}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Drag left/right to adjust L-Cut dialogue trail"
      />
    </div>
  );
};

const MotionClip = ({
  item,
  index,
  start,
  duration,
  itemLabel,
  safeDuration,
  snapping,
  snapTargets,
  onMotionMove,
  onMotionTrim,
  onClick,
}) => {
  const dragRef = React.useRef(null);
  const [isSnapped, setIsSnapped] = React.useState(false);

  const resolveSnap = (targetTime, threshold = 0.18) => {
    if (!snapping || !snapTargets || !snapTargets.length) return { time: targetTime, snapped: false };
    let closest = targetTime;
    let minDelta = threshold;
    let didSnap = false;
    for (const pt of snapTargets) {
      const delta = Math.abs(pt - targetTime);
      if (delta < minDelta) {
        minDelta = delta;
        closest = pt;
        didSnap = true;
      }
    }
    return { time: closest, snapped: didSnap };
  };

  const handlePointerDownBody = (e) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    const laneEl = e.currentTarget.closest(".pro-track-lane") || e.currentTarget.parentElement;
    const lw = laneEl?.getBoundingClientRect?.()?.width;
    dragRef.current = {
      type: "move",
      startX: Number(e.clientX ?? 0),
      startParam: Number(start || 0),
      laneWidth: Math.max(1, Number(lw || 1)),
    };
  };

  const handlePointerDownLeft = (e) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    const laneEl = e.currentTarget.closest(".pro-track-lane") || e.currentTarget.parentElement?.parentElement;
    const lw = laneEl?.getBoundingClientRect?.()?.width;
    dragRef.current = {
      type: "trim-start",
      startX: Number(e.clientX ?? 0),
      startParam: Number(start || 0),
      startDuration: Number(duration || 1),
      laneWidth: Math.max(1, Number(lw || 1)),
    };
  };

  const handlePointerDownRight = (e) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    const laneEl = e.currentTarget.closest(".pro-track-lane") || e.currentTarget.parentElement?.parentElement;
    const lw = laneEl?.getBoundingClientRect?.()?.width;
    dragRef.current = {
      type: "trim-end",
      startX: Number(e.clientX ?? 0),
      startParam: Number(duration || 1),
      laneWidth: Math.max(1, Number(lw || 1)),
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const { type, startX, startParam, startDuration, laneWidth } = dragRef.current;
    const safeLaneWidth = Math.max(1, Number(laneWidth || 1));
    const currentX = Number(e.clientX ?? startX);
    const deltaX = currentX - startX;
    const deltaSeconds = (deltaX / safeLaneWidth) * Number(safeDuration || 1);

    if (type === "move") {
      const rawStart = Math.max(0, startParam + deltaSeconds);
      const snapRes = resolveSnap(rawStart);
      const finalStart = snapRes.time;
      setIsSnapped(snapRes.snapped);
      if (onMotionMove) onMotionMove(item.id, Number(finalStart.toFixed(2)));
    } else if (type === "trim-start") {
      const rawStart = Math.max(0, startParam + deltaSeconds);
      const snapRes = resolveSnap(rawStart);
      const finalStart = snapRes.time;
      const endLimit = startParam + startDuration - 0.5;
      const clampedStart = Math.min(finalStart, endLimit);
      setIsSnapped(snapRes.snapped);
      if (onMotionTrim) onMotionTrim(item.id, "start", Number(clampedStart.toFixed(2)));
    } else if (type === "trim-end") {
      const rawEnd = Math.max(start + 0.5, start + startParam + deltaSeconds);
      const snapRes = resolveSnap(rawEnd);
      const finalEnd = Math.max(start + 0.5, snapRes.time);
      setIsSnapped(snapRes.snapped);
      if (onMotionTrim) onMotionTrim(item.id, "end", Number(finalEnd.toFixed(2)));
    }
  };

  const handlePointerUp = (e) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    dragRef.current = null;
    setIsSnapped(false);
  };

  const preset = item.preset || "title";
  const badgeColor = item.color || "#8b5cf6";
  const icon =
    preset === "badge"
      ? "⚡"
      : preset === "progress"
        ? "⏳"
        : preset === "quote"
          ? "💬"
          : preset === "cta"
            ? "🔔"
            : preset === "counter"
              ? "🔢"
              : preset === "callout"
                ? "🎯"
                : preset === "lower_third"
                  ? "👤"
                  : "✨";

  return (
    <div
      className={`pro-track-clip pro-motion-clip ${isSnapped ? "is-snapped" : ""}`}
      data-testid={`pro-motion-clip-${index + 1}`}
      style={{
        position: "absolute",
        left: percentAt(start, safeDuration),
        width: `${Math.max(1.2, (duration / safeDuration) * 100)}%`,
        borderLeft: `4px solid ${badgeColor}`,
        boxSizing: "border-box",
        cursor: "grab",
        userSelect: "none",
        zIndex: 2,
      }}
      onClick={onClick}
      onPointerDown={handlePointerDownBody}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={`${itemLabel} · ${start.toFixed(2)}s–${(start + duration).toFixed(2)}s`}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "7px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 3,
        }}
        onPointerDown={handlePointerDownLeft}
        title="Drag to trim start"
        onMouseEnter={(e) => (e.target.style.background = "rgba(255,255,255,0.35)")}
        onMouseLeave={(e) => (e.target.style.background = "transparent")}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "100%", height: "100%", overflow: "hidden", padding: "0 6px" }}>
        <span style={{ fontSize: "0.65rem" }}>{icon}</span>
        <span style={{ pointerEvents: "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: "0.58rem", fontWeight: 700 }}>
          {itemLabel}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "7px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 3,
        }}
        onPointerDown={handlePointerDownRight}
        title="Drag to trim duration"
        onMouseEnter={(e) => (e.target.style.background = "rgba(255,255,255,0.35)")}
        onMouseLeave={(e) => (e.target.style.background = "transparent")}
      />
    </div>
  );
};

export default function StudioProTimeline({
  duration,
  playhead,
  zoom,
  onZoomChange,
  editTool,
  onEditToolChange,
  onOverlayMove,
  onOverlayTrim,
  onOverlaySlip,
  onMotionMove,
  onMotionTrim,
  onAutoGenerateMotionBeats,
  snapping,
  onSnappingChange,
  linkedSelection,
  onLinkedSelectionChange,
  rippleMode,
  onRippleModeChange,
  trackStates,
  onTrackStateChange,
  timelineSegments,
  overlays,
  captionSegments,
  soundEffects,
  musicTrack,
  voiceovers,
  adjustmentLayers,
  creativeEffects,
  motionKeyframes,
  motionScenes = [],
  onSelectMotion,
  audioKeyframes,
  speedKeyframes,
  framingCuts = [],
  speakerFocusCuts = [],
  onSeek,
  onSelectOverlay,
  onSelectTool,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onDelete,
  canDelete,
  onToggleCaptions,
  captionsActive,
  onToggleSilence,
  silenceRemovalActive,
  onRippleCutSilence,
  isRippleCutting,
  silenceRegions = [],
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSetDualCam,
  isDualCamActive,
  onSetAutoReframe,
  isAutoReframeActive,
  onToggleDirectorMode,
  isDirectorModeActive,
  onTogglePunchAtPlayhead,
  onAutoGeneratePunchIns,
  isPlayheadPunched,
  punchZones = [],
  onAudioTrim,
  onToggleJCutAtPlayhead,
  onToggleLCutAtPlayhead,
  hasActiveJCut = false,
  hasActiveLCut = false,
  musicBeatMarkers = [],
  beatSnapping = false,
  onBeatSnappingChange,
  onAlignCutsToBeat,
  _onAlignBRollToBeat,
}) {
  const safeDuration = Math.max(0.1, Number(duration || 0.1));
  const visibleWidth = `${Math.max(100, Number(zoom || 1) * 100)}%`;
  const titles = (overlays || []).filter(item => item.type === "text" && !item.isCaption);
  const broll = (overlays || []).filter(item => item.bRollMode);
  const framingItems = [...(framingCuts || [])]
    .sort((left, right) => Number(left.time || 0) - Number(right.time || 0))
    .map((cut, index, ordered) => ({
      ...cut,
      startTime: Number(cut.time || 0),
      duration: Math.max(
        0.08,
        Number(ordered[index + 1]?.time ?? safeDuration) - Number(cut.time || 0)
      ),
      name:
        cut.mode === "center"
          ? "Show Everyone"
          : cut.mode === "speaker_track"
            ? "Solo Speaker"
            : cut.mode === "group_stack"
              ? "Multi-Camera"
              : "Reframe off",
    }));
  const sourceSequence = (timelineSegments || []).reduce((sequence, item, index) => {
    const start = Number(item.startRequest ?? item.start_time ?? item.start ?? 0);
    const end = Number(item.endRequest ?? item.end_time ?? item.end);
    const itemDuration = Math.max(0.04,
      Number.isFinite(end) && end > start ? end - start : Number(item.duration) || 0.04);
    const outputStart = sequence.reduce(
      (total, sequenceItem) => total + Number(sequenceItem.duration || 0),
      0
    );
    const aStartOffset = Number(item.audioTrimOffsetStart || 0);
    const aEndOffset = Number(item.audioTrimOffsetEnd || 0);
    const audioOutputStart = Math.max(0, outputStart + aStartOffset);
    const audioDuration = Math.max(0.05, itemDuration - aStartOffset + aEndOffset);

    sequence.push({
      ...item,
      id: item.id || `sequence-${index + 1}`,
      originalIndex: index,
      startTime: outputStart,
      outputStart,
      duration: itemDuration,
      videoDuration: itemDuration,
      name: item.name || `Source clip ${index + 1}`,
      audioOutputStart,
      audioDuration,
      audioTrimOffsetStart: aStartOffset,
      audioTrimOffsetEnd: aEndOffset,
      hasJCut: aStartOffset < -0.04,
      hasLCut: aEndOffset > 0.04,
    });
    return sequence;
  }, []);
  const clipsForTrack = trackId => {
    if (trackId === "adjustment") return [...(adjustmentLayers || []), ...(creativeEffects || [])];
    if (trackId === "framing") return framingItems;
    if (trackId === "graphics") return titles;
    if (trackId === "motion")
      return [
        ...motionScenes.map(scene => ({ ...scene, name: scene.text || "Motion scene" })),
        ...(punchZones || []).map(pz => ({
          id: pz.id || `punch-${pz.startTime}`,
          startTime: pz.startTime,
          duration: pz.duration,
          name: `🎯 ${Number(pz.maxScale || 1.25).toFixed(2)}× Punch`,
          isPunch: true,
          maxScale: pz.maxScale,
        })),
      ];
    if (trackId === "broll") return broll;
    if (trackId === "captions") return captionSegments || [];
    if (trackId === "voiceover") return voiceovers || [];
    if (trackId === "sfx") return soundEffects || [];
    if (trackId === "music")
      return musicTrack
        ? [{ ...musicTrack, id: musicTrack.id || "music", startTime: 0, duration: safeDuration }]
        : [];
    if (trackId === "video" || trackId === "originalAudio") {
      if (sourceSequence.length) {
        return sourceSequence.map((item, index) => ({
          ...item,
          id: `${trackId}-${item.id}`,
          startTime: trackId === "originalAudio" ? item.audioOutputStart : item.outputStart,
          duration: trackId === "originalAudio" ? item.audioDuration : item.duration,
          name:
            trackId === "video" ? item.name : `${item.name || `Source clip ${index + 1}`} audio`,
        }));
      }
      return [
        {
          id: trackId,
          startTime: 0,
          duration: safeDuration,
          name: trackId === "video" ? "Main sequence" : "Original mix",
        },
      ];
    }
    return [];
  };

  const snapTargets = React.useMemo(() => {
    const points = [0, safeDuration, Number(playhead || 0)];
    sourceSequence.forEach(seg => {
      const s = Number(seg.startTime ?? seg.outputStart ?? 0);
      const d = Number(seg.duration || 0);
      points.push(s);
      points.push(s + d);
    });
    (broll || []).forEach(c => {
      const cs = Number(c.startTime ?? c.start_time ?? 0);
      const cd = Number(c.duration || 0);
      points.push(cs);
      points.push(cs + cd);
    });
    if (beatSnapping || snapping) {
      (musicBeatMarkers || []).forEach(bm => {
        const t = typeof bm === "number" ? bm : Number(bm?.time ?? 0);
        if (Number.isFinite(t)) points.push(t);
      });
    }
    return Array.from(new Set(points.filter(p => Number.isFinite(p))));
  }, [safeDuration, playhead, sourceSequence, broll, musicBeatMarkers, beatSnapping, snapping]);

  return (
    <section className="studio-pro-timeline" data-testid="studio-pro-timeline">
      <div className="pro-timeline-toolbar">
        {onSplit && (
          <div className="pro-quick-actions" role="toolbar" aria-label="Quick editing actions">
            <button
              type="button"
              className="pro-quick-btn is-primary"
              onClick={onSplit}
              title="Split clip at playhead"
              data-testid="pro-quick-split"
            >
              ✂️ Split
            </button>
            <button
              type="button"
              className="pro-quick-btn"
              onClick={onTrimStart}
              title="Cut everything before playhead"
              data-testid="pro-quick-trim-start"
            >
              ⏮️ Trim Start
            </button>
            <button
              type="button"
              className="pro-quick-btn"
              onClick={onTrimEnd}
              title="Cut everything after playhead"
              data-testid="pro-quick-trim-end"
            >
              ⏭️ Trim End
            </button>
            {canDelete && (
              <button
                type="button"
                className="pro-quick-btn is-danger"
                onClick={onDelete}
                title="Delete selected clip"
                data-testid="pro-quick-delete"
              >
                🗑️ Delete
              </button>
            )}
            {onToggleCaptions && (
              <button
                type="button"
                className={`pro-quick-btn ${captionsActive ? "is-active" : ""}`}
                onClick={onToggleCaptions}
                title={captionsActive ? "Captions active (click to disable)" : "Turn on auto-captions"}
                data-testid="pro-quick-captions"
              >
                {captionsActive ? "💬 Captions On" : "💬 Captions"}
              </button>
            )}
            {onToggleSilence && (
              <button
                type="button"
                className={`pro-quick-btn ${silenceRemovalActive ? "is-active" : ""}`}
                onClick={onToggleSilence}
                title="Toggle 1-click silence dead-air removal (virtual skip preview)"
                data-testid="pro-quick-silence"
              >
                {silenceRemovalActive ? "⚡ Silences Cut" : "⚡ Cut Silences"}
              </button>
            )}
            {onRippleCutSilence && (
              <button
                type="button"
                className="pro-quick-btn pro-ripple-cut-btn"
                onClick={onRippleCutSilence}
                disabled={isRippleCutting}
                title="Physically slice dead-air pauses out of the timeline and ripple all tracks"
                data-testid="pro-quick-ripple-silence"
              >
                {isRippleCutting ? "⏳ Slicing..." : "⚡ Ripple-Cut Dead Air"}
              </button>
            )}
            {onSetDualCam && (
              <button
                type="button"
                className={`pro-quick-btn ${isDualCamActive ? "is-active" : ""}`}
                onClick={onSetDualCam}
                title="Stack 16:9 podcast hosts vertically in 9:16 dual-cam"
                data-testid="pro-quick-both-cams"
              >
                👥 Show Everyone
              </button>
            )}
            {onSetAutoReframe && (
              <button
                type="button"
                className={`pro-quick-btn ${isAutoReframeActive ? "is-active" : ""}`}
                onClick={onSetAutoReframe}
                title="Open speaker close-up, zoom and reviewed framing points"
                data-testid="pro-quick-reframe"
              >
                🎯 Solo Speaker
              </button>
            )}
            {onTogglePunchAtPlayhead && (
              <button
                type="button"
                className={`pro-quick-btn ${isPlayheadPunched ? "is-active is-punched" : ""}`}
                onClick={onTogglePunchAtPlayhead}
                title="Toggle 1.25× camera punch-in at playhead (Hotkey: Z)"
                data-testid="pro-quick-punch"
                style={isPlayheadPunched ? {
                  background: "linear-gradient(135deg, #a855f7, #ec4899)",
                  borderColor: "#f472b6",
                  color: "#fff",
                  fontWeight: 600,
                } : undefined}
              >
                {isPlayheadPunched ? "🎯 Punched (Z)" : "🎯 Punch In (Z)"}
              </button>
            )}
            {onAutoGeneratePunchIns && (
              <button
                type="button"
                className="pro-quick-btn"
                onClick={onAutoGeneratePunchIns}
                title="Auto-generate viral cadence punch-ins across the whole sequence"
                data-testid="pro-quick-auto-punch"
              >
                ⚡ Auto-Punch
              </button>
            )}
            {onAutoGenerateMotionBeats && (
              <button
                type="button"
                className="pro-quick-btn"
                onClick={onAutoGenerateMotionBeats}
                title="Auto-generate viral motion graphics & retention cues from transcript"
                data-testid="pro-quick-auto-motion"
              >
                ✨ Auto-Motion
              </button>
            )}
            {onToggleJCutAtPlayhead && (
              <button
                type="button"
                className={`pro-quick-btn ${hasActiveJCut ? "is-active" : ""}`}
                onClick={onToggleJCutAtPlayhead}
                title="J-Cut (0.8s): Dialogue pre-lap starts incoming audio before video cuts"
                data-testid="pro-quick-jcut"
                style={hasActiveJCut ? {
                  background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                  borderColor: "#22d3ee",
                  color: "#fff",
                  fontWeight: 600,
                } : undefined}
              >
                {hasActiveJCut ? "🎧 J-Cut Active" : "🎧 J-Cut (0.8s)"}
              </button>
            )}
            {onToggleLCutAtPlayhead && (
              <button
                type="button"
                className={`pro-quick-btn ${hasActiveLCut ? "is-active" : ""}`}
                onClick={onToggleLCutAtPlayhead}
                title="L-Cut (0.8s): Dialogue trail continues audio after video cuts away"
                data-testid="pro-quick-lcut"
                style={hasActiveLCut ? {
                  background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                  borderColor: "#a78bfa",
                  color: "#fff",
                  fontWeight: 600,
                } : undefined}
              >
                {hasActiveLCut ? "🎧 L-Cut Active" : "🎧 L-Cut (0.8s)"}
              </button>
            )}
            {musicBeatMarkers && musicBeatMarkers.length > 0 && onBeatSnappingChange && (
              <button
                type="button"
                className={`pro-quick-btn ${beatSnapping ? "is-active" : ""}`}
                onClick={() => onBeatSnappingChange(!beatSnapping)}
                title={`Magnetic Beat Snapping: Snap clips & cuts to ${musicBeatMarkers.length} music beats`}
                data-testid="pro-quick-beat-snap"
                style={beatSnapping ? {
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  borderColor: "#34d399",
                  color: "#fff",
                  fontWeight: 600,
                } : undefined}
              >
                {beatSnapping ? `🧲 Beats (${musicBeatMarkers.length})` : "🧲 Beat Snap"}
              </button>
            )}
            {musicBeatMarkers && musicBeatMarkers.length > 0 && onAlignCutsToBeat && (
              <button
                type="button"
                className="pro-quick-btn"
                onClick={onAlignCutsToBeat}
                title="Align sequence cuts to nearest musical beat transients"
                data-testid="pro-quick-align-beats"
              >
                🎵 Cut to Beat
              </button>
            )}
            {onToggleDirectorMode && (
              <button
                type="button"
                className={`pro-quick-btn is-director ${isDirectorModeActive ? "is-active" : ""}`}
                onClick={onToggleDirectorMode}
                title="Live Multicam Director Mode: Switch camera angles in real time using keys 1, 2, 3, 4"
                data-testid="pro-quick-director"
                style={{
                  background: isDirectorModeActive ? "linear-gradient(135deg, #ef4444, #dc2626)" : undefined,
                  borderColor: isDirectorModeActive ? "#f87171" : undefined,
                  color: isDirectorModeActive ? "#fff" : undefined,
                  fontWeight: 600,
                }}
              >
                {isDirectorModeActive ? "🔴 Director Live [1-4]" : "🎬 Director Mode"}
              </button>
            )}
            {onUndo && (
              <button
                type="button"
                className="pro-quick-btn"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo edit"
                data-testid="pro-quick-undo"
              >
                ↩ Undo
              </button>
            )}
            {onRedo && (
              <button
                type="button"
                className="pro-quick-btn"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo edit"
                data-testid="pro-quick-redo"
              >
                ↪ Redo
              </button>
            )}
          </div>
        )}
        <div className="pro-edit-tools" role="toolbar" aria-label="Timeline edit tools">
          {EDIT_TOOLS.map(([id, shortcut, label]) => (
            <button
              key={id}
              type="button"
              className={editTool === id ? "is-active" : ""}
              title={`${label} (${shortcut})`}
              aria-label={`${label} tool`}
              onClick={() => onEditToolChange(id)}
            >
              <span>{shortcut}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
        <div className="pro-timeline-switches">
          <button
            type="button"
            className={snapping ? "is-on" : ""}
            onClick={() => onSnappingChange(!snapping)}
          >
            ⌁ Snap
          </button>
          <button
            type="button"
            className={linkedSelection ? "is-on" : ""}
            onClick={() => onLinkedSelectionChange(!linkedSelection)}
          >
            ⛓ Linked
          </button>
          <button
            type="button"
            className={rippleMode ? "is-on" : ""}
            onClick={() => onRippleModeChange(!rippleMode)}
          >
            ⇥ Ripple
          </button>
          <label>
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={8}
              step={0.25}
              value={zoom}
              onChange={event => onZoomChange(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="pro-timeline-scroll">
        <div className="pro-timeline-content" style={{ width: visibleWidth }}>
          <div className="pro-time-ruler" onClick={onSeek} role="presentation">
            {Array.from({ length: 11 }, (_, index) => (
              <i key={index} style={{ left: `${index * 10}%` }}>
                <span>{((safeDuration * index) / 10).toFixed(1)}s</span>
              </i>
            ))}
            <b className="pro-playhead" style={{ left: percentAt(playhead, safeDuration) }} />
          </div>

          {TRACK_DEFINITIONS.map(([trackId, code, label, type]) => {
            const state = trackStates[trackId] || {};
            const items = clipsForTrack(trackId);
            const automation =
              trackId === "graphics" || trackId === "broll"
                ? motionKeyframes
                : trackId === "video"
                  ? speedKeyframes
                  : audioKeyframes?.[trackId];
            return (
              <div
                key={trackId}
                className={`pro-track-row is-${type} ${state.visible === false ? "is-hidden" : ""}`}
                style={
                  trackId === "adjustment" && items.length > 1
                    ? { "--pro-track-lanes": Math.min(items.length, 3) }
                    : undefined
                }
              >
                <div className="pro-track-header">
                  <span>{code}</span>
                  <strong>{label}</strong>
                  <TrackControls trackId={trackId} state={state} onChange={onTrackStateChange} />
                </div>
                <div className="pro-track-lane" onClick={onSeek} role="presentation">
                  <b className="pro-playhead" style={{ left: percentAt(playhead, safeDuration) }} />
                  {trackId === "music" && musicBeatMarkers && musicBeatMarkers.length > 0 && (
                    <div className="pro-beat-markers-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
                      {musicBeatMarkers.map((bm, bIdx) => {
                        const t = typeof bm === "number" ? bm : Number(bm?.time ?? 0);
                        const isDownbeat = typeof bm === "object" ? Boolean(bm?.isDownbeat) : bIdx % 4 === 0;
                        if (t < 0 || t > safeDuration) return null;
                        return (
                          <div
                            key={`beat-${bIdx}`}
                            className={`pro-beat-marker ${isDownbeat ? "is-downbeat" : ""}`}
                            style={{
                              position: "absolute",
                              left: percentAt(t, safeDuration),
                              top: isDownbeat ? 0 : "45%",
                              bottom: 0,
                              width: isDownbeat ? "2px" : "1px",
                              background: isDownbeat ? "#f59e0b" : "rgba(56, 189, 248, 0.55)",
                              boxShadow: isDownbeat ? "0 0 5px rgba(245, 158, 11, 0.7)" : undefined,
                            }}
                            title={`Beat ${bIdx + 1}: ${t.toFixed(2)}s${isDownbeat ? " (Downbeat)" : ""}`}
                          />
                        );
                      })}
                    </div>
                  )}
                  {items.map((item, index) => {
                    const start = Number(item.startTime ?? item.start ?? 0);
                    const itemDuration = Number(
                      item.duration ?? Math.max(0.1, Number(item.end || 0) - start)
                    );
                    const itemLabel =
                      item.name || item.text || item.label || `${label} ${index + 1}`;
                    if (trackId === "broll") {
                      return (
                        <BrollClip
                          key={item.id || `${trackId}-${index}`}
                          item={item}
                          index={index}
                          trackId={trackId}
                          start={start}
                          duration={itemDuration}
                          itemLabel={itemLabel}
                          safeDuration={safeDuration}
                          snapping={snapping}
                          snapTargets={snapTargets}
                          onOverlayMove={onOverlayMove}
                          onOverlayTrim={onOverlayTrim}
                          onOverlaySlip={onOverlaySlip}
                          onClick={event => {
                            event.stopPropagation();
                            if (trackId === "motion") onSelectMotion?.(item.id);
                            if (trackId === "graphics" || trackId === "broll")
                              onSelectOverlay?.(item.id);
                            onSelectTool?.(
                              trackId === "framing"
                                ? "reframe"
                                : trackId === "graphics"
                                ? "titles"
                                : trackId === "broll"
                                  ? "broll"
                                  : trackId === "music" ||
                                      trackId === "sfx" ||
                                      trackId === "voiceover" ||
                                      trackId === "originalAudio"
                                    ? "sound"
                                    : null
                            );
                            onSeek?.(event, start);
                          }}
                        />
                      );
                    }
                    if (trackId === "originalAudio") {
                      return (
                        <AudioSplitClip
                          key={item.id || `${trackId}-${index}`}
                          item={item}
                          index={index}
                          start={start}
                          duration={itemDuration}
                          itemLabel={itemLabel}
                          safeDuration={safeDuration}
                          snapping={snapping}
                          snapTargets={snapTargets}
                          onAudioTrim={onAudioTrim}
                          onClick={event => {
                            event.stopPropagation();
                            onSelectTool?.("sound");
                            onSeek?.(event, start);
                          }}
                        />
                      );
                    }
                    if (trackId === "motion" && !item.isPunch) {
                      return (
                        <MotionClip
                          key={item.id || `${trackId}-${index}`}
                          item={item}
                          index={index}
                          start={start}
                          duration={itemDuration}
                          itemLabel={itemLabel}
                          safeDuration={safeDuration}
                          snapping={snapping}
                          snapTargets={snapTargets}
                          onMotionMove={onMotionMove}
                          onMotionTrim={onMotionTrim}
                          onClick={event => {
                            event.stopPropagation();
                            onSelectMotion?.(item.id);
                            onSelectTool?.("motion");
                            onSeek?.(event, start);
                          }}
                        />
                      );
                    }
                    return (
                      <button
                        key={item.id || `${trackId}-${index}`}
                        type="button"
                        className={`pro-track-clip ${item.isPunch ? "pro-punch-clip" : ""}`}
                        data-testid={`pro-${trackId}-clip-${index + 1}`}
                        style={{
                          left: percentAt(start, safeDuration),
                          width: `${Math.max(1.2, (itemDuration / safeDuration) * 100)}%`,
                          ...(trackId === "adjustment" && items.length > 1
                            ? {
                                top: `${5 + (index % 3) * 23}px`,
                                bottom: "auto",
                                height: "19px",
                              }
                            : {}),
                          ...(item.isPunch
                            ? {
                                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(236, 72, 153, 0.45))",
                                borderColor: "rgba(236, 72, 153, 0.75)",
                                color: "#fdf2f8",
                              }
                            : {}),
                        }}
                        title={`${itemLabel} · ${start.toFixed(2)}s–${(start + itemDuration).toFixed(2)}s`}
                        onClick={event => {
                          event.stopPropagation();
                          if (trackId === "motion") {
                            onSelectMotion?.(item.id);
                            onSelectTool?.("motion");
                          }
                          if (trackId === "graphics" || trackId === "broll")
                            onSelectOverlay?.(item.id);
                          onSelectTool?.(
                            trackId === "framing"
                              ? "reframe"
                              : trackId === "graphics"
                                ? "titles"
                                : trackId === "broll"
                                  ? "broll"
                                  : trackId === "motion"
                                    ? "motion"
                                    : trackId === "music" ||
                                        trackId === "sfx" ||
                                        trackId === "voiceover" ||
                                        trackId === "originalAudio"
                                      ? "sound"
                                      : null
                          );
                          onSeek?.(event, start);
                        }}
                      >
                        <span>{itemLabel}</span>
                      </button>
                    );
                  })}
                  {trackId === "framing"
                    ? speakerFocusCuts.map(cut => (
                        <i
                          key={cut.id}
                          className="pro-framing-speaker-cut"
                          data-testid={`pro-speaker-order-${cut.id}`}
                          style={{ left: percentAt(cut.time, safeDuration) }}
                          title={`${cut.slot === "bottom" ? "Speaker 2" : "Speaker 1"} on top · ${Number(cut.time || 0).toFixed(2)}s`}
                        />
                      ))
                    : null}
                  {(trackId === "video" || trackId === "originalAudio") && silenceRegions && silenceRegions.length > 0
                    ? silenceRegions.map((zone, zIdx) => (
                        <div
                          key={`silence-zone-${zIdx}`}
                          className="pro-silence-zone-overlay"
                          data-testid={`pro-silence-zone-${zIdx}`}
                          style={{
                            left: percentAt(zone.timelineStart ?? zone.start, safeDuration),
                            width: `${Math.max(0.4, ((zone.duration || 0.1) / safeDuration) * 100)}%`,
                          }}
                          title={`Dead-air pause: ${Number(zone.duration || 0).toFixed(2)}s`}
                        />
                      ))
                    : null}
                  <AutomationDots items={automation} duration={safeDuration} type={trackId} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer>
        <span>{editTool} tool</span>
        <span>{snapping ? "Magnetic snapping" : "Free movement"}</span>
        <span>{linkedSelection ? "Audio/video linked" : "Audio/video independent"}</span>
        <strong>Timeline and preview share the same edit state</strong>
      </footer>
    </section>
  );
}
