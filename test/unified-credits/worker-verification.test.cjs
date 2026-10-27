const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  canonical,
  digest,
  workerRequestDigest,
  verifyLocalProcessEnvelope,
  createCloudRunOutcomeVerifier,
} = require("../../src/services/unifiedCredits/workerVerification");
describe("worker outcome authority contracts (not live provider qualification)", () => {
  const pair = crypto.generateKeyPairSync("ed25519");
  const binding = {
    executionId: "exec1",
    operationId: "op1",
    userId: "alice",
    fingerprint: "fp",
    requestDigest: "req",
    sourceHash: "sha",
    endpoint: "/dispatch",
  };
  function envelope(extra = {}) {
    const payload = {
      ...binding,
      state: "succeeded",
      exitCode: 0,
      processTerminated: true,
      finishedAt: new Date().toISOString(),
      result: { success: true, deliveryMode: "local-simulated-destination" },
      resultDigest: digest({ success: true, deliveryMode: "local-simulated-destination" }),
      ...extra,
    };
    return {
      provider: "local-process",
      payload,
      signature: crypto
        .sign(null, Buffer.from(canonical(payload)), pair.privateKey)
        .toString("base64"),
    };
  }
  it("requires a supervisor signature and exact operation, owner and source bindings", () => {
    assert.equal(
      verifyLocalProcessEnvelope(envelope(), binding, pair.publicKey).state,
      "succeeded"
    );
    for (const key of Object.keys(binding))
      assert.throws(() =>
        verifyLocalProcessEnvelope(envelope({ [key]: "substituted" }), binding, pair.publicKey)
      );
    const forged = envelope();
    forged.payload.state = "failed";
    assert.throws(() => verifyLocalProcessEnvelope(forged, binding, pair.publicKey));
    assert.throws(() =>
      verifyLocalProcessEnvelope(
        { provider: "local-fixture", payload: envelope().payload },
        binding,
        pair.publicKey
      )
    );
  });
  it("holds uncertain or still-running work even with a valid signature", () => {
    assert.throws(
      () =>
        verifyLocalProcessEnvelope(
          envelope({ endpoint: "/render-viral-clip" }),
          { ...binding, endpoint: "/render-viral-clip" },
          pair.publicKey
        ),
      error => error.code === "UNVERIFIED_WORKER_ARTIFACT"
    );
    for (const extra of [
      { processTerminated: false },
      { state: "unknown" },
      { exitCode: 2 },
      { finishedAt: "invalid" },
      { result: {}, resultDigest: digest({}) },
    ])
      assert.throws(() => verifyLocalProcessEnvelope(envelope(extra), binding, pair.publicKey));
    assert.equal(
      verifyLocalProcessEnvelope(
        envelope({ state: "failed", exitCode: 2 }),
        binding,
        pair.publicKey
      ).state,
      "failed"
    );
  });
  it("refreshes media access without changing the immutable worker request", () => {
    const url = "http://127.0.0.1:1234/api/credit-pilot/object/" + "a".repeat(64);
    assert.equal(
      workerRequestDigest({ video_url: url + "?cap=old" }),
      workerRequestDigest({ video_url: url + "?cap=new" })
    );
    assert.notEqual(
      workerRequestDigest({ video_url: url + "?cap=x" }),
      workerRequestDigest({ video_url: url.replace(/a$/, "b") + "?cap=x" })
    );
  });
  const project = "autopromote-staging-test",
    job = `projects/${project}/locations/us-central1/jobs/cpu`;
  const imageDigest = "worker@sha256:" + "b".repeat(64),
    serviceAccount = "worker@autopromote-staging-test.iam.gserviceaccount.com";
  const cloudBinding = {
    ...binding,
    executionName: `${job}/executions/cpu-123`,
    executionUid: "immutable-uid",
    dispatchNonce: "nonce",
  };
  function execution(extra = {}) {
    return {
      name: cloudBinding.executionName,
      job,
      uid: "immutable-uid",
      taskCount: 1,
      succeededCount: 1,
      runningCount: 0,
      completionTime: new Date().toISOString(),
      conditions: [{ type: "Completed", state: "CONDITION_SUCCEEDED" }],
      template: {
        maxRetries: 0,
        serviceAccount,
        containers: [
          {
            image: imageDigest,
            env: Object.entries({
              CREDITS_OPERATION_ID: "op1",
              CREDITS_USER_ID: "alice",
              CREDITS_FINGERPRINT: "fp",
              CREDITS_SOURCE_HASH: "sha",
              CREDITS_DISPATCH_NONCE: "nonce",
            }).map(([name, value]) => ({ name, value })),
          },
        ],
      },
      ...extra,
    };
  }
  const cloud = readExecution =>
    createCloudRunOutcomeVerifier({ project, job, imageDigest, serviceAccount, readExecution });
  it("accepts only matching immutable terminal execution metadata", async () => {
    assert.equal((await cloud(async () => execution()).verify(cloudBinding)).state, "succeeded");
    for (const extra of [{ uid: "other" }, { job: "other" }, { taskCount: 2 }, { template: {} }])
      await assert.rejects(cloud(async () => execution(extra)).verify(cloudBinding));
    await assert.rejects(
      cloud(async () => execution()).verify({
        ...cloudBinding,
        executionName: "projects/production/jobs/x/executions/x",
      })
    );
  });
  it("does not refund from API errors, missing terminal counts or conflicting conditions", async () => {
    assert.equal(
      (
        await cloud(async () => {
          throw new Error("unavailable");
        }).verify(cloudBinding)
      ).creditsHeld,
      true
    );
    for (const extra of [
      { reconciling: true },
      { runningCount: 1 },
      { completionTime: null },
      { succeededCount: 0 },
      { conditions: [] },
    ])
      assert.equal(
        (await cloud(async () => execution(extra)).verify(cloudBinding)).creditsHeld,
        true
      );
    assert.equal(
      (
        await cloud(async () =>
          execution({
            succeededCount: 0,
            failedCount: 1,
            conditions: [{ type: "Completed", state: "CONDITION_FAILED" }],
          })
        ).verify(cloudBinding)
      ).state,
      "failed"
    );
  });
});
