// Read the original accepted job; recover it through Studio after completion.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const env={...process.env,TMPDIR:'/dev/shm',STUDIO_QA_LOOPBACK:'127.0.0.38',STUDIO_QA_API_PORT:'5138',STUDIO_MOTION_TAKE:'visible-controls',STUDIO_TUTORIAL_REVISION:'camera-r3'};
const root=path.resolve(__dirname,'../..'),folder=path.join(__dirname,'proof/transition/visible-controls/tutorial/camera-r3');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(file,args){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(__dirname,file),...args],{cwd:root,env,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(file+' exited '+code)))})}
(async()=>{
 const accepted=JSON.parse(fs.readFileSync(path.join(folder,'accepted.json'))),until=Date.now()+70*60000;
 while(Date.now()<until){
  await run('inspect-accepted.cjs',['transition']);
  const result=JSON.parse(fs.readFileSync(path.join(folder,'actual-accepted-status.private.json')));
  if(result.http!==200)throw Error('Could not observe the original owner-bound job. No resubmission.');
  if(result.data.status==='completed'){
   if(result.data.jobId!==accepted.jobId)throw Error('Observed job identity mismatch');
   await run('native-lesson.cjs',['transition','recover']);console.log('Original transition job recovered through Studio; no render resubmission.');return;
  }
  if(['failed','cancelled','canceled'].includes(result.data.status))throw Error('Original transition job is terminal: '+result.data.status+'. Preserve evidence and diagnose; do not resubmit automatically.');
  await sleep(45000);
 }
 throw Error('Recovery observation deadline; preserve the existing job and hold.');
})().catch(error=>{console.error(error.message);process.exitCode=1});
