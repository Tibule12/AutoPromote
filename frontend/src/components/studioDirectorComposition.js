import { validateStudioPerspective, PERSPECTIVE_LEFT } from './studioPerspective';
import { parseStudioMaskPolygon } from './studioMaskGeometry';
import { computeColorScopesFromRgba } from './studioColorScopes';
import { defaultMotionDriverForProperty } from './studioCompRigging';
import { studioProjectAspect } from './studioProjectAspect';
import { createStudioVectorPrimitive } from './studioVectorShape';

const fullMask = { enabled: false, shape: 'rectangle', feather: 0, inverted: false };
const finite = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;

export const DIRECTOR_SPEED_CURVE_PRESETS = {
  cinematic_ease: [0.65, 0, 0.35, 1],
  whip_snap: [0.16, 1, 0.3, 1],
  dramatic_hold: [0.85, 0, 0.15, 1],
  gentle_drift: [0.42, 0, 0.58, 1],
  elastic_overshoot: [0.34, 1.56, 0.64, 1],
  expo_punch: [0.19, 1, 0.22, 1],
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
  noir_silver: {
    id: 'noir_silver',
    label: 'High-Contrast Noir Silver',
    grade: {
      exposureStops: -0.05,
      brightness: 0.96,
      contrast: 1.36,
      saturation: 0.22,
      lift: -0.08,
      gamma: 0.94,
      gain: 1.12,
      temperature: -0.12,
      tint: 0.0,
      vignette: 0.34,
    },
    advancedColor: {
      curve: { shadows: -0.16, midtones: -0.04, highlights: 0.14 },
      hsl: { hue: 0, saturation: 0.25, luminance: -0.03 },
      lutPresetId: 'bleach_bypass',
      lutIntensity: 0.92,
    },
  },
  ultraviolet_pulse: {
    id: 'ultraviolet_pulse',
    label: 'Ultraviolet Synth Pulse',
    grade: {
      exposureStops: 0.16,
      brightness: 1.03,
      contrast: 1.24,
      saturation: 1.28,
      lift: -0.04,
      gamma: 1.06,
      gain: 1.1,
      temperature: -0.22,
      tint: 0.24,
      vignette: 0.26,
    },
    advancedColor: {
      curve: { shadows: -0.1, midtones: 0.04, highlights: 0.11 },
      hsl: { hue: 18, saturation: 1.22, luminance: 0.03 },
      lutPresetId: 'neon_cyber',
      lutIntensity: 0.9,
    },
  },
  emerald_matrix: {
    id: 'emerald_matrix',
    label: 'Emerald Sci-Fi Telemetry',
    grade: {
      exposureStops: 0.08,
      brightness: 1.0,
      contrast: 1.2,
      saturation: 1.1,
      lift: -0.05,
      gamma: 1.02,
      gain: 1.04,
      temperature: -0.14,
      tint: -0.18,
      vignette: 0.24,
    },
    advancedColor: {
      curve: { shadows: -0.08, midtones: 0.02, highlights: 0.08 },
      hsl: { hue: -14, saturation: 1.12, luminance: 0.01 },
      lutPresetId: 'teal_orange',
      lutIntensity: 0.86,
    },
  },
};

