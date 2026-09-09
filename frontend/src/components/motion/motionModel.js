// Versioned, deterministic motion contract. Times are edited-timeline seconds BEFORE speed.
// The worker evaluates the same pose and primitives after mapping export time back to this clock.
export const MOTION_PRESETS = [
  {
    id: "title",
    name: "Impact title",
    description: "A bold reveal with an expanding accent",
    cue: "impact",
  },
  {
    id: "kinetic",
    name: "Word cascade",
    description: "Words build into a complete statement",
    cue: "click",
  },
  {
    id: "counter",
    name: "Number reveal",
    description: "Count up to your own figure",
    cue: "riser",
  },
  {
    id: "comparison",
    name: "Versus card",
    description: "Two ideas, one animated comparison",
    cue: "sweep",
  },
  {
    id: "lower_third",
    name: "Speaker intro",
    description: "Name and role, introduced with a sweep",
    cue: "sweep",
  },
  {
    id: "callout",
    name: "Focus callout",
    description: "An animated pointer and label",
    cue: "pop",
  },
  {
    id: "watermark",
    name: "Moving brand",
    description: "Your handle travels between safe corners",
    cue: "none",
  },
];
export const MOTION_SOUNDS = [
  "none",
  "sweep",
  "impact",
  "pop",
  "click",
  "riser",
  "chime",
  "reverse",
  "glitch",
  "subdrop",
];
export const bound = (v, lo, hi, fallback = lo) =>
  Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback;
const clean = (v, n) =>
  String(v ?? "")
    // Remove control characters from creator-entered artwork.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>]/g, " ")
    .slice(0, n);
