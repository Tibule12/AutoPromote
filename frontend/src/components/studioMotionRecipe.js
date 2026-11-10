import { studioVectorUri, validateStudioVectorShape } from './studioVectorShape';
import { compileStudioCompositionForRender } from './studioRenderCompiler';
import { adaptStudioSnapshotToDocument } from './studioProjectDocument';

// Registered, versioned looks instantiate ordinary layers, keys and groups.
// Inputs are rebound to this owner; no project URLs or private media live in a look.
export function bindStudioMotionRecipe(snapshot, recipe, bindings, projectId) {
  const spec = recipe.ordinaryMotion;
  if (!spec) return snapshot;
  if (spec.version !== 1 || !Array.isArray(spec.layers) || !spec.layers.length || spec.layers.length > 128 ||
      !Array.isArray(spec.keys) || spec.keys.length > 8192 || !Array.isArray(spec.groups) || spec.groups.length > 32)
    throw Error('Unsupported motion style definition.');
  const ids = new Map([...spec.layers, ...spec.groups].map(row => [row.id, `${projectId}:look:${row.id}`]));
  if (ids.size !== spec.layers.length + spec.groups.length || ids.has('main-video'))
    throw Error('Motion style identifiers must be unique.');
  const target = id => id === 'main-video' ? id : ids.get(id) || (() => { throw Error('Motion style target is missing.'); })();
  const duration = recipe.sequence.reduce((sum, shot) => sum + shot.duration, 0);
  const overlays = spec.layers.map(row => {
    const { sourceSlot, ...layer } = JSON.parse(JSON.stringify(row));
    if (['src', 'file', 'storagePath', 'sourceStoragePath', 'contentHash', 'sourceMediaId'].some(key => key in layer))
      throw Error('Motion style media must use an owned input slot.');
    const result = { ...layer, id: target(layer.id), ...(layer.parentId ? { parentId: target(layer.parentId) } : {}),
      ...(layer.trackMatte ? { trackMatte: { ...layer.trackMatte, sourceLayerId: target(layer.trackMatte.sourceLayerId) } } : {}) };
    if (!(layer.startTime >= 0) || !(layer.duration > 0) || layer.startTime + layer.duration > duration + 1 / 90000)
      throw Error('Motion style extends past the programme.');
    if (layer.type === 'video') {
      const asset = bindings[sourceSlot];
      const start = Number(layer.sourceStartTime || 0) + Number(asset?.trimStart || 0);
      if (!asset || (asset.mediaType || asset.type) !== 'video' || !Number.isFinite(start) || start < 0 ||
          start + layer.duration > asset.duration + 1 / 90000)
        throw Error(`${sourceSlot} is too short for this motion style.`);
      Object.assign(result, { src: asset.url, sourceMediaId: asset.id, sourceStoragePath: asset.storagePath,
        contentHash: asset.contentHash, sourceDuration: asset.duration, sourceStartTime: start, muted: true, volume: 0 });
    } else if (layer.type === 'image' && layer.vectorShape) {
      validateStudioVectorShape(layer.vectorShape);
      Object.assign(result, { src: studioVectorUri(layer.vectorShape), isLocal: true });
    } else if (layer.type === 'text' && typeof layer.text === 'string' && layer.text.length <= 180) {
      // Authored glyph mattes remain native text, editable in Graphics.
    } else throw Error('Motion styles support owned video, editable vector artwork and text.');
    return result;
  });
  const result = { ...snapshot, overlays, compositionOrder: spec.order.map(target),
    motionKeyframes: spec.keys.map((key, index) => ({ ...key, id: `${projectId}:look:key:${index}`, targetId: target(key.targetId) })),
    compoundClips: spec.groups.map(group => ({ ...group, id: target(group.id), layerIds: group.layerIds.map(target) })) };
  const document = adaptStudioSnapshotToDocument({ snapshot: result, projectId });
  compileStudioCompositionForRender(document);
  return result;
}
