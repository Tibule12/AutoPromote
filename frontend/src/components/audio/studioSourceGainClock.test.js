import { createStudioSourceGainClock } from './studioSourceGainClock';
jest.mock('./audioRemixPreview', () => ({
  ensureAudioRemixPreview: media => media.__audioRemixGraph,
  applyStudioMediaGain: (media, gain) => { media.__audioRemixGraph.trackGain.gain.value = gain; return true; },
}));
const fixture = () => {
  const param = { value: 1, cancelScheduledValues: jest.fn(), setValueCurveAtTime: jest.fn() };
  const context = { state: 'running', currentTime: 10, sampleRate: 48000 };
  const media = { currentTime: 2, playbackRate: 1, volume: .5, paused: false, seeking: false,
    __audioRemixGraph: { context, trackGain: { gain: param } } };
  return { media, param, context, clock: createStudioSourceGainClock(media) };
};
test('the audio thread receives a bounded future fade before the next editor frame', () => {
  const { media, param, context, clock } = fixture();
  const request = { automated: true, duration: 4, gainAtOffset: offset => .2 + .8 * offset };
  clock.sync(request);
  const [curve, start, duration] = param.setValueCurveAtTime.mock.calls[0];
  expect(curve).toHaveLength(65); expect(start).toBe(10); expect(duration).toBe(.5);
  expect(curve[0]).toBeCloseTo(.2); expect(curve[32]).toBeCloseTo(.4); expect(curve[64]).toBeCloseTo(.6);
  expect(media.volume).toBe(1);
  // No main-thread callback is required to reach the midpoint of this curve.
  context.currentTime += .2; media.currentTime += .2; clock.sync(request);
  expect(param.setValueCurveAtTime).toHaveBeenCalledTimes(1);
  context.currentTime += .1; media.currentTime += .1; clock.sync(request);
  expect(param.setValueCurveAtTime).toHaveBeenCalledTimes(2);
});
test.each(['seek', 'rate', 'drift'])('a changed %s reanchors instead of retaining the old future gain', change => {
  const { media, param, context, clock } = fixture();
  const request = { automated: true, duration: 1, gainAtOffset: offset => 1 - offset };
  clock.sync(request); context.currentTime += .05; media.currentTime += .05;
  if (change === 'seek') media.currentTime = 0;
  if (change === 'rate') media.playbackRate = .5;
  if (change === 'drift') media.currentTime += .03;
  clock.sync(request); expect(param.setValueCurveAtTime).toHaveBeenCalledTimes(2);
  expect(param.cancelScheduledValues).toHaveBeenLastCalledWith(0);
});
test('gain scheduling cannot extend beyond the current occurrence and is cancelled on pause/disposal', () => {
  const { media, param, clock } = fixture();
  const request = { automated: true, duration: .08, gainAtOffset: () => .7 };
  clock.sync(request); expect(param.setValueCurveAtTime.mock.calls[0][2]).toBe(.08);
  media.paused = true; clock.sync({ ...request, gainAtOffset: () => .4 });
  expect(param.value).toBe(.4); expect(param.cancelScheduledValues).toHaveBeenCalledTimes(2);
  clock.stop(); expect(param.cancelScheduledValues).toHaveBeenCalledTimes(2);
});
test('finished/unsupported preview paths keep immediate monitor gain with no scheduled curve', () => {
  const { media, param, clock } = fixture();
  clock.sync({ automated: false, duration: 8, gainAtOffset: () => .25 });
  expect(param.value).toBe(.25); expect(param.setValueCurveAtTime).not.toHaveBeenCalled();
  delete param.setValueCurveAtTime;
  clock.sync({ automated: true, duration: 8, gainAtOffset: () => 1.5 });
  expect(param.value).toBe(1.5);
});
