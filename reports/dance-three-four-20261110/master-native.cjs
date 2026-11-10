const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process'),r=__dirname,repo=path.resolve(r,'../..'),browser=r+'/private/browser';
const run=(command,args,name)=>new Promise((resolve,reject)=>{const log=fs.openSync(r+'/private/'+name+'.log','a',0o600),p=spawn(command,args,{cwd:repo,env:process.env,stdio:['ignore',log,log]});fs.closeSync(log);p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error(name+' failed: '+code)));});
(async()=>{
 const selected=JSON.parse(fs.readFileSync(r+'/selected-local-build.json'));assert(selected.build.endsWith('/candidate-build-final'));
 const doc=JSON.parse(fs.readFileSync(r+'/private/three/Editable Project.autopromote.json'));assert.equal(doc.snapshot.audioRemix.speed,1);assert.equal(doc.snapshot.audioRemix.pitch,0);assert.equal(doc.snapshot.audioRemix.reverb,0);assert.equal(doc.snapshot.audioRemix.outputGain,6);
 await run(process.execPath,[r+'/verify-assets.cjs'],'master-assets');await run(process.execPath,[r+'/preflight.cjs'],'master-preflight');
 await run(process.execPath,[r+'/browser-proof.cjs',browser,'preview','three'],'preview-three-master');
 assert(!fs.existsSync(r+'/private/three/native-motion-flow-render-request.private.json'),'Do not duplicate the corrected render');await run(process.execPath,[r+'/browser-proof.cjs',browser,'render','three'],'render-three-master');
 await run(process.execPath,[r+'/bind-native.cjs','three'],'binding-three-master');await run('/home/tibule12/Projects/AutoPromte/AutoPromote/.venv/bin/python',[r+'/review.py','three'],'review-three-master');
 await run(process.execPath,[r+'/browser-proof.cjs',browser,'finished','three'],'finished-three-master');await run(process.execPath,[r+'/bind-native.cjs','three'],'binding-three-master-final');
 await run(process.execPath,[r+'/snapshot.cjs'],'final-snapshot');console.log('Corrected source music mastered through native Studio; exact export, complete playback and prior wallet/history preservation pass.');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
