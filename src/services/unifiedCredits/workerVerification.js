const crypto = require("node:crypto");
const { fail } = require("./policy");
const stable = value =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, stable(value[key])])
        )
      : value;
const canonical = value => JSON.stringify(stable(value));
const digest = value =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : canonical(value))
    .digest("hex");
function workerRequestDigest(body) {
  const normalize = value =>
    typeof value === "string" &&
    /^http:\/\/127\.0\.0\.1:[0-9]+\/api\/credit-pilot\/object\/[a-f0-9]{64}\?cap=/.test(value)
      ? value.split("?")[0]
      : Array.isArray(value)
        ? value.map(normalize)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))
          : value;
  return digest(normalize(body));
}

function verifyLocalProcessEnvelope(envelope, expected, publicKey) {
  const payload = envelope?.payload;
  if (
    !payload ||
    envelope.provider !== "local-process" ||
    !crypto.verify(
      null,
      Buffer.from(canonical(payload)),
      publicKey,
      Buffer.from(envelope.signature || "", "base64")
    )
  )
    fail("UNVERIFIED_WORKER_OUTCOME", 403);
  for (const key of [
    "executionId",
    "operationId",
    "userId",
    "fingerprint",
    "requestDigest",
    "sourceHash",
  ])
    if (payload[key] !== expected[key]) fail("WORKER_BINDING_CONFLICT", 403);
  if (
    !["succeeded", "failed"].includes(payload.state) ||
    payload.processTerminated !== true ||
    !Number.isSafeInteger(payload.exitCode) ||
    (payload.state === "succeeded" && payload.exitCode !== 0) ||
    !Number.isFinite(Date.parse(payload.finishedAt))
  )
    fail("UNVERIFIED_WORKER_OUTCOME", 403);
  if (expected.endpoint) {
    if (
      payload.endpoint !== expected.endpoint ||
      payload.resultDigest !== digest(payload.result || {})
    )
      fail("WORKER_BINDING_CONFLICT", 403);
    if (payload.state === "succeeded") {
      if (
        ["/render-viral-clip", "/render-clip", "/process"].includes(expected.endpoint) &&
        (!payload.output ||
          !Number.isSafeInteger(payload.output.bytes) ||
          payload.output.bytes <= 0 ||
          !/^[a-f0-9]{64}$/.test(payload.output.sha256 || ""))
      )
        fail("UNVERIFIED_WORKER_ARTIFACT", 403);
      if (expected.endpoint === "/analyze-clips" && !Array.isArray(payload.result?.scenes))
        fail("UNVERIFIED_WORKER_RESULT", 403);
      if (
        expected.endpoint === "/dispatch" &&
        (payload.result?.success !== true ||
          payload.result?.deliveryMode !== "local-simulated-destination")
      )
        fail("UNVERIFIED_WORKER_RESULT", 403);
    }
  }
  return payload;
}

// The caller supplies a stored execution binding, never a browser-selected name.
// Default transport is an authenticated Google API GET. This module cannot run jobs.
function createCloudRunOutcomeVerifier({
  project,
  job,
  imageDigest,
  serviceAccount,
  readExecution,
}) {
  if (
    !/^autopromote-staging-[a-z0-9-]+$/.test(project) ||
    !new RegExp(`^projects/${project}/locations/[a-z0-9-]+/jobs/[a-z0-9-]+$`).test(job || "") ||
    !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount || "") ||
    !/@sha256:[a-f0-9]{64}$/.test(imageDigest || "")
  )
    fail("INVALID_WORKER_AUTHORITY");
  async function read(name) {
    if (readExecution) return readExecution(name);
    const { GoogleAuth } = require("google-auth-library");
    const client = await new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    }).getClient();
    return (await client.request({ url: `https://run.googleapis.com/v2/${name}`, method: "GET" }))
      .data;
  }
  return {
    provider: "google-cloud-run",
    async verify(binding) {
      if (
        !binding.executionName?.startsWith(`${job}/executions/`) ||
        !/^[-a-z0-9]+$/.test(binding.executionName.slice(`${job}/executions/`.length))
      )
        fail("WORKER_BINDING_CONFLICT", 403);
      let execution;
      try {
        execution = await read(binding.executionName);
      } catch {
        return { state: "unknown", creditsHeld: true };
      }
      const template = execution.template || {};
      const container = template.containers?.[0];
      const env = Object.fromEntries(
        (container?.env || []).map(entry => [entry.name, entry.value])
      );
      if (
        execution.name !== binding.executionName ||
        execution.job !== job ||
        !execution.uid ||
        (binding.executionUid && execution.uid !== binding.executionUid) ||
        container?.image !== imageDigest ||
        template.serviceAccount !== serviceAccount ||
        env.CREDITS_OPERATION_ID !== binding.operationId ||
        env.CREDITS_USER_ID !== binding.userId ||
        env.CREDITS_FINGERPRINT !== binding.fingerprint ||
        env.CREDITS_SOURCE_HASH !== binding.sourceHash ||
        env.CREDITS_DISPATCH_NONCE !== binding.dispatchNonce ||
        execution.taskCount !== 1 ||
        template.maxRetries !== 0
      )
        fail("WORKER_BINDING_CONFLICT", 403);
      const succeeded = execution.succeededCount || 0,
        failed = execution.failedCount || 0;
      const cancelled = execution.cancelledCount || 0;
      if (
        execution.reconciling ||
        (execution.runningCount || 0) !== 0 ||
        !execution.completionTime ||
        succeeded + failed + cancelled !== 1
      )
        return { state: "running", creditsHeld: true };
      const completed = (execution.conditions || []).find(
        condition => condition.type === "Completed"
      );
      if (succeeded === 1 && completed?.state === "CONDITION_SUCCEEDED")
        return { state: "succeeded", provider: "google-cloud-run", executionUid: execution.uid };
      if (succeeded === 0 && completed?.state === "CONDITION_FAILED")
        return { state: "failed", provider: "google-cloud-run", executionUid: execution.uid };
      return { state: "unknown", creditsHeld: true };
    },
  };
}

