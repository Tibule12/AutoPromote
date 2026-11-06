const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateFrameRequest, decodeSourceFrame, prepareSequencePreviewSource } = require('../services/studioSourceFrameService');

const request = { storagePath: 'studio/sources/owner/video.mp4', sourceContentHash: 'a'.repeat(64),
  start: .125, end: 1.125, fps: 24, frameIndex: 5 };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('sampling cannot accept caller URLs, invalid windows or a frame outside the trim', () => {
  expect(validateFrameRequest(request)).toBe(request);
  for (const extra of [{ url: 'file:///etc/passwd' }, { start: -1 }, { end: 100 },
    { fps: Infinity }, { fps: 0 }, { frameIndex: 24 }, { frameIndex: .5 }, { sourceContentHash: 'bad' }]) {
    expect(() => validateFrameRequest({ ...request, ...extra })).toThrow('inside a saved source');
  }
});

test('legacy requests require an exact generation and cannot weaken a supplied digest', () => {
  const { sourceContentHash, ...legacy } = request;
  expect(() => validateFrameRequest(legacy)).toThrow('inside a saved source');
  expect(validateFrameRequest({ ...legacy, sourceGeneration: '1791917104896000' })).toMatchObject({ sourceGeneration: '1791917104896000' });
  for (const sourceGeneration of [12, '0', '-1', '1e3', 'x', '1'.repeat(33)])
    expect(() => validateFrameRequest({ ...legacy, sourceGeneration })).toThrow('inside a saved source');
  expect(() => validateFrameRequest({ ...legacy, sourceGeneration: '12', sourceContentHash: 'bad' })).toThrow('inside a saved source');
});

test('texture sampling accepts only the bounded existing 30fps scene profile', () => {
  const texture = { ...request, fps: 30, sampling: 'studio-3d-texture-frame-v1' };
  expect(validateFrameRequest(texture)).toBe(texture);
  for (const extra of [{ sampling: 'arbitrary' }, { sampling: null }, { fps: 24 }, { end: 11 }])
    expect(() => validateFrameRequest({ ...texture, ...extra })).toThrow('inside a saved source');
  expect(() => validateFrameRequest({ ...texture, start:5.5, end:8.8, frameIndex:99 })).toThrow('inside a saved source');
});

test('fractional programme sampling binds a bounded source and global concat window', () => {
  const spec={...request,start:4.7,end:12,frameIndex:174,programmeStart:4.7,programmeDuration:12,
    sampling:'studio-sequence-source-frame-v2'};
  expect(validateFrameRequest(spec)).toBe(spec);
  for (const extra of [{frameIndex:175},{programmeStart:-1},{programmeDuration:11},
    {programmeDuration:NaN},{programmeStart:'4.7'},{start:104.7,end:112},{fps:29.97},
    {sampling:undefined},{programmeDuration:undefined},{url:'https://example.org/video'}])
    expect(()=>validateFrameRequest({...spec,...extra})).toThrow('inside a saved source');
  expect(()=>validateFrameRequest({...request,programmeStart:0})).toThrow('inside a saved source');
});

