import { editStudioSequence, removeStudioProgrammeRanges } from '../studioSequenceEdits';
import { adaptStudioSnapshotToDocument, reconcileStudioDocument, projectStudioEditableStateToSnapshot } from '../studioProjectDocument';
import { compileStudioTimelineForRender, compileStudioCompositionForRender } from '../studioRenderCompiler';
import { buildAudioSplitSequence, calculateAudioProxyState } from '../studioAudioSplit';
import { undoStudioCommandBatch } from '../studioCommands';

const fixture = () => {
  const snapshot = { timeline: [['a', 1, 5], ['b', 3, 7], ['c', 2, 8]].map(([id, startRequest, endRequest]) => ({
    id, sourceClipId: id, sourceDuration: 20, startRequest, endRequest,
    url: `https://example.com/${id}.mp4` })), orderedClips: [], overlays: [], motionScenes: [], threeDScenes: [],
    soundEffects: [], voiceovers: [], adjustmentLayers: [], compoundClips: [], motionKeyframes: [],
    speedKeyframes: [], finishKeyframes: [], trackStates: {}, linkedSelection: true, rippleMode: true };
  snapshot.studioDocument = adaptStudioSnapshotToDocument({ snapshot, projectId: 'sequence' });
  return snapshot;
};
const edit = (snapshot, mode, delta, rest = {}) => editStudioSequence(snapshot,
  { id: 'test', clipId: 'b', mode, edge: 'end', delta, minimumDuration: 1 / 24, ...rest });
const ranges = result => result.snapshot.timeline.map(clip => [clip.startRequest, clip.endRequest]);
const length = result => result.document.clipOccurrences.at(-1).programmeRange.endTick / 90000;

test.each([
  ['slip', 2, [[1,5],[5,9],[2,8]], 14],
  ['roll', 1, [[1,5],[3,8],[3,8]], 14],
  ['slide', 1, [[1,6],[3,7],[3,8]], 14],
  ['ripple', -1, [[1,5],[3,6],[2,8]], 13],
  ['ripple', 1, [[1,5],[3,8],[2,8]], 15],
])('%s changes source ranges with the correct programme duration', (mode, delta, expected, total) => {
  const before = fixture(), result = edit(before, mode, delta);
  expect(ranges(result)).toEqual(expected); expect(length(result)).toBe(total);
  expect(before.timeline[1].endRequest).toBe(7);
  expect(result.document.revision).toBe(before.studioDocument.revision + 1);
  const restored = JSON.parse(JSON.stringify(result.snapshot));
  const doc = reconcileStudioDocument({ snapshot: restored, projectId: 'sequence', storedDocument: restored.studioDocument });
  expect(doc).toEqual(result.document);
  expect(compileStudioTimelineForRender(doc).map(clip => [clip.start_time, clip.end_time])).toEqual(expected);
});

test('roll at an incoming edge edits the previous out and selected in equally', () => {
  const result = edit(fixture(), 'roll', 1, { edge: 'start' });
  expect(ranges(result)).toEqual([[1,6],[4,7],[2,8]]); expect(length(result)).toBe(14);
});

test('ripple start removes programme time and shifts linked cues', () => {
  const source = fixture(); source.soundEffects = [{ id: 'cue', startTime: 9, duration: 1, volume: 1, url: 'https://example.com/cue.wav' }];
  source.studioDocument = reconcileStudioDocument({ snapshot: source, projectId: 'sequence' });
  const result = edit(source, 'ripple', 1, { edge: 'start' });
  expect(ranges(result)[1]).toEqual([4,7]); expect(length(result)).toBe(13);
  expect(result.snapshot.soundEffects[0].startTime).toBe(8);
});

