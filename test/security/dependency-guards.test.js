const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { patchSecurityDependencies } = require("../../scripts/patch-security-dependencies");
patchSecurityDependencies();
patchSecurityDependencies(); // Installation must be idempotent.

test("deepmerge rejects source/target prototype poisoning in all published entry points", () => {
  const path = require("node:path");
  const fs = require("node:fs");
  const folder = path.dirname(require.resolve("deepmerge/package.json"));
  const payload = JSON.parse('{"__proto__":{"isAdmin":true},"safe":{"value":1}}');
  const pollutedTarget = JSON.parse('{"__proto__":{"isAdmin":true},"title":"video"}');
  for (const entry of ["dist/cjs.js", "dist/umd.js"]) {
    assert.ok(fs.existsSync(path.join(folder, entry)), `Missing runtime entry ${entry}`);
    const merge = require(path.join(folder, entry));
    for (const target of [Object.create(null), {}, null, 0, pollutedTarget]) {
      const result = merge(target, payload);
      assert.equal(Object.getPrototypeOf(result), Object.prototype, entry);
      assert.equal(result.isAdmin, undefined, entry);
      assert.equal(Object.hasOwn(result, "__proto__"), false, entry);
      assert.deepEqual(result.safe, { value: 1 });
    }
    const nested = merge({ session: null }, { session: payload });
    assert.equal(nested.session.isAdmin, undefined, entry);
    assert.equal(Object.getPrototypeOf(nested.session), Object.prototype, entry);
    assert.equal(merge(pollutedTarget, {}).isAdmin, undefined, entry);
    assert.equal(merge.all([Object.create(null), payload]).isAdmin, undefined, entry);
    const symbol = Symbol("kept");
    const ordinary = merge(
      { list: [1], nested: { first: true } },
      {
        list: [2],
        nested: { second: true },
        [symbol]: "yes",
      }
    );
    assert.deepEqual(ordinary.list, [1, 2]);
    assert.deepEqual(ordinary.nested, { first: true, second: true });
    assert.equal(ordinary[symbol], "yes");
    assert.equal(Object.prototype.isAdmin, undefined);
  }
});

test("RSA verification accepts a real signature and rejects extra nested DigestAlgorithm elements", () => {
  const forge = require("node-forge");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 3,
  });
  const privateRsa = forge.pki.privateKeyFromPem(
    privateKey.export({ type: "pkcs1", format: "pem" })
  );
  const publicRsa = forge.pki.publicKeyFromPem(publicKey.export({ type: "pkcs1", format: "pem" }));
  const md = forge.md.sha256.create().update("AutoPromote dependency security regression");
  const digest = md.digest().getBytes();
  assert.equal(publicRsa.verify(digest, privateRsa.sign(md)), true);
  const { asn1 } = forge;
  const node = (type, constructed, value) =>
    asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const algorithm = node(asn1.Type.SEQUENCE, true, [
    node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()),
    node(asn1.Type.NULL, false, ""),
    node(asn1.Type.OCTETSTRING, false, "ignored nested attacker bytes"),
  ]);
  const malformed = asn1
    .toDer(node(asn1.Type.SEQUENCE, true, [algorithm, node(asn1.Type.OCTETSTRING, false, digest)]))
    .getBytes();
  const signature = privateRsa.sign(malformed, "NONE");
  assert.throws(() => publicRsa.verify(digest, signature), /DigestInfo/);
});

test("ordinary brace globs work and deeply nested patterns/ASTs fail with a bounded syntax error", () => {
  const braces = require("braces");
  assert.deepEqual(braces.expand("video-{one,two}.mp4"), ["video-one.mp4", "video-two.mp4"]);
  assert.equal(braces.compile("video-{one,two}.mp4"), "video-(one|two).mp4");
  const deep = "{".repeat(4000) + "a,b" + "}".repeat(4000);
  for (const method of ["parse", "compile", "expand", "stringify"]) {
    assert.throws(
      () => braces[method](deep),
      error => error instanceof SyntaxError && /safe depth/.test(error.message)
    );
  }
  let ast = { type: "text", value: "a" };
  for (let i = 0; i < 4000; i++) ast = { type: "brace", nodes: [ast] };
  for (const method of ["compile", "expand", "stringify"]) {
    assert.throws(
      () => braces[method](ast),
      error => error instanceof SyntaxError && /safe complexity/.test(error.message)
    );
  }
  const cycle = { type: "brace", nodes: [] };
  cycle.nodes.push(cycle);
  assert.throws(() => braces.compile(cycle), /Cyclic brace AST/);
});

test("OpenTelemetry tooling accepts normal baggage and bounds hostile strings and repeated headers", () => {
  const { W3CBaggagePropagator } = require("@opentelemetry/core");
  const { ROOT_CONTEXT, propagation, defaultTextMapGetter } = require("@opentelemetry/api");
  const propagator = new W3CBaggagePropagator();
  const context = propagator.extract(
    ROOT_CONTEXT,
    { baggage: "creator=one,studio=ready" },
    defaultTextMapGetter
  );
  assert.equal(propagation.getBaggage(context).getEntry("studio").value, "ready");
  for (const baggage of [
    "x=" + "y".repeat(1024 * 1024),
    Array(10000).fill("x=y"),
    ["x=" + "y".repeat(5000), "z=" + "a".repeat(5000)],
  ]) {
    assert.equal(propagator.extract(ROOT_CONTEXT, { baggage }, defaultTextMapGetter), ROOT_CONTEXT);
  }
});
