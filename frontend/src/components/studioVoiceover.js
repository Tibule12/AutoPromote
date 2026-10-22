import { applySafeMediaSource } from "../utils/security";
import { isStudioAudioTrackAudible } from "./studioAudioTracks";
import { studioUploadedAudioBinding } from "./studioAudioSourceBindings";
import { studioAudioFadeGain } from "./studioAudioFades";

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const voiceoverGain = value => Math.max(0, Math.min(1, finite(value ?? 1, 1)));
export const voiceoverDuration = take =>
  Math.max(0.05, Math.min(7200, finite(take.duration, 0.05)));
export const voiceoverTrackAudible = states => isStudioAudioTrackAudible(states, "voiceover");

// Final speech uses sequential FFmpeg afade filters. Their gains multiply;
// a fade longer than a take starts at zero, rather than ending prematurely.
export function voiceoverFadeGain(take, elapsed) {
  return studioAudioFadeGain(elapsed, voiceoverDuration(take), take.fadeIn, take.fadeOut);
}

// Native media time-stretching remains necessary for retimed speech. Short
// 1x takes can use the same sample clock as music/SFX without altering pitch.
export function voiceoverPcmEligible(take, timeMap) {
  const start = finite(take.startTime, 0),
    end = start + voiceoverDuration(take);
  const sourceDuration = Number(take.sourceDuration);
  if (
    !(sourceDuration > 0 && sourceDuration <= 60) ||
    voiceoverDuration(take) > 60 ||
    !timeMap?.length ||
    start < 0 ||
    end * 90000 > timeMap.at(-1).programmeRange.endTick
  )
    return false;
  const ranges = timeMap.filter(
    range =>
      range.programmeRange.endTick > start * 90000 && range.programmeRange.startTick < end * 90000
  );
  return ranges.length > 0 && ranges.every(range => range.rateNumerator === range.rateDenominator);
}

export function voiceoverPcmKey(projectId, take) {
  const path = take.sourceStoragePath || take.storagePath;
  const owned = take.ownerUid && path && /^[a-f0-9]{64}$/.test(take.contentHash || "");
  return JSON.stringify([
    projectId,
    ...(owned ? [take.ownerUid, path, take.contentHash] : [take.url]),
    take.trimStart || 0,
    voiceoverDuration(take),
    take.fadeIn || 0,
    take.fadeOut || 0,
  ]);
}

// Match the worker's trimmed mono speech. Zero fades remain zero; unlike SFX,
// a spoken take must not acquire an implicit attack/release at its boundaries.
export function createVoiceoverPcmBuffer(context, decoded, take) {
  if (decoded.numberOfChannels !== 1 || decoded.sampleRate !== context.sampleRate) return null;
  const first = Math.round(Math.max(0, finite(take.trimStart, 0)) * context.sampleRate);
  const count = Math.min(
    Math.ceil(voiceoverDuration(take) * context.sampleRate),
    decoded.length - first
  );
  if (count <= 0 || count * 4 > 32 * 1024 * 1024) return null;
  const buffer = context.createBuffer(1, count, context.sampleRate);
  const input = decoded.getChannelData(0),
    output = buffer.getChannelData(0);
  for (let i = 0; i < count; i++) {
    const time = i / context.sampleRate;
    const gain = voiceoverFadeGain(take, time);
    output[i] = input[first + i] * gain;
  }
  return buffer;
}

export async function uploadVoiceoversForRender(takes, { upload, token, audible = true }) {
  if (!audible) return [];
  return Promise.all(
    takes
      .filter(take => take.enabled !== false)
      .map(async take => {
        let url = take.url;
        let binding = studioUploadedAudioBinding(take, {
          url,
          storagePath: take.sourceStoragePath || take.storagePath,
          ownerUid: take.ownerUid,
          contentHash: take.contentHash,
        });
        if (!url || url.startsWith("blob:")) {
          if (!(take.file instanceof Blob))
            throw new Error(`Reconnect the recording “${take.name}” before exporting.`);
          const result = await upload({
            file: take.file,
            token,
            mediaType: "audio",
            fileName: take.file.name || `${take.id}.webm`,
          });
          url = result.url;
          binding = studioUploadedAudioBinding(take, result);
        }
        if (!/^https?:\/\//i.test(url || ""))
          throw new Error(`The recording “${take.name}” could not be uploaded.`);
        return {
          id: take.id,
          name: take.name,
          kind: "voiceover",
          builtIn: false,
          url,
          ...binding,
          startTime: Math.max(0, finite(take.startTime, 0)),
          duration: voiceoverDuration(take),
          trimStart: Math.max(0, finite(take.trimStart, 0)),
          volume: voiceoverGain(take.volume),
          fadeIn: Math.max(0, finite(take.fadeIn, 0)),
          fadeOut: Math.max(0, finite(take.fadeOut, 0)),
          enabled: true,
        };
      })
  );
}

export function constantMusicDuckGain(track) {
  return track?.ducking && track.duckingMode === "constant"
    ? 1 - Math.max(0.05, Math.min(0.95, finite(track.duckingStrength, 0.4)))
    : 1;
}

export async function readVoiceoverDuration(file, url) {
  if (!(file instanceof Blob) || !file.size || file.size > 128 * 1024 * 1024)
    throw new Error("Choose an audio recording smaller than 128 MB.");
  const audio = document.createElement("audio");
  try {
    return await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        const duration = Number(audio.duration);
        if (error) reject(error);
        else if (!Number.isFinite(duration) || duration < 0.05 || duration > 7200)
          reject(new Error("Choose a recording between 0.05 seconds and two hours."));
        else resolve(duration);
      };
      const timer = setTimeout(
        () => finish(new Error("The recording could not be read. Choose another audio file.")),
        15000
      );
      audio.onloadedmetadata = () => finish();
      audio.onerror = () => finish(new Error("This recording could not be decoded."));
      audio.preload = "metadata";
      if (!applySafeMediaSource(audio, url)) finish(new Error("Invalid recording URL."));
    });
  } finally {
    audio.removeAttribute("src");
    audio.load();
  }
}
