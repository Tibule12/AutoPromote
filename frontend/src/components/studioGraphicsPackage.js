// An interchange authoring operation, not a second animation runtime. Imported
// graphics become ordinary layers, groups and property keys immediately.
import { sanitizeLogoSvg } from './motion/sanitizeLogoSvg';
import { GROUP_KIND, GROUP_TRANSFORM, GROUP_BOUNDS, studioGroupTree, validateStudioGroupKeyframes, validateStudioGroupComposite } from './studioGroups';

const number = (value, low, high, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    throw Error(`${label} must be between ${low} and ${high}.`);
  return value;
};
const text = (value, limit, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[<>]/u.test(value) || [...value].some(char => char.charCodeAt(0) < 9))
    throw Error(`Provide valid ${label} (at most ${limit} characters).`);
  return value;
};
const color = value => {
  if (!/^#[a-f\d]{6}$/i.test(value || '')) throw Error('Use six-digit graphic colors.');
  return value;
};
const bounds = { x: [0, 100], y: [0, 100], scale: [.1, 5], rotation: [-270, 270], opacity: [0, 1] };
const easings = ['linear', 'hold', 'ease_in', 'ease_out', 'ease_in_out', 'bezier'];
const tick = time => Math.round(time * 90000) / 90000;
const only = (object, fields, label) => {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key => !fields.includes(key)))
    throw Error(`Unknown or invalid ${label} field.`);
};

export function validateStudioGraphicsPackage(input, { duration, aspect, existingLayers = 0 }) {
  only(input, ['format', 'version', 'name', 'width', 'height', 'duration', 'layers', 'groups'], 'composition');
  if (input.format !== 'autopromote-graphics' || input.version !== 1) throw Error('Choose an AutoPromote graphics v1 composition.');
  text(input.name, 100, 'composition name');
  number(input.width, 16, 4096, 'Composition width'); number(input.height, 16, 4096, 'Composition height');
  number(input.duration, .2, duration + 1 / 90000, 'Composition duration');
  if (Math.abs(input.width / input.height - aspect) > .002) throw Error('The composition aspect must match this programme.');
  if (!Array.isArray(input.layers) || !input.layers.length || input.layers.length + existingLayers > 128)
    throw Error('Choose a composition with 1–128 graphic layers, within the project limit.');
  if (!Array.isArray(input.groups) || input.groups.length > 32) throw Error('Use at most 32 graphic groups.');
  const ids = new Set(), members = new Set(); let count = 0, artworkBytes = 0;
  const keys = (rows, start, end, limits = bounds) => {
    if (!Array.isArray(rows) || rows.length > 256) throw Error('Use at most 256 property keys per layer or group.');
    const times = new Set();
    for (const key of rows) {
      only(key, ['property', 'time', 'value', 'easing', 'curve'], 'keyframe');
      if (!limits[key.property] || !easings.includes(key.easing)) throw Error('Unsupported property or interpolation.');
      // Compare on the document's timebase. Decimal start + duration can land
      // just below its exact end key (for example 1.445 + 2.405 versus 3.85).
      number(key.time, 0, Number.MAX_VALUE, 'Key time');
      number(Math.round(key.time * 90000), Math.round(start * 90000), Math.round(end * 90000), 'Key time tick');
      number(key.value, ...limits[key.property], 'Key value');
      const stamp = `${key.property}:${tick(key.time)}`;
      if (times.has(stamp)) throw Error('A property has two keys at the same time.'); times.add(stamp);
      if (key.easing === 'bezier') {
        if (!Array.isArray(key.curve) || key.curve.length !== 4) throw Error('Custom curves need four controls.');
        key.curve.forEach((value, index) => number(value, index % 2 ? -2 : 0, index % 2 ? 2 : 1, 'Curve control'));
      } else if (key.curve !== undefined) throw Error('Only custom interpolation accepts curve controls.');
      count++;
    }
  };
  const identity = (item, limits) => {
    text(item.id, 80, 'local layer ID'); text(item.name, 100, 'layer name');
    if (ids.has(item.id)) throw Error('Composition IDs must be unique.'); ids.add(item.id);
    number(item.startTime, 0, input.duration, 'Layer start'); number(item.duration, .05, input.duration, 'Layer duration');
    if (item.startTime + item.duration > input.duration + 1 / 90000) throw Error('A layer extends beyond the composition.');
    keys(item.keys || [], item.startTime, item.startTime + item.duration, limits);
  };
  const cleanLayers = input.layers.map(layer => {
    only(layer, ['id', 'name', 'type', 'text', 'svg', 'startTime', 'duration', 'x', 'y', 'scale', 'rotation', 'opacity',
      'width', 'height', 'fontWeight', 'color', 'textAlign', 'strokeWidth', 'strokeColor', 'mask', 'keys'], 'layer');
    identity(layer);
    for (const [property, limits] of Object.entries(bounds)) number(layer[property], ...limits, property);
    number(layer.width, 1, 100, 'Layer width');
    if (layer.mask !== undefined) validateStudioGroupComposite({ mask: layer.mask });
    if (layer.type === 'text') {
      text(layer.text, 500, 'title text'); color(layer.color);
      if (layer.strokeColor !== undefined) color(layer.strokeColor);
      if (layer.strokeWidth !== undefined) number(layer.strokeWidth, 0, 8, 'Outline width');
      if (![400, 600, 800, 900].includes(layer.fontWeight) || !['left', 'center', 'right'].includes(layer.textAlign))
        throw Error('Choose Inter weight 400, 600, 800 or 900 and a supported title alignment.');
      if (layer.svg !== undefined || layer.height !== undefined) throw Error('Text layers use copy and title sizing; artwork uses SVG and height.');
      return { ...layer };
    }
    if (layer.type !== 'artwork' || typeof layer.svg !== 'string' || layer.svg.length > 512 * 1024)
      throw Error('Artwork must contain a bounded inline SVG.');
    if (['text', 'color', 'fontWeight', 'textAlign', 'strokeWidth', 'strokeColor'].some(field => layer[field] !== undefined))
      throw Error('Artwork styling belongs in its SVG, not in title fields.');
    number(layer.height, 1, 100, 'Artwork height');
    artworkBytes += layer.svg.length;
    return { ...layer, svg: sanitizeLogoSvg(layer.svg) };
  });
  const cleanGroups = input.groups.map(group => {
    only(group, ['id', 'name', 'layerIds', 'startTime', 'duration', 'mask', 'keys'], 'group'); identity(group, GROUP_BOUNDS);
    if (group.mask !== undefined) validateStudioGroupComposite({ mask: group.mask });
    if (!Array.isArray(group.layerIds) || !group.layerIds.length) throw Error('Groups need ordinary layer members.');
    for (const id of group.layerIds) {
      if (!input.layers.some(layer => layer.id === id) || members.has(id)) throw Error('Each group member must be a unique ordinary layer.');
      const layer = input.layers.find(layer => layer.id === id);
      if (layer.startTime < group.startTime || layer.startTime + layer.duration > group.startTime + group.duration + 1 / 90000)
        throw Error('Group timing must contain its children.');
      members.add(id);
    }
    return { ...group };
  });
  if (count > 8192 || artworkBytes > 2 * 1024 * 1024) throw Error('This composition exceeds the graphics import budget.');
  return { ...input, layers: cleanLayers, groups: cleanGroups };
}

