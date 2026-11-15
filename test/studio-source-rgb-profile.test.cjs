const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {sourceFrameArgs}=require('../src/services/studioSourceFrameService');
const {SEQUENCE_SAMPLER}=require('../frontend/src/components/studioSequencePictureClock');
const source=path.resolve(__dirname,'../reports/studio-stability-20261007/media/podcast-12s.mp4');
for(const sampling of ['studio-sequence-source-frame-v1','studio-3d-texture-frame-v1',SEQUENCE_SAMPLER]){
  test(`${sampling}: actual decoded PNG describes sRGB pixels without inherited P3/video tags`,()=>{
    const png=execFileSync('ffmpeg',sourceFrameArgs(source,{start:0,end:12,fps:24,frameIndex:24,sampling,programmeStart:0,programmeDuration:12}),{maxBuffer:16*1024*1024,timeout:30000});
    const chunks=new Map();for(let pos=8;pos+12<=png.length;){const size=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8);chunks.set(type,png.subarray(pos+8,pos+8+size));pos+=size+12;}
    assert(chunks.has('sRGB'));assert.equal(chunks.get('gAMA')?.readUInt32BE(0),45455);
    const chrm=chunks.get('cHRM');assert(chrm);assert.equal(chrm.readUInt32BE(8),64000);assert.equal(chrm.readUInt32BE(16),30000);
  });
}