export const DIRECTOR_CHOREOGRAPHY_ARCHETYPES = {
  viral_hook_cutaway: {
    id: 'viral_hook_cutaway',
    label: 'Viral Creator Hook & Clean B-Roll Cut',
    description:
      '3-Act Social Pacing: Kinetic Hook Punch-In + Fullscreen/PiP B-Roll Cutaway + Voice-First Ducking + Editorial Payoff',
  },
  noir_color_splash: {
    id: 'noir_color_splash',
    label: 'Noir Color-Splash & Kinetic Match-Cut',
    description:
      'Sin-City B&W Selective Color Pop + Swiss Editorial Frame + Whip-Zoom Match-Cut to Full Cinema Print',
  },
  editorial_poster_fusion: {
    id: 'editorial_poster_fusion',
    label: 'Brutalist Poster × Footage Aperture Fusion',
    description:
      'High-Fashion Kinetic Color-Block Typography + Expanding Live Video Apertures + Vector Starburst Accent',
  },
  portal_prism: {
    id: 'portal_prism',
    label: 'Focal Portal & Rotoscope Prism',
    description:
      'Camera Null Rig + Soft Ellipse Alpha Portal + 5-Point Animated Rotoscope Polygon Spline',
  },
  split_diptych: {
    id: 'split_diptych',
    label: 'Architectural 50/50 Split Diptych',
    description:
      'Clean 50/50 Dual Cinema Plates + Non-Overlapping Framing + Animated Polygon Reveal',
  },
  orbit_cascade: {
    id: 'orbit_cascade',
    label: '2.5D Perspective Orbit Cascade',
    description:
      'Spin/Pulse Camera Rig + 2.5D Perspective Plane + Separated Alpha Portal Lane',
  },
  kinetic_hybrid: {
    id: 'kinetic_hybrid',
    label: 'Hybrid Cinema + Kinetic Framing',
    description:
      'Source-bound Story Choreography + Vector Broadcast Framing & Accent Rules',
  },
  broll_cutaway_rig: {
    id: 'broll_cutaway_rig',
    label: 'B-Roll Powerhouse + Kinetic Callout',
    description:
      'Circle Spotlight B-Roll Portal + Whip-Pan Motion Blur + Voice-First Audio Ducking + Per-Character Kinetic Title',
  },
  omniscient_showpiece: {
    id: 'omniscient_showpiece',
    label: '8-Track Omniscient Studio Masterpiece',
    description:
      'Null Rig + Alpha Portal + Rotoscope Spline + B-Roll Circle Portal + Vector Reticle Trim + Kinetic Title + Dead-Clip Revival + Selective HSL/Window Grade',
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

export function sha256HexSync(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new TextEncoder().encode(String(input));
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length + 9 + 63) & ~63;
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
  if (/\b(ultraviolet|violet|magenta|synthwave)\b/.test(text)) {
    return 'ultraviolet_pulse';
  }
  if (/\b(emerald|matrix|telemetry|bio|jade)\b/.test(text)) {
    return 'emerald_matrix';
  }
  if (/\b(noir|monochrome|black and white|b&w)\b/.test(text)) {
    return 'noir_silver';
  }
  if (/\b(grit|silver|dark|shadow|bleach|cold)\b/.test(text)) {
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

const DIRECTOR_STOPWORDS = new Set([
  'a', 'an', 'and', 'apply', 'build', 'clip', 'clips', 'close', 'closeup', 'create', 'cut', 'cutaway',
  'direct', 'director', 'duck', 'ducking', 'edit', 'editing', 'fast', 'film', 'flat', 'footage', 'for',
  'frame', 'from', 'full', 'give', 'grade', 'hdr', 'headline', 'hsl', 'hud', 'into', 'isolate', 'kinetic',
  'low', 'lut', 'make', 'masterpiece', 'mode', 'motion', 'my', 'of', 'on', 'open', 'our', 'portal', 'revive',
  'raw', 'log', 'reel', 'reels', 'reticle', 'reveal', 'rig', 'rotoscope', 'short', 'shorts', 'show',
  'showpiece', 'social', 'split', 'stage', 'story', 'studio', 'subject', 'target', 'the', 'this', 'tiktok',
  'title', 'to', 'trace', 'track', 'turn', 'using', 'vfx', 'video', 'viral', 'voice', 'window', 'with',
  'youtube', 'your', '3d', '2d', '4k', '9:16', '16:9', '8-track', 'rgb', 'fps', 'ai',
]);

export function extractCreatorTitleAndHook(brief = '', fallbackClipName = '') {
  const raw = String(brief || '').trim();
  const quoted = raw.match(/["'`]([^"'`]{2,36})["'`]/);
  if (quoted && quoted[1]?.trim()) {
    return quoted[1].replace(/[^A-Za-z0-9 .,!?'-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 36);
  }
  const tokens = raw
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !DIRECTOR_STOPWORDS.has(w.toLowerCase()));
  if (tokens.length >= 2) {
    return tokens.slice(0, 3).join(' ').toUpperCase().slice(0, 32);
  }
  if (tokens.length === 1) {
    return `${tokens[0]} SPOTLIGHT`.toUpperCase().slice(0, 32);
  }
  const clipWords = String(fallbackClipName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 2);
  if (clipWords.length) {
    return clipWords.slice(0, 3).join(' ').toUpperCase().slice(0, 28);
  }
  return 'WATCH THIS';
}

export function inferDirectorArchetypeId(brief = '') {
  const text = String(brief || '').toLowerCase();
  if (/\b(omniscient|masterpiece|showpiece|everything|all-in-one|full studio|8-track)\b/.test(text)) {
    return 'omniscient_showpiece';
  }
  if (/\b(sin city|color splash|noir|monochrome|magazine|freeze frame|selective color)\b/.test(text)) {
    return 'noir_color_splash';
  }
  if (/\b(poster|brutalist|swiss|fashion|editorial|aperture|typography fusion|artistic)\b/.test(text)) {
    return 'editorial_poster_fusion';
  }
  if (/\b(split|diptych|dual|versus|side by side|50\/50)\b/.test(text)) return 'split_diptych';
  if (/\b(b-roll|broll|circle portal|ducking|j-cut|l-cut)\b/.test(text)) {
    return 'broll_cutaway_rig';
  }
  if (/\b(viral|hook|tiktok|reels?|shorts|podcast|talking head|youtube|instagram|creator|attention|social|product demo|cutaway)\b/.test(text)) {
    return 'viral_hook_cutaway';
  }
  if (/\b(orbit|perspective|2\.5d|card|tilt)\b/.test(text)) return 'orbit_cascade';
  if (/\b(portal|prism)\b/.test(text)) return 'portal_prism';
  if (/\b(hybrid|poster|title|typography|frame|broadcast)\b/.test(text)) return 'kinetic_hybrid';
  return 'viral_hook_cutaway';
}

export function inferDirectorRevivalAndSelectiveGrade(brief = '', samples = []) {
  const text = String(brief || '').toLowerCase();
  let revitalizerPresetId = null;
  let qualifierPresetId = null;
  let powerWindowPresetId = null;

  const avgLuma =
    Array.isArray(samples) && samples.length > 0
      ? samples.reduce((sum, s) => sum + Number(s.luma ?? 108), 0) / samples.length
      : 108;
  const avgEntropy =
    Array.isArray(samples) && samples.length > 0
      ? samples.reduce((sum, s) => sum + Number(s.tonalEntropy ?? 3.1), 0) / samples.length
      : 3.1;

  if (/\b(low[\s-]?light|dark|muddy|underexposed|night rescue)\b/.test(text) || avgLuma < 68) {
    revitalizerPresetId = 'low_light_rescue';
  } else if (/\b(flat|log|washed|hazy|faded|dehaze)\b/.test(text) || avgEntropy < 2.3) {
    revitalizerPresetId = 'flat_log_revival';
  } else if (/\b(resurrect|hdr pop|lifeless|vivid)\b/.test(text)) {
    revitalizerPresetId = 'lifeless_color_resurrection';
  } else if (/\b(revive|dead|phone|crisp|bring.*to life|omniscient|masterpiece|showpiece|everything)\b/.test(text)) {
    revitalizerPresetId = 'dead_phone_enhancer';
  }

  if (/\b(sin city|color splash|red splash|b&w splash)\b/.test(text)) {
    qualifierPresetId = 'sin_city_red_splash';
  } else if (/\b(crimson|red|garment|jacket|dress|lips)\b/.test(text)) {
    qualifierPresetId = 'garment_crimson';
  } else if (/\b(cobalt|denim|blue|vehicle)\b/.test(text)) {
    qualifierPresetId = 'garment_cobalt';
  } else if (/\b(gold|amber|jewelry|watch|trophy)\b/.test(text)) {
    qualifierPresetId = 'gold_amber_object';
  } else if (/\b(violet|purple|cyber object)\b/.test(text)) {
    qualifierPresetId = 'violet_neon_accent';
  } else if (/\b(skin|face|portrait|radiance|omniscient|masterpiece|showpiece|everything)\b/.test(text)) {
    qualifierPresetId = 'skin_radiance';
  }

  if (/\b(face|upper body|headshot|portrait)\b/.test(text)) {
    powerWindowPresetId = 'face_upper_body';
  } else if (/\b(full body|standing|column)\b/.test(text)) {
    powerWindowPresetId = 'full_body_column';
  } else if (/\b(product|center object|hero object)\b/.test(text)) {
    powerWindowPresetId = 'center_object_hero';
  } else if (/\b(hands|desk|foreground)\b/.test(text)) {
    powerWindowPresetId = 'hands_foreground_zone';
  } else if (/\b(spotlight|isolate|dim surround|omniscient|masterpiece|showpiece|everything)\b/.test(text)) {
    powerWindowPresetId = 'subject_spotlight';
  }

  return {
    revitalizerPresetId,
    qualifierPresetId,
    powerWindowPresetId,
  };
}

export function buildDirectorFinishGradeAction(
  lookId = 'kodak_2383',
  {
    duration = 12,
    beatSyncPulses = true,
    beats = null,
    gradeOverrides = {},
    advancedOverrides = {},
    revitalizerPresetId = null,
    qualifierPresetId = null,
    powerWindowPresetId = null,
  } = {}
) {
  const profile =
    DIRECTOR_CINEMA_LOOK_PROFILES[lookId] || DIRECTOR_CINEMA_LOOK_PROFILES.kodak_2383;
  const resolvedBeats = Array.isArray(beats)
    ? beats
    : (() => {
        const list = [];
        for (let t = 0.8; t < Number(duration || 12) - 0.3; t += 1.2) {
          list.push({ time: Number(t.toFixed(2)), strength: 1 });
        }
        return list;
      })();
  return {
    type: 'finish_grade',
    id: 'director-finish-grade',
    name: profile.label,
    grade: {
      ...(profile.grade || {}),
      ...(revitalizerPresetId ? { revitalizerPresetId } : {}),
      ...gradeOverrides,
    },
    advancedColor: {
      ...(profile.advancedColor || {}),
      ...(qualifierPresetId ? { qualifierPresetId } : {}),
      ...(powerWindowPresetId ? { powerWindowPresetId } : {}),
      ...advancedOverrides,
    },
    beatSyncPulses: Boolean(beatSyncPulses),
    beats: resolvedBeats,
  };
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
        samples[1] || samples[0] || { motionCentroid: [50, 48], peakChroma: 28, meanRgb: [118, 102, 88] }
      );
      const meanRgb = Array.isArray(peakSample.meanRgb) && peakSample.meanRgb.length === 3
        ? peakSample.meanRgb
        : [118, 102, 88];
      const peakChroma = Number(
        peakSample.peakChroma ?? (Math.max(...meanRgb) - Math.min(...meanRgb))
      );
      const salienceScore = Number(
        (avgEntropy * 12 + maxDiff * 1.15 + peakChroma * 0.45).toFixed(2)
      );
      return {
        id: clip.id,
        name: clip.name,
        meanRgb,
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
  const stage = studioProjectAspect(snapshot);
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
      !['video', 'shape', 'rig', 'title', 'vector'].includes(node.kind) ||
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
      const poseCurve =
        Array.isArray(pose.curve) && pose.curve.length === 4
          ? pose.curve
          : DIRECTOR_SPEED_CURVE_PRESETS[pose.curvePreset] || defaultCurve;
      for (const p of properties) {
        keys.push({
          property: p,
          time: pose.at,
          value: pose[p] * (p === 'scale' && node.kind === 'video' ? 10 / 7 : 1),
          easing: 'bezier',
          curve: poseCurve,
          ...(Array.isArray(pose.spatialCurve) && (p === 'x' || p === 'y')
            ? { spatialCurve: [...pose.spatialCurve] }
            : {}),
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

    // Optional animated polygon mask vertex morphing (rotoscope keyframes)
    if (
      node.kind === 'video' &&
      node.shape === 'polygon' &&
      Array.isArray(node.maskPoses) &&
      node.maskPoses.length > 0
    ) {
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
        for (const [idx, [px, py]] of pts.entries()) {
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
        }
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
      if (node.bRollLayoutPreset === 'circle_portal' && !mask.enabled) {
        softMaskCount += 1;
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
        ...(node.bRollLayoutPreset ? { bRollLayoutPreset: node.bRollLayoutPreset } : {}),
        ...(node.bRollAudioPreset ? { bRollAudioPreset: node.bRollAudioPreset } : {}),
        ...(node.bRollLookPreset ? { bRollLookPreset: node.bRollLookPreset } : {}),
        ...(node.motionBlur ? { motionBlur: node.motionBlur } : {}),
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
    } else if (node.kind === 'title') {
      const titleText = String(node.text || 'STUDIO SHOWPIECE')
        .replace(/[^A-Za-z0-9 .,!?'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'STUDIO SHOWPIECE';
      const animEnd = Number(
        Math.min(node.end, node.start + Math.max(0.25, (node.end - node.start) * 0.45)).toFixed(3)
      );
      add({
        type: 'title',
        id: node.id,
        name: node.name || node.id,
        text: titleText,
        textAnimatorPreset: node.textAnimatorPreset || 'elastic_wave_cascade',
        textProgress: 0,
        color: /^#[\da-f]{6}$/i.test(node.color || '') ? node.color : '#f8fafc',
        ...(node.strokeColor && /^#[\da-f]{6}$/i.test(node.strokeColor) ? { strokeColor: node.strokeColor } : {}),
        ...(Number.isFinite(Number(node.strokeWidth)) ? { strokeWidth: Number(node.strokeWidth) } : {}),
        fontWeight: Number(node.fontWeight) || 900,
        width: Number(node.width) || 78,
        textAlign: node.textAlign || 'center',
        startTime: node.start,
        duration: node.end - node.start,
        transform,
      });
      keys.push(
        { property: 'textProgress', time: node.start, value: 0, easing: 'linear' },
        {
          property: 'textProgress',
          time: animEnd,
          value: 100,
          easing: 'bezier',
          curve: defaultCurve,
        }
      );
      reports.push({
        startTime: node.start,
        endTime: node.end,
        sourceName: titleText,
        treatment: `Kinetic Title (${node.textAnimatorPreset || 'elastic_wave_cascade'})`,
        reason: node.reason || 'Per-character kinetic typography reveal.',
      });
    } else if (node.kind === 'vector') {
      const vectorShape = createStudioVectorPrimitive(node.primitiveId || 'target_reticle');
      const trimDone = Number(
        Math.min(node.end, node.start + Math.max(0.25, (node.end - node.start) * 0.48)).toFixed(3)
      );
      graphics.push({
        id: node.id,
        name: node.name || node.id,
        type: 'artwork',
        vectorShape,
        strokeStart: 0,
        strokeEnd: 100,
        strokeOffset: 0,
        startTime: node.start,
        duration: node.end - node.start,
        x: pose.x,
        y: pose.y,
        width: node.width || 38,
        height: node.height || 38,
        scale: pose.scale,
        rotation: pose.rotation,
        opacity: pose.opacity,
        keys: [
          ...keys,
          { property: 'strokeEnd', time: node.start, value: 0, easing: 'linear' },
          {
            property: 'strokeEnd',
            time: trimDone,
            value: 100,
            easing: 'bezier',
            curve: defaultCurve,
          },
        ],
      });
    } else {
      if (!/^#[\da-f]{6}$/i.test(node.color || '')) {
        throw Error('Director shape colour is invalid.');
      }
      const shape =
        node.shape === 'ellipse'
          ? `<ellipse cx="${stage.width / 2}" cy="${stage.height / 2}" rx="${Math.min(stage.width, stage.height) / 2}" ry="${Math.min(stage.width, stage.height) / 2}" fill="${node.color}"/>`
          : `<rect width="${stage.width}" height="${stage.height}" fill="${node.color}"/>`;
      graphics.push({
        id: node.id,
        name: node.name || node.id,
        type: 'artwork',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${stage.width}" height="${stage.height}">${shape}</svg>`,
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
    if (!['shape', 'vector'].includes(node.kind)) add({ type: 'keys', targetId: node.id, keys });
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
    const profile =
      DIRECTOR_CINEMA_LOOK_PROFILES[cg.lookId] || DIRECTOR_CINEMA_LOOK_PROFILES.kodak_2383;
    const gradeAction = buildDirectorFinishGradeAction(profile.id, {
      duration: context.duration,
      beatSyncPulses: Boolean(cg.beatSyncPulses),
      beats: Array.isArray(cg.beats) ? cg.beats : null,
      gradeOverrides: cg.grade || {},
      advancedOverrides: cg.advancedColor || {},
      revitalizerPresetId: cg.revitalizerPresetId || null,
      qualifierPresetId: cg.qualifierPresetId || null,
      powerWindowPresetId: cg.powerWindowPresetId || null,
    });
    add(gradeAction);
    colorSummary = {
      id: profile.id,
      lookId: profile.id,
      label: profile.label,
      lutPresetId: gradeAction.advancedColor.lutPresetId || profile.id,
      beatSyncPulses: Boolean(cg.beatSyncPulses),
      ...(cg.revitalizerPresetId ? { revitalizerPresetId: cg.revitalizerPresetId } : {}),
      ...(cg.qualifierPresetId ? { qualifierPresetId: cg.qualifierPresetId } : {}),
      ...(cg.powerWindowPresetId ? { powerWindowPresetId: cg.powerWindowPresetId } : {}),
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
      width: stage.width,
      height: stage.height,
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
      shapeLayers: graph.layers.filter(l => ['shape', 'vector'].includes(l.kind)).length,
      kineticTitles: graph.layers.filter(l => l.kind === 'title').length,
      vectorPrimitives: graph.layers.filter(l => l.kind === 'vector').length,
      bRollCutaways: graph.layers.filter(l => l.kind === 'video' && Boolean(l.bRollLayoutPreset)).length,
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
  const archetypeId =
    opts.archetypeId && opts.archetypeId !== 'auto'
      ? opts.archetypeId
      : inferDirectorArchetypeId(context.brief);
  const beatSyncPulses = opts.beatSyncPulses !== undefined ? Boolean(opts.beatSyncPulses) : true;
  const pixelEvidence = opts.pixelEvidence || context.pixelEvidence || null;

  const clipA = context.media[0];
  const clipB = context.media[1] || clipA;
  const evidenceList =
    Array.isArray(pixelEvidence) && pixelEvidence.length === context.media.length
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
  const archetype =
    DIRECTOR_CHOREOGRAPHY_ARCHETYPES[archetypeId] || DIRECTOR_CHOREOGRAPHY_ARCHETYPES.portal_prism;

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
  const beatStep = opts.bpm && Number(opts.bpm) >= 60 ? Number((60 / Number(opts.bpm)).toFixed(2)) : 1.2;
  for (let t = 0.8; t < totalDur - 0.3; t += Math.max(0.5, beatStep)) {
    beats.push({ time: Number(t.toFixed(2)), strength: 1 });
  }

  const creatorHookTitle = extractCreatorTitleAndHook(context.brief, clipA.name);
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
      reason: 'Grounds the full-frame canvas across the entire programme duration with opening punch-in energy.',
      poses: [
        { at: 0, x: 50, y: 50, scale: archetype.id === 'viral_hook_cutaway' ? 1.09 : 1, rotation: 0, opacity: 1 },
        { at: midTime, x: 50, y: 50, scale: archetype.id === 'viral_hook_cutaway' ? 1.02 : 1.05, rotation: 0, opacity: 1 },
        { at: totalDur, x: 50, y: 50, scale: 1.09, rotation: 0, opacity: 1 },
      ],
    },
    // 2. Master Camera Null Rig centered cleanly without wobbling text or faces
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
        { at: revealStart, x: 50, y: 50, scale: 0.98, rotation: -0.6, opacity: 1 },
        {
          at: Number(((revealStart + revealEnd) * 0.5).toFixed(3)),
          x: 50,
          y: 50,
          scale: 1.01,
          rotation: 0,
          opacity: 1,
        },
        { at: revealEnd, x: 50, y: 50, scale: 1, rotation: 0.5, opacity: 1 },
      ],
    },
    // 3. Soft-feathered Ellipse Matte Stencil positioned into non-colliding side/corner or split lane
    {
      id: 'portalMatte',
      name: 'Focal Portal Alpha Stencil',
      kind: 'shape',
      sourceMediaId: '',
      sourceStart: 0,
      start: revealStart,
      end: revealEnd,
      shape: 'ellipse',
      feather: archetype.id === 'split_diptych' ? 2 : 10,
      polygon: '',
      color: '#ffffff',
      parentId: 'cameraRig',
      matteId: '',
      matteMode: '',
      poses: [
        {
          at: revealStart,
          x: archetype.id === 'split_diptych' ? 75 : archetype.id === 'orbit_cascade' ? 32 : archetype.id === 'portal_prism' ? cx : 24,
          y: archetype.id === 'split_diptych' ? 50 : archetype.id === 'portal_prism' ? cy : 28,
          scale: archetype.id === 'portal_prism' ? 0.52 : archetype.id === 'split_diptych' ? 0.85 : 0.36,
          rotation: 0,
          opacity: 0.95,
        },
        {
          at: Number(((revealStart + revealEnd) * 0.5).toFixed(3)),
          x: archetype.id === 'split_diptych' ? 75 : archetype.id === 'orbit_cascade' ? 32 : archetype.id === 'portal_prism' ? cx : 24,
          y: archetype.id === 'split_diptych' ? 50 : archetype.id === 'portal_prism' ? cy : 28,
          scale: archetype.id === 'portal_prism' ? 0.86 : archetype.id === 'split_diptych' ? 0.98 : 0.44,
          rotation: 0,
          opacity: 1,
        },
        {
          at: revealEnd,
          x: archetype.id === 'split_diptych' ? 75 : archetype.id === 'orbit_cascade' ? 32 : archetype.id === 'portal_prism' ? cx : 24,
          y: archetype.id === 'split_diptych' ? 50 : archetype.id === 'portal_prism' ? cy : 28,
          scale: archetype.id === 'portal_prism' ? 0.78 : archetype.id === 'split_diptych' ? 0.95 : 0.42,
          rotation: 0,
          opacity: 0.95,
        },
      ],
    },
    // 4. Track-Matted Counter-Shot Window aligned to clean non-colliding lane
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
      reason: `Opens an alpha-matted counter-shot window cleanly separated from the primary focal subject.`,
      poses: [
        {
          at: revealStart,
          x: archetype.id === 'split_diptych' ? 75 : archetype.id === 'orbit_cascade' ? 32 : archetype.id === 'portal_prism' ? 50 : 24,
          y: archetype.id === 'split_diptych' ? 50 : archetype.id === 'portal_prism' ? 50 : 28,
          scale: archetype.id === 'portal_prism' ? 1.02 : 0.48,
          rotation: 0,
          opacity: archetype.id === 'viral_hook_cutaway' ? 0 : 0.96,
        },
        {
          at: revealEnd,
          x: archetype.id === 'split_diptych' ? 75 : archetype.id === 'orbit_cascade' ? 32 : archetype.id === 'portal_prism' ? 50 : 24,
          y: archetype.id === 'split_diptych' ? 50 : archetype.id === 'portal_prism' ? 50 : 28,
          scale: archetype.id === 'portal_prism' ? 1.1 : 0.52,
          rotation: 0,
          opacity: archetype.id === 'viral_hook_cutaway' ? 0 : 1,
        },
      ],
    },
    // 5. Crisp Animated Polygon Split / Wipe Layer (no muddy mid-screen ghosting)
    {
      id: 'polygonPrism',
      name: `${clipA.name} · Clean Split Reveal Edge`,
      kind: 'video',
      sourceMediaId: clipA.id,
      sourceStart: sourceStartA,
      start: revealStart,
      end: revealEnd,
      shape: 'polygon',
      polygon:
        archetype.id === 'split_diptych'
          ? 'polygon(0% 0%, 50% 0%, 49% 100%, 0% 100%, 0% 50%)'
          : archetype.id === 'portal_prism'
            ? 'polygon(18% 8%, 82% 8%, 92% 50%, 82% 92%, 18% 92%)'
            : 'polygon(0% 0%, 48% 0%, 44% 100%, 0% 100%, 0% 50%)',
      feather: archetype.id === 'portal_prism' ? 12 : 2,
      inverted: false,
      color: '',
      parentId: 'cameraRig',
      matteId: '',
      matteMode: '',
      curvePreset: 'cinematic_ease',
      reason: 'Crisp animated architectural split edge cleanly separating visual lanes.',
      maskPoses: [
        {
          at: revealStart,
          polygon:
            archetype.id === 'split_diptych'
              ? 'polygon(0% 0%, 48% 0%, 46% 100%, 0% 100%, 0% 50%)'
              : archetype.id === 'portal_prism'
                ? 'polygon(24% 14%, 76% 14%, 86% 50%, 76% 86%, 24% 86%)'
                : 'polygon(0% 0%, 42% 0%, 38% 100%, 0% 100%, 0% 50%)',
        },
        {
          at: revealEnd,
          polygon:
            archetype.id === 'split_diptych'
              ? 'polygon(0% 0%, 52% 0%, 50% 100%, 0% 100%, 0% 50%)'
              : archetype.id === 'portal_prism'
                ? 'polygon(10% 4%, 90% 4%, 98% 50%, 90% 96%, 10% 96%)'
                : 'polygon(0% 0%, 50% 0%, 46% 100%, 0% 100%, 0% 50%)',
        },
      ],
      poses: [
        { at: revealStart, x: 50, y: 50, scale: archetype.id === 'portal_prism' ? 0.92 : 1.0, rotation: 0, opacity: archetype.id === 'portal_prism' ? 0.72 : archetype.id === 'split_diptych' ? 1.0 : 0.0 },
        { at: revealEnd, x: 50, y: 50, scale: archetype.id === 'portal_prism' ? 1.02 : 1.0, rotation: 0, opacity: archetype.id === 'portal_prism' ? 0.88 : archetype.id === 'split_diptych' ? 1.0 : 0.0 },
      ],
    },
  ];

  if (archetype.id === 'orbit_cascade') {
    layers.push({
      id: 'perspectiveWing',
      name: `${clipB.name} · 2.5D Perspective Orbit Card`,
      kind: 'video',
      sourceMediaId: clipB.id,
      sourceStart: sourceStartB,
      start: revealStart,
      end: revealEnd,
      shape: 'none',
      polygon: '',
      color: '',
      parentId: 'cameraRig',
      matteId: '',
      matteMode: '',
      curvePreset: 'expo_punch',
      perspective: {
        version: 1,
        corners: PERSPECTIVE_LEFT.map(p => [...p]),
      },
      reason: 'Tilted 2.5D perspective plane cleanly staged in right safe zone.',
      poses: [
        { at: revealStart, x: 76, y: 46, scale: 0.48, rotation: -4, opacity: 0 },
        {
          at: Number(((revealStart + revealEnd) * 0.5).toFixed(3)),
          x: 74,
          y: 48,
          scale: 0.58,
          rotation: 0,
          opacity: 0.98,
        },
        { at: revealEnd, x: 74, y: 50, scale: 0.54, rotation: 3, opacity: 0.92 },
      ],
    });
  } else if (archetype.id === 'viral_hook_cutaway') {
    const hookEnd = Number(Math.min(totalDur * 0.34, Math.max(1.2, totalDur * 0.28)).toFixed(3));
    const cutStart = Number(Math.max(0.9, totalDur * 0.28).toFixed(3));
    const cutEnd = Number(Math.min(totalDur - 0.5, totalDur * 0.74).toFixed(3));
    const cutSpan = Number(Math.max(0.6, cutEnd - cutStart).toFixed(3));
    const cutSourceStart = Math.min(Math.max(0, clipB.duration - cutSpan), sourceStartB);
    const useFullCutaway = clipB.id !== clipA.id && !/\b(pip|picture in picture|corner)\b/i.test(context.brief);
    layers.push(
      {
        id: 'viralBRollCutaway',
        name: `${clipB.name} · Clean Social B-Roll Cutaway`,
        kind: 'video',
        sourceMediaId: clipB.id,
        sourceStart: cutSourceStart,
        start: cutStart,
        end: cutEnd,
        shape: 'none',
        polygon: '',
        color: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'whip_snap',
        bRollLayoutPreset: useFullCutaway ? 'fullscreen_cutaway' : 'pip_top_right',
        bRollAudioPreset: 'voice_first_duck',
        bRollLookPreset: 'cool_tech_glass',
        motionBlur: { enabled: true, samples: 6, shutter: 0.6 },
        reason: 'Clean non-overlapping B-roll cutaway with whip-snap entry and voice-first audio ducking.',
        poses: [
          { at: cutStart, x: useFullCutaway ? 50 : 74, y: useFullCutaway ? 50 : 24, scale: useFullCutaway ? 0.74 : 0.65, rotation: 0, opacity: 0 },
          { at: Number((cutStart + Math.min(0.22, cutSpan * 0.18)).toFixed(3)), x: useFullCutaway ? 50 : 74, y: useFullCutaway ? 50 : 24, scale: 0.7, rotation: 0, opacity: 1 },
          { at: cutEnd, x: useFullCutaway ? 50 : 74, y: useFullCutaway ? 50 : 24, scale: useFullCutaway ? 0.72 : 0.7, rotation: 0, opacity: 0.98 },
        ],
      },
      {
        id: 'editorialPillAccent',
        name: 'Editorial Hook Capsule Accent',
        kind: 'vector',
        primitiveId: 'neon_capsule',
        width: 72,
        height: 16,
        sourceMediaId: '',
        sourceStart: 0,
        start: 0.1,
        end: hookEnd,
        shape: 'none',
        polygon: '',
        color: '#38bdf8',
        parentId: '',
        matteId: '',
        matteMode: '',
        curvePreset: 'expo_punch',
        reason: 'Clean animated lower-third hook frame.',
        poses: [
          { at: 0.1, x: 50, y: 80, scale: 0.86, rotation: 0, opacity: 0.1 },
          { at: Number(Math.min(hookEnd, 0.42).toFixed(3)), x: 50, y: 80, scale: 1, rotation: 0, opacity: 0.92 },
          { at: hookEnd, x: 50, y: 80, scale: 1.02, rotation: 0, opacity: 0 },
        ],
      },
      {
        id: 'kineticHookTitle',
        name: 'Viral Hook Headline',
        kind: 'title',
        text: creatorHookTitle,
        textAnimatorPreset: 'headline_gravity_slam',
        color: '#f8fafc',
        strokeColor: '#020617',
        strokeWidth: 3,
        fontWeight: 900,
        width: 80,
        sourceMediaId: '',
        sourceStart: 0,
        start: 0.12,
        end: Number(Math.min(totalDur - 0.15, Math.max(1.8, hookEnd + 0.5)).toFixed(3)),
        shape: 'none',
        polygon: '',
        parentId: '',
        matteId: '',
        matteMode: '',
        curvePreset: 'elastic_overshoot',
        reason: 'Immediate opening kinetic hook directly derived from the creator brief.',
        poses: [
          { at: 0.12, x: 50, y: 80, scale: 0.92, rotation: 0, opacity: 0.9 },
          { at: Number(Math.min(totalDur - 0.15, Math.max(1.8, hookEnd + 0.5)).toFixed(3)), x: 50, y: 80, scale: 1, rotation: 0, opacity: 1 },
        ],
      }
    );
  } else if (archetype.id === 'kinetic_hybrid') {
    layers.push({
      id: 'kineticFrameAccent',
      name: 'Broadcast Accent Frame',
      kind: 'shape',
      sourceMediaId: '',
      sourceStart: 0,
      start: revealStart,
      end: revealEnd,
      shape: 'polygon',
      polygon: 'polygon(6% 84%, 94% 84%, 94% 90%, 6% 90%)',
      feather: 0,
      color: '#ff4f1f',
      parentId: 'cameraRig',
      matteId: '',
      matteMode: '',
      poses: [
        { at: revealStart, x: 50, y: 50, scale: 0.4, rotation: 0, opacity: 0 },
        {
          at: Number(((revealStart + revealEnd) * 0.5).toFixed(3)),
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0,
          opacity: 0.92,
        },
        { at: revealEnd, x: 50, y: 50, scale: 1.04, rotation: 0, opacity: 0.85 },
      ],
    });
  } else if (archetype.id === 'broll_cutaway_rig') {
    const midReveal = Number(((revealStart + revealEnd) * 0.5).toFixed(3));
    layers.push(
      {
        id: 'brollCirclePortal',
        name: `${clipB.name} · Circle Spotlight B-Roll Portal`,
        kind: 'video',
        sourceMediaId: clipB.id,
        sourceStart: sourceStartB,
        start: revealStart,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        color: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'whip_snap',
        bRollLayoutPreset: 'circle_portal',
        bRollAudioPreset: 'voice_first_duck',
        bRollLookPreset: 'cool_tech_glass',
        motionBlur: { enabled: true, samples: 6, shutter: 0.65 },
        reason: 'Circle spotlight B-roll portal framed cleanly in top-right quadrant with voice-first audio ducking.',
        poses: [
          { at: revealStart, x: 76, y: 26, scale: 0.44, rotation: -6, opacity: 0 },
          { at: midReveal, x: 76, y: 26, scale: 0.68, rotation: 0, opacity: 1 },
          { at: revealEnd, x: 76, y: 24, scale: 0.66, rotation: 2, opacity: 0.96 },
        ],
      },
      {
        id: 'kineticCalloutTitle',
        name: 'Kinetic Story Callout',
        kind: 'title',
        text: creatorHookTitle,
        textAnimatorPreset: 'elastic_wave_cascade',
        color: '#f8fafc',
        strokeColor: '#020617',
        strokeWidth: 3,
        fontWeight: 900,
        width: 82,
        sourceMediaId: '',
        sourceStart: 0,
        start: revealStart,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'elastic_overshoot',
        reason: 'Per-character elastic wave kinetic title paired cleanly in lower-third safe zone.',
        poses: [
          { at: revealStart, x: 50, y: 82, scale: 0.9, rotation: 0, opacity: 0.9 },
          { at: revealEnd, x: 50, y: 80, scale: 1, rotation: 0, opacity: 1 },
        ],
      }
    );
  } else if (archetype.id === 'omniscient_showpiece') {
    const midReveal = Number(((revealStart + revealEnd) * 0.5).toFixed(3));
    layers.push(
      {
        id: 'brollCirclePortal',
        name: `${clipB.name} · Circle Spotlight B-Roll Portal`,
        kind: 'video',
        sourceMediaId: clipB.id,
        sourceStart: sourceStartB,
        start: revealStart,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        color: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'whip_snap',
        bRollLayoutPreset: 'circle_portal',
        bRollAudioPreset: 'voice_first_duck',
        bRollLookPreset: 'cool_tech_glass',
        motionBlur: { enabled: true, samples: 6, shutter: 0.65 },
        reason: 'B-Roll Powerhouse circle spotlight portal positioned in safe top-right lane with voice-first ducking and shutter blur.',
        poses: [
          {
            at: revealStart,
            x: 76,
            y: 26,
            scale: 0.44,
            rotation: -6,
            opacity: 0,
            spatialCurve: [10, -6],
          },
          {
            at: midReveal,
            x: 76,
            y: 26,
            scale: 0.68,
            rotation: 0,
            opacity: 1,
            spatialCurve: [-8, 8],
          },
          { at: revealEnd, x: 76, y: 24, scale: 0.66, rotation: 2, opacity: 0.96 },
        ],
      },
      {
        id: 'vectorReticleHud',
        name: 'Target Reticle Vector HUD (v2 Cutout)',
        kind: 'vector',
        primitiveId: 'target_reticle',
        width: 30,
        height: 30,
        sourceMediaId: '',
        sourceStart: 0,
        start: revealStart,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        color: '#38bdf8',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'expo_punch',
        reason: 'Compound v2 parametric vector bezel aligned cleanly to the top-right B-roll circle portal.',
        poses: [
          { at: revealStart, x: 76, y: 26, scale: 0.56, rotation: -45, opacity: 0.4 },
          { at: midReveal, x: 76, y: 26, scale: 0.88, rotation: 0, opacity: 0.95 },
          { at: revealEnd, x: 76, y: 24, scale: 0.86, rotation: 45, opacity: 0.88 },
        ],
      },
      {
        id: 'kineticHeroTitle',
        name: 'Omniscient Kinetic Hero Headline',
        kind: 'title',
        text: creatorHookTitle,
        textAnimatorPreset: 'elastic_wave_cascade',
        color: '#f8fafc',
        strokeColor: '#020617',
        strokeWidth: 3,
        fontWeight: 900,
        width: 82,
        sourceMediaId: '',
        sourceStart: 0,
        start: revealStart,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'elastic_overshoot',
        reason: 'Per-character elastic wave kinetic headline derived from creator brief.',
        poses: [
          { at: revealStart, x: 50, y: 84, scale: 0.9, rotation: 0, opacity: 0.88 },
          { at: midReveal, x: 50, y: 82, scale: 1.0, rotation: 0, opacity: 1 },
          { at: revealEnd, x: 50, y: 82, scale: 0.98, rotation: 0, opacity: 0.96 },
        ],
      }
    );
  } else if (archetype.id === 'noir_color_splash') {
    const splashEnd = Number(Math.min(totalDur * 0.48, Math.max(1.4, totalDur * 0.38)).toFixed(3));
    const cutStart = splashEnd;
    const cutEnd = Number(Math.min(totalDur - 0.35, totalDur * 0.82).toFixed(3));
    layers.push(
      {
        id: 'noirSplashHeadline',
        name: 'Noir Editorial Punch Headline',
        kind: 'title',
        text: creatorHookTitle,
        textAnimatorPreset: 'headline_gravity_slam',
        color: '#facc15',
        strokeColor: '#020617',
        strokeWidth: 4,
        fontWeight: 900,
        width: 84,
        sourceMediaId: '',
        sourceStart: 0,
        start: 0.1,
        end: splashEnd,
        shape: 'none',
        polygon: '',
        parentId: '',
        matteId: '',
        matteMode: '',
        curvePreset: 'expo_punch',
        poses: [
          { at: 0.1, x: 50, y: 76, scale: 1.12, rotation: 0, opacity: 0.95 },
          { at: splashEnd, x: 50, y: 76, scale: 1.0, rotation: 0, opacity: 1 },
        ],
      },
      {
        id: 'noirMatchCutaway',
        name: `${clipB.name} · Match-Cut Color Awake`,
        kind: 'video',
        sourceMediaId: clipB.id,
        sourceStart: Math.min(Math.max(0, clipB.duration - Math.max(0.6, cutEnd - cutStart)), sourceStartB),
        start: cutStart,
        end: cutEnd,
        shape: 'none',
        polygon: '',
        color: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'whip_snap',
        bRollLayoutPreset: clipB.id !== clipA.id ? 'fullscreen_cutaway' : 'pip_top_right',
        bRollAudioPreset: 'voice_first_duck',
        motionBlur: { enabled: true, samples: 6, shutter: 0.7 },
        poses: [
          { at: cutStart, x: clipB.id !== clipA.id ? 50 : 74, y: clipB.id !== clipA.id ? 50 : 24, scale: 0.78, rotation: 0, opacity: 0 },
          { at: Number((cutStart + 0.25).toFixed(3)), x: clipB.id !== clipA.id ? 50 : 74, y: clipB.id !== clipA.id ? 50 : 24, scale: 0.7, rotation: 0, opacity: 1 },
          { at: cutEnd, x: clipB.id !== clipA.id ? 50 : 74, y: clipB.id !== clipA.id ? 50 : 24, scale: 0.72, rotation: 0, opacity: 0.98 },
        ],
      }
    );
  } else if (archetype.id === 'editorial_poster_fusion') {
    const midReveal = Number(((revealStart + revealEnd) * 0.5).toFixed(3));
    layers.push(
      {
        id: 'posterStarburstBadge',
        name: 'Editorial Vector Starburst Accent',
        kind: 'vector',
        primitiveId: 'starburst_seal',
        width: 24,
        height: 24,
        sourceMediaId: '',
        sourceStart: 0,
        start: 0.2,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        color: '#f97316',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'elastic_overshoot',
        motionDrivers: { rotation: defaultMotionDriverForProperty('spin', 'rotation') },
        poses: [
          { at: 0.2, x: 84, y: 20, scale: 0.4, rotation: -30, opacity: 0 },
          { at: midReveal, x: 84, y: 20, scale: 0.9, rotation: 15, opacity: 0.95 },
          { at: revealEnd, x: 84, y: 20, scale: 0.85, rotation: 60, opacity: 0 },
        ],
      },
      {
        id: 'posterTrackingHeadline',
        name: 'Brutalist Tracking Kinetic Headline',
        kind: 'title',
        text: creatorHookTitle,
        textAnimatorPreset: 'cinematic_tracking_expand',
        color: '#f4efe6',
        strokeColor: '#141419',
        strokeWidth: 4,
        fontWeight: 900,
        width: 86,
        sourceMediaId: '',
        sourceStart: 0,
        start: 0.15,
        end: revealEnd,
        shape: 'none',
        polygon: '',
        parentId: 'cameraRig',
        matteId: '',
        matteMode: '',
        curvePreset: 'expo_punch',
        poses: [
          { at: 0.15, x: 50, y: 20, scale: 0.94, rotation: 0, opacity: 0.9 },
          { at: revealEnd, x: 50, y: 20, scale: 1.04, rotation: 0, opacity: 1 },
        ],
      }
    );
  }

  const inferredSelective = inferDirectorRevivalAndSelectiveGrade(context.brief, primarySamples);
  const revitalizerPresetId =
    opts.revitalizerPresetId !== undefined
      ? opts.revitalizerPresetId
      : archetype.id === 'omniscient_showpiece'
        ? inferredSelective.revitalizerPresetId || 'dead_phone_enhancer'
        : inferredSelective.revitalizerPresetId;
  const qualifierPresetId =
    opts.qualifierPresetId !== undefined
      ? opts.qualifierPresetId
      : archetype.id === 'noir_color_splash'
        ? inferredSelective.qualifierPresetId || 'sin_city_red_splash'
        : archetype.id === 'omniscient_showpiece'
          ? inferredSelective.qualifierPresetId || 'skin_radiance'
          : inferredSelective.qualifierPresetId;
  const powerWindowPresetId =
    opts.powerWindowPresetId !== undefined
      ? opts.powerWindowPresetId
      : archetype.id === 'omniscient_showpiece' || archetype.id === 'noir_color_splash'
        ? inferredSelective.powerWindowPresetId || 'subject_spotlight'
        : inferredSelective.powerWindowPresetId;

  const composition = {
    name: `${lookProfile.label} · ${archetype.label}`,
    concept: `Source-bound ${lookProfile.label} choreography (${archetype.label}) anchored at focal centroid (${cx}%, ${cy}%) with Null Rig parenting, Alpha Track Matte portal, feathered rotoscope polygon spline${archetype.id === 'omniscient_showpiece' ? ', B-Roll Circle Spotlight Portal, Target Reticle Vector Trim HUD, Per-Character Kinetic Headline, Dead-Clip Revival, and Selective HSL/Power-Window Color Grade' : ''}, and ${beatSyncPulses ? 'beat-synced grade pulses' : 'precision 3D LUT grade'}.`,
    layers,
    colorGrade: {
      lookId: lookProfile.id,
      beatSyncPulses: Boolean(beatSyncPulses),
      beats,
      ...(revitalizerPresetId ? { revitalizerPresetId } : {}),
      ...(qualifierPresetId ? { qualifierPresetId } : {}),
      ...(powerWindowPresetId ? { powerWindowPresetId } : {}),
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
      archetypeId: archetype.id,
      lookId: lookProfile.id,
      sourceUnderstanding: 'client_hash_bound_decoded_colour_scopes_and_motion_salience',
      pixelEvidence: evidenceList,
      paidProviderCalls: 0,
    },
  };
}
