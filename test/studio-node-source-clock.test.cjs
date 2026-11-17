const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {sourceFrameArgs}=require('../src/services/studioSourceFrameService');
const {SEQUENCE_SAMPLER}=require('../frontend/src/components/studioSequencePictureClock');
test('frame-aligned 24fps preview selects actual CFR30-ingest/round-up delivery pictures',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'node-source-clock-'));
 try{
  const source=path.join(dir,'original.mkv'),ingest=path.join(dir,'ingest.mkv'),data=Buffer.alloc(96*16*16*3);
  for(let frame=0;frame<96;frame++)data.fill(frame*2,frame*16*16*3,(frame+1)*16*16*3);
  execFileSync('ffmpeg',['-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','16x16','-r','24','-i','pipe:0','-c:v','ffv1','-y',source],{input:data});
  execFileSync('ffmpeg',['-v','error','-i',source,'-vf','fps=30','-c:v','ffv1','-y',ingest]);
  const worker=execFileSync('ffmpeg',['-v','error','-i',ingest,'-vf','setpts=PTS-STARTPTS,fps=24:start_time=0:round=up','-frames:v','96','-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  for(const frameIndex of [6,18,30,48,72,90]){
   const png=execFileSync('ffmpeg',sourceFrameArgs(source,{sampling:SEQUENCE_SAMPLER,start:0,end:4,fps:24,frameIndex,programmeStart:0,programmeDuration:4}),{maxBuffer:1024*1024});
   const rgb=execFileSync('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:png});
   const expected=worker.subarray(frameIndex*16*16*3,(frameIndex+1)*16*16*3);assert.equal(rgb.length,expected.length);for(let i=0;i<rgb.length;i++)assert(Math.abs(rgb[i]-expected[i])<=1,`frame ${frameIndex}, channel ${i}`);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
