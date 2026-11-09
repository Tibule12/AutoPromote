import { studioOverlayBelongsToClip } from '../studioOverlayBinding';

test('a saved source-bound title remains visible on both descendants after a split', () => {
  const title = { type: 'text', clipId: 'main', startTime: 1, duration: 3 };
  const clips = [{ id: 'left', sourceClipId: 'main' }, { id: 'right', sourceClipId: 'main' }];
  expect(clips.map(clip => studioOverlayBelongsToClip(title, clip, clips))).toEqual([true, true]);
  expect(studioOverlayBelongsToClip(title, { id: 'other', sourceClipId: 'another-source' }, clips)).toBe(false);
});

test('an occurrence-bound title cannot leak into another occurrence of its source', () => {
  const clips = [{ id: 'main', sourceClipId: 'main' }, { id: 'repeat', sourceClipId: 'main' }];
  expect(studioOverlayBelongsToClip({ clipId: 'main' }, clips[0], clips)).toBe(true);
  expect(studioOverlayBelongsToClip({ clipId: 'main' }, clips[1], clips)).toBe(false);
  expect(studioOverlayBelongsToClip({ clipId: 'missing' }, clips[1], clips)).toBe(false);
});
