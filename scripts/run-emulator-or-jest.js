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
  // Check firebase CLI availability first
  const check = spawnSync('npx', ['firebase', '--version'], { stdio: 'pipe', shell: false });
  if (check.status !== 0) {
    console.error('[run-emulator-or-jest] Firebase CLI (`firebase`) not available via npx.');
    console.error('Install it locally with `npm install --save-dev firebase-tools` or set ALLOW_FALLBACK_NO_EMULATOR=1 to run tests without the emulator (not recommended for emulator-dependent tests).');
    if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
      console.warn('[run-emulator-or-jest] ALLOW_FALLBACK_NO_EMULATOR set — running Jest directly (skipping emulator).');
      const fallback = runJestDirect();
      process.exit(fallback || 1);
    }
    process.exit(1);
  }

  const code = tryRunFirebase();
  if (code === 0) process.exit(0);
  // If firebase failed, attempt to fallback (if explicitly allowed)
  console.warn('[run-emulator-or-jest] firebase emulators:exec returned non-zero exit code:', code);
  if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
    const fallback = runJestDirect();
    process.exit(fallback || code || 1);
  }
  process.exit(code || 1);
} catch (err) {
  console.warn('[run-emulator-or-jest] Error while running firebase emulators:exec', err && err.message);
  if (process.env.ALLOW_FALLBACK_NO_EMULATOR === '1' || process.env.ALLOW_FALLBACK_NO_EMULATOR === 'true') {
    const fallbackCode = runJestDirect();
    process.exit(fallbackCode || 1);
  }
  process.exit(1);
}
