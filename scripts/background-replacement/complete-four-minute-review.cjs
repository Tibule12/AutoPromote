// Complete real local authoring, transport and evidence after the actual passes.
// Creative approval remains false throughout; this never contacts cloud providers.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve('reports/background-replacement-20261101/private/four-minute-r9'),ram='/dev/shm/autopromote-background-four-minute-r9',python='/home/tibule12/Projects/AutoPromte/AutoPromote/.venv/bin/python';
const env={...process.env,NODE_PATH:'/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules',PYTHONPATH:'/home/tibule12/.cache/autopromote-model-runtime/source-edge-deps-1.1.16:.',OPENBLAS_NUM_THREADS:'1',NUMBA_NUM_THREADS:'1',STUDIO_REVIEW_PROJECT_NAME:'Four-minute repair - current neural body - 3 November'};
const demo=fs.existsSync(path.join(root,'current-native-demo.json'))?JSON.parse(fs.readFileSync(path.join(root,'current-native-demo.json'))).directory:'/tmp/autopromote-application-demo-46N4Hm',destination='/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute repair - 2026-11-03';
function status(stage,extra={}){fs.writeFileSync(path.join(root,'completion-state.json'),JSON.stringify({stage,updatedAt:new Date().toISOString(),visualApproval:false,paidCloud:false,...extra},null,2));console.log(stage);}
async function run(name,command,args){status(name);const log=fs.openSync(path.join(root,name+'.log'),'a',0o600);const child=spawn(command,args,{env,stdio:['ignore',log,log]});fs.closeSync(log);await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${name} failed with ${code}`)));});}
(async()=>{
 status('waiting-for-actual-corrected-frames');const deadline=Date.now()+3600000;
 for(;;){const parts=[['delivery',0],['delivery',60],['finished',120],['finished',180]].map(([n,t])=>path.join(ram,`${n}-${t}`,'receipt.json'));if(parts.every(f=>fs.existsSync(f)))break;if(Date.now()>deadline)throw Error('Bounded completion wait elapsed; preserve all outputs');await new Promise(r=>setTimeout(r,2000));}
 if(process.argv.includes('--resume-native')){
  const actual=require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'assembled/Four-minute repaired preview.mp4'))).digest('hex');
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'assembled/assembly-verification.json')));
  if(actual!==receipt.previewSha256||receipt.frames!==5760||receipt.sourceSha256!=='93ce466b525041df305e839154645bd8fb5b9ec9b621c64d4c2afd5d9badff8a')throw Error('Final corrected source changed');
  if(JSON.parse(fs.readFileSync(path.join(root,'actual-four-minute-review/review-index.json'))).fullFramesDecoded!==5760)throw Error('Actual source review missing');
  if(receipt.currentNeuralBodyCorrection)await run('actual-short-propagation-check',python,['scripts/background-replacement/verify-neural-short-propagation.py',root]);
 }else{
  await run('assemble-corrected-four-minutes',python,['scripts/background-replacement/assemble-repaired-four-minutes.py',ram,path.join(root,'assembled')]);
  await run('actual-moving-frame-review',python,['scripts/background-replacement/review-repaired-four-minutes.py',path.join(root,'assembled/Four-minute repaired preview.mp4'),path.join(root,'actual-four-minute-review')]);
 }
 await run('native-author-source',process.execPath,['scripts/background-replacement/prepare-long-review-native.cjs',demo,path.join(root,'assembled/Four-minute repaired preview.mp4'),path.join(root,'native-final'),env.STUDIO_REVIEW_PROJECT_NAME]);
 await run('native-save-reopen-export',process.execPath,['scripts/background-replacement/finish-long-review-native.cjs',demo,path.join(root,'native-final')]);
 await run('native-picture-audio-check',python,['scripts/background-replacement/verify-repaired-long-native.py',root]);
 await run('native-complete-playback',process.execPath,['scripts/background-replacement/record-long-review.cjs',demo,path.join(root,'native-final'),path.join(root,'native-recording')]);
 await run('package-actual-media',python,['scripts/background-replacement/package-repaired-four-minutes.py',root,destination]);
 status('media-ready-awaiting-visual-assessment',{destination});
})().catch(error=>{status('stopped-on-verification-failure',{error:error.message});process.exitCode=1;});
