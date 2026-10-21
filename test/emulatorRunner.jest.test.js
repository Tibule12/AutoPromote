const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { tryRunFirebaseExec } = require('../scripts/run-emulator-or-jest');

let folder;
beforeAll(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'emulator-runner-test-')); });
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

test.each([
  ['startup failure', null, false, undefined],
  ['failing tests', { started: true, status: 23 }, true, 23],
  ['interrupted tests', { started: true }, true, undefined],
])('%s is distinguished without rerunning Jest', (_label, marker, testsStarted, testStatus) => {
  const cli = path.join(folder, 'firebase-fixture.cjs');
  fs.writeFileSync(cli, `
    const fs = require('fs');
    const marker = ${JSON.stringify(marker)};
    if (marker) fs.writeFileSync(process.env.AUTOPROMOTE_JEST_RESULT_FILE, JSON.stringify(marker));
    process.exit(1);
  `);
  expect(tryRunFirebaseExec(cli)).toEqual({ status: 1, testsStarted, testStatus });
});

const runJestLauncher = (env, error, completed = true) => {
  const results = [], exit = jest.fn(), execSync = jest.fn(() => { if (error) throw error; });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/exec-jest.js'), 'utf8'), {
    console: { log: jest.fn(), error: jest.fn() },
    process: { env: { AUTOPROMOTE_JEST_RESULT_FILE: 'result.json', ...env }, exit },
    require: name => name === 'child_process' ? { execSync } : name === 'fs' ? {
      writeFileSync: (_file, value) => results.push(JSON.parse(value)),
      readFileSync: () => {
        if (!completed) throw new Error('No completion receipt');
        return JSON.stringify({ completed: true, success: !error, numTotalTests: 2, numTotalTestSuites: 1 });
      },
      rmSync: jest.fn(),
    } : require(name),
  });
  return { results, exit, execSync };
};

test('Jest launcher records completion and keeps expensive handle tracing opt-in', () => {
  const run = runJestLauncher({});
  expect(run.results).toEqual([{ started: true }, expect.objectContaining({ completed: true, status: 0 })]);
  expect(run.execSync.mock.calls[0][0]).toContain('npx jest --runInBand');
  expect(run.execSync.mock.calls[0][0]).not.toContain('--detectOpenHandles');
  expect(run.execSync.mock.calls[0][0]).toContain('--reporters=./scripts/jest-completion-reporter.js');
  expect(run.exit).toHaveBeenCalledWith(0);
  const diagnostic = runJestLauncher({ JEST_DETECT_OPEN_HANDLES: '1', JEST_MATCH: 'test/firestoreEmulator.jest.test.js' });
  expect(diagnostic.execSync.mock.calls[0][0]).toContain('--detectOpenHandles');
  expect(diagnostic.execSync.mock.calls[0][0]).toContain('test/firestoreEmulator.jest.test.js');
});

test('Jest failures retain their original exit code for the emulator parent', () => {
  const run = runJestLauncher({}, Object.assign(new Error('test failure'), { status: 23 }));
  expect(run.results).toEqual([{ started: true }, expect.objectContaining({ completed: true, status: 23 })]);
  expect(run.exit).toHaveBeenCalledWith(23);
});

test('a zero exit without a complete Jest report is a failure', () => {
  const run = runJestLauncher({}, null, false);
  expect(run.results).toEqual([{ started: true }, { started: true, completed: false, status: 1 }]);
  expect(run.exit).toHaveBeenCalledWith(1);
});

test('completion reporter writes real aggregate counts and preserves interruption', () => {
  const Reporter = require('../scripts/jest-completion-reporter');
  const file = path.join(folder, 'summary.json');
  const previous = process.env.AUTOPROMOTE_JEST_SUMMARY_FILE;
  process.env.AUTOPROMOTE_JEST_SUMMARY_FILE = file;
  try {
    new Reporter().onRunComplete(new Set(), { success: false, wasInterrupted: true,
      numTotalTests: 7, numTotalTestSuites: 2, numPassedTests: 3, numFailedTests: 1 });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ completed: false, success: false,
      numTotalTests: 7, numTotalTestSuites: 2, numPassedTests: 3, numFailedTests: 1 });
    new Reporter().onRunComplete(new Set(), { success: false, wasInterrupted: false,
      numTotalTests: 2, numTotalTestSuites: 1, numPassedTests: 2, numFailedTests: 0,
      numFailedTestSuites: 0, numRuntimeErrorTestSuites: 0, snapshot: { failure: false } });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ completed: true, success: true });
  } finally {
    if (previous === undefined) delete process.env.AUTOPROMOTE_JEST_SUMMARY_FILE;
    else process.env.AUTOPROMOTE_JEST_SUMMARY_FILE = previous;
  }
});
