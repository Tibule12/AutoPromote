const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveFirebaseCli, firebaseCliFailure } = require('../scripts/firebase-cli');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-firebase-cli-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

test('resolves the locked checkout CLI independently of global npx installations', () => {
  const directory = path.join(root, 'node_modules/firebase-tools');
  fs.mkdirSync(path.join(directory, 'lib/bin'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ bin: { firebase: './lib/bin/firebase.js' } }));
  const executable = path.join(directory, 'lib/bin/firebase.js');
  fs.writeFileSync(executable, 'process.exit(0);');
  expect(resolveFirebaseCli(root)).toBe(executable);
});

test('a missing local installation fails instead of downloading or using a cached CLI', () => {
  expect(() => resolveFirebaseCli(root)).toThrow('npm ci --include=dev');
});

test('an installed CLI dependency error remains visible rather than becoming a missing-CLI message', () => {
  const failure = firebaseCliFailure({ status: 1,
    stderr: 'Error: Cannot find module stream-json/src/filters/Pick' });
  expect(failure).toContain('exit 1');
  expect(failure).toContain('Cannot find module stream-json/src/filters/Pick');
  expect(failure).not.toContain('not available via npx');
});

test('an invalid package executable cannot escape its installation directory', () => {
  const directory = path.join(root, 'node_modules/firebase-tools');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ bin: { firebase: '../unrelated.js' } }));
  expect(() => resolveFirebaseCli(root)).toThrow('no runnable Firebase CLI');
});

test('the installed locked CLI starts with the repository dependency overrides', () => {
  const executable = resolveFirebaseCli(path.resolve(__dirname, '..'));
  const result = spawnSync(process.execPath, [executable, '--version'], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, DEBUG: '' },
  });
  if (result.status !== 0) throw new Error(firebaseCliFailure(result));
  expect(result.stdout.trim()).toBe(require('../package.json').devDependencies['firebase-tools']);
});
