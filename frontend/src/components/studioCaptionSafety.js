/**
 * Client-side + server-orchestrated pixel face, head, and body awareness for Studio captions.
 *
 * When the media worker API is available for uploaded clips, it invokes YuNet + OpenCV
 * body-mask inspection on the server (`/api/media/analyze-caption-safety`). For local/fixture
 * videos and instant UI feedback, it decodes real `<video>` frames onto an offscreen `<canvas>`
 * and detects skin/head/upper-body/motion/edge occupancy across every caption cue.
 */

export const SMART_SAFE_CANDIDATE_ZONES = {
  background_center: [0.5, 0.16, 0.72, 0.14],
  background_left: [0.24, 0.18, 0.36, 0.18],
  background_right: [0.76, 0.18, 0.36, 0.18],
  top_center: [0.5, 0.11, 0.74, 0.13],
  top_left: [0.24, 0.12, 0.36, 0.18],
  top_right: [0.76, 0.12, 0.36, 0.18],
  bottom_center: [0.5, 0.84, 0.78, 0.15],
  bottom_left: [0.24, 0.83, 0.36, 0.18],
  bottom_right: [0.76, 0.83, 0.36, 0.18],
  side_left: [0.21, 0.49, 0.31, 0.28],
  side_right: [0.79, 0.49, 0.31, 0.28],
  shoulder_left: [0.24, 0.56, 0.32, 0.24],
  shoulder_right: [0.76, 0.56, 0.32, 0.24],
};

const STYLE_ZONE_AFFINITIES = {
  wall_type: { background_center: 0.22, background_left: 0.18, background_right: 0.18, top_center: 0.12 },
  editorial_duo: { side_left: 0.18, side_right: 0.18, shoulder_left: 0.12, shoulder_right: 0.12 },
  watch_me: { side_left: 0.16, side_right: 0.16, shoulder_left: 0.12, shoulder_right: 0.12 },
  story_pop: { bottom_center: 0.12, shoulder_left: 0.14, shoulder_right: 0.14, background_center: 0.14 },
  luxury: { side_right: 0.16, top_right: 0.14, bottom_right: 0.1 },
  newsroom: { top_center: 0.2, background_center: 0.12 },
  retro: { top_left: 0.18, background_left: 0.16, bottom_left: 0.1 },
  sticker: { top_left: 0.14, shoulder_right: 0.14, bottom_center: 0.12, background_left: 0.14 },
  editorial: { bottom_left: 0.18, side_left: 0.12 },
  word_pill: { bottom_center: 0.16, top_center: 0.08 },
  kinetic_bar: { bottom_center: 0.16, top_center: 0.08 },
  spring_slam: { bottom_center: 0.14, top_center: 0.1 },
  minimal: { bottom_center: 0.18, top_center: 0.08 },
};

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

const parseAspectRatioValue = aspect => {
  const key = String(aspect || "").trim().toLowerCase();
  if (key === "9:16") return 9 / 16;
  if (key === "16:9") return 16 / 9;
  if (key === "4:5") return 4 / 5;
  if (key === "1:1") return 1;
  return null;
};

/**
 * Pure pixel analyzer over an RGBA frame buffer (`Uint8ClampedArray` / `Uint8Array`).
 * Computes face/head occupancy (using FaceDetector boxes + skin head cluster fallback),
 * anatomical neck/shoulder/torso occupancy, foreground motion/subject silhouette, and
 * edge clutter across a normalized `width x height` frame.
 */
