// An authoring recipe over ordinary video/matte/vector layers. Each delay is
// explicit source/programme timing; playback and export use the existing graph.
export function buildStudioSubjectEchoPlan(snapshot, settings) {
  const fail = message => { throw Error(message); };
  const number = (value, low, high, name) => {
    if (!Number.isFinite(value) || value < low || value > high) fail(`${name} must be between ${low} and ${high}.`);
    return value;
  };
  const doc = snapshot.studioDocument;
  if (!doc?.projectId) fail('Save a video project before adding subject echoes.');
  const total = doc.outputTimeMap.at(-1)?.outputRange.endTick / 90000;
  const { sourceMediaId, matteMediaId, mode, count, delay, opacity, spread, sourceStart,
    startTime, duration, width, height, trails, trailX, trailY, matteStart } = settings;
  const media = id => (snapshot.projectMedia || []).find(m => m.id === id && m.status === 'ready' &&
    m.storagePath && m.url && /^[a-f0-9]{64}$/.test(m.contentHash || '') && Number(m.duration) > 0);
  const source = media(sourceMediaId), matte = media(matteMediaId);
  if (!source || !matte || source.id === matte.id) fail('Choose saved footage and a separate matching white-subject / black-background matte video.');
  if (!['ghost', 'chroma', 'tinted'].includes(mode)) fail('Choose photographic or coloured echoes.');
  number(count, 2, 6, 'Echo count'); if (!Number.isInteger(count)) fail('Use a whole echo count.');
  number(delay, .04, .5, 'Delay'); number(opacity, .05, .8, 'Echo opacity'); number(spread, -12, 12, 'Spread');
  number(sourceStart, 0, 3600, 'Source start'); number(startTime, 0, total, 'Programme start');
  number(matteStart, 0, 3600, 'Matte start');
  number(duration, .5, 12, 'Duration'); number(width, 16, 4096, 'Width'); number(height, 16, 4096, 'Height');
  if (startTime + duration > total + 1 / 90000) fail('Keep the effect inside the programme.');
  if (sourceStart + duration > Number(source.duration) + .001 || matteStart + duration > Number(matte.duration) + .001)
    fail('Footage and matching matte must both cover the complete source range.');
  if (count * delay > duration - .1) fail('Reduce the echo count or delay so every copy has moving source footage.');
  if (typeof trails !== 'boolean') fail('Choose whether to add light arcs.');
  number(trailX, 10, 90, 'Light origin X'); number(trailY, 10, 90, 'Light origin Y');
  const actions = [], layers = [], order = [], end = startTime + duration;
  const tick = value => Math.round(value * 90000) / 90000;
  const key = (property, time, value) => ({ property, time: tick(time), value, easing: 'linear' });
  const fullMask = { enabled: true, shape: 'rectangle', feather: 0, inverted: false };
  const plane = (id, name, mediaId, start, length, x, mask) => ({ type: 'media_plane', id, name,
    sourceMediaId: mediaId, sourceStart: mediaId === matte.id ? matteStart : sourceStart, startTime: tick(start), duration: tick(length),
    transform: { x, y: 50, scale: 100 / 70, rotation: 0, opacity: 1 },
    // Direct video matte sources deliberately carry no effects or shadow.
    mask: mask ? fullMask : { ...fullMask, enabled: false } });
  const artwork = (id, name, a, length, shape, alpha = 1) => ({ id, name, type: 'artwork',
    vectorShape: shape, startTime: tick(a), duration: tick(length), x: 50, y: 50,
    width: 100, height: 100, scale: 1, rotation: 0, opacity: alpha, keys: [] });
  const fill = color => ({ kind: 'solid', color, endColor: color, start: [0, 0], end: [100, 100] });
  const palette = ['#ff962b', '#ff397b', '#c840ff', '#585bff', '#20bfff', '#1ce4d0'];
  if (trails) {
    for (let i = 0; i < 3; i++) {
      const x = trailX, y = trailY - i * 2;
      const nodes = [
        { x: Math.max(0, x - 36), y: Math.min(99, y + 10), in: [0, 0], out: [16, 1] },
        { x: Math.min(98, x + 12), y: Math.min(99, y + 3), in: [6, 7], out: [-12, -10] },
        { x: Math.max(1, x - 8), y: Math.max(1, y - 40), in: [1, 16], out: [0, 0] },
      ];
      for (const core of [false, true]) {
        const id = `light_${i}_${core ? 'core' : 'halo'}`, color = palette[i];
        const shape = { version: 1, closed: false, nodes,
          fill: { ...fill(color), kind: 'none' }, stroke: { color: core ? '#fff2da' : color, width: core ? .18 : .9 } };
        layers.push(artwork(id, `Light arc ${i + 1} / ${core ? 'core' : 'glow'}`, startTime, duration, shape, core ? .85 : .5));
        const span = duration - .1, a = startTime + i * .025;
        actions.push({ type: 'keys', targetId: id, keys: [key('strokeEnd', startTime, 0),
          key('strokeEnd', a + span * .55, 100), key('strokeEnd', end, 100),
          key('strokeStart', startTime, 0), key('strokeStart', a + span * .4, 0), key('strokeStart', end, 100)] });
        if (!core) actions.push({ type: 'layer_style', targetId: id,
          style: { blendMode: 'screen', glow: { enabled: true, color, radius: 12, intensity: .65 } } });
        order.push(id);
      }
    }
  }
  // Oldest first: the natural-colour lead occludes every earlier pose.
  for (let index = count; index >= 0; index--) {
    const lag = index * delay, a = tick(startTime + lag), length = tick(duration - lag), x = 50 + index * spread;
    const maskId = `echo_matte_${index}`, id = `echo_picture_${index}`;
    actions.push(plane(maskId, `Subject matte / delay ${lag.toFixed(2)}s`, matte.id, a, length, x, false));
    const alpha = index ? opacity * Math.pow(.76, index - 1) : 1;
    if (index && mode === 'chroma') {
      layers.push(artwork(id, `Colour echo ${index} / ${lag.toFixed(2)}s`, a, length,
        { version: 1, closed: true, nodes: [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => ({ x, y, in: [0, 0], out: [0, 0] })),
          fill: fill(palette[index - 1]), stroke: { color: palette[index - 1], width: 0 } }, alpha));
    } else {
      actions.push(plane(id, index ? `Photographic echo ${index} / ${lag.toFixed(2)}s` : 'Natural-colour lead subject', source.id, a, length, x, true));
      if (index && mode === 'tinted') actions.push({type:'layer_style',targetId:id,style:{colorize:{enabled:true,color:palette[index-1],strength:1,gamma:.65,lift:.045}}});
      if (index) actions.push({ type: 'keys', targetId: id, keys: [key('opacity', a, alpha)] });
    }
    actions.push({ type: 'matte', targetId: id, matteSourceId: maskId, mode: 'luma' });
    order.push(maskId, id);
  }
  for (let i = order.length - 2; i >= 0; i--)
    actions.push({ type: 'move_layer', targetId: order[i], beforeId: order[i + 1] });
  if (actions.length > 64) fail('Reduce the echoes or light arcs to fit the scene action budget.');
  const plan = { format: 'autopromote-scene-actions', version: 1, projectId: doc.projectId,
    baseRevision: doc.revision, name: 'Subject echoes and light arcs', actions };
  if (layers.length) plan.graphics = { format: 'autopromote-graphics', version: 1, name: plan.name,
    width, height, duration: total, layers, groups: [] };
  return plan;
}
