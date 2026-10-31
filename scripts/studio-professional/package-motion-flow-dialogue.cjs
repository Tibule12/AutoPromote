// Portable source packaging and static comparison of already-native movies.
// No edit decisions or evaluated effects are created here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto'),{hash}=require('../../src/creativeTemplates/contract');
const base=path.resolve(__dirname,'../../reports/studio-motion-flow-takeover-20261031'),folder=path.join(base,'dialogue');
async function portable(){
  const backup=JSON.parse(fs.readFileSync(path.join(folder,'Editable Project.autopromote.json'))),before=hash(backup.snapshot.studioDocument);
  backup.mediaFiles||=[];const markers=new Map(),artwork=[];
  const config=JSON.parse(fs.readFileSync(path.join(process.argv[3],'config.json')));
  assert.equal(config.env.GCLOUD_PROJECT,'demo-autopromote-credits');assert.equal(new URL(config.storageOrigin).hostname,'127.0.0.1');
  for(const layer of backup.snapshot.overlays.filter(o=>o.type==='image')){
    assert(/^uploads\/images\/demo-pilot-alice\//.test(layer.sourceStoragePath));
    assert.equal(new URL(layer.src).origin,config.storageOrigin);
    const url=config.storageOrigin+'/v0/b/demo-autopromote-credits/o/'+encodeURIComponent(layer.sourceStoragePath);
    const metadataResponse=await fetch(url,{headers:{Authorization:'Bearer owner'}});assert(metadataResponse.ok);
    const metadata=await metadataResponse.json();assert.equal(metadata.metadata.ownerUid,'demo-pilot-alice');assert.equal(metadata.name,layer.sourceStoragePath);
    const response=await fetch(url+'?alt=media',{headers:{Authorization:'Bearer owner'}});assert(response.ok);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('md5').update(bytes).digest('base64'),metadata.md5Hash);assert(bytes.length<2*1024**2);
    const marker={__autopromoteMediaFile:backup.mediaFiles.length};
    backup.mediaFiles.push({name:layer.name+'.png',type:'image/png',lastModified:0,data:bytes.toString('base64')});
    markers.set(layer.sourceStoragePath,marker);artwork.push({name:layer.name,bytes:bytes.length,sha256:hash(bytes)});
  }
  for(const media of backup.snapshot.projectMedia){
    assert(['presenter-1.mp4','presenter-2.mp4'].includes(media.name));
    const file=path.join(base,'media',media.name),bytes=fs.readFileSync(file);assert.equal(hash(bytes),media.contentHash);
    const marker={__autopromoteMediaFile:backup.mediaFiles.length};
    backup.mediaFiles.push({name:media.name,type:'video/mp4',lastModified:fs.statSync(file).mtimeMs,data:bytes.toString('base64')});
    markers.set(media.storagePath,marker);
  }
  const visit=value=>{if(!value||typeof value!=='object')return;const marker=markers.get(value.sourceStoragePath||value.storagePath);if(marker)value.file={...marker};Object.entries(value).forEach(([key,item])=>{if(key!=='studioDocument')visit(item);});};
  visit(backup.snapshot);assert.equal(hash(backup.snapshot.studioDocument),before,'Packaging must preserve canonical decisions');
  fs.writeFileSync(path.join(folder,'Portable Project.autopromote.json'),JSON.stringify(backup,null,2));
  fs.writeFileSync(path.join(folder,'portable-packaging.json'),JSON.stringify({canonicalHash:before,artwork,sourceVideos:2,canonicalDecisionsUnchanged:true},null,2));
  console.log(JSON.stringify({portableProject:true,canonicalHash:before,embeddedSources:markers.size}));
}
function review(){
  const target='/home/tibule12/Videos/AutoPromote Motion and Flow - 2026-10-31/Dialogue revision';fs.mkdirSync(target,{recursive:true});
  const receipt=JSON.parse(fs.readFileSync(path.join(folder,'native-motion-flow/render-receipt.json')));
  for(const name of ['Editable Project.autopromote.json','Portable Project.autopromote.json'])assert.equal(hash(JSON.parse(fs.readFileSync(path.join(folder,name))).snapshot.studioDocument),receipt.projectHash);
  const movie=path.join(folder,'native-motion-flow/final.mp4');assert.equal(hash(fs.readFileSync(movie)),receipt.outputSha256);
  const copy=(from,to)=>fs.copyFileSync(from,path.join(target,to));
  copy(movie,'Dialogue opening - revision.mp4');copy(path.join(base,'native-raw-source/final.mp4'),'Raw cut.mp4');
  copy(path.join(folder,'Portable Project.autopromote.json'),'Dialogue Opening - portable.autopromote.json');
  copy(path.join(folder,'Editable Project.autopromote.json'),'Dialogue Opening.autopromote.json');
  copy(path.join(folder,'native-motion-flow/render-receipt.json'),'Native export receipt.json');
  for(const name of ['output-verification.json','portable-restore.json','playback.json','export-playback.json','cue-review.json','runtime-manifest.json','vector-image-fit.json'])copy(path.join(folder,name),name);
  copy(path.join(folder,'export-contact-sheet.jpg'),'Exported frames.jpg');
  copy(path.join(folder,'complete-export-playback-in-studio.mp4'),'Studio - complete revision playback.mp4');
  for(const name of fs.readdirSync(folder).filter(n=>/^editing-in-studio.*\.mp4$/.test(n)))copy(path.join(folder,name),'Studio - '+name);
  copy(path.join(folder,'Feedback.md'),'Feedback.md');
  execFileSync('ffmpeg',['-v','error','-y','-threads','2','-i',path.join(base,'native-raw-source/final.mp4'),'-threads','2','-i',movie,
    '-filter_complex_threads','1','-filter_complex',"[0:v]scale=640:360:flags=lanczos,setsar=1[a];[1:v]scale=640:360:flags=lanczos,setsar=1[b];[a][b]hstack=inputs=2,pad=1280:410:0:50:color=0x090d14,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='RAW SOURCE':x=24:y=16:fontsize=18:fontcolor=white,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='STUDIO REVISION - UNAPPROVED':x=664:y=16:fontsize=18:fontcolor=white[v]",
    '-map','[v]','-map','1:a:0','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','copy','-t','15.75','-movflags','+faststart',path.join(target,'Raw versus revision.mp4')],{timeout:180000});
  const files=fs.readdirSync(target).filter(name=>name!=='Review manifest.json'&&fs.statSync(path.join(target,name)).isFile()).map(name=>({name,bytes:fs.statSync(path.join(target,name)).size,sha256:hash(fs.readFileSync(path.join(target,name)))}));
  fs.writeFileSync(path.join(target,'Review manifest.json'),JSON.stringify({creativeStatus:'UNAPPROVED_DIALOGUE_REVISION',projectId:receipt.projectId,projectHash:receipt.projectHash,nativeOutputSha256:receipt.outputSha256,comparisonScope:'Static comparison packaging of two native movies; all evaluated effects remain in the native edit.',files},null,2));
  console.log(JSON.stringify({target,files:files.length,nativeOutputSha256:receipt.outputSha256}));
}
if(process.argv[2]==='portable')portable().catch(e=>{console.error(e);process.exitCode=1;});else if(process.argv[2]==='review')review();else throw Error('Use portable or review after native export.');
