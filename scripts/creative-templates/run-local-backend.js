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
  MEDIA_WORKER_URL:`http://127.0.0.1:${workerPort}`, LOCAL_MEDIA_WORKER_URL:`http://127.0.0.1:${workerPort}` });
const server = require(path.join(root,'src/server')).listen(port,'127.0.0.1', error => {
  // Express 5 also calls its listen callback on failure. Do not report readiness
  // while an older API still owns the port and is executing stale source.
  if (error) { console.error('Local Studio API listen failed:',error.code);process.exit(1); }
  console.log(`Local authenticated Studio API listening on 127.0.0.1:${server.address().port}`);
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