export const ease = (v, kind = "smooth") => {
  const t = bound(v, 0, 1);
  if (kind === "linear") return t;
  if (kind === "punch") return 1 - Math.pow(1 - t, 4);
  return t * t * (3 - 2 * t);
};
export function normalizeMotion(s = {}) {
  const preset = MOTION_PRESETS.find(p => p.id === s.preset)?.id || "title";
  return {
    id: clean(s.id, 100),
    preset,
    text: clean(s.text, 96),
    secondary: clean(s.secondary, 96),
    prefix: clean(s.prefix, 8),
    value: bound(s.value, -9999999, 9999999, 100),
    startTime: bound(s.startTime, 0, 86400),
    duration: bound(s.duration, 0.5, 60, 4),
    x: bound(s.x, 5, 95, 50),
    y: bound(s.y, 5, 95, 50),
    endX: bound(s.endX ?? s.x, 5, 95, 50),
    endY: bound(s.endY ?? s.y, 5, 95, 50),
    scale: bound(s.scale, 0.3, 1.4, 1),
    endScale: bound(s.endScale ?? s.scale, 0.3, 1.4, 1),
    rotation: bound(s.rotation, -45, 45, 0),
    endRotation: bound(s.endRotation ?? s.rotation, -45, 45, 0),
    opacity: bound(s.opacity, 0, 1, 1),
    color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#a78bfa",
    easing: ["smooth", "linear", "punch"].includes(s.easing) ? s.easing : "smooth",
    sound: MOTION_SOUNDS.includes(s.sound) ? s.sound : "none",
    soundOffset: bound(s.soundOffset, 0, 59, 0),
    soundVolume: bound(s.soundVolume, 0, 1, 0.45),
    enabled: s.enabled !== false,
  };
}
export function createMotion(preset, startTime, id, scenes = []) {
  const p = MOTION_PRESETS.find(item => item.id === preset) || MOTION_PRESETS[0];
  const occupied = scenes.filter(
    s => startTime < s.startTime + s.duration && startTime + 4 > s.startTime
  );
  const rows = [48, 24, 72];
  const y =
    preset === "lower_third"
      ? 72
      : preset === "watermark"
        ? 15
        : rows[occupied.length % rows.length];
  return normalizeMotion({
    id,
    preset: p.id,
    startTime,
    duration: preset === "watermark" ? 12 : 4,
    text:
      preset === "watermark"
        ? "@yourhandle"
        : preset === "lower_third"
          ? "SPEAKER NAME"
          : preset === "comparison"
            ? "BEFORE"
            : preset === "counter"
              ? "YOUR MILESTONE"
              : "MAKE THIS MOMENT MATTER",
    secondary:
      preset === "lower_third"
        ? "Role / podcast"
        : preset === "comparison"
          ? "AFTER"
          : "YOUR STORY. YOUR WORDS.",
    value: 100,
    x: 50,
    y,
    endX: 50,
    endY: y,
    scale: 1,
    endScale: 1,
    sound: p.cue,
  });
}
export function motionPose(raw, time, width = 1000, height = 1778) {
  const s = normalizeMotion(raw),
    local = time - s.startTime;
  if (!s.enabled || local < 0 || local >= s.duration) return null;
  const progress = ease(local / s.duration, s.easing);
  const enter = ease(local / Math.min(0.45, s.duration / 3), "punch");
  const exit = ease((s.duration - local) / Math.min(0.3, s.duration / 3));
  let x = s.x + (s.endX - s.x) * progress,
    y = s.y + (s.endY - s.y) * progress;
  let fit = 1;
  if (s.preset === "watermark") {
    // Bound the visible brand (including rotation) in the actual video aspect ratio.
    // Artwork extends +/-180 horizontally and at most 38 vertically from its pivot.
    const angle = (Math.max(Math.abs(s.rotation), Math.abs(s.endRotation)) * Math.PI) / 180;
    const xAngle = Math.min(angle, Math.atan2(38, 180));
    const extentX = 180 * Math.cos(xAngle) + 38 * Math.sin(xAngle);
    const extentY = 180 * Math.sin(angle) + 38 * Math.cos(angle);
    const maxScale = 1.35 * Math.max(s.scale, s.endScale);
    const halfX = (extentX * maxScale) / 10;
    const halfY = (extentY * maxScale * width) / (10 * height);
    // Leave 3% edge padding plus room for the 3% entrance movement.
    fit = Math.min(1, 47 / halfX, 44 / halfY);
    const safeX = 3 + halfX * fit;
    const safeY = 6 + halfY * fit;
    const corners = [
      [safeX, safeY],
      [100 - safeX, safeY],
      [100 - safeX, 100 - safeY],
      [safeX, 100 - safeY],
      [safeX, safeY],
    ];
    const phase = (local / s.duration) * 4,
      i = Math.min(3, Math.floor(phase));
    const f = ease((phase - i - 0.65) / 0.35);
    x = corners[i][0] + (corners[i + 1][0] - corners[i][0]) * f;
    y = corners[i][1] + (corners[i + 1][1] - corners[i][1]) * f;
  }
  return {
    x,
    y: y + (1 - enter) * 3,
    scale: (s.scale + (s.endScale - s.scale) * progress) * (0.92 + 0.08 * enter) * fit,
    rotation: s.rotation + (s.endRotation - s.rotation) * progress,
    opacity: s.opacity * enter * exit,
    reveal: enter,
    count: ease(local / Math.min(1.5, s.duration * 0.65), "smooth"),
    words: Math.min(16, 1 + Math.floor(local / Math.min(0.18, s.duration / 20))),
  };
}
// All artwork occupies a 600 × 260 card. Fixed character wrapping is shared with the worker.
export function motionPrimitives(raw, pose) {
  const s = normalizeMotion(raw),
    a = [],
    color = s.color,
    ink = "#f8fafc",
    dark = "#101526";
  const rect = (x, y, w, h, fill) => a.push({ kind: "rect", x, y, w, h, fill });
  const text = (value, x, y, size, fill = ink, maxWidth = 568 - x) =>
    a.push({ kind: "text", text: value, x, y, size, fill, maxWidth });
  const wrap = (value, max = 23) => {
    const lines = [];
    let line = "";
    for (const word of value.split(/\s+/)) {
      if ((line + " " + word).trim().length > max && line) {
        lines.push(line);
        line = "";
      }
      line = (line + " " + word).trim();
    }
    if (line) lines.push(line);
    return lines.slice(0, 3).map(l => (l.length > max ? l.slice(0, max - 1) + "…" : l));
  };
  const title = (value, x = 32, y = 48, size = 32) =>
    wrap(value).forEach((line, i) => text(line, x, y + i * (size + 8), size));
  if (s.preset === "watermark") {
    rect(120, 92, 360, 66, dark);
    rect(120, 92, 7, 66, color);
    text(s.text.slice(0, 22), 140, 111, 23, ink, 320);
    return a;
  }
  if (s.preset === "comparison") {
    rect(0, 28, 284, 206, dark);
    rect(316, 28, 284, 206, dark);
    rect(0, 28, 284 * pose.reveal, 6, color);
    rect(316, 228, 284 * pose.reveal, 6, color);
    wrap(s.text, 12).forEach((l, i) => text(l, 20, 74 + i * 38, 28, ink, 244));
    wrap(s.secondary, 12).forEach((l, i) => text(l, 336, 74 + i * 38, 28, ink, 244));
    rect(275, 110, 50, 38, color);
    text("VS", 280, 118, 20, dark);
    return a;
  }
  if (s.preset === "callout") {
    rect(92, 20, 508, 180, dark);
    rect(92, 20, 6, 180, color);
    title(s.text, 115, 44, 28);
    rect(26, 195, 4, 44, color);
    rect(26, 195, 68 * pose.reveal, 4, color);
    a.push({ kind: "circle", x: 28, y: 239, r: 10, fill: color });
    return a;
  }
  rect(0, 20, 600, 220, dark);
  rect(0, 20, 8, 220, color);
  if (s.preset === "counter") {
    text(s.prefix + Math.round(s.value * pose.count), 30, 45, 68, color);
    text(s.text.slice(0, 30), 32, 153, 24);
    rect(32, 203, 536 * pose.count, 8, color);
  } else if (s.preset === "lower_third") {
    rect(8, 20, 592 * pose.reveal, 7, color);
    title(s.text, 32, 55, 32);
    text(s.secondary.slice(0, 34), 32, 192, 20, color);
  } else {
    const copy =
      s.preset === "kinetic" ? s.text.split(/\s+/).slice(0, pose.words).join(" ") : s.text;
    title(copy);
    rect(32, 190, 536 * pose.reveal, 6, color);
    text(s.secondary.slice(0, 36), 32, 212, 16, color);
  }
  return a;
}
export function motionCues(scenes) {
  return scenes
    .map(normalizeMotion)
    .filter(s => s.enabled && s.sound !== "none" && s.soundOffset < s.duration)
    .map(s => ({
      id: `motion-sfx-${s.id}`,
      name: `${MOTION_PRESETS.find(p => p.id === s.preset).name} · ${s.sound}`,
      emoji: "◆",
      builtIn: true,
      tone: s.sound,
      startTime: s.startTime + s.soundOffset,
      duration: Math.min(
        s.duration - s.soundOffset,
        s.sound === "riser" ? 1.5 : s.sound === "click" ? 0.16 : 0.7
      ),
      volume: s.soundVolume,
      fadeIn: 0.015,
      fadeOut: 0.12,
      enabled: true,
      trimStart: 0,
    }));
}
export function cutMotion(scenes, from, to) {
  const map = t => (t <= from ? t : t >= to ? t - (to - from) : from);
  return scenes.flatMap(s => {
    const start = map(s.startTime),
      end = map(s.startTime + s.duration);
    if (end - start < 0.5) return [];
    return [
      {
        ...s,
        startTime: start,
        duration: end - start,
        soundOffset: Math.max(0, map(s.startTime + s.soundOffset) - start),
      },
    ];
  });
}
