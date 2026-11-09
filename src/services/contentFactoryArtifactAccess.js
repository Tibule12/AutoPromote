const fs=require('fs/promises'),path=require('path'),crypto=require('crypto');
const execFile=require('util').promisify(require('child_process').execFile);
const {error}=require('./contentFactoryContract');
// Byte verification and canonical assembly work without an active GPU window.
function createFactoryArtifactAccess({root}) {
 root=path.resolve(root);
 const artifactPath=async artifact=>{
  if(!artifact?.path)throw error('CONTENT_FACTORY_ARTIFACT_MISSING',409);
  const [real,realRoot]=await Promise.all([fs.realpath(path.resolve(root,artifact.path)),fs.realpath(root)]);
  if(!real.startsWith(realRoot+path.sep))throw error('CONTENT_FACTORY_ARTIFACT_OUTSIDE_WORKSPACE',409);
  return real;
 };
 async function verifyArtifact(artifact,{signal}={}){
  const real=await artifactPath(artifact),stat=await fs.stat(real);
  if(stat.size<44||stat.size>512*1024*1024)throw error('CONTENT_FACTORY_ARTIFACT_SIZE_INVALID');
  const sha256=crypto.createHash('sha256').update(await fs.readFile(real)).digest('hex');
  if(artifact.sha256&&artifact.sha256!==sha256)throw error('CONTENT_FACTORY_ARTIFACT_HASH_MISMATCH',409);
  const info=JSON.parse((await execFile('ffprobe',['-v','error','-show_streams','-show_format','-of','json',real],{signal,timeout:30000,maxBuffer:1024*1024})).stdout);
  const stream=info.streams.find(s=>s.codec_type==='video')||info.streams.find(s=>s.codec_type==='audio');
  const duration=Number(stream?.duration||info.format?.duration||artifact.duration);
  if(!stream||!Number.isFinite(duration)||duration<=0)throw error('CONTENT_FACTORY_ARTIFACT_DURATION_INVALID');
  return {path:path.relative(root,real).split(path.sep).join('/'),sha256,bytes:stat.size,duration,codec:stream.codec_name,
   container:path.extname(real).slice(1),fps:stream.codec_type==='video'?Math.round(Number(stream.r_frame_rate.split('/')[0])/Number(stream.r_frame_rate.split('/')[1])):24,
   width:stream.width||null,height:stream.height||null,hasAudio:info.streams.some(s=>s.codec_type==='audio')};
 }
 return {artifactPath,verifyArtifact,urlFor:artifact=>{
  if(!artifact?.path)throw error('CONTENT_FACTORY_MEDIA_REFERENCE_MISSING',409);
  return `http://127.0.0.1:8765/${artifact.path.split('/').map(encodeURIComponent).join('/')}`;
 }};
}
module.exports={createFactoryArtifactAccess};
