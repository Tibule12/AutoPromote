import { normalizeBeatMarkers, findNearestBeat } from './studioBeatEngine';
import { SOUND_EFFECT_PRESETS } from './motion/soundDesign';

// Versioned authoring recipes. A frame is always ordinary footage, artwork,
// typography, keys and sound cues in the existing editable Studio document.
export const STUDIO_FRAME_STYLES = Object.freeze([
  { id: 'museum', version: 1, name: 'Museum', family: 'Editorial', description: 'An ivory gallery mat, generous margins and an understated caption.', background: '#e9e4da', frame: '#ffffff', accent: '#171e27', tone: 'paper_snap', panels: [[50, 43, 84, 66, 0, 'rectangle']], tag: 'A STUDY IN MOTION' },
  { id: 'nocturne', version: 1, name: 'Nocturne', family: 'Light', description: 'A luminous double border floating on midnight blue.', background: '#080d20', frame: '#2b235c', accent: '#63e8ef', tone: 'prism_sweep', panels: [[50, 48, 78, 75, 0, 'rectangle']], tag: 'AFTER HOURS' },
  { id: 'contact_35', version: 1, name: 'Contact 35', family: 'Film', description: 'Six moving exposures, numbered like a contact sheet.', background: '#171816', frame: '#34362f', accent: '#f1de9e', tone: 'shutter_tick', panels: [[20, 31, 27, 33, 0, 'rectangle'], [50, 31, 27, 33, 0, 'rectangle'], [80, 31, 27, 33, 0, 'rectangle'], [20, 70, 27, 33, 0, 'rectangle'], [50, 70, 27, 33, 0, 'rectangle'], [80, 70, 27, 33, 0, 'rectangle']], tag: 'CONTACT / 035' },
  { id: 'stereo', version: 1, name: 'Stereo', family: 'Split', description: 'Two clean parallel windows with a precise central divider.', background: '#ebe7dc', frame: '#fffdf5', accent: '#ff573e', tone: 'velvet_hit', panels: [[27, 48, 41, 75, 0, 'rectangle'], [73, 48, 41, 75, 0, 'rectangle']], tag: 'TWO SIDES / ONE STORY' },
  { id: 'oval_triptych', version: 1, name: 'Oval Triptych', family: 'Sculptural', description: 'Three elongated apertures set into a sculptural colour field.', background: '#23382f', frame: '#b8c7a1', accent: '#e6edc7', tone: 'orbit_rise', panels: [[20, 48, 25, 70, 0, 'ellipse'], [50, 48, 25, 70, 0, 'ellipse'], [80, 48, 25, 70, 0, 'ellipse']], tag: 'THREE MOMENTS' },
  { id: 'depth_stack', version: 1, name: 'Depth Stack', family: 'Collage', description: 'Offset picture cards with layered colour and a tilted hero.', background: '#ede1d0', frame: '#fff8ed', accent: '#a73843', tone: 'paper_snap', panels: [[45, 44, 69, 68, -7, 'rectangle'], [56, 47, 69, 68, 6, 'rectangle'], [50, 49, 69, 68, -2, 'rectangle']], tag: 'COLLECT THE MOMENTS' },
  { id: 'redline', version: 1, name: 'Redline', family: 'Editorial', description: 'An asymmetric image column and a decisive vermilion rail.', background: '#ecebe6', frame: '#ffffff', accent: '#ea352a', tone: 'velvet_hit', panels: [[39, 46, 62, 76, 0, 'rectangle']], tag: 'MAKE YOUR MARK' },
  { id: 'orbital', version: 1, name: 'Orbital', family: 'Sculptural', description: 'A large circular window and a smaller photographic satellite.', background: '#111a36', frame: '#344b71', accent: '#b7d6ff', tone: 'glass_flick', panels: [[45, 46, 70, 70, 0, 'ellipse'], [78, 72, 30, 30, 0, 'ellipse']], tag: 'IN YOUR ORBIT' },
  { id: 'cinemascope', version: 1, name: 'CinemaScope', family: 'Film', description: 'A widescreen aperture with restrained viewfinder marks.', background: '#101315', frame: '#282f33', accent: '#d1f784', tone: 'pulse_drop', panels: [[50, 49, 88, 53, 0, 'rectangle']], tag: 'SCENE / TAKE 01' },
  { id: 'hex_aperture', version: 1, name: 'Hex Aperture', family: 'Sculptural', description: 'A faceted window with nested geometric outlines.', background: '#2b1f42', frame: '#8d6fba', accent: '#e5c6ff', tone: 'reverse_spark', panels: [[50, 47, 82, 76, 0, 'hexagon']], tag: 'ANOTHER PERSPECTIVE' },
  { id: 'studio_collage', version: 1, name: 'Studio Collage', family: 'Collage', description: 'A hero frame, a second perspective and a small overlapping detail.', background: '#e7edf2', frame: '#ffffff', accent: '#225bd5', tone: 'prism_sweep', panels: [[36, 44, 56, 72, -2, 'rectangle'], [78, 35, 32, 45, 3, 'rectangle'], [73, 72, 39, 35, -5, 'rectangle']], tag: 'A DIFFERENT ANGLE' },
  { id: 'paper_cut', version: 1, name: 'Paper Cut', family: 'Collage', description: 'An irregular cut-paper aperture with layered backing sheets.', background: '#dbdeb8', frame: '#fffcef', accent: '#3f4f2e', tone: 'paper_snap', panels: [[50, 47, 81, 76, -3, 'paper']], tag: 'OUTSIDE THE LINES' },
]);

