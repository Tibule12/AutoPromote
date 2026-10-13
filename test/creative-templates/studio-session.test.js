const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { authenticatedLocalState, saveAuthenticatedState, mergeSessionRecovery } = require('../../scripts/creative-templates/studio-session');

function fixture(encoded = false) {
  const user = { uid: 'synthetic-user', isAnonymous: false, stsTokenManager: { refreshToken: 'synthetic-placeholder' } };
  const encode = value => value && typeof value === 'object' ?
    { o: Object.entries(value).map(([k, v]) => ({ k, v: encode(v) })) } : value;
  const value = { fbase_key: 'firebase:authUser:synthetic-test', value: user };
  return { cookies: [], origins: [{ origin: 'http://localhost:5000', localStorage: [], indexedDB: [{
    name: 'firebaseLocalStorageDb', stores: [{ name: 'firebaseLocalStorage', records: [encoded ? { valueEncoded: encode(value) } : { value }] }],
  }] }] };
}

test('accepts Playwright primitive strings inside rich IndexedDB records', () => {
  assert.equal(authenticatedLocalState(fixture()), true);
  assert.equal(authenticatedLocalState(fixture(true)), true);
  assert.equal(authenticatedLocalState({ origins: [] }), false);
  const anonymous = fixture();
  anonymous.origins[0].indexedDB[0].stores[0].records[0].value.value.isAnonymous = true;
  assert.equal(authenticatedLocalState(anonymous), false);
});

test('signed-out writes preserve valid snapshots and private recovery permissions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-session-'));
  const filename = path.join(directory, 'private.json');
  try {
    saveAuthenticatedState(fixture(true), filename);
    const before = fs.readFileSync(filename);
    assert.throws(() => saveAuthenticatedState({ origins: [] }, filename), /refused/);
    assert.deepEqual(fs.readFileSync(filename), before);
    saveAuthenticatedState(fixture(true), filename);
    assert.deepEqual(fs.readFileSync(`${filename}.previous`), before);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('recovery preserves newer project stores and receipts and leaves valid accounts alone', () => {
  const nativeProject = { name: 'autopromote-viral-studio', stores: [] };
  const nativeReceipt = { name: 'autopromote-viral-render-attempt:synthetic', value: 'newer-receipt' };
  const current = { cookies: [], origins: [{ origin: 'http://localhost:5000', localStorage: [nativeReceipt], indexedDB: [nativeProject] }] };
  const recovered = mergeSessionRecovery(current, fixture(true));
  assert.equal(authenticatedLocalState(recovered), true);
  assert.strictEqual(recovered.origins[0].indexedDB.find(db => db.name === nativeProject.name), nativeProject);
  assert.deepEqual(recovered.origins[0].localStorage, [nativeReceipt]);
  const signedIn = fixture();
  assert.strictEqual(mergeSessionRecovery(signedIn, fixture(true)), signedIn);
  assert.throws(() => mergeSessionRecovery(current, { origins: [] }), /no refreshable/);
});
