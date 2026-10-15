// Kinetic type is an authoring operation over ordinary title layers, groups and
// motion keys. Preview, history and export keep using the existing graph.
import { studioGroupTree, GROUP_KIND, GROUP_TRANSFORM } from './studioGroups';

const tick = value => Math.round(value * 90000) / 90000;
const finite = (value, low, high, label) => {
  if (!Number.isFinite(value) || value < low || value > high) throw Error(`${label} must be between ${low} and ${high}.`);
  return value;
};

export function buildStudioKineticType({ source, overlays, keyframes, compounds, order, width, height,
  measure, createId, unit = 'word', style = 'rise', direction = 'forward', stagger = .12,
  entry = .5, travel = 8, tilt = 12, exit = .25, fps = 24, playbackRate = 1 }) {
  if (!source || source.type !== 'text' || source.isCaption || source.bRollMode || source.isRainbow || source.bRollPlaceholder)
    throw Error('Select an ordinary title for kinetic type.');
  if ((source.fontFamily || 'Inter') !== 'Inter') throw Error('Choose Inter before separating the title.');
  if (source.bg && source.bg !== 'transparent') throw Error('Choose No background before separating the title.');
  if (source.mask?.enabled || source.tracking?.enabled || (source.blendMode && source.blendMode !== 'normal'))
    throw Error('Separate a title without a mask, tracking or blend effect. Apply shared effects to its new group.');
  if (keyframes.some(key => key.targetId === source.id))
    throw Error('This title already has motion keys. Duplicate it and reset its transform before separating it.');
  if (!['word', 'letter'].includes(unit) || !['rise', 'pop', 'spin'].includes(style) || !['forward', 'reverse', 'center'].includes(direction))
    throw Error('Choose a supported text unit, movement and order.');
  finite(stagger, 0, 1, 'Stagger'); finite(entry, .1, 3, 'Entrance'); finite(travel, 0, 30, 'Travel');
  finite(tilt, 0, 90, 'Rotation'); finite(exit, .1, 3, 'Exit');
  finite(width, 1, 16384, 'Programme width'); finite(height, 1, 16384, 'Programme height');
  finite(fps, 1, 120, 'Frame rate'); finite(playbackRate, .01, 10, 'Playback speed');
  const start = finite(Number(source.startTime ?? 0), 0, 86400, 'Title start');
  const duration = finite(Number(source.duration), .2, 3600, 'Title duration');
  const scale = finite(Number(source.scale ?? 1), .1, 5, 'Title scale');
  const rotation = finite(Number(source.rotation ?? 0), -270, 270, 'Title rotation');
  const opacity = finite(Number(source.opacity ?? 1), 0, 1, 'Title opacity');
  const layoutWidth = 720 * width / height, maxWidth = layoutWidth * Math.max(.15, Math.min(.9, Number(source.width || 90) / 100));
  const maximum = maxWidth - 32, lineHeight = 50.4;
  // The same 36px Inter / 8px 16px layout used by ordinary native titles.
  const lines = [];
  for (const paragraph of String(source.text || '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line + (line ? ' ' : '') + word;
      if (line && measure(candidate) > maximum) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  const boxWidth = Math.min(maxWidth, Math.max(1, ...lines.map(measure)) + 32), boxHeight = lines.length * lineHeight + 16;
  const fragments = [];
  for (let row = 0; row < lines.length; row += 1) {
    const line = lines[row], lineWidth = measure(line);
    const left = source.textAlign === 'left' ? 16 : source.textAlign === 'right' ? boxWidth - 16 - lineWidth : (boxWidth - lineWidth) / 2;
    // Unicode code points are retained as text. Combining sequences are one unit.
    const runs = unit === 'word' ? [...line.matchAll(/\S+/gu)].map(m => ({ text: m[0], index: m.index }))
      : [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line)]
        .filter(part => /\S/u.test(part.segment)).map(part => ({ text: part.segment, index: part.index }));
    for (const run of runs) {
      const tokenWidth = measure(run.text);
      if (!Number.isFinite(tokenWidth) || tokenWidth <= 0 || tokenWidth > maximum) throw Error('A text unit is too wide. Widen the title box or separate by letter.');
      fragments.push({ text: run.text, x: left + measure(line.slice(0, run.index)) + tokenWidth / 2,
        y: 8 + (row + .5) * lineHeight });
    }
  }
  if (!fragments.length) throw Error('Enter some words first.');
  if (fragments.length > 48) throw Error('Animate at most 48 words or letters at a time.');
  if (overlays.length - 1 + fragments.length > 128) throw Error('This edit would exceed 128 graphic layers.');
  const frame = playbackRate / fps, lastTime = tick(start + duration - frame);
  if ((fragments.length - 1) * stagger + entry + exit + frame * 2 > duration)
    throw Error('The stagger and entrances need more time. Increase title duration or reduce stagger.');
  const groupId = createId('type-group'), keys = [], layers = [], radians = rotation * Math.PI / 180;
  const sequence = fragments.map((_, index) => index);
  if (direction === 'reverse') sequence.reverse();
  if (direction === 'center') sequence.sort((a, b) => Math.abs(a - (fragments.length - 1) / 2) - Math.abs(b - (fragments.length - 1) / 2) || a - b);
  const rank = new Map(sequence.map((index, position) => [index, position]));
  fragments.forEach((part, index) => {
    const id = createId('type'), dx = (part.x - boxWidth * Number(source.anchorX ?? 50) / 100) * scale;
    const dy = (part.y - boxHeight * Number(source.anchorY ?? 50) / 100) * scale;
    const x = Number(source.x ?? 50) + (dx * Math.cos(radians) - dy * Math.sin(radians)) / layoutWidth * 100;
    const y = Number(source.y ?? 50) + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 720 * 100;
    const yIn = y + (style === 'pop' ? 0 : travel), yOut = y - (style === 'pop' ? 0 : travel / 2);
    for (const value of [x, y, yIn, yOut]) finite(value, 0, 100, 'Text position (move the title away from the edge)');
    const begin = tick(start + rank.get(index) * stagger), arrive = tick(begin + entry);
    const leave = tick(lastTime - exit);
    layers.push({ ...source, id, name: `${part.text} · ${index + 1}`, text: part.text,
      x, y, anchorX: 50, anchorY: 50, rotation, scale, opacity, width: source.width || 90,
      startTime: begin, duration: tick(start + duration - begin), textAlign: 'center',
      animation: { enter: 'none', exit: 'none', enterDuration: .3, exitDuration: .3 } });
    const add = (property, times, values, overshoot = false) => times.forEach((time, point) => keys.push({
      id: createId('type-key'), targetId: id, property, time, value: values[point],
      easing: point === 2 ? 'hold' : point === 1 && overshoot ? 'bezier' : 'ease_out',
      ...(point === 1 && overshoot ? { curve: [.16, 1.35, .3, 1] } : {}),
    }));
    const times = [begin, arrive, leave, lastTime];
    add('opacity', times, [0, opacity, opacity, 0]);
    add('y', times, [yIn, y, y, yOut]);
    add('scale', times, [Math.max(.1, scale * (style === 'rise' ? .85 : .4)), scale, scale, Math.max(.1, scale * .9)], style !== 'rise' && scale <= 4);
    const signedTilt = (index % 2 ? 1 : -1) * tilt;
    add('rotation', times, [rotation + (style === 'spin' ? signedTilt : 0), rotation, rotation,
      rotation + (style === 'spin' ? -signedTilt / 2 : 0)], style === 'spin');
  });
  const group = { id: groupId, name: `Type · ${String(source.text).replace(/\s+/g, ' ').slice(0, 50)}`,
    kind: GROUP_KIND, layerIds: layers.map(layer => layer.id), transform: { ...GROUP_TRANSFORM }, timing: { startTime: start, duration } };
  const nextCompounds = [...compounds.map(item => item.kind === GROUP_KIND
    ? { ...item, layerIds: item.layerIds.flatMap(id => id === source.id ? [groupId] : [id]) } : item), group];
  const nextOrder = order.flatMap(id => id === source.id ? layers.map(layer => layer.id) : [id]);
  studioGroupTree(nextCompounds, nextOrder);
  return { overlays: overlays.flatMap(layer => layer.id === source.id ? layers : [layer]),
    keyframes: [...keyframes, ...keys], compounds: nextCompounds, order: nextOrder, group, layers, keys };
}
