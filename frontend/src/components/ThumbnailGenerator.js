import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebaseClient";
import "./ThumbnailGenerator.css";

const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;
const SAFE_MARGIN = 72;
const SAMPLE_COUNT = 18;

const DIRECTION_PRESETS = [
  {
    id: "operator",
    name: "Operator Grid",
    badge: "SIGNAL LOCK",
    summary: "Sharper proof-driven packaging with tactical overlays and disciplined contrast.",
    strategy: "Turn the frame into a high-confidence system screen, not a random thumbnail.",
    palette: ["#ff6b2c", "#ffb300", "#19c3b0", "#71b7ff"],
    hooks: [
      "THE SYSTEM CLICKS",
      "THIS IS THE NEW BASELINE",
      "ONE MOVE CHANGED IT",
      "THE GAP IS OBVIOUS",
      "THE PLAYBOOK UPDATED",
    ],
    faceHooks: [
      "YOU SEE IT FAST",
      "THE REACTION SAYS IT",
      "THIS HITS DIFFERENT",
    ],
    objectHooks: [
      "THE SETUP IS CLEANER",
      "THE RESULT LOOKS DIFFERENT",
      "THE STACK MAKES SENSE",
    ],
    subtexts: [
      "Clear proof beats loud clutter.",
      "One visual promise. Zero wasted noise.",
      "Cleaner packaging raises click intent.",
    ],
  },
  {
    id: "afterglow",
    name: "Afterglow",
    badge: "LEVEL SHIFT",
    summary: "Cinematic optimism with luminous edges, richer color, and premium editorial framing.",
    strategy: "Make the viewer feel the upgrade before they read the details.",
    palette: ["#ff5a36", "#f43f7d", "#8b7dff", "#ffd166"],
    hooks: [
      "THIS CHANGES THE FEEL",
      "THE DIFFERENCE IS REAL",
      "THE UPGRADE IS VISIBLE",
      "YOU NOTICE IT IMMEDIATELY",
    ],
    faceHooks: [
      "THE LOOK SAYS IT ALL",
      "THE MOMENT LANDED",
      "THIS PART WINS",
    ],
    objectHooks: [
      "THE FINISH LOOKS EXPENSIVE",
      "THE VISUAL JUMP IS REAL",
      "THIS SHOT CARRIES IT",
    ],
    subtexts: [
      "Polished, brighter, and easier to remember.",
      "Visual lift first. Details second.",
      "The frame should feel premium on sight.",
    ],
  },
  {
    id: "blacksite",
    name: "Blacksite",
    badge: "NOISE CUT",
    summary: "Dark authority, stark separation, and a more ruthless high-contrast point of view.",
    strategy: "Strip away the filler so the frame feels expensive, secretive, and inevitable.",
    palette: ["#f5f5f5", "#00f0ff", "#ff5a36", "#b8c0cc"],
    hooks: [
      "THIS IS THE REAL MOVE",
      "THE OLD WAY LOOKS WEAK",
      "THIS FRAME HAS WEIGHT",
      "CUT THE DISTRACTION",
    ],
    faceHooks: [
      "THE LOOK IS ENOUGH",
      "YOU FEEL THE SWITCH",
      "THE MOMENT IS HEAVIER",
    ],
    objectHooks: [
      "THE BUILD LOOKS SHARPER",
      "THIS IS THE CLEAN VERSION",
      "THE PACKAGE IS TIGHTER",
    ],
    subtexts: [
      "More tension. More authority. Less clutter.",
      "Make the promise feel inevitable.",
      "Use darkness to create focus, not confusion.",
    ],
  },
  {
    id: "pulse",
    name: "Pulse State",
    badge: "LIVE SIGNAL",
    summary: "Fast, electric, kinetic packaging for clips that need energy without chaos.",
    strategy: "Push momentum, hit the viewer early, and make the frame feel active.",
    palette: ["#14b8a6", "#67e8f9", "#facc15", "#fb7185"],
    hooks: [
      "THIS MOVES FAST",
      "THE ENERGY SPIKES HERE",
      "THIS PART PULLS YOU IN",
      "THE MOMENT IS LOUDER",
    ],
    faceHooks: [
      "THE REACTION IS THE HOOK",
      "THIS FACE SELLS IT",
      "YOU FEEL IT INSTANTLY",
    ],
    objectHooks: [
      "THE VISUAL DOES THE WORK",
      "THE MOTION CARRIES THIS",
      "THIS PART POPS",
    ],
    subtexts: [
      "Fast read. High motion. Clean payoff.",
      "Energy matters only when the read stays clear.",
      "Speed without visual clutter wins.",
    ],
  },
  {
    id: "nova",
    name: "Nova Proof",
    badge: "FUTURE READY",
    summary: "A bolder 2027-style hybrid of proof cards, glowing accents, and measured spectacle.",
    strategy: "Feel like tomorrow without turning into gimmick design.",
    palette: ["#7c5cff", "#60a5fa", "#22d3ee", "#ff8a65"],
    hooks: [
      "THIS FEELS LIKE NEXT",
      "THE FUTURE LOOKS CLEARER",
      "THE FORMAT LEVELED UP",
      "THIS IS AHEAD OF THE CURVE",
    ],
    faceHooks: [
      "YOU SEE THE SHIFT",
      "THE FUTURE HAS A FACE",
      "THIS LOOKS DIFFERENT NOW",
    ],
    objectHooks: [
      "THE STACK LOOKS FUTURE-BUILT",
      "THE SYSTEM LOOKS READY",
      "THIS PACKAGE FEELS NEXT",
    ],
    subtexts: [
      "Forward-looking without losing clarity.",
      "A futuristic mood still needs a simple promise.",
      "Technology should sharpen the hook, not hide it.",
    ],
  },
];

const STYLE_PRESETS = [
  {
    id: "signal",
    name: "Signal Frame",
    badge: "PRIMARY",
    summary: "Bold split layout with a readable hook lane and live-signal overlays.",
  },
  {
    id: "vault",
    name: "Vault Card",
    badge: "AUTHORITY",
    summary: "Large subject crop plus a premium proof card that feels deliberate and expensive.",
  },
  {
    id: "vector",
    name: "Vector Cut",
    badge: "DIRECTIONAL",
    summary: "Diagonal framing and motion rails for videos that need push and pace.",
  },
  {
    id: "orbit",
    name: "Orbit Focus",
    badge: "FOCUS LOCK",
    summary: "Halo treatment around the subject to make the focal point impossible to miss.",
  },
  {
    id: "proof",
    name: "Proof Stack",
    badge: "WHY IT WINS",
    summary: "High-information lower-third layout that still reads clean in two seconds.",
  },
  {
    id: "sequence",
    name: "Sequence Rail",
    badge: "MULTI SCENE",
    summary: "Three-panel story packaging for transformation, process, or narrative beats.",
  },
];

