// Explicit emulator-only transport for the same validated Blender renderer.
// It cannot dispatch a cloud job or read a production bucket.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
function configuration(env=process.env){
  if(env.STUDIO_3D_LOCAL_ENABLED==='true')return {...require('./studio3DLocalDurable').configuration(env),durable:true};
  if(env.STUDIO_3D_LOCAL_CPU!=='1')return null;
  if(env.GCLOUD_PROJECT!=='demo-autopromote-credits'||env.GOOGLE_CLOUD_PROJECT!=='demo-autopromote-credits'||
    env.UNIFIED_CREDITS_SANDBOX!=='true'||!env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')||
    !env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:'))throw Error('Local 3D requires isolated demo emulators');
  const origin=new URL(env.STORAGE_EMULATOR_HOST||'');
  if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||origin.username||origin.password||origin.pathname!=='/')throw Error('Local 3D storage must be loopback');
  if(!path.isAbsolute(env.STUDIO_3D_BLENDER_BIN||''))throw Error('Local 3D requires an explicit installed Blender binary');
  return {storageOrigin:origin.origin,blender:env.STUDIO_3D_BLENDER_BIN};
}
async function publicUrl(file,ownerUid){
  const config=configuration();if(!config)throw Error('Local 3D transport is disabled');
  if(!file.name.startsWith(`temp_studio_3d/${ownerUid}/`)||file.name.includes('..'))throw Error('Invalid local 3D asset path');
  const [metadata]=await file.getMetadata();
  if(metadata.metadata?.ownerUid!==ownerUid)throw Error('Local 3D asset ownership mismatch');
  const token=metadata.metadata?.firebaseStorageDownloadTokens;if(!/^[a-f0-9-]{36}$/.test(token||''))throw Error('Local 3D download token unavailable');
  return `${config.storageOrigin}/v0/b/demo-autopromote-credits/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}
async function uploadArtifact(bucket,destination,bytes,metadata){
  const config=configuration();if(!config||bucket.name!=='demo-autopromote-credits')throw Error('Demo-only artifact upload required');
  const start=await fetch(config.storageOrigin+'/v0/b/demo-autopromote-credits/o?name='+encodeURIComponent(destination),{
    method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start'},
    body:JSON.stringify({name:destination,...metadata}),signal:AbortSignal.timeout(30000)});
  if(!start.ok)throw Error('Local alpha upload could not start');
  const upload=new URL(start.headers.get('x-goog-upload-url'));
  if(upload.origin!==config.storageOrigin)throw Error('Local alpha upload left the emulator');
  for(let offset=0;offset<bytes.length;offset+=8*1024**2){
    const chunk=bytes.subarray(offset,Math.min(bytes.length,offset+8*1024**2));
    const response=await fetch(upload,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/octet-stream',
      'X-Goog-Upload-Command':offset+chunk.length===bytes.length?'upload, finalize':'upload','X-Goog-Upload-Offset':String(offset)},body:chunk,signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('Local alpha upload chunk failed');
  }
  const [download]=await bucket.file(destination).download();
  if(download.length!==bytes.length||crypto.createHash('sha256').update(download).digest('hex')!==crypto.createHash('sha256').update(bytes).digest('hex'))throw Error('Local alpha upload failed full SHA-256 verification');
}
async function render({jobId,spec,bucket,onRendering}){
  const config=configuration();if(!config||bucket.name!=='demo-autopromote-credits'||!/^[A-Za-z0-9_-]{8,100}$/.test(jobId))throw Error('Invalid local 3D execution');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-3d-local-'));
  const startedAt=Date.now();
  try{
    const specFile=path.join(directory,'spec.json');await fs.writeFile(specFile,JSON.stringify(spec),{mode:0o600});
    const args=[path.resolve(__dirname,'../../studio_3d_renderer/render.py'),'--spec',specFile,'--output',path.join(directory,'output')];
    if(spec.scene.assetStoragePath){
      const prefix=`temp_studio_3d/${spec.ownerUid}/${jobId}/asset.`;
      if(!spec.scene.assetStoragePath.startsWith(prefix)||! /^(png|jpg|webp|mp4)$/.test(spec.scene.assetStoragePath.slice(prefix.length)))throw Error('Invalid staged local asset');
      const file=bucket.file(spec.scene.assetStoragePath),[metadata]=await file.getMetadata();
      if(Number(metadata.size)<1||Number(metadata.size)>(spec.scene.assetType==='video'?50:5)*1024**2)throw Error('Local texture exceeds size limit');
      const asset=path.join(directory,'asset');await file.download({destination:asset});args.push('--asset',asset);
    }
    await onRendering();
    await execute('timeout',['--signal=TERM','--kill-after=10s','600s','prlimit','--cpu=300',
      '--fsize=786432000','--',process.env.CREDITS_PYTHON_BIN||path.resolve(__dirname,'../../../AutoPromote/.venv/bin/python'),...args],{
      cwd:path.resolve(__dirname,'../..'),timeout:620000,maxBuffer:8*1024**2,
      env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',STUDIO_3D_DEVICE:'cpu',STUDIO_3D_SAMPLES:'4',
        STUDIO_3D_BLENDER_BIN:config.blender,STUDIO_3D_NATIVE_PLANAR:'1',CUDA_VISIBLE_DEVICES:'-1',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'1'},
    });
    const receipt=JSON.parse(await fs.readFile(path.join(directory,'output/receipt.json'),'utf8'));
    if(receipt.device?.backend!=='CPU'||receipt.device.gpu_verified!==false)throw Error('Local 3D CPU device was not verified');
    receipt.transport='isolated-emulator-local-cpu';receipt.wallMs=Date.now()-startedAt;
    const outputs=[];
    for(const [name,type] of [['preview.mp4','video/mp4'],['overlay.mov','video/quicktime']]){
      const bytes=await fs.readFile(path.join(directory,'output',name)),expected=receipt.artifacts?.[name];
      if(!expected||bytes.length!==expected.bytes||bytes.length>(name==='preview.mp4'?100:750)*1024**2||crypto.createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Local 3D artifact hash mismatch');
      const destination=`temp_studio_3d/${spec.ownerUid}/${jobId}/${name}`;
      await uploadArtifact(bucket,destination,bytes,{contentType:type,metadata:{ownerUid:spec.ownerUid,sha256:expected.sha256,firebaseStorageDownloadTokens:crypto.randomUUID()}});
      outputs.push({name,destination,...expected});
    }
    return {receipt,outputs};
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}
module.exports={configuration,render,publicUrl,uploadArtifact,
 available:config=>config.durable?require('./studio3DLocalDurable').available(config):Promise.resolve(),
 launch:options=>require('./studio3DLocalDurable').launch(options),
 reconcile:options=>options.config.durable?require('./studio3DLocalDurable').reconcile(options):Promise.resolve(options.data)};
