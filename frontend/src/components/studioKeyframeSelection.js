// Batch operations edit ordinary canonical motion keys in one transaction.
import { STUDIO_EASINGS } from './studioAutomation';
import { studioMotionPropertiesForTarget } from './studioMotionProperties';
const tick = time => Math.round(time * 90000) / 90000;
export function retargetStudioKeyframes(clipboard, target) {
  if (!target?.id) throw Error('Choose an existing destination layer.');
  if (new Set(clipboard.map(key => key.targetId)).size > 1) throw Error('Copy keys from one layer before pasting onto another layer.');
  const properties = studioMotionPropertiesForTarget(target);
  return clipboard.map(key => {
    const descriptor = properties.find(property => property.id === key.property);
    if (!descriptor) throw Error(`The destination does not support ${key.property} animation.`);
    if (!Number.isFinite(key.value) || key.value < descriptor.min || key.value > descriptor.max)
      throw Error(`${descriptor.label} values must be between ${descriptor.min} and ${descriptor.max} on the destination.`);
    return { ...key, targetId: target.id };
  });
}
export function editStudioKeyframeSelection(keys, ids, action, { value, clipboard = [], pasteTarget, duration, createId, timeTolerance = 0 } = {}) {
  const selected = new Set(ids), owned = keys.filter(key => selected.has(key.id));
  if (action !== 'paste' && (!owned.length || owned.length !== selected.size)) throw Error('Select existing keyframes first.');
  let next, selectedIds = owned.map(key => key.id);
  if (action === 'delete') return { keys: keys.filter(key => !selected.has(key.id)), selectedIds: [] };
  if (action === 'move') {
    if (!Number.isFinite(value)) throw Error('Keyframe movement needs a finite time.');
    const first = Math.min(...owned.map(key => key.time)), last = Math.max(...owned.map(key => key.time));
    const delta = tick(Math.max(-first, Math.min(value, duration - last)));
    next = keys.map(key => selected.has(key.id) ? { ...key, time: tick(key.time + delta) } : key);
  } else if (action === 'scale') {
    if (!Number.isFinite(value) || value <= 0 || value > 100) throw Error('Time scale must be greater than zero and at most 100.');
    const first = Math.min(...owned.map(key => key.time));
    next = keys.map(key => selected.has(key.id) ? { ...key, time: tick(first + (key.time - first) * value) } : key);
  } else if (action === 'easing') {
    if (!STUDIO_EASINGS.some(easing => easing.id === value)) throw Error('Choose a supported interpolation.');
    next = keys.map(key => selected.has(key.id) ? { ...key, easing: value,
      ...(value === 'bezier' && !key.curve ? { curve: [.33, 0, .67, 1] } : {}) } : key);
  } else if (action === 'paste') {
    if (!clipboard.length || !Number.isFinite(value) || typeof createId !== 'function') throw Error('Copy keyframes before pasting at the playhead.');
    const source = pasteTarget ? retargetStudioKeyframes(clipboard, pasteTarget) : clipboard;
    const first = Math.min(...source.map(key => key.time));
    const pasted = source.map(key => ({ ...key, ...(key.curve ? { curve: [...key.curve] } : {}),
      ...(key.spatialCurve ? { spatialCurve: [...key.spatialCurve] } : {}), id: createId(), time: tick(value + key.time - first) }));
    for (let index = 0; index < pasted.length; index++) {
      const key = pasted[index];
      if ([...keys, ...pasted.slice(0, index)].some(other => other.targetId === key.targetId &&
          other.property === key.property && Math.abs(other.time - key.time) <= timeTolerance))
        throw Error('A keyframe already occupies that property and time. Move the playhead or selection.');
    }
    next = [...keys, ...pasted]; selectedIds = pasted.map(key => key.id);
  } else throw Error('Unsupported keyframe operation.');
  const channels = new Set(), identities = new Set();
  for (const key of next) {
    if (!Number.isFinite(key.time) || key.time < 0 || key.time > duration) throw Error('Keep selected keyframes inside the programme.');
    const channel = `${key.targetId}:${key.property}:${Math.round(key.time * 90000)}`;
    if (channels.has(channel)) throw Error('A keyframe already occupies that property and time. Move the playhead or selection.');
    if (!key.id || identities.has(key.id)) throw Error('Keyframe identities must be unique.');
    channels.add(channel); identities.add(key.id);
  }
  return { keys: next, selectedIds };
}
