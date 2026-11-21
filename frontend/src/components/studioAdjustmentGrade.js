import { validateSelectiveMask } from './studioSelectiveMask';
import { buildAdvancedColorCube, hasRevitalizerGrade } from './studioColorCube';

const number = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback;

// One normalized plan for the source-picture grade stack in preview and export.
// Strength interpolates grading parameters from identity; it is not layer alpha.
export function compileStudioAdjustmentGrade(layer) {
  const input = layer.finishFx || layer.effects?.color || {};
  const strength = number(layer.opacity ?? layer.effects?.opacity, 1, 0, 1) * number(layer.intensity, 100, 0, 100) / 100;
  const color = { precisionGrade: true };
  for (const [key, fallback, min, max] of [
    ['exposureStops', 0, -2, 2], ['brightness', 1, .65, 1.4],
    ['contrast', 1, .65, 1.75], ['saturation', 1, 0, 1.8],
    ['lift', 0, -.15, .15], ['gamma', 1, .6, 1.6], ['gain', 1, .6, 1.4],
    ['temperature', 0, -1, 1], ['tint', 0, -1, 1],
    ['vignette', 0, 0, .85],
  ]) {
    let value = input[key];
    // Early node prototypes stored percent colour values; preserve their intent.
    if (['brightness', 'contrast', 'saturation'].includes(key) && Number(value) > 10) value = Number(value) / 100;
    color[key] = fallback + (number(value, fallback, min, max) - fallback) * strength;
  }

  for (const [key, fallback, min, max] of [
    ['dehaze', 0, 0, 1],
    ['clarity', 0, 0, 1],
    ['shadowRecovery', 0, 0, 1],
    ['highlightRollOff', 0, 0, 1],
    ['vibrance', 0, -1, 1],
  ]) {
    if (input[key] !== undefined && Number(input[key]) !== fallback) {
      color[key] = fallback + (number(input[key], fallback, min, max) - fallback) * strength;
    }
  }
  if (input.skinToneProtect !== undefined) {
    color.skinToneProtect = number(input.skinToneProtect, 0.85, 0, 1);
  }

  const advanced = input.advancedColor || {};
  const mask = layer.mask?.space === 'programme' ? validateSelectiveMask(layer.mask) : null;
  const clone = input.clonePatch;
  const recolor=advanced.recolor?.enabled?advanced.recolor:null;
  if(recolor&&(!/^#[a-f0-9]{6}$/i.test(recolor.color)||typeof recolor.strength!=='number'||!Number.isFinite(recolor.strength)||recolor.strength<0||recolor.strength>1))throw Error('Choose a valid selected-area colour and amount.');
  if(clone?.enabled && (!mask || ['dx','dy','strength'].some(k=>typeof clone[k]!=='number'||!Number.isFinite(clone[k])) || Math.abs(clone.dx)>1 || Math.abs(clone.dy)>1 || clone.strength<0 || clone.strength>1))throw Error('Choose a valid clean patch inside the picture.');
  if (advanced.powerWindow?.enabled) {
    color.powerWindow = { ...advanced.powerWindow };
  }
  if (advanced.qualifier?.enabled) {
    color.qualifier = { ...advanced.qualifier };
  }

  const revFields=['dehaze','shadowRecovery','highlightRollOff','clarity','vibrance'];
  const revitalizer=hasRevitalizerGrade(color)?Object.fromEntries([...revFields,'skinToneProtect'].map(f=>[f,color[f]??(f==='skinToneProtect'?0.85:0)])):advanced.revitalizer?{...advanced.revitalizer,...Object.fromEntries(revFields.map(f=>[f,Number(advanced.revitalizer[f]||0)*strength]))}:null;
  for(const f of revFields)delete color[f];
  // A LUT-only adjustment already has the exact trilinear grid. Expanding a
  // two-point import to 33 points adds megabytes to the signed request without
  // adding precision, and can exceed the existing bounded source descriptor.
  const imported = advanced.lutData;
  const directGrid = imported && imported.size <= 33 &&
    !(Object.values(advanced.curve || {}).some(Number) || Object.values(advanced.hsl || {}).some(Number)) &&
    !advanced.qualifier?.enabled && !advanced.recolor?.enabled &&
    !hasRevitalizerGrade(revitalizer) &&
    (imported.domainMin || [0, 0, 0]).every(n => n === 0) &&
    (imported.domainMax || [1, 1, 1]).every(n => n === 1);
  const cube = buildAdvancedColorCube(
    {
      ...advanced,
      qualifier: null,
      recolor: null,
      revitalizer,
      lutIntensity: number(advanced.lutIntensity, 100, 0, 100) * strength,
    },
    directGrid ? imported.size : 33
  );
  return { ...layer, effects: { color, blendMode: 'normal', opacity: 1,
    ...(cube ? { color_cube: cube } : {}),
    ...(recolor ? { recolor: {...recolor,strength:recolor.strength*strength} } : {}),
    ...(mask ? { selective_mask: {...mask,keyframes:mask.keyframes.map(key=>({...key,time:key.time+Number(layer.startTime||0)}))} } : {}),
    ...(clone?.enabled ? { clone_patch: { ...clone,strength:clone.strength*strength } } : {}),
    ...(advanced.powerWindow?.enabled ? { power_window: { ...advanced.powerWindow } } : {}),
    ...(advanced.qualifier?.enabled ? { hsl_qualifier: { ...advanced.qualifier } } : {}),
    glow: { radius: number(input.glow?.radius, 8, 0, 40),
      intensity: input.glow?.enabled ? number(input.glow.intensity, .2, 0, 1) * strength : 0 },
  } };
}

export const compileStudioAdjustmentStack = layers => (layers || [])
  .filter(layer => layer.enabled !== false).map(compileStudioAdjustmentGrade);
