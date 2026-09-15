export const STUDIO_AUDIO_TRACKS = ["originalAudio", "voiceover", "music", "broll", "sfx"];

export const isStudioAudioTrackAudible = (states, id) => {
  if (states?.[id]?.muted) return false;
  const hasSolo = STUDIO_AUDIO_TRACKS.some(track => states?.[track]?.solo);
  return !hasSolo || !!states?.[id]?.solo;
};
