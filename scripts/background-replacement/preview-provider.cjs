// Loopback transport only; canonical compositor and owner-bound source bytes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const express = require('express');
const rateLimit = require('express-rate-limit');
async function create({ directory, python, env, origin }) {
  require('../../src/services/unifiedCredits/runtime').assertSandbox(env);
  if (env.STUDIO_BACKGROUND_DEMO !== 'true') throw Error('Demo only');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const root = fs.realpathSync(directory);
  const secret = crypto.randomBytes(32).toString('hex');
  const app = express(), running = new Map();
  app.use(rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false }));
  app.use((req, res, next) => req.get('Authorization') === `Bearer ${secret}` ? next() : res.sendStatus(403));
  app.use(express.json({ limit: '512kb' }));
  const folder = id => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw Error('Invalid job');
    const candidate = path.resolve(root, id);
    if (!candidate.startsWith(root + path.sep)) throw Error('Job escaped private root');
    if (fs.existsSync(candidate)) {
      const entry = fs.lstatSync(candidate);
      if (!entry.isDirectory() || entry.isSymbolicLink() || fs.realpathSync(candidate) !== candidate)
        throw Error('Job directory must be a private real directory');
    }
    return candidate;
  };
  app.post('/jobs', (req, res) => {
    const spec = req.body, work = folder(spec.jobId);
    fs.mkdirSync(work, { recursive: true, mode: 0o700 });
    const file = path.join(work, 'spec.json');
    if (fs.existsSync(file)) {
      if (JSON.stringify(JSON.parse(fs.readFileSync(file)).spec) !== JSON.stringify(spec)) return res.sendStatus(409);
      return res.json({ jobId: spec.jobId });
    }
    if (running.size) return res.status(429).json({ error: 'LOCAL_WORKER_BUSY' });
    fs.writeFileSync(file, JSON.stringify({ spec, origin }), { mode: 0o600, flag: 'wx' });
    const log = fs.openSync(path.join(work, 'process.log'), 'a', 0o600);
    const child = spawn(python, [path.join(__dirname, 'compose-demo.py'), file], {
      env: { ...env, CUDA_VISIBLE_DEVICES: '', OMP_NUM_THREADS: '4', OPENBLAS_NUM_THREADS: '1' },
      stdio: ['ignore', log, log],
    });
    fs.closeSync(log);
    running.set(spec.jobId, child);
    const finish = code => {
      running.delete(spec.jobId);
      fs.writeFileSync(path.join(work, 'terminal.json'), JSON.stringify({ code }), { mode: 0o600 });
    };
    child.once('error', () => finish(-1));
    child.once('exit', code => finish(code));
    res.json({ jobId: spec.jobId });
  });
  app.get('/jobs/:id', (req, res) => {
    const work = folder(req.params.id), spec = JSON.parse(fs.readFileSync(path.join(work, 'spec.json'))).spec;
    const terminal = path.join(work, 'terminal.json');
    const completed = fs.existsSync(terminal) && JSON.parse(fs.readFileSync(terminal)).code === 0;
    res.json({ jobId: spec.jobId, ownerUid: spec.ownerUid, requestHash: spec.requestHash,
      status: completed ? 'completed' : fs.existsSync(terminal) ? 'failed' : 'processing',
      ...(completed ? { receipt: JSON.parse(fs.readFileSync(path.join(work, 'result.json'))) } : {}),
    });
  });
  app.get('/jobs/:id/media', (req, res) => res.sendFile(path.join(folder(req.params.id), 'render.mp4')));
  app.delete('/jobs/:id', (req, res) => {
    folder(req.params.id);
    running.get(req.params.id)?.kill('SIGKILL');
    res.json({ jobId: req.params.id, status: 'cancelling' });
  });
  app.use((_error, _req, res, _next) => res.status(400).json({ error: 'LOCAL_PREVIEW_REQUEST_REJECTED' }));
  const server = await new Promise(resolve => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  return { url: `http://127.0.0.1:${server.address().port}`, secret, stop: async () => {
    for (const child of running.values()) child.kill('SIGKILL');
    await new Promise(resolve => server.close(resolve));
  } };
}
module.exports = { create };
