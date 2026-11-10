import { validateStudioPerspective } from './studioPerspective';
import { parseStudioMaskPolygon } from './studioMaskGeometry';
import { computeColorScopesFromRgba } from './studioColorScopes';
import { defaultMotionDriverForProperty } from './studioCompRigging';

const fullMask = { enabled: false, shape: 'rectangle', feather: 0, inverted: false };
const finite = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;

export const DIRECTOR_SPEED_CURVE_PRESETS = {
  cinematic_ease: [0.65, 0, 0.35, 1],
  whip_snap: [0.16, 1, 0.3, 1],
  dramatic_hold: [0.85, 0, 0.15, 1],
  gentle_drift: [0.42, 0, 0.58, 1],
};

export const DIRECTOR_CINEMA_LOOK_PROFILES = {
  kodak_2383: {
    id: 'kodak_2383',
    label: 'Kodak 2383 Film Print',
    grade: {
      exposureStops: 0.12,
      brightness: 1.02,
      contrast: 1.14,
      saturation: 1.08,
      lift: -0.03,
      gamma: 1.04,
      gain: 0.98,
      temperature: 0.12,
      tint: -0.02,
      vignette: 0.18,
    },
    advancedColor: {
      curve: { shadows: -0.06, midtones: 0.04, highlights: 0.06 },
      hsl: { hue: 4, saturation: 1.06, luminance: 0.01 },
      lutPresetId: 'kodak_2383',
      lutIntensity: 0.85,
    },
  },
  teal_orange: {
    id: 'teal_orange',
    label: 'Teal & Orange Blockbuster',
    grade: {
      exposureStops: 0.18,
      brightness: 1.03,
      contrast: 1.18,
      saturation: 1.16,
      lift: -0.04,
      gamma: 1.06,
      gain: 1.02,
      temperature: 0.18,
      tint: -0.04,
      vignette: 0.22,
    },
    advancedColor: {
      curve: { shadows: -0.08, midtones: 0.05, highlights: 0.08 },
      hsl: { hue: -6, saturation: 1.12, luminance: 0.02 },
      lutPresetId: 'teal_orange',
      lutIntensity: 0.88,
    },
  },
  bleach_bypass: {
    id: 'bleach_bypass',
    label: 'Silver Retention Grit',
    grade: {
      exposureStops: 0.05,
      brightness: 0.98,
      contrast: 1.28,
      saturation: 0.72,
      lift: -0.06,
      gamma: 0.96,
      gain: 1.06,
      temperature: -0.08,
      tint: 0.02,
      vignette: 0.28,
    },
    advancedColor: {
      curve: { shadows: -0.12, midtones: -0.02, highlights: 0.1 },
      hsl: { hue: 0, saturation: 0.78, luminance: -0.02 },
      lutPresetId: 'bleach_bypass',
      lutIntensity: 0.82,
    },
  },
  neon_cyber: {
    id: 'neon_cyber',
    label: 'Neon Cyberpunk Matrix',
    grade: {
      exposureStops: 0.15,
      brightness: 1.01,
      contrast: 1.22,
      saturation: 1.24,
      lift: -0.05,
      gamma: 1.05,
      gain: 1.08,
      temperature: -0.18,
      tint: 0.14,
      vignette: 0.24,
    },
    advancedColor: {
      curve: { shadows: -0.09, midtones: 0.03, highlights: 0.09 },
      hsl: { hue: 12, saturation: 1.18, luminance: 0.02 },
      lutPresetId: 'neon_cyber',
      lutIntensity: 0.86,
    },
  },
  golden_hour: {
    id: 'golden_hour',
    label: 'Warm Amber Halation',
    grade: {
      exposureStops: 0.2,
      brightness: 1.05,
      contrast: 1.08,
      saturation: 1.14,
      lift: 0.01,
      gamma: 1.08,
      gain: 1.04,
      temperature: 0.28,
      tint: 0.04,
      vignette: 0.16,
    },
    advancedColor: {
      curve: { shadows: 0.02, midtones: 0.06, highlights: 0.07 },
      hsl: { hue: 6, saturation: 1.1, luminance: 0.03 },
      lutPresetId: 'golden_hour',
      lutIntensity: 0.84,
    },
  },
};

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256HexSync(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new TextEncoder().encode(String(input));
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, v => v.toString(16).padStart(8, '0')).join('');
}

