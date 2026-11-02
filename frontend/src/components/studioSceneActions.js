import { validateStudioParentGraph, validateStudioTrackMattes } from './studioCompRigging';
import { validateStudioPerspectiveLayer, PERSPECTIVE_LEFT } from './studioPerspective';
import { validateStudioTextAnimation } from './studioTextAnimator';
import { reconcileStudioDocument } from './studioProjectDocument';
import { compileStudioCompositionForRender, compileStudioFinishForRender } from './studioRenderCompiler';
import { buildStudioGraphicsPackage } from './studioGraphicsPackage';
import { studioMotionPropertiesForTarget } from './studioMotionProperties';
import { validateSpatialCurve } from './studioAutomation';
import { validateStudioGroupComposite } from './studioGroups';

const only = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)))
    throw Error('Unsupported scene-action fields.');
};
const finite = (n, min, max) => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw Error('Scene action contains an invalid numeric value.');
  return n;
};
const string = (s, max = 160) => {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[<>]/.test(s) ||
      Array.from(s).some(character => character.charCodeAt(0) < 32)) throw Error('Scene action contains invalid text.');
  return s;
};
const transform = (value = {}) => {
  only(value, ['x', 'y', 'scale', 'rotation', 'opacity']);
  const limits = { x: [-100, 200, 50], y: [-100, 200, 50], scale: [.02, 6, 1], rotation: [-3600, 3600, 0], opacity: [0, 1, 1] };
  return Object.fromEntries(Object.entries(limits).map(([p, [min, max, fallback]]) => [p, finite(value[p] ?? fallback, min, max)]));
};