export function buildOccupancyFromRgbaFrame(rgba, width, height, options = {}) {
  const total = Math.max(1, width * height);
  const faceMask = new Float32Array(total);
  const bodyMask = new Float32Array(total);
  const clutterMask = new Float32Array(total);
  const skinMask = new Uint8Array(total);
  const luma = new Float32Array(total);
  const prevLuma = options.previousLuma || null;
  const externalFaces = Array.isArray(options.faceBoxes) ? options.faceBoxes : [];

  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    // Tighten warm human skin gate so indoor beige walls & glowing orange TV billboards never pass as skin
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const sat = maxCh > 0 ? (maxCh - minCh) / maxCh : 0;
    const glowingGraphic = (sat > 0.54 && maxCh > 120) || (r - b > 105 && maxCh > 170);
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const isSkin =
      !glowingGraphic &&
      r > 70 &&
      g > 36 &&
      b > 20 &&
      r - b > 26 &&
      r - g > 9 &&
      sat >= 0.21 &&
      sat <= 0.56 &&
      cb >= 78 &&
      cb <= 125 &&
      cr >= 141 &&
      cr <= 173;
    skinMask[i] = isSkin ? 1 : 0;
    if (glowingGraphic) {
      clutterMask[i] = 0.92;
    }
    if (prevLuma && prevLuma.length === total && Math.abs(luma[i] - prevLuma[i]) > 18) {
      bodyMask[i] = Math.max(bodyMask[i], 0.55);
    }
  }

  // Edge + illuminated billboard clutter map
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(luma[idx + 1] - luma[idx - 1]);
      const gy = Math.abs(luma[idx + width] - luma[idx - width]);
      clutterMask[idx] = Math.min(1, Math.max(clutterMask[idx], (gx + gy) / 145));
    }
  }

  const paintRect = (mask, x1n, y1n, x2n, y2n, val) => {
    const px1 = Math.max(0, Math.floor(clamp01(x1n) * width));
    const py1 = Math.max(0, Math.floor(clamp01(y1n) * height));
    const px2 = Math.min(width, Math.ceil(clamp01(x2n) * width));
    const py2 = Math.min(height, Math.ceil(clamp01(y2n) * height));
    for (let py = py1; py < py2; py += 1) {
      const rowOffset = py * width;
      for (let px = px1; px < px2; px += 1) {
        if (val > mask[rowOffset + px]) mask[rowOffset + px] = val;
      }
    }
  };

  const detectedFaces = [];
  if (externalFaces.length > 0) {
    for (const box of externalFaces) {
      const [x1, y1, x2, y2] = box;
      const fw = Math.max(0.03, x2 - x1);
      const fh = Math.max(0.03, y2 - y1);
      const hx1 = clamp01(x1 - fw * 0.22);
      const hy1 = clamp01(y1 - fh * 0.42);
      const hx2 = clamp01(x2 + fw * 0.22);
      const hy2 = clamp01(y2 + fh * 0.16);
      const cx = (x1 + x2) * 0.5;
      paintRect(faceMask, hx1, hy1, hx2, hy2, 1.0);
      paintRect(bodyMask, clamp01(cx - fw * 0.90), clamp01(y2 - fh * 0.05), clamp01(cx + fw * 0.90), clamp01(y2 + fh * 3.3), 0.85);
      detectedFaces.push([Number(hx1.toFixed(4)), Number(hy1.toFixed(4)), Number(hx2.toFixed(4)), Number(hy2.toFixed(4)), 0.9]);
    }
  } else {
    // Connected-component skin cluster estimation when browser FaceDetector is absent
    const visited = new Uint8Array(total);
    const minClusterPixels = Math.max(12, Math.round(total * 0.0045));
    const stack = [];
    for (let sy = 0; sy < Math.floor(height * 0.78); sy += 1) {
      for (let sx = 0; sx < width; sx += 1) {
        const startIdx = sy * width + sx;
        if (!skinMask[startIdx] || visited[startIdx]) continue;
        visited[startIdx] = 1;
        stack.length = 0;
        stack.push(startIdx);
        let count = 0;
        let minX = sx;
        let maxX = sx;
        let minY = sy;
        let maxY = sy;
        while (stack.length > 0) {
          const cur = stack.pop();
          const cx = cur % width;
          const cy = Math.floor(cur / width);
          count += 1;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          const neighbors = [
            cx > 0 ? cur - 1 : -1,
            cx + 1 < width ? cur + 1 : -1,
            cy > 0 ? cur - width : -1,
            cy + 1 < height ? cur + width : -1,
          ];
          for (let n = 0; n < 4; n += 1) {
            const ni = neighbors[n];
            if (ni >= 0 && !visited[ni] && skinMask[ni]) {
              visited[ni] = 1;
              stack.push(ni);
            }
          }
        }
        const cw = (maxX - minX + 1) / width;
        const ch = (maxY - minY + 1) / height;
        const areaFrac = count / total;
        const aspectRatio = cw / Math.max(0.01, ch);
        if (count >= minClusterPixels && areaFrac <= 0.16 && aspectRatio >= 0.4 && aspectRatio <= 1.85) {
          const x1 = minX / width;
          const y1 = minY / height;
          const x2 = (maxX + 1) / width;
          const y2 = (maxY + 1) / height;
          const fw = Math.max(0.04, x2 - x1);
          const fh = Math.max(0.04, y2 - y1);
          const hx1 = clamp01(x1 - fw * 0.18);
          const hy1 = clamp01(y1 - fh * 0.28);
          const hx2 = clamp01(x2 + fw * 0.18);
          const hy2 = clamp01(y2 + fh * 0.14);
          const cx = (x1 + x2) * 0.5;
          paintRect(faceMask, hx1, hy1, hx2, hy2, 0.95);
          paintRect(bodyMask, clamp01(cx - fw * 0.88), clamp01(y2 - fh * 0.05), clamp01(cx + fw * 0.88), clamp01(y2 + fh * 3.2), 0.8);
          detectedFaces.push([Number(hx1.toFixed(4)), Number(hy1.toFixed(4)), Number(hx2.toFixed(4)), Number(hy2.toFixed(4)), 0.72]);
        }
      }
    }
  }

  for (let i = 0; i < total; i += 1) {
    if (skinMask[i]) bodyMask[i] = Math.max(bodyMask[i], 0.55);
  }

  return { faceMask, bodyMask, clutterMask, luma, faces: detectedFaces, width, height };
}

