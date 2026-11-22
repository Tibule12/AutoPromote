// A reusable authoring operation. The ordinary layer/mask/keyframe engine owns
// all playback, history, persistence and final rendering.
export const STRIP_TRANSITION_LAYOUTS = [
  { id: 'fashion_mosaic', label: 'Fashion mosaic' },
  { id: 'vertical', label: 'Vertical strips' },
  { id: 'horizontal', label: 'Horizontal bands' },
];

export function stripTransitionRegions(layout, count) {
  if (layout === 'fashion_mosaic') return [
    [25, 33, 75, 67], [0, 0, 25, 100], [75, 0, 100, 100],
    [25, 0, 75, 33], [25, 67, 75, 100],
  ];
  if (!['vertical', 'horizontal'].includes(layout) || !Number.isInteger(count) || count < 3 || count > 6)
    throw Error('Choose a supported strip layout and 3–6 pieces.');
  return Array.from({ length: count }, (_, i) => layout === 'vertical'
    ? [i * 100 / count, 0, (i + 1) * 100 / count, 100]
    : [0, i * 100 / count, 100, (i + 1) * 100 / count]);
}

export function buildStudioStripTransitionPlan(snapshot, settings) {
  const doc = snapshot.studioDocument;
  if (!doc?.projectId) throw Error('Save a video project before adding a strip transition.');
  const number = (value, low, high, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
      throw Error(`${label} must be between ${low} and ${high}.`);
    return value;
  };
  const { outgoingId, incomingId, outgoingStart, incomingStart, startTime,
    openingHold, transitionDuration, incomingHold, stagger, direction, layout, count } = settings;
  const media = id => (snapshot.projectMedia || []).find(m => m.id === id && m.status === 'ready' &&
    ['', 'video'].includes(m.mediaType || m.type || '') && m.url && m.storagePath && /^[a-f0-9]{64}$/.test(m.contentHash || ''));
  const outgoing = media(outgoingId), incoming = media(incomingId);
  if (!outgoing || !incoming) throw Error('Choose two available saved video sources.');
  number(startTime, 0, 86400, 'Programme start');
  number(outgoingStart, 0, 3600, 'Outgoing source start');
  number(incomingStart, 0, 3600, 'Incoming source start');
  number(openingHold, 0, 8, 'Opening hold');
  number(transitionDuration, .3, 4, 'Transition duration');
  number(incomingHold, .1, 8, 'Incoming hold');
  number(stagger, 0, .3, 'Piece stagger');
  if (!['alternating', 'left', 'right', 'up', 'down'].includes(direction))
    throw Error('Choose a supported travel direction.');
  if (!STRIP_TRANSITION_LAYOUTS.some(l => l.id === layout)) throw Error('Choose a supported strip layout.');
  const regions = stripTransitionRegions(layout, count);
  const movingDuration = transitionDuration - stagger * (regions.length - 1);
  if (movingDuration < .15) throw Error('Reduce piece stagger or lengthen the transition so every piece can finish moving.');
  const total = (doc.outputTimeMap.at(-1)?.outputRange.endTick || 0) / 90000;
  const duration = openingHold + transitionDuration + incomingHold;
  if (startTime + duration > total + 1 / 90000) throw Error('Keep the opening, transition and incoming hold inside the programme.');
  if (outgoingStart + openingHold + transitionDuration > Number(outgoing.duration) + .001 ||
      incomingStart + transitionDuration + incomingHold > Number(incoming.duration) + .001)
    throw Error('Choose source ranges long enough for the complete transition and holds.');
  const tick = value => Math.round(value * 90000) / 90000;
  const transitionStart = tick(startTime + openingHold), settled = tick(transitionStart + transitionDuration);
  const fullMask = { enabled: true, shape: 'rectangle', radius: 0, feather: 0, inverted: false };
  const plane = (id, name, source, sourceStart, start, length, mask = fullMask) => ({
    type: 'media_plane', id, name, sourceMediaId: source.id, sourceStart: tick(sourceStart),
    startTime: tick(start), duration: tick(length), mediaFit: 'cover', mask,
    transform: { x: 50, y: 50, scale: 100 / 70, rotation: 0, opacity: 1 },
  });
  const actions = [plane('strip_outgoing', 'Strip transition · outgoing shot', outgoing,
    outgoingStart, startTime, openingHold + transitionDuration)];
  const vectors = { left: [-110, 0], right: [110, 0], up: [0, -110], down: [0, 110] };
  const mosaicDirections = ['left', 'down', 'up', 'right', 'left'];
  const key = (property, time, value, easing = 'linear') => ({
    property, time: tick(time), value, easing,
    ...(easing === 'bezier' ? { curve: [.22, 1, .36, 1] } : {}),
  });
  regions.forEach(([x0, y0, x1, y1], index) => {
    const id = `strip_incoming_${index + 1}`, path = `polygon(${x0}% ${y0}%, ${x1}% ${y0}%, ${x1}% ${y1}%, ${x0}% ${y1}%)`;
    actions.push(plane(id, `Strip transition · incoming piece ${index + 1}`, incoming,
      incomingStart, transitionStart, transitionDuration, { ...fullMask, shape: 'polygon', path }));
    const selectedDirection = direction === 'alternating'
      ? layout === 'fashion_mosaic' ? mosaicDirections[index]
        : layout === 'vertical' ? index % 2 ? 'down' : 'up' : index % 2 ? 'right' : 'left'
      : direction;
    const [dx, dy] = vectors[selectedDirection], begin = transitionStart + index * stagger;
    const finish = begin + movingDuration;
    const keys = ['x', 'y'].flatMap((property, axis) => {
      const from = 50 + (axis ? dy : dx);
      return [key(property, transitionStart, from),
        ...(index * stagger > 1 / 90000 ? [key(property, begin, from)] : []),
        key(property, finish, 50, 'bezier'),
        ...(settled - finish > 1 / 90000 ? [key(property, settled, 50)] : [])];
    });
    actions.push({ type: 'keys', targetId: id, keys });
  });
  // The last moving frame and this full shot use the same incoming source clock.
  // A full-frame hold avoids retaining a reconstructed mask seam after the reveal.
  actions.push(plane('strip_incoming_full', 'Strip transition · resolved incoming shot', incoming,
    incomingStart + transitionDuration, settled, incomingHold));
  return { format: 'autopromote-scene-actions', version: 1, projectId: doc.projectId,
    baseRevision: doc.revision, name: `Strip transition · ${STRIP_TRANSITION_LAYOUTS.find(l => l.id === layout).label} v1`, actions };
}