function createLocalProcessVerifier({ db, origin, token, publicKey }) {
  const { assertSandbox } = require("./runtime");
  assertSandbox(process.env, db);
  if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin)) fail("LOOPBACK_WORKER_REQUIRED");
  const requests = db.collection("credits_v2_worker_requests");
  async function request(path, options = {}) {
    const response = await fetch(`${origin}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Worker lookup unavailable");
    return response.json();
  }
  return {
    provider: "local-process",
    async prepare(ctx, target, body) {
      assertSandbox(process.env, db);
      const url = new URL(target);
      if (url.origin !== origin) fail("APPLICATION_TRANSPORT_CONFLICT", 503);
      const executionId = digest([ctx.op.operationId, ctx.stage, url.pathname]);
      const record = {
        executionId,
        operationId: ctx.op.operationId,
        userId: ctx.uid,
        fingerprint: ctx.op.fingerprint,
        requestDigest: workerRequestDigest(body),
        sourceHash: ctx.op.sourceDescriptor.contentHash,
        sourceGeneration: ctx.op.sourceDescriptor.objectGeneration,
        stage: ctx.stage,
        sources: ctx.op.sourceDescriptor.workflowInput.sources,
        endpoint: url.pathname,
      };
      const ref = requests.doc(executionId);
      await db.runTransaction(async tx => {
        const prior = await tx.get(ref);
        if (prior.exists && digest(prior.data()) !== digest(record))
          fail("EXECUTION_CONFLICT", 409);
        if (!prior.exists) tx.create(ref, record);
      });
      return {
        Authorization: `Bearer ${token}`,
        "X-Credits-Execution": Buffer.from(canonical(record)).toString("base64url"),
      };
    },
    async verifyOperation(op) {
      assertSandbox(process.env, db);
      const bindings = await requests.where("operationId", "==", op.operationId).get();
      if (bindings.size < (op.sourceDescriptor.workflowInput.expectedExecutions || 1))
        return { state: "unknown", creditsHeld: true };
      const verified = [];
      for (const doc of bindings.docs) {
        const expected = doc.data();
        let envelope;
        try {
          envelope = await request(`/executions/${expected.executionId}`);
        } catch {
          return { state: "unknown", creditsHeld: true };
        }
        if (!envelope.payload) return { state: envelope.state || "unknown", creditsHeld: true };
        const proof = verifyLocalProcessEnvelope(envelope, expected, publicKey);
        verified.push(proof);
      }
      return {
        state: verified.some(proof => proof.state === "failed") ? "failed" : "succeeded",
        provider: "local-process",
        executions: verified.map(proof => proof.executionId),
        evidence: verified,
      };
    },
  };
}
module.exports = {
  canonical,
  digest,
  workerRequestDigest,
  verifyLocalProcessEnvelope,
  createCloudRunOutcomeVerifier,
  createLocalProcessVerifier,
};