export function scoreSafeZonesFromOccupancy({
  faceMask,
  bodyMask,
  clutterMask,
  width,
  height,
  styleName = "word_pill",
  captionScale = 1,
  preferredMode = "smart_safe",
  previousZone = null,
  cueText = "",
}) {
  const styleKey = String(styleName || "word_pill").trim().toLowerCase();
  const modeKey = String(preferredMode || "smart_safe").trim().toLowerCase();
  const affinities = STYLE_ZONE_AFFINITIES[styleKey] || {};
  const ratio = width / Math.max(1, height);
  const isPortrait = ratio < 0.88;
  const isSquare = ratio >= 0.88 && ratio < 1.15;
  const words = Math.max(1, String(cueText || "").trim().split(/\s+/).filter(Boolean).length);
  const lenFactor = words <= 3 ? 0.85 : words <= 6 ? 1.0 : 1.08;
  const clampedScale = Math.max(0.75, Math.min(1.35, Number(captionScale) || 1));

  const measureRect = (xc, yc, wf, hf) => {
    const rw = Math.min(0.92, wf * clampedScale);
    const rh = Math.min(0.42, hf * clampedScale);
    const x1 = Math.max(0, Math.min(width - 2, Math.round((xc - rw * 0.5) * width)));
    const y1 = Math.max(0, Math.min(height - 2, Math.round((yc - rh * 0.5) * height)));
    const x2 = Math.max(x1 + 2, Math.min(width, Math.round((xc + rw * 0.5) * width)));
    const y2 = Math.max(y1 + 2, Math.min(height, Math.round((yc + rh * 0.5) * height)));
    let fSum = 0;
    let fMax = 0;
    let bSum = 0;
    let bMax = 0;
    let cSum = 0;
    let area = 0;
    for (let y = y1; y < y2; y += 1) {
      const rowOffset = y * width;
      for (let x = x1; x < x2; x += 1) {
        const idx = rowOffset + x;
        const fv = faceMask[idx] || 0;
        const bv = bodyMask[idx] || 0;
        const cv = clutterMask[idx] || 0;
        fSum += fv;
        if (fv > fMax) fMax = fv;
        bSum += bv;
        if (bv > bMax) bMax = bv;
        cSum += cv;
        area += 1;
      }
    }
    const safeArea = Math.max(1, area);
    return {
      faceOverlap: 0.65 * (fSum / safeArea) + 0.35 * fMax,
      bodyOverlap: 0.75 * (bSum / safeArea) + 0.25 * bMax,
      edgeClutter: cSum / safeArea,
    };
  };

  const scored = Object.entries(SMART_SAFE_CANDIDATE_ZONES).map(([zone, [xc, yc, wf, hf]]) => {
    const aspectWidthAdj = isPortrait && !zone.startsWith("side_") ? 1.06 : isSquare ? 1.12 : 1;
    const adjWf = Math.min(0.86, wf * lenFactor * aspectWidthAdj);
    const { faceOverlap, bodyOverlap, edgeClutter } = measureRect(xc, yc, adjWf, hf);
    let affinity = faceOverlap < 0.04 ? Number(affinities[zone] || 0) : 0;
    if (modeKey === "side_by_side" && (zone === "side_left" || zone === "side_right") && faceOverlap < 0.04) {
      affinity += 0.25;
    } else if (["background_center", "background_left", "background_right"].includes(modeKey) && zone === modeKey) {
      affinity += 0.28;
    }
    let variety = 0;
    if (faceOverlap < 0.03 && bodyOverlap < 0.12) {
      if (["editorial_duo", "watch_me", "sticker", "story_pop"].includes(styleKey) && zone !== previousZone) {
        variety = 0.04;
      } else if (zone === previousZone) {
        variety = 0.02;
      }
    }
    const clutterExcess = Math.max(0, edgeClutter - 0.15);
    const cost =
      faceOverlap * 42 +
      (faceOverlap > 0.005 ? 3.5 : 0) +
      bodyOverlap * 14 +
      edgeClutter * 3.8 +
      clutterExcess * clutterExcess * 24 -
      affinity -
      variety;
    const safetyScore = Math.max(0, Math.min(1, 1 - Math.min(1, faceOverlap * 2.5 + bodyOverlap * 0.85 + edgeClutter * 0.32)));
    return {
      zone,
      cost,
      faceOverlap: Number(faceOverlap.toFixed(4)),
      bodyOverlap: Number(bodyOverlap.toFixed(4)),
      edgeClutter: Number(edgeClutter.toFixed(4)),
      safetyScore: Number(safetyScore.toFixed(3)),
      xPct: Number((xc * 100).toFixed(1)),
      yPct: Number((yc * 100).toFixed(1)),
    };
  });

  scored.sort((a, b) => a.cost - b.cost);
  let best = scored[0];

  if (best.faceOverlap > 0.005 || best.bodyOverlap > 0.025 || best.edgeClutter > 0.16 || modeKey === "smart_safe") {
    let customBest = null;
    for (const gy of [0.12, 0.2, 0.3, 0.44, 0.58, 0.72, 0.84]) {
      for (const gx of [0.16, 0.26, 0.38, 0.5, 0.62, 0.74, 0.84]) {
        const probeW = isPortrait ? 0.46 : isSquare ? 0.48 : 0.28;
        const { faceOverlap, bodyOverlap, edgeClutter } = measureRect(gx, gy, probeW, isSquare ? 0.15 : 0.14);
        const cxExcess = Math.max(0, edgeClutter - 0.15);
        const cost =
          faceOverlap * 42 +
          (faceOverlap > 0.005 ? 3.5 : 0) +
          bodyOverlap * 14 +
          edgeClutter * 3.8 +
          cxExcess * cxExcess * 24;
        if (cost + 0.06 < best.cost && (!customBest || cost < customBest.cost)) {
          const safetyScore = Math.max(0, Math.min(1, 1 - Math.min(1, faceOverlap * 2.5 + bodyOverlap * 0.85 + edgeClutter * 0.18)));
          customBest = {
            zone: "custom",
            cost,
            faceOverlap: Number(faceOverlap.toFixed(4)),
            bodyOverlap: Number(bodyOverlap.toFixed(4)),
            edgeClutter: Number(edgeClutter.toFixed(4)),
            safetyScore: Number(safetyScore.toFixed(3)),
            xPct: Number((gx * 100).toFixed(1)),
            yPct: Number((gy * 100).toFixed(1)),
          };
        }
      }
    }
    if (customBest) best = customBest;
  }

  return {
    placement: best.zone,
    xPct: best.xPct,
    yPct: best.yPct,
    faceOverlap: best.faceOverlap,
    bodyOverlap: best.bodyOverlap,
    edgeClutter: best.edgeClutter,
    safetyScore: best.safetyScore,
    safe: best.faceOverlap < 0.06,
    blockedZones: scored.filter(item => item.faceOverlap >= 0.08 || item.bodyOverlap >= 0.35).map(item => item.zone),
  };
}

