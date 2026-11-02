const fs = require('node:fs'), path = require('node:path');
const folder = path.resolve(process.argv[2]), asset = process.argv[3];
const profile = JSON.parse(fs.readFileSync(path.join(folder, 'cpu-profile.private.json')));
const playback = JSON.parse(fs.readFileSync(path.join(folder, 'playback.json')));
const source = fs.readFileSync(asset, 'utf8').split('\n');
const weights = new Map(), nodes = new Map(profile.nodes.map(n => [n.id, n]));
profile.samples.forEach((id, i) => weights.set(id, (weights.get(id) || 0) + profile.timeDeltas[i]));
const functions = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, us]) => {
  const frame = nodes.get(id).callFrame, line = source[frame.lineNumber] || '';
  return { seconds: us / 1e6, name: frame.functionName,
    column: frame.columnNumber, snippet: line.slice(Math.max(0, frame.columnNumber - 50), frame.columnNumber + 210) };
});
const transitions = [];
let previous;
for (const sample of playback.samples) {
  const active = sample.videos.find(v => v.slot === 'studio-after-video');
  if (active?.source !== previous) { transitions.push({ seconds: sample.ms / 1000, programme: sample.programme, ...active }); previous = active?.source; }
}
const result = { complete: playback.complete, elapsedSeconds: playback.elapsedMs / 1000,
  terminal: playback.terminal, longTasks: { count: playback.longTasks.length,
    seconds: playback.longTasks.reduce((sum, v) => sum + v.duration, 0) / 1000,
    longestMs: Math.max(0, ...playback.longTasks.map(v => v.duration)) }, functions, transitions };
fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
