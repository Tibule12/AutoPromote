// Batch operations edit ordinary canonical motion keys in one transaction.
import { STUDIO_EASINGS } from './studioAutomation';
const tick = time => Math.round(time * 90000) / 90000;
export function editStudioKeyframeSelection(keys, ids, action, { value, clipboard = [], duration, createId } = {}) {
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
    const first = Math.min(...clipboard.map(key => key.time));
    const pasted = clipboard.map(key => ({ ...key, ...(key.curve ? { curve: [...key.curve] } : {}), id: createId(), time: tick(value + key.time - first) }));
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