const STYLE_COPY_LIBRARY = {
  signal: {
    badges: ["SIGNAL LOCK", "WATCH THIS", "RUN THIS"],
    hooks: ["THE PAYOFF IS OBVIOUS", "THIS READS FASTER", "THE HOOK IS BUILT IN"],
    subtexts: [
      "Give the viewer the whole promise instantly.",
      "A clean lane for the hook beats extra noise.",
    ],
  },
  vault: {
    badges: ["PROOF CARD", "NO GUESSING", "THE RECEIPT"],
    hooks: ["THE PROOF IS RIGHT HERE", "THIS IS WHY IT WORKS", "THE RECEIPT IS VISUAL"],
    subtexts: [
      "Use the frame and the proof panel together.",
      "Confidence comes from clarity, not clutter.",
    ],
  },
  vector: {
    badges: ["MOTION LINE", "PUSH FORWARD", "NEXT MOVE"],
    hooks: ["THIS PUSHES HARDER", "THE FRAME HAS MOMENTUM", "THIS CUT FEELS FASTER"],
    subtexts: [
      "Directional energy should still feel controlled.",
      "Build pace without losing the read.",
    ],
  },
  orbit: {
    badges: ["FOCUS LOCK", "SEE THIS", "MAIN SIGNAL"],
    hooks: ["THIS IS THE CENTER", "THE SUBJECT DOES THE WORK", "YOUR EYE LANDS HERE"],
    subtexts: [
      "Make the focal point feel undeniable.",
      "The subject should anchor the whole promise.",
    ],
  },
  proof: {
    badges: ["WHY IT HITS", "WHAT CHANGED", "THE REAL GAIN"],
    hooks: ["THE DIFFERENCE IS MEASURABLE", "THIS PART MOVES THE NEEDLE", "THE IMPROVEMENT IS REAL"],
    subtexts: [
      "Use data language without making it dull.",
      "Proof should feel sharp, not corporate.",
    ],
  },
  sequence: {
    badges: ["FULL ARC", "THREE BEATS", "SEE THE PATH"],
    hooks: ["THE STORY IS IN THE SWITCH", "YOU CAN SEE THE WHOLE ARC", "THE SHIFT IS FRAME TO FRAME"],
    subtexts: [
      "Show progression when one frame is not enough.",
      "Sequence beats can make the promise feel bigger.",
    ],
  },
};

const DEFAULT_DIRECTION_ID = DIRECTION_PRESETS[0].id;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickBySeed(items, seed) {
  if (!items.length) return "";
  return items[Math.abs(seed) % items.length];
}

function toRgba(hex, alpha) {
  const clean = String(hex || "#ffffff").replace("#", "");
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDirectionPreset(directionId) {
  return DIRECTION_PRESETS.find(direction => direction.id === directionId) || DIRECTION_PRESETS[0];
}

function getStylePreset(styleId) {
  return STYLE_PRESETS.find(style => style.id === styleId) || STYLE_PRESETS[0];
}

function createFrameCanvas(frame) {
  const canvas = document.createElement("canvas");
  canvas.width = frame.imageData.width;
  canvas.height = frame.imageData.height;
  canvas.getContext("2d").putImageData(frame.imageData, 0, 0);
  return canvas;
}

function detectFaceBounds(data, width, height) {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let hits = 0;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);

      if (r > 95 && g > 40 && b > 20 && spread > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }

  if (hits <= 100) return null;

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 28),
    height: Math.max(1, maxY - minY + 28),
  };
}

function measureFrame(imageData) {
  const { data, width, height } = imageData;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let saturationSum = 0;
  let edgeSum = 0;
  let skinHits = 0;
  let highlightHits = 0;
  let darkHits = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  let topEnergy = 0;
  let bottomEnergy = 0;
  let centerEnergy = 0;
  let subjectMassX = 0;
  let subjectMassY = 0;
  let subjectMassWeight = 0;
  let samples = 0;

  const leftThreshold = width * 0.36;
  const rightThreshold = width * 0.64;
  const topThreshold = height * 0.36;
  const bottomThreshold = height * 0.64;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const spread = maxChannel - minChannel;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const neighbor = x + 4 < width ? index + 4 : index;
      const neighborLum =
        0.299 * data[neighbor] + 0.587 * data[neighbor + 1] + 0.114 * data[neighbor + 2];
      const edge = Math.abs(luminance - neighborLum);
      const weight = edge * 1.6 + spread * 0.32 + Math.max(0, luminance - 88) * 0.08;

      luminanceSum += luminance;
      luminanceSquaredSum += luminance * luminance;
      saturationSum += spread;
      edgeSum += edge;
      subjectMassX += x * weight;
      subjectMassY += y * weight;
      subjectMassWeight += weight;
      samples += 1;

      if (luminance > 192) highlightHits += 1;
      if (luminance < 62) darkHits += 1;

      if (x < leftThreshold) leftEnergy += edge + spread * 0.22;
      if (x > rightThreshold) rightEnergy += edge + spread * 0.22;
      if (y < topThreshold) topEnergy += edge + spread * 0.22;
      if (y > bottomThreshold) bottomEnergy += edge + spread * 0.22;
      if (x > width * 0.24 && x < width * 0.76 && y > height * 0.18 && y < height * 0.82) {
        centerEnergy += weight;
      }

      if (r > 95 && g > 40 && b > 20 && spread > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
        skinHits += 1;
      }
    }
  }

  const averageLuminance = luminanceSum / Math.max(1, samples);
  const variance =
    luminanceSquaredSum / Math.max(1, samples) - averageLuminance * averageLuminance;
  const face = detectFaceBounds(data, width, height);
  const faceAreaRatio = face ? (face.width * face.height) / (width * height) : 0;
  const focusX = face ? face.x + face.width / 2 : subjectMassWeight ? subjectMassX / subjectMassWeight : width / 2;
  const focusY = face ? face.y + face.height / 2 : subjectMassWeight ? subjectMassY / subjectMassWeight : height / 2;
  const focusXNorm = clamp(focusX / width, 0, 1);
  const focusYNorm = clamp(focusY / height, 0, 1);
  const thirdsPoints = [
    { x: 1 / 3, y: 1 / 3 },
    { x: 2 / 3, y: 1 / 3 },
    { x: 1 / 3, y: 2 / 3 },
    { x: 2 / 3, y: 2 / 3 },
  ];
  const nearestThirdsDistance = Math.min(
    ...thirdsPoints.map(point => Math.hypot(focusXNorm - point.x, focusYNorm - point.y))
  );
  const thirdsScore = 1 - clamp(nearestThirdsDistance / 0.4, 0, 1);
  const symmetry =
    1 - Math.abs(leftEnergy - rightEnergy) / Math.max(1, leftEnergy + rightEnergy);
  const textSafeLeft = 1 - clamp(leftEnergy / Math.max(1, samples * 32), 0, 1);
  const textSafeRight = 1 - clamp(rightEnergy / Math.max(1, samples * 32), 0, 1);
  const textSafeTop = 1 - clamp(topEnergy / Math.max(1, samples * 32), 0, 1);
  const textSafeBottom = 1 - clamp(bottomEnergy / Math.max(1, samples * 32), 0, 1);
  const blankLane = Math.max(textSafeLeft, textSafeRight);
  const highlightRatio = highlightHits / Math.max(1, samples);
  const darkRatio = darkHits / Math.max(1, samples);
  const subjectConfidence = face
    ? clamp(faceAreaRatio / 0.2, 0, 1)
    : clamp(centerEnergy / Math.max(1, samples * 26), 0, 1);
  const drama = clamp(
    Math.sqrt(Math.max(0, variance)) / 88 * 0.45 + darkRatio * 0.3 + highlightRatio * 0.25,
    0,
    1
  );

  return {
    brightness: averageLuminance,
    contrast: Math.sqrt(Math.max(0, variance)),
    saturation: saturationSum / Math.max(1, samples),
    edgeEnergy: edgeSum / Math.max(1, samples),
    skinRatio: skinHits / Math.max(1, samples),
    face,
    faceAreaRatio,
    focusXNorm,
    focusYNorm,
    thirdsScore,
    symmetry,
    textSafeLeft,
    textSafeRight,
    textSafeTop,
    textSafeBottom,
    blankLane,
    highlightRatio,
    darkRatio,
    subjectConfidence,
    drama,
  };
}

function buildAudit(metrics, score) {
  const brightnessScore = clamp(1 - Math.abs(metrics.brightness - 126) / 126, 0, 1);
  const contrastScore = clamp(metrics.contrast / 82, 0, 1);
  const detailScore = clamp(metrics.edgeEnergy / 52, 0, 1);
  const subjectScore = clamp(metrics.subjectConfidence * 0.7 + metrics.faceAreaRatio * 1.4, 0, 1);
  const dramaScore = clamp(metrics.drama, 0, 1);

  return [
    { label: "Clarity", value: Math.round((brightnessScore * 0.4 + contrastScore * 0.6) * 100) },
    { label: "Punch", value: Math.round((contrastScore * 0.5 + detailScore * 0.5) * 100) },
    { label: "Subject", value: Math.round(subjectScore * 100) },
    { label: "Whitespace", value: Math.round(metrics.blankLane * 100) },
    { label: "Drama", value: Math.round(dramaScore * 100) },
    { label: "Total", value: Math.round(clamp(score / 1, 0, 100)) },
  ];
}

