// Restore only this demonstration's temporary window/origin after all jobs settle.
const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const { hash } = require('../../src/creativeTemplates/contract');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, 'reports/studio-template-collection-20261104');
const runtime = '/tmp/autopromote-application-demo-5izIlF';
const read = file => JSON.parse(fs.readFileSync(path.join(base, file)));

(async () => {
  const cases = read('collection.json');
  const manifest = read('preflight-before-audio-renewal.json');
  const executions = [];
  for (const item of cases) {
    assert.equal(read(`${item.id}/render-ui.json`).errors.length, 0);
    assert.equal(read(`${item.id}/finished-ui.json`).errors.length, 0);
    assert.equal(read(`${item.id}/finished-playback.json`).complete, true);
    const binding = read(`${item.id}/exact-native-binding.json`);
    const resource = read(`${item.id}/native-worker-resource.json`);
    assert.equal(binding.templateRef.version, item.version);
    assert.equal(resource.termination.code, 0);
    assert.equal(resource.providerChargesStarted, false);
    const processRecord = JSON.parse(fs.readFileSync(path.join(runtime, 'worker', binding.executionId, 'process.json')));
    assert(!fs.existsSync(`/proc/${processRecord.pid}`), 'Completed renderer must have exited');
    executions.push({ id: item.id, version: item.version, ...binding, resource });
  }
  const configPath = path.join(runtime, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath));
  const { assertSandbox, createSandboxDatabase } = require('../../src/services/unifiedCredits/runtime');
  assertSandbox(config.env);
  assert.equal(config.build, manifest.build);
  for (const [file, expected] of Object.entries({ ...manifest.sources, ...manifest.sourceHashes, ...manifest.localHarnessSourceHashes }))
    assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, file);
  assert.equal(fs.readlinkSync(`/proc/${manifest.workerPid}/cwd`), root);
  Object.assign(process.env, config.env);
  const db = createSandboxDatabase(config.env);
  const control = (await db.doc('credits_v2_control/global').get()).data();
  assert.equal(control.activeOperations, 0);
  const original = read('local-window-and-fixture.json').before;
  config.policy.spendingEndsAt = original.spendingEndsAt;
  config.previewOrigins = original.previewOrigins;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  const api = await require('../monetization/restart-demo-api.cjs').restartDemoApi(runtime);
  assert.equal(hash(Buffer.from(await (await fetch(config.origin + manifest.mainAsset)).arrayBuffer())), manifest.mainSha256);
  const stoppedCandidates = [];
  for (const entry of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const args = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0');
      const env = fs.readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0');
      if (args.some(arg => arg.endsWith('/vector-artwork-runtime.js') || arg.endsWith('/vector-artwork-runtime.cjs')) &&
          args.includes('serve') && env.includes(`STUDIO_QA_APP_BUILD=${manifest.build}`) && env.includes('STUDIO_QA_APP_PORT=5157')) {
        process.kill(Number(entry), 'SIGTERM');
        stoppedCandidates.push(Number(entry));
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) throw error;
    }
  }
  assert.equal((await db.doc('credits_v2_control/global').get()).data().activeOperations, 0);
  const final = { ...manifest, api, verifiedAt: new Date().toISOString(), activeOperations: 0,
    originalSpendingWindowRestored: true, spendingEndsAt: config.policy.spendingEndsAt,
    previewOrigins: config.previewOrigins, stoppedOwnedCandidatePids: stoppedCandidates,
    selectedNativeFilms: executions, paidCalls: 0, productionWrites: 0, productionDeployment: false };
  fs.writeFileSync(path.join(base, 'final-runtime.json'), JSON.stringify(final, null, 2));
  await db.terminate();
  console.log('Six completed native jobs verified; original local window restored, current template build retained.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
