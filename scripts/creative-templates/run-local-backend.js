#!/usr/bin/env node
// Existing authenticated API for local CPU Studio QA. No auth/credit bypass,
// cloud deployment or GPU allocation is introduced by this launcher.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const configured = process.env.STUDIO_QA_LOCAL_ENV || path.resolve(root, '../AutoPromote/.env');
if (fs.existsSync(configured)) require('dotenv').config({path:configured,quiet:true});
const port = Number(process.env.STUDIO_QA_API_PORT || 5119);
const workerPort = Number(process.env.STUDIO_QA_CPU_PORT || 8019);
for (const value of [port,workerPort]) if (!Number.isInteger(value) || value < 1024 || value > 65535)
  throw new Error('Invalid local Studio port');
Object.assign(process.env, { NODE_ENV:'development', PORT:String(port),
  ENABLE_BACKGROUND_JOBS:'false', ENABLE_BACKROUND_JOBS:'false',
  SCHEDULER_ENABLED:'false', ENABLE_HEALTH_SCANS:'false',
  CONTENT_FACTORY_ENABLED:'false', ENABLE_CONTENT_FACTORY:'false',
  FIREBASE_ADMIN_BYPASS:'0', CI_ROUTE_IMPORTS:'0',
  DEBUG_AUTH:'false',
  MEDIA_WORKER_URL:`http://127.0.0.1:${workerPort}`, LOCAL_MEDIA_WORKER_URL:`http://127.0.0.1:${workerPort}` });
const actualApp = require(path.join(root,'src/server'));
const localApp = require('express')();
if (process.env.STUDIO_QA_APP_ORIGIN) {
  const {createLocalStudioMediaProxy}=require('./local-studio-media-proxy');
  const {resolveIngestBucketName}=require(path.join(root,'src/services/multicamUploadService'));
  const keyFile=process.env.STUDIO_QA_TRANSPORT_KEY_FILE;
  if(keyFile&&!fs.existsSync(keyFile))fs.writeFileSync(keyFile,require('node:crypto').randomBytes(32),{mode:0o600,flag:'wx'});
  const proxy=createLocalStudioMediaProxy({appOrigin:process.env.STUDIO_QA_APP_ORIGIN,
    apiOrigin:`http://localhost:${port}`,bucket:()=>require('firebase-admin').storage().bucket(resolveIngestBucketName()),
    cacheDirectory:process.env.STUDIO_QA_MEDIA_CACHE,
    workerOutputDirectory:process.env.STUDIO_QA_MEDIA_CACHE?path.join(root,'tmp/worker_outputs'):undefined,
    ...(keyFile?{key:fs.readFileSync(keyFile)}:{})});
  localApp.get(proxy.prefix+':capability',proxy.stream);
  localApp.use(proxy.wrap);
}
localApp.use(actualApp);
const server = localApp.listen(port,'127.0.0.1', error => {
  // Express 5 also calls its listen callback on failure. Do not report readiness
  // while an older API still owns the port and is executing stale source.
  if (error) { console.error('Local Studio API listen failed:',error.code);process.exit(1); }
  console.log(`Local authenticated Studio API listening on 127.0.0.1:${server.address().port}`);
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
