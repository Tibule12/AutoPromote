const {createFactoryArtifactAccess}=require('../src/services/contentFactoryArtifactAccess');
const fs=require('fs/promises'),os=require('os'),path=require('path');
const execFile=require('util').promisify(require('child_process').execFile);
test('CPU artifact verification works without NVIDIA configuration and rejects stale hashes or escaping symlinks',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'factory-artifact-'));
 try{
  await fs.mkdir(path.join(root,'private'));
  await execFile('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(root,'private','source.mp4')]);
  const access=createFactoryArtifactAccess({root:path.join(root,'private')}),verified=await access.verifyArtifact({path:'source.mp4'});
  expect(verified.hasAudio).toBe(true);expect(verified.width).toBe(160);expect(verified.duration).toBeCloseTo(.5,1);expect(verified.sha256).toMatch(/^[a-f0-9]{64}$/);
  await expect(access.verifyArtifact({...verified,sha256:'a'.repeat(64)})).rejects.toMatchObject({code:'CONTENT_FACTORY_ARTIFACT_HASH_MISMATCH'});
  await fs.copyFile(path.join(root,'private','source.mp4'),path.join(root,'outside.mp4'));await fs.symlink(path.join(root,'outside.mp4'),path.join(root,'private','escape.mp4'));
  await expect(access.verifyArtifact({path:'escape.mp4'})).rejects.toMatchObject({code:'CONTENT_FACTORY_ARTIFACT_OUTSIDE_WORKSPACE'});
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
