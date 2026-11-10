// Resume only after the reviewed short shoulder join is actually encoded.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),crypto=require('crypto');
const root=path.resolve('reports/background-replacement-20261101/private/four-minute-r9'),joined='/dev/shm/autopromote-background-four-minute-r9/current-neural-joined';
async function run(cmd,args,log){const fd=fs.openSync(path.join(root,log),'a',0o600),p=spawn(cmd,args,{env:{...process.env,PYTHONPATH:'/home/tibule12/.cache/autopromote-model-runtime/source-edge-deps-1.1.16:.',OPENBLAS_NUM_THREADS:'1'},stdio:['ignore',fd,fd]});fs.closeSync(fd);await new Promise((ok,no)=>{p.once('error',no);p.once('exit',c=>c===0?ok():no(Error(`${cmd} exited ${c}`)));});}
(async()=>{const deadline=Date.now()+600000;while(!fs.existsSync(path.join(joined,'assembly-verification.json'))){if(Date.now()>deadline)throw Error('Shoulder join did not finish within bounded wait');await new Promise(r=>setTimeout(r,2000));}
 const receipt=JSON.parse(fs.readFileSync(path.join(joined,'assembly-verification.json')));if(receipt.frames!==5760||!receipt.currentNeuralBodyCorrection||!receipt.shoulderJoinCorrection)throw Error('Complete source correction is missing');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(joined,'Four-minute repaired preview.mp4'))).digest('hex');if(hash!==receipt.previewSha256)throw Error('Encoded source bytes changed');
 fs.renameSync(path.join(root,'assembled'),path.join(root,'before-shoulder-join-assembly'));fs.mkdirSync(path.join(root,'assembled'));for(const name of ['Four-minute repaired preview.mp4','Full alpha matte - lossless.mkv','assembly-verification.json'])fs.copyFileSync(path.join(joined,name),path.join(root,'assembled',name));
 // All other matte frames remain byte-identical; the head review is unchanged
 // spatially. Keep the prior actual review index and record the corrected movie.
 const index=JSON.parse(fs.readFileSync(path.join(root,'actual-four-minute-review/review-index.json')));index.preShoulderJoinReview=true;index.shoulderJoinFrames=[5376,5424];index.finalPreviewSha256=hash;index.additionalActual48FrameReviewRequired=true;fs.writeFileSync(path.join(root,'actual-four-minute-review/review-index.json'),JSON.stringify(index,null,2));
 await run(process.execPath,['scripts/background-replacement/complete-four-minute-review.cjs','--resume-native'],'completion.log');
})().catch(e=>{fs.writeFileSync(path.join(root,'final-native-continuation-failure.json'),JSON.stringify({error:e.message,visualGate:false,paidCloud:false}));process.exitCode=1;});
