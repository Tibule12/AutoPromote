const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),r=__dirname,repo=path.resolve(r,'../..'),browser=r+'/private/browser';
const run=(command,args,name)=>new Promise((resolve,reject)=>{const log=fs.openSync(r+'/private/'+name+'.log','a',0o600),p=spawn(command,args,{cwd:repo,env:process.env,stdio:['ignore',log,log]});fs.closeSync(log);p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error(name+' failed: '+code)));});
(async()=>{
 const receipt=r+'/private/three/native-motion-flow/render-receipt.json',until=Date.now()+1200000;
 while(!fs.existsSync(receipt)){assert(Date.now()<until,'Existing render observation deadline; reconcile without resubmitting');await new Promise(q=>setTimeout(q,1500));}
 await new Promise(q=>setTimeout(q,3000));
 for(const word of ['three','four']){
  if(word==='four'){await run(process.execPath,[r+'/preflight.cjs'],'preflight-four');assert(!fs.existsSync(r+'/private/four/native-motion-flow-render-request.private.json'),'Do not duplicate a submitted render');await run(process.execPath,[r+'/browser-proof.cjs',browser,'render',word],'render-four');}
  await run(process.execPath,[r+'/bind-native.cjs',word],'binding-'+word);
  await run('/home/tibule12/Projects/AutoPromte/AutoPromote/.venv/bin/python',[r+'/review.py',word],'review-'+word);
  await run(process.execPath,[r+'/browser-proof.cjs',browser,'finished',word],'finished-'+word);
  await run(process.execPath,[r+'/bind-native.cjs',word],'binding-final-'+word);
  console.log(word+': exact native movie, automated picture/audio checks and complete finished Studio playback retained');
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
