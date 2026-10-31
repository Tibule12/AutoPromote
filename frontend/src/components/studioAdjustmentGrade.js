import { buildAdvancedColorCube } from './studioColorCube';

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
  ]) {
    let value = input[key];
    // Early node prototypes stored percent colour values; preserve their intent.
    if (['brightness', 'contrast', 'saturation'].includes(key) && Number(value) > 10) value = Number(value) / 100;
    color[key] = fallback + (number(value, fallback, min, max) - fallback) * strength;
  }
  const advanced = input.advancedColor || {};
  // A LUT-only adjustment already has the exact trilinear grid. Expanding a
  // two-point import to 33 points adds megabytes to the signed request without
  // adding precision, and can exceed the existing bounded source descriptor.
  const imported = advanced.lutData;
  const directGrid = imported && imported.size <= 33 &&
    !(Object.values(advanced.curve || {}).some(Number) || Object.values(advanced.hsl || {}).some(Number)) &&
    (imported.domainMin || [0, 0, 0]).every(n => n === 0) &&
    (imported.domainMax || [1, 1, 1]).every(n => n === 1);
  const cube = buildAdvancedColorCube({ ...advanced, lutIntensity: number(advanced.lutIntensity, 100, 0, 100) * strength }, directGrid ? imported.size : 33);
  return { ...layer, effects: { color, blendMode: 'normal', opacity: 1,
    ...(cube ? { color_cube: cube } : {}),
    glow: { radius: number(input.glow?.radius, 8, 0, 40),
      intensity: input.glow?.enabled ? number(input.glow.intensity, .2, 0, 1) * strength : 0 },
  } };
}

export const compileStudioAdjustmentStack = layers => (layers || [])
  .filter(layer => layer.enabled !== false).map(compileStudioAdjustmentGrade);
