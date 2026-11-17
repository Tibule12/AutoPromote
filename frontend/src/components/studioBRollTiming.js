const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const normalizeBRollEndBehavior = value => ['return', 'loop', 'hold'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'return';

export function brollSourceWindow(layer, mediaDuration = layer?.sourceDuration) {
  const length = Math.max(0, finite(mediaDuration));
  const sourceStart = Math.max(0, Math.min(finite(layer?.sourceStartTime), length ? Math.max(0, length - .05) : Infinity));
  const available = length ? Math.max(.05, length - sourceStart) : Infinity;
  const offset = Math.max(0, finite(layer?.sourceOffsetTime));
  return { sourceStart, available, offset, remaining: Math.max(0, available - offset) };
}

export const getOverlayAvailableSourceDuration = layer => layer?.type === 'video' ? brollSourceWindow(layer).remaining : Infinity;
export const getOverlayVisibleDuration = layer => {
  const duration = Math.max(0, finite(layer?.duration));
  return layer?.type === 'video' && normalizeBRollEndBehavior(layer.sourceEndBehavior) === 'return'
    ? Math.min(duration, getOverlayAvailableSourceDuration(layer)) : duration;
};
export const getOverlayAudibleDuration = layer => {
  const duration = Math.max(0, finite(layer?.duration));
  return layer?.type === 'video' && normalizeBRollEndBehavior(layer.sourceEndBehavior) !== 'loop'
    ? Math.min(duration, getOverlayAvailableSourceDuration(layer)) : duration;
};
export function brollSourceTime(layer, elapsed, mediaDuration) {
  const window = brollSourceWindow(layer, mediaDuration);
  const phase = window.offset + Math.max(0, finite(elapsed));
  return window.sourceStart + (normalizeBRollEndBehavior(layer.sourceEndBehavior) === 'loop'
    ? phase % window.available : Math.min(phase, Math.max(0, window.available - .04)));
}

// Splits and left trims keep the original loop window and its playback phase.
export function advanceBRollSource(layer, elapsed) {
  const delta = finite(elapsed);
  if (layer.sourceOffsetTime !== undefined || ['loop', 'hold'].includes(layer.sourceEndBehavior) ||
      (Number(layer.sourceDuration) > 0 && Number(layer.sourceStartTime || 0) + delta >= Number(layer.sourceDuration)))
    {
      const phase = Math.max(0, finite(layer.sourceOffsetTime)) + delta;
      const available = brollSourceWindow(layer).available;
      if (phase < 0 && layer.sourceEndBehavior === 'loop' && Number.isFinite(available))
        return {sourceOffsetTime: ((phase % available) + available) % available};
      if (phase < 0) return {sourceStartTime: Math.max(0, finite(layer.sourceStartTime) + phase), sourceOffsetTime: 0};
      return {sourceOffsetTime: phase};
    }
  return { sourceStartTime: Math.max(0, finite(layer.sourceStartTime)) + delta };
}

export function retimeBRollLayer(layer, keys, requestedStart, requestedDuration, programmeDuration) {
  const maximum = Math.max(.1, finite(programmeDuration, .1));
  const start = Math.min(maximum - .1, Math.max(0, finite(requestedStart)));
  const duration = Math.min(maximum - start, Math.max(.1, finite(requestedDuration, .1)));
  const oldStart = finite(layer.startTime ?? layer.start_time);
  const ratio = duration / Math.max(.1, finite(layer.duration, .1));
  return { layer: { ...layer, startTime: start, duration },
    keys: keys.map(key => String(key.targetId) === String(layer.id)
      ? { ...key, time: Math.round(Math.max(0, start + (key.time - oldStart) * ratio) * 90000) / 90000 } : key) };
}

export function retargetBRollPreset(previous, updated, keys, programmeDuration) {
  const result = retimeBRollLayer(previous, keys, updated.startTime ?? previous.startTime,
    updated.duration ?? previous.duration, programmeDuration);
  return { layer: {...updated, startTime:result.layer.startTime, duration:result.layer.duration},
    keys: result.keys.map(key => {
      if (String(key.targetId) !== String(previous.id)) return key;
      const defaults = {x:50, y:50, scale:1, rotation:0};
      if (!(key.property in defaults) || updated[key.property] === undefined) return key;
      const before = finite(previous[key.property], defaults[key.property]);
      const after = finite(updated[key.property], defaults[key.property]);
      return {...key, value:key.property === 'scale' && before !== 0
        ? key.value * after / before : key.value + after - before};
    }) };
}
