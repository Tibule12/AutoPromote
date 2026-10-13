import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import StudioVoiceoverPreview from "../StudioVoiceoverPreview";
import { uploadVoiceoversForRender, voiceoverTrackAudible, constantMusicDuckGain,
  voiceoverPcmEligible, voiceoverPcmKey, createVoiceoverPcmBuffer } from "../studioVoiceover";
import { buildViralRenderData } from "../viralRenderPayload";

test("uploads a full-length recording and preserves trim, zero gain and kind through the actual render builder", async () => {
  const file = new File(["recording"], "take.webm", { type: "audio/webm" });
  const upload = jest.fn().mockResolvedValue({ url: "https://example.com/take.webm", storagePath: "owned/take.webm",
    contentHash: 'a'.repeat(64), ownerUid: 'owner' });
  const cues = await uploadVoiceoversForRender([{ id: "voice", name: "Take 1", file, url: "blob:recording",
    startTime: 4, trimStart: 2, duration: 45, volume: 0 }], { upload, token: "test" });
  expect(upload).toHaveBeenCalledWith(expect.objectContaining({ file, mediaType: "audio", token: "test" }));
  expect(cues[0].sourceStoragePath).toBe("owned/take.webm");
  expect(cues[0]).toMatchObject({ contentHash: 'a'.repeat(64), ownerUid: 'owner', priorUrl: 'blob:recording' });
  const payload = buildViralRenderData({ selectedClip: { start: 0, end: 60 },
    finalVideoUrl: "https://example.com/source.mp4", extraOptions: { soundEffects: cues } });
  expect(payload.sound_effects).toEqual([expect.objectContaining({ kind: "voiceover", duration: 45,
    trimStart: 2, startTime: 4, volume: 0, url: "https://example.com/take.webm" })]);
});

test("does not export muted takes or a muted track, and refuses a lost recording", async () => {
  const upload = jest.fn();
  expect(await uploadVoiceoversForRender([{ enabled: false }], { upload })).toEqual([]);
  expect(await uploadVoiceoversForRender([{ name: "lost", url: "blob:expired" }], { upload, audible: false })).toEqual([]);
  await expect(uploadVoiceoversForRender([{ name: "lost", url: "blob:expired" }], { upload })).rejects.toThrow("Reconnect");
  expect(upload).not.toHaveBeenCalled();
  expect(voiceoverTrackAudible({ voiceover: { muted: true } })).toBe(false);
  expect(voiceoverTrackAudible({ music: { solo: true } })).toBe(false);
  expect(voiceoverTrackAudible({ voiceover: { solo: true }, music: { solo: true } })).toBe(true);
});

test("follows playback, seek, source trim, speed, master volume, mute and cleanup independently of the inspector", () => {
  const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const pause = jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const video = document.createElement("video");
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  Object.defineProperty(video, "readyState", { configurable: true, value: 3 });
  const props = { takes: [{ id: "take", name: "Take 1", url: "https://example.com/voice.wav", startTime: 2,
    duration: 30, trimStart: 1, volume: .5 }], videoRef: { current: video },
    getTimelineTime: time => time, activeClip: 0, muted: false, volume: .4,
    automationKeyframes: [{ property: "volume", time: 0, value: 50 }] };
  const { rerender, unmount } = render(<StudioVoiceoverPreview {...props} />);
  const audio = screen.getByTestId("voiceover-audio-take");
  Object.defineProperty(audio, "readyState", { configurable: true, value: 3 });
  video.currentTime = 20;
  video.playbackRate = 1.5;
  fireEvent.timeUpdate(video);
  expect(audio.currentTime).toBe(19);
  expect(audio.volume).toBeCloseTo(.1);
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.preservesPitch).toBe(true);
  expect(play).toHaveBeenCalled();
  rerender(<StudioVoiceoverPreview {...props} muted />);
  expect(audio.muted).toBe(true);
  rerender(<StudioVoiceoverPreview {...props} volume={0} />);
  expect(audio.volume).toBe(0);
  video.currentTime = 1;
  pause.mockClear();
  fireEvent.seeked(video);
  expect(pause).toHaveBeenCalled();
  play.mockClear();
  rerender(<StudioVoiceoverPreview {...props} renderedOutputUrl="https://example.com/render.mp4" />);
  video.currentTime = 5;
  fireEvent.play(video);
  expect(play).not.toHaveBeenCalled();
  unmount();
  play.mockRestore(); pause.mockRestore();
});

