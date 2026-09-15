// Versioned, deterministic motion contract. Times are edited-timeline seconds BEFORE speed.
// The worker evaluates the same pose and primitives after mapping export time back to this clock.
export const MOTION_PRESETS = [
  {
    id: "brand_reveal",
    name: "AutoPromote launch ident",
    description: "A cinematic logo build with orbit energy and a precision wordmark reveal",
    cue: "impact",
    category: "social",
  },
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
    category: "hooks",
  },
  {
    id: "badge",
    name: "Viral hook badge",
    description: "Attention pill for opening hook statements",
    cue: "pop",
    category: "hooks",
  },
  {
    id: "progress",
    name: "Retention timer",
    description: "Progress line keeping viewers watching to the end",
    cue: "sweep",
    category: "retention",
  },
  {
    id: "quote",
    name: "Social quote card",
    description: "Verified creator quote & testimonial badge",
    cue: "pop",
    category: "social",
  },
  {
    id: "cta",
    name: "Subscribe CTA",
    description: "Call to action with notification bell",
    cue: "chime",
    category: "social",
  },
  {
    id: "watermark",
    name: "Moving brand",
    description: "Your handle glides between two safe positions",
    cue: "none",
    category: "social",
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
  let t = bound(v, 0, 1);
  if (kind === "linear") return t;
  if (kind === "punch") {
    const s = 1.70158;
    t -= 1;
    return t * t * ((s + 1) * t + s) + 1;
  }
  if (kind === "spring") {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }
  return t * t * (3 - 2 * t);
};
export function normalizeMotion(s = {}) {
  const preset = MOTION_PRESETS.find(p => p.id === s.preset)?.id || "title";
  return {
    id: clean(s.id, 100),
    preset,
    design: s.design === "editorial" ? "editorial" : "card",
    canvasMode:
      s.canvasMode === "standalone" || (s.canvasMode == null && preset === "brand_reveal")
        ? "standalone"
        : "overlay",
    canvasColor: /^#[0-9a-f]{6}$/i.test(s.canvasColor) ? s.canvasColor : "#050713",
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
    easing: ["smooth", "linear", "punch", "spring"].includes(s.easing) ? s.easing : "smooth",
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
    preset === "lower_third" || preset === "cta"
      ? 72
      : preset === "progress"
        ? 88
        : preset === "watermark" || preset === "badge"
          ? 18
          : rows[occupied.length % rows.length];
  return normalizeMotion({
    id,
    preset: p.id,
    design: "editorial",
    canvasMode: preset === "brand_reveal" ? "standalone" : "overlay",
    canvasColor: "#050713",
    startTime,
    duration:
      preset === "brand_reveal"
        ? 6
        : preset === "watermark"
        ? 12
        : preset === "progress"
          ? 6
          : preset === "badge" || preset === "cta"
            ? 3.5
            : preset === "quote"
              ? 4.5
              : 4,
    text:
      preset === "brand_reveal"
        ? "AutoPromote"
        : preset === "watermark"
        ? "@yourhandle"
        : preset === "badge"
          ? "WAIT FOR IT..."
          : preset === "progress"
            ? "WATCH TO THE END"
            : preset === "quote"
              ? "The best time to start was yesterday. The next best time is now."
              : preset === "cta"
                ? "SUBSCRIBE & FOLLOW"
                : preset === "lower_third"
                  ? "SPEAKER NAME"
                  : preset === "comparison"
                    ? "BEFORE"
                    : preset === "counter"
                      ? "YOUR MILESTONE"
                      : "MAKE THIS MOMENT MATTER",
    secondary:
      preset === "brand_reveal"
        ? "CREATE · AMPLIFY · DOMINATE"
        : preset === "badge"
        ? "UNPOPULAR OPINION ⚠️"
        : preset === "progress"
          ? "CHAPTER 1"
          : preset === "quote"
            ? "@creator • Verified"
            : preset === "cta"
              ? "Turn on notifications 🔔"
              : preset === "lower_third"
                ? "Role / podcast"
                : preset === "comparison"
                  ? "AFTER"
                  : "YOUR STORY. YOUR WORDS.",
    color:
      preset === "brand_reveal"
        ? "#8b5cf6"
        : preset === "badge"
        ? "#f59e0b"
        : preset === "progress"
          ? "#10b981"
          : preset === "quote"
            ? "#38bdf8"
            : preset === "cta"
              ? "#ec4899"
              : "#a78bfa",
    value: 100,
    x: preset === "watermark" ? 16 : 50,
    y,
    endX: preset === "watermark" ? 84 : 50,
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
    // A moving brand is a signature bug, not a title card. Keep its authored
    // scale deliberately smaller so corner travel never dominates the subject.
    const maxScale = 1.35 * 0.5 * Math.max(s.scale, s.endScale);
    const halfX = (extentX * maxScale) / 10;
    const halfY = (extentY * maxScale * width) / (10 * height);
    // Clamp creator-authored start/end placement against a 4% action-safe
    // inset, including the entrance travel.
    fit = Math.min(1, 45 / halfX, 42 / halfY);
    const safeHalfX = halfX * fit;
    const safeHalfY = halfY * fit;
    x = bound(x, 4 + safeHalfX, 96 - safeHalfX, 50);
    y = bound(y + (1 - enter) * 3, 4 + safeHalfY, 96 - safeHalfY, 50);
  } else {
    // All presets share a 600 x 260 authoring card. Fit and clamp the rotated
    // card against a 4% action-safe inset using the actual delivery aspect.
    const rotation = s.rotation + (s.endRotation - s.rotation) * progress;
    const angle = (Math.abs(rotation) * Math.PI) / 180;
    const authoredScale =
      (s.scale + (s.endScale - s.scale) * progress) * (0.92 + 0.08 * enter) * 1.35;
    const halfX = ((300 * Math.cos(angle) + 130 * Math.sin(angle)) * authoredScale) / 10;
    const halfY =
      ((300 * Math.sin(angle) + 130 * Math.cos(angle)) * authoredScale * width) /
      (10 * height);
    fit = Math.min(1, 46 / Math.max(0.001, halfX), 46 / Math.max(0.001, halfY));
    const safeHalfX = halfX * fit;
    const safeHalfY = halfY * fit;
    x = bound(x, 4 + safeHalfX, 96 - safeHalfX, 50);
    // The entrance animation travels down by up to 3%, so include it before
    // clamping instead of allowing the first frames to cross the safe edge.
    y = bound(y + (1 - enter) * 3, 4 + safeHalfY, 96 - safeHalfY, 50);
  }
  return {
    x,
    y,
    scale:
      (s.scale + (s.endScale - s.scale) * progress) *
      (0.92 + 0.08 * enter) *
      (s.preset === "watermark" ? 0.5 : 1) *
      fit,
    rotation: s.rotation + (s.endRotation - s.rotation) * progress,
    opacity: s.opacity * enter * exit,
    progress: bound(local / s.duration, 0, 1),
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
  const rect = (x, y, w, h, fill, radius = 0) =>
    a.push({ kind: "rect", x, y, w, h, fill, radius });
  const text = (value, x, y, size, fill = ink, maxWidth = 568 - x, weight = "bold") =>
    a.push({ kind: "text", text: value, x, y, size, fill, maxWidth, weight });
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const stage = (value, start, end) => ease(clamp01((value - start) / (end - start)), "smooth");
  const alpha = (hex, opacity) =>
    `${hex.slice(0, 7)}${Math.round(clamp01(opacity) * 255).toString(16).padStart(2, "0")}`;
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
  if (s.preset === "brand_reveal") {
    const p = pose.progress;
    const launch = stage(p, 0.01, 0.18);
    const orbit = stage(p, 0.08, 0.3);
    const tile = stage(p, 0.16, 0.36);
    const leftStroke = stage(p, 0.23, 0.39);
    const rightStroke = stage(p, 0.27, 0.43);
    const crossbar = stage(p, 0.36, 0.48);
    const auto = ease(clamp01((p - 0.35) / 0.2), "spring");
    const promote = ease(clamp01((p - 0.43) / 0.2), "spring");
    const resolve = stage(p, 0.55, 0.72);
    const impact = Math.max(0, Math.sin(Math.PI * stage(p, 0.3, 0.56)));
    const centerX = 122;
    const tileSize = 108 * tile;
    const tileX = centerX - tileSize / 2;
    const tileY = 130 - tileSize / 2;
    const wordX = 205 + 42 * (1 - auto);

    // A spark becomes momentum: layered trails accelerate into the logo's core.
    a.push({ kind: "circle", x: centerX, y: 130, r: 4 + 1.8 * launch,
      fill: alpha("#ffffff", Math.max(0.8, launch * (1 - resolve))) });
    [0, 1, 2, 3, 4].forEach(index => {
      const head = -70 + launch * (190 + index * 8);
      a.push({ kind: "line", x1: head - 90 - index * 15, y1: 130 + (index - 2) * 13,
        x2: head, y2: 130 + (index - 2) * 4, width: 1 + index * 0.65,
        fill: alpha(index % 2 ? "#38bdf8" : "#8b5cf6", (0.18 + index * 0.1) * (1 - tile * 0.72)) });
    });
    a.push({ kind: "circle", x: -15 + launch * 137, y: 130, r: 3 + 5 * impact,
      fill: alpha("#ffffff", launch * (1 - resolve * 0.7)) });

    // Orbital energy bends around the impact point, then settles behind the mark.
    [76, 62, 49].forEach((radius, index) =>
      a.push({ kind: "stroke_circle", x: centerX, y: 130,
        r: radius + (1 - orbit) * (24 + index * 9) + impact * (5 - index),
        width: index === 1 ? 2.4 : 1.1,
        fill: alpha(index === 1 ? "#38bdf8" : "#8b5cf6", orbit * (0.42 - index * 0.07) * (1 - resolve * 0.38)) })
    );
    [-1, 1].forEach(direction =>
      a.push({ kind: "line", x1: centerX, y1: 130,
        x2: centerX + direction * (72 + 22 * impact), y2: 130,
        width: 1, fill: alpha("#ffffff", 0.2 * orbit * (1 - resolve)) })
    );

    // Motion-blurred tile echoes arrive first; the final purple/cyan body locks in.
    [3, 2, 1].forEach((echo, index) => {
      const offset = echo * (1 - tile) * 34;
      rect(tileX - offset, tileY, tileSize, tileSize,
        alpha(index === 1 ? "#38bdf8" : "#7c3aed", tile * (0.06 + index * 0.045)), 24 * tile);
    });
    rect(tileX - 8, tileY - 8, tileSize + 16, tileSize + 16,
      alpha("#8b5cf6", 0.11 * tile + impact * 0.08), 30 * tile);
    rect(tileX, tileY, tileSize, tileSize, alpha("#6d28d9", tile), 24 * tile);
    if (tileSize > 0) {
      a.push({ kind: "polygon", points: [
        [tileX + tileSize * 0.64, tileY], [tileX + tileSize, tileY],
        [tileX + tileSize, tileY + tileSize], [tileX + tileSize * 0.76, tileY + tileSize],
      ], fill: alpha("#0ea5e9", 0.9 * tile) });
    }

    // The A is constructed from three independent strokes—no font glyph shortcut.
    const baseY = 169;
    const topYLeft = baseY - 73 * leftStroke;
    const topYRight = baseY - 73 * rightStroke;
    a.push({ kind: "polygon", points: [[82, baseY], [100, baseY], [126, topYLeft], [111, topYLeft]],
      fill: alpha("#ffffff", leftStroke) });
    a.push({ kind: "polygon", points: [[126, topYRight], [141, topYRight], [166, baseY], [148, baseY]],
      fill: alpha("#ffffff", rightStroke) });
    rect(101, 143, 53 * crossbar, 11, alpha("#ffffff", crossbar), 3);
    rect(151, 98, 4, 63 * crossbar, alpha("#67e8f9", 0.8 * crossbar), 2);
    a.push({ kind: "circle", x: 157, y: 81, r: 3 + 3 * impact,
      fill: alpha("#ffffff", tile) });

    // The wordmark follows the physical impact with overshoot and stagger.
    text("Auto", wordX, 88 - 8 * (1 - auto), 50, alpha("#f8fafc", clamp01(auto)), 126);
    text("Promote", wordX + 119, 88 - 8 * (1 - promote), 50,
      alpha("#a78bfa", clamp01(promote)), 246);
    const rule = 344 * resolve;
    rect(wordX + 2, 148, rule, 3, alpha("#38bdf8", resolve), 2);
    rect(wordX + 2, 148, rule * 0.62, 3, alpha("#8b5cf6", resolve), 2);
    a.push({ kind: "circle", x: wordX + 2 + rule, y: 149.5, r: 2 + 2.5 * impact,
      fill: alpha("#ffffff", resolve) });
    text(s.secondary || "CREATE · AMPLIFY · DOMINATE", wordX + 2, 165, 15,
      alpha("#cbd5e1", resolve), 344, "normal");

    // Sparse finishing particles give the lock-up air without turning it into UI chrome.
    [[42, 72], [184, 58], [187, 204], [527, 89], [555, 178]].forEach((point, index) =>
      a.push({ kind: "circle", x: point[0] + impact * (index - 2) * 3,
        y: point[1], r: 0.8 + (index % 2), fill: alpha(index % 2 ? "#38bdf8" : "#8b5cf6", 0.45 * orbit) })
    );
    a.push({ kind: "circle", x: centerX, y: 130, r: 4 + 1.8 * launch,
      fill: alpha("#ffffff", 0.8 * (1 - tile)) });
    return a;
  }
  if (s.design === "editorial" && ["title", "kinetic", "lower_third"].includes(s.preset)) {
    if (s.preset === "lower_third") {
      rect(0, 66, 600, 134, "#101526e8");
      rect(0, 66, 5, 134, color);
      const names = wrap(s.text, 26).slice(0, 2);
      names.forEach((line, i) => text(line, 26, 80+i*43, 38, ink, 548));
      text(s.secondary, 26, names.length > 1 ? 172 : 141, 24, color, 548);
      rect(26, 191, 82*Math.min(1, pose.reveal), 3, color);
    } else {
      const words = s.text.split(/\s+/), lines = [];
      let line = "";
      for (const word of words) {
        if ((line+" "+word).trim().length > 22 && line) { lines.push(line); line = ""; }
        line = (line+" "+word).trim();
      }
      if (line) lines.push(line);
      const size = Math.min(68, Math.floor(178/Math.max(1, lines.length))-8);
      let remaining = s.preset === "kinetic" ? pose.words : words.length;
      lines.forEach((full, i) => {
        const parts = full.split(/\s+/), copy = parts.slice(0, Math.max(0, remaining)).join(" ");
        remaining -= parts.length;
        if (copy) {
          text(copy, 28, 22+i*(size+8), size, "#101526", 548);
          text(copy, 26, 20+i*(size+8), size, ink, 548);
        }
      });
      rect(26, 207, 90*Math.min(1, pose.reveal), 5, color);
      text(s.secondary, 26, 223, 24, ink, 548);
    }
    return a;
  }
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
  if (s.preset === "badge") {
    rect(40, 70, 520, 110, dark);
    rect(40, 70, 8, 110, color);
    rect(40, 175, 520 * Math.min(1, pose.reveal), 5, color);
    title(s.text, 68, 92, 28);
    text(s.secondary.slice(0, 36), 68, 148, 20, color);
    return a;
  }
  if (s.preset === "progress") {
    rect(20, 90, 560, 80, dark);
    rect(20, 90, 6, 80, color);
    rect(20, 164, 560 * pose.count, 6, color);
    text(s.text.slice(0, 26), 42, 115, 24);
    text(Math.round(pose.count * 100) + "%", 490, 115, 24, color, 80);
    return a;
  }
  if (s.preset === "quote") {
    rect(10, 30, 580, 200, dark);
    rect(10, 30, 6, 200, color);
    a.push({ kind: "circle", x: 48, y: 64, r: 18, fill: color });
    text(s.secondary.slice(0, 30), 80, 52, 22, color, 480);
    wrap(s.text, 26).forEach((l, i) => text(l, 35, 102 + i * 36, 26, ink, 530));
    rect(10, 224, 580 * Math.min(1, pose.reveal), 6, color);
    return a;
  }
  if (s.preset === "cta") {
    rect(40, 65, 520, 125, dark);
    rect(40, 65, 520, 6, color);
    a.push({ kind: "circle", x: 92, y: 126, r: 24, fill: color });
    text(s.text.slice(0, 22), 136, 88, 30, ink, 410);
    text(s.secondary.slice(0, 30), 136, 134, 20, color, 410);
    rect(40, 184, 520 * Math.min(1, pose.reveal), 6, color);
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

/**
 * AI Transcript-Grounded Smart Motion Beats Generator
 * Automatically analyzes transcript sentences and places high-retention viral motion graphics
 * (Hook badge, statistic counters, emphatic callouts, and outro CTAs).
 */
export function generateSmartMotionBeats({ transcript = [], duration = 30, existingScenes = [] } = {}) {
  const makeId = (prefix = "motion") =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const scenes = [];
  const maxScenes = 6;
  const occupiedRanges = (existingScenes || []).map(s => ({
    start: Number(s.startTime || 0),
    end: Number(s.startTime || 0) + Number(s.duration || 4),
  }));

  const isSlotFree = (start, dur) => {
    const end = start + dur;
    return !occupiedRanges.some(r => Math.max(start, r.start) < Math.min(end, r.end));
  };

  const registerSlot = (start, dur) => {
    occupiedRanges.push({ start, end: start + dur });
  };

  const safeDuration = Math.max(1, Number(duration || 30));

  // 1. Opening Viral Hook Badge (first 0 - 2.5s)
  if (safeDuration >= 4 && isSlotFree(0.2, 2.5)) {
    const firstLine = transcript[0]?.text || "MAKE THIS MOMENT MATTER";
    const hookWords = firstLine.split(/\s+/).slice(0, 4).join(" ").toUpperCase();
    const hook = createMotion("badge", 0.2, makeId("motion-hook"), existingScenes);
    hook.text = hookWords || "WAIT FOR THE END";
    hook.secondary = "STOP SCROLLING ⚠️";
    hook.duration = Math.min(2.5, Math.max(1.5, safeDuration / 8));
    hook.color = "#f59e0b";
    scenes.push(hook);
    registerSlot(0.2, hook.duration);
  }

  // 2. Scan transcript for numbers/statistics -> Counter reveal
  const numberRegex = /\b(\$?\d+(?:,\d{3})*(?:\.\d+)?%?|\d+k|\d+m)\b/i;
  for (let i = 1; i < transcript.length && scenes.length < maxScenes; i++) {
    const line = transcript[i];
    const match = line.text?.match(numberRegex);
    if (match) {
      const segStart = Number(line.start || 0);
      const lastEnd = occupiedRanges[occupiedRanges.length - 1]?.end || 0;
      const targetStart = Math.max(segStart, lastEnd + 0.15);
      if (targetStart > 1.5 && targetStart + 3.0 < safeDuration - 2.5 && isSlotFree(targetStart, 3.0)) {
        const rawNumStr = match[0].replace(/[$,%kKmMsS]/g, "");
        const numVal = parseFloat(rawNumStr) || 100;
        const prefix = match[0].startsWith("$") ? "$" : "";
        const counter = createMotion("counter", targetStart, makeId("motion-stat"), existingScenes);
        counter.value = numVal;
        counter.prefix = prefix;
        counter.text = (line.text || "KEY METRIC").slice(0, 30).toUpperCase();
        counter.duration = 3.0;
        counter.color = "#8b5cf6";
        scenes.push(counter);
        registerSlot(targetStart, 3.0);
        break;
      }
    }
  }

  // 3. Mid-Point Callout or Progress bar on prominent question or key lesson
  const questionIndex = transcript.findIndex((l, idx) => idx > 0 && l.text?.includes("?"));
  if (questionIndex !== -1 && scenes.length < maxScenes) {
    const qLine = transcript[questionIndex];
    const qStart = Number(qLine.start || 0);
    const lastEnd = occupiedRanges[occupiedRanges.length - 1]?.end || 0;
    const targetStart = Math.max(qStart, lastEnd + 0.15);
    if (targetStart > 2 && targetStart + 2.8 < safeDuration - 2.5 && isSlotFree(targetStart, 2.8)) {
      const callout = createMotion("callout", targetStart, makeId("motion-lesson"), existingScenes);
      callout.text = (qLine.text || "KEY QUESTION").slice(0, 32).toUpperCase();
      callout.secondary = "PAY CLOSE ATTENTION";
      callout.duration = 2.8;
      callout.color = "#38bdf8";
      scenes.push(callout);
      registerSlot(targetStart, 2.8);
    }
  }

  // 4. Outro Subscribe / Follow CTA (last 3.5s)
  const outroStart = Math.max(0.5, safeDuration - 3.8);
  if (safeDuration >= 6 && isSlotFree(outroStart, 3.5) && scenes.length < maxScenes) {
    const cta = createMotion("cta", outroStart, makeId("motion-cta"), existingScenes);
    cta.text = "SUBSCRIBE & FOLLOW";
    cta.secondary = "Turn on notifications 🔔";
    cta.duration = 3.5;
    cta.color = "#ec4899";
    scenes.push(cta);
    registerSlot(outroStart, 3.5);
  }

  return scenes;
}
