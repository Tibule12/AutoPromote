#!/usr/bin/env node
/* run-emulator-or-jest.js

Attempt to run the Firebase emulator runner; if the firebase CLI is not
available (or emulators:exec fails with an obvious executable problem),
fall back to running Jest directly so tests can run in CI without the
emulator (useful in ephemeral CI environments).
*/
const { spawnSync } = require('child_process');

function tryRunFirebase() {
  console.log('[run-emulator-or-jest] Attempting: npx firebase emulators:exec --only firestore node ./scripts/exec-jest.js');
  const res = spawnSync('npx', ['firebase', 'emulators:exec', '--only', 'firestore', 'node', './scripts/exec-jest.js'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  return res.status;
}

function runJestDirect() {
  console.log('[run-emulator-or-jest] Falling back to: node ./scripts/exec-jest.js (runs jest directly)');
  const res = spawnSync('node', ['./scripts/exec-jest.js'], { stdio: 'inherit', env: process.env, shell: false });
  return res.status;
}

try {
  const code = tryRunFirebase();
  if (code === 0) process.exit(0);
  // If firebase failed, attempt to fallback
  console.warn('[run-emulator-or-jest] firebase emulators:exec returned non-zero exit code:', code);
  const fallback = runJestDirect();
  process.exit(fallback || code || 1);
} catch (err) {
  console.warn('[run-emulator-or-jest] Error while running firebase emulators:exec', err && err.message);
  const fallbackCode = runJestDirect();
  process.exit(fallbackCode || 1);
}