export function studioFrameBeatGrid({ mode = 'music', beats = [], bpm = 120, phase = 0, start = 0, end = 0 }) {
  if (mode === 'music') return normalizeBeatMarkers(beats).filter(b => b.time >= start && b.time < end);
  if (mode !== 'tempo' || !Number.isFinite(bpm) || bpm < 40 || bpm > 240 || !Number.isFinite(phase) || phase < 0 || phase > 86400)
    throw Error('Choose detected music beats or a tempo from 40–240 BPM and a valid grid origin.');
  const period = 60 / bpm, first = Math.max(0, Math.ceil((start - phase) / period));
  const markers = [];
  for (let index = first; phase + index * period < end && markers.length < 256; index++)
    markers.push({ time: Math.round((phase + index * period) * 90000) / 90000, strength: index % 4 ? .6 : 1, isDownbeat: index % 4 === 0 });
  return markers;
}

const polygon = points => ({ version: 1, closed: true,
  nodes: points.map(([x, y]) => ({ x, y, in: [0, 0], out: [0, 0] })),
  fill: { kind: 'solid', color: '#ffffff', endColor: '#ffffff', start: [0, 0], end: [100, 100] },
  stroke: { color: '#ffffff', width: 0 } });
const RECTANGLE = [[0, 0], [100, 0], [100, 100], [0, 100]];
const HEXAGON = [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]];
const PAPER = [[2, 4], [28, 1], [49, 3], [76, 0], [97, 4], [99, 31], [97, 57], [100, 81], [96, 98], [74, 96], [48, 100], [23, 97], [0, 99], [3, 73], [0, 49], [3, 25]];
const ellipse = () => {
  const k = 27.61424;
  return { ...polygon(RECTANGLE), nodes: [
    { x: 50, y: 0, in: [-k, 0], out: [k, 0] }, { x: 100, y: 50, in: [0, -k], out: [0, k] },
    { x: 50, y: 100, in: [k, 0], out: [-k, 0] }, { x: 0, y: 50, in: [0, k], out: [0, -k] },
  ] };
};