test('constant ducking uses the same authored reduction and disabled/speech modes keep their own routes', () => {
  expect(constantMusicDuckGain({ducking:true,duckingMode:'constant',duckingStrength:.4})).toBeCloseTo(.6);
  expect(constantMusicDuckGain({ducking:true,duckingMode:'constant',duckingStrength:0})).toBeCloseTo(.95);
  expect(constantMusicDuckGain({ducking:false,duckingMode:'constant',duckingStrength:.4})).toBe(1);
  expect(constantMusicDuckGain({ducking:true,duckingMode:'speech',duckingStrength:.4})).toBe(1);
});

test('voiceover starts on a decoded picture frame and retries late canplay at the exact source trim', () => {
  let callback, ready=1;
  const video=document.createElement('video');
  Object.defineProperty(video,'paused',{configurable:true,value:false});
  Object.defineProperty(video,'readyState',{configurable:true,value:3});
  video.requestVideoFrameCallback=jest.fn(fn=>{callback=fn;return 1;});video.cancelVideoFrameCallback=jest.fn();
  const play=jest.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  const {unmount}=render(<StudioVoiceoverPreview takes={[{id:'take',url:'https://example.com/v.wav',startTime:1,
    trimStart:.5,duration:2,volume:1}]} videoRef={{current:video}} getTimelineTime={t=>t} volume={1} />);
  const audio=screen.getByTestId('voiceover-audio-take');
  Object.defineProperty(audio,'readyState',{configurable:true,get:()=>ready});
  video.currentTime=1.016;callback();expect(play).not.toHaveBeenCalled();
  ready=3;fireEvent.canPlay(audio);expect(play).toHaveBeenCalledTimes(1);
  expect(audio.currentTime).toBeCloseTo(.516);
  unmount();expect(video.cancelVideoFrameCallback).toHaveBeenCalled();play.mockRestore();pause.mockRestore();
});

const unitMap = [{programmeRange:{startTick:0,endTick:900000},outputRange:{startTick:0,endTick:900000},
  rateNumerator:1,rateDenominator:1}];

test('sample-clock voiceover is restricted to short 1x ranges and scopes owned bytes to the project',()=>{
  const take={startTime:1,duration:2,sourceDuration:8,url:'https://example.com/old',ownerUid:'owner',
    sourceStoragePath:'owned/voice',contentHash:'a'.repeat(64)};
  expect(voiceoverPcmEligible(take,unitMap)).toBe(true);
  expect(voiceoverPcmEligible(take,[{...unitMap[0],rateNumerator:2}])).toBe(false);
  expect(voiceoverPcmEligible({...take,sourceDuration:120},unitMap)).toBe(false);
  expect(voiceoverPcmKey('project',take)).toBe(voiceoverPcmKey('project',{...take,url:'https://example.com/renewed'}));
  expect(voiceoverPcmKey('other-project',take)).not.toBe(voiceoverPcmKey('project',take));
});

test('trimmed mono voice PCM preserves zero fades and excludes stereo downmix guessing',()=>{
  let output;
  const context={sampleRate:8,createBuffer:jest.fn((channels,length)=>{
    output=new Float32Array(length);return {length,getChannelData:()=>output};})};
  const decoded={sampleRate:8,numberOfChannels:1,length:8,getChannelData:()=>Float32Array.from([0,.1,.2,.3,.4,.5,.6,.7])};
  const take={trimStart:.25,duration:.5,fadeIn:0,fadeOut:0};
  createVoiceoverPcmBuffer(context,decoded,take);
  expect([...output]).toEqual([.2,.3,.4,.5].map(Math.fround));
  createVoiceoverPcmBuffer(context,decoded,{...take,fadeIn:.25,fadeOut:.25});
  expect([...output]).toEqual([0,.15,.4,.25].map(Math.fround));
  expect(createVoiceoverPcmBuffer(context,{...decoded,numberOfChannels:2},take)).toBeNull();
});

