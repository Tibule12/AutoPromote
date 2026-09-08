import React, { useState } from "react";
import {
  MOTION_PRESETS,
  MOTION_SOUNDS,
  createMotion,
  normalizeMotion,
  motionCues,
} from "./motionModel";
import { createSecureId } from "../../utils/security";
import "./motion.css";
import SoundWaveform from "./SoundWaveform";

export default function MotionPanel({
  scenes,
  onChange,
  playhead,
  duration,
  onSeek,
  transcript = [],
  focusId,
  onSelect,
}) {
  const [localSelected, setLocalSelected] = useState(null);
  const selected = focusId ?? localSelected;
  const setSelected = id => {
    setLocalSelected(id);
    onSelect?.(id);
  };
  const active = scenes.find(s => s.id === selected) || scenes[scenes.length - 1];
  const patch = values =>
    onChange(scenes.map(s => (s.id === active?.id ? normalizeMotion({ ...s, ...values }) : s)));
  const add = preset => {
    if (scenes.length >= 24) return;
    const start = Math.min(Math.max(0, duration - 0.5), playhead);
    const s = createMotion(preset, start, createSecureId("motion"), scenes);
    s.duration = Math.min(s.duration, Math.max(0.5, duration - start));
    onChange([...scenes, s]);
    setSelected(s.id);
    onSeek(s.startTime);
  };
  const field = (label, key, min, max, step = 0.1) => (
    <label key={key}>
      {label}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={active[key]}
        onChange={e => patch({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="clip-inspector-body motion-panel" role="tabpanel">
      <span className="panel-kicker">Motion + sound</span>
      <h4>Direct this moment</h4>
      <p>Build a visual beat. Its sound stays attached when you move or duplicate it.</p>
      <div className="motion-preset-grid">
        {MOTION_PRESETS.map(p => (
          <button
            type="button"
            key={p.id}
            onClick={() => add(p.id)}
            disabled={scenes.length >= 24}
            aria-label={`Add ${p.name}`}
          >
            <strong>{p.name}</strong>
            <small>{p.description}</small>
          </button>
        ))}
      </div>
      <div className="motion-scene-list" aria-label="Motion scenes">
        {scenes.map(s => (
          <button
            type="button"
            key={s.id}
            aria-pressed={active?.id === s.id}
            onClick={() => {
              setSelected(s.id);
              onSeek(s.startTime);
            }}
          >
            {MOTION_PRESETS.find(p => p.id === s.preset)?.name} · {s.startTime.toFixed(1)}s
          </button>
        ))}
      </div>
      {active ? (
        <section className="motion-editor" aria-label="Selected motion scene">
          <label>
            Headline
            <input
              aria-label="Motion headline"
              maxLength={96}
              value={active.text}
              onChange={e => patch({ text: e.target.value })}
            />
          </label>
          <label>
            Supporting text
            <input
              aria-label="Motion supporting text"
              maxLength={96}
              value={active.secondary}
              onChange={e => patch({ secondary: e.target.value })}
            />
          </label>
          {transcript.length > 0 ? (
            <label>
              Use a transcript line
              <select
                aria-label="Motion transcript line"
                value=""
                onChange={e => {
                  const line = transcript[Number(e.target.value)];
                  if (line) patch({ text: line.text });
                }}
              >
                <option value="">Choose wording</option>
                {transcript.map((s, i) => (
                  <option key={s.id || i} value={i}>
                    {s.text}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {active.preset === "counter" ? (
            <div className="motion-fields">
              {field("Target number", "value", -9999999, 9999999, 1)}
              <label>
                Prefix
                <input
                  aria-label="Number prefix"
                  value={active.prefix}
                  maxLength={8}
                  onChange={e => patch({ prefix: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          <div className="motion-fields">
            {field("Motion start", "startTime", 0, Math.max(0, duration - 0.5))}
            {field("Motion duration", "duration", 0.5, 60)}
          </div>
          {active.startTime + active.duration > duration ? (
            <p role="status">
              This scene extends beyond the video. Only the portion inside the video will export.
            </p>
          ) : null}
          <div className="motion-fields">
            <label>
              Accent
              <input
                type="color"
                aria-label="Motion accent"
                value={active.color}
                onChange={e => patch({ color: e.target.value })}
              />
            </label>
            {field("Motion opacity", "opacity", 0, 1, 0.05)}
          </div>
          <details open>
            <summary>Position keyframes</summary>
            <p>
              {active.preset === "watermark"
                ? "Moving brand uses a corner path. Size, rotation and opacity remain editable."
                : "Start and end positions interpolate over the scene. Positions are percentages of the canvas."}
            </p>
            <div className="motion-fields">
              {field("Start X", "x", 5, 95, 1)}
              {field("Start Y", "y", 5, 95, 1)}
              {field("End X", "endX", 5, 95, 1)}
              {field("End Y", "endY", 5, 95, 1)}
              {field("Start scale", "scale", 0.3, 1.4, 0.05)}
              {field("End scale", "endScale", 0.3, 1.4, 0.05)}
              {field("Start rotation", "rotation", -45, 45, 1)}
              {field("End rotation", "endRotation", -45, 45, 1)}
            </div>
            <label>
              Movement
              <select
                aria-label="Motion easing"
                value={active.easing}
                onChange={e => patch({ easing: e.target.value })}
              >
                <option value="smooth">Smooth ease</option>
                <option value="punch">Fast punch</option>
                <option value="linear">Constant speed</option>
              </select>
            </label>
          </details>
          <fieldset>
            <legend>Linked sound cue</legend>
            <label>
              Sound
              <select
                aria-label="Motion sound"
                value={active.sound}
                onChange={e => patch({ sound: e.target.value })}
              >
                {MOTION_SOUNDS.map(s => (
                  <option key={s} value={s}>
                    {s === "none" ? "No sound" : s}
                  </option>
                ))}
              </select>
            </label>
            <div className="motion-fields">
              {field("Cue delay", "soundOffset", 0, Math.max(0, active.duration - 0.05))}
              {field("Cue volume", "soundVolume", 0, 1, 0.05)}
            </div>
          </fieldset>
          {motionCues([active])[0] ? (
            <SoundWaveform effect={motionCues([active])[0]} playhead={playhead} onSeek={onSeek} />
          ) : null}
          <div className="motion-actions">
            <button type="button" onClick={() => onSeek(active.startTime, true)}>
              Play motion + sound
            </button>
            <button
              type="button"
              disabled={scenes.length >= 24}
              onClick={() => {
                const copy = {
                  ...active,
                  id: createSecureId("motion"),
                  startTime: Math.min(
                    Math.max(0, duration - 0.5),
                    active.startTime + active.duration
                  ),
                };
                onChange([...scenes, copy]);
                setSelected(copy.id);
              }}
            >
              Duplicate scene
            </button>
            <button type="button" onClick={() => onChange(scenes.filter(s => s.id !== active.id))}>
              Remove scene
            </button>
          </div>
        </section>
      ) : (
        <p>Choose a design to place it at the playhead.</p>
      )}
    </div>
  );
}