export function buildStudioFramePlan(snapshot, settings) {
  const doc = snapshot.studioDocument, style = STUDIO_FRAME_STYLES.find(s => s.id === settings.styleId);
  if (!doc?.projectId || !style) throw Error('Save a project and choose a frame style.');
  const number = (value, low, high, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw Error(`${label} must be between ${low} and ${high}.`);
    return value;
  };
  const total = (doc.outputTimeMap.at(-1)?.outputRange.endTick || 0) / 90000;
  const { sourceIds, sourceStarts, width, height, motion = 'drift', beatMode = 'music', beats = [],
    bpm = 120, phase = 0, snapStart = false, soundMode = 'entrance', soundVolume = .25 } = settings;
  let start = number(settings.startTime, 0, total, 'Frame start');
  const duration = number(settings.duration, .5, 12, 'Frame duration');
  number(width, 16, 4096, 'Programme width'); number(height, 16, 4096, 'Programme height');
  const amount = number(settings.motionAmount ?? .5, 0, 1, 'Motion amount');
  const border = number(settings.border ?? 1.2, .2, 4, 'Frame border');
  number(soundVolume, 0, 1, 'Sound volume');
  if (!['none', 'drift', 'beat'].includes(motion) || !['off', 'entrance', 'strong_beats'].includes(soundMode) || typeof snapStart !== 'boolean')
    throw Error('Choose supported motion, beat snapping and sound options.');
  const grid = studioFrameBeatGrid({ mode: beatMode, beats, bpm, phase, start: Math.max(0, start - .35), end: Math.min(total, start + duration + .35) });
  if ((snapStart || motion === 'beat' || soundMode === 'strong_beats') && !grid.length)
    throw Error('Add music and detect its beats, or choose an explicit tempo grid.');
  if (snapStart) start = findNearestBeat(start, grid, .35).time;
  if (start + duration > total + 1 / 90000) throw Error('Keep the complete frame inside the programme.');
  const tick = value => Math.round(value * 90000) / 90000, end = tick(start + duration);
  const colors = Object.fromEntries(['background', 'frame', 'accent'].map(key => {
    const value = settings[key] || style[key];
    if (!/^#[a-f\d]{6}$/i.test(value)) throw Error('Use six-digit frame colours.');
    return [key, value];
  }));
  if (!Array.isArray(sourceIds) || sourceIds.length < 1 || sourceIds.length > 3 || !Array.isArray(sourceStarts) || !sourceIds[0]) throw Error('Choose one to three saved video sources for this frame.');
  if (settings.caption !== undefined && (typeof settings.caption !== 'string' || settings.caption.length > 80 || /[<>\n\r]/.test(settings.caption)))
    throw Error('Use a readable caption of at most80 characters on one line.');
  const media = sourceIds.map((id, index) => {
    const asset = (snapshot.projectMedia || []).find(m => m.id === (id || sourceIds[0]) && m.status === 'ready' && m.storagePath && m.url &&
      ['', 'video'].includes(m.mediaType || m.type || '') && /^[a-f0-9]{64}$/.test(m.contentHash || ''));
    if (!asset) throw Error('Choose available saved video sources.');
    const offset = number((id ? sourceStarts[index] : sourceStarts[0]) ?? sourceStarts[0] ?? 0, 0, 3600, 'Source start');
    const maxDelay = Math.max(0, ...style.panels.map((_, panel) => panel % sourceIds.length === index ? panel * .1 : 0));
    if (offset + duration + maxDelay > Number(asset.duration) + .001) throw Error('The selected source needs enough footage for the frame and its delayed views.');
    return { asset, offset };
  });
  const actions = [], layers = [], order = [];
  const art = (id, name, shape, x, y, w, h, rotation = 0, opacity = 1) => {
    const boxWidth = Math.max(1, w), boxHeight = Math.max(1, h);
    const fx = w / boxWidth, fy = h / boxHeight;
    const geometry = fx === 1 && fy === 1 ? shape : { ...shape, nodes: shape.nodes.map(n => ({
      ...n, x: 50 + (n.x - 50) * fx, y: 50 + (n.y - 50) * fy,
      in: [n.in[0] * fx, n.in[1] * fy], out: [n.out[0] * fx, n.out[1] * fy],
    })) };
    layers.push({ id, name, type: 'artwork', vectorShape: geometry, mediaFit: 'stretch', x, y, width: boxWidth, height: boxHeight, rotation, opacity, scale: 1,
      startTime: tick(start), duration: tick(duration), keys: [] });order.push(id);return id;
  };
  const shape = (kind, color) => {
    const result = kind === 'ellipse' ? ellipse() : polygon(kind === 'hexagon' ? HEXAGON : kind === 'paper' ? PAPER : RECTANGLE);
    return { ...result, fill: { ...result.fill, color, endColor: color }, stroke: { color, width: 0 } };
  };
  art('frame_background', `${style.name} · colour field`, shape('rectangle', colors.background), 50, 50, 100, 100);
  actions.push({ type: 'null', id: 'frame_rig', name: `${style.name} · motion rig`, startTime: tick(start), duration: tick(duration), transform: { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 } });
  const members = [];
  const physicalCircle = (w, h) => width > height ? [Math.min(w, h * height / width), h] : [w, Math.min(h, w * width / height)];
  style.panels.forEach(([x, y, givenWidth, givenHeight, rotation, kind], index) => {
    let w = givenWidth, h = givenHeight;
    if (style.id === 'orbital') [w, h] = physicalCircle(w, h);
    const plate = art(`frame_plate_${index}`, `${style.name} · border ${index + 1}`, shape(kind, colors.frame), x, y,
      Math.min(100, w + border * 2), Math.min(100, h + border * 2), rotation);
    const source = media[index % media.length], id = `frame_video_${index}`;
    const mask = { enabled: true, shape: kind === 'ellipse' ? 'ellipse' : ['hexagon', 'paper'].includes(kind) ? 'polygon' : 'rectangle',
      radius: 0, feather: 0, inverted: false,
      ...(['hexagon', 'paper'].includes(kind) ? { path: `polygon(${(kind === 'hexagon' ? HEXAGON : PAPER).map(p => p.join('% ') + '%').join(', ')})` } : {}) };
    actions.push({ type: 'media_plane', id, name: `${style.name} · footage ${index + 1}`, sourceMediaId: source.asset.id,
      sourceStart: tick(source.offset + index * .1), startTime: tick(start), duration: tick(duration), width: w, height: h,
      mediaFit: 'cover', mask, transform: { x, y, scale: 1, rotation, opacity: 1 } });
    order.push(id);members.push(plate, id);
  });
  // Small original graphic details give each family a distinct visual language.
  const rect = (id, x, y, w, h, color = colors.accent, rotation = 0) => {
    members.push(art(id, `${style.name} · graphic detail`, shape('rectangle', color), x, y, w, h, rotation));
  };
  if (style.id === 'nocturne') {
    rect('neon_top', 50, 8, 82, .5);rect('neon_bottom', 50, 88, 82, .5);
    rect('neon_side', 8, 48, .5, 80);rect('neon_side_b', 92, 48, .5, 80);
  } else if (style.id === 'redline') { rect('redline_rail', 78, 46, 1, 76);rect('redline_block', 88, 18, 12, 13); }
  else if (style.id === 'contact_35') {
    for (let i = 0; i < 6; i++) { rect(`sprocket_${i}`, 12 + i * 15, 6, 4, 2);rect(`sprocket_b_${i}`, 12 + i * 15, 94, 4, 2); }
  } else if (style.id === 'stereo') rect('stereo_rail', 50, 48, .5, 79);
  else if (style.id === 'cinemascope') {
    for (const x of [5, 95]) for (const y of [19, 79]) { rect(`bracket_h_${x}_${y}`, x, y, 5, .4);rect(`bracket_v_${x}_${y}`, x, y + (y < 50 ? 2 : -2), .4, 4); }
  } else if (style.id === 'paper_cut') { rect('paper_tab', 45, 8, 23, 3, colors.accent, -9); }
  else rect('frame_accent', 13, 90, 8, .6);
  const textId = 'frame_caption';
  actions.push({ type: 'title', id: textId, name: `${style.name} · editable caption`, text: settings.caption?.trim() || style.tag,
    startTime: tick(start), duration: tick(duration), width: 82, color: colors.accent, fontWeight: 600, textAlign: 'left',
    transform: { x: 50, y: style.id === 'contact_35' ? 10 : 92, scale: .65, rotation: 0, opacity: 1 } });
  order.push(textId);members.push(textId);
  for (const id of members) actions.push({ type: 'parent', targetId: id, parentId: 'frame_rig' });
  const key = (property, time, value, easing = 'linear') => ({ property, time: tick(time), value, easing,
    ...(easing === 'bezier' ? { curve: [.2, .8, .3, 1] } : {}) });
  if (motion === 'drift') actions.push({ type: 'keys', targetId: 'frame_rig', keys: [key('scale', start, 1), key('scale', end, 1 + .025 * amount, 'bezier')] });
  if (motion === 'beat') {
    const keys = [key('scale', start, 1)];
    const points = grid.filter(b => b.time > start + .08 && b.time < end - .12);
    let last = start;
    for (const beat of points) {
      if (beat.time - last < .15) continue;
      keys.push(key('scale', beat.time, 1 + .026 * amount * (beat.isDownbeat ? 1 : .6)), key('scale', Math.min(end, beat.time + .12), 1, 'bezier'));
      last = beat.time + .12;
    }
    if (keys.at(-1).time < tick(end)) keys.push(key('scale', end, 1));
    actions.push({ type: 'keys', targetId: 'frame_rig', keys });
  }
  const sound = SOUND_EFFECT_PRESETS.find(s => s.tone === (settings.tone || style.tone));
  if (soundMode !== 'off' && !sound) throw Error('Choose an original Studio sound effect.');
  const cueTimes = soundMode === 'entrance' ? [start] : soundMode === 'strong_beats'
    ? grid.filter(b => b.isDownbeat && b.time >= start && b.time < end - .05).map(b => b.time) : [];
  cueTimes.slice(0, 24).forEach((time, index) => actions.push({ type: 'sound_cue', id: `frame_sound_${index}`, name: `${style.name} · ${sound.name}`,
    tone: sound.tone, startTime: tick(time), duration: tick(Math.min(sound.duration, end - time)), volume: soundVolume,
    fadeIn: .008, fadeOut: Math.min(.12, (end - time) / 3) }));
  // Artwork already has its authored order. Insert each footage window directly
  // after its own border, keeping dense contact sheets within the action budget.
  style.panels.forEach((_, index) => {
    const id = `frame_video_${index}`, at = order.indexOf(id);
    actions.push({ type: 'move_layer', targetId: id, beforeId: order[at + 1] });
  });
  if (actions.length > 64) throw Error('This frame exceeds the scene action budget; reduce its sound cues.');
  return { format: 'autopromote-scene-actions', version: 1, projectId: doc.projectId, baseRevision: doc.revision,
    name: `${style.name} frame · v${style.version}`, actions,
    graphics: { format: 'autopromote-graphics', version: 1, name: `${style.name} frame artwork`, width, height, duration: total, layers, groups: [] } };
}