test('prepared voice PCM schedules its real trim on the shared clock without a second native audible route',async()=>{
  const connect=jest.fn(),disconnect=jest.fn(),start=jest.fn(),stop=jest.fn(),setValueAtTime=jest.fn();
  const createMediaElementSource=jest.fn(),close=jest.fn().mockResolvedValue();
  const context={sampleRate:8,currentTime:100,destination:{},close,resume:jest.fn().mockResolvedValue(),
    createAnalyser:()=>({connect,disconnect}),createMediaElementSource,
    createGain:()=>({connect,disconnect,gain:{setValueAtTime}}),
    createBufferSource:()=>({connect,disconnect,start,stop}),
    createBuffer:(channels,length)=>({length,getChannelData:()=>new Float32Array(length)}),
    decodeAudioData:jest.fn().mockResolvedValue({sampleRate:8,numberOfChannels:1,length:8,
      getChannelData:()=>new Float32Array(8).fill(.2)})};
  const priorContext=window.AudioContext,priorFetch=global.fetch;
  window.AudioContext=jest.fn(()=>context);
  global.fetch=jest.fn().mockResolvedValue({ok:true,headers:{get:()=>8},arrayBuffer:async()=>new ArrayBuffer(8)});
  const video=document.createElement('video');video.currentTime=.95;
  Object.defineProperty(video,'paused',{configurable:true,value:false});
  Object.defineProperty(video,'readyState',{configurable:true,value:3});
  const play=jest.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  try {
    const take={id:'take',url:'https://example.com/voice.wav',startTime:1,trimStart:.25,duration:.5,sourceDuration:1,volume:.7};
    const props={takes:[take],videoRef:{current:video},getTimelineTime:t=>t,volume:1,projectId:'project',
      outputTimeMap:unitMap,getAudioContext:()=>context};
    const {unmount,rerender}=render(<StudioVoiceoverPreview {...props} />);
    await waitFor(()=>expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(100.05,0,.5);
    expect(createMediaElementSource).not.toHaveBeenCalled();expect(play).not.toHaveBeenCalled();
    rerender(<StudioVoiceoverPreview {...props} takes={[{...take,startTime:1.05}]} />);
    expect(stop).toHaveBeenCalledTimes(1);
    video.currentTime=1.2;fireEvent.timeUpdate(video);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][1]).toBeCloseTo(.15);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // A prepared decoder has already taken over when the outgoing pause
    // arrives. That stale event must not stop the current voice buffer.
    const nextVideo=document.createElement('video');
    Object.defineProperty(nextVideo,'paused',{configurable:true,value:false});
    props.videoRef.current=nextVideo;fireEvent.pause(video);
    expect(stop).toHaveBeenCalledTimes(1);
    props.videoRef.current=video;
    Object.defineProperty(video,'paused',{configurable:true,value:true});fireEvent.pause(video);
    expect(stop).toHaveBeenCalledTimes(2);unmount();expect(close).not.toHaveBeenCalled();
  } finally {window.AudioContext=priorContext;global.fetch=priorFetch;play.mockRestore();pause.mockRestore();}
});

test.each([false,true])('voiceover 200%% automation uses one audible route and respects shared context ownership: %s', shared => {
  const setGain=jest.fn(),connect=jest.fn(),disconnect=jest.fn(),close=jest.fn().mockResolvedValue(),resume=jest.fn().mockResolvedValue();
  const context={currentTime:1,destination:{},resume,close,
    createAnalyser:()=>({connect,disconnect}),createMediaElementSource:()=>({connect}),createGain:()=>({connect,gain:{setValueAtTime:setGain}})};
  const prior=window.AudioContext;window.AudioContext=jest.fn(()=>context);
  const video=document.createElement('video');video.currentTime=1;
  Object.defineProperty(video,'paused',{configurable:true,value:false});
  Object.defineProperty(video,'readyState',{configurable:true,value:3});
  const play=jest.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  try {
    const {unmount}=render(<StudioVoiceoverPreview takes={[{id:'take',url:'https://example.com/v.wav',startTime:0,
      duration:3,volume:.7}]} videoRef={{current:video}} getTimelineTime={t=>t} volume={1}
      getAudioContext={shared ? ()=>context : undefined}
      automationKeyframes={[{property:'volume',time:0,value:200}]} />);
    expect(setGain).toHaveBeenCalledWith(1.4,1);
    expect(screen.getByTestId('voiceover-audio-take').volume).toBe(1);
    expect(window.AudioContext).toHaveBeenCalledTimes(shared ? 0 : 1);
    unmount();expect(disconnect).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(shared ? 0 : 1);
  } finally {window.AudioContext=prior;play.mockRestore();pause.mockRestore();}
});
