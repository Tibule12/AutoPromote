// Back-to-front order of editable graphic layers. Source footage, source VFX
// and generated captions keep their existing programme stages.
export function studioLayerEntries(snapshot, order = snapshot.compositionOrder) {
  const entries = [
    ...(snapshot.overlays || []).filter(layer => !layer.isCaption).map((layer, index) => ({
      id: String(layer.id || `${layer.type === 'text' ? 'title' : 'b_roll'}-${index + 1}`),
      kind: 'overlay', label: layer.name || layer.text || 'Visual layer', layer,
    })),
    ...(snapshot.motionScenes || []).map((layer, index) => ({
      id: String(layer.id || `motion-${index + 1}`), kind: 'motion', label: layer.name || layer.text || 'Motion graphic', layer,
    })),
    ...(snapshot.threeDScenes || []).map((layer, index) => ({
      id: String(layer.id || `three_d-${index + 1}`), kind: 'three_d', label: layer.name || layer.text || '3D scene', layer,
    })),
  ];
  if (!Array.isArray(order)) return entries;
  if (order.some(id => typeof id !== 'string' || !id) || new Set(order).size !== order.length)
    throw new Error('Layer order needs unique layer IDs.');
  // Deletion drops old IDs; newly added/duplicated layers join the front.
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const orderedIds = new Set(order);
  return [...order.filter(id => byId.has(id)).map(id => byId.get(id)),
    ...entries.filter(entry => !orderedIds.has(entry.id))];
}

export function moveStudioLayer(entries, id, direction) {
  const ids = entries.map(entry => entry.id), index = ids.indexOf(id);
  if (index < 0) return ids;
  const target = direction === 'front' ? ids.length - 1 : direction === 'back' ? 0
    : direction === 'forward' ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1);
  ids.splice(index, 1); ids.splice(target, 0, id);
  return ids;
}

export function orderStudioCollection(items, order) {
  const rank = new Map(order.map((id, index) => [id, index]));
  const ordered = items.filter(item => rank.has(item.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  let cursor = 0;
  return items.map(item => rank.has(item.id) ? ordered[cursor++] : item);
}
