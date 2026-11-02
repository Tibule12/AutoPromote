import { applyStudioMediaGain, ensureAudioRemixPreview } from './audioRemixPreview';

// A decoded frame anchors the source clock, but the audio rendering thread
// must keep a fade moving while the editor's main thread is busy. Schedule a
// small bounded curve on the existing post-effects bus, never a second mixer.
export function createStudioSourceGainClock(media) {
  let scheduled = null;
  const stop = () => {
    if (!scheduled) return;
    const param = scheduled.param, held = param.value;
    param.cancelScheduledValues(0);
    param.value = held;
    scheduled = null;
  };
  return {
    stop,
    sync({ gainAtOffset, duration, automated }) {
      const current = gainAtOffset(0);
      const graph = automated && !media.paused && !media.seeking
        ? ensureAudioRemixPreview(media) : media.__audioRemixGraph;
      const context = graph?.context, param = graph?.trackGain?.gain;
      if (!automated || media.paused || media.seeking || context?.state !== 'running' ||
          typeof param?.setValueCurveAtTime !== 'function' ||
          typeof param?.cancelScheduledValues !== 'function' || !(duration > 1 / context.sampleRate)) {
        stop(); return applyStudioMediaGain(media, current);
      }
      const now = context.currentTime, source = Number(media.currentTime), rate = Number(media.playbackRate) || 1;
      if (scheduled?.param === param && scheduled.rate === rate &&
          scheduled.until - now > .25 &&
          Math.abs(source - scheduled.source - (now - scheduled.when) * rate) <= .02) return true;
      const length = Math.min(.5, duration);
      const values = Float32Array.from({ length: 65 }, (_, index) =>
        Math.max(0, Math.min(4, gainAtOffset(length * index / 64))));
      // Cancel the old curve including its in-progress interval before adding
      // a replacement; overlapping setValueCurveAtTime intervals are invalid.
      param.cancelScheduledValues(0);
      param.setValueCurveAtTime(values, now, length);
      if (media.volume !== 1) media.volume = 1;
      scheduled = { param, when: now, until: now + length, source, rate };
      return true;
    },
  };
}
