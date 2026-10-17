const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyDependencySecurityPatches } = require('../autopromote-functions/security/apply-dependency-patches.cjs');

test('temporary dependency mitigations reject the actual malformed signature and recursive patterns', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopromote-security-patches-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packages = {};
  for (const name of ['braces', 'fill-range', 'to-regex-range', 'is-number', 'node-forge']) {
    const source = path.dirname(require.resolve(name + '/package.json'));
    const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).version;
    fs.cpSync(source, path.join(root, 'node_modules', name), { recursive: true });
    packages['node_modules/' + name] = { version };
  }
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  const load = name => require(path.join(root, 'node_modules', name));
  const forge = load('node-forge');
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 65537 });
  const pem = forge.pki.publicKeyToPem(keys.publicKey);
  const md = forge.md.sha256.create().update('AutoPromote security regression');
  const digest = md.digest().getBytes(), asn1 = forge.asn1;
  const element = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const malformed = element(asn1.Type.SEQUENCE, true, [
    element(asn1.Type.SEQUENCE, true, [
      element(asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
      element(asn1.Type.NULL, false, ''),
      element(asn1.Type.OCTETSTRING, false, 'unexpected nested DigestAlgorithm data'),
    ]),
    element(asn1.Type.OCTETSTRING, false, digest),
  ]);
  // A locally generated test key signs malformed DigestInfo. The vulnerable
  // parser accepts it; patched verification must reject the extra nested child.
  const badSignature = forge.pki.rsa.encrypt(asn1.toDer(malformed).getBytes(), keys.privateKey, 0x01);
  const goodSignature = keys.privateKey.sign(md);
  let acceptedBefore;
  try { acceptedBefore = keys.publicKey.verify(digest, badSignature); }
  catch (error) { assert.match(error.message, /DigestInfo/); acceptedBefore = false; }
  // Supports both normal postinstall-patched and --ignore-scripts installs.
  assert.equal(applyDependencySecurityPatches(root), acceptedBefore ? 5 : 0);
  assert.equal(applyDependencySecurityPatches(root), 0);
  for (const name of Object.keys(require.cache)) if (name.startsWith(root + path.sep)) delete require.cache[name];
  const patchedForge = load('node-forge'), publicKey = patchedForge.pki.publicKeyFromPem(pem);
  assert.equal(publicKey.verify(digest, goodSignature), true);
  assert.throws(() => publicKey.verify(digest, badSignature), /DigestInfo/);

  const braces = load('braces');
  assert.deepEqual(braces.expand('file-{01..03}.{js,ts}'), ['file-01.js', 'file-01.ts', 'file-02.js', 'file-02.ts', 'file-03.js', 'file-03.ts']);
  for (const nested of ['{'.repeat(4000) + 'x' + '}'.repeat(4000), '('.repeat(4000) + 'x' + ')'.repeat(4000)]) {
    for (const operation of [braces, braces.compile, braces.expand]) {
      assert.throws(() => operation(nested), e => e instanceof SyntaxError && /nesting limit/.test(e.message));
    }
  }
  let ast = { type: 'text', value: 'x' };
  for (let i = 0; i < 4000; i++) ast = { type: 'brace', nodes: [ast] };
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(ast), e => e instanceof SyntaxError && /nesting limit/.test(e.message));
  }
  const target = path.join(root, 'node_modules/node-forge/lib/rsa.js');
  fs.appendFileSync(target, '\n// unreviewed modification\n');
  assert.throws(() => applyDependencySecurityPatches(root), /Unrecognized dependency source/);
});