test('inserting exposed source frames preserves split video media phase and canonical animation', () => {
  const source = fixture();
  source.overlays = [{ id: 'overlay', type: 'video', src: 'https://example.com/overlay.mp4', sourceDuration: 20,
    startTime: 7, duration: 3, sourceStartTime: 5, x: 50, y: 50, width: 40, height: 40 }];
  source.compositionOrder = ['overlay'];
  source.motionKeyframes = [{ id:'x0', targetId:'overlay', property:'x', time:7, value:10 },
    { id:'x1', targetId:'overlay', property:'x', time:10, value:70, easing:'linear' }];
  source.studioDocument = reconcileStudioDocument({ snapshot: source, projectId: 'sequence' });
  const result = edit(source, 'ripple', 1);
  expect(result.snapshot.overlays.map(item => [item.startTime,item.duration,item.sourceStartTime])).toEqual([[7,1,5],[9,2,6]]);
  const right = result.snapshot.overlays[1];
  expect(result.snapshot.compositionOrder).toEqual(['overlay',right.id]);
  expect(result.snapshot.motionKeyframes.find(key => key.targetId === right.id && key.time === 9).value).toBeCloseTo(30);
  expect(compileStudioCompositionForRender(result.document).layers.map(layer => layer.id)).toEqual(['main-video','overlay',right.id]);
});

test('Ripple tracks off preserves independent programme cues', () => {
  const source = fixture(); source.rippleMode = false;
  source.soundEffects = [{ id: 'cue', startTime: 9, duration: 1, url: 'https://example.com/cue.wav' }];
  const result = edit(source,'ripple',-1);
  expect(result.snapshot.soundEffects[0].startTime).toBe(9);
});

test.each(['slip','roll','slide','ripple'])('%s clamps a drag consistently to available source handles', mode => {
  const source = fixture(), result = edit(source, mode, 100);
  for (const clip of result.snapshot.timeline) {
    expect(clip.startRequest).toBeGreaterThanOrEqual(0); expect(clip.endRequest).toBeLessThanOrEqual(20);
    expect(clip.endRequest - clip.startRequest).toBeGreaterThanOrEqual(1/24 - 1/90000);
  }
  if (mode !== 'ripple') expect(length(result)).toBe(14);
});

test.each(['video','originalAudio'])('linked editing rejects a locked %s track without mutations', track => {
  const source = fixture(); source.trackStates[track] = { locked:true };
  const before = JSON.stringify(source);
  expect(() => edit(source,'slide',1)).toThrow(/Unlock/); expect(JSON.stringify(source)).toBe(before);
});

test('stale source gesture and missing slide neighbors fail before mutation', () => {
  expect(() => edit(fixture(),'slide',1,{clipId:'a'})).toThrow(/both sides/);
  expect(() => edit(fixture(),'roll',1,{clipId:'c'})).toThrow(/adjacent/);
  expect(() => edit(fixture(),'slip',1,{expectedRanges:[{id:'b',start:0,end:1}]})).toThrow(/changed/);
});

test('J/L buttons write the rendered fields and share source/programme bounds', () => {
  const result = edit(fixture(),'jcut',-1);
  const clip = result.snapshot.timeline[1];
  expect(clip.audioTrimOffsetStart).toBe(-1); expect(clip.audioStartOffset).toBeUndefined();
  expect(compileStudioTimelineForRender(result.document)[1].audioTrimOffsetStart).toBe(-1);
  const clips = buildAudioSplitSequence(result.snapshot.timeline);
  expect(calculateAudioProxyState(3.5,clips,0)).toEqual([expect.objectContaining({ sourceSeekTime:2.5, type:'j-cut' })]);
  expect(() => edit(fixture(),'audio-trim',0,{clipId:'a',offsets:{audioTrimOffsetStart:-3}})).toThrow(/boundary/);
  expect(edit(fixture(),'lcut',100).snapshot.timeline[1].audioTrimOffsetEnd).toBe(3);
});

