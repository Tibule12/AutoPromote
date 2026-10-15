import { studioGroupTree } from './studioGroups';

// Read the same back-to-front composition and parent gates as the compositor.
// A timeline view never invents clips, scene boundaries or animation state.
export function studioTimelineLayers(entries, groups, duration, collapsed = new Set()) {
  const tree = studioGroupTree(groups, entries.map(entry => entry.id));
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const range = id => {
    const group = tree.byId.get(id);
    if (group?.timing) return [group.timing.startTime, group.timing.startTime + group.timing.duration];
    if (group) {
      const children = group.layerIds.map(range);
      return [Math.min(...children.map(item => item[0])), Math.max(...children.map(item => item[1]))];
    }
    const layer = byId.get(id).layer, start = Number(layer.startTime ?? 0);
    return [start, start + Number(layer.duration ?? duration)];
  };
  const visit = (id, depth, gate) => {
    const group = tree.byId.get(id), [start, end] = range(id);
    const effectiveStart = Math.max(gate[0], start), effectiveEnd = Math.min(gate[1], end);
    const row = { ...(group ? { id, kind: 'group', layer: group, label: group.name } : byId.get(id)),
      depth, start, end, effectiveStart, effectiveEnd };
    return [row, ...(group && !collapsed.has(id) ? [...group.layerIds].reverse()
      .flatMap(child => visit(child, depth + 1, [effectiveStart, effectiveEnd])) : [])];
  };
  return [...tree.roots].reverse().flatMap(id => visit(id, 0, [0, duration]));
}
