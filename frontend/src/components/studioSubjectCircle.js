// An editable circle arrangement over the existing layer/matte/key compiler.
// Supplied foreground and matte are required; this does not infer 3D viewpoints.
export function buildStudioSubjectCirclePlan(snapshot, settings) {
  const fail = message => { throw Error(message); };
  const number = (value, low, high, name) => {
    if (!Number.isFinite(value) || value < low || value > high) fail(`${name} must be between ${low} and ${high}.`);
    return value;
  };
  const doc = snapshot.studioDocument;
  if (!doc?.projectId) fail('Save the project before arranging a copy circle.');
  const total = doc.outputTimeMap.at(-1)?.outputRange.endTick / 90000;
  const { count, delay, opacity, sourceStart, matteStart, startTime, duration, width, height,
    circleX, circleY, radiusX, radiusY, anchorX, anchorY } = settings;
  number(count, 4, 8, 'Circle copies'); if (!Number.isInteger(count)) fail('Use a whole circle copy count.');
  number(delay, .04, .3, 'Delay'); number(opacity, .1, 1, 'Copy opacity');
  number(startTime, 0, total, 'Start'); number(duration, 3, 12, 'Duration');
  number(sourceStart, 0, 3600, 'Source start'); number(matteStart, 0, 3600, 'Matte start');
  number(width, 16, 4096, 'Width'); number(height, 16, 4096, 'Height');
  number(circleX, 35, 65, 'Circle X'); number(circleY, 50, 85, 'Circle Y');
  number(radiusX, 15, 40, 'Circle width'); number(radiusY, 3, 15, 'Circle depth');
  number(anchorX, 15, 85, 'Foot anchor X'); number(anchorY, 40, 88, 'Foot anchor Y');
  if (startTime + duration > total + 1 / 90000 || count * delay > duration - 1.5) fail('Keep the complete moving circle inside the programme.');
  const media = id => snapshot.projectMedia.find(item => item.id === id && item.status === 'ready' && item.url && item.storagePath && /^[a-f0-9]{64}$/.test(item.contentHash || ''));
  const source = media(settings.sourceMediaId), matte = media(settings.matteMediaId);
  if (!source || !matte || source.id === matte.id) fail('Choose saved foreground footage and its separate matching matte.');
  if (sourceStart + duration > source.duration + .001 || matteStart + duration > matte.duration + .001) fail('Footage and matte must cover the complete circle interval.');
  const tick = value => Math.round(value * 90000) / 90000;
  const end = startTime + duration, settle = end - .65, actions = [], layers = [];
  const key = (property, time, value, ease = false) => ({ property, time: tick(time), value,
    easing: ease ? 'bezier' : 'linear', ...(ease ? { curve: [.22, 1, .3, 1] } : {}) });
  const leadScale = Math.max(1.4, circleX / anchorX, (100 - circleX) / (100 - anchorX),
    circleY / anchorY, (100 - circleY) / (100 - anchorY)) + .025;
  if (leadScale > 1.65) fail('Move the circle closer to the source foot anchor to avoid excessive cropping.');
  const pose = (x, y, scale) => ({ x: x + (50 - anchorX) * scale, y: y + (50 - anchorY) * scale,
    scale: scale / .7, rotation: 0, opacity: 1 });
  const lead = pose(circleX, circleY, leadScale);
  actions.push({ type: 'keys', targetId: 'main-video', keys: ['x', 'y', 'scale'].flatMap(property => [
    key(property, startTime, property === 'scale' ? leadScale : lead[property]),
    key(property, end, property === 'scale' ? leadScale : lead[property]),
  ]).concat([key('opacity',startTime,.62),key('opacity',end,.62)]) });
  const palette = ['#20d9ff', '#4060ff', '#ac20ff', '#ec24ca', '#ff218d', '#ff4b28', '#ffb515', '#20bfff'];
  const ellipse = angle => ({ x: circleX + radiusX * Math.cos(angle), y: circleY + radiusY * Math.sin(angle) });
  // Leave the front centre open so the original's footwork remains legible.
  const angles = [...Array.from({ length: count - 2 }, (_, i) => -160 + i * 140 / (count - 3)), 25, 155]
    .map(angle => angle * Math.PI / 180);
  const copies = angles.map((angle, i) => ({ i, angle, point: ellipse(angle),
    scale: leadScale * (.61 + .23 * (Math.sin(angle) + 1) / 2) })).sort((a, b) => a.point.y - b.point.y);
  const fill = color => ({ kind: 'solid', color, endColor: color, start: [0, 0], end: [100, 100] });
  const art = (id, name, shape, alpha = 1) => ({ id, name, type: 'artwork', vectorShape: shape,
    startTime, duration, x: 50, y: 50, width: 100, height: 100, scale: 1, rotation: 0, opacity: alpha, keys: [] });
  for (let quarter = 0; quarter < 4; quarter++) {
    const a = quarter * Math.PI / 2, b = a + Math.PI / 2, one = ellipse(a), two = ellipse(b), k = .5522847498;
    // Vector artwork is a square source contained in the portrait stage.
    // Compensate its Y geometry, then centre that square at the floor plane.
    const aspect=width/height;
    const nodes = [{ x:one.x,y:50+(one.y-circleY)/aspect, in: [0, 0], out: [-Math.sin(a) * radiusX * k, Math.cos(a) * radiusY * k/aspect] },
      { x:two.x,y:50+(two.y-circleY)/aspect, in: [Math.sin(b) * radiusX * k, -Math.cos(b) * radiusY * k/aspect], out: [0, 0] }];
    const color = ['#ff9b16', '#ff27cc', '#23dfff', '#a52aff'][quarter];
    for (const core of [false, true]) {
      const id = `circle_ring_${quarter}_${core ? 'core' : 'halo'}`;
      const layer = art(id, `Copy circle / ${quarter + 1} ${core ? 'core' : 'halo'}`,
        { version: 1, closed: false, nodes, fill: { ...fill(color), kind: 'none' },
          stroke: { color: core ? '#fff1e1' : color, width: core ? .22 : 1.05 } }, 0);
      layer.y=circleY;
      layer.keys = [key('opacity', startTime, 0), key('opacity', startTime + .48, core ? .92 : .65),
        key('opacity', settle, core ? .92 : .65), key('opacity', end, 0)];
      layers.push(layer);
      actions.push({ type: 'keys', targetId: id, keys: [key('strokeEnd', startTime + .12 + quarter * .09, 0),
        key('strokeEnd', startTime + 1.05 + quarter * .09, 100, true)] });
      if (!core) actions.push({ type: 'layer_style', targetId: id, style: { glow: { enabled: true, color, radius: 16, intensity: .66 } } });
    }
  }
  const shadowSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64"><defs><radialGradient id="s"><stop offset="0" stop-color="#080b10" stop-opacity=".7"/><stop offset=".45" stop-color="#080b10" stop-opacity=".25"/><stop offset="1" stop-color="#080b10" stop-opacity="0"/></radialGradient></defs><ellipse cx="160" cy="32" rx="158" ry="30" fill="url(#s)"/></svg>';
  for (const copy of copies) {
    const a = startTime + .45 + copy.i * Math.max(.065, delay), target = pose(copy.point.x, copy.point.y, copy.scale);
    layers.push({ id: `circle_contact_${copy.i}`, name: `Copy circle / contact ${copy.i + 1}`, type: 'artwork', svg: shadowSvg,
      startTime: a, duration: end - a, x: copy.point.x, y: copy.point.y + .2, width: 12 * copy.scale,
      height: 1.6 * copy.scale, scale: 1, rotation: 0, opacity: 0, keys: [key('opacity', a, 0), key('opacity', a + .55, .38), key('opacity', settle, .38), key('opacity', end, 0)] });
    copy.at = a; copy.target = target;
  }
  const plane = (id, name, item, sourceAt, a, length, transform) => ({ type: 'media_plane', id, name,
    sourceMediaId: item.id, sourceStart: sourceAt, startTime: tick(a), duration: tick(length), transform,
    mask: { enabled: false, shape: 'rectangle', feather: 0, inverted: false } });
  const addSubject = copy => {
    const natural = copy === null, i = natural ? 'lead' : copy.i, a = natural ? startTime : copy.at,
      lag = natural ? 0 : (copy.i + 1) * delay, length = end - a,
      picture = `circle_picture_${i}`, mask = `circle_matte_${i}`, target = natural ? lead : copy.target;
    actions.push(plane(mask, natural ? 'Copy circle / original matte' : `Copy circle / matte ${copy.i + 1}`, matte, matteStart + a - startTime - lag, a, length, target),
      plane(picture, natural ? 'Copy circle / original foreground' : `Copy circle / moving double ${copy.i + 1}`, source, sourceStart + a - startTime - lag, a, length, target),
      { type: 'matte', targetId: picture, matteSourceId: mask, mode: 'luma' });
    if (!natural) {
      for (const id of [picture, mask]) actions.push({ type: 'keys', targetId: id, keys: ['x', 'y', 'scale'].flatMap(property => [
        key(property, a, lead[property]), key(property, a + .62, target[property], true), key(property, settle, target[property]),
        key(property, end, lead[property], true),
      ]).concat(id === picture ? [key('opacity', a, 0), key('opacity', a + .2, opacity), key('opacity', settle, opacity), key('opacity', end, 0)] : []) });
      actions.push({ type: 'layer_style', targetId: picture, style: { colorize: { enabled: true,
        color: palette[copy.i], strength: .95, gamma: .35, lift: .08 },
        glow:{enabled:true,color:palette[copy.i],radius:5,intensity:.12} } });
    }
  };
  copies.filter(copy => Math.sin(copy.angle) < 0).forEach(addSubject);
  addSubject(null);
  copies.filter(copy => Math.sin(copy.angle) >= 0).forEach(addSubject);
  if (actions.length > 64) fail('Circle exceeds the native action budget.');
  return { format: 'autopromote-scene-actions', version: 1, projectId: doc.projectId, baseRevision: doc.revision,
    name: 'Copy circle / depth-ordered moving subject sequence',
    graphics: { format: 'autopromote-graphics', version: 1, name: 'Copy circle / floor light and contacts', width, height, duration, layers, groups: [] }, actions };
}