function scoreFrame(metrics, time, duration) {
  const brightnessScore = clamp(1 - Math.abs(metrics.brightness - 124) / 124, 0, 1);
  const contrastScore = clamp(metrics.contrast / 82, 0, 1);
  const saturationScore = clamp(metrics.saturation / 86, 0, 1);
  const detailScore = clamp(metrics.edgeEnergy / 50, 0, 1);
  const compositionScore = clamp(metrics.thirdsScore * 0.56 + metrics.blankLane * 0.44, 0, 1);
  const subjectScore = clamp(metrics.subjectConfidence * 0.72 + metrics.faceAreaRatio * 1.2, 0, 1);
  const dramaScore = clamp(metrics.drama, 0, 1);
  const timingBias = duration > 0 ? 1 - Math.abs(time / duration - 0.42) : 0.5;

  return Math.round(
    brightnessScore * 12 +
      contrastScore * 18 +
      saturationScore * 10 +
      detailScore * 14 +
      compositionScore * 16 +
      subjectScore * 18 +
      dramaScore * 8 +
      clamp(timingBias, 0, 1) * 4
  );
}

function getAnchorSide(frame) {
  const metrics = frame.metrics;
  if (!metrics) return "left";
  if (metrics.textSafeLeft - metrics.textSafeRight > 0.08) return "left";
  if (metrics.textSafeRight - metrics.textSafeLeft > 0.08) return "right";
  if (metrics.focusXNorm > 0.56) return "left";
  if (metrics.focusXNorm < 0.44) return "right";
  return metrics.textSafeRight >= metrics.textSafeLeft ? "right" : "left";
}

function describeFrame(frame) {
  if (!frame?.metrics) return "Balanced frame with usable contrast.";

  const notes = [];
  const metrics = frame.metrics;
  const anchor = getAnchorSide(frame);

  if (metrics.face && metrics.subjectConfidence > 0.55) notes.push("strong subject separation");
  if (metrics.blankLane > 0.38) notes.push(`clean text lane on the ${anchor}`);
  if (metrics.thirdsScore > 0.58) notes.push("good rule-of-thirds placement");
  if (metrics.drama > 0.55) notes.push("cinematic light contrast");
  if (metrics.edgeEnergy > 36) notes.push("crisp visual detail");
  if (notes.length === 0) notes.push("balanced packaging frame");

  return notes.slice(0, 3).join(", ");
}

function summarizeSignals(frame) {
  if (!frame?.metrics) return ["Balanced", "Usable"];
  const metrics = frame.metrics;
  const signals = [];

  if (metrics.face) signals.push("Face-led");
  if (metrics.blankLane > 0.38) signals.push(`${getAnchorSide(frame)} text lane`);
  if (metrics.drama > 0.55) signals.push("High drama");
  if (metrics.thirdsScore > 0.58) signals.push("Strong composition");
  if (metrics.highlightRatio > 0.08) signals.push("Bright focal hit");
  if (!signals.length) signals.push("Balanced read");

  return signals.slice(0, 3);
}

function waitForMedia(video) {
  if (video.readyState >= 2) return Promise.resolve();

  return new Promise(resolve => {
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      resolve();
    };

    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
  });
}

function seekVideo(video, time) {
  const target = clamp(time, 0, Math.max(0, (video.duration || 0) - 0.05));

  return new Promise(resolve => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = target;
  });
}

function sampleTimes(duration, count = SAMPLE_COUNT) {
  const usableDuration = Math.max(9, duration || 60);
  const start = usableDuration * 0.05;
  const end = usableDuration * 0.9;
  const step = (end - start) / Math.max(1, count - 1);
  const times = [];

  for (let index = 0; index < count; index += 1) {
    const anchor = start + step * index;
    const jitter = step * 0.18;
    const candidate = clamp(anchor + randomBetween(-jitter, jitter), start, end);
    times.push(round(candidate, 2));
  }

  return Array.from(new Set(times)).sort((left, right) => left - right);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

function coverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight, focus) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let cropWidth;
  let cropHeight;

  if (sourceRatio > targetRatio) {
    cropHeight = sourceHeight;
    cropWidth = cropHeight * targetRatio;
  } else {
    cropWidth = sourceWidth;
    cropHeight = cropWidth / targetRatio;
  }

  const focusX = focus?.x ?? sourceWidth / 2;
  const focusY = focus?.y ?? sourceHeight / 2;
  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);
  const sourceX = clamp(focusX - cropWidth / 2, 0, maxX);
  const sourceY = clamp(focusY - cropHeight / 2, 0, maxY);

  return { sourceX, sourceY, cropWidth, cropHeight };
}

function drawSmartCover(ctx, sourceCanvas, frame, x, y, width, height, options = {}) {
  const face = frame.metrics.face;
  const focus = face
    ? {
        x: face.x + face.width / 2,
        y: face.y + face.height * (options.faceBiasY ?? 0.45),
      }
    : {
        x: sourceCanvas.width * frame.metrics.focusXNorm,
        y: sourceCanvas.height * frame.metrics.focusYNorm,
      };

  const zoom = options.zoom ?? (face ? 0.78 : 0.94);
  const crop = coverCrop(sourceCanvas.width, sourceCanvas.height, width, height, focus);
  const zoomedWidth = clamp(crop.cropWidth * zoom, width * 0.55, sourceCanvas.width);
  const zoomedHeight = clamp(crop.cropHeight * zoom, height * 0.55, sourceCanvas.height);
  const sourceX = clamp(focus.x - zoomedWidth / 2, 0, sourceCanvas.width - zoomedWidth);
  const sourceY = clamp(focus.y - zoomedHeight / 2, 0, sourceCanvas.height - zoomedHeight);

  ctx.save();
  if (options.filter) ctx.filter = options.filter;
  ctx.drawImage(sourceCanvas, sourceX, sourceY, zoomedWidth, zoomedHeight, x, y, width, height);
  ctx.restore();
}

function drawGradientWash(ctx, accent, accentAlt) {
  const topGlow = ctx.createRadialGradient(THUMB_WIDTH * 0.18, THUMB_HEIGHT * 0.16, 40, THUMB_WIDTH * 0.18, THUMB_HEIGHT * 0.16, THUMB_WIDTH * 0.62);
  topGlow.addColorStop(0, toRgba(accent, 0.28));
  topGlow.addColorStop(1, "rgba(6, 10, 18, 0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  const lowerGlow = ctx.createRadialGradient(
    THUMB_WIDTH * 0.82,
    THUMB_HEIGHT * 0.82,
    40,
    THUMB_WIDTH * 0.82,
    THUMB_HEIGHT * 0.82,
    THUMB_WIDTH * 0.5
  );
  lowerGlow.addColorStop(0, toRgba(accentAlt, 0.22));
  lowerGlow.addColorStop(1, "rgba(6, 10, 18, 0)");
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  const fade = ctx.createLinearGradient(0, THUMB_HEIGHT * 0.3, 0, THUMB_HEIGHT);
  fade.addColorStop(0, "rgba(5, 8, 15, 0)");
  fade.addColorStop(0.45, "rgba(5, 8, 15, 0.18)");
  fade.addColorStop(1, "rgba(5, 8, 15, 0.92)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
}

function drawTechGrid(ctx, accent) {
  ctx.save();
  ctx.strokeStyle = toRgba(accent, 0.12);
  ctx.lineWidth = 1;
  for (let x = 0; x <= THUMB_WIDTH; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, THUMB_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= THUMB_HEIGHT; y += 84) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(THUMB_WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
}

function wrapLines(ctx, text, maxWidth, maxLines = 3) {
  if (!String(text || "").trim()) return [];

  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let current = words[0] || "";

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[index];
      if (lines.length === maxLines - 1) break;
    }
  }

  const remainingWords = words.slice(lines.join(" ").split(/\s+/).filter(Boolean).length);
  const tail = [current, ...remainingWords].filter(Boolean).join(" ").trim();
  if (tail) lines.push(tail);

  return lines.slice(0, maxLines);
}