export async function rasterizeStudioArtwork(svg, name) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(Error('Artwork could not be decoded.')); image.src = url;
    });
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Artwork could not be rasterized.')), 'image/png'));
    return new File([blob], `${name}.png`, { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}

export async function buildStudioGraphicsPackage({ input, overlays, keyframes, compounds, order, duration, aspect, createId,
  rasterize = rasterizeStudioArtwork, createUrl = file => URL.createObjectURL(file), revokeUrl = url => URL.revokeObjectURL(url) }) {
  const spec = validateStudioGraphicsPackage(input, { duration, aspect, existingLayers: overlays.length });
  const ids = new Map([...spec.layers, ...spec.groups].map(item => [item.id, createId('graphic')]));
  const urls = [], layers = [], keys = [];
  const addKeys = item => (item.keys || []).forEach(key => keys.push({ ...key, time: tick(key.time), id: createId('graphic-key'), targetId: ids.get(item.id) }));
  try {
    for (const layer of spec.layers) {
      const { keys: _keys, svg: _svg, ...base } = layer;
      const ordinary = { ...base, id: ids.get(layer.id), type: 'text', anchorX: 50, anchorY: 50,
        bg: 'transparent', shadow: 'none', strokeWidth: layer.strokeWidth || 0, fontFamily: 'Inter', motionDesign: true,
        animation: { enter: 'none', exit: 'none', enterDuration: 0, exitDuration: 0 } };
      if (layer.type === 'artwork') {
        const file = await rasterize(layer.svg, layer.name), src = createUrl(file); urls.push(src);
        Object.assign(ordinary, { type: 'image', file, src, isLocal: true, bRollMode: 'pip', mediaFit: 'contain',
          frameShape: 'edge', borderRadius: 0, glow: { enabled: false }, layerShadow: { enabled: false }, motionBlur: { enabled: false } });
      }
      layers.push(ordinary); addKeys(layer);
    }
    const groups = spec.groups.map(group => {
      addKeys(group);
      return { id: ids.get(group.id), name: group.name, kind: GROUP_KIND, transform: { ...GROUP_TRANSFORM },
        ...(group.mask ? { mask: JSON.parse(JSON.stringify(group.mask)) } : {}),
        layerIds: group.layerIds.map(id => ids.get(id)), timing: { startTime: group.startTime, duration: group.duration } };
    });
    const next = { overlays: [...overlays, ...layers], keyframes: [...keyframes, ...keys],
      compounds: [...compounds, ...groups], order: [...order, ...layers.map(layer => layer.id)] };
    studioGroupTree(next.compounds, next.order);
    validateStudioGroupKeyframes(next.compounds, next.keyframes);
    return { ...next, layers, groups, keys, urls, name: spec.name };
  } catch (error) { urls.forEach(url => revokeUrl(url)); throw error; }
}
