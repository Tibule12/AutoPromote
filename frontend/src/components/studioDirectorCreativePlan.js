// Model choices become the existing scene actions. This module authors ordinary
// layers/keys; it does not draw frames or introduce another render path.
import { compileDirectorComposition } from './studioDirectorComposition';

const treatments = ['full_frame', 'time_weave', 'orbit_cards', 'radial_reveal'];
const validNumber = (v, min, max) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const only = (v, fields) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).every(k => fields.includes(k));
const polygon = points => ({
  enabled: true,
  shape: 'polygon',
  path: `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(',')})`,
  feather: 0,
  inverted: false,
});
const key = (property, time, value, easing = 'ease_out') => ({
  property,
  time,
  value,
  easing,
});

export function directorCreativeContext(snapshot, brief, duration) {
  const document = snapshot.studioDocument;
  const seconds = (document?.outputTimeMap?.at(-1)?.outputRange.endTick || 0) / 90000;
  if (!document || !validNumber(duration, 2, Math.min(30, seconds))) {
    throw Error('Choose 2–30 seconds within this project.');
  }
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 1200) {
    throw Error('Describe the edit in at most 1,200 characters.');
  }
  const media = (snapshot.projectMedia || [])
    .filter(
      m =>
        m.status === 'ready' &&
        m.storagePath &&
        m.url &&
        m.duration >= 0.5 &&
        /^[a-f0-9]{64}$/.test(m.contentHash || '') &&
        m.type !== 'image' &&
        !/\b(?:matte|alpha|mask)\b/i.test(m.name || '')
    )
    .slice(0, 12)
    .map(m => ({
      id: m.id,
      name: String(m.name || 'Project clip').slice(0, 160),
      duration: Number(m.duration),
      contentHash: m.contentHash,
    }));
  if (!media.length) {
    throw Error('Save at least one project video before asking the Director.');
  }
  return {
    brief: brief.trim(),
    projectId: document.projectId,
    baseRevision: document.revision,
    duration,
    media,
  };
}

