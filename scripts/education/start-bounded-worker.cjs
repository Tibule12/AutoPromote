// Retain the current emulator data and canonical worker while extending only
// the local CPU observation window. No production endpoint or paid executor.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const file=process.argv[2],config=JSON.parse(fs.readFileSync(file));
assert.equal(config.env.UNIFIED_CREDITS_PROJECT_ID,'demo-autopromote-credits');
assert.equal(new URL(config.origin).hostname,'127.0.0.1');
Object.assign(process.env,config.env);
for(const k of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FIREBASE_CONFIG'])delete process.env[k];
(async()=>{
 const provider=await require('../monetization/local-worker-provider.cjs').createLocalWorkerProvider({directory:path.join(path.dirname(file),'worker'),python:config.env.CREDITS_PYTHON_BIN,env:config.env,apiOrigin:config.origin,timeoutMs:720000,maxArtifactBytes:64*1024**2,maxRequestBytes:4*1024**2,analysisTimeoutMs:240000});
 fs.copyFileSync(file,file+'.before-education-window');
 config.worker={origin:provider.origin,token:provider.token,publicKey:provider.publicKey};
 config.env.MEDIA_WORKER_URL=config.env.LOCAL_MEDIA_WORKER_URL=provider.origin;
 fs.writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});
 console.log('Bounded local canonical CPU worker ready; 720-second wall ceiling; original emulator data retained.');
 process.on('SIGTERM',async()=>{await provider.stop();process.exit(0)});
})().catch(e=>{console.error(e.stack);process.exitCode=1});
