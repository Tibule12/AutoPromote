import { equalPowerPanGains } from "./studioAudioDspEngine";
import { normalizeSplitAudioClip } from "./studioAudioSplit";
import { studioMusicFadeGain } from "./studioAudioFades";
import { interpolateAutomationValue } from "./studioAutomation";

const STEM_TRACK_ORDER = [
  { bus: "originalAudio", filename: "01_dialogue.wav", label: "Dialogue (Original)" },
  { bus: "broll", filename: "02_broll.wav", label: "B-Roll Audio" },
  { bus: "music", filename: "03_music.wav", label: "Music Bed" },
  { bus: "voiceover", filename: "04_voiceover.wav", label: "Voiceover" },
  { bus: "sfx", filename: "05_sfx.wav", label: "Sound Effects" },
];

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isBusAudible(trackStates = {}, bus) {
  const states = trackStates || {};
  if (states[bus]?.muted) return false;
  const soloed = Object.keys(states).filter(k => states[k]?.solo);
  return soloed.length === 0 || soloed.includes(bus);
}

/**
 * Builds an aligned multi-track stem plan where every active bus shares
 * startTime = 0 and exact programme/output duration.
 */
export function buildAudioStemPlan({
  durationSeconds = 0,
  playbackRate = 1,
  timelineSegments = [],
  overlays = [],
  musicTrack = null,
  voiceovers = [],
  soundEffects = [],
  trackStates = {},
  audioKeyframes = {},
} = {}) {
  const rate = Number.isFinite(Number(playbackRate)) && Number(playbackRate) > 0 ? Number(playbackRate) : 1;
  let timelineTotal = 0;
  const normalizedDialogueClips = (Array.isArray(timelineSegments) ? timelineSegments : []).map((clip, idx) => {
    const start = Number(clip?.startRequest ?? clip?.start_time ?? clip?.startTime ?? clip?.start ?? 0);
    const rawEnd = clip?.endRequest ?? clip?.end_time ?? clip?.endTime ?? clip?.end;
    const end = rawEnd !== undefined && rawEnd !== null ? Number(rawEnd) : start + (Number(clip?.duration) || 0.04);
    const dur = Math.max(0.04, Number.isFinite(end) && end > start ? end - start : Number(clip?.duration) || 0.04);
    const split = normalizeSplitAudioClip(
      { ...clip, startRequest: start, endRequest: start + dur },
      idx,
      timelineTotal
    );
    timelineTotal += dur;
    return {
      url: clip?.url || clip?.src || "",
      sourceStart: Math.max(0, split.audioDetached ? Number(clip.audioSourceStart) : start + split.audioTrimOffsetStart),
      programmeStart: split.audioTimelineStart / rate,
      duration: Math.max(0.04, split.audioTimelineDuration / rate),
      gain: Number(clip?.volume ?? 1),
    };
  });

  const programmeSeconds = Math.max(
    0.05,
    (Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
      ? Number(durationSeconds)
      : timelineTotal) / rate
  );

  const busClips = {
    originalAudio: normalizedDialogueClips.filter(c => c.url || normalizedDialogueClips.length),
    broll: (Array.isArray(overlays) ? overlays : [])
      .filter(o => o && o.type === "video" && !o.muted && (o.overlayAudioVolume ?? 1) > 0)
      .map(o => ({
        url: o.url || o.src || "",
        sourceStart: Math.max(0, Number(o.sourceStartTime ?? o.sourceStart ?? 0)),
        programmeStart: Math.max(0, Number(o.startTime ?? o.start_time ?? 0) / rate),
        duration: Math.max(0.04, Number(o.duration || 1) / rate),
        gain: Number(o.overlayAudioVolume ?? 1),
        fadeIn: 0.06,
        fadeOut: 0.06,
      })),
    music:
      musicTrack && (musicTrack.url || musicTrack.file)
        ? [
            {
              url: musicTrack.url || "",
              sourceStart: Math.max(0, Number(musicTrack.trimStart ?? 0)),
              programmeStart: 0,
              duration: programmeSeconds,
              gain: Number(musicTrack.volume ?? 0.35),
              fadeIn: Number(musicTrack.fadeIn ?? 0),
              fadeOut: Number(musicTrack.fadeOut ?? 0),
              loop: musicTrack.loop !== false,
            },
          ]
        : [],
    voiceover: (Array.isArray(voiceovers) ? voiceovers : []).map(vo => ({
      url: vo.url || vo.src || "",
      sourceStart: Math.max(0, Number(vo.sourceStart ?? 0)),
      programmeStart: Math.max(0, Number(vo.startTime ?? 0) / rate),
      duration: Math.max(0.04, Number(vo.duration || 1) / rate),
      gain: Number(vo.volume ?? 1),
    })),
    sfx: (Array.isArray(soundEffects) ? soundEffects : []).map(sfx => ({
      url: sfx.url || sfx.src || "",
      sourceStart: 0,
      programmeStart: Math.max(0, Number(sfx.startTime ?? 0) / rate),
      duration: Math.max(0.04, Number(sfx.duration || 0.5) / rate),
      gain: Number(sfx.volume ?? 1),
    })),
  };

  const stems = [];
  for (const def of STEM_TRACK_ORDER) {
    const clips = busClips[def.bus] || [];
    if (!clips.length || !isBusAudible(trackStates, def.bus)) continue;
    stems.push({
      bus: def.bus,
      filename: def.filename,
      label: def.label,
      startSeconds: 0,
      durationSeconds: Number(programmeSeconds.toFixed(6)),
      pan: Math.max(-100, Math.min(100, Number(trackStates?.[def.bus]?.pan ?? 0) || 0)),
      keyframes: Array.isArray(audioKeyframes?.[def.bus]) ? audioKeyframes[def.bus] : [],
      clips,
    });
  }

  return {
    sampleRate: 48000,
    channels: 2,
    durationSeconds: Number(programmeSeconds.toFixed(6)),
    stems,
  };
}