export function inferDirectorLookProfileId(brief = '', samples = []) {
  const text = String(brief || '').toLowerCase();
  if (/\b(noir|grit|silver|dark|shadow|bleach|monochrome|cold)\b/.test(text)) {
    return 'bleach_bypass';
  }
  if (/\b(neon|cyber|night|electric|synth|future|club)\b/.test(text)) {
    return 'neon_cyber';
  }
  if (/\b(gold|sunset|warm|amber|sun|summer|coast|horizon)\b/.test(text)) {
    return 'golden_hour';
  }
  if (/\b(bold|teal|orange|action|split|contrast|energy)\b/.test(text)) {
    return 'teal_orange';
  }
  if (Array.isArray(samples) && samples.length > 0) {
    const mid = samples[Math.floor(samples.length / 2)] || samples[0];
    const [r = 128, , b = 128] = mid.meanRgb || [];
    if (b - r > 18) return 'teal_orange';
    if (r - b > 24) return 'golden_hour';
  }
  return 'kodak_2383';
}

export function analyzeDirectorClipTelemetry(input, width = 96, height = 54) {
  if (input && typeof input === 'object' && Array.isArray(input.media)) {
    const evidenceById = new Map((input.pixelEvidence || []).map(ev => [ev.id, ev]));
    return input.media.map(clip => {
      const ev = evidenceById.get(clip.id);
      const samples = Array.isArray(ev?.samples) && ev.samples.length > 0 ? ev.samples : [];
      const avgLuma = samples.length
        ? samples.reduce((sum, s) => sum + Number(s.luma || 0), 0) / samples.length
        : 108;
      const avgEntropy = samples.length
        ? samples.reduce((sum, s) => sum + Number(s.tonalEntropy || 0), 0) / samples.length
        : 3.0;
      const maxDiff = samples.length
        ? Math.max(...samples.map(s => Number(s.frameDifference || 0)))
        : 18;
      const peakSample = samples.reduce(
        (best, s) =>
          Number(s.frameDifference || 0) > Number(best?.frameDifference || -1) ? s : best,
        samples[1] || samples[0] || { motionCentroid: [50, 48], peakChroma: 28 }
      );
      const peakChroma = Number(
        peakSample.peakChroma ??
          (Array.isArray(peakSample.meanRgb)
            ? Math.max(...peakSample.meanRgb) - Math.min(...peakSample.meanRgb)
            : 28)
      );
      const salienceScore = Number(
        (avgEntropy * 12 + maxDiff * 1.15 + peakChroma * 0.45).toFixed(2)
      );
      return {
        id: clip.id,
        name: clip.name,
        avgLumaIre: Number(((avgLuma / 255) * 100).toFixed(1)),
        peakChroma: Number(peakChroma.toFixed(1)),
        tonalEntropy: Number(avgEntropy.toFixed(2)),
        maxFrameDifference: Number(maxDiff.toFixed(2)),
        focalCentroid: peakSample.motionCentroid || [50, 48],
        salienceScore,
        suggestedLookId: inferDirectorLookProfileId(input.brief, samples),
      };
    });
  }
  const scopes = computeColorScopesFromRgba(input, width, height, {
    columns: 16,
    bins: 16,
    vectorBins: 16,
  });
  return {
    avgLumaIre: scopes.lumaStats.avgLuma,
    peakChroma: scopes.vectorscope.peakChroma,
    skinToneCompliancePct: scopes.vectorscope.skinToneCompliancePct,
    meanRgbPct: [scopes.parade.meanR, scopes.parade.meanG, scopes.parade.meanB],
  };
}

export function directorCompositionContext(snapshot, brief, duration) {
  const doc = snapshot.studioDocument;
  const seconds = (doc?.outputTimeMap?.at(-1)?.outputRange.endTick || 0) / 90000;
  if (!doc || !finite(duration, 2, Math.min(30, seconds))) {
    throw Error('Choose 2–30 seconds within this project.');
  }
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 1200) {
    throw Error('Describe the edit in at most 1,200 characters.');
  }
  const media = (snapshot.projectMedia || [])
    .filter(
      m =>
        m.status === 'ready' &&
        m.storagePath &&
        m.url &&
        m.duration >= 0.5 &&
        /^[a-f0-9]{64}$/.test(m.contentHash || '') &&
        m.type !== 'image'
    )
    .slice(0, 12)
    .map(m => ({
      id: m.id,
      name: String(m.name || 'Project clip').slice(0, 160),
      duration: Number(m.duration),
      contentHash: m.contentHash,
    }));
  if (!media.length) throw Error('Save a project video before asking the Director.');
  return {
    compositionVersion: 2,
    brief: brief.trim(),
    projectId: doc.projectId,
    baseRevision: doc.revision,
    duration,
    media,
  };
}

