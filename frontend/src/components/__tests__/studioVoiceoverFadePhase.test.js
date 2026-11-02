import { rippleStudioSnapshotLinkedTimeline } from '../studioTrimTransaction';
import { voiceoverFadeGain, createVoiceoverPcmBuffer, uploadVoiceoversForRender, voiceoverPcmKey } from '../studioVoiceover';
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from '../studioProjectDocument';
import { secondsToTicks } from '../studioTime';
import { studioVoiceBusRequest } from '../studioPreparedVoiceBus';

const voice = { id: 'speech', name: 'Recorded speech', kind: 'voiceover', startTime: 0, duration: 4,
  trimStart: .5, sourceDuration: 5, volume: .7, fadeIn: 2, fadeOut: 2,
  url: 'https://example.com/speech.wav', sourceStoragePath: 'owned/speech.wav', ownerUid: 'owner', contentHash: 'a'.repeat(64) };
const cut = (voices, from, to) => rippleStudioSnapshotLinkedTimeline({ voiceovers: voices }, {
  fromTick: secondsToTicks(from), toTick: secondsToTicks(to),
}, `cut-${from}-${to}`).voiceovers;

test('linked removal retains each surviving speech sample and its original fade phase across repeated edits', () => {
  const pieces = cut([voice], 1, 2);
  expect(pieces).toHaveLength(2);
  expect(pieces[0]).toMatchObject({ duration: 1, trimStart: .5 });
  expect(pieces[1]).toMatchObject({ startTime: 1, duration: 2, trimStart: 2.5 });
  for (let i = 0; i < 100; i++) {
    const t = i / 100;
    expect(voiceoverFadeGain(pieces[0], t)).toBeCloseTo(voiceoverFadeGain(voice, t), 12);
    expect(voiceoverFadeGain(pieces[1], t)).toBeCloseTo(voiceoverFadeGain(voice, 2 + t), 12);
  }
  const twice = cut(pieces, 1.25, 1.75);
  for (const piece of twice) for (const t of [0, .1, piece.duration - .01]) {
    const original = piece.trimStart - voice.trimStart + t;
    expect(voiceoverFadeGain(piece, t)).toBeCloseTo(voiceoverFadeGain(voice, original), 12);
  }
  const saved = { orderedClips: [{ id: 'source', start: 0, end: 4 }], timeline: [{ id: 'clip', sourceClipId: 'source', startRequest: 0, endRequest: 4 }], voiceovers: twice };
  const cold = projectStudioEditableStateToSnapshot(adaptStudioSnapshotToDocument({
    projectId: 'phase', snapshot: saved,
  }), saved);
  expect(cold.voiceovers).toEqual(twice);
});

test('the same retained phase reaches PCM, cache identity, owned prepared preview and final export', async () => {
  const piece = cut([voice], 0, 1)[0];
  const rate = 48000, input = new Float32Array(5 * rate).fill(.25);
  const context = { sampleRate: rate, createBuffer: (_channels, count) => {
    const samples = new Float32Array(count);
    return { getChannelData: () => samples };
  } };
  const output = createVoiceoverPcmBuffer(context, { sampleRate: rate, numberOfChannels: 1,
    length: input.length, getChannelData: () => input }, piece).getChannelData(0);
  let error = 0;
  for (let i = 0; i < output.length; i++) error = Math.max(error, Math.abs(output[i] - .25 * voiceoverFadeGain(voice, 1 + i / rate)));
  expect(error).toBeLessThan(4e-8);
  expect(voiceoverPcmKey('phase', piece)).not.toBe(voiceoverPcmKey('phase', { ...piece, fadeOffset: 0 }));
  const map = [{ programmeRange: { startTick: 0, endTick: secondsToTicks(3) },
    outputRange: { startTick: 0, endTick: secondsToTicks(3) }, rateNumerator: 1, rateDenominator: 1 }];
  expect(studioVoiceBusRequest({ projectId: 'phase', takes: [piece], outputTimeMap: map }).voices[0])
    .toMatchObject({ fadeOffset: 1, fadeDuration: 4 });
  expect((await uploadVoiceoversForRender([piece], { upload: jest.fn() }))[0])
    .toMatchObject({ fadeOffset: 1, fadeDuration: 4, trimStart: 1.5, duration: 3 });
});
