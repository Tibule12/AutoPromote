#!/usr/bin/env node
/* exec-jest.js

Runs Jest from a child process. Intended to be invoked by
`firebase emulators:exec --only firestore node ./scripts/exec-jest.js`.
This avoids quoting/nesting issues with shells and npx in CI.
*/

const { execSync } = require('child_process');

try {
  console.log('[exec-jest] Running: npx jest --runInBand --detectOpenHandles');
  execSync('npx jest --runInBand --detectOpenHandles', { stdio: 'inherit', env: process.env });
  process.exit(0);
} catch (e) {
  console.error('[exec-jest] Jest exited with error', e && e.message);
  // propagate the exit code if available
  process.exit(e && e.status ? e.status : 1);
}