/**
 * Encodes stereo [left, right] Float32Arrays into a valid 48kHz 16-bit PCM WAV binary.
 */
export function encodeStereoInt16Wav(leftChannel, rightChannel, sampleRate = 48000) {
  const frameCount = Math.min(leftChannel.length, rightChannel.length);
  const dataBytes = frameCount * 4;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // stereo
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true); // block align
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (let i = 0; i < frameCount; i += 1) {
    const l = Math.max(-1, Math.min(1, leftChannel[i]));
    const r = Math.max(-1, Math.min(1, rightChannel[i]));
    view.setInt16(pos, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(pos + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    pos += 4;
  }
  return new Uint8Array(buffer);
}

/**
 * Mixes a single aligned stem spec into exact-length stereo Float32Arrays using
 * clip offsets, fades, volume automation curves, and equal-power stereo panning.
 */
export function renderStemPlanToStereoBuffers(stemSpec, clipSourcesMap, sampleRate = 48000) {
  const totalFrames = Math.max(1, Math.round(stemSpec.durationSeconds * sampleRate));
  const outL = new Float32Array(totalFrames);
  const outR = new Float32Array(totalFrames);
  const pan = equalPowerPanGains(stemSpec.pan || 0);

  for (const clip of stemSpec.clips) {
    const src = clipSourcesMap instanceof Map ? clipSourcesMap.get(clip.url) : clipSourcesMap?.[clip.url];
    if (!src || !src.left?.length) continue;
    const srcL = src.left;
    const srcR = src.right || src.left;
    const srcLen = Math.min(srcL.length, srcR.length);
    const startFrame = Math.max(0, Math.round(clip.programmeStart * sampleRate));
    const endFrame = Math.min(totalFrames, Math.round((clip.programmeStart + clip.duration) * sampleRate));
    const srcOffsetFrames = Math.max(0, Math.round((clip.sourceStart || 0) * sampleRate));

    for (let f = startFrame; f < endFrame; f += 1) {
      const relFrame = f - startFrame;
      const sIdxRaw = srcOffsetFrames + relFrame;
      const sIdx = clip.loop ? sIdxRaw % srcLen : sIdxRaw;
      if (sIdx < 0 || sIdx >= srcLen) continue;
      const relTime = relFrame / sampleRate;
      const fadeGain =
        clip.fadeIn || clip.fadeOut
          ? studioMusicFadeGain(relTime, clip.duration, clip.fadeIn || 0, clip.fadeOut || 0)
          : 1;
      const autoPercent = stemSpec.keyframes?.length
        ? interpolateAutomationValue(stemSpec.keyframes, "volume", f / sampleRate, 100)
        : 100;
      const g = Math.max(0, Number(clip.gain ?? 1) * fadeGain * (autoPercent / 100));
      const sl = srcL[sIdx] * g;
      const sr = srcR[sIdx] * g;
      outL[f] += sl * pan.leftFromLeft + sr * pan.leftFromRight;
      outR[f] += sl * pan.rightFromLeft + sr * pan.rightFromRight;
    }
  }

  return { left: outL, right: outR, sampleRate, frameCount: totalFrames };
}

/**
 * Pure-JS STORE ZIP builder (zero external dependencies) verified against standard unzippers.
 */
export function buildStoreZipArchive(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.filename);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);

    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    new Uint8Array(localHeader, 30).set(nameBytes);

    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(centralHeader);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    new Uint8Array(centralHeader, 46).set(nameBytes);

    const lBytes = new Uint8Array(localHeader);
    localParts.push(lBytes, data);
    centralParts.push(new Uint8Array(centralHeader));
    offset += lBytes.length + data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + 22;
  const archive = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  archive.set(new Uint8Array(eocd), cursor);
  return archive;
}

