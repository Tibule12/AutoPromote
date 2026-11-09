// Preserve the portrait master. Prepare a separate normal Studio 4:5 fit.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(cmd,args,env,log){const out=fs.openSync(log,'w',0o600);try{await new Promise((resolve,reject)=>{const p=spawn(cmd,args,{cwd:root,env,stdio:['ignore',out,out]});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(path.basename(log)+' exited '+code)))})}finally{fs.closeSync(out)}}
async function observe(story){
 const base=path.join(__dirname,'proof',story,'visible-controls/tutorial'),folder=path.join(base,'feed-4-5');
 const env={...process.env,TMPDIR:'/dev/shm',STUDIO_MOTION_TAKE:'visible-controls',STUDIO_TUTORIAL_REVISION:'feed-4-5'};
 const until=Date.now()+2*3600000;
 if(story!=='product'){
  const complete=path.join(base,'camera-r3',story==='logo'?'render-observation.json':'correct-source-render-observation.json');
  while(!fs.existsSync(complete)){if(Date.now()>until)throw Error(story+': primary render still pending; do not resubmit.');await sleep(15000)}
  console.log(story+': preparing a native fitted feed copy from the actual completed master.');
  await run(process.execPath,[path.join(__dirname,'native-feed.cjs'),story,'all'],env,path.join(__dirname,story+'-feed.private.log'));
 }else{
  while(!fs.existsSync(path.join(folder,'all-observation.json'))){if(Date.now()>until)throw Error('Product feed remains pending; do not resubmit.');await sleep(15000)}
 }
 await run('python3',[path.join(__dirname,'verify-lessons.py'),story],env,path.join(folder,'independent-check.private.log'));
 await run(process.execPath,[path.join(__dirname,'phone-fit.cjs'),story],env,path.join(folder,'phone-fit.private.log'));
 await run(process.execPath,[path.join(__dirname,'native-feed.cjs'),story,'restore'],env,path.join(folder,'cold-restore.private.log'));
 await run(process.execPath,[path.join(__dirname,'native-feed.cjs'),story,'view'],env,path.join(folder,'full-playback.private.log'));
 console.log(story+': fitted feed export, decode, narration, frame-fit, exact restore and whole playback complete.');
 return{story,verified:true,agentEncodedPictureReviewPending:true,ownerApproved:false,scheduled:false};
}
(async()=>{const results=await Promise.allSettled(['product','logo','transition'].map(observe));fs.writeFileSync(path.join(__dirname,'feed-observations.json'),JSON.stringify(results,null,2)+'\n');for(const r of results)if(r.status==='rejected'){console.error(r.reason.message);process.exitCode=1}})().catch(e=>{console.error(e.message);process.exitCode=1});