/**
 * Sample decoded video frames from an HTMLVideoElement onto an offscreen canvas at cue boundaries
 * and evaluate face/body occupancy per cue. Restores original playhead afterward.
 */
export async function analyzeCaptionSegmentsInBrowser(
  videoElement,
  segments,
  {
    styleName = "word_pill",
    captionScale = 1,
    preferredMode = "smart_safe",
    aspect = null,
    cropX = 50,
    cropY = 50,
  } = {}
) {
  const list = Array.isArray(segments) ? segments : [];
  if (!videoElement || !list.length || typeof document === "undefined") {
    return {
      segments: list,
      summary: { cuesAnalyzed: 0, averageSafetyScore: 1, facesDetectedCues: 0, adjustedCues: 0, engine: "unavailable" },
    };
  }
  const srcW = Number(videoElement.videoWidth || 640);
  const srcH = Number(videoElement.videoHeight || 360);
  if (srcW < 16 || srcH < 16) {
    return {
      segments: list,
      summary: { cuesAnalyzed: 0, averageSafetyScore: 1, facesDetectedCues: 0, adjustedCues: 0, engine: "no-video-dimensions" },
    };
  }

  const targetRatio = parseAspectRatioValue(aspect);
  const srcRatio = srcW / srcH;
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;
  if (targetRatio && Math.abs(srcRatio - targetRatio) >= 0.02) {
    if (srcRatio > targetRatio) {
      sw = Math.max(16, Math.min(srcW, Math.round(srcH * targetRatio)));
      sx = Math.round((srcW - sw) * clamp01(cropX / 100));
    } else {
      sh = Math.max(16, Math.min(srcH, Math.round(srcW / targetRatio)));
      sy = Math.round((srcH - sh) * clamp01(cropY / 100));
    }
  }

  const workW = 160;
  const workH = Math.max(90, Math.round((160 * sh) / Math.max(1, sw)));
  const canvas = document.createElement("canvas");
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { segments: list, summary: { cuesAnalyzed: 0, averageSafetyScore: 1, facesDetectedCues: 0, adjustedCues: 0, engine: "no-2d-canvas" } };
  }

  const nativeFaceDetector =
    typeof window !== "undefined" && typeof window.FaceDetector === "function"
      ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 6 })
      : null;

  const originalTime = Number(videoElement.currentTime || 0);
  const wasPaused = Boolean(videoElement.paused);
  if (!wasPaused) {
    try { videoElement.pause(); } catch (_) {}
  }

  const duration = Number.isFinite(videoElement.duration) && videoElement.duration > 0 ? videoElement.duration : 120;
  const sampleCache = new Map();
  let previousLuma = null;

  const seekAndSample = async ts => {
    const clamped = Math.max(0, Math.min(Math.max(0, duration - 0.04), Number(ts) || 0));
    const bucket = Math.round(clamped * 4);
    if (sampleCache.has(bucket)) return sampleCache.get(bucket);

    if (Math.abs(Number(videoElement.currentTime || 0) - clamped) > 0.03) {
      await new Promise(resolve => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          videoElement.removeEventListener("seeked", done);
          resolve();
        };
        videoElement.addEventListener("seeked", done, { once: true });
        try {
          videoElement.currentTime = clamped;
        } catch (_) {
          done();
        }
        window.setTimeout(done, 450);
      });
    }

    ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, workW, workH);
    const frameData = ctx.getImageData(0, 0, workW, workH).data;
    let faceBoxes = [];
    if (nativeFaceDetector) {
      try {
        const detections = await nativeFaceDetector.detect(canvas);
        faceBoxes = (detections || []).map(d => {
          const b = d.boundingBox;
          return [b.x / workW, b.y / workH, (b.x + b.width) / workW, (b.y + b.height) / workH];
        });
      } catch (_) {
        faceBoxes = [];
      }
    }
    const occ = buildOccupancyFromRgbaFrame(frameData, workW, workH, { previousLuma, faceBoxes });
    previousLuma = occ.luma;
    sampleCache.set(bucket, occ);
    return occ;
  };

  try {
    const updatedSegments = [];
    let previousZone = null;
    let facesDetectedCues = 0;
    let adjustedCues = 0;
    let safetySum = 0;

    for (let idx = 0; idx < list.length; idx += 1) {
      const seg = list[idx];
      const start = Number(seg?.start ?? seg?.start_time ?? 0);
      const end = Math.max(start + 0.4, Number(seg?.end ?? seg?.end_time ?? start + 1));
      const mid = (start + end) / 2;
      const samples = [];
      for (const t of [start + 0.08 * (end - start), mid, Math.max(mid, end - 0.08 * (end - start))]) {
        // eslint-disable-next-line no-await-in-loop
        samples.push(await seekAndSample(t));
      }

      const len = workW * workH;
      const faceUnion = new Float32Array(len);
      const bodyUnion = new Float32Array(len);
      const clutterMean = new Float32Array(len);
      for (let i = 0; i < len; i += 1) {
        let fM = 0;
        let bM = 0;
        let cS = 0;
        for (const s of samples) {
          if (s.faceMask[i] > fM) fM = s.faceMask[i];
          if (s.bodyMask[i] > bM) bM = s.bodyMask[i];
          cS += s.clutterMask[i];
        }
        faceUnion[i] = fM;
        bodyUnion[i] = bM;
        clutterMean[i] = cS / samples.length;
      }

      const midSample = samples[Math.floor(samples.length / 2)];
      const decision = scoreSafeZonesFromOccupancy({
        faceMask: faceUnion,
        bodyMask: bodyUnion,
        clutterMask: clutterMean,
        width: workW,
        height: workH,
        styleName,
        captionScale,
        preferredMode,
        previousZone,
        cueText: seg?.text || "",
      });
      if (midSample.faces.length > 0) facesDetectedCues += 1;
      safetySum += decision.safetyScore;
      if (seg?.captionPlacement !== decision.placement) adjustedCues += 1;
      previousZone = decision.placement;

      updatedSegments.push({
        ...seg,
        captionPlacement: decision.placement,
        captionX: decision.xPct,
        captionY: decision.yPct,
        captionSafety: {
          ...decision,
          facesDetected: midSample.faces.length,
          faces: midSample.faces,
        },
      });
    }

    return {
      segments: updatedSegments,
      summary: {
        cuesAnalyzed: updatedSegments.length,
        averageSafetyScore: Number((safetySum / Math.max(1, updatedSegments.length)).toFixed(3)),
        facesDetectedCues,
        adjustedCues,
        zeroFaceOverlapCues: updatedSegments.filter(s => Number(s.captionSafety?.faceOverlap || 0) < 0.04).length,
        engine: nativeFaceDetector ? "browser-face-detector+canvas" : "browser-canvas-skin-silhouette",
      },
    };
  } finally {
    try {
      videoElement.currentTime = originalTime;
      videoElement.dispatchEvent(new Event("timeupdate"));
    } catch (_) {}
  }
}