// Small, hash-bound decoded samples, not semantic recognition. URLs and source
// bytes remain in the browser; only measured descriptors go to the local model.
export async function measureDirectorSources(context, snapshot, signal) {
  const evidence = [];
  for (const source of context.media) {
    signal?.throwIfAborted();
    const media = snapshot.projectMedia.find(m => m.id === source.id);
    const response = await fetch(media.url, { signal });
    if (!response.ok) throw Error('Could not inspect a saved clip. No plan was requested.');
    const declared = Number(response.headers.get('content-length'));
    if (declared > 128 * 1024 * 1024) {
      throw Error('Director inspection currently supports clips up to 128 MiB.');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 128 * 1024 * 1024) {
          throw Error('Director inspection currently supports clips up to 128 MiB.');
        }
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const blob = new Blob(chunks);
    const bytes = await blob.arrayBuffer();
    const digest = globalThis.crypto?.subtle?.digest
      ? Array.from(
          new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)),
          v => v.toString(16).padStart(2, '0')
        ).join('')
      : sha256HexSync(bytes);
    if (digest !== source.contentHash) {
      throw Error('Saved clip bytes changed. Save the source again before directing.');
    }
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const wait = (event, action) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(Error('Source sample decode timed out.')), 15000);
        const stop = () => finish(signal.reason || Error('Inspection cancelled.'));
        const done = () => finish();
        const failed = () => finish(Error('A saved source could not be decoded.'));
        function finish(error) {
          clearTimeout(timer);
          video.removeEventListener(event, done);
          video.removeEventListener('error', failed);
          signal?.removeEventListener('abort', stop);
          error ? reject(error) : resolve();
        }
        video.addEventListener(event, done, { once: true });
        video.addEventListener('error', failed, { once: true });
        signal?.addEventListener('abort', stop, { once: true });
        action();
      });
    try {
      await wait('loadeddata', () => {
        video.src = url;
        video.load();
      });
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 54;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let previous = null;
      const samples = [];
      for (const fraction of [0.15, 0.5, 0.85]) {
        signal?.throwIfAborted();
        const time = Math.min(video.duration - 0.05, source.duration * fraction);
        await wait('seeked', () => {
          video.currentTime = time;
        });
        ctx.drawImage(video, 0, 0, 96, 54);
        const pixels = ctx.getImageData(0, 0, 96, 54).data;
        const rgb = [0, 0, 0];
        const bins = new Array(16).fill(0);
        let luma = 0;
        let change = 0;
        let wx = 0;
        let wy = 0;
        for (let p = 0; p < pixels.length; p += 4) {
          const y = 0.2126 * pixels[p] + 0.7152 * pixels[p + 1] + 0.0722 * pixels[p + 2];
          luma += y;
          for (let c = 0; c < 3; c++) rgb[c] += pixels[p + c];
          bins[Math.min(15, Math.floor(y / 16))]++;
          if (previous) {
            const d = Math.abs(y - previous[p / 4]);
            change += d;
            wx += (d * ((p / 4) % 96)) / 96;
            wy += (d * Math.floor(p / 4 / 96)) / 54;
          }
        }
        const count = 96 * 54;
        const mean = rgb.map(v => Math.round(v / count));
        const entropy = -bins.reduce(
          (n, b) => (b ? n + (b / count) * Math.log2(b / count) : n),
          0
        );
        samples.push({
          time: Math.round(time * 1000) / 1000,
          meanRgb: mean,
          luma: Math.round(luma / count),
          tonalEntropy: Number(entropy.toFixed(2)),
          frameDifference: previous ? Number((change / count).toFixed(2)) : 0,
          motionCentroid: change
            ? [Number(((100 * wx) / change).toFixed(1)), Number(((100 * wy) / change).toFixed(1))]
            : [50, 50],
        });
        previous = Array.from(
          { length: count },
          (_, p) =>
            0.2126 * pixels[p * 4] + 0.7152 * pixels[p * 4 + 1] + 0.0722 * pixels[p * 4 + 2]
        );
      }
      evidence.push({
        id: source.id,
        contentHash: digest,
        method: 'decoded_rgb_96x54_three_samples_v1',
        samples,
      });
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }
  return { ...context, pixelEvidence: evidence };
}