function fitHeadline(ctx, text, maxWidth, maxLines = 3, startSize = 84, minSize = 46) {
  let size = startSize;
  let lines = [];

  while (size >= minSize) {
    ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    lines = wrapLines(ctx, text, maxWidth, maxLines);
    const longestLine = Math.max(...lines.map(line => ctx.measureText(line).width), 0);
    if (lines.length <= maxLines && longestLine <= maxWidth) break;
    size -= 6;
  }

  return { lines, size };
}

function drawHeadline(ctx, text, x, y, maxWidth, color, accent, align = "left") {
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const { lines, size } = fitHeadline(ctx, text, maxWidth, 3, 86, 50);
  const lineHeight = size * 0.94;

  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(10, size * 0.16);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.strokeText(line, x, lineY, maxWidth);
    ctx.shadowColor = toRgba(accent, 0.3);
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(line, x, lineY, maxWidth);
    ctx.shadowBlur = 0;
  });

  ctx.restore();
}

function drawEyebrow(ctx, text, x, y, accent, dark = true) {
  const label = String(text || "").trim();
  if (!label) return;

  ctx.save();
  ctx.font = '800 24px "Arial", sans-serif';
  ctx.textBaseline = "middle";
  const width = ctx.measureText(label).width + 30;
  ctx.fillStyle = dark ? toRgba(accent, 0.9) : "rgba(255, 255, 255, 0.9)";
  drawRoundedRect(ctx, x, y, width, 42, 999);
  ctx.fill();
  ctx.fillStyle = dark ? "#081018" : "#121826";
  ctx.fillText(label, x + 15, y + 22);
  ctx.restore();
}

function drawSubtext(ctx, text, x, y, maxWidth, align = "left") {
  const label = String(text || "").trim();
  if (!label) return;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.font = '600 28px "Arial", sans-serif';
  ctx.fillStyle = "rgba(245, 247, 250, 0.94)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 8;
  const lines = wrapLines(ctx, label, maxWidth, 2);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * 34, maxWidth);
  });
  ctx.restore();
}

function drawMetricChip(ctx, text, x, y, accent) {
  ctx.save();
  ctx.font = '700 20px "Arial", sans-serif';
  const width = ctx.measureText(text).width + 24;
  ctx.fillStyle = "rgba(8, 11, 18, 0.72)";
  drawRoundedRect(ctx, x, y, width, 34, 999);
  ctx.fill();
  ctx.strokeStyle = toRgba(accent, 0.35);
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, width, 34, 999);
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 12, y + 18);
  ctx.restore();
}

function drawAuditBars(ctx, audit, x, y, width, accent) {
  ctx.save();
  ctx.font = '700 18px "Arial", sans-serif';
  audit.slice(0, 4).forEach((entry, index) => {
    const rowY = y + index * 44;
    ctx.fillStyle = "rgba(230, 236, 243, 0.92)";
    ctx.fillText(entry.label, x, rowY);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    drawRoundedRect(ctx, x + 108, rowY - 14, width, 14, 999);
    ctx.fill();
    ctx.fillStyle = accent;
    drawRoundedRect(ctx, x + 108, rowY - 14, width * (entry.value / 100), 14, 999);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
    ctx.fillText(String(entry.value), x + 108 + width + 12, rowY);
  });
  ctx.restore();
}

