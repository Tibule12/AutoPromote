import { studioCueSourceKey, createStudioCueBuffer, prepareStudioCuePlayback, prepareStudioBuiltInCue } from '../studioCueBuffer';

test('built-in attacks are prepared once before Play and only changed PCM inputs require another buffer',()=>{
  const context={sampleRate:48000,createBuffer:jest.fn((_channels,length,sampleRate)=>{
    const data=new Float32Array(length);
    return {length,duration:length/sampleRate,getChannelData:()=>data};
  })};
  const cache=new Map(),effect={builtIn:true,tone:'impact',duration:.1,fadeIn:0,fadeOut:.02};
  const prepared=prepareStudioBuiltInCue(context,effect,cache,'owned-project');
  expect(prepared.length).toBe(4800);
  expect(prepared.getChannelData(0).some(value=>value!==0)).toBe(true);
  expect(prepareStudioBuiltInCue(context,{...effect,startTime:8,volume:.25},cache,'owned-project')).toBe(prepared);
  expect(context.createBuffer).toHaveBeenCalledTimes(1);
  expect(prepareStudioBuiltInCue(context,{...effect,fadeOut:.03},cache,'owned-project')).not.toBe(prepared);
  expect(prepareStudioBuiltInCue(context,effect,cache,'other-project')).not.toBe(prepared);
});

test('built-in PCM retention is bounded and unavailable contexts keep the native fallback',()=>{
  const cache=new Map([['old',{length:4000000}]]);
  const context={sampleRate:48000,createBuffer:(_channels,length)=>({length,getChannelData:()=>new Float32Array(length)})};
  expect(prepareStudioBuiltInCue(context,{builtIn:true,tone:'click',duration:.05},cache,'owned-project')).toBeTruthy();
  expect(cache.has('old')).toBe(false);
  expect(prepareStudioBuiltInCue(null,{builtIn:true},cache,'owned-project')).toBeNull();
  expect(prepareStudioBuiltInCue(context,{builtIn:false},cache,'owned-project')).toBeNull();
});

test('transport pins decoded cues after pending preparations settle, with rejected imports retaining fallback', async()=>{
  let resolve;
  const pending=new Promise(done=>{resolve=done;});
  let ready=false;
  const preparation=prepareStudioCuePlayback([pending,Promise.reject(new Error('native fallback'))]).then(()=>{ready=true;});
  await Promise.resolve();expect(ready).toBe(false);
  resolve();await preparation;expect(ready).toBe(true);
});

test('a slow imported cue cannot hold Play indefinitely',async()=>{
  jest.useFakeTimers();
  try {
    const preparation=prepareStudioCuePlayback([new Promise(()=>{})]);
    jest.advanceTimersByTime(2000);await preparation;
    expect(jest.getTimerCount()).toBe(0);
  } finally {jest.useRealTimers();}
});

test('owned cue reuse requires the same project, owner, path and exact bytes; voiceover keeps its native route', () => {
  const effect = { url: 'https://example.com/audio?access=one', ownerUid: 'owner',
    storagePath: 'studio/audio.wav', contentHash: 'a'.repeat(64) };
  const key = studioCueSourceKey('project', effect);
  expect(studioCueSourceKey('project', { ...effect, url: 'https://example.com/audio?access=two' })).toBe(key);
  expect(studioCueSourceKey('other-project', effect)).not.toBe(key);
  expect(studioCueSourceKey('project', { ...effect, ownerUid: 'other' })).not.toBe(key);
  expect(studioCueSourceKey('project', { ...effect, contentHash: 'b'.repeat(64) })).not.toBe(key);
  expect(studioCueSourceKey('project', { ...effect, kind: 'voiceover' })).toBe('');
});

test('stereo cue trim and fades are baked into audio samples without baking the editable volume', () => {
  const channels = [Float32Array.from({ length: 30 }, (_, i) => i / 30),
    Float32Array.from({ length: 30 }, (_, i) => -i / 30)];
  const context = { sampleRate: 10, createBuffer: (n, count, rate) => {
    const output = Array.from({ length: n }, () => new Float32Array(count));
    return { duration: count / rate, getChannelData: index => output[index] };
  } };
  const decoded = { sampleRate: 10, length: 30, numberOfChannels: 2, getChannelData: i => channels[i] };
  const effect = { trimStart: .5, duration: 1, fadeIn: .2, fadeOut: .4, volume: .01 };
  const cue = createStudioCueBuffer(context, decoded, effect);
  expect(cue.duration).toBe(1);
  const samples = cue.getChannelData(0);
  expect(samples[0]).toBe(0);
  expect(samples[1]).toBeCloseTo(channels[0][6] * .5);
  expect(samples[4]).toBeCloseTo(channels[0][9]);
  expect(samples[9]).toBeCloseTo(channels[0][14] * .25);
  expect([...cue.getChannelData(1)]).toEqual([...samples].map(x => -x));
  expect(createStudioCueBuffer(context, decoded, { ...effect, trimStart: 4 })).toBeNull();
});

test('unattested URLs are scoped to their exact access and never reused after replacement', () => {
  expect(studioCueSourceKey('one', { url: 'https://example.com/a.wav' })).not.toBe(
    studioCueSourceKey('one', { url: 'https://example.com/b.wav' }));
});
