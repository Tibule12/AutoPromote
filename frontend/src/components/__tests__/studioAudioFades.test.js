import { studioAudioFadeGain, studioMusicFadeGain } from '../studioAudioFades';

test('overlapping sequential fades multiply and music clamps to its actual output duration', () => {
  expect(studioAudioFadeGain(.5, 1, 1, 1)).toBe(.25);
  expect(studioAudioFadeGain(.25, .5, 0, 1)).toBe(.75);
  expect(studioMusicFadeGain(.25, .5, 0, 1)).toBe(.5);
  expect(studioMusicFadeGain(.25, .5, 1, 1)).toBe(.25);
  expect(studioMusicFadeGain(2, 10, 12, 12)).toBe(.4);
});

test('zero fades retain samples, and completed releases never produce negative gains', () => {
  expect(studioAudioFadeGain(0, 1, 0, 0)).toBe(1);
  expect(studioAudioFadeGain(2, 1, 0, 1)).toBe(0);
  expect(studioMusicFadeGain(.5, 1, NaN, Infinity)).toBe(1);
});
