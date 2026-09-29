import { interpolateAutomationValue, sortAutomationKeyframes } from "./studioAutomation";
import { secondsToTicks, ticksToSeconds } from "./studioTime";

// Recipes are ordinary, editable timeline keys. No parallel CSS effect runs.
export const buildCreatorMotionRecipe = ({ preset, time, duration, zoom = 1.34 }) => {
  const start = Math.max(0, Math.min(Number(duration) || 0, Number(time) || 0));
  const span = Math.min(preset === "crash_zoom" ? 0.46 : 0.62, duration - start);
  if (span < 0.1) return [];
  const attack = span * (preset === "crash_zoom" ? 0.12 / 0.46 : 0.28 / 0.62);
  return [
    { time: start, value: null, easing: "linear" },
    {
      time: start + attack,
      value: Math.min(2, Math.max(1.05, Number(zoom) || 1.34)),
      easing: preset === "snap_zoom" ? "hold" : preset === "crash_zoom" ? "ease_in" : "ease_out",
    },
    { time: start + span, value: null, easing: "ease_out" },
  ];
};

export const buildCreatorSpeedRecipe = ({ time, duration }) => {
  const start = Math.max(0, Math.min(Number(duration) || 0, Number(time) || 0));
  const span = Math.min(3.3, duration - start);
  if (span < 0.3) return [];
  return [
    { time: start, value: null, easing: "linear" },
    { time: start + span / 3, value: 2, easing: "ease_in" },
    { time: start + (span * 2) / 3, value: 0.5, easing: "ease_in_out" },
    { time: start + span, value: null, easing: "ease_out" },
  ];
};

// FFmpeg renders speed as ordered constant-rate ranges. Sample the exact
// browser automation curve into short bounded ranges so Creator ramps reach
// export instead of silently falling back to the global preview speed.
export const buildSpeedSegmentsFromKeyframes = ({
  keyframes,
  duration,
  fallback = 1,
  samplesPerSecond = 8,
  maxSegments = 240,
} = {}) => {
  const end = Math.max(0, Number(duration) || 0);
  if (!end) return [];
  const limit = Math.floor(Number(maxSegments));
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("maxSegments must be a positive integer");
  }
  const sampleRate = Number(samplesPerSecond);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("samplesPerSecond must be positive");
  }
  const endTick = secondsToTicks(end);
  if (!endTick) throw new RangeError("speed plan duration must be at least one media tick");
  const keys = sortAutomationKeyframes(keyframes).filter(
    key => key.property === "speed" && Number.isFinite(Number(key.value))
  );
  if (!keys.length || keys.every(key => Number(key.value) === Number(keys[0].value))) {
    const rate = keys.length ? Number(keys[0].value) : Number(fallback) || 1;
    return [
      {
        id: "speed-1",
        startTime: 0,
        endTime: end,
        rate: Math.max(0.5, Math.min(2, rate)),
        pitchPreserved: true,
      },
    ];
  }

  // Key times are mandatory boundaries. Allocate optional samples over the
  // entire interval before emitting anything, so a budget cannot truncate it.
  const boundaries = new Set([0, endTick]);
  keys.forEach(key => boundaries.add(secondsToTicks(Math.max(0, Math.min(end, Number(key.time))))));
  const ordered = [...boundaries].sort((a, b) => a - b);
  if (ordered.length - 1 > limit) {
    throw new RangeError("speed keyframe boundaries exceed maxSegments");
  }
  const intervals = ordered.slice(0, -1).map((startTick, index) => {
    const endTick = ordered[index + 1];
    const spanTicks = endTick - startTick;
    const inset = Math.min(1, Math.floor(spanTicks / 4));
    const firstRate = interpolateAutomationValue({
      keyframes: keys,
      property: "speed",
      time: ticksToSeconds(startTick + inset),
      fallback,
    });
    const lastRate = interpolateAutomationValue({
      keyframes: keys,
      property: "speed",
      time: ticksToSeconds(endTick - inset),
      fallback,
    });
    const varying = Math.abs(firstRate - lastRate) > 0.000001;
    const desired = varying
      ? Math.min(32, spanTicks, Math.max(1, Math.ceil(ticksToSeconds(spanTicks) * sampleRate)))
      : 1;
    return { startTick, endTick, desiredExtra: desired - 1, extra: 0 };
  });
  const remaining = limit - intervals.length;
  const desiredExtras = intervals.reduce((total, interval) => total + interval.desiredExtra, 0);
  if (desiredExtras <= remaining) {
    intervals.forEach(interval => {
      interval.extra = interval.desiredExtra;
    });
  } else if (remaining > 0) {
    let assigned = 0;
    const ranked = intervals
      .map((interval, index) => {
        const share = (interval.desiredExtra * remaining) / desiredExtras;
        interval.extra = Math.floor(share);
        assigned += interval.extra;
        return { index, remainder: share - interval.extra };
      })
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
    for (let index = 0; index < remaining - assigned; index += 1) {
      intervals[ranked[index].index].extra += 1;
    }
  }
  const raw = [];
  intervals.forEach(interval => {
    const slices = interval.extra + 1;
    for (let slice = 0; slice < slices; slice += 1) {
      const leftTick =
        interval.startTick + Math.floor(((interval.endTick - interval.startTick) * slice) / slices);
      const rightTick =
        interval.startTick +
        Math.floor(((interval.endTick - interval.startTick) * (slice + 1)) / slices);
      const startTime = ticksToSeconds(leftTick);
      const endTime = rightTick === endTick ? end : ticksToSeconds(rightTick);
      const rate = Math.max(
        0.5,
        Math.min(
          2,
          interpolateAutomationValue({
            keyframes: keys,
            property: "speed",
            time: ticksToSeconds(Math.round((leftTick + rightTick) / 2)),
            fallback,
          })
        )
      );
      raw.push({ startTime, endTime, rate: Number(rate.toFixed(4)), pitchPreserved: true });
    }
  });
  return raw.reduce((segments, segment) => {
    const previous = segments[segments.length - 1];
    if (previous && previous.rate === segment.rate) {
      previous.endTime = segment.endTime;
    } else {
      segments.push({ ...segment, id: `speed-${segments.length + 1}` });
    }
    return segments;
  }, []);
};

export const mergeCreatorRecipe = ({
  keyframes,
  points,
  targetId,
  property,
  fallback = 1,
  createId,
}) => {
  if (!points.length) return keyframes;
  const start = points[0].time;
  const end = points[points.length - 1].time;
  const belongs = key => String(key.targetId) === String(targetId) && key.property === property;
  const original = keyframes.filter(belongs);
  const generated = points.map(point => ({
    ...point,
    id: createId(),
    targetId,
    property,
    value:
      point.value ??
      interpolateAutomationValue({ keyframes: original, property, time: point.time, fallback }),
  }));
  return sortAutomationKeyframes([
    ...keyframes.filter(key => !belongs(key) || key.time < start || key.time > end),
    ...generated,
  ]);
};

export const findCreatorBeat = (markers, time, duration) => {
  const valid = (markers || [])
    .map(marker => Number(typeof marker === "number" ? marker : marker?.time))
    .filter(beat => Number.isFinite(beat) && beat >= 0 && beat < duration);
  if (!valid.length) return null;
  return valid.reduce((nearest, beat) =>
    Math.abs(beat - time) < Math.abs(nearest - time) ? beat : nearest
  );
};