// Deterministic execution of a reviewed plan. There is no model call or separate
// editor state: all actions become ordinary layers/keys in the current document.
export function executeStudioSceneActions(plan, snapshot, createId) {
  only(plan, ['format', 'version', 'projectId', 'baseRevision', 'name', 'actions']);
  const doc = snapshot.studioDocument;
  if (plan.format !== 'autopromote-scene-actions' || plan.version !== 1 ||
      plan.projectId !== doc.projectId || plan.baseRevision !== doc.revision) throw Error('Scene plan is stale or belongs to another project.');
  string(plan.name, 100);
  if (!Array.isArray(plan.actions) || !plan.actions.length || plan.actions.length > 64) throw Error('Use 1–64 supported scene actions.');
  const duration = (doc.outputTimeMap.at(-1)?.outputRange.endTick || 0) / 90000;
  const overlays = [...snapshot.overlays], motionKeyframes = [...(snapshot.motionKeyframes || [])];
  const adjustmentLayers = [...(snapshot.adjustmentLayers || [])];
  const compositionOrder = [...(snapshot.compositionOrder || snapshot.overlays.map(o => o.id))];
  const ids = new Map();
  const target = id => id === 'main-video' ? id : ids.get(id) || (overlays.some(layer => layer.id === id) ? id : null);
  const channelLimits = (id, property) => {
    const layer = id === 'main-video' ? { ...snapshot.mainTransform, id, type: 'video' } : overlays.find(item => item.id === id);
    const field = studioMotionPropertiesForTarget(layer).find(item => item.id === property);
    if (!field) throw Error('Choose a motion channel supported by this scene layer.');
    const legacy = { x: [-100, 200], y: [-100, 200], scale: [.02, 6], rotation: [-3600, 3600] };
    return legacy[property] || [field.min, field.max];
  };
  for (const action of plan.actions) {
    only(action, ['type', 'id', 'name', 'startTime', 'duration', 'transform', 'text', 'sourceMediaId', 'sourceStart', 'perspective', 'mask', 'targetId', 'parentId', 'matteSourceId', 'mode', 'keys', 'grade', 'beforeId', 'property']);
    const type = action.type;
    if (['null', 'title', 'media_plane', 'adjustment'].includes(type)) {
      string(action.id); string(action.name, 100);
      if (ids.has(action.id) || overlays.some(o => o.id === action.id)) throw Error('Duplicate scene layer identifier.');
      const startTime = finite(action.startTime, 0, duration), length = finite(action.duration, .05, duration);
      if (startTime + length > duration + 1 / 90000) throw Error('Scene layer extends past the programme.');
      const id = createId('scene'); ids.set(action.id, id);
      if (type === 'adjustment') {
        only(action.grade || {}, ['exposureStops', 'brightness', 'contrast', 'saturation']);
        const limits = { exposureStops: [-2, 2], brightness: [.65, 1.4], contrast: [.65, 1.75], saturation: [0, 1.8] };
        Object.entries(action.grade || {}).forEach(([key, value]) => finite(value, ...limits[key]));
        adjustmentLayers.push({ id, name: action.name, startTime, duration: length, enabled: true, intensity: 100, opacity: 1, finishFx: { ...action.grade } });
        continue;
      }
      const layer = { id, name: action.name, ...transform(action.transform), startTime, duration: length,
        anchorX: 50, anchorY: 50, shadow: 'none', blendMode: 'normal', animation: { enter: 'none', exit: 'none' } };
      if (type === 'null') Object.assign(layer, { type: 'text', text: '', isNullRig: true });
      if (type === 'title') Object.assign(layer, { type: 'text', text: string(action.text, 180), bg: 'transparent',
        color: '#f1ede4', fontFamily: 'Inter', fontWeight: 800, width: 60, textAlign: 'center' });
      if (type === 'media_plane') {
        const media = (snapshot.projectMedia || []).find(item => item.id === action.sourceMediaId && item.status === 'ready' && item.storagePath && item.url);
        if (!media) throw Error('Choose an available saved project video for the scene.');
        const sourceStart = finite(action.sourceStart ?? 0, 0, Number(media.duration));
        if (sourceStart + length > Number(media.duration) + .001) throw Error('Scene plane would run past its source video.');
        Object.assign(layer, { type: 'video', src: media.url, file: media.file, sourceMediaId: media.id,
          sourceDuration: Number(media.duration), contentHash: media.contentHash || null,
          sourceStoragePath: media.storagePath, sourceStartTime: sourceStart, width: 70, height: 70,
          bRollMode: 'pip', mediaFit: 'contain', frameShape: 'edge', borderRadius: 0, volume: 0, muted: true,
          layerShadow: {enabled: true, color: '#000000', opacity: .35, blur: 12, x: 0, y: 16},
          ...(action.perspective ? { perspective: action.perspective } : {}) });
        if (action.mask) {
          validateStudioGroupComposite({ mask: action.mask });
          layer.mask = JSON.parse(JSON.stringify(action.mask));
          layer.layerShadow = { enabled: false };
        }
      }
      overlays.push(layer); compositionOrder.push(id);
    } else if (type === 'parent') {
      const id = target(action.targetId), parentId = target(action.parentId);
      if (!id || !parentId || id === 'main-video') throw Error('Scene parenting refers to an unsupported or missing layer.');
      const i = overlays.findIndex(o => o.id === id); overlays[i] = { ...overlays[i], parentId };
    } else if (type === 'matte') {
      const id = target(action.targetId), sourceLayerId = target(action.matteSourceId);
      if (!id || !sourceLayerId || id === 'main-video') throw Error('Scene matte refers to an unsupported or missing layer.');
      const i = overlays.findIndex(o => o.id === id); overlays[i] = { ...overlays[i], trackMatte: { mode: action.mode, sourceLayerId } };
    } else if (type === 'move_layer') {
      const id = target(action.targetId), beforeId = target(action.beforeId);
      if (!id || !beforeId || id === beforeId || id === 'main-video' || beforeId === 'main-video') throw Error('Scene order needs two distinct ordinary layers.');
      const oldIndex = compositionOrder.indexOf(id); if (oldIndex < 0) throw Error('Scene layer is absent from the composition stack.');
      compositionOrder.splice(oldIndex, 1); compositionOrder.splice(compositionOrder.indexOf(beforeId), 0, id);
    } else if (type === 'remove_keys') {
      const id = target(action.targetId);
      if (!id) throw Error('Choose a supported scene key channel.');
      channelLimits(id, action.property);
      for (let i = motionKeyframes.length - 1; i >= 0; i--) {
        if (motionKeyframes[i].targetId === id && motionKeyframes[i].property === action.property) motionKeyframes.splice(i, 1);
      }
    } else if (type === 'keys') {
      const id = target(action.targetId); if (!id || !Array.isArray(action.keys) || action.keys.length > 128) throw Error('Scene keys need an existing target and a bounded key list.');
      for (const key of action.keys) {
        only(key, ['property', 'time', 'value', 'easing', 'curve', 'spatialCurve']);
        finite(key.time, 0, duration); finite(key.value, ...channelLimits(id, key.property));
        validateSpatialCurve(key);
        if (!['linear', 'hold', 'ease_in', 'ease_out', 'ease_in_out', 'bezier'].includes(key.easing)) throw Error('Unsupported scene easing.');
        if (key.easing === 'bezier') {
          if (!Array.isArray(key.curve) || key.curve.length !== 4) throw Error('Scene Bezier keys need four controls.');
          key.curve.forEach((v, i) => finite(v, i % 2 ? -2 : 0, i % 2 ? 2 : 1));
        }
        if (motionKeyframes.some(k => k.targetId === id && k.property === key.property && k.time === key.time)) throw Error('Scene contains duplicate property keys.');
        motionKeyframes.push({ ...key, id: createId('scene-key'), targetId: id });
      }
    } else throw Error(`Unsupported scene action: ${String(type)}.`);
  }
  if (overlays.length > 128) throw Error('Scene exceeds the Studio layer budget.');
  validateStudioParentGraph(overlays, snapshot.mainTransform); validateStudioTrackMattes(overlays);
  for (const layer of overlays) {
    const keys = motionKeyframes.filter(k => k.targetId === layer.id);
    validateStudioPerspectiveLayer(layer, keys, (snapshot.compoundClips || []).some(g => g.layerIds?.includes(layer.id)));
    validateStudioTextAnimation(layer, keys);
  }
  const next = { ...snapshot, overlays, motionKeyframes, adjustmentLayers, compositionOrder };
  const document = reconcileStudioDocument({ snapshot: next, projectId: doc.projectId, storedDocument: doc });
  compileStudioCompositionForRender(document); compileStudioFinishForRender(document);
  return { ...next, studioDocument: document };
}

