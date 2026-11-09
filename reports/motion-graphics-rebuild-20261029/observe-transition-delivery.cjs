// Validate genuine native delivery copies. The original timed-out job stays failed.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),base=path.join(__dirname,'proof/transition/visible-controls/tutorial');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(command,args,env,log){const out=fs.openSync(log,'w',0o600);try{await new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:root,env,stdio:['ignore',out,out]});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(path.basename(log)+' exited '+code)))})}finally{fs.closeSync(out)}}
async function verify(revision,recovery){
 const folder=path.join(base,revision),env={...process.env,TMPDIR:'/dev/shm',STUDIO_MOTION_TAKE:'visible-controls',STUDIO_TUTORIAL_REVISION:revision,STUDIO_RECOVER_COMPLETED_ARTIFACT:recovery?'1':'0'};
 await run('python3',[path.join(__dirname,'verify-lessons.py'),'transition'],env,path.join(folder,'independent-check.private.log'));
 await run(process.execPath,[path.join(__dirname,'phone-fit.cjs'),'transition'],env,path.join(folder,'phone-fit.private.log'));
 await run(process.execPath,[path.join(__dirname,'native-feed.cjs'),'transition','restore'],env,path.join(folder,'cold-restore.private.log'));
 await run(process.execPath,[path.join(__dirname,'native-feed.cjs'),'transition','view'],env,path.join(folder,'full-playback.private.log'));
 console.log(revision+': full decode, voice, fit, exact restore and complete native delivery timeline playback passed.');
}
(async()=>{
 const portrait=path.join(base,'native-recovered-portrait'),until=Date.now()+3600000;
 while(!fs.existsSync(path.join(portrait,'all-observation.json'))){if(Date.now()>until)throw Error('Existing delivery job still pending; no retry.');await sleep(10000)}
 const feedEnv={...process.env,TMPDIR:'/dev/shm',STUDIO_RECOVER_COMPLETED_ARTIFACT:'0'};
 const feed=run(process.execPath,[path.join(__dirname,'native-feed.cjs'),'transition','all'],feedEnv,path.join(__dirname,'transition-feed.private.log'));
 const checked=verify('native-recovered-portrait',true);
 await Promise.all([feed,checked]);await verify('feed-4-5',false);
 fs.writeFileSync(path.join(__dirname,'transition-delivery-observations.json'),JSON.stringify({nativePortraitDeliveryVerified:true,nativeFeedDeliveryVerified:true,originalApiJobRemainsFailed:true,originalLayeredAssemblyRetainedSeparately:true,ownerApproved:false,scheduled:false},null,2)+'\n');
})().catch(error=>{console.error(error.message);process.exitCode=1});
