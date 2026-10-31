// Owned bytes only. Client duration/aspect/hash never substitutes for probing.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),MAX_BYTES=50*1024**2;
async function verifyOwnedVideo(file,metadata,scene,ownerUid){
  if(metadata.metadata?.ownerUid!==ownerUid || metadata.contentType!=='video/mp4' ||
    !Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size)<=0 || Number(metadata.size)>MAX_BYTES ||
    metadata.metadata?.contentHash!==scene.assetContentHash)throw Error('Invalid video texture ownership, hash or size');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-texture-'));
  try{
    const target=path.join(dir,'source.mp4');
    await file.download({destination:target,validation:'crc32c'});
    const bytes=await fs.readFile(target);
    if(bytes.length!==Number(metadata.size)||crypto.createHash('sha256').update(bytes).digest('hex')!==scene.assetContentHash)throw Error('Invalid video texture content hash');
    const {stdout}=await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',target],{timeout:15000,maxBuffer:1024**2});
    const probe=JSON.parse(stdout),video=probe.streams.find(s=>s.codec_type==='video');
    if(!video || video.codec_name!=='h264' || video.width<16 || video.height<16 || video.width*video.height>8192**2 ||
      !Number.isFinite(Number(video.duration||probe.format.duration)) ||
      Number(video.duration||probe.format.duration)+.001<scene.assetSourceStart+scene.duration ||
      Math.abs(video.width/video.height-scene.assetAspect)>.002)throw Error('Invalid video texture dimensions, format or source range');
    return {sha256:scene.assetContentHash,width:video.width,height:video.height};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={verifyOwnedVideo,MAX_BYTES};
