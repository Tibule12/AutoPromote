#!/usr/bin/env node
// Local deterministic render worker. Never starts cloud infrastructure,
// downloads a model, or logs credentials. Match the native local App origin.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const dotenv = require('dotenv');
const configured = process.env.STUDIO_QA_LOCAL_ENV || path.resolve(root, '../AutoPromote/.env');
const settings = fs.existsSync(configured) ? dotenv.parse(fs.readFileSync(configured)) : {};
const port = Number(process.env.STUDIO_QA_CPU_PORT || 8019);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local CPU port');
const python = process.env.STUDIO_QA_PYTHON || path.resolve(root, '../AutoPromote/python_media_worker/.venv/bin/python');
const worker = path.join(root, 'python_media_worker');
const child = spawn(python, ['-m','uvicorn','main_media_server:app','--host','127.0.0.1','--port',String(port)], {
  cwd: worker, stdio: 'inherit', env: { ...settings, ...process.env,
    CUDA_VISIBLE_DEVICES: '', VIRAL_EXPORT_ENCODER:'cpu',
    OMP_NUM_THREADS:'2', OPENBLAS_NUM_THREADS:'2', PYTHONPATH:worker,
    LOCAL_MEDIA_OUTPUT_BASE_URL:`http://127.0.0.1:${port}`,
    // The authenticated Node owner persists this loopback output durably.
    // Avoid a second worker-to-cloud upload blocking the async health loop
    // for fifteen minutes after a network change during local CPU work.
    LOCAL_MEDIA_OUTPUT_ONLY:'true', ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK:'true',
    MEDIA_WORKER_ALLOWED_ORIGINS:'http://localhost:5000',
    FIREBASE_STATUS_UPDATES_ENABLED:'false' },
});
// The existing authenticated Node job service owns this local synchronous
// job's status. Cloud workers retain their normal durable status delivery.
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',(code,signal)=>{process.exitCode=code ?? (signal ? 0 : 1);});