function renderSignalFrame(frame, direction, copy, audit) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  const source = createFrameCanvas(frame);
  const anchor = copy.anchor;
  const accent = copy.accent;
  const accentAlt = copy.accentAlt;
  const panelWidth = 470;
  const panelX = anchor === "left" ? SAFE_MARGIN : THUMB_WIDTH - SAFE_MARGIN - panelWidth;
  const align = anchor === "left" ? "left" : "right";
  const textX = anchor === "left" ? panelX + 28 : panelX + panelWidth - 28;

  drawSmartCover(ctx, source, frame, 0, 0, THUMB_WIDTH, THUMB_HEIGHT, {
    zoom: frame.metrics.face ? 0.72 : 0.9,
    faceBiasY: 0.38,
    filter: "contrast(1.08) saturate(1.08)",
  });
  drawGradientWash(ctx, accent, accentAlt);
  drawTechGrid(ctx, accent);

  ctx.fillStyle = toRgba(accent, 0.2);
  ctx.fillRect(anchor === "left" ? 0 : THUMB_WIDTH - 16, 0, 16, THUMB_HEIGHT);

  ctx.fillStyle = "rgba(8, 11, 18, 0.62)";
  drawRoundedRect(ctx, panelX, 86, panelWidth, 540, 34);
  ctx.fill();
  ctx.strokeStyle = toRgba(accent, 0.42);
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, panelX, 86, panelWidth, 540, 34);
  ctx.stroke();

  drawEyebrow(ctx, copy.eyebrow, panelX + 28, 110, accent);
  drawHeadline(ctx, copy.headline, textX, 198, panelWidth - 56, "#ffffff", accent, align);
  drawSubtext(ctx, copy.subtext, textX, 458, panelWidth - 56, align);
  drawMetricChip(ctx, `${direction.name}`, panelX + 28, 560, accent);
  drawMetricChip(ctx, `Score ${frame.score}`, panelX + 214, 560, accent);
  drawMetricChip(ctx, `Clarity ${audit[0].value}`, panelX + 336, 560, accent);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function renderVaultFrame(frame, direction, copy, audit) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  const source = createFrameCanvas(frame);
  const accent = copy.accent;
  const accentAlt = copy.accentAlt;

  drawSmartCover(ctx, source, frame, 0, 0, THUMB_WIDTH, THUMB_HEIGHT, {
    zoom: frame.metrics.face ? 0.66 : 0.84,
    faceBiasY: 0.36,
    filter: "contrast(1.1) saturate(1.04)",
  });

  ctx.fillStyle = "rgba(4, 6, 12, 0.44)";
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  drawGradientWash(ctx, accent, accentAlt);

  const cardWidth = 452;
  const cardHeight = 560;
  const cardX = THUMB_WIDTH - cardWidth - SAFE_MARGIN;
  const cardY = 82;

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 30);
  ctx.fill();
  ctx.strokeStyle = toRgba(accent, 0.5);
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 30);
  ctx.stroke();

  drawEyebrow(ctx, copy.eyebrow, cardX + 24, cardY + 26, accent);
  drawHeadline(ctx, copy.headline, cardX + 24, cardY + 110, cardWidth - 48, "#fff8f1", accent, "left");
  drawSubtext(ctx, copy.subtext, cardX + 24, cardY + 298, cardWidth - 48, "left");
  drawAuditBars(ctx, audit, cardX + 24, cardY + 416, 180, accent);
  drawMetricChip(ctx, direction.badge, SAFE_MARGIN, 52, accent);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function renderVectorFrame(frame, direction, copy) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  const source = createFrameCanvas(frame);
  const accent = copy.accent;
  const accentAlt = copy.accentAlt;
  const anchor = copy.anchor;

  drawSmartCover(ctx, source, frame, 0, 0, THUMB_WIDTH, THUMB_HEIGHT, {
    zoom: frame.metrics.face ? 0.76 : 0.92,
    filter: "contrast(1.09) saturate(1.08)",
  });

  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 17, 0.5)";
  ctx.beginPath();
  if (anchor === "left") {
    ctx.moveTo(0, 0);
    ctx.lineTo(640, 0);
    ctx.lineTo(480, THUMB_HEIGHT);
    ctx.lineTo(0, THUMB_HEIGHT);
  } else {
    ctx.moveTo(THUMB_WIDTH, 0);
    ctx.lineTo(640, 0);
    ctx.lineTo(800, THUMB_HEIGHT);
    ctx.lineTo(THUMB_WIDTH, THUMB_HEIGHT);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawGradientWash(ctx, accent, accentAlt);

  ctx.strokeStyle = toRgba(accent, 0.58);
  ctx.lineWidth = 8;
  ctx.beginPath();
  if (anchor === "left") {
    ctx.moveTo(434, 0);
    ctx.lineTo(302, THUMB_HEIGHT);
  } else {
    ctx.moveTo(846, 0);
    ctx.lineTo(978, THUMB_HEIGHT);
  }
  ctx.stroke();

  const textX = anchor === "left" ? SAFE_MARGIN : THUMB_WIDTH - SAFE_MARGIN;
  const align = anchor === "left" ? "left" : "right";
  const maxWidth = 520;

  drawEyebrow(ctx, copy.eyebrow, anchor === "left" ? SAFE_MARGIN : THUMB_WIDTH - SAFE_MARGIN - 220, 58, accent);
  drawHeadline(ctx, copy.headline, textX, 154, maxWidth, "#fffdf9", accent, align);
  drawSubtext(ctx, copy.subtext, textX, 452, 460, align);
  drawMetricChip(ctx, direction.name, anchor === "left" ? SAFE_MARGIN : THUMB_WIDTH - SAFE_MARGIN - 200, 596, accent);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function renderOrbitFrame(frame, direction, copy) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  const source = createFrameCanvas(frame);
  const accent = copy.accent;
  const accentAlt = copy.accentAlt;
  const focusX = frame.metrics.focusXNorm * THUMB_WIDTH;
  const focusY = frame.metrics.focusYNorm * THUMB_HEIGHT;
  const anchor = focusX > THUMB_WIDTH * 0.54 ? "left" : "right";
  const textX = anchor === "left" ? SAFE_MARGIN : THUMB_WIDTH - SAFE_MARGIN;
  const align = anchor === "left" ? "left" : "right";

  drawSmartCover(ctx, source, frame, 0, 0, THUMB_WIDTH, THUMB_HEIGHT, {
    zoom: frame.metrics.face ? 0.68 : 0.88,
    faceBiasY: 0.38,
    filter: "contrast(1.08) saturate(1.1)",
  });
  drawGradientWash(ctx, accent, accentAlt);

  ctx.save();
  ctx.strokeStyle = toRgba(accentAlt, 0.42);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(focusX, focusY, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = toRgba(accent, 0.75);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(focusX, focusY, 144, 0.5, Math.PI * 1.76);
  ctx.stroke();
  ctx.restore();

  drawEyebrow(
    ctx,
    copy.eyebrow,
    anchor === "left" ? SAFE_MARGIN : THUMB_WIDTH - SAFE_MARGIN - 230,
    60,
    accent
  );
  drawHeadline(ctx, copy.headline, textX, 408, 520, "#ffffff", accent, align);
  drawSubtext(ctx, copy.subtext, textX, 612, 440, align);
  drawMetricChip(ctx, direction.badge, SAFE_MARGIN, 60, accent);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function renderProofFrame(frame, direction, copy, audit) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  const source = createFrameCanvas(frame);
  const accent = copy.accent;
  const accentAlt = copy.accentAlt;
  const anchor = getAnchorSide(frame);

  drawSmartCover(ctx, source, frame, 0, 0, THUMB_WIDTH, THUMB_HEIGHT, {
    zoom: frame.metrics.face ? 0.78 : 0.92,
    filter: "contrast(1.06) saturate(1.02)",
  });
  ctx.fillStyle = "rgba(4, 7, 13, 0.26)";
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  drawGradientWash(ctx, accent, accentAlt);

  const cardWidth = 1100;
  const cardHeight = 232;
  const cardX = (THUMB_WIDTH - cardWidth) / 2;
  const cardY = THUMB_HEIGHT - cardHeight - 48;

  ctx.fillStyle = "rgba(8, 11, 18, 0.82)";
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 26);
  ctx.fill();
  ctx.strokeStyle = toRgba(accent, 0.4);
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 26);
  ctx.stroke();

  drawEyebrow(ctx, copy.eyebrow, cardX + 28, cardY + 22, accent);
  drawHeadline(ctx, copy.headline, cardX + 28, cardY + 82, 600, "#ffffff", accent, "left");
  drawSubtext(ctx, copy.subtext, cardX + 28, cardY + 168, 520, "left");
  drawAuditBars(ctx, audit, cardX + 676, cardY + 54, 210, accent);
  drawMetricChip(ctx, `${anchor} lane`, cardX + 896, cardY + 22, accent);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function renderSequenceFrame(frames, direction, copy) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  const accent = copy.accent;
  const accentAlt = copy.accentAlt;
  const usableFrames = frames.slice(0, 3);
  const gaps = 18;
  const widthA = 352;
  const widthB = 430;
  const widthC = 352;

  const positions = [
    { x: 0, width: widthA },
    { x: widthA + gaps, width: widthB },
    { x: widthA + widthB + gaps * 2, width: widthC },
  ];

  usableFrames.forEach((frame, index) => {
    const source = createFrameCanvas(frame);
    const panel = positions[index] || positions[1];
    drawSmartCover(ctx, source, frame, panel.x, 0, panel.width, THUMB_HEIGHT, {
      zoom: frame.metrics.face ? 0.7 : 0.9,
      filter: "contrast(1.08) saturate(1.06)",
    });
  });

  ctx.fillStyle = "rgba(4, 7, 13, 0.18)";
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  drawGradientWash(ctx, accent, accentAlt);

  ctx.strokeStyle = toRgba(accent, 0.58);
  ctx.lineWidth = 6;
  positions.slice(1).forEach(panel => {
    ctx.beginPath();
    ctx.moveTo(panel.x - gaps / 2, 54);
    ctx.lineTo(panel.x - gaps / 2, THUMB_HEIGHT - 54);
    ctx.stroke();
  });

  const bannerY = THUMB_HEIGHT - 210;
  ctx.fillStyle = "rgba(8, 11, 18, 0.7)";
  drawRoundedRect(ctx, SAFE_MARGIN, bannerY, THUMB_WIDTH - SAFE_MARGIN * 2, 162, 22);
  ctx.fill();
  drawEyebrow(ctx, copy.eyebrow, SAFE_MARGIN + 24, bannerY + 18, accent);
  drawHeadline(ctx, copy.headline, SAFE_MARGIN + 24, bannerY + 70, THUMB_WIDTH - SAFE_MARGIN * 2 - 48, "#ffffff", accent, "left");
  drawSubtext(ctx, copy.subtext, SAFE_MARGIN + 24, bannerY + 128, THUMB_WIDTH - SAFE_MARGIN * 2 - 48, "left");

  return canvas.toDataURL("image/jpeg", 0.92);
}

function buildAutoCopy(direction, style, frame, index) {
  const styleLibrary = STYLE_COPY_LIBRARY[style.id] || STYLE_COPY_LIBRARY.signal;
  const signals = summarizeSignals(frame);
  const seed = Math.round(frame.time * 10 + frame.score + index * 17);
  const headlinePool = [
    ...styleLibrary.hooks,
    ...(frame.metrics.face ? direction.faceHooks : direction.objectHooks),
    ...direction.hooks,
  ];
  const subtextPool = [...styleLibrary.subtexts, ...direction.subtexts];
  const eyebrowPool = [...styleLibrary.badges, ...direction.badge.split("|"), direction.badge];
  const accent = direction.palette[index % direction.palette.length];
  const accentAlt = direction.palette[(index + 1) % direction.palette.length];

  return {
    eyebrow: pickBySeed(eyebrowPool, seed + 3),
    headline: pickBySeed(headlinePool, seed + 7),
    subtext: pickBySeed(subtextPool, seed + 11),
    accent,
    accentAlt,
    anchor: getAnchorSide(frame),
    signalSummary: signals,
  };
}

function pickBestFrame(frames, scorer) {
  return [...frames].sort((left, right) => scorer(right) - scorer(left))[0] || frames[0];
}

