#!/usr/bin/env node
// Diagnose real cue callbacks using owned source/trim clocks, not the sampled
// UI slider. Callback timing does not prove audible onset or waveform parity.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { hash } = require('../../src/creativeTemplates/contract');
const [projectFile, captureFolder] = process.argv.slice(2);
const project = JSON.parse(fs.readFileSync(projectFile));
const snapshot = project.snapshot;
const document = snapshot.studioDocument;
const receipt = JSON.parse(fs.readFileSync(path.join(captureFolder, 'native-preview-mix.json')));
assert.equal(receipt.projectId, project.id);
assert.equal(receipt.canonicalHash, hash(document));
let offset = 0;
const clips = new Map(snapshot.timeline.map(clip => {
  const start = Number(clip.startRequest ?? clip.startTime ?? 0);
  const end = Number(clip.endRequest ?? clip.endTime ?? clip.duration);
  const pair = [clip.id, { offset, start }];
  offset += end - start; return pair;
}));
function programme(row) {
  const clip = clips.get(row.nativeClipId);
  return clip && Number.isFinite(row.sourceTime) ? clip.offset + row.sourceTime - clip.start : null;
}
function output(time) {
  const tick = Math.max(0, Math.round(time * 90000));
  const map = document.outputTimeMap;
  const segment = map.find(item => tick >= item.programmeRange.startTick && tick < item.programmeRange.endTick)
    || map.at(-1);
  const bounded = Math.min(segment.programmeRange.endTick, Math.max(segment.programmeRange.startTick, tick));
  return (segment.outputRange.startTick + Math.round((bounded - segment.programmeRange.startTick)
    * segment.rateDenominator / segment.rateNumerator)) / 90000;
}
const cues = snapshot.soundEffects.filter(cue => cue.enabled !== false);
const matched = new Map(cues.map(cue => [cue.id, []]));
const unmatched = [];
for (const row of receipt.starts) {
  if (row.type === 'capture-error' || (row.type === 'buffer' && row.duration > 20)) continue;
  const at = programme(row);
  if (at === null) { unmatched.push({ type: row.type, reason: 'No owned source clock' }); continue; }
  let cue;
  if (row.type === 'media') cue = cues.find(cue => row.identity === `sound-effect-audio-${cue.id}`);
  else {
    const candidates = cues.filter(cue => cue.builtIn && Math.abs(cue.duration - row.duration) < .0001)
      .map(cue => ({ cue, error: Math.abs(at - row.offset - cue.startTime) }))
      .sort((a, b) => a.error - b.error);
    // Exact duration plus inferred start identifies these particular built-in
    // cues. An ambiguous/unmatched observation never grants coverage.
    if (candidates[0]?.error <= 1 / 24 && (!candidates[1] || candidates[1].error > 1 / 24)) cue = candidates[0].cue;
  }
  if (!cue) { unmatched.push({ type: row.type, programmeTime: at, duration: row.duration }); continue; }
  const offsetIntoCue = Number(row.offset || 0) - Number(cue.trimStart || 0);
  matched.get(cue.id).push({ programmeTime: at, deliveryTime: output(at), offsetIntoCue,
    callbackPositionDifferenceSeconds: output(at) - output(cue.startTime + offsetIntoCue),
    elapsedProgrammeSeconds: at - cue.startTime, rate: row.playbackRate,
    scheduledDelaySeconds: row.scheduledDelay ?? null, preservesPitch: row.preservesPitch ?? null });
}
const results = cues.map(cue => {
  const starts = matched.get(cue.id);
  return { cueId: cue.id, name: cue.name, builtIn: !!cue.builtIn,
    programmeStart: cue.startTime, mappedDeliveryStart: output(cue.startTime),
    callbacks: starts.length, starts,
    firstCallbackDelaySeconds: starts.length ? starts[0].deliveryTime - output(cue.startTime) : null };
});
const result = { at: new Date().toISOString(), projectId: project.id, canonicalHash: receipt.canonicalHash,
  scope: 'Actual cue start/resume callbacks paired with canonical source/programme/output clocks. Not audible-onset, full signal, pitch, VO or listening approval.',
  enabledCues: cues.length, observedCues: results.filter(cue => cue.callbacks > 0).length,
  builtInCallbacks: results.filter(cue => cue.builtIn).reduce((n, cue) => n + cue.callbacks, 0),
  importedCallbacks: results.filter(cue => !cue.builtIn).reduce((n, cue) => n + cue.callbacks, 0),
  unmatched, cues: results,
  callbacksLaterThanOnePictureFrame: results.filter(cue => cue.firstCallbackDelaySeconds > 1 / 24).map(cue => cue.cueId),
  maximumCallbackPositionDifferenceSeconds: Math.max(0, ...results.flatMap(cue => cue.starts.map(start => Math.abs(start.callbackPositionDifferenceSeconds)))),
  noNewRender: true, wholeSoundParity: 'UNQUALIFIED', humanListening: false };
fs.writeFileSync(path.join(captureFolder, 'cue-clock-comparison.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ enabled: result.enabledCues, observed: result.observedCues,
  builtInCallbacks: result.builtInCallbacks, importedCallbacks: result.importedCallbacks,
  unmatched: unmatched.length, lateFirstCallbacks: result.callbacksLaterThanOnePictureFrame.length,
  maximumPositionDifference: result.maximumCallbackPositionDifferenceSeconds }));
