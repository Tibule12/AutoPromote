const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream'),crypto=require('node:crypto');
const {hashCompletedStudioSource}=require('../../src/services/studioCompletedSourceHash');
test('completed Studio hash reads the exact generation and rejects incomplete bytes',async()=>{
  const bytes=Buffer.from('actual recorded source'),calls=[];
  const bucket={file:(name,options)=>{calls.push({name,options});return{createReadStream:()=>Readable.from([bytes])};}};
  const args={bucket,storagePath:'studio/sources/owner/shot.mp4',generation:'123',size:bytes.length};
  assert.equal(await hashCompletedStudioSource(args),crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(calls[0].options.generation,'123');
  await assert.rejects(hashCompletedStudioSource({...args,size:bytes.length+1}),/SIZE_CHANGED/);
  await assert.rejects(hashCompletedStudioSource({...args,storagePath:'uploads/videos/other/shot.mp4'}),/IDENTITY_UNAVAILABLE/);
});
