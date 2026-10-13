#!/usr/bin/env node
// Private QA only. Credentials are loaded on this workstation, never on NVIDIA.
const path=require('path');
const q=require('./run');
require('dotenv').config({path:process.env.STUDIO_QA_LOCAL_ENV||path.resolve(q.root,'../AutoPromote/.env'),quiet:true});
const workerSecret=process.env.STUDIO_QA_WORKER_ENV||'/tmp/autopromote-studio-qa-20261007/vfx-worker.env';
if(require('fs').existsSync(workerSecret))require('dotenv').config({path:workerSecret,quiet:true});
const qaPort=Number(process.env.STUDIO_QA_API_PORT || 5100);
Object.assign(process.env,{NODE_ENV:'development',PORT:String(qaPort),
  ENABLE_BACKGROUND_JOBS:'false',ENABLE_BACKROUND_JOBS:'false',SCHEDULER_ENABLED:'false',
  ENABLE_HEALTH_SCANS:'false',CONTENT_FACTORY_ENABLED:'false',ENABLE_CONTENT_FACTORY:'false',
  FIREBASE_ADMIN_BYPASS:'0',CI_ROUTE_IMPORTS:'0',MEDIA_WORKER_URL:process.env.STUDIO_QA_MEDIA_WORKER_URL||'http://127.0.0.1:8008',
  LOCAL_MEDIA_WORKER_URL:process.env.STUDIO_QA_MEDIA_WORKER_URL||'http://127.0.0.1:8008',STUDIO_NVIDIA_VFX_URL:'http://127.0.0.1:8009'});
delete process.env.RENDER;delete process.env.RENDER_SERVICE_ID;delete process.env.RENDER_EXTERNAL_HOSTNAME;
const qaServer=require(path.join(q.root,'src/server')).listen(qaPort,'127.0.0.1',()=>console.log(`Private real-auth QA API listening on ${qaPort}`));
// The application's signal handlers know its main listener, not this QA
// wrapper's listener. Close the listener we own so a restart cannot leave an
// old implementation answering authenticated requests on the same port.
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
  qaServer.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),5000).unref();
});
