#!/usr/bin/env node
/* exec-jest.js

Runs Jest from a child process. Intended to be invoked by
`firebase emulators:exec --only firestore node ./scripts/exec-jest.js`.
This avoids quoting/nesting issues with shells and npx in CI.
*/

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const reportResult = result => {
  if (process.env.AUTOPROMOTE_JEST_RESULT_FILE) {
    fs.writeFileSync(process.env.AUTOPROMOTE_JEST_RESULT_FILE, JSON.stringify(result));
  }
};

const resultDir = process.env.AUTOPROMOTE_JEST_RESULT_FILE ? null :
  fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-jest-'));
const summaryFile = process.env.AUTOPROMOTE_JEST_RESULT_FILE
  ? `${process.env.AUTOPROMOTE_JEST_RESULT_FILE}.summary.json`
  : path.join(resultDir, 'summary.json');
let status = 0;
try {
  const match = process.env.JEST_MATCH;
  // async_hooks tracing substantially slows the complete Studio component
  // suite. Enable it for leak diagnosis, rather than every emulator run.
  const base = 'npx jest --runInBand' +
    (process.env.JEST_DETECT_OPEN_HANDLES === '1' ? ' --detectOpenHandles' : '') +
    ' --reporters=default --reporters=./scripts/jest-completion-reporter.js';
  const cmd = match ? `${base} ${match}` : base;
  console.log('[exec-jest] Running:', cmd);
  reportResult({ started: true });
  execSync(cmd, { stdio: 'inherit', env: { ...process.env,
    AUTOPROMOTE_JEST_SUMMARY_FILE: summaryFile } });
} catch (e) {
  console.error('[exec-jest] Jest exited with error', e && e.message);
  // propagate the exit code if available
  status = e && e.status ? e.status : 1;
}
try {
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  if (!summary.completed || !(summary.numTotalTests > 0) || !(summary.numTotalTestSuites > 0))
    throw new Error('Jest did not complete a non-empty test run.');
  if (!summary.success) status ||= 1;
  reportResult({ started: true, completed: true, status, ...summary });
  console.log(`[exec-jest] Completed ${summary.numTotalTests} tests in ${summary.numTotalTestSuites} suites (exit ${status}).`);
} catch (error) {
  status ||= 1;
  console.error('[exec-jest] No complete Jest result was produced; refusing to report success.', error.message);
  reportResult({ started: true, completed: false, status });
} finally {
  if (resultDir) fs.rmSync(resultDir, { recursive: true, force: true });
  else fs.rmSync(summaryFile, { force: true });
}
process.exit(status);
