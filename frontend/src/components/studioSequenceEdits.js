import { secondsToTicks, ticksToSeconds } from './studioTime';
import { reconcileStudioDocument, projectStudioEditableStateToSnapshot } from './studioProjectDocument';
import { createStudioCommandInverse } from './studioCommandHistory';
import { rippleStudioSnapshotLinkedTimeline } from './studioTrimTransaction';
import { sliceStudioAutomation } from './studioAutomationSlice';
import { buildAudioSplitSequence } from './studioAudioSplit';

const tick = value => {
  if (!Number.isFinite(Number(value))) throw Error('Edit timing must be a finite number.');
  return Math.sign(Number(value)) * secondsToTicks(Math.abs(Number(value)));
};
const seconds = value => Math.sign(value) * ticksToSeconds(Math.abs(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const sequenceWindow = clip => {
  const start = tick(clip.startRequest ?? clip.start_time ?? 0);
  const end = tick(clip.endRequest ?? clip.end_time ?? clip.duration);
  if (start < 0 || end <= start) throw Error('Wait for valid source timing before editing.');
  return { start, end, duration: end - start };
};
const offsets = timeline => {
  let start = 0;
  return timeline.map(clip => { const at = start; start += sequenceWindow(clip).duration; return at; });
};
const sourceEnd = (snapshot, clip) => {
  const id = clip.sourceClipId || clip.id;
  const matches = [...(snapshot.timeline || []), ...(snapshot.projectMedia || []), ...(snapshot.orderedClips || [])]
    .filter(item => (item.sourceClipId || item.id) === id);
  const lengths = matches.map(item => Number(item.sourceDuration)).filter(value => Number.isFinite(value) && value > 0);
  // Without decoder metadata the known retained range is the safe bound.
  return Math.max(sequenceWindow(clip).end, ...lengths.map(tick));
};
const trackFor = { overlays: 'graphics', soundEffects: 'sfx', voiceovers: 'voiceover',
  adjustmentLayers: 'adjustment', motionScenes: 'motion', threeDScenes: 'motion' };

// Inserting newly exposed source frames leaves room in the programme. Existing
// cues keep their media phase and continuation keys on either side of that room.
export function insertStudioProgrammeTime(snapshot, atTick, durationTick, createId) {
  const at = ticksToSeconds(atTick), duration = ticksToSeconds(durationTick);
  if (durationTick <= 0) return snapshot;
  const result = { ...snapshot }, replacements = new Map(), split = new Map();
  for (const field of Object.keys(trackFor)) {
    if (!Array.isArray(snapshot[field])) continue;
    result[field] = snapshot[field].flatMap(item => {
      const start = Number(item.startTime || 0), end = start + Number(item.duration || 0);
      if (start >= at) return [{ ...item, startTime: start + duration,
        ...(Number.isFinite(item.endTime) ? { endTime: item.endTime + duration } : {}),
        ...(item.keyframes ? { keyframes: item.keyframes.map(key => ({ ...key, time: key.time + duration })) } : {}) }];
      if (end <= at) return [item];
      // Procedural scenes are duration-driven. Extend their declared span and
      // shift internal keys/cues, preserving their single canonical identity.
      if (field === 'motionScenes' || field === 'threeDScenes') return [{ ...item,
        duration: item.duration + duration,
        ...(Number.isFinite(item.endTime) ? { endTime: item.endTime + duration } : {}),
        ...(Number.isFinite(item.soundOffset) && start + item.soundOffset >= at
          ? { soundOffset: item.soundOffset + duration } : {}),
        ...(item.keyframes ? { keyframes: item.keyframes.map(key => key.time >= at ? { ...key, time: key.time + duration } : key) } : {}) }];
      const rightId = createId();
      replacements.set(item.id, [item.id, rightId]); split.set(item.id, rightId);
      return [{ ...item, duration: at - start }, { ...item, id: rightId, startTime: at + duration,
        duration: end - at,
        ...(item.type === 'video' ? { sourceStartTime: Number(item.sourceStartTime || 0) + at - start } : {}),
        ...(item.trimStart !== undefined ? { trimStart: Number(item.trimStart || 0) + at - start } : {}) }];
    });
  }
  if (snapshot.compositionOrder) result.compositionOrder = snapshot.compositionOrder.flatMap(id => replacements.get(id) || [id]);
  if (snapshot.compoundClips) result.compoundClips = snapshot.compoundClips.map(group => ({ ...group,
    ...(group.layerIds ? { layerIds: group.layerIds.flatMap(id => replacements.get(id) || [id]) } : {}),
    ...(group.timing ? { timing: { ...group.timing,
      startTime: group.timing.startTime >= at ? group.timing.startTime + duration : group.timing.startTime,
      duration: group.timing.startTime < at && group.timing.startTime + group.timing.duration > at
        ? group.timing.duration + duration : group.timing.duration } } : {}) }));
  const shiftKeys = keys => (keys || []).map(key => key.time >= at ? { ...key, time: key.time + duration } : key);
  for (const field of ['speedKeyframes', 'finishKeyframes', 'reframeKeyframes', 'reframeModeCuts', 'speakerFocusCuts'])
    if (snapshot[field]) result[field] = shiftKeys(snapshot[field]);
  if (snapshot.motionKeyframes) {
    result.motionKeyframes = shiftKeys(snapshot.motionKeyframes.filter(key => !split.has(key.targetId)));
    for (const [id, rightId] of split) {
      const keys = snapshot.motionKeyframes.filter(key => key.targetId === id);
      result.motionKeyframes.push(...sliceStudioAutomation(keys, { end: at, createId }),
        ...sliceStudioAutomation(keys, { start: at, offset: -duration, createId })
          .map(key => ({ ...key, id: createId(), targetId: rightId })));
    }
  }
  if (snapshot.audioKeyframes) result.audioKeyframes = Object.fromEntries(Object.entries(snapshot.audioKeyframes).map(([bus, keys]) => [bus, shiftKeys(keys)]));
  if (snapshot.speakerStackFraming) result.speakerStackFraming = Object.fromEntries(Object.entries(snapshot.speakerStackFraming).map(([slot, frame]) => [slot,
    frame && typeof frame === 'object' ? { ...frame, ...Object.fromEntries(['keyframes', 'sourceTimeOffsetKeyframes', 'source_time_offset_keyframes']
      .filter(field => Array.isArray(frame[field])).map(field => [field, shiftKeys(frame[field])])) } : frame]));
  return result;
}

const assertRippleLocks = (before, after) => {
  for (const [field, track] of Object.entries(trackFor)) {
    const changed = (before[field] || []).filter(item => {
      const next = (after[field] || []).find(candidate => candidate.id === item.id);
      return JSON.stringify(next) !== JSON.stringify(item);
    });
    if (changed.some(item => before.trackStates?.[field === 'overlays' && (item.bRollMode || ['image', 'video'].includes(item.type)) ? 'broll' : track]?.locked))
      throw Error('Unlock the affected tracks before rippling their clips.');
  }
};

export function editStudioSequence(snapshot, request) {
  const timeline = snapshot.timeline || [];
  const sourceAudio = buildAudioSplitSequence(timeline);
  const index = timeline.findIndex(clip => String(clip.id) === String(request.clipId));
  if (index < 0) throw Error('Select an existing source clip.');
  const audio = ['jcut', 'lcut', 'audio-trim', 'audio-reset'].includes(request.mode);
  if (snapshot.trackStates?.[audio ? 'originalAudio' : 'video']?.locked ||
      (!audio && snapshot.linkedSelection !== false && snapshot.trackStates?.originalAudio?.locked))
    throw Error('Unlock the affected video/audio tracks before editing.');
  const windows = timeline.map(sequenceWindow), beforeOffsets = offsets(timeline);
  const min = Math.max(1, tick(request.minimumDuration || 1 / 30));
  const clip = timeline[index], current = windows[index];
  let delta = tick(request.delta ?? 0), edits = new Map(), programmeChange = null;
  const set = (i, start, end) => edits.set(i, { start, end });
  if (request.expectedRanges && request.expectedRanges.some(expected => {
    const i = timeline.findIndex(item => String(item.id) === String(expected.id));
    return i < 0 || windows[i].start !== expected.start || windows[i].end !== expected.end;
  })) throw Error('The source ranges changed during the drag. Try the edit again.');
  const affected = new Set([index]);
  if (request.mode === 'roll') affected.add(request.edge === 'start' ? index - 1 : index + 1);
  if (request.mode === 'slide') { affected.add(index - 1); affected.add(index + 1); }
  if ([...affected].some(i => i < 0 || i >= timeline.length))
    throw Error(request.mode === 'slide' ? 'Slide needs a clip on both sides.' : 'Roll needs an adjacent clip at this edge.');
  const ids = new Set([...affected].map(i => String(timeline[i].id)));
  if (snapshot.studioDocument?.constraints?.locks?.some(lock => ids.has(lock.occurrenceId)))
    throw Error('This edit touches a preserved source range.');
  if (request.mode === 'slip') {
    delta = clamp(delta, -current.start, sourceEnd(snapshot, clip) - current.end);
    set(index, current.start + delta, current.end + delta);
  } else if (request.mode === 'ripple') {
    if (request.edge === 'start') {
      delta = clamp(delta, -current.start, current.duration - min);
      set(index, current.start + delta, current.end);
      programmeChange = delta > 0 ? { from: beforeOffsets[index], to: beforeOffsets[index] + delta }
        : { insert: beforeOffsets[index], duration: -delta };
    } else {
      delta = clamp(delta, min - current.duration, sourceEnd(snapshot, clip) - current.end);
      set(index, current.start, current.end + delta);
      programmeChange = delta < 0 ? { from: beforeOffsets[index] + current.duration + delta, to: beforeOffsets[index] + current.duration }
        : { insert: beforeOffsets[index] + current.duration, duration: delta };
    }
  } else if (request.mode === 'roll') {
    const left = request.edge === 'start' ? index - 1 : index, right = left + 1;
    const a = windows[left], b = windows[right];
    delta = clamp(delta, Math.max(min - a.duration, -b.start),
      Math.min(sourceEnd(snapshot, timeline[left]) - a.end, b.duration - min));
    set(left, a.start, a.end + delta); set(right, b.start + delta, b.end);
  } else if (request.mode === 'slide') {
    const a = windows[index - 1], b = windows[index + 1];
    delta = clamp(delta, Math.max(min - a.duration, -b.start),
      Math.min(sourceEnd(snapshot, timeline[index - 1]) - a.end, b.duration - min));
    set(index - 1, a.start, a.end + delta); set(index + 1, b.start + delta, b.end);
  } else if (!audio) throw Error('Unknown sequence edit tool.');
  if (!audio && !delta) throw Error('Source boundary reached; no edit was made.');
  let next = { ...snapshot, timeline: timeline.map((item, i) => edits.has(i) ? { ...item,
    startRequest: ticksToSeconds(edits.get(i).start), endRequest: ticksToSeconds(edits.get(i).end),
    duration: ticksToSeconds(edits.get(i).end - edits.get(i).start) } : item) };
  let sequence = 0;
  const createId = () => `insert:${request.id}:${++sequence}`;
  if (programmeChange && snapshot.rippleMode !== false) {
    next = programmeChange.insert !== undefined
      ? insertStudioProgrammeTime(next, programmeChange.insert, programmeChange.duration, createId)
      : rippleStudioSnapshotLinkedTimeline(next, { fromTick: programmeChange.from, toTick: programmeChange.to }, request.id);
    assertRippleLocks(snapshot, next);
  }
  // Unlinked edits retain independent source audio at its original programme
  // position. The ordinary audio track and final mixer consume these fields.
  if (!audio && snapshot.linkedSelection === false) next.timeline = next.timeline.map((item, i) => {
    if (!affected.has(i) || item.audioDetached) return item;
    const old = sourceAudio[i], w = windows[i];
    return { ...item, audioDetached: true, audioSourceStart: ticksToSeconds(w.start) + old.audioTrimOffsetStart,
      audioSourceEnd: ticksToSeconds(w.end) + old.audioTrimOffsetEnd,
      audioProgrammeStart: old.audioTimelineStart };
  });
  if (audio) {
    const total = beforeOffsets.at(-1) + windows.at(-1).duration;
    const w = current, at = beforeOffsets[index];
    const oldStart = tick(sourceAudio[index].audioTrimOffsetStart), oldEnd = tick(sourceAudio[index].audioTrimOffsetEnd);
    const startOffset = request.mode === 'audio-reset' ? 0 : request.mode === 'audio-trim' ? tick(request.offsets.audioTrimOffsetStart ?? seconds(oldStart))
      : oldStart + (request.mode === 'jcut' ? delta : 0);
    const endOffset = request.mode === 'audio-reset' ? 0 : request.mode === 'audio-trim' ? tick(request.offsets.audioTrimOffsetEnd ?? seconds(oldEnd))
      : oldEnd + (request.mode === 'lcut' ? delta : 0);
    const boundedStart = clamp(startOffset, -Math.min(at, w.start, tick(3)), w.duration - min);
    const boundedEnd = clamp(endOffset, boundedStart - w.duration + min,
      Math.min(tick(3), sourceEnd(snapshot, clip) - w.end, total - at - w.duration));
    if (!clip.audioDetached && boundedStart === tick(clip.audioTrimOffsetStart || 0) && boundedEnd === tick(clip.audioTrimOffsetEnd || 0))
      throw Error('Audio boundary reached; no edit was made.');
    let edited;
    if (clip.audioDetached && request.mode !== 'audio-reset') {
      const startDelta = startOffset - oldStart, endDelta = endOffset - oldEnd;
      const oldAudioStart = tick(clip.audioSourceStart), oldAudioEnd = tick(clip.audioSourceEnd), oldPlacement = tick(clip.audioProgrammeStart);
      const newStart = clamp(oldAudioStart + startDelta, Math.max(0, oldAudioStart - oldPlacement), oldAudioEnd - min);
      const newPlacement = oldPlacement + newStart - oldAudioStart;
      const newEnd = clamp(oldAudioEnd + endDelta, newStart + min,
        Math.min(sourceEnd(snapshot, clip), newStart + total - newPlacement));
      edited = { ...clip, audioSourceStart: seconds(newStart), audioSourceEnd: seconds(newEnd), audioProgrammeStart: seconds(newPlacement) };
    } else {
      edited = { ...clip, audioTrimOffsetStart: seconds(boundedStart), audioTrimOffsetEnd: seconds(boundedEnd) };
      for (const field of ['audioDetached', 'audioSourceStart', 'audioSourceEnd', 'audioProgrammeStart']) delete edited[field];
    }
    next.timeline = timeline.map((item, i) => i === index ? edited : item);
    if (JSON.stringify(next.timeline) === JSON.stringify(timeline)) throw Error('Audio boundary reached; no edit was made.');
  }
  const document = reconcileStudioDocument({ snapshot: next, projectId: snapshot.studioDocument.projectId,
    storedDocument: snapshot.studioDocument });
  document.journal = [...snapshot.studioDocument.journal, { journalId: `revision:${document.revision}`,
    baseRevision: snapshot.studioDocument.revision, newRevision: document.revision,
    actor: { type: 'human', id: 'studio-sequence-ui' }, operations: [{ type: 'sequence_edit', mode: request.mode,
      clipId: String(clip.id), edge: request.edge, deltaTick: delta }], affectedNodes: [...ids],
    inverse: createStudioCommandInverse(snapshot.studioDocument, document) }];
  next = projectStudioEditableStateToSnapshot(document, { ...next, studioDocument: document });
  return { snapshot: next, document, index, delta: seconds(delta) };
}

// Programme removal is shared by marked cuts, transcript/filler cuts, silence
// cutting and clip deletion. Transcript cues remain in source time: the existing
// caption compiler maps them through the retained occurrences exactly once.
export function removeStudioProgrammeRanges(snapshot, ranges, id, options = {}) {
  if (snapshot.trackStates?.video?.locked || snapshot.trackStates?.originalAudio?.locked)
    throw Error('Unlock video and original audio before removing programme time.');
  const total = snapshot.timeline.reduce((sum, clip) => sum + sequenceWindow(clip).duration, 0);
  const merged = [];
  for (const range of ranges.map(range => ({ from:clamp(tick(range.start),0,total), to:clamp(tick(range.end),0,total) }))
    .filter(range => range.to > range.from).sort((a,b)=>a.from-b.from)) {
    const previous=merged.at(-1);
    if (previous && previous.to >= range.from) previous.to=Math.max(previous.to,range.to); else merged.push({...range});
  }
  const removed = merged.reduce((sum,range)=>sum+range.to-range.from,0);
  const minimum=tick((Number(snapshot.previewSpeed)||1)/(Number(snapshot.exportSettings?.fps)||30));
  if (!removed || total-removed<minimum) throw Error('Keep at least one frame of video outside the removed ranges.');
  if (snapshot.timeline.some(clip=>clip.audioDetached))
    throw Error('Use Straight Cut to relink detached source audio before removing programme time.');
  let next={...snapshot}, sequence=0;
  for (const range of [...merged].reverse()) {
    let elapsed=0;
    const timeline=next.timeline.flatMap(clip=>{
      const w=sequenceWindow(clip), at=elapsed; elapsed+=w.duration;
      if (range.to<=at || range.from>=elapsed) return [clip];
      if (snapshot.studioDocument.constraints.locks.some(lock=>lock.occurrenceId===String(clip.id)))
        throw Error('The cut touches a preserved source range.');
      const left=Math.max(0,range.from-at), right=Math.min(w.duration,range.to-at);
      if ((left>0 && left<minimum) || (right<w.duration && w.duration-right<minimum))
        throw Error('Leave at least one full frame at the cut boundary.');
      const pieces=[];
      if (left>0) pieces.push({...clip,sourceClipId:clip.sourceClipId||clip.id,endRequest:seconds(w.start+left),duration:seconds(left),
        ...(options.transition ? {transitionOut:options.transition,transitionDuration:options.transitionDuration} : {})});
      if (right<w.duration) pieces.push({...clip,id:pieces.length?`kept:${id}:${++sequence}`:clip.id,
        sourceClipId:clip.sourceClipId||clip.id,startRequest:seconds(w.start+right),duration:seconds(w.duration-right),
        ...(options.transition ? {transitionIn:options.transition,transitionDuration:options.transitionDuration} : {})});
      return pieces;
    });
    next=rippleStudioSnapshotLinkedTimeline({...next,timeline},{fromTick:range.from,toTick:range.to},`${id}:${sequence}`);
    assertRippleLocks(snapshot,next);
  }
  const document=reconcileStudioDocument({snapshot:next,projectId:snapshot.studioDocument.projectId,storedDocument:snapshot.studioDocument});
  document.journal=[...snapshot.studioDocument.journal,{journalId:`revision:${document.revision}`,
    baseRevision:snapshot.studioDocument.revision,newRevision:document.revision,actor:{type:'human',id:'studio-sequence-ui'},
    operations:[{type:'remove_programme_ranges',ranges:merged}],affectedNodes:snapshot.timeline.map(clip=>String(clip.id)),
    inverse:createStudioCommandInverse(snapshot.studioDocument,document)}];
  return {document,snapshot:projectStudioEditableStateToSnapshot(document,{...next,studioDocument:document}),removed:seconds(removed),ranges:merged};
}