test('unlinked slip keeps original audio source and programme placement through recovery and export', () => {
  const source=fixture(); source.linkedSelection=false;
  const result=edit(source,'slip',2), clip=result.snapshot.timeline[1];
  expect([clip.startRequest,clip.endRequest]).toEqual([5,9]);
  expect(clip).toMatchObject({audioDetached:true,audioSourceStart:3,audioSourceEnd:7,audioProgrammeStart:4});
  expect(calculateAudioProxyState(5,buildAudioSplitSequence(result.snapshot.timeline),1))
    .toEqual([expect.objectContaining({sourceSeekTime:4})]);
  const restored=projectStudioEditableStateToSnapshot(result.document,JSON.parse(JSON.stringify(result.snapshot)));
  expect(restored.timeline[1]).toMatchObject({audioDetached:true,audioSourceStart:3,audioSourceEnd:7,audioProgrammeStart:4});
  expect(compileStudioTimelineForRender(result.document)[1].audioSourceStart).toBe(3);
});

test('canonical undo restores the entire sequence transaction', () => {
  const before=fixture(), result=edit(before,'slide',1);
  const undone=undoStudioCommandBatch(result.document,{baseRevision:result.document.revision,
    actor:{type:'human',id:'test'},idempotencyKey:'undo-sequence'});
  expect(undone.document.clipOccurrences).toEqual(before.studioDocument.clipOccurrences);
});

test('overlapping programme removals merge, retain source identity and never retime source captions twice', () => {
  const source=fixture(); source.captionSegments=[{id:'cue',sourceClipId:'b',start:4,end:6,text:'Retained words'}];
  source.studioDocument=reconcileStudioDocument({snapshot:source,projectId:'sequence'});
  const result=removeStudioProgrammeRanges(source,[{start:4,end:5},{start:4.5,end:6}],'remove');
  expect(result.removed).toBe(2);expect(length(result)).toBe(12);
  expect(result.snapshot.timeline.map(clip=>[clip.sourceClipId,clip.startRequest,clip.endRequest])).toEqual([['a',1,5],['b',5,7],['c',2,8]]);
  expect(result.snapshot.captionSegments.map(cue=>({id:cue.id,sourceClipId:cue.sourceClipId,start:cue.start,end:cue.end,text:cue.text}))).toEqual(source.captionSegments);
});

test('middle removal retains two separately editable occurrences and the chosen join', () => {
  const result=removeStudioProgrammeRanges(fixture(),[{start:5,end:6}],'middle', {transition:'soft_dip',transitionDuration:.18});
  expect(ranges(result)).toEqual([[1,5],[3,4],[5,7],[2,8]]);
  expect(result.snapshot.timeline[1]).toMatchObject({sourceClipId:'b',transitionOut:'soft_dip'});
  expect(result.snapshot.timeline[2]).toMatchObject({sourceClipId:'b',transitionIn:'soft_dip'});
  expect(new Set(result.snapshot.timeline.map(clip=>clip.id)).size).toBe(4);
});

test('programme removal refuses locked tracks, an empty result and a sub-frame remnant', () => {
  const source=fixture(); source.trackStates.originalAudio={locked:true};
  expect(()=>removeStudioProgrammeRanges(source,[{start:0,end:1}],'lock')).toThrow(/Unlock/);
  expect(()=>removeStudioProgrammeRanges(fixture(),[{start:0,end:14}],'empty')).toThrow(/one frame/);
  expect(()=>removeStudioProgrammeRanges(fixture(),[{start:.001,end:2}],'sliver')).toThrow(/full frame/);
});

test('independent audio trims keep their detached source phase; Straight Cut restores normal binding', () => {
  const source=fixture();source.linkedSelection=false;
  const slipped=edit(source,'slip',2);
  const trimmed=edit(slipped.snapshot,'audio-trim',0,{offsets:{audioTrimOffsetStart:.25}});
  expect(trimmed.snapshot.timeline[1]).toMatchObject({audioDetached:true,audioSourceStart:3.25,audioProgrammeStart:4.25});
  const reset=edit(trimmed.snapshot,'audio-reset',0);
  expect(reset.snapshot.timeline[1].audioDetached).toBeUndefined();
  expect(reset.snapshot.timeline[1].audioTrimOffsetStart).toBe(0);
});
