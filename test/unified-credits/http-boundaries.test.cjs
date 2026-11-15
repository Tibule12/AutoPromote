const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { digest, workerRequestDigest, verifyLocalProcessEnvelope } = require("../../src/services/unifiedCredits/workerVerification");
const {
  createLocalWorkerProvider,
} = require("../../scripts/monetization/local-worker-provider.cjs");
const { createGoogleTestApp } = require("../../scripts/credits-google-test.cjs");

async function withProvider(run) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "credit-http-boundaries-"));
  const directory = path.join(scratch, "executions");
  const provider = await createLocalWorkerProvider({
    directory,
    // No request in these tests can launch a worker or make a cloud call.
    python: "/not-a-worker-executable",
    apiOrigin: "http://127.0.0.1:1",
    env: {
      NODE_ENV: "test",
      UNIFIED_CREDITS_SANDBOX: "true",
      UNIFIED_CREDITS_PROJECT_ID: "demo-autopromote-credits",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
    },
  });
  const auth = req => req.set("Authorization", `Bearer ${provider.token}`);
  const capability = (id, expires = Date.now() + 60000) => {
    const mac = crypto
      .createHmac("sha256", provider.token)
      .update(`${id}:${expires}`)
      .digest("base64url");
    return `/local-output/${id}.${expires}.${mac}.mp4`;
  };
  try {
    await run({ provider, directory, scratch, auth, capability, client: request(provider.origin) });
  } finally {
    await provider.stop();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

describe("local HTTP resource and filesystem boundaries", () => {
  const binding = () => {
    const expected = { operationId: "rejected-request", stage: "studio.render", userId: "alice",
      fingerprint: "a".repeat(64), requestDigest: workerRequestDigest({}), sourceHash: "c".repeat(64),
      endpoint: "/render-viral-clip", sources: [{}] };
    return { ...expected, executionId: digest([expected.operationId, expected.stage, expected.endpoint]) };
  };
  const bound = (req, expected) => req.set("X-Credits-Execution", Buffer.from(JSON.stringify(expected)).toString("base64url"));
  it("signs an oversized authenticated refusal without creating a process claim", async () => {
    await withProvider(async ({ client, auth, directory, provider }) => {
      const expected = binding();
      await bound(auth(client.post(expected.endpoint)), expected).send({ data: "x".repeat(4 * 1024 * 1024) }).expect(413);
      const receipt = (await auth(client.get(`/executions/${expected.executionId}`)).expect(200)).body;
      const proof = verifyLocalProcessEnvelope(receipt, expected, provider.publicKey);
      assert.equal(proof.noDispatch, true); assert.equal(proof.state, "failed");
      assert.equal(proof.exitCode, null);
      assert.equal(fs.existsSync(path.join(directory, expected.executionId, "claimed.json")), false);
      assert.equal(fs.existsSync(path.join(directory, expected.executionId, "request.json")), false);
    });
  });
  it("seals only unclaimed executions and refuses to cancel a possibly started process", async () => {
    await withProvider(async ({ client, auth, directory, provider }) => {
      const expected = binding(), route = `/executions/${expected.executionId}/cancel-undispatched`;
      await bound(client.post(route), expected).send({}).expect(401);
      const receipt = (await bound(auth(client.post(route)), expected).send({}).expect(200)).body;
      assert.equal(verifyLocalProcessEnvelope(receipt, expected, provider.publicKey).noDispatch, true);
      assert.deepEqual((await bound(auth(client.post(route)), expected).send({}).expect(200)).body, receipt);
      await bound(auth(client.post(expected.endpoint)), expected).send({}).expect(500);
      assert.equal(fs.existsSync(path.join(directory, expected.executionId, "claimed.json")), false);
      const other = { ...expected, operationId: "possibly-started" };
      other.executionId = digest([other.operationId, other.stage, other.endpoint]);
      const dir = path.join(directory, other.executionId); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, "claimed.json"), "{}");
      await bound(auth(client.post(`/executions/${other.executionId}/cancel-undispatched`)), other).send({}).expect(409);
      assert.equal(fs.existsSync(path.join(dir, "receipt.json")), false);
    });
  });
  it("accepts a full-size colour-cube body within the finite parser budget", async () => {
    await withProvider(async ({ client }) => {
      // The normal Studio request measured 2.36 MB; parsing must precede the
      // expected auth denial without a 413 or launching any process.
      await client.post('/render-viral-clip').send({ data: 'x'.repeat(3 * 1024 * 1024) }).expect(401);
    });
  });
  it("limits every worker route, including public health and unauthenticated receipt requests", async () => {
    await withProvider(async ({ client }) => {
      for (let i = 0; i < 240; i++) await client.get("/health").expect(200);
      const blocked = await client.get(`/executions/${"a".repeat(64)}`).expect(429);
      assert.ok(Number(blocked.headers["retry-after"]) > 0);
      await client.get("/status").expect(429);
    });
  });

  it("rejects excessive authenticated dispatch requests before any process or execution is created", async () => {
    await withProvider(async ({ client, auth, directory }) => {
      await client.post("/dispatch").send({}).expect(401);
      const invalid = Buffer.from(
        JSON.stringify({
          endpoint: "/dispatch",
          requestDigest: "not-a-bound-request",
          sources: [{}],
        })
      ).toString("base64url");
      for (let i = 0; i < 20; i++)
        await auth(client.post("/dispatch"))
          .set("X-Credits-Execution", invalid)
          .send({})
          .expect(403);
      await auth(client.post("/dispatch")).set("X-Credits-Execution", invalid).send({}).expect(429);
      assert.deepEqual(fs.readdirSync(directory).sort(), [
        "public-key.pem",
        "signing-key.pem",
        "transport-token",
      ]);
    });
  });

  it("reads only an exact execution receipt and rejects traversal, unknown IDs and directory symlinks", async () => {
    await withProvider(async ({ client, auth, directory, scratch }) => {
      const id = "a".repeat(64);
      fs.mkdirSync(path.join(directory, id));
      // Deliberate filesystem fixture: never accepted as evidence by the wallet.
      fs.writeFileSync(path.join(directory, id, "receipt.json"), JSON.stringify({ fixture: true }));
      assert.equal((await auth(client.get(`/executions/${id}`)).expect(200)).body.fixture, true);
      for (const input of [
        "..%2Foutside",
        "%2Fetc%2Fpasswd",
        "%5C..%5Csecret",
        "a".repeat(63),
        `${id}%0A`,
      ])
        await auth(client.get(`/executions/${input}`)).expect(400);
      const unknown = await auth(client.get(`/executions/${"b".repeat(64)}`)).expect(200);
      assert.equal(unknown.body.state, "unknown");
      assert.equal(unknown.body.creditsHeld, true);
      const outside = path.join(scratch, "outside");
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "receipt.json"), JSON.stringify({ private: true }));
      fs.symlinkSync(outside, path.join(directory, "c".repeat(64)), "dir");
      await auth(client.get(`/executions/${"c".repeat(64)}`)).expect(403);
      fs.unlinkSync(path.join(directory, id, "receipt.json"));
      fs.symlinkSync(path.join(outside, "receipt.json"), path.join(directory, id, "receipt.json"));
      await auth(client.get(`/executions/${id}`)).expect(403);
    });
  });

  it("requires an exact unexpired artifact capability and refuses symlinks outside its execution", async () => {
    await withProvider(async ({ client, directory, scratch, capability }) => {
      const id = "d".repeat(64);
      const dir = path.join(directory, id);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "artifact.mp4"), "fixture bytes, not a qualified movie");
      const valid = capability(id);
      const file = await client.get(valid).expect(200);
      assert.equal(file.body.toString(), "fixture bytes, not a qualified movie");
      await client.get(valid.replace(/.mp4$/, ".extra.mp4")).expect(400);
      await client.get(valid.replace(/\.mp4$/, "%0A.mp4")).expect(400);
      await client.get(capability(id, Date.now() - 1)).expect(403);
      await client
        .get(valid.replace(/\.[A-Za-z0-9_-]{43}\.mp4$/, `.${"x".repeat(43)}.mp4`))
        .expect(403);
      await client.get(`/local-output/..%2Fsecret.mp4`).expect(400);
      await client.get(capability("e".repeat(64))).expect(404);
      const secret = path.join(scratch, "private.mp4");
      fs.writeFileSync(secret, "must never be returned");
      fs.unlinkSync(path.join(dir, "artifact.mp4"));
      fs.symlinkSync(secret, path.join(dir, "artifact.mp4"));
      await client.get(valid).expect(403);
    });
  });

  it("rate-limits the Google sample and static assets without requesting any Google ad", async () => {
    const previous = process.env.GOOGLE_REWARDED_TEST_ONLY;
    process.env.GOOGLE_REWARDED_TEST_ONLY = "true";
    try {
      const client = request(createGoogleTestApp());
      await client.get("/").expect(200);
      for (let i = 1; i < 120; i++) await client.get("/style.css").expect(200);
      const blocked = await client.get("/google-test-controller.js").expect(429);
      assert.ok(Number(blocked.headers["retry-after"]) > 0);
      await client.get("/").expect(429);
    } finally {
      if (previous === undefined) delete process.env.GOOGLE_REWARDED_TEST_ONLY;
      else process.env.GOOGLE_REWARDED_TEST_ONLY = previous;
    }
  });
});
