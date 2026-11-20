import { GROUP_KIND, studioGroupTree } from './studioGroups';

const tick = value => Math.round(value * 90000) / 90000;
const isBroll = layer => !!layer.bRollMode || layer.type === 'image' || layer.type === 'video';

export function studioGroupTimingRows({ compounds, order, overlays = [], motionScenes = [], threeDScenes = [], duration, trackStates = {} }) {
  const tree = studioGroupTree(compounds, order);
  const leaves = new Map([...overlays.map(layer => ({ ...layer, track: isBroll(layer) ? 'broll' : 'graphics' })),
    ...[...motionScenes, ...threeDScenes].map(scene => ({ ...scene, track: 'motion' }))].map(item => [item.id, item]));
  const range = id => {
    const group = tree.byId.get(id);
    if (group?.timing) return { start: group.timing.startTime, end: group.timing.startTime + group.timing.duration };
    if (group) {
      const children = group.layerIds.map(range);
      return { start: Math.min(...children.map(child => child.start)), end: Math.max(...children.map(child => child.end)) };
    }
    const item = leaves.get(id), start = Number(item?.startTime ?? 0);
    return { start, end: start + Number(item?.duration ?? duration) };
  };
  return tree.groups.map(group => {
    const bounds = range(group.id), members = tree.leaves(group.id);
    return { ...group, startTime: bounds.start, duration: Math.max(0, bounds.end - bounds.start),
      parentId: tree.parent.get(group.id), childCount: members.length,
      locked: !!trackStates.graphics?.locked || members.some(id => !!trackStates[leaves.get(id)?.track]?.locked) };
  });
}

// One transaction owns all descendant clip starts and keys. Trimming changes
// only the canonical visibility range, retaining source phase and hidden keys.
export function editStudioGroupTiming(state, id, action, requested, programmeDuration) {
  if (!Number.isFinite(requested)) throw Error('Group timing needs a finite time.');
  const { compounds, order, overlays = [], motionScenes = [], threeDScenes = [], motionKeyframes = [] } = state;
  const tree = studioGroupTree(compounds, order), group = tree.byId.get(id);
  if (!group) throw Error('Select an existing graphic group.');
  const row = studioGroupTimingRows({ ...state, duration: programmeDuration }).find(item => item.id === id);
  if (row.locked) throw Error('Unlock the group and its child tracks before editing its timing.');
  const end = row.startTime + row.duration, frame = Number(state.frameStep) || 1 / 30;
  if (!['move', 'trim-start', 'trim-end'].includes(action)) throw Error('Unsupported group timing edit.');
  if (action !== 'move') {
    const start = action === 'trim-start' ? Math.max(0, Math.min(requested, end - frame)) : row.startTime;
    const last = action === 'trim-end' ? Math.max(start + frame, Math.min(requested, programmeDuration)) : end;
    return { ...state, compounds: compounds.map(item => item.id === id ? { ...item,
      timing: { startTime: tick(start), duration: tick(Math.max(0, last - start)) } } : item) };
  }
  const owned = new Set(tree.leaves(id));
  const collect = identity => {
    owned.add(identity);
    tree.byId.get(identity)?.layerIds.forEach(collect);
  };
  collect(id);
  const times = [row.startTime, ...motionKeyframes.filter(key => owned.has(key.targetId)).map(key => key.time),
    ...[...overlays, ...motionScenes, ...threeDScenes].filter(item => owned.has(item.id)).flatMap(item =>
      [Number(item.startTime || 0), ...(item.keyframes || []).map(key => key.time)]),
    ...tree.groups.filter(item => owned.has(item.id) && item.timing).map(item => item.timing.startTime)];
  const delta = tick(Math.max(-Math.min(...times), Math.min(requested - row.startTime,
    Math.max(0, programmeDuration - end))));
  const shift = items => items.map(item => !owned.has(item.id) ? item : { ...item,
    startTime: tick(Number(item.startTime || 0) + delta),
    ...(item.endTime !== undefined ? { endTime: tick(item.endTime + delta) } : {}),
    ...(item.keyframes ? { keyframes: item.keyframes.map(key => ({ ...key, time: tick(key.time + delta) })) } : {}) });
  return { ...state, overlays: shift(overlays), motionScenes: shift(motionScenes), threeDScenes: shift(threeDScenes),
    motionKeyframes: motionKeyframes.map(key => owned.has(key.targetId) ? { ...key, time: tick(key.time + delta) } : key),
    compounds: compounds.map(item => item.id === id ? { ...item, timing: { startTime: tick(row.startTime + delta), duration: tick(row.duration) } }
      : owned.has(item.id) && item.timing ? { ...item, timing: { ...item.timing, startTime: tick(item.timing.startTime + delta) } } : item) };
}