// Director scene plans and manual graphics import share the same validated
// authoring operation. Rasterisation only prepares static artwork; motion,
// mattes, groups and text choreography remain ordinary editable project data.
export async function prepareStudioSceneActions(plan, snapshot, createId, options) {
  only(plan, ['format', 'version', 'projectId', 'baseRevision', 'name', 'actions', 'graphics']);
  const { graphics, ...actionsPlan } = plan;
  if (!graphics) return { snapshot: executeStudioSceneActions(actionsPlan, snapshot, createId), urls: [] };
  if (actionsPlan.projectId !== snapshot.studioDocument.projectId ||
      actionsPlan.baseRevision !== snapshot.studioDocument.revision)
    throw Error('Scene plan is stale or belongs to another project.');
  const isCurrent = options?.isCurrent || (() => true);
  const revokeUrl = options?.revokeUrl || (url => URL.revokeObjectURL(url));
  if (!isCurrent()) throw Error('The edit changed while preparing the scene.');
  const occupied = new Set(['main-video', ...snapshot.overlays.map(layer => layer.id),
    ...(actionsPlan.actions || []).filter(action => action.id).map(action => action.id)]);
  for (const item of [...(graphics.layers || []), ...(graphics.groups || [])])
    if (occupied.has(item.id)) throw Error('Graphics aliases must not collide with existing scene targets.');
  const result = await buildStudioGraphicsPackage({ input: graphics,
    overlays: snapshot.overlays, keyframes: snapshot.motionKeyframes || [], compounds: snapshot.compoundClips || [],
    order: snapshot.compositionOrder || snapshot.overlays.map(layer => layer.id),
    duration: snapshot.studioDocument.outputTimeMap.at(-1).outputRange.endTick / 90000,
    aspect: options?.aspect, createId, ...options, revokeUrl });
  try {
    if (!isCurrent()) throw Error('The edit changed while preparing the scene.');
    const aliases = new Map(graphics.layers.map((layer, index) => [layer.id, result.layers[index].id]));
    const remapped = { ...actionsPlan, actions: actionsPlan.actions.map(action => ({ ...action,
      ...Object.fromEntries(['targetId', 'parentId', 'matteSourceId', 'beforeId'].filter(field => action[field])
        .map(field => [field, aliases.get(action[field]) || action[field]])),
    })) };
    const next = { ...snapshot, overlays: result.overlays, motionKeyframes: result.keyframes,
      compoundClips: result.compounds, compositionOrder: result.order };
    return { snapshot: executeStudioSceneActions(remapped, next, createId), urls: result.urls };
  } catch (error) { result.urls.forEach(url => revokeUrl(url)); throw error; }
}

// A transparent local recipe, not evidence of model inference. Exact media and
// timing are selected by the creator; clock reveals require reviewed word cues.
export function buildStudioEvidenceScenePlan(snapshot, sourceMediaId, at) {
  const doc = snapshot.studioDocument;
  const duration = Math.min(4.5, (doc.outputTimeMap.at(-1).outputRange.endTick / 90000) - at);
  if (duration < .5) throw Error('Move the playhead earlier to place an evidence scene.');
  return { format: 'autopromote-scene-actions', version: 1, projectId: doc.projectId, baseRevision: doc.revision,
    name: 'Cinematic evidence screen', actions: [
      { type: 'media_plane', id: 'evidence-plane', name: 'Evidence recording plane', sourceMediaId,
        sourceStart: 0, startTime: at, duration, perspective: { version: 1, corners: PERSPECTIVE_LEFT.map(p => [...p]) },
        transform: { x: 68, y: 46, scale: .62, opacity: 0 } },
      { type: 'keys', targetId: 'evidence-plane', keys: [
        { property: 'opacity', time: at, value: 0, easing: 'linear' },
        { property: 'opacity', time: at + .4, value: 1, easing: 'bezier', curve: [.2, 1, .3, 1] },
        { property: 'opacity', time: at + duration - .3, value: 1, easing: 'linear' },
        { property: 'opacity', time: at + duration, value: 0, easing: 'linear' },
        { property: 'scale', time: at, value: .58, easing: 'linear' },
        { property: 'scale', time: at + duration, value: .66, easing: 'bezier', curve: [.2, .8, .3, 1] },
      ] },
    ] };
}