function pickSequenceFrames(frames) {
  if (frames.length <= 3) return frames.slice(0, 3);
  const sortedByTime = [...frames].sort((left, right) => left.time - right.time);
  return [
    sortedByTime[1] || sortedByTime[0],
    sortedByTime[Math.floor(sortedByTime.length / 2)] || sortedByTime[1] || sortedByTime[0],
    sortedByTime[sortedByTime.length - 2] || sortedByTime[sortedByTime.length - 1],
  ].filter(Boolean);
}

function getPreferredFrames(frames) {
  const faceFrames = frames.filter(frame => frame.metrics.face);

  return {
    signal: pickBestFrame(
      frames,
      frame => frame.score + frame.metrics.blankLane * 22 + frame.metrics.thirdsScore * 18
    ),
    vault: pickBestFrame(
      frames,
      frame => frame.score + frame.metrics.subjectConfidence * 24 + frame.metrics.drama * 18
    ),
    vector: pickBestFrame(
      frames,
      frame =>
        frame.score +
        Math.abs(frame.metrics.focusXNorm - 0.5) * 28 +
        Math.max(frame.metrics.textSafeLeft, frame.metrics.textSafeRight) * 14
    ),
    orbit: faceFrames[0] ||
      pickBestFrame(frames, frame => frame.score + frame.metrics.subjectConfidence * 22 + frame.metrics.drama * 12),
    proof: pickBestFrame(
      frames,
      frame => frame.score + frame.metrics.contrast * 0.3 + frame.metrics.edgeEnergy * 0.4
    ),
    sequence: pickSequenceFrames(frames),
  };
}

function buildThumbnailVariant(style, direction, frame, frames, copy) {
  const usableFrames = (Array.isArray(frames) ? frames : [frames]).filter(Boolean);
  const primaryFrame = frame?.metrics ? frame : usableFrames[0];

  if (!primaryFrame?.metrics) {
    return {
      dataUrl: "",
      time: 0,
      score: 0,
      styleId: style.id,
      styleName: style.name,
      directionId: direction.id,
      directionName: direction.name,
      summary: style.summary,
      why: "Balanced packaging frame",
      audit: [],
      signalSummary: [],
      headline: copy.headline,
      eyebrow: copy.eyebrow,
      subtext: copy.subtext,
      accent: copy.accent,
      accentAlt: copy.accentAlt,
      anchor: copy.anchor,
    };
  }

  const audit = buildAudit(primaryFrame.metrics, primaryFrame.score);
  const completeCopy = {
    ...copy,
    signalSummary: copy.signalSummary || summarizeSignals(primaryFrame),
  };

  let dataUrl = "";

  switch (style.id) {
    case "signal":
      dataUrl = renderSignalFrame(primaryFrame, direction, completeCopy, audit);
      break;
    case "vault":
      dataUrl = renderVaultFrame(primaryFrame, direction, completeCopy, audit);
      break;
    case "vector":
      dataUrl = renderVectorFrame(primaryFrame, direction, completeCopy);
      break;
    case "orbit":
      dataUrl = renderOrbitFrame(primaryFrame, direction, completeCopy);
      break;
    case "proof":
      dataUrl = renderProofFrame(primaryFrame, direction, completeCopy, audit);
      break;
    case "sequence":
      dataUrl = renderSequenceFrame(usableFrames, direction, completeCopy);
      break;
    default:
      dataUrl = renderSignalFrame(primaryFrame, direction, completeCopy, audit);
      break;
  }

  return {
    dataUrl,
    time: primaryFrame.time,
    score: primaryFrame.score,
    styleId: style.id,
    styleName: style.name,
    directionId: direction.id,
    directionName: direction.name,
    summary: style.summary,
    why: describeFrame(primaryFrame),
    audit,
    signalSummary: completeCopy.signalSummary,
    headline: completeCopy.headline,
    eyebrow: completeCopy.eyebrow,
    subtext: completeCopy.subtext,
    accent: completeCopy.accent,
    accentAlt: completeCopy.accentAlt,
    anchor: completeCopy.anchor,
  };
}