export function rippleStudioGroupTiming(compounds, from, to) {
  if (!(to > from)) return compounds;
  const map = time => time <= from ? time : time >= to ? time - (to - from) : from;
  return compounds.map(group => group.kind !== GROUP_KIND || !group.timing ? group : { ...group,
    timing: { startTime: tick(map(group.timing.startTime)),
      duration: tick(map(group.timing.startTime + group.timing.duration) - map(group.timing.startTime)) } });
}

// The same derived cue range feeds native audio preview and export. A trimmed
// motion group cannot leave an audible hidden cue behind its visibility gate.
export function clipStudioGroupMotionCues(cues, compounds) {
  const groups = new Map((compounds || []).filter(group => group.kind === GROUP_KIND).map(group => [group.id, group]));
  const parents = new Map([...groups.values()].flatMap(group => group.layerIds.map(id => [id, group.id])));
  return cues.flatMap(cue => {
    let owner = parents.get(cue.id.replace(/^motion-sfx-/, '')), start = cue.startTime, end = start + cue.duration;
    const visited = new Set();
    while (owner && !visited.has(owner)) {
      visited.add(owner); const group = groups.get(owner);
      if (group.timing) { start = Math.max(start, group.timing.startTime); end = Math.min(end, group.timing.startTime + group.timing.duration); }
      owner = parents.get(owner);
    }
    if (end <= start) return [];
    if (start === cue.startTime && end === cue.startTime + cue.duration) return [cue];
    return [{ ...cue, startTime: tick(start), duration: tick(end - start), trimStart: tick(Number(cue.trimStart || 0) + start - cue.startTime) }];
  });
}

function nextUniqueId(base, used) {
  const stem = `${base}-copy`;
  let index = 1;
  while (used.has(`${stem}-${index}`)) index += 1;
  const candidate = `${stem}-${index}`;
  used.add(candidate);
  return candidate;
}

/**
 * Duplicates a compound graphic/motion group cleanly along with all nested subgroups,
 * descendant leaves, motion keyframes, and composition order.
 */
