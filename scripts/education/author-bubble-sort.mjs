// Authors a documented interchange composition, never a finished movie.
// Import it through actual Studio Graphics. Native groups/keys render the motion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bubbleSortTrace } from './bubbleSortTrace.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = root + '/frontend/public/education/it-studio-v1';
const trace = bubbleSortTrace([5, 1, 4, 2]), duration = 28;
const layers = [], groups = [], key = (property, time, value, easing = 'hold') => ({ property, time, value, easing });
function text(id, name, copy, x, y, width, scale, startTime = 0, length = duration, color = '#f4f7fb') {
  const layer = { id, name, type: 'text', text: copy, x, y, width, scale, rotation: 0, opacity: 1, fontWeight: 600, textAlign: 'center', color, startTime, duration: length, keys: [] };
  layers.push(layer); return layer;
}
function rectangle(id, name, x, y, width, height, fill, stroke = '#a1b2c8', strokeWidth = 0) {
  const layer = { id, name, type: 'artwork', x, y, width, height, scale: 1, rotation: 0, opacity: 1, startTime: 0, duration, mediaFit: 'stretch',
    vectorShape: { version: 1, closed: true, nodes: [[1, 1], [99, 1], [99, 99], [1, 99]].map(([x, y]) => ({ x, y, in: [0, 0], out: [0, 0] })), fill: { kind: fill ? 'solid' : 'none', color: fill || '#ffffff', endColor: fill || '#ffffff', start: [0, 0], end: [100, 100] }, stroke: { color: stroke, width: strokeWidth } }, keys: [] };
  layers.push(layer); return layer;
}
text('kicker', 'Course identity', 'AUTOPROMOTE EDUCATION  /  ALGORITHMS IN MOTION', 50, 6, 88, .48, 0, duration, '#9ce9ca');
text('title', 'Lesson title', 'Bubble sort. One pair at a time.', 50, 15, 94, 1.28).fontWeight = 900;
text('subtitle', 'Comparison rule', 'Ascending order  •  Compare neighbours  •  Swap only when left is greater', 50, 25, 94, .60);
const positions = [24, 41, 58, 75], colours = ['#a8edcd', '#86d9f2', '#c4afff', '#ffc982'];
for (let i = 0; i < 4; i++) {
  const value = trace.input[i];
  rectangle('card-' + value, 'Card ' + value, positions[i], 47, 12, 16, colours[i]);
  text('value-' + value, 'Value ' + value, String(value), positions[i], 47, 11, 1.9, 0, duration, '#101b2b').fontWeight = 900;
  text('index-' + i, 'Fixed index ' + i, 'index ' + i, positions[i], 69, 15, .57, 0, duration, '#b4c2d5');
  groups.push({ id: 'element-' + value, name: 'Element ' + value + ' · card + value', layerIds: ['card-' + value, 'value-' + value], startTime: 0, duration, keys: [key('x', 0, 0), key('y', 0, 0)] });
}
const compare = rectangle('comparison', 'Compared neighbouring slots', 32.5, 47, 30, 20, null, '#ffffff', 1.8);
compare.keys = [key('opacity', 0, 0), key('opacity', 2, 1), key('opacity', 20, 0), key('x', 0, 32.5)];
text('intro', 'Initial state prompt', 'Start: [5, 1, 4, 2]  •  Indices stay fixed. Values move.', 50, 77, 94, .72, 0, 2);
const moves = [], initialIndex = new Map(trace.input.map((n, i) => [n, i]));
for (let s = 0; s < trace.steps.length; s++) {
  const step = trace.steps[s], at = 2 + 3 * s;
  compare.keys.push(key('x', at, positions[step.j] + 8.5));
  text('compare-' + s, 'Comparison ' + (s + 1), `Pass ${step.pass}  /  j = ${step.j}  /  ${step.left} ${step.swap ? 'is greater than' : 'is not greater than'} ${step.right}  /  ${step.swap ? 'SWAP' : 'KEEP'}`, 50, 77, 94, .68, at, 3);
  text('trace-' + s, 'Trace state ' + (s + 1), `Comparisons: ${s + 1}  •  Swaps after this step: ${step.swaps}`, 50, 87, 90, .52, at, 3, '#9ce9ca');
  if (step.swap) {
    for (const [value, from, to, arc] of [[step.left, step.j, step.j + 1, -10], [step.right, step.j + 1, step.j, 10]]) {
      const group = groups.find(g => g.id === 'element-' + value);
      const oldX = positions[from] - positions[initialIndex.get(value)], newX = positions[to] - positions[initialIndex.get(value)];
      // Studio easing belongs to the arriving key, as labelled in its curve editor.
      group.keys.push(key('x', at + 1, oldX), key('x', at + 2.25, newX, 'ease_in_out'), key('y', at + 1, 0), key('y', at + 1.625, arc, 'ease_in_out'), key('y', at + 2.25, 0, 'ease_in_out'));
      moves.push({ value, sourceSlot: from, destinationSlot: to, xStart: oldX, xEnd: newX, start: at + 1, middle: at + 1.625, end: at + 2.25, yMiddle: arc, easing: 'ease_in_out' });
    }
  }
}
// The initial x key and first comparison share the same value, not a duplicate time.
compare.keys = compare.keys.filter((k, i, all) => all.findIndex(x => x.property === k.property && x.time === k.time) === i);
text('finish', 'Sorted result', 'Sorted: [1, 2, 4, 5]  •  6 comparisons  •  4 swaps', 50, 77, 94, .79, 20, 4, '#9ce9ca');
text('stop', 'Early exit explanation', 'Pass 3 made no swaps. Stop after the unchanged pass.', 50, 87, 94, .56, 20, 4);
text('challenge', 'Learner prediction exercise', 'Your turn: trace [3, 2, 2, 1]. Do equal values need to swap?', 50, 77, 94, .67, 24, 4);
text('challenge-detail', 'Learner explanation prompt', 'Explain the rule before changing the animation.', 50, 87, 94, .56, 24, 4, '#9ce9ca');
text('footer', 'Supplementary resource identity', 'ZERO-BASED INDICES  /  ORIGINAL TEACHING EXAMPLE  /  NOT AN ASSESSED CAPS TASK', 50, 96, 96, .35, 0, duration, '#8398b3');
const composition = { format: 'autopromote-graphics', version: 1, name: 'Bubble sort · four values · teaching v1', width: 1280, height: 720, duration, layers, groups };
fs.writeFileSync(assets + '/bubble-sort.graphics.json', JSON.stringify(composition, null, 2) + '\n');
fs.writeFileSync(assets + '/bubble-sort-trace.json', JSON.stringify({ ...trace, duration, moves, slotCentres: positions, cardY: 47, cardWidth: 12, cardHeight: 16 }, null, 2) + '\n');
console.log(JSON.stringify({ layers: layers.length, groups: groups.length, keys: [...layers, ...groups].reduce((n, x) => n + x.keys.length, 0), comparisons: trace.comparisons, swaps: trace.swaps }));
