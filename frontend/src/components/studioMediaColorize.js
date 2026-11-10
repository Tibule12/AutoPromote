// Optional ordinary-media colour treatment. Omission preserves legacy pixels.
export function validateStudioMediaColorize(value) {
  if (value === undefined || value === null) return null;
  const fields = ['enabled', 'color', 'strength', 'gamma', 'lift', 'contrast'];
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)) ||
      typeof value.enabled !== 'boolean' || !/^#[a-f0-9]{6}$/i.test(value.color || '')) throw Error('Choose a valid media tint colour and switch.');
  for (const [key, low, high] of [['strength',0,1],['gamma',.35,2],['lift',0,.25]]) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < low || value[key] > high)
      throw Error(`Media tint ${key} must be between ${low} and ${high}.`);
  }
  if (value.contrast !== undefined && (typeof value.contrast !== 'number' || !Number.isFinite(value.contrast) || value.contrast < .5 || value.contrast > 3))
    throw Error('Media tint contrast must be between 0.5 and 3.');
  return { ...value };
}
export const mediaColorizeId = id => 'studio-tint-' + Array.from(String(id)).map(c => c.codePointAt(0).toString(16)).join('-');
export function mediaColorizeMatrix(spec) {
  const c = [1,3,5].map(i => parseInt(spec.color.slice(i,i+2),16)/255), gain = 1-spec.lift;
  return [c[0]*gain,0,0,0,c[0]*spec.lift, 0,c[1]*gain,0,0,c[1]*spec.lift,
    0,0,c[2]*gain,0,c[2]*spec.lift, 0,0,0,1,0].join(' ');
}
