const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const clamp = value => Math.max(0, Math.min(1, value));

// Recorded speech and music use two sequential afade filters in the final
// mixer. This differs from the minimum envelope used by synthesized SFX.
export function studioAudioFadeGain(time, duration, fadeIn, fadeOut) {
  const elapsed = positive(time), length = positive(duration);
  const attack = positive(fadeIn), release = positive(fadeOut);
  return (attack > 0 ? clamp(elapsed / attack) : 1) *
    (release > 0 ? clamp(1 - (elapsed - Math.max(0, length - release)) / release) : 1);
}

export function studioMusicFadeGain(time, duration, fadeIn, fadeOut) {
  const limit = Math.min(5, positive(duration));
  return studioAudioFadeGain(time, duration, Math.min(limit, positive(fadeIn)), Math.min(limit, positive(fadeOut)));
}

// Linked cuts retain the authored envelope's clock, just as they retain the
// source sample offset. Missing fields are the original whole-take behaviour.
export function retainStudioVoiceoverFade(take, skipped) {
  return { fadeOffset: positive(take.fadeOffset) + positive(skipped),
    fadeDuration: positive(take.fadeDuration ?? take.duration) };
}
