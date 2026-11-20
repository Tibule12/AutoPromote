/**
 * Professional SMPTE non-drop-frame (NDF) and drop-frame (DF) timecode
 * formatting and parsing helpers for timeline navigation and scrubbing.
 */

const EXACT_NTSC_RATES = [
  { match: 23.976, fps: 24000 / 1001, nominalFps: 24, label: "23.976", dropFrameCapable: false, dropFramesPerMinute: 0 },
  { match: 29.97, fps: 30000 / 1001, nominalFps: 30, label: "29.97", dropFrameCapable: true, dropFramesPerMinute: 2 },
  { match: 59.94, fps: 60000 / 1001, nominalFps: 60, label: "59.94", dropFrameCapable: true, dropFramesPerMinute: 4 },
];

function parseNumericRate(frameRate) {
  if (typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0) {
    return frameRate;
  }
  const raw = String(frameRate || "").trim();
  if (!raw) return 30;
  const fractionMatch = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const num = Number(fractionMatch[1]);
    const den = Number(fractionMatch[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && num > 0 && den > 0) {
      return num / den;
    }
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function normalizeFrameRate(frameRate = 30) {
  const numeric = parseNumericRate(frameRate);
  for (const ntsc of EXACT_NTSC_RATES) {
    if (Math.abs(numeric - ntsc.match) < 0.008 || Math.abs(numeric - ntsc.fps) < 0.008) {
      return {
        fps: ntsc.fps,
        nominalFps: ntsc.nominalFps,
        label: ntsc.label,
        dropFrameCapable: ntsc.dropFrameCapable,
        dropFramesPerMinute: ntsc.dropFramesPerMinute,
      };
    }
  }
  const clamped = Math.max(1, Math.min(240, numeric));
  const rounded = Math.round(clamped);
  const isInt = Math.abs(clamped - rounded) < 0.005;
  return {
    fps: isInt ? rounded : clamped,
    nominalFps: Math.max(1, rounded),
    label: isInt ? String(rounded) : String(Number(clamped.toFixed(3))),
    dropFrameCapable: false,
    dropFramesPerMinute: 0,
  };
}

export function resolveDropFrameMode(frameRate = 30, dropFrame = "auto") {
  const info = normalizeFrameRate(frameRate);
  if (!info.dropFrameCapable) return false;
  if (dropFrame === "auto") return true;
  return Boolean(dropFrame);
}

function pad2(value) {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

export function formatSmpteTimecode(seconds, frameRate = 30, options = {}) {
  const info = normalizeFrameRate(frameRate);
  const useDropFrame = resolveDropFrameMode(frameRate, options.dropFrame ?? "auto");
  const safeSeconds = Math.max(0, Number.isFinite(Number(seconds)) ? Number(seconds) : 0);
  const frameIndex = Math.max(0, Math.floor(safeSeconds * info.fps + 1e-6));

  let displayFrameNumber = frameIndex;
  if (useDropFrame) {
    const d = info.dropFramesPerMinute;
    const framesPer10Min = info.nominalFps * 600 - d * 9;
    const framesPerMin = info.nominalFps * 60 - d;
    const tenMinBlocks = Math.floor(frameIndex / framesPer10Min);
    const remainder = frameIndex % framesPer10Min;
    const extraMinutes = remainder > d ? Math.floor((remainder - d) / framesPerMin) : 0;
    displayFrameNumber = frameIndex + 9 * d * tenMinBlocks + d * extraMinutes;
  }

  const nominalFps = info.nominalFps;
  const frames = displayFrameNumber % nominalFps;
  const totalSeconds = Math.floor(displayFrameNumber / nominalFps);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const sep = useDropFrame ? ";" : ":";
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}${sep}${pad2(frames)}`;
}

function computeFrameIndexFromFields(hh, mm, ss, ff, info, useDropFrame) {
  const nominalFps = info.nominalFps;
  if (!useDropFrame) {
    return (hh * 3600 + mm * 60 + ss) * nominalFps + ff;
  }
  const d = info.dropFramesPerMinute;
  const totalMinutes = hh * 60 + mm;
  const safeFf = ss === 0 && totalMinutes % 10 !== 0 && ff < d ? d : ff;
  const dropped = d * (totalMinutes - Math.floor(totalMinutes / 10));
  return (hh * 3600 + mm * 60 + ss) * nominalFps + safeFf - dropped;
}

function parseAbsoluteTimecode(raw, info, requestedDropFrame) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: "Enter timecode (HH:MM:SS:FF, MM:SS, or seconds)" };
  }

  const framesOnlyMatch = trimmed.match(/^(\d+)\s*f$/i);
  if (framesOnlyMatch) {
    const frameIndex = Number(framesOnlyMatch[1]);
    return {
      valid: true,
      seconds: frameIndex / info.fps,
      frameIndex,
      dropFrame: resolveDropFrameMode(info.fps, requestedDropFrame),
    };
  }

  const secondsOnlyMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*s?$/i);
  if (secondsOnlyMatch) {
    const seconds = Number(secondsOnlyMatch[1]);
    const useDropFrame = resolveDropFrameMode(info.fps, requestedDropFrame);
    return {
      valid: true,
      seconds,
      frameIndex: Math.floor(seconds * info.fps + 1e-6),
      dropFrame: useDropFrame,
    };
  }

  // Colon / semicolon timecode formats:
  // - MM:SS or MM:SS.fraction
  // - MM:SS:FF or MM:SS;FF
  // - HH:MM:SS:FF or HH:MM:SS;FF
  const tokens = trimmed.split(/[:;]/);
  if (tokens.length === 2) {
    if (!/^\d+$/.test(tokens[0]) || !/^\d+(?:\.\d+)?$/.test(tokens[1])) {
      return { valid: false, error: "Invalid MM:SS timecode" };
    }
    const mm = Number(tokens[0]);
    const ss = Number(tokens[1]);
    if (ss >= 60) {
      return { valid: false, error: "Seconds must be under 60 in MM:SS format" };
    }
    const seconds = mm * 60 + ss;
    const useDropFrame = resolveDropFrameMode(info.fps, requestedDropFrame);
    return {
      valid: true,
      seconds,
      frameIndex: Math.floor(seconds * info.fps + 1e-6),
      dropFrame: useDropFrame,
    };
  }

  if (tokens.length === 3 || tokens.length === 4) {
    if (tokens.some(part => !/^\d+$/.test(part))) {
      return { valid: false, error: "Timecode fields must be whole numbers" };
    }
    const nums = tokens.map(Number);
    const [hh, mm, ss, ff] = tokens.length === 3 ? [0, nums[0], nums[1], nums[2]] : nums;
    if (mm >= 60 || ss >= 60 || ff >= info.nominalFps) {
      return {
        valid: false,
        error: `Fields out of range for ${info.label} fps (max frame ${info.nominalFps - 1})`,
      };
    }
    const hasSemicolon = trimmed.includes(";");
    const useDropFrame = hasSemicolon
      ? info.dropFrameCapable
      : resolveDropFrameMode(info.fps, requestedDropFrame);
    const frameIndex = computeFrameIndexFromFields(hh, mm, ss, ff, info, useDropFrame);
    return {
      valid: true,
      seconds: Math.max(0, frameIndex / info.fps),
      frameIndex: Math.max(0, frameIndex),
      dropFrame: useDropFrame,
    };
  }

  return { valid: false, error: "Unsupported timecode format" };
}

export function parseStudioTimecode(input, frameRate = 30, options = {}) {
  const info = normalizeFrameRate(frameRate);
  const requestedDropFrame = options.dropFrame ?? "auto";
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { valid: false, error: "Enter timecode (HH:MM:SS:FF, MM:SS, or seconds)" };
  }

  const sign = raw[0] === "+" ? 1 : raw[0] === "-" ? -1 : 0;
  const payload = sign !== 0 ? raw.slice(1).trim() : raw;
  const parsed = parseAbsoluteTimecode(payload, info, requestedDropFrame);
  if (!parsed.valid) return parsed;

  let seconds = parsed.seconds;
  if (sign !== 0) {
    const base = Math.max(0, Number(options.currentSeconds || 0));
    seconds = base + sign * parsed.seconds;
  }
  seconds = Math.max(0, seconds);
  if (Number.isFinite(options.maxSeconds)) {
    seconds = Math.min(Math.max(0, Number(options.maxSeconds)), seconds);
  }
  return {
    valid: true,
    seconds,
    frameIndex: Math.max(0, Math.floor(seconds * info.fps + 1e-6)),
    dropFrame: parsed.dropFrame,
  };
}