export function duplicateStudioGroup(state, id, { targetStartTime, programmeDuration } = {}) {
  const { compounds = [], order = [], overlays = [], motionScenes = [], threeDScenes = [], motionKeyframes = [] } = state;
  const tree = studioGroupTree(compounds, order);
  const group = tree.byId.get(id);
  if (!group) throw Error('Select an existing graphic group.');
  const row = studioGroupTimingRows({ ...state, duration: programmeDuration }).find(item => item.id === id);

  const usedIds = new Set([
    ...compounds.map(item => item.id),
    ...overlays.map(item => item.id),
    ...motionScenes.map(item => item.id),
    ...threeDScenes.map(item => item.id),
    ...order,
    ...motionKeyframes.map(key => key.id),
  ]);

  const clonedIdMap = new Map();
  const collectOrder = [];
  const walkGroup = currentId => {
    const node = tree.byId.get(currentId);
    if (!node) return;
    clonedIdMap.set(currentId, nextUniqueId(currentId, usedIds));
    collectOrder.push(currentId);
    node.layerIds.forEach(childId => {
      if (tree.byId.has(childId)) walkGroup(childId);
      else clonedIdMap.set(childId, nextUniqueId(childId, usedIds));
    });
  };
  walkGroup(id);

  const maxDur = Number.isFinite(Number(programmeDuration)) && Number(programmeDuration) > 0
    ? Number(programmeDuration)
    : row.startTime + row.duration * 2;
  const defaultNextStart = row.startTime + row.duration * 2 <= maxDur ? row.startTime + row.duration : row.startTime;
  const requestedStart = Number.isFinite(Number(targetStartTime)) ? Number(targetStartTime) : defaultNextStart;
  const clampedStart = Math.max(0, Math.min(requestedStart, Math.max(0, maxDur - row.duration)));
  const delta = tick(clampedStart - row.startTime);

  const shiftClonedTiming = (item, newId) => {
    const shifted = { ...item, id: newId };
    if (shifted.startTime !== undefined) shifted.startTime = tick(Math.max(0, Number(shifted.startTime || 0) + delta));
    if (shifted.endTime !== undefined) shifted.endTime = tick(Math.max(0, Number(shifted.endTime || 0) + delta));
    if (Array.isArray(shifted.keyframes)) {
      shifted.keyframes = shifted.keyframes.map(key => ({
        ...key,
        id: nextUniqueId(key.id || 'pose', usedIds),
        time: tick(Math.max(0, Number(key.time || 0) + delta)),
      }));
    }
    return shifted;
  };

  const clonedOverlays = overlays.filter(item => clonedIdMap.has(item.id)).map(item => shiftClonedTiming(item, clonedIdMap.get(item.id)));
  const clonedMotionScenes = motionScenes.filter(item => clonedIdMap.has(item.id)).map(item => shiftClonedTiming(item, clonedIdMap.get(item.id)));
  const clonedThreeDScenes = threeDScenes.filter(item => clonedIdMap.has(item.id)).map(item => shiftClonedTiming(item, clonedIdMap.get(item.id)));
  const clonedKeyframes = motionKeyframes
    .filter(key => clonedIdMap.has(key.targetId))
    .map(key => ({
      ...key,
      id: nextUniqueId(key.id || 'kf', usedIds),
      targetId: clonedIdMap.get(key.targetId),
      time: tick(Math.max(0, Number(key.time || 0) + delta)),
    }));

  const clonedGroups = collectOrder.map(origGroupId => {
    const orig = tree.byId.get(origGroupId);
    const baseName = origGroupId === id ? `${orig.name || orig.id} copy` : orig.name || orig.id;
    const timing = orig.timing
      ? { startTime: tick(Math.max(0, orig.timing.startTime + delta)), duration: orig.timing.duration }
      : origGroupId === id && delta !== 0
        ? { startTime: tick(Math.max(0, row.startTime + delta)), duration: tick(row.duration) }
        : undefined;
    return {
      ...orig,
      id: clonedIdMap.get(origGroupId),
      name: baseName,
      layerIds: orig.layerIds.map(childId => clonedIdMap.get(childId) || childId),
      ...(timing ? { timing } : {}),
    };
  });

  const clonedLeafIds = tree.leaves(id).map(leafId => clonedIdMap.get(leafId)).filter(Boolean);
  const originalLeaves = new Set(tree.leaves(id));
  const lastLeafIndex = order.reduce((last, itemId, idx) => (originalLeaves.has(itemId) ? idx : last), -1);
  const nextOrder = [...order];
  if (clonedLeafIds.length) {
    nextOrder.splice(lastLeafIndex >= 0 ? lastLeafIndex + 1 : nextOrder.length, 0, ...clonedLeafIds);
  }

  return {
    state: {
      ...state,
      compounds: [...compounds, ...clonedGroups],
      order: nextOrder,
      overlays: [...overlays, ...clonedOverlays],
      motionScenes: [...motionScenes, ...clonedMotionScenes],
      threeDScenes: [...threeDScenes, ...clonedThreeDScenes],
      motionKeyframes: [...motionKeyframes, ...clonedKeyframes],
    },
    duplicatedGroupId: clonedIdMap.get(id),
    idMap: Object.fromEntries(clonedIdMap),
  };
}

/**
 * Splits a timed group into left and right independently editable copies at splitTime,
 * retaining child media phases and keyframe timing inside each side's visibility gate.
 */
export function splitStudioGroup(state, id, splitTime, { programmeDuration } = {}) {
  if (!Number.isFinite(splitTime)) throw Error('Split time must be finite.');
  const { compounds = [], order = [] } = state;
  const tree = studioGroupTree(compounds, order);
  const group = tree.byId.get(id);
  if (!group) throw Error('Select an existing graphic group.');
  const row = studioGroupTimingRows({ ...state, duration: programmeDuration }).find(item => item.id === id);
  if (row.locked) throw Error('Unlock the group and its child tracks before splitting.');
  const frame = Number(state.frameStep) || 1 / 30;
  const groupEnd = row.startTime + row.duration;
  if (splitTime <= row.startTime + frame || splitTime >= groupEnd - frame) {
    throw Error('Move the playhead inside the group range to split it.');
  }

  const { state: duplicatedState, duplicatedGroupId } = duplicateStudioGroup(state, id, {
    targetStartTime: row.startTime,
    programmeDuration: Math.max(Number(programmeDuration) || 0, groupEnd),
  });

  const rightDuration = tick(groupEnd - splitTime);
  const leftDuration = tick(splitTime - row.startTime);

  return {
    state: {
      ...duplicatedState,
      compounds: duplicatedState.compounds.map(item => {
        if (item.id === id) {
          return { ...item, timing: { startTime: tick(row.startTime), duration: leftDuration } };
        }
        if (item.id === duplicatedGroupId) {
          return { ...item, timing: { startTime: tick(splitTime), duration: rightDuration } };
        }
        return item;
      }),
    },
    leftGroupId: id,
    rightGroupId: duplicatedGroupId,
  };
}