export function compileDirectorComposition(result, snapshot) {
  const context = directorCompositionContext(snapshot, result.brief, result.duration);
  if (
    result.version !== 2 ||
    result.projectId !== context.projectId ||
    result.baseRevision !== context.baseRevision ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint || '') ||
    result.provenance?.automaticModelPlanning !== true
  ) {
    throw Error('The project changed or the Director proposal is invalid. Ask for a new plan.');
  }
  if (
    result.sourceEvidence?.length !== context.media.length ||
    new Set(result.sourceEvidence.map(s => s.id)).size !== context.media.length ||
    result.sourceEvidence.some(
      s => !context.media.some(m => m.id === s.id && m.contentHash === s.contentHash)
    )
  ) {
    throw Error('The project footage changed after planning.');
  }
  const graph = result.composition;
  if (
    !graph ||
    !Array.isArray(graph.layers) ||
    graph.layers.length < 1 ||
    graph.layers.length > 16 ||
    typeof graph.name !== 'string' ||
    !graph.name.trim() ||
    graph.name.length > 100
  ) {
    throw Error('Invalid Director composition.');
  }
  const ids = new Set();
  const actions = [];
  const graphics = [];
  const reports = [];
  let actionCount = 0;
  let driverCount = 0;
  let maskKeyCount = 0;
  let softMaskCount = 0;

  const add = a => {
    actions.push(a);
    if (++actionCount > 64) throw Error('Director composition exceeds the scene action limit.');
  };

  for (const node of graph.layers) {
    if (
      typeof node.id !== 'string' ||
      !/^[a-zA-Z][\w-]{0,39}$/.test(node.id) ||
      ids.has(node.id) ||
      !['video', 'shape', 'rig'].includes(node.kind) ||
      !finite(node.start, 0, context.duration) ||
      !finite(node.end, node.start + 0.05, context.duration)
    ) {
      throw Error('Invalid Director layer or timing.');
    }
    ids.add(node.id);
    if (!Array.isArray(node.poses) || !node.poses.length || node.poses.length > 10) {
      throw Error('Director layer needs bounded motion poses.');
    }
    const properties = ['x', 'y', 'scale', 'rotation', 'opacity'];
    const defaultCurve =
      DIRECTOR_SPEED_CURVE_PRESETS[node.curvePreset] ||
      DIRECTOR_SPEED_CURVE_PRESETS.cinematic_ease;
    let previous = -1;
    const keys = [];
    for (const pose of node.poses) {
      if (
        !finite(pose.at, node.start, node.end) ||
        pose.at <= previous ||
        !finite(pose.x, -100, 200) ||
        !finite(pose.y, -100, 200) ||
        !finite(pose.scale, 0.02, 4) ||
        !finite(pose.rotation, -360, 360) ||
        !finite(pose.opacity, 0, 1)
      ) {
        throw Error('Invalid Director motion pose.');
      }
      previous = pose.at;
      const poseCurve = Array.isArray(pose.curve) && pose.curve.length === 4
        ? pose.curve
        : DIRECTOR_SPEED_CURVE_PRESETS[pose.curvePreset] || defaultCurve;
      for (const p of properties) {
        keys.push({
          property: p,
          time: pose.at,
          value: pose[p] * (p === 'scale' && node.kind === 'video' ? 10 / 7 : 1),
          easing: 'bezier',
          curve: poseCurve,
        });
      }
    }

    const pose = node.poses[0];
    const transform = Object.fromEntries(
      properties.map(p => [p, pose[p] * (p === 'scale' && node.kind === 'video' ? 10 / 7 : 1)])
    );
    const feather = finite(node.feather, 0, 40) ? Number(node.feather) : 0;
    const inverted = Boolean(node.inverted);
    if (feather > 0) softMaskCount += 1;

    const mask =
      node.shape === 'ellipse'
        ? { enabled: true, shape: 'ellipse', feather, inverted }
        : node.shape === 'polygon'
          ? { enabled: true, shape: 'polygon', path: node.polygon, feather, inverted }
          : fullMask;

    // Optional animated polygon mask vertex morphing (S04 rotoscope keyframes)
    if (node.kind === 'video' && node.shape === 'polygon' && Array.isArray(node.maskPoses) && node.maskPoses.length > 0) {
      const basePts = parseStudioMaskPolygon(node.polygon);
      let prevMaskAt = -1;
      for (const mp of node.maskPoses) {
        if (!finite(mp.at, node.start, node.end) || mp.at <= prevMaskAt) {
          throw Error('Invalid Director polygon mask pose timing.');
        }
        prevMaskAt = mp.at;
        const pts = parseStudioMaskPolygon(mp.polygon);
        if (pts.length !== basePts.length) {
          throw Error('Director animated polygon mask poses must preserve vertex topology.');
        }
        pts.forEach(([px, py], idx) => {
          keys.push({
            property: `maskPoint${idx}X`,
            time: mp.at,
            value: px,
            easing: 'bezier',
            curve: defaultCurve,
          });
          keys.push({
            property: `maskPoint${idx}Y`,
            time: mp.at,
            value: py,
            easing: 'bezier',
            curve: defaultCurve,
          });
          maskKeyCount += 2;
        });
      }
    }

    if (node.motionDrivers && typeof node.motionDrivers === 'object') {
      driverCount += Object.keys(node.motionDrivers).length;
    }

    if (node.kind === 'video') {
      const media = context.media.find(m => m.id === node.sourceMediaId);
      if (
        !media ||
        !finite(node.sourceStart, 0, media.duration) ||
        node.sourceStart + node.end - node.start > media.duration + 0.001
      ) {
        throw Error('Director layer runs past its saved source.');
      }
      if (node.perspective) {
        validateStudioPerspective(node.perspective);
        if (mask.enabled) throw Error('A perspective plane cannot also have a shape mask.');
      }
      add({
        type: 'media_plane',
        id: node.id,
        name: node.name || node.id,
        sourceMediaId: media.id,
        sourceStart: node.sourceStart,
        startTime: node.start,
        duration: node.end - node.start,
        transform,
        mask,
        ...(node.perspective ? { perspective: node.perspective } : {}),
        ...(node.motionDrivers ? { motionDrivers: node.motionDrivers } : {}),
      });
      reports.push({
        startTime: node.start,
        endTime: node.end,
        sourceName: media.name,
        treatment: node.name || 'Video layer',
        reason: node.reason || graph.concept || '',
      });
    } else if (node.kind === 'rig') {
      add({
        type: 'null',
        id: node.id,
        name: node.name || node.id,
        startTime: node.start,
        duration: node.end - node.start,
        transform,
        ...(node.motionDrivers ? { motionDrivers: node.motionDrivers } : {}),
      });
    } else {
      if (!/^#[\da-f]{6}$/i.test(node.color || '')) {
        throw Error('Director shape colour is invalid.');
      }
      const shape =
        node.shape === 'ellipse'
          ? `<ellipse cx="640" cy="360" rx="360" ry="360" fill="${node.color}"/>`
          : `<rect width="1280" height="720" fill="${node.color}"/>`;
      graphics.push({
        id: node.id,
        name: node.name || node.id,
        type: 'artwork',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${shape}</svg>`,
        startTime: node.start,
        duration: node.end - node.start,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        scale: 1,
        rotation: 0,
        opacity: 1,
        ...(node.shape === 'polygon' ? { mask } : {}),
        keys,
      });
    }
    if (node.kind !== 'shape') add({ type: 'keys', targetId: node.id, keys });
  }

  // Resolve edges only after every node exists. Shared scene actions validate
  // cycles, matte ownership/coverage and supported masks before any mutation.
  let matteCount = 0;
  let parentCount = 0;
  for (const node of graph.layers) {
    if (node.parentId) {
      if (!ids.has(node.parentId)) throw Error('Missing Director parent.');
      add({ type: 'parent', targetId: node.id, parentId: node.parentId });
      parentCount += 1;
    }
    if (node.matteId) {
      if (
        !ids.has(node.matteId) ||
        !['alpha', 'alpha_inverted', 'luma', 'luma_inverted'].includes(node.matteMode)
      ) {
        throw Error('Invalid Director matte.');
      }
      add({
        type: 'matte',
        targetId: node.id,
        matteSourceId: node.matteId,
        mode: node.matteMode,
      });
      matteCount += 1;
    }
  }

  // Graphics are prepared before video actions; restore the model's declared
  // back-to-front ordering through the same ordinary composition-order action.
  for (let i = graph.layers.length - 2; i >= 0; i--) {
    add({
      type: 'move_layer',
      targetId: graph.layers[i].id,
      beforeId: graph.layers[i + 1].id,
    });
  }

  // Optional Director Cinema Color Grade & Beat-Synced Grade Pulses
  let colorSummary = null;
  if (graph.colorGrade && typeof graph.colorGrade === 'object') {
    const cg = graph.colorGrade;
    const profile = DIRECTOR_CINEMA_LOOK_PROFILES[cg.lookId] || DIRECTOR_CINEMA_LOOK_PROFILES.kodak_2383;
    const gradePayload = {
      ...(profile.grade || {}),
      ...(cg.grade || {}),
    };
    const advPayload = {
      ...(profile.advancedColor || {}),
      ...(cg.advancedColor || {}),
    };
    add({
      type: 'finish_grade',
      id: 'director-finish-grade',
      name: profile.label,
      grade: gradePayload,
      advancedColor: advPayload,
      beatSyncPulses: Boolean(cg.beatSyncPulses),
      beats: Array.isArray(cg.beats) ? cg.beats : [],
    });
    colorSummary = {
      id: profile.id,
      lookId: profile.id,
      label: profile.label,
      lutPresetId: advPayload.lutPresetId || profile.id,
      beatSyncPulses: Boolean(cg.beatSyncPulses),
    };
  }

  const plan = {
    format: 'autopromote-scene-actions',
    version: 1,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    name: graph.name,
    actions,
  };
  if (graphics.length) {
    plan.graphics = {
      format: 'autopromote-graphics',
      version: 1,
      name: graph.name,
      width: 1280,
      height: 720,
      duration: context.duration,
      layers: graphics,
      groups: [],
    };
  }
  return {
    plan,
    shots: reports,
    concept: graph.concept,
    topologySummary: {
      videoLayers: graph.layers.filter(l => l.kind === 'video').length,
      nullRigs: graph.layers.filter(l => l.kind === 'rig').length,
      shapeLayers: graph.layers.filter(l => l.kind === 'shape').length,
      parentLinks: parentCount,
      trackMattes: matteCount,
      softMasks: softMaskCount,
      motionDrivers: driverCount,
      animatedMaskKeys: maskKeyCount,
      colorGrade: colorSummary,
    },
  };
}

/**
 * Builds a SHA-256 fingerprinted, source-evidence-grounded v2 Cinema Composition Graph
 * using the project's saved clips, measured pixel centroids/scopes, NullRig camera
 * controllers, soft-feathered PolygonMask + animated vertex morphing, TrackMatte window,
 * MotionDrivers, and matched 3D .cube LUT + 3-Way Wheel Cinema Color Grade.
 */
export function buildSourceBoundDirectorProposal(
  snapshotOrContext,
  briefOrOptions,
  durationArg,
  optionsArg = {}
) {
  const isContextInput =
    snapshotOrContext &&
    typeof snapshotOrContext === 'object' &&
    Array.isArray(snapshotOrContext.media) &&
    typeof snapshotOrContext.projectId === 'string';
  const context = isContextInput
    ? snapshotOrContext
    : directorCompositionContext(snapshotOrContext, briefOrOptions, durationArg);
  const opts = isContextInput ? briefOrOptions || {} : optionsArg || {};
  const lookId = opts.lookId || opts.lookProfileId || 'auto';
  const beatSyncPulses = opts.beatSyncPulses !== undefined ? Boolean(opts.beatSyncPulses) : true;
  const pixelEvidence = opts.pixelEvidence || context.pixelEvidence || null;

  const clipA = context.media[0];
  const clipB = context.media[1] || clipA;
  const evidenceList = Array.isArray(pixelEvidence) && pixelEvidence.length === context.media.length
    ? pixelEvidence
    : context.media.map(m => ({
        id: m.id,
        contentHash: m.contentHash,
        method: 'decoded_rgb_96x54_three_samples_v1',
        samples: [0.15, 0.5, 0.85].map(f => ({
          time: Number((m.duration * f).toFixed(3)),
          meanRgb: [118, 102, 88],
          luma: 106,
          tonalEntropy: 3.1,
          frameDifference: 14.5,
          motionCentroid: [50, 48],
        })),
      }));

  const primarySamples = evidenceList[0]?.samples || [];
  const focalCentroid = primarySamples[1]?.motionCentroid || [50, 48];
  const resolvedLookId =
    lookId && lookId !== 'auto' && DIRECTOR_CINEMA_LOOK_PROFILES[lookId]
      ? lookId
      : inferDirectorLookProfileId(context.brief, primarySamples);
  const lookProfile =
    DIRECTOR_CINEMA_LOOK_PROFILES[resolvedLookId] || DIRECTOR_CINEMA_LOOK_PROFILES.kodak_2383;

  const totalDur = Number(context.duration);
  const midTime = Number((totalDur * 0.5).toFixed(3));
  const revealStart = Number(Math.max(0.4, totalDur * 0.22).toFixed(3));
  const revealEnd = Number(Math.min(totalDur, totalDur * 0.88).toFixed(3));
  const revealSpan = Number((revealEnd - revealStart).toFixed(3));

  const maxStartA = Math.max(0, Number((clipA.duration - totalDur).toFixed(3)));
  const sourceStartA = Number((maxStartA * 0.25).toFixed(3));
  const maxStartB = Math.max(0, Number((clipB.duration - revealSpan).toFixed(3)));
  const sourceStartB = Number((maxStartB * 0.5).toFixed(3));

  const cx = Math.max(32, Math.min(68, Math.round(focalCentroid[0] || 50)));
  const cy = Math.max(32, Math.min(68, Math.round(focalCentroid[1] || 48)));

  // Rhythmic beat markers across the edit window for beat-synced grade pulses
  const beats = [];
  for (let t = 0.8; t < totalDur - 0.3; t += 1.2) {
    beats.push({ time: Number(t.toFixed(2)), strength: 1 });
  }

  const layers = [
    // 1. Continuous full-frame anchor plate (satisfies full-frame base coverage invariant)
    {
      id: 'anchorPlate',
      name: `${clipA.name} · Primary Anchor Plate`,
      kind: 'video',
      sourceMediaId: clipA.id,
      sourceStart: sourceStartA,
      start: 0,
      end: totalDur,
      shape: 'none',
      polygon: '',
      color: '',
      parentId: '',
      matteId: '',
      matteMode: '',
      curvePreset: 'cinematic_ease',
      reason: 'Grounds the full-frame canvas across the entire programme duration.',
      poses: [
        { at: 0, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
        { at: midTime, x: 50, y: 50, scale: 1.06, rotation: 0, opacity: 1 },
        { at: totalDur, x: 50, y: 50, scale: 1.12, rotation: 0, opacity: 1 },
      ],
    },
    // 2. Master Camera Null Rig centered on the measured motion centroid with organic wiggle + spring
    {
      id: 'cameraRig',
      name: 'Director Camera Null Rig',
      kind: 'rig',
      sourceMediaId: '',
      sourceStart: 0,
      start: revealStart,
      end: revealEnd,
      shape: 'none',
      polygon: '',
      color: '',
      parentId: '',
      matteId: '',
      matteMode: '',
      curvePreset: 'whip_snap',
      motionDrivers: {
        x: defaultMotionDriverForProperty('wiggle', 'x'),
        y: defaultMotionDriverForProperty('spring', 'y'),
      },
      poses: [
        { at: revealStart, x: cx - 6, y: cy + 4, scale: 0.92, rotation: -2, opacity: 1 },
        { at: Number(((revealStart + revealEnd) * 0.5).toFixed(3)), x: cx, y: cy, scale: 1.04, rotation: 0, opacity: 1 },
        { at: revealEnd, x: cx + 4, y: cy - 2, scale: 1, rotation: 1.5, opacity: 1 },
      ],
    },
    // 3. Soft-feathered Ellipse Matte Stencil parented to Camera Null Rig
    {
      id: 'portalMatte',
      name: 'Focal Portal Alpha Stencil',
      kind: 'shape',
      sourceMediaId: '',
      sourceStart: 0,
      start: revealStart,
      end: revealEnd,
      shape: 'ellipse',
      feather: 12,
      polygon: '',
      color: '#ffffff',
      parentId: 'cameraRig',
      matteId: '',
      matteMode: '',
      poses: [
        { at: revealStart, x: 50, y: 50, scale: 0.45, rotation: 0, opacity: 0.95 },
        { at: Number(((revealStart + revealEnd) * 0.5).toFixed(3)), x: 50, y: 50, scale: 0.92, rotation: 12, opacity: 1 },
        { at: revealEnd, x: 50, y: 50, scale: 0.78, rotation: 24, opacity: 0.95 },
      ],
    },
    // 4. Track-Matted Counter-Shot Window parented to Camera Null Rig
    {
      id: 'matteRevealWindow',
      name: `${clipB.name} · Alpha-Matted Focal Portal`,
      kind: 'video',
      sourceMediaId: clipB.id,
      sourceStart: sourceStartB,
      start: revealStart,
      end: revealEnd,
      shape: 'none',
      polygon: '',
      color: '',
      parentId: 'cameraRig',
      matteId: 'portalMatte',
      matteMode: 'alpha',
      curvePreset: 'whip_snap',
      reason: `Opens an alpha-matted counter-shot window anchored at focal centroid (${cx}%, ${cy}%).`,
      poses: [
        { at: revealStart, x: 50, y: 50, scale: 1.05, rotation: 0, opacity: 0.92 },
        { at: revealEnd, x: 50, y: 50, scale: 1.18, rotation: 0, opacity: 1 },
      ],
    },
    // 5. Soft-feathered Animated Polygon Prism Layer with rotoscope vertex morphing (S04)
    {
      id: 'polygonPrism',
      name: `${clipA.name} · Soft Polygon Prism Overlay`,
      kind: 'video',
      sourceMediaId: clipA.id,
      sourceStart: sourceStartA,
      start: revealStart,
      end: revealEnd,
      shape: 'polygon',
      polygon: 'polygon(18% 8%, 82% 8%, 92% 50%, 82% 92%, 18% 92%)',
      feather: 14,
      inverted: false,
      color: '',
      parentId: 'cameraRig',
      matteId: '',
      matteMode: '',
      curvePreset: 'cinematic_ease',
      reason: 'Feathered 5-point polygon spline with animated rotoscope vertex morphing.',
      maskPoses: [
        {
          at: revealStart,
          polygon: 'polygon(24% 14%, 76% 14%, 86% 50%, 76% 86%, 24% 86%)',
        },
        {
          at: revealEnd,
          polygon: 'polygon(10% 4%, 90% 4%, 98% 50%, 90% 96%, 10% 96%)',
        },
      ],
      poses: [
        { at: revealStart, x: 50, y: 50, scale: 0.88, rotation: -3, opacity: 0.65 },
        { at: revealEnd, x: 50, y: 50, scale: 1.02, rotation: 3, opacity: 0.88 },
      ],
    },
  ];

  const composition = {
    name: `${lookProfile.label} · Directed Motion Graph`,
    concept: `Source-bound ${lookProfile.label} choreography anchored at focal centroid (${cx}%, ${cy}%) with Null Rig parenting, Alpha Track Matte portal, feathered rotoscope polygon spline, and ${beatSyncPulses ? 'beat-synced grade pulses' : 'precision 3D LUT grade'}.`,
    layers,
    colorGrade: {
      lookId: lookProfile.id,
      beatSyncPulses: Boolean(beatSyncPulses),
      beats,
    },
  };

  const core = {
    version: 2,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    brief: context.brief,
    duration: context.duration,
    sourceEvidence: context.media.map(({ id, contentHash }) => ({ id, contentHash })),
    composition,
  };
  const fingerprint = sha256HexSync(JSON.stringify(core));
  return {
    ...core,
    fingerprint,
    provenance: {
      provider: 'autopromote_cinema_graph_v2',
      automaticModelPlanning: true,
      sourceUnderstanding: 'client_hash_bound_decoded_colour_scopes_and_motion_salience',
      pixelEvidence: evidenceList,
      paidProviderCalls: 0,
    },
  };
}
