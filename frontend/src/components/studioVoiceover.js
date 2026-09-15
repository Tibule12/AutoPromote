import { isStudioAudioTrackAudible } from "./studioAudioTracks";

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const voiceoverGain = value => Math.max(0, Math.min(1, finite(value ?? 1, 1)));
export const voiceoverDuration = take => Math.max(0.05, Math.min(7200, finite(take.duration, 0.05)));
export const voiceoverTrackAudible = states => isStudioAudioTrackAudible(states, "voiceover");

export async function uploadVoiceoversForRender(takes, { upload, token, audible = true }) {
  if (!audible) return [];
  return Promise.all(takes.filter(take => take.enabled !== false).map(async take => {
    let url = take.url;
    if (!url || url.startsWith("blob:")) {
      if (!(take.file instanceof Blob)) throw new Error(`Reconnect the recording “${take.name}” before exporting.`);
      const result = await upload({ file: take.file, token, mediaType: "audio",
        fileName: take.file.name || `${take.id}.webm` });
      url = result.url;
    }
    if (!/^https?:\/\//i.test(url || "")) throw new Error(`The recording “${take.name}” could not be uploaded.`);
    return { id: take.id, name: take.name, kind: "voiceover", builtIn: false, url,
      startTime: Math.max(0, finite(take.startTime, 0)), duration: voiceoverDuration(take),
      trimStart: Math.max(0, finite(take.trimStart, 0)), volume: voiceoverGain(take.volume),
      fadeIn: Math.max(0, finite(take.fadeIn, 0)), fadeOut: Math.max(0, finite(take.fadeOut, 0)), enabled: true };
  }));
}
