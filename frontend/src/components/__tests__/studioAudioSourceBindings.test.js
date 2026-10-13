import { bindStudioAudioSources, studioUploadedAudioBinding } from '../studioAudioSourceBindings';
import { reconcileStudioDocument } from '../studioProjectDocument';

const source = { id: 'sfx', url: 'blob:cue', file: new Blob(['sound']), startTime: 1, duration: 2, volume: .4 };
const snapshot = () => ({ orderedClips: [{ id: 'source', start: 0, end: 5 }], selectedClipId: 'source',
  timeline: [{ id: 'first', sourceClipId: 'source', startRequest: 0, endRequest: 5, url: 'https://example.com/video' }],
  soundEffects: [source], musicTrack: { ...source, id: 'music', url: 'blob:music' } });
const bindings = state => ({ effects: new Map([['sfx', studioUploadedAudioBinding(state.soundEffects[0], {
  url: 'https://example.com/sfx?access=one', storagePath: 'uploads/audios/owner/sfx.wav', ownerUid: 'owner', contentHash: 'a'.repeat(64),
})]]), music: studioUploadedAudioBinding(state.musicTrack, { url: 'https://example.com/music',
  storagePath: 'uploads/audios/owner/music.wav', ownerUid: 'owner', contentHash: 'b'.repeat(64) }) });

test('uploaded sound bytes and bindings persist in the same canonical render/save revision', () => {
  const before = snapshot();
  const original = reconcileStudioDocument({ snapshot: before, projectId: 'project' });
  const materialized = bindStudioAudioSources(before, bindings(before));
  const saved = reconcileStudioDocument({ snapshot: materialized, projectId: 'project', storedDocument: original });
  const render = reconcileStudioDocument({ snapshot: materialized, projectId: 'project', storedDocument: saved });
  expect(render).toEqual(saved);
  expect(materialized.soundEffects[0]).toMatchObject({ file: null, contentHash: 'a'.repeat(64), ownerUid: 'owner' });
  expect(JSON.stringify(saved)).toContain('uploads/audios/owner/sfx.wav');
  expect(saved.audioGraph.music.contentHash).toBe('b'.repeat(64));
  expect(JSON.stringify(saved)).not.toContain('https://example.com/sfx');
});

test('a source replaced during upload and later creative edits remain in the live project without changing frozen render decisions', () => {
  const frozen = snapshot(), uploaded = bindings(frozen);
  const current = { ...frozen, musicTrack: { ...frozen.musicTrack, url: 'blob:replacement' },
    soundEffects: [{ ...source, url: 'blob:new-cue', startTime: 3, volume: .2 }] };
  const live = bindStudioAudioSources(current, uploaded);
  const rendered = bindStudioAudioSources(frozen, uploaded);
  expect(live.musicTrack.url).toBe('blob:replacement');
  expect(live.soundEffects[0]).toMatchObject({ url: 'blob:new-cue', startTime: 3, volume: .2 });
  expect(rendered.soundEffects[0]).toMatchObject({ startTime: 1, volume: .4, contentHash: 'a'.repeat(64) });
});

test('recording uploads retain exact owner/hash and do not overwrite a take replaced during the request', () => {
  const before={...snapshot(),voiceovers:[{...source,id:'voice',url:'blob:voice'}]};
  const voices=new Map([['voice',studioUploadedAudioBinding(before.voiceovers[0],{
    url:'https://example.com/voice',storagePath:'uploads/audios/owner/voice.wav',ownerUid:'owner',contentHash:'c'.repeat(64)})]]);
  const saved=bindStudioAudioSources(before,{voices});
  expect(saved.voiceovers[0]).toMatchObject({file:null,sourceStoragePath:'uploads/audios/owner/voice.wav',contentHash:'c'.repeat(64),ownerUid:'owner'});
  const changed={...before,voiceovers:[{...before.voiceovers[0],url:'blob:new-recording'}]};
  expect(bindStudioAudioSources(changed,{voices}).voiceovers[0].url).toBe('blob:new-recording');
});