export function compileDirectorCreativePlan(result, snapshot) {
  if (result.version === 2) return compileDirectorComposition(result, snapshot);
  const context = directorCreativeContext(snapshot, result.brief, result.duration);
  if (
    result.version !== 1 ||
    result.projectId !== context.projectId ||
    result.baseRevision !== context.baseRevision ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint || '') ||
    result.provenance?.automaticModelPlanning !== true
  ) {
    throw Error('The project changed or the Director proposal is invalid. Ask for a new plan.');
  }
  if (
    !Array.isArray(result.sourceEvidence) ||
    result.sourceEvidence.length !== context.media.length ||
    new Set(result.sourceEvidence.map(e => e.id)).size !== context.media.length ||
    result.sourceEvidence.some(
      e => !context.media.some(m => m.id === e.id && m.contentHash === e.contentHash)
    )
  ) {
    throw Error('The project footage changed after the Director planned this edit.');
  }
  const board = result.storyboard;
  if (
    !only(board, ['name', 'shots']) ||
    typeof board.name !== 'string' ||
    !board.name.trim() ||
    board.name.length > 100 ||
    !Array.isArray(board.shots) ||
    board.shots.length < 1 ||
    board.shots.length > 4
  ) {
    throw Error('The Director storyboard is invalid.');
  }
  const actions = [];
  const report = [];
  let at = 0;
  for (const [shotIndex, shot] of board.shots.entries()) {
    const media = context.media.find(m => m.id === shot.sourceMediaId);
    if (
      !only(shot, ['sourceMediaId', 'sourceStart', 'duration', 'treatment', 'reason']) ||
      !media ||
      !treatments.includes(shot.treatment) ||
      !validNumber(shot.sourceStart, 0, media.duration) ||
      !validNumber(shot.duration, 0.5, context.duration) ||
      shot.sourceStart + shot.duration > media.duration + 0.001 ||
      typeof shot.reason !== 'string' ||
      shot.reason.length > 240
    ) {
      throw Error('The Director chose unavailable footage, timing or motion.');
    }
    const begin = Math.round(at * 90000) / 90000;
    const end = Math.round((at + shot.duration) * 90000) / 90000;
    const enter = Math.min(0.6, shot.duration / 3);
    const leave = Math.min(0.3, shot.duration / 5);
    const add = (index, mask, pose, sourceOffset = 0, motion = []) => {
      const id = `director-${shotIndex}-${index}`;
      const sourceStart =
        shot.sourceStart +
        Math.min(sourceOffset, Math.max(0, media.duration - shot.sourceStart - shot.duration));
      actions.push({
        type: 'media_plane',
        id,
        name: `${shotIndex + 1} · ${shot.treatment.replace(/_/g, ' ')} ${index + 1}`,
        sourceMediaId: media.id,
        sourceStart,
        startTime: begin,
        duration: end - begin,
        transform: pose,
        ...(mask ? { mask } : {}),
      });
      actions.push({
        type: 'keys',
        targetId: id,
        keys: [
          key('opacity', begin, 0, 'linear'),
          key('opacity', begin + enter, 1),
          key('opacity', end - leave, 1, 'linear'),
          key('opacity', end, 0, 'linear'),
          ...motion,
        ],
      });
    };
    if (shot.treatment === 'time_weave') {
      for (let i = 0; i < 6; i++) {
        const x0 = (i * 100) / 6;
        const x1 = ((i + 1) * 100) / 6;
        add(
          i,
          polygon([
            [x0, 0],
            [x1, 0],
            [x1, 100],
            [x0, 100],
          ]),
          { x: 50, y: 50, scale: 10 / 7, opacity: 1 },
          i * 0.08,
          [
            key('y', begin, 50 + (i % 2 ? 18 : -18)),
            key('y', begin + enter, 50),
            key('scale', begin, 1.6),
            key('scale', end, 10 / 7),
          ]
        );
      }
    } else if (shot.treatment === 'radial_reveal') {
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const point = a => [50 + 75 * Math.cos(a), 50 + 75 * Math.sin(a)];
        const clamp = ([x, y]) => [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
        add(
          i,
          polygon([[50, 50], clamp(point(angle)), clamp(point(angle + Math.PI / 4))]),
          { x: 50, y: 50, scale: 10 / 7, rotation: 0, opacity: 1 },
          i * 0.06,
          [
            key('rotation', begin, (i % 2 ? 1 : -1) * 24),
            key('rotation', begin + enter, 0),
            key('scale', begin, 0.9),
            key('scale', begin + enter, 10 / 7),
          ]
        );
      }
    } else if (shot.treatment === 'orbit_cards') {
      for (let i = 0; i < 2; i++) {
        const x = i ? 73 : 27;
        const rotation = i ? 6 : -6;
        add(
          i,
          null,
          { x, y: 50, scale: 0.64, rotation, opacity: 1 },
          i * 0.15,
          [
            key('x', begin, i ? 115 : -15),
            key('x', begin + enter, x),
            key('rotation', begin, i ? 24 : -24),
            key('rotation', end, rotation),
            key('y', begin, 50 + (i ? 8 : -8)),
            key('y', end, 50 + (i ? -4 : 4)),
          ]
        );
      }
    } else {
      add(
        0,
        polygon([
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ]),
        { x: 50, y: 50, scale: 10 / 7, opacity: 1 },
        0,
        [key('scale', begin, 1.5), key('scale', end, 10 / 7)]
      );
    }
    report.push({
      startTime: begin,
      endTime: end,
      sourceName: media.name,
      treatment: shot.treatment,
      reason: shot.reason,
    });
    at = end;
  }
  if (Math.abs(at - context.duration) > 1 / 90000) {
    throw Error('The Director storyboard does not cover the requested duration.');
  }
  const graphics = {
    format: 'autopromote-graphics',
    version: 1,
    name: 'Director stage',
    width: 1280,
    height: 720,
    duration: context.duration,
    layers: [
      {
        id: 'director-stage',
        name: 'Director · midnight stage',
        type: 'artwork',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#0b0c13"/></svg>',
        startTime: 0,
        duration: context.duration,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        scale: 1,
        rotation: 0,
        opacity: 1,
        keys: [],
      },
    ],
    groups: [],
  };
  return {
    plan: {
      format: 'autopromote-scene-actions',
      version: 1,
      projectId: context.projectId,
      baseRevision: context.baseRevision,
      name: board.name,
      actions,
      graphics,
    },
    shots: report,
  };
}
