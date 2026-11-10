// Keep existing emulator records; start a separate bounded local review worker.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
async function main(){
 const dir=path.resolve(process.argv[2]),original=path.join(dir,'config.json'),config=JSON.parse(fs.readFileSync(original));
 assert.equal(config.env.UNIFIED_CREDITS_PROJECT_ID,'demo-autopromote-credits');assert.match(config.origin,/^http:\/\/127\.0\.0\.1:/);assert.match(config.env.FIRESTORE_EMULATOR_HOST,/^127\.0\.0\.1:\d+$/);
 const resume=process.argv.includes('--resume-stopped');
 if(resume){
  let response=null;try{response=await fetch(config.origin);}catch{}
  assert.equal(response,null,'Resume only an actually stopped local API');
  for(const name of ['config.json.api-pid','config-long-r9.json.api-pid']){
   const f=path.join(dir,name);if(!fs.existsSync(f))continue;
   const pid=Number(fs.readFileSync(f,'utf8'));assert(!fs.existsSync(`/proc/${pid}`),'Do not replace a live process');
  }
 }else{const health=await (await fetch(config.worker.origin+'/health')).json();assert.equal(health.worker_state.status,'idle','Preserve active local processing');}
 const env={...config.env,STUDIO_BACKGROUND_LONG_DEMO:'true'};
 const worker=await require('../monetization/local-worker-provider.cjs').createLocalWorkerProvider({directory:path.join(dir,'worker-long-r9'),python:env.CREDITS_PYTHON_BIN,env,apiOrigin:config.origin,analysisTimeoutMs:240000});
 config.env={...env,MEDIA_WORKER_URL:worker.origin,LOCAL_MEDIA_WORKER_URL:worker.origin};config.worker={origin:worker.origin,token:worker.token,publicKey:worker.publicKey};
 const file=path.join(dir,'config-long-r9.json');fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 if(!resume){const oldPid=Number(fs.readFileSync(original+'.api-pid','utf8'));const command=fs.readFileSync(`/proc/${oldPid}/cmdline`,'utf8');assert(command.includes('application-host.cjs')&&command.includes(original));
 process.kill(oldPid,'SIGTERM');
 for(let i=0;i<100;i++){let live=false;try{live=fs.existsSync(`/proc/${oldPid}`)&&!fs.readFileSync(`/proc/${oldPid}/stat`,'utf8').split(') ')[1].startsWith('Z ');}catch{}if(!live)break;await new Promise(r=>setTimeout(r,100));}}
 const log=fs.openSync(path.join(dir,'long-review-r9-api.log'),'a',0o600);const api=spawn(process.execPath,['scripts/monetization/application-host.cjs',file],{env:{...process.env,...config.env},stdio:['ignore',log,log]});fs.closeSync(log);
 api.once('exit',code=>{console.error('LOCAL_REVIEW_API_EXIT',code);process.exitCode=code||1;void worker.stop();});
 for(let i=0;i<100;i++){try{const response=await fetch(config.origin);if(response.ok){fs.writeFileSync(path.join(dir,'long-review-r9-ready.json'),JSON.stringify({origin:config.origin,apiPid:api.pid,workerPid:process.pid,localOnly:true,recordsPreserved:true,paidCloud:false}),{mode:0o600});console.log('LOCAL_LONG_REVIEW_HOST_READY',api.pid);break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 process.on('SIGTERM',()=>{api.kill('SIGTERM');void worker.stop().then(()=>process.exit(0));});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
