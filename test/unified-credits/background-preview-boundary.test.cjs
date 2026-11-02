const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { create } = require('../../scripts/background-replacement/preview-provider.cjs');
const env = { NODE_ENV: 'test', UNIFIED_CREDITS_SANDBOX: 'true',
  UNIFIED_CREDITS_PROJECT_ID: 'demo-autopromote-credits',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:19999', STUDIO_BACKGROUND_DEMO: 'true' };
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-preview-security-'));
  const server = await create({ directory: path.join(root, 'jobs'), python: '/does-not-run', env,
    origin: 'http://127.0.0.1:19998' });
  t.after(async () => { await server.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, server, headers: { Authorization: `Bearer ${server.secret}` } };
}
test('local preview requires authentication and rejects traversals and symlinked job directories', async t => {
  const { root, server, headers } = await setup(t);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'render.mp4'), 'private other bytes');
  fs.symlinkSync(outside, path.join(root, 'jobs', 'symlink-job-123'));
  assert.equal((await fetch(server.url + '/jobs/symlink-job-123')).status, 403);
  for (const endpoint of ['/jobs/symlink-job-123', '/jobs/symlink-job-123/media', '/jobs/invalid%2F..%2Foutside']) {
    const response = await fetch(server.url + endpoint, { headers });
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('private other bytes'));
  }
  const bad = await fetch(server.url + '/jobs', { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: '../escape' }) });
  assert.equal(bad.status, 400);
  assert.equal(fs.existsSync(path.join(root, 'escape')), false);
});
test('local preview serves only the exact accepted history and caps repeated requests', async t => {
  const { root, server, headers } = await setup(t);
  const id = 'owned-history-123', directory = path.join(root, 'jobs', id); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'spec.json'), JSON.stringify({ spec: { jobId: id,
    ownerUid: 'demo-pilot-alice', requestHash: 'a'.repeat(64) } }));
  fs.writeFileSync(path.join(directory, 'terminal.json'), JSON.stringify({ code: 1 }));
  const first = await fetch(server.url + '/jobs/' + id, { headers });
  assert.equal(first.status, 200); assert.equal((await first.json()).status, 'failed');
  let limited;
  for (let i = 0; i < 121; i++) {
    const response = await fetch(server.url + '/jobs/' + id, { headers });
    if (response.status === 429) { limited = response; break; }
  }
  assert.equal(limited?.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
