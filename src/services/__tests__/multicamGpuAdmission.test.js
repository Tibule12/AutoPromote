jest.mock("../cloudRunJobService", () => ({
  executeMulticamRenderJob: jest.fn(),
  inspectMulticamExecution: jest.fn(),
  cancelMulticamExecution: jest.fn(),
}));
const transport = require("../cloudRunJobService");
const {
  fenceForCpu,
  recordDispatch,
  failUnstarted,
  ensureMulticamGpuAdmission,
} = require("../multicamGpuAdmission");
function state(extra = {}) {
  let value = {
    jobId: "one-job",
    userId: "owner",
    status: "queued",
    executionDevice: "gpu",
    dispatchTokenHash: "old-hash",
    cloudRunOperation: "projects/p/locations/r/operations/gpu",
    dispatchedAt: new Date(Date.now() - 360000).toISOString(),
    multicamRequest: { sources: [{ id: "cam-1" }] },
    creditReceipt: { charged: 15 },
    ...extra,
  };
  const ref = { get: async () => ({ data: () => structuredClone(value) }) };
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async fn =>
      fn({
        get: ref.get,
        set: (_ref, patch) => {
          value = { ...value, ...patch };
        },
      }),
  };
  return { ref, db, read: () => value };
}
beforeEach(() => {
  jest.clearAllMocks();
  transport.inspectMulticamExecution.mockResolvedValue({
    terminalFailure: true,
    executionName: "gpu-execution",
  });
  transport.cancelMulticamExecution.mockResolvedValue();
  transport.executeMulticamRenderJob.mockResolvedValue({
    device: "cpu",
    routeReason: "gpu_unavailable",
    operationName: "cpu-operation",
    executionName: "cpu-execution",
    resourceName: "cpu-job",
  });
});
test("a GPU queue failure fences the old task before running exactly one CPU fallback with the same edit and receipt", async () => {
  const s = state(),
    failure = jest.fn();
  transport.inspectMulticamExecution.mockImplementation(async dispatch => {
    if (dispatch.operationName === "cpu-operation") {
      s.read().status = "proofing";
      s.read().renderLease = { claimedAt: "now" };
      return { terminalFailure: false };
    }
    return { terminalFailure: true, executionName: "gpu-execution" };
  });
  await ensureMulticamGpuAdmission({ ...s, jobId: "one-job", onFailure: failure, pollMs: 0 });
  expect(transport.executeMulticamRenderJob).toHaveBeenCalledTimes(1);
  expect(transport.executeMulticamRenderJob).toHaveBeenCalledWith(
    expect.objectContaining({
      jobId: "one-job",
      preferredDevice: "cpu",
      multicamRequest: { sources: [{ id: "cam-1" }] },
    })
  );
  expect(s.read()).toMatchObject({
    executionDevice: "cpu",
    gpuFallbackCount: 1,
    creditReceipt: { charged: 15 },
    cloudRunOperation: "cpu-operation",
  });
  expect(s.read().dispatchTokenHash).not.toBe("old-hash");
  expect(failure).not.toHaveBeenCalled();
});
test.each([
  { renderLease: { claimedAt: new Date().toISOString() } },
  { status: "completed" },
  { creditsRefunded: true },
])("a claimed, completed or refunded GPU render is never forked to CPU: %j", async extra => {
  const s = state(extra);
  expect(await fenceForCpu(s.db, s.ref, "old-hash")).toBeNull();
  await ensureMulticamGpuAdmission({ ...s, jobId: "one-job", onFailure: jest.fn() });
  expect(transport.executeMulticamRenderJob).not.toHaveBeenCalled();
});
test("stale API instances cannot fence a newer dispatch", async () => {
  const s = state();
  expect(await fenceForCpu(s.db, s.ref, "wrong-hash")).toBeNull();
  expect(s.read().dispatchTokenHash).toBe("old-hash");
});
test("recording a late admission reply cannot overwrite worker progress or completed delivery", async () => {
  const s = state({
    status: "completed",
    renderLease: { claimedAt: "now" },
    outputStoragePath: "owned/result.mp4",
  });
  await recordDispatch(s.db, s.ref, {
    device: "gpu",
    executionName: "gpu-exec",
    operationName: "gpu-op",
    resourceName: "gpu-job",
  });
  expect(s.read()).toMatchObject({ status: "completed", outputStoragePath: "owned/result.mp4" });
});
test("a definitive CPU dispatch refusal refunds once and revokes the task token", async () => {
  const s = state(),
    failure = jest.fn();
  transport.executeMulticamRenderJob.mockRejectedValue({
    message: "CPU disabled",
    response: { status: 403 },
  });
  await ensureMulticamGpuAdmission({ ...s, jobId: "one-job", onFailure: failure, pollMs: 0 });
  expect(s.read()).toMatchObject({ status: "dispatch_failed", dispatchTokenHash: null });
  expect(failure).toHaveBeenCalledTimes(1);
});
test("a worker that claims during cancellation keeps its lease and cannot be refunded by dispatch recovery", async () => {
  const s = state({ renderLease: { claimedAt: "now" } }),
    failure = jest.fn();
  await failUnstarted(s.db, s.ref, "old-hash", new Error("late failure"), failure);
  expect(failure).not.toHaveBeenCalled();
  expect(s.read().status).toBe("queued");
});

test("an accepted CPU fallback that fails before claiming settles once without another task", async () => {
  const s = state({
      executionDevice: "cpu",
      gpuFallbackCount: 1,
      cloudRunOperation: "cpu-operation",
    }),
    failure = jest.fn();
  await ensureMulticamGpuAdmission({ ...s, jobId: "one-job", onFailure: failure, pollMs: 0 });
  expect(s.read()).toMatchObject({ status: "dispatch_failed", dispatchTokenHash: null });
  expect(transport.executeMulticamRenderJob).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledTimes(1);
});
