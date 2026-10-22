#!/usr/bin/env node
// Authored choreography, not a renderer. The JSON is imported by the normal
// Graphics inspector and becomes ordinary editable Studio layers and keys.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve('reports/studio-break-the-loop-20261015');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
const INK = '#121215', PAPER = '#f4efe6', RED = '#ff5436', MUTED = '#777477';
const layers = [], groups = [], out = [.16, 1, .3, 1], snap = [.12, 1.25, .25, 1];
const round = v => Math.round(v * 90000) / 90000;
const K = (layer, property, points) => points.forEach(([time, value, easing = 'bezier', curve = out]) => {
  layer.keys.push({ property, time: round(time), value, easing, ...(easing === 'bezier' ? { curve } : {}) });
});
const T = (id, copy, start, end, x, y, scale, color = PAPER, options = {}) => {
  const layer = { id, name: options.name || copy, type: 'text', text: copy, startTime: start, duration: round(end - start),
    x, y, scale, rotation: 0, opacity: 1, width: 95, fontWeight: 900, textAlign: 'center', color, keys: [], ...options };
  layers.push(layer); return layer;
};
const svg = (body, w = 720, h = 720) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const A = (id, body, start, end, x, y, width, height, options = {}) => {
  const layer = { id, name: id, type: 'artwork', svg: body, startTime: start, duration: round(end - start),
    x, y, width, height, scale: 1, rotation: 0, opacity: 1, keys: [], ...options };
  layers.push(layer); return layer;
};
const G = (id, names, start, end) => {
  const group = { id, name: id, layerIds: names.map(l => l.id), startTime: start, duration: round(end - start), keys: [] };
  groups.push(group); return group;
};
const fade = (l, points) => K(l, 'opacity', points.map(([t, v]) => [t, v, 'linear']));
const rect = (color, w = 1280, h = 720, r = 0) => svg(`<rect width="${w}" height="${h}" rx="${r}" fill="${color}"/>`, w, h);
A('Ink / programme', rect(INK), 0, 20, 50, 50, 100, 100);
// Faint fixed registration marks hold the frame together through all actions.
A('Frame / registration', svg(`<path d="M72 80h28M72 80v28M1208 80h-28M1208 80v28M72 640h28M72 640v-28M1208 640h-28M1208 640v-28" fill="none" stroke="${MUTED}" stroke-width="1.5" opacity=".55"/>`, 1280, 720), 0, 20, 50, 50, 100, 100);
const dial = [];
let ticks = '';
for (let i = 0; i < 72; i++) {
  const a = i * Math.PI / 36, r = i % 6 ? 332 : 319;
  ticks += `<path d="M${360 + r * Math.cos(a)} ${360 + r * Math.sin(a)}L${360 + 342 * Math.cos(a)} ${360 + 342 * Math.sin(a)}"/>`;
}
dial.push(A('Loop / dial', svg(`<g fill="none" stroke="${RED}" stroke-width="2"><circle cx="360" cy="360" r="290"/><circle cx="360" cy="360" r="300" opacity=".25"/>${ticks}</g>`), 0, 4.55, 50, 50, 36.5, 64.9));
for (let i = 0; i < 12; i++) {
  const a = i * Math.PI / 6 - Math.PI / 2;
  const word = T(`loop-${i}`, 'LOOP', 0, 4.55, 50 + 23 * Math.cos(a), 50 + 40.89 * Math.sin(a), .8, i % 3 ? PAPER : RED,
    { rotation: i * 30 > 180 ? i * 30 - 360 : i * 30, name: `Loop / ${i + 1}` });
  dial.push(word);
}
const dialGroup = G('01 / repeating orbit', dial, 0, 4.55);
K(dialGroup, 'rotation', [[0, -160, 'linear'], [1.6, -105, 'linear'], [3.35, 0, 'bezier', [.7, 0, 1, 1]], [4.55, 130, 'ease_in']]);
K(dialGroup, 'scale', [[0, 1.7], [.65, 1], [3.15, .92, 'linear'], [3.65, 1.02, 'ease_in'], [4.55, 1.85, 'ease_in']]);
fade(dialGroup, [[0, 0], [.3, 1], [3.9, 1], [4.55, 0]]);
const on = T('on', 'ON', .35, 3.92, 50, 43, 1.1);
K(on, 'y', [[.35, 55], [.85, 43], [3.4, 43, 'hold'], [3.92, 34, 'ease_in']]);
fade(on, [[.35, 0], [.65, 1], [3.5, 1], [3.92, 0]]);
const repeat = T('repeat', 'REPEAT', .55, 3.92, 50, 54, 3.25);
K(repeat, 'scale', [[.55, 2.1], [1.1, 3.25, 'bezier', snap], [2.35, 3.3, 'linear'], [3.3, 3.5, 'ease_in'], [3.92, .4, 'ease_in']]);
K(repeat, 'rotation', [[.55, -12], [1.1, 0], [3.3, 0, 'hold'], [3.92, 18, 'ease_in']]);
fade(repeat, [[.55, 0], [.72, 1], [3.7, 1], [3.92, 0]]);
for (let i = 0; i < 3; i++) {
  const l = T(`count-${i}`, `0${i + 1}`, 1.05 + i * .82, 1.75 + i * .82, 50, 66, .45, RED, { fontWeight: 600 });
  K(l, 'y', [[l.startTime, 69], [l.startTime + .18, 66], [l.startTime + .5, 66, 'hold'], [l.startTime + .69, 63, 'ease_in']]);
  fade(l, [[l.startTime, 0], [l.startTime + .1, 1], [l.startTime + .55, 1], [l.startTime + .69, 0]]);
}
// The ring does not simply disappear. Six physical fragments continue its
// exact silhouette, then scatter behind the incoming headline.
for (let i = 0; i < 6; i++) {
  const a = i * Math.PI / 3, b = a + Math.PI / 3 - .05, r = 290;
  const arc = svg(`<path d="M${360 + r * Math.cos(a)} ${360 + r * Math.sin(a)} A${r} ${r} 0 0 1 ${360 + r * Math.cos(b)} ${360 + r * Math.sin(b)}" fill="none" stroke="${RED}" stroke-width="5"/>`);
  const l = A(`Break / arc ${i + 1}`, arc, 3.92, 5.65, 50, 50, 36.5, 64.9);
  K(l, 'x', [[3.92, 50], [5.65, 50 + 35 * Math.cos(a + .5), 'ease_out']]);
  K(l, 'y', [[3.92, 50], [5.65, 50 + 45 * Math.sin(a + .5), 'ease_out']]);
  K(l, 'rotation', [[3.92, 0], [5.65, (i % 2 ? -1 : 1) * 65, 'ease_out']]);
  K(l, 'scale', [[3.92, 1], [5.65, 1.6, 'ease_out']]); fade(l, [[3.92, 1], [4.55, 1], [5.65, 0]]);
}
A('Impact / flash', rect(RED), 3.91667, 4, 50, 50, 100, 100);
const impact = [];
for (let i = 0; i < 5; i++) {
  const start = 3.52 + i * .085, x = 28 + i * 11;
  const l = T(`break-${i}`, 'BREAK'[i], start, 8.55, x, 48, 4.8, PAPER, { name: `BREAK / ${'BREAK'[i]}` }); impact.push(l);
  K(l, 'y', [[start, i % 2 ? 12 : 87], [4.1 + i * .085, 48, 'bezier', snap], [5.7, 48, 'hold'], [6.35, 34]]);
  K(l, 'rotation', [[start, i % 2 ? 30 : -30], [4.1 + i * .085, 0, 'bezier', snap]]);
  K(l, 'scale', [[start, .3], [4.1 + i * .085, 4.8, 'bezier', snap], [5.7, 4.8, 'hold'], [6.35, 3.4]]);
  K(l, 'x', [[start, x], [5.7, x, 'hold'], [6.35, 34 + i * 8]]);
}
const theLoop = T('the-loop', 'THE LOOP.', 6, 8.55, 50, 61, 3.15, RED); impact.push(theLoop);
K(theLoop, 'y', [[6, 78], [6.6, 61, 'bezier', snap]]); fade(theLoop, [[6, 0], [6.25, 1]]);
const impactGroup = G('02 / break the loop', impact, 3.52, 8.55);
K(impactGroup, 'x', [[3.52, 0], [7.65, 0, 'hold'], [8.55, -100, 'ease_in']]);
K(impactGroup, 'rotation', [[3.52, 0], [7.65, 0, 'hold'], [8.55, -12, 'ease_in']]);
const slash = A('Transition / slash', rect(RED, 900, 48), 7.8, 8.8, 50, 50, 75, 6.7, { rotation: -12 });
K(slash, 'x', [[7.8, 0], [8.25, 50], [8.8, 100, 'ease_in']]);
K(slash, 'scale', [[7.8, .1], [8.15, 1.8], [8.8, .1, 'ease_in']]);
fade(slash, [[7.8, 0], [7.95, 1], [8.55, 1], [8.8, 0]]);
// Four words make one changing layout; they do not share an entrance preset.
const make = T('make', 'MAKE', 8.1, 11.1, 29, 37, 3.6);
K(make, 'x', [[8.1, 5], [8.7, 29], [10.55, 29, 'hold'], [11.1, 5, 'ease_in']]);
K(make, 'rotation', [[8.1, 14], [8.7, 0], [10.55, 0, 'hold'], [11.1, -22, 'ease_in']]);
const your = T('your', 'YOUR', 8.48, 11.2, 69, 37, 3.6, RED);
K(your, 'rotation', [[8.48, 90], [9.15, 0, 'bezier', snap], [10.65, 0, 'hold'], [11.2, 40, 'ease_in']]);
K(your, 'scale', [[8.48, .1], [9.15, 3.6, 'bezier', snap], [10.65, 3.6, 'hold'], [11.2, .1, 'ease_in']]);
const own = T('own', 'OWN', 9, 11.3, 29, 64, 4.1, RED);
K(own, 'y', [[9, 91], [9.5, 64, 'bezier', snap], [10.7, 64, 'hold'], [11.3, 88, 'ease_in']]);
const rhythm = T('rhythm-small', 'RHYTHM', 9.4, 11.45, 70, 64, 2.65);
K(rhythm, 'x', [[9.4, 95], [9.95, 70], [10.85, 70, 'hold'], [11.45, 50]]);
K(rhythm, 'y', [[9.4, 64], [10.85, 64, 'hold'], [11.45, 49]]);
K(rhythm, 'scale', [[9.4, .8], [9.95, 2.65], [10.85, 2.65, 'hold'], [11.45, 4.6]]);
fade(rhythm, [[9.4, 0], [9.65, 1], [11.35, 1], [11.45, 0]]);
// A travelling wave passes through individual letters and bars. These are
// sampled ordinary property keys; Studio's existing evaluator owns every pose.
for (let i = 0; i < 6; i++) {
  const l = T(`wave-letter-${i}`, 'RHYTHM'[i], 11.4, 15.25, 25 + i * 10, 49, 4.6, i % 3 === 1 ? RED : PAPER, { name: `Rhythm / ${i + 1}` });
  for (let j = 0; j <= 28; j++) {
    const time = 11.4 + j * 3 / 28, phase = j / 28 * Math.PI * 6 - i * .7;
    K(l, 'y', [[time, 49 + Math.sin(phase) * (j < 3 ? j * 1.2 : 3.6), 'linear']]);
    K(l, 'rotation', [[time, Math.cos(phase) * 3.5, 'linear']]);
  }
  K(l, 'scale', [[11.4, 4.6], [14.4, 4.6, 'hold'], [15.2, .15, 'ease_in']]);
  K(l, 'x', [[11.4, l.x], [14.4, l.x, 'hold'], [15.2, 50 + (l.x - 50) * .2, 'ease_in']]);
  fade(l, [[11.4, 1], [14.85, 1], [15.25, 0]]);
}
for (let i = 0; i < 9; i++) {
  const l = A(`Rhythm / bar ${i + 1}`, rect(i % 2 ? PAPER : RED, 30, 140, 15), 11.4, 15.4, 26 + i * 6, 71, 2.35, 19.45);
  for (let j = 0; j <= 16; j++) {
    const time = 11.4 + j * .1875, value = .25 + .75 * Math.abs(Math.sin(j * 1.1 - i * .5));
    K(l, 'scale', [[time, value, 'ease_in_out']]);
  }
  fade(l, [[11.4, 0], [11.7, 1], [14.5, 1], [15.4, 0]]);
}
// The recurring circular form becomes the final punctuation, linking the
// rhythm passage to the closing lockup rather than cutting to a title card.
const dot = A('Final / travelling dot', svg(`<circle cx="360" cy="360" r="320" fill="${RED}"/>`), 14.8, 20, 18, 72, 3.6, 6.4);
for (let j = 0; j <= 16; j++) {
  const u = j / 16, t = 14.8 + u * 1.65;
  K(dot, 'x', [[t, 18 + u * 58, 'linear']]); K(dot, 'y', [[t, 72 - 8 * u - 36 * Math.sin(Math.PI * u), 'linear']]);
}
K(dot, 'scale', [[14.8, .1], [15.1, 1], [16.45, 1, 'hold'], [16.62, 1.3, 'ease_out'], [16.9, 1], [20, 1, 'hold']]);
const move = T('move-final', 'MOVE', 15, 20, 48, 38, 4.8);
K(move, 'x', [[15, 18], [16.1, 48]]); K(move, 'rotation', [[15, -12], [16.1, 0, 'bezier', snap]]);
K(move, 'scale', [[15, 2], [16.1, 4.8, 'bezier', snap]]); fade(move, [[15, 0], [15.25, 1]]);
const different = T('different-final', 'DIFFERENT', 15.5, 20, 48, 60, 3.35, PAPER);
K(different, 'y', [[15.5, 82], [16.45, 60, 'bezier', snap]]); K(different, 'rotation', [[15.5, 8], [16.45, 0]]);
fade(different, [[15.5, 0], [15.8, 1]]);
const underline = A('Final / underline', rect(RED, 1000, 8, 4), 16.4, 20, 50, 76, 76, 1.12);
K(underline, 'scale', [[16.4, .1], [17.15, 1, 'bezier', snap]]);
fade(underline, [[16.4, 0], [16.55, 1]]);
const last = T('final-signature', 'BREAK THE LOOP.', 17, 20, 50, 84, .5, MUTED, { fontWeight: 600 });
K(last, 'y', [[17, 88], [17.55, 84]]); fade(last, [[17, 0], [17.55, 1]]);
const packageSpec = { format: 'autopromote-graphics', version: 1, name: 'BREAK THE LOOP — authored motion', width: 1280, height: 720, duration: 20, layers, groups };
fs.writeFileSync(path.join(root, 'assets/break-the-loop.graphics.json'), JSON.stringify(packageSpec, null, 2));
fs.writeFileSync(path.join(root, 'design.json'), JSON.stringify({ idea: 'A repeating circular system breaks on an impact, becomes an individual rhythm, and resolves as punctuation.',
  beats: [{ time: 0, action: 'Repetition / accelerating circular typography' }, { time: 3.92, action: 'Impact / circular fragments and interlocking letters' },
    { time: 6, action: 'BREAK THE LOOP resolves' }, { time: 8.1, action: 'Connected slash into changing modular layout' },
    { time: 11.4, action: 'Word enlarges into a travelling typographic wave and equalizer' },
    { time: 14.8, action: 'Circle carries movement into final punctuation' }, { time: 17.55, action: 'Quiet final lockup / readable landing' }],
  layers: layers.length, groups: groups.length, keys: [...layers, ...groups].reduce((n, l) => n + l.keys.length, 0), noExternalRenderer: true, nativeImportRequired: true }, null, 2));
console.log(`Authored ${layers.length} ordinary layers, ${groups.length} groups.`);