/**
 * Analyze caption segments avoiding faces & bodies via server worker (when API + source available)
 * with instant local pixel-level HTML5 Canvas fallback so offline/local previews work identically.
 */
export async function analyzeCaptionSegmentsFaceAndBodySafety({
  apiBaseUrl = "",
  authToken = "",
  sourceFile = null,
  sourceUrl = "",
  videoElement = null,
  segments = [],
  styleName = "word_pill",
  captionScale = 1,
  preferredMode = "smart_safe",
  aspect = null,
  cropX = 50,
  cropY = 50,
} = {}) {
  const list = Array.isArray(segments) ? segments : [];
  if (!list.length) {
    return {
      segments: [],
      summary: { cuesAnalyzed: 0, averageSafetyScore: 1, facesDetectedCues: 0, adjustedCues: 0, engine: "empty" },
    };
  }

  const canTryServer =
    Boolean(apiBaseUrl && authToken && (sourceFile || (sourceUrl && /^https?:\/\//i.test(sourceUrl) && !/127\.0\.0\.1|localhost/i.test(sourceUrl))));

  if (canTryServer) {
    try {
      let response;
      if (sourceFile) {
        const body = new FormData();
        body.append("file", sourceFile);
        body.append("segments", JSON.stringify(list));
        body.append("styleName", String(styleName || "word_pill"));
        body.append("captionScale", String(captionScale || 1));
        body.append("preferredMode", String(preferredMode || "smart_safe"));
        if (aspect) body.append("aspect", String(aspect));
        body.append("cropX", String(cropX ?? 50));
        body.append("cropY", String(cropY ?? 50));
        response = await fetch(`${apiBaseUrl}/api/media/analyze-caption-safety`, {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
          body,
        });
      } else {
        response = await fetch(`${apiBaseUrl}/api/media/analyze-caption-safety`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            videoUrl: sourceUrl,
            segments: list,
            styleName,
            captionScale,
            preferredMode,
            aspect,
            cropX,
            cropY,
          }),
        });
      }
      if (response && response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload?.segments) && payload.segments.length) {
          return {
            segments: payload.segments,
            summary: { ...(payload.summary || {}), engine: "python-yunet-body-worker" },
          };
        }
      }
    } catch (_) {
      // Fall cleanly through to local video frame canvas analysis
    }
  }

  return analyzeCaptionSegmentsInBrowser(videoElement, list, {
    styleName,
    captionScale,
    preferredMode,
    aspect,
    cropX,
    cropY,
  });
}
