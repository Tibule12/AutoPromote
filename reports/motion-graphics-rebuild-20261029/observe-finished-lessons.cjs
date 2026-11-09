// Observe existing accepted jobs only. Never submits or retries an export.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(command,args,env,log){
  const output=fs.openSync(log,'w',0o600);
  try{await new Promise((resolve,reject)=>{
    const p=spawn(command,args,{cwd:root,env,stdio:['ignore',output,output]});
    p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(path.basename(log)+' exited '+code)));
  });}finally{fs.closeSync(output)}
}
async function observe(story){
 const folder=path.join(__dirname,'proof',story,'visible-controls/tutorial/camera-r3');
 const phase=story==='logo'?'render':'correct-source-render';
 const until=Date.now()+2*60*60*1000;
 while(!fs.existsSync(path.join(folder,phase+'-observation.json'))){
   if(Date.now()>until)throw Error(story+': observation deadline; retain and recover the existing accepted job.');
   await wait(15000);
 }
 if(!fs.existsSync(path.join(folder,'final/render-receipt.json')))throw Error(story+': no actual native receipt');
 console.log(story+': completed native download observed; checking the actual movie.');
 const env={...process.env,TMPDIR:'/dev/shm',STUDIO_QA_LOOPBACK:'127.0.0.38',STUDIO_MOTION_TAKE:'visible-controls',
   STUDIO_TUTORIAL_REVISION:'camera-r3',STUDIO_QA_CAPTURE_FPS:'6'};
 await run('python3',[path.join(__dirname,'verify-lessons.py'),story],env,path.join(folder,'independent-check.private.log'));
 await run(process.execPath,[path.join(__dirname,'phone-fit.cjs'),story],env,path.join(folder,'phone-fit.private.log'));
 await run(process.execPath,[path.join(__dirname,'native-lesson.cjs'),story,'restore'],env,path.join(folder,'cold-restore.private.log'));
 await run(process.execPath,[path.join(__dirname,'native-lesson.cjs'),story,'view'],env,path.join(folder,'full-playback.private.log'));
 console.log(story+': decode, narration, phone scenarios, independent restore and full native playback complete.');
 return {story,verified:true,agentEncodedPictureReviewPending:true,ownerApproved:false,scheduled:false};
}
(async()=>{
 const results=await Promise.allSettled(['logo','transition'].map(observe));
 fs.writeFileSync(path.join(__dirname,'finished-observations.json'),JSON.stringify(results,null,2)+'\n');
 for(const r of results)if(r.status==='rejected'){console.error(r.reason.message);process.exitCode=1}
})().catch(error=>{console.error(error.message);process.exitCode=1});
