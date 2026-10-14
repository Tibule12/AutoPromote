export const GROUP_KIND = 'graphic_group';
export const GROUP_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const GROUP_BOUNDS = { x: [-100, 100], y: [-100, 100], scale: [.1, 2], rotation: [-180, 180], opacity: [0, 1] };

// Groups extend the existing canonical compoundClips settings. The layer list
// remains the authoritative back-to-front leaf order; each group is contiguous.
export function studioGroupTree(compounds, order) {
  const groups = (compounds || []).filter(g => g.kind === GROUP_KIND);
  if (!groups.length) return { groups, roots: order, leaves: id => [id], parent: new Map(), byId: new Map() };
  if (groups.length > 64) throw Error('A project supports at most 64 graphic groups.');
  const byId = new Map(), parent = new Map(), known = new Set(order);
  for (const g of groups) {
    if (Object.keys(g).some(key => !['id', 'name', 'kind', 'layerIds', 'transform'].includes(key)))
      throw Error('Graphic groups support membership and static transforms only.');
    if (typeof g.id !== 'string' || !g.id || byId.has(g.id) || known.has(g.id) || !Array.isArray(g.layerIds) || !g.layerIds.length ||
        g.layerIds.some(id => typeof id !== 'string' || !id) ||
        new Set(g.layerIds).size !== g.layerIds.length) throw Error('Group membership needs unique IDs and at least one child.');
    if (g.transform !== undefined && (!g.transform || typeof g.transform !== 'object' || Array.isArray(g.transform)))
      throw Error('Group transforms need an object.');
    const transform = { ...GROUP_TRANSFORM };
    for (const [field, [min, max]] of Object.entries(GROUP_BOUNDS)) {
      const value = Object.hasOwn(g.transform || {}, field) ? g.transform[field] : GROUP_TRANSFORM[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        throw Error(`Group ${field} must be between ${min} and ${max}.`);
      transform[field] = value;
    }
    if (Object.keys(g.transform || {}).some(key => !Object.hasOwn(GROUP_TRANSFORM, key)))
      throw Error('Group transforms support static position, scale, rotation and opacity.');
    byId.set(g.id, { ...g, transform });
  }
  for (const g of groups) for (const id of g.layerIds) {
    if ((!known.has(id) && !byId.has(id)) || parent.has(id)) throw Error('Each group child needs one existing parent.');
    parent.set(id, g.id);
  }
  const leaves = (id, seen = new Set()) => {
    if (!byId.has(id)) return [id];
    if (seen.has(id) || seen.size >= 8) throw Error('Group nesting must be acyclic and at most 8 levels.');
    return byId.get(id).layerIds.flatMap(child => leaves(child, new Set([...seen, id])));
  };
  const rank = new Map(order.map((id, index) => [id, index]));
  for (const g of groups) {
    const positions = leaves(g.id).map(id => rank.get(id));
    if (positions.some((p, index) => p !== positions[0] + index)) throw Error('Group children must keep a contiguous layer order.');
  }
  const roots = [...order.filter(id => !parent.has(id)), ...groups.filter(g => !parent.has(g.id)).map(g => g.id)]
    .sort((a, b) => rank.get(leaves(a)[0]) - rank.get(leaves(b)[0]));
  return { groups: [...byId.values()], roots, leaves, parent, byId };
}

export function createStudioGroup(compounds, order, selected, id, name) {
  const tree = studioGroupTree(compounds, order), chosen = tree.roots.filter(node => selected.includes(node));
  if (!chosen.length) throw Error('Select at least one layer or group.');
  const group = { id, name, kind: GROUP_KIND, layerIds: chosen, transform: { ...GROUP_TRANSFORM } };
  const roots = tree.roots.filter(node => !chosen.includes(node));
  roots.splice(tree.roots.indexOf(chosen[0]), 0, id);
  const leafOrder = roots.flatMap(node => node === id ? chosen.flatMap(child => tree.leaves(child)) : tree.leaves(node));
  const next = [...compounds, group]; studioGroupTree(next, leafOrder);
  return { compounds: next, order: leafOrder };
}

export function moveStudioGroupNode(compounds, order, id, direction) {
  const tree = studioGroupTree(compounds, order), owner = tree.parent.get(id);
  const siblings = [...(owner ? tree.byId.get(owner).layerIds : tree.roots)], index = siblings.indexOf(id);
  if (index < 0) return { compounds, order };
  const target = direction === 'front' ? siblings.length - 1 : direction === 'back' ? 0
    : direction === 'forward' ? Math.min(siblings.length - 1, index + 1) : Math.max(0, index - 1);
  siblings.splice(index, 1); siblings.splice(target, 0, id);
  const next = compounds.map(g => g.id === owner ? { ...g, layerIds: siblings } : g);
  const byId = new Map(next.filter(g => g.kind === GROUP_KIND).map(g => [g.id, g]));
  const flatten = node => byId.has(node) ? byId.get(node).layerIds.flatMap(flatten) : [node];
  return { compounds: next, order: (owner ? tree.roots : siblings).flatMap(flatten) };
}

export function removeStudioGroup(compounds, id) {
  const removed = compounds.find(g => g.id === id && g.kind === GROUP_KIND);
  if (!removed) return compounds;
  return compounds.filter(g => g.id !== id).map(g => g.kind === GROUP_KIND
    ? { ...g, layerIds: g.layerIds.flatMap(child => child === id ? removed.layerIds : [child]) } : g);
}

export function removeStudioGroupMembers(compounds, removedIds) {
  const removed = new Set(removedIds); let result = compounds, changed = true;
  while (changed) {
    changed = false;
    const next = [];
    for (const g of result) {
      if (g.kind !== GROUP_KIND) { next.push(g); continue; }
      const layerIds = g.layerIds.filter(id => !removed.has(id));
      if (layerIds.length) next.push({ ...g, layerIds });
      else { removed.add(g.id); changed = true; }
    }
    result = next;
  }
  return result;
}

export function studioGroupLocalPoint(tree, id, x, y, width, height) {
  const chain = []; let owner = tree.parent.get(id);
  while (owner) { chain.push(tree.byId.get(owner).transform); owner = tree.parent.get(owner); }
  let px = x * width / 100, py = y * height / 100;
  for (const t of chain.reverse()) {
    const angle = -t.rotation * Math.PI / 180, dx = px - width * (.5 + t.x / 100), dy = py - height * (.5 + t.y / 100);
    px = (dx * Math.cos(angle) - dy * Math.sin(angle)) / t.scale + width / 2;
    py = (dx * Math.sin(angle) + dy * Math.cos(angle)) / t.scale + height / 2;
  }
  return { x: px / width * 100, y: py / height * 100 };
}