export default function ThumbnailGenerator({ videoSrc, videoRef: externalVideoRef, onSelect, onClose }) {
  const fallbackVideoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const editCanvasRef = useRef(null);
  const sampledFramesRef = useRef([]);
  const activeVideoRef = externalVideoRef || fallbackVideoRef;

  const [thumbnails, setThumbnails] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [stage, setStage] = useState("idle");
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [directionId, setDirectionId] = useState(DEFAULT_DIRECTION_ID);
  const [selectedStyleId, setSelectedStyleId] = useState(STYLE_PRESETS[0].id);
  const [headline, setHeadline] = useState("");
  const [subtext, setSubtext] = useState("");
  const [eyebrow, setEyebrow] = useState("");
  const [accent, setAccent] = useState(DIRECTION_PRESETS[0].palette[0]);
  const [scrubTime, setScrubTime] = useState(0);
  const [copyOverrides, setCopyOverrides] = useState(null);

  const activeDirection = useMemo(() => getDirectionPreset(directionId), [directionId]);
  const selectedThumb = thumbnails[selectedIndex];
  const accentOptions = activeDirection.palette;

  const renderConcepts = useCallback((frames, direction, overrides = null) => {
    if (!frames.length) return [];

    const byStyle = getPreferredFrames(frames);

    return STYLE_PRESETS.map((style, index) => {
      const preferred = byStyle[style.id];
      const sourceFrames =
        style.id === "sequence"
          ? preferred || byStyle.sequence || frames.slice(0, 3)
          : [preferred || frames[0]];
      const leadFrame = Array.isArray(preferred) ? preferred[0] || frames[0] : preferred || frames[0];
      const autoCopy = buildAutoCopy(direction, style, leadFrame, index);
      const mergedCopy = overrides
        ? {
            ...autoCopy,
            ...overrides,
            accentAlt: overrides.accentAlt || autoCopy.accentAlt,
            anchor: overrides.anchor || autoCopy.anchor,
          }
        : autoCopy;

      return buildThumbnailVariant(style, direction, leadFrame, sourceFrames, mergedCopy);
    });
  }, []);

  const drawSelectedPreview = useCallback((dataUrl, canvasRef) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;

    const image = new Image();
    image.onload = () => {
      canvas.width = THUMB_WIDTH;
      canvas.height = THUMB_HEIGHT;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      context.drawImage(image, 0, 0);
    };
    image.src = dataUrl;
  }, []);

  useEffect(() => {
    drawSelectedPreview(thumbnails[selectedIndex]?.dataUrl, previewCanvasRef);
  }, [drawSelectedPreview, selectedIndex, thumbnails]);

  const applyDirection = useCallback(
    nextDirectionId => {
      const nextDirection = getDirectionPreset(nextDirectionId);
      setDirectionId(nextDirectionId);
      setCopyOverrides(null);

      if (!sampledFramesRef.current.length) return;

      const nextThumbs = renderConcepts(sampledFramesRef.current, nextDirection, null);
      setThumbnails(nextThumbs);
      const nextIndex = Math.max(
        0,
        nextThumbs.findIndex(thumb => thumb.styleId === selectedStyleId)
      );
      setSelectedIndex(nextIndex === -1 ? 0 : nextIndex);
    },
    [renderConcepts, selectedStyleId]
  );

  const generateThumbnails = useCallback(async () => {
    const video = activeVideoRef.current;
    if (!video) return;

    setStage("extracting");
    await waitForMedia(video);

    const originalTime = video.currentTime || 0;
    const wasPaused = video.paused;
    const duration = video.duration || 60;
    const points = sampleTimes(duration, SAMPLE_COUNT);
    const captureCanvas = document.createElement("canvas");
    const captureContext = captureCanvas.getContext("2d", { willReadFrequently: true });
    const capturedFrames = [];

    for (const time of points) {
      await seekVideo(video, time);
      await new Promise(resolve => setTimeout(resolve, 30));

      captureCanvas.width = video.videoWidth || THUMB_WIDTH;
      captureCanvas.height = video.videoHeight || THUMB_HEIGHT;
      captureContext.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      const imageData = captureContext.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
      const metrics = measureFrame(imageData);
      const score = scoreFrame(metrics, time, duration);

      capturedFrames.push({
        imageData,
        metrics,
        score,
        time: round(time, 1),
      });
    }

    capturedFrames.sort((left, right) => right.score - left.score);
    const topFrames = capturedFrames.slice(0, 10);
    sampledFramesRef.current = topFrames;

    const nextThumbs = renderConcepts(topFrames, activeDirection, copyOverrides);
    setThumbnails(nextThumbs);
    setSelectedIndex(0);
    setSelectedStyleId(nextThumbs[0]?.styleId || STYLE_PRESETS[0].id);
    setScrubTime(topFrames[0]?.time || 0);
    setStage("ready");

    await seekVideo(video, originalTime);
    if (!wasPaused) video.play().catch(() => {});
  }, [activeDirection, activeVideoRef, copyOverrides, renderConcepts]);

  const regenerateCurrentSet = useCallback(() => {
    if (!sampledFramesRef.current.length) return;
    const nextThumbs = renderConcepts(sampledFramesRef.current, activeDirection, copyOverrides);
    setThumbnails(nextThumbs);
    setSelectedIndex(0);
  }, [activeDirection, copyOverrides, renderConcepts]);

  const saveThumbnail = useCallback(async () => {
    const thumb = thumbnails[selectedIndex];
    if (!thumb) return;

    setIsUploading(true);

    try {
      const blob = await (await fetch(thumb.dataUrl)).blob();
      const auth = getAuth();
      const userId = auth.currentUser?.uid || "anon";
      const storageRef = ref(storage, `thumbnails/${userId}/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
      const storageUrl = await getDownloadURL(storageRef);

      onSelect?.({
        dataUrl: thumb.dataUrl,
        storageUrl,
        text: thumb.headline,
        time: thumb.time,
      });
    } catch (error) {
      console.warn(error);
    } finally {
      setIsUploading(false);
    }
  }, [onSelect, selectedIndex, thumbnails]);

  const downloadThumbnail = useCallback(thumb => {
    const anchor = document.createElement("a");
    anchor.download = `thumbnail-${Date.now()}.jpg`;
    anchor.href = thumb.dataUrl;
    anchor.click();
  }, []);

  const openEditor = useCallback(() => {
    const thumb = thumbnails[selectedIndex];
    if (!thumb) return;

    setDirectionId(thumb.directionId || directionId);
    setSelectedStyleId(thumb.styleId || STYLE_PRESETS[0].id);
    setHeadline(thumb.headline || "");
    setSubtext(thumb.subtext || "");
    setEyebrow(thumb.eyebrow || "");
    setAccent(thumb.accent || activeDirection.palette[0]);
    setScrubTime(thumb.time || 0);
    setIsEditing(true);
  }, [activeDirection.palette, directionId, selectedIndex, thumbnails]);

  const renderEditPreview = useCallback(async () => {
    const video = activeVideoRef.current;
    if (!video || !editCanvasRef.current || !sampledFramesRef.current.length) return;

    await waitForMedia(video);
    await seekVideo(video, scrubTime);

    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = video.videoWidth || THUMB_WIDTH;
    captureCanvas.height = video.videoHeight || THUMB_HEIGHT;
    const captureContext = captureCanvas.getContext("2d");
    captureContext.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

    const imageData = captureContext.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
    const previewFrame = {
      imageData,
      metrics: measureFrame(imageData),
      score: 50,
      time: round(scrubTime, 1),
    };
    const direction = getDirectionPreset(directionId);
    const style = getStylePreset(selectedStyleId);
    const autoCopy = buildAutoCopy(direction, style, previewFrame, 0);
    const previewThumb = buildThumbnailVariant(
      style,
      direction,
      previewFrame,
      selectedStyleId === "sequence" ? sampledFramesRef.current.slice(0, 3) : [previewFrame],
      {
        ...autoCopy,
        eyebrow: eyebrow || autoCopy.eyebrow,
        headline: headline || autoCopy.headline,
        subtext: subtext || autoCopy.subtext,
        accent: accent || autoCopy.accent,
        accentAlt: direction.palette[1] || autoCopy.accentAlt,
      }
    );

    drawSelectedPreview(previewThumb.dataUrl, editCanvasRef);
  }, [accent, activeVideoRef, directionId, drawSelectedPreview, eyebrow, headline, scrubTime, selectedStyleId, subtext]);

  useEffect(() => {
    if (isEditing) {
      renderEditPreview();
    }
  }, [isEditing, renderEditPreview]);

  const applyEditorChanges = useCallback(() => {
    if (!sampledFramesRef.current.length) return;

    const direction = getDirectionPreset(directionId);
    const overrides = {
      eyebrow: eyebrow.trim() || undefined,
      headline: headline.trim() || undefined,
      subtext: subtext.trim() || undefined,
      accent: accent || direction.palette[0],
      accentAlt: direction.palette[1] || direction.palette[0],
    };

    setCopyOverrides(overrides);
    const nextThumbs = renderConcepts(sampledFramesRef.current, direction, overrides);
    setThumbnails(nextThumbs);
    const nextIndex = Math.max(
      0,
      nextThumbs.findIndex(thumb => thumb.styleId === selectedStyleId)
    );
    setSelectedIndex(nextIndex === -1 ? 0 : nextIndex);
    setIsEditing(false);
  }, [accent, directionId, eyebrow, headline, renderConcepts, selectedStyleId, subtext]);

  const remixCopy = useCallback(() => {
    const referenceFrame =
      sampledFramesRef.current.find(frame => frame.time === scrubTime) ||
      sampledFramesRef.current[selectedIndex] ||
      sampledFramesRef.current[0];
    if (!referenceFrame) return;

    const direction = getDirectionPreset(directionId);
    const style = getStylePreset(selectedStyleId);
    const autoCopy = buildAutoCopy(direction, style, referenceFrame, Math.floor(Math.random() * 11) + 1);
    setEyebrow(autoCopy.eyebrow);
    setHeadline(autoCopy.headline);
    setSubtext(autoCopy.subtext);
    setAccent(autoCopy.accent);
  }, [directionId, scrubTime, selectedIndex, selectedStyleId]);

  const resetSystemCopy = useCallback(() => {
    setCopyOverrides(null);
    if (!sampledFramesRef.current.length) return;
    const nextThumbs = renderConcepts(sampledFramesRef.current, activeDirection, null);
    setThumbnails(nextThumbs);
    setSelectedIndex(0);
  }, [activeDirection, renderConcepts]);

  return (
    <div className="tg-overlay" onClick={onClose}>
      <div
        className={`tg-panel ${isEditing ? "tg-panel-edit" : ""}`}
        onClick={event => event.stopPropagation()}
        style={{ "--tg-accent": selectedThumb?.accent || activeDirection.palette[0] }}
      >
        <button className="tg-close" type="button" onClick={onClose}>
          x
        </button>

        {isEditing ? (
          <>
            <div className="tg-header tg-header-left">
              <div className="tg-mini-pill">Refine One Direction</div>
              <h2>2027 Thumbnail Lab</h2>
              <p>
                Tune the hook, the mood, and the frame until the packaging feels unmistakably yours.
              </p>
            </div>

            <div className="tg-edit-layout">
              <div className="tg-edit-preview">
                <canvas ref={editCanvasRef} className="tg-preview-canvas" />
                <div className="tg-scrub-row">
                  <span>Frame {scrubTime.toFixed(1)}s</span>
                  <input
                    type="range"
                    min={0}
                    max={activeVideoRef.current?.duration || 60}
                    step={0.1}
                    value={scrubTime}
                    onChange={event => setScrubTime(parseFloat(event.target.value))}
                  />
                </div>
                <p className="tg-help-text">
                  Scrub to a stronger beat, then sharpen the promise until the frame sells itself.
                </p>
              </div>

              <div className="tg-edit-controls">
                <label>Creative System</label>
                <div className="tg-system-strip">
                  {DIRECTION_PRESETS.map(direction => (
                    <button
                      key={direction.id}
                      type="button"
                      className={`tg-system-chip ${directionId === direction.id ? "tg-system-chip-active" : ""}`}
                      onClick={() => setDirectionId(direction.id)}
                    >
                      {direction.name}
                    </button>
                  ))}
                </div>

                <label>Layout</label>
                <div className="tg-style-grid">
                  {STYLE_PRESETS.map(style => (
                    <button
                      key={style.id}
                      className={`tg-style-chip ${selectedStyleId === style.id ? "tg-style-chip-active" : ""}`}
                      onClick={() => setSelectedStyleId(style.id)}
                      type="button"
                    >
                      <strong>{style.name}</strong>
                      <span>{style.summary}</span>
                    </button>
                  ))}
                </div>

                <label>Eyebrow</label>
                <input
                  className="tg-input"
                  value={eyebrow}
                  onChange={event => setEyebrow(event.target.value.toUpperCase())}
                  maxLength={22}
                />

                <label>Headline</label>
                <input
                  className="tg-input"
                  value={headline}
                  onChange={event => setHeadline(event.target.value.toUpperCase())}
                  maxLength={44}
                />

                <label>Subtext</label>
                <input
                  className="tg-input"
                  value={subtext}
                  onChange={event => setSubtext(event.target.value)}
                  maxLength={70}
                />

                <label>Accent</label>
                <div className="tg-color-row">
                  {accentOptions.map(color => (
                    <button
                      key={color}
                      className={`tg-color-swatch ${accent === color ? "tg-color-swatch-active" : ""}`}
                      style={{ background: color }}
                      onClick={() => setAccent(color)}
                      type="button"
                    />
                  ))}
                </div>

                <label>Fast Suggestions</label>
                <div className="tg-suggestion-row">
                  {activeDirection.hooks.slice(0, 4).map(hook => (
                    <button
                      key={hook}
                      type="button"
                      className="tg-suggestion-chip"
                      onClick={() => setHeadline(hook)}
                    >
                      {hook}
                    </button>
                  ))}
                </div>

                <div className="tg-inline-actions">
                  <button className="tg-btn tg-btn-outline" type="button" onClick={remixCopy}>
                    Remix Copy
                  </button>
                  <button className="tg-btn tg-btn-primary" type="button" onClick={applyEditorChanges}>
                    Apply To Concepts
                  </button>
                </div>
                <button className="tg-btn tg-btn-ghost" type="button" onClick={() => setIsEditing(false)}>
                  Back To Concepts
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="tg-header tg-header-left">
              <div className="tg-mini-pill">Packaging Systems for 2027</div>
              <h2>Thumbnail Lab</h2>
              <p>
                We are not generating random templates here. We are building deliberate click
                packaging with stronger composition, cleaner proof, and more ownable visual taste.
              </p>
              <div className="tg-header-actions">
                {stage === "idle" && (
                  <button className="tg-btn tg-btn-primary" type="button" onClick={generateThumbnails}>
                    Generate 2027 Concepts
                  </button>
                )}
                {stage === "extracting" && (
                  <button className="tg-btn tg-btn-primary" type="button" disabled>
                    Reading signal from your video...
                  </button>
                )}
                {stage === "ready" && (
                  <>
                    <button className="tg-btn tg-btn-outline" type="button" onClick={generateThumbnails}>
                      Fresh Frames
                    </button>
                    <button className="tg-btn tg-btn-outline" type="button" onClick={regenerateCurrentSet}>
                      Rebuild Concepts
                    </button>
                    <button className="tg-btn tg-btn-outline" type="button" onClick={resetSystemCopy}>
                      Reset System Copy
                    </button>
                    <button className="tg-btn tg-btn-outline" type="button" onClick={openEditor}>
                      Customize
                    </button>
                    <button className="tg-btn tg-btn-primary" type="button" onClick={saveThumbnail} disabled={isUploading}>
                      {isUploading ? "Uploading..." : "Use This Thumbnail"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="tg-system-grid">
              {DIRECTION_PRESETS.map(direction => (
                <button
                  key={direction.id}
                  type="button"
                  className={`tg-system-card ${directionId === direction.id ? "tg-system-card-active" : ""}`}
                  onClick={() => applyDirection(direction.id)}
                >
                  <span className="tg-system-badge">{direction.badge}</span>
                  <strong>{direction.name}</strong>
                  <p>{direction.summary}</p>
                  <span className="tg-system-note">{direction.strategy}</span>
                </button>
              ))}
            </div>

            {stage === "idle" && (
              <div className="tg-empty-state">
                <div className="tg-empty-card">
                  <h3>Build thumbnails that feel like a real creative edge</h3>
                  <p>
                    This lab samples the strongest frames, audits whitespace and composition, and
                    packages them into distinct visual systems instead of cheap variation spam.
                  </p>
                  <ul>
                    <li>Finds frames with better subject separation and cleaner text lanes</li>
                    <li>Chooses a concept family with its own rhythm, not one repeated layout</li>
                    <li>Pushes your thumbnails toward sharper, more ownable visual language</li>
                  </ul>
                </div>
              </div>
            )}

            {stage === "ready" && selectedThumb && (
              <>
                <div className="tg-preview-shell">
                  <div className="tg-preview-section">
                    <canvas ref={previewCanvasRef} className="tg-preview-canvas" />
                    <div className="tg-preview-meta">
                      <span className="tg-metric-chip">{selectedThumb.directionName}</span>
                      <span className="tg-metric-chip">{selectedThumb.styleName}</span>
                      <span className="tg-metric-chip">Frame {selectedThumb.time}s</span>
                      <span className="tg-metric-chip">Score {selectedThumb.score}</span>
                    </div>
                  </div>

                  <aside className="tg-insight-panel">
                    <div className="tg-insight-card">
                      <span className="tg-insight-label">Creative System</span>
                      <strong>{selectedThumb.directionName}</strong>
                      <p>{activeDirection.strategy}</p>
                      <div className="tg-chip-row">
                        {selectedThumb.signalSummary.map(signal => (
                          <span key={signal} className="tg-metric-chip">
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="tg-insight-card">
                      <span className="tg-insight-label">Why This Frame</span>
                      <p>{selectedThumb.why}</p>
                    </div>

                    <div className="tg-insight-card">
                      <span className="tg-insight-label">Signal Audit</span>
                      <div className="tg-audit-list">
                        {selectedThumb.audit.slice(0, 5).map(entry => (
                          <div key={entry.label} className="tg-audit-row">
                            <span>{entry.label}</span>
                            <div className="tg-audit-bar">
                              <div className="tg-audit-fill" style={{ width: `${entry.value}%` }} />
                            </div>
                            <strong>{entry.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>

                <div className="tg-grid">
                  {thumbnails.map((thumb, index) => (
                    <div
                      key={`${thumb.styleId}-${thumb.time}-${index}`}
                      className={`tg-card ${index === selectedIndex ? "tg-card-selected" : ""}`}
                      onClick={() => {
                        setSelectedIndex(index);
                        setSelectedStyleId(thumb.styleId);
                      }}
                    >
                      <img src={thumb.dataUrl} alt={`${thumb.styleName} thumbnail`} className="tg-card-img" />
                      <div className="tg-card-overlay">
                        <span className="tg-card-style">{thumb.styleName}</span>
                        <span className="tg-card-score">{thumb.score}</span>
                      </div>
                      <div className="tg-card-footer">
                        <strong>{thumb.headline}</strong>
                        <span>{thumb.summary}</span>
                      </div>
                      <button
                        className="tg-card-dl"
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          downloadThumbnail(thumb);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {videoSrc && (
          <video
            ref={fallbackVideoRef}
            src={videoSrc}
            style={{ position: "fixed", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
            crossOrigin="anonymous"
            preload="auto"
          />
        )}
      </div>
    </div>
  );
}