export async function exportStudioAudioStemsArchive({
  projectName = "viral-clip-sequence",
  decodeAudioUrl,
  ...planOptions
} = {}) {
  const plan = buildAudioStemPlan(planOptions);
  const uniqueUrls = Array.from(
    new Set(plan.stems.flatMap(s => s.clips.map(c => c.url)).filter(Boolean))
  );
  const decodedMap = new Map();
  const warnings = [];

  if (typeof decodeAudioUrl === "function") {
    for (const url of uniqueUrls) {
      try {
        const decoded = await decodeAudioUrl(url, plan.sampleRate);
        if (decoded?.left?.length) {
          decodedMap.set(url, decoded);
        } else {
          warnings.push(`No decodable audio stream returned for ${url}`);
        }
      } catch (err) {
        warnings.push(`Could not decode ${url} in browser (${err?.message || "CORS/decode error"}); stem slot padded silently.`);
      }
    }
  }

  const archiveEntries = [];
  for (const stem of plan.stems) {
    const buffers = renderStemPlanToStereoBuffers(stem, decodedMap, plan.sampleRate);
    const wavBytes = encodeStereoInt16Wav(buffers.left, buffers.right, plan.sampleRate);
    archiveEntries.push({ filename: stem.filename, data: wavBytes });
  }

  const manifest = {
    version: 1,
    sampleRate: plan.sampleRate,
    channels: 2,
    durationSeconds: plan.durationSeconds,
    stems: plan.stems.map(s => ({
      bus: s.bus,
      filename: s.filename,
      label: s.label,
      startSeconds: s.startSeconds,
      durationSeconds: s.durationSeconds,
      pan: s.pan,
    })),
    warnings,
  };
  archiveEntries.push({
    filename: "stems_manifest.json",
    data: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  });

  const zipBytes = buildStoreZipArchive(archiveEntries);
  const safeBase =
    String(projectName || "viral-clip-sequence")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "viral-clip-sequence";

  return {
    filename: `${safeBase}-stems.zip`,
    mimeType: "application/zip",
    content: zipBytes,
    stemCount: plan.stems.length,
    manifest,
    warnings,
  };
}
