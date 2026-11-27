const crypto = require("crypto");
const {
  executeMulticamRenderJob,
  inspectMulticamExecution,
  cancelMulticamExecution,
} = require("./cloudRunJobService");
const watching = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const admissionMs = () =>
  Math.max(
    15000,
    Math.min(300000, Number(process.env.MULTICAM_GPU_ADMISSION_TIMEOUT_MS) || 180000)
  );
const unclaimed = data =>
  data && data.status === "queued" && !data.renderLease?.claimedAt && !data.creditsRefunded;
const eligible = data =>
  unclaimed(data) &&
  (data.executionDevice === "gpu" || (data.executionDevice === "cpu" && data.gpuFallbackCount));

// Fence before dispatching CPU. An already-running GPU wins the transaction;
// a delayed GPU with the old token cannot claim or mutate the CPU's job.
async function fenceForCpu(db, ref, expectedHash) {
  const token = crypto.randomUUID();
  const job = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref),
      data = snap.data();
    if (!eligible(data) || data.dispatchTokenHash !== expectedHash) return null;
    const recovery =
      data.executionDevice === "cpu" ? Number(data.cpuDispatchRecoveryCount || 0) + 1 : 0;
    if (recovery > 1) return null;
    const now = new Date().toISOString();
    transaction.set(
      ref,
      {
        dispatchTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        executionDevice: "cpu",
        workerRouteReason: "gpu_unavailable",
        gpuFallbackCount: 1,
        cpuDispatchRecoveryCount: recovery,
        stage: "cpu_fallback_dispatching",
        detail: "GPU unavailable before rendering; continuing the same edit on CPU",
        cloudRunOperation: null,
        cloudRunExecution: null,
        dispatchedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    return data;
  });
  return job ? { token, job } : null;
}

async function recordDispatch(db, ref, dispatch) {
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref),
      data = snap.data();
    if (!data) return;
    const queued = data.status === "queued" && !data.renderLease?.claimedAt;
    transaction.set(
      ref,
      {
        cloudRunExecution: dispatch.executionName,
        cloudRunOperation: dispatch.operationName,
        cloudRunJobResource: dispatch.resourceName,
        executionDevice: dispatch.device,
        workerRouteReason: dispatch.routeReason,
        ...(dispatch.device === "cpu" && dispatch.routeReason === "gpu_unavailable"
          ? { gpuFallbackCount: 1 }
          : {}),
        dispatchedAt: data.dispatchedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(queued
          ? {
              stage: "cloud_run_job_accepted",
              detail: `${dispatch.device.toUpperCase()} render worker accepted the job`,
            }
          : {}),
      },
      { merge: true }
    );
  });
}

async function failUnstarted(db, ref, expectedHash, error, onFailure) {
  const data = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref),
      current = snap.data();
    if (!unclaimed(current) || current.dispatchTokenHash !== expectedHash) return null;
    transaction.set(
      ref,
      {
        dispatchTokenHash: null,
        status: "dispatch_failed",
        stage: "dispatch_failed",
        error: error.message,
        failedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return current;
  });
  if (data) await onFailure(data, error);
}

function ensureMulticamGpuAdmission({ db, jobId, onFailure, pollMs = 5000 }) {
  if (watching.has(jobId)) return watching.get(jobId);
  const ref = db.collection("video_edits").doc(jobId);
  const promise = (async () => {
    for (;;) {
      const snap = await ref.get(),
        data = snap.data();
      if (!eligible(data)) return;
      const age = Date.now() - Date.parse(data.dispatchedAt || data.createdAt || 0);
      let observation = null;
      if (data.cloudRunOperation) {
        try {
          observation = await inspectMulticamExecution({
            operationName: data.cloudRunOperation,
            executionName: data.cloudRunExecution,
          });
        } catch (_error) {
          /* Admission timeout and the transactional fence remain authoritative. */
        }
      }
      if (!observation?.terminalFailure && age < admissionMs()) {
        await delay(pollMs);
        continue;
      }
      if (
        data.executionDevice === "cpu" &&
        (data.cloudRunOperation || Number(data.cpuDispatchRecoveryCount || 0) >= 1)
      ) {
        await failUnstarted(
          db,
          ref,
          data.dispatchTokenHash,
          new Error("CPU fallback could not start; no render was claimed"),
          onFailure
        );
        return;
      }
      const fenced = await fenceForCpu(db, ref, data.dispatchTokenHash);
      if (!fenced) return;
      // Cancellation conserves capacity; the rotated dispatch token is the
      // correctness boundary even if the provider cancellation reply is lost.
      if (data.executionDevice === "gpu") {
        try {
          await cancelMulticamExecution(observation?.executionName || data.cloudRunExecution);
        } catch (_error) {
          /* The old task has already been fenced. */
        }
      }
      try {
        const dispatch = await executeMulticamRenderJob({
          jobId,
          dispatchToken: fenced.token,
          multicamRequest: data.multicamRequest,
          preferredDevice: "cpu",
        });
        await recordDispatch(db, ref, dispatch);
        // Keep observing the accepted CPU fallback until its atomic claim.
        // A failed CPU startup must settle the same reservation, not hang.
        continue;
      } catch (error) {
        const current = (await ref.get()).data();
        if (error.response && Number(error.response.status) < 500) {
          await failUnstarted(db, ref, current.dispatchTokenHash, error, onFailure);
          return;
        }
        // Unknown admission is not a second render attempt. Wait, recheck the
        // worker's atomic claim, and fence again only while still unclaimed.
        await delay(pollMs);
      }
    }
  })()
    .catch(error => console.error("[Multicam] GPU admission recovery failed:", error.message))
    .finally(() => watching.delete(jobId));
  watching.set(jobId, promise);
  return promise;
}

module.exports = {
  eligible,
  fenceForCpu,
  recordDispatch,
  ensureMulticamGpuAdmission,
  failUnstarted,
};