describe('actual FFmpeg sampling matches a separately decoded full sequence', () => {
  let folder;
  beforeAll(async () => {
    // The real development materializer intentionally accepts only repo/tmp.
    // Own one fresh directory there; never weaken that path boundary.
    const temp=path.resolve(__dirname,'../../tmp');await fs.mkdir(temp,{recursive:true});
    folder = await fs.mkdtemp(path.join(temp, 'studio-frame-test-'));
  });
  afterAll(async () => { await fs.rm(folder, { recursive: true, force: true }); });
  test('a playlist disguised as owned video cannot request another network resource',async()=>{
    const source=path.join(folder,'untrusted.m3u8');
    await fs.writeFile(source,'#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:1/private.ts\n#EXT-X-ENDLIST\n');
    for(const task of [()=>decodeSourceFrame(source,request),
      ()=>prepareSequencePreviewSource(source,path.join(folder,'untrusted-output.mp4'))]){
      try {await task();throw new Error('Unsafe playlist was accepted');}
      catch(error){expect(String(error.stderr)).toMatch(/not on whitelist/i);expect(String(error.stderr)).not.toMatch(/Connection refused/);}
    }
  });
  test('sequence preparation matches the actual worker CFR ingest and rejects cancellation', async () => {
    const source=path.join(folder,'ingest-source.mp4'),prepared=path.join(folder,'preview-ingest.mp4'),reference=path.join(folder,'worker-ingest.mp4');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=25:duration=2',
      '-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-y',source]);
    const result=await prepareSequencePreviewSource(source,prepared);
    expect(result.size).toBeGreaterThan(1000);expect(result.size).toBeLessThan(32*1024*1024);
    execFileSync(process.env.STUDIO_AUDIO_PREVIEW_PYTHON||'python3',['-c',
      'import asyncio,sys,socket; from unittest.mock import patch; from python_media_worker import main_media_server as w; deny=lambda *a,**k: (_ for _ in ()).throw(AssertionError("Network forbidden"));\nwith patch.object(socket.socket,"connect",deny): asyncio.run(w.materialize_video_input(sys.argv[1],sys.argv[2]))',
      source,reference],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,CUDA_VISIBLE_DEVICES:'',MEDIA_WORKER_STUDIO_FFMPEG_THREADS:'2'}});
    const pixels=file=>execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:4*1024*1024});
    expect(digest(pixels(prepared))).toBe(digest(pixels(reference)));
    const abort=new AbortController();abort.abort();
    await expect(prepareSequencePreviewSource(source,path.join(folder,'cancelled.mp4'),abort.signal)).rejects.toMatchObject({name:'AbortError'});
  },30000);
  test.each(['24000/1001', '30', 'variable'])('%s source with fractional trim', async rate => {
    const source = path.join(folder, `${rate.replace('/', '-')}.mkv`);
    const filter = rate === 'variable' ?
      'testsrc2=size=320x180:rate=60:duration=2,select=if(lt(t\\,1)\\,not(mod(n\\,2))\\,not(mod(n\\,3)))' :
      `testsrc2=size=320x180:rate=${rate}:duration=2`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', filter,
      '-fps_mode', 'vfr', '-c:v', 'ffv1', '-y', source]);
    const frames = path.join(folder, `${rate.replace('/', '-')}-frame-%02d.png`);
    // Independent whole trimmed sequence, without the sampler's select filter.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', '0.125', '-i', source,
      '-t', '1', '-vf', 'fps=24,setpts=PTS-STARTPTS', '-an', '-threads', '2', '-y', frames]);
    for (const index of [0, 1, 5, 17, 23]) {
      const actual = await decodeSourceFrame(source, { ...request, frameIndex: index });
      const expected = await fs.readFile(frames.replace('%02d', String(index+1).padStart(2, '0')));
      expect(digest(actual)).toBe(digest(expected));
    }
  }, 20000);
  test('a cancelled seek cannot leave its FFmpeg decoder running', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(decodeSourceFrame(path.join(folder, '30.mkv'), request, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
  test.each(['25','24000/1001','variable'])('fractional %s pictures match the actual canonical sequence window',async rate=>{
    const source=path.join(folder,`phase-${rate.replace('/','-')}.mkv`);
    const filter=rate==='variable'
      ? 'testsrc2=size=160x90:rate=60:duration=3,select=if(lt(t\\,1)\\,not(mod(n\\,2))\\,not(mod(n\\,3)))'
      : `testsrc2=size=160x90:rate=${rate}:duration=3`;
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',filter,'-fps_mode','vfr','-c:v','ffv1','-y',source]);
    const ingest=path.join(folder,`ingest-${rate.replace('/','-')}.mkv`);
    // Lossless ingest isolates source identity/phase from a codec's quality.
    // The real lossy delivered movie still needs its paired browser proof.
    execFileSync('ffmpeg',['-v','error','-i',source,'-vf','fps=30','-c:v','ffv1','-y',ingest]);
    const window=JSON.parse(execFileSync('python3',['-c',
      'import json; from python_media_worker.studio_sequence_video import sequence_picture_window; print(json.dumps(sequence_picture_window(.7,1.7,2.4,.53,30,24)))'],
      {cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}));
    const frames=path.join(folder,`phase-ref-${rate.replace('/','-')}-%02d.png`);
    execFileSync('ffmpeg',['-v','error','-ss',window.seek.toFixed(6),'-i',ingest,
      '-vf',window.clock.join(','),'-frames:v',String(window.frames),
      // Match the worker encoder: do not let the image muxer resample the
      // canonical frame sequence to its inherited input rate on FFmpeg7.
      '-fps_mode','passthrough','-threads','2','-y',frames]);
    for(const index of [0,1,10,window.frames-1]){
      const actual=await decodeSourceFrame(source,{...request,start:.53,end:2.23,fps:24,frameIndex:index,
        sampling:'studio-sequence-source-frame-v2',programmeStart:.7,programmeDuration:2.4});
      const expected=await fs.readFile(frames.replace('%02d',String(index+1).padStart(2,'0')));
      const colour=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
        'stream=color_primaries,color_transfer','-of','json','pipe:0'],{input:actual}));
      expect(colour.streams[0]).toMatchObject({color_primaries:'bt709',color_transfer:'iec61966-2-1'});
      const rgb=bytes=>execFileSync('ffmpeg',['-v','error','-i','pipe:0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{input:bytes});
      expect(digest(rgb(actual))).toBe(digest(rgb(expected)));
    }
  },30000);
  test.each(['24', '30000/1001', 'variable'])('paused %s texture matches actual native renderer preparation', async rate => {
    const source = path.join(folder, `texture-${rate.replace('/', '-')}.mp4`);
    const filter = rate === 'variable'
      ? 'testsrc2=size=320x180:rate=60:duration=2,select=if(lt(t\\,1)\\,not(mod(n\\,2))\\,not(mod(n\\,3)))'
      : `testsrc2=size=320x180:rate=${rate}:duration=2`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', filter,
      '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '2', '-y', source]);
    const reference = path.join(folder, `native-${rate.replace('/', '-')}`);
    await fs.mkdir(reference);
    const sourceHash = digest(await fs.readFile(source));
    const spec = { fps: 30, duration: 1, scene: { assetSourceStart: .125,
      assetContentHash: sourceHash, assetAspect: 320/180 } };
    // Invoke the production scene renderer's preparation, not a test copy of
    // the sampler filter. This covers fractional source-in and mixed/VFR PTS.
    execFileSync('python3', ['-c', 'import json,sys; from render import prepare_video_texture; prepare_video_texture(json.loads(sys.argv[1]),sys.argv[2],sys.argv[3])',
      JSON.stringify(spec), source, reference], { env: { ...process.env,
      PYTHONPATH: path.resolve(__dirname, '../../studio_3d_renderer') } });
    for (const index of [0, 1, 5, 16, 17, 23, 29]) {
      const actual = await decodeSourceFrame(source, { ...request, fps: 30,
        frameIndex: index, sampling: 'studio-3d-texture-frame-v1' });
      const expected = await fs.readFile(path.join(reference, 'texture', `texture_${String(index+1).padStart(4, '0')}.png`));
      expect(digest(actual)).toBe(digest(expected));
    }
  }, 30000);
});
