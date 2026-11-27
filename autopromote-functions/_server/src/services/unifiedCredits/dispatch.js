const { assertSandbox } = require("./runtime");
const { fail } = require("./policy");

// One wallet/outbox for every supported tool. This adapter runs no real jobs.
function createEmulatorWorker({ db }) {
  assertSandbox(process.env, db);
  const ref = key => db.collection("credits_v2_worker_executions").doc(key);
  return {
    async submitOnce(operation) {
      assertSandbox(process.env, db);
      return db.runTransaction(async tx => {
        const existing = await tx.get(ref(operation.operationId));
        if (existing.exists) {
          const data = existing.data();
          if (data.userId !== operation.userId || data.fingerprint !== operation.fingerprint)
            fail("EXECUTION_CONFLICT", 409);
          return data;
        }
        const execution = {
          operationId: operation.operationId,
          userId: operation.userId,
          fingerprint: operation.fingerprint,
          executionId: `local-${operation.operationId}`,
          state: "running",
          sandbox: true,
        };
        tx.create(ref(operation.operationId), execution);
        return execution;
      });
    },
    async find(operationId) {
      assertSandbox(process.env, db);
      const snap = await ref(operationId).get();
      return snap.exists ? snap.data() : null;
    },
    // Explicit fixture control, never a public worker callback or provider proof.
    async finish(operationId, outcome) {
      assertSandbox(process.env, db);
      if (!["succeeded", "failed"].includes(outcome)) fail("INVALID_OUTCOME");
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref(operationId));
        if (!snap.exists) fail("EXECUTION_NOT_FOUND", 404);
        if (snap.data().state !== "running" && snap.data().state !== outcome)
          fail("SETTLEMENT_CONFLICT", 409);
        tx.update(snap.ref, { state: outcome });
      });
    },
  };
}

function createDispatcher({ db, service, worker }) {
  assertSandbox(process.env, db);
  async function reconcile(uid, operationId) {
    assertSandbox(process.env, db);
    const op = await service.getOperation(uid, operationId);
    if (["succeeded", "failed", "cancelled"].includes(op.state))
      return { state: op.state, alreadySettled: true };
    if (op.state === "reserved") return { state: "reserved" };
    const execution = await worker.find(operationId);
    // Missing/uncertain evidence must not trigger either resubmission or refund.
    if (!execution) return { state: "unknown", creditsHeld: true };
    if (
      execution.userId !== uid ||
      execution.operationId !== operationId ||
      execution.fingerprint !== op.fingerprint ||
      typeof execution.executionId !== "string"
    )
      fail("UNVERIFIED_WORKER_OUTCOME", 403);
    await service.attachExecution(uid, operationId, execution.executionId);
    if (execution.state === "running") return { state: "running", creditsHeld: true };
    if (!["succeeded", "failed"].includes(execution.state))
      return { state: "unknown", creditsHeld: true };
    return service.settle(uid, operationId, execution.state, execution.executionId);
  }
  return {
    async dispatch(uid, operationId) {
      assertSandbox(process.env, db);
      // Only the winner submits; a later delivery can reconcile, never resubmit.
      const operation = await service.start(uid, operationId);
      const execution = await worker.submitOnce(operation);
      if (
        execution.userId !== uid ||
        execution.operationId !== operationId ||
        execution.fingerprint !== operation.fingerprint
      )
        fail("UNVERIFIED_WORKER_OUTCOME", 403);
      await service.attachExecution(uid, operationId, execution.executionId);
      return execution;
    },
    reconcile,
    async runMock(uid, reservation, simulateFailure = false) {
      const op = await service.reserve(uid, reservation);
      if (op.alreadyReserved) return reconcile(uid, op.operationId);
      await this.dispatch(uid, op.operationId);
      await worker.finish(op.operationId, simulateFailure ? "failed" : "succeeded");
      return reconcile(uid, op.operationId);
    },
  };
}
module.exports = { createEmulatorWorker, createDispatcher };
