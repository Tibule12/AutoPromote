// aggregationService.js
// Maintains lightweight aggregated counters for fast dashboard reads (H)
// Strategy: idempotent increment via FieldValue.increment. Consumers should call these after lifecycle events.

const { db, admin } = require("../firebaseAdmin");

const COUNTERS_DOC = "global_counters";

async function inc(field, amount = 1) {
  try {
    const FieldValue = admin && admin.firestore && admin.firestore.FieldValue;
    if (FieldValue && typeof FieldValue.increment === "function") {
      await db
        .collection("system")
        .doc(COUNTERS_DOC)
        .set(
          {
            [field]: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } else {
      // Fallback: use transaction to increment numerically when FieldValue.increment unavailable (emulator/compat issues)
      const ref = db.collection("system").doc(COUNTERS_DOC);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const cur = snap.exists && typeof snap.data()[field] === "number" ? snap.data()[field] : 0;
        tx.set(
          ref,
          {
            [field]: cur + amount,
            updatedAt:
              FieldValue && FieldValue.serverTimestamp
                ? FieldValue.serverTimestamp()
                : new Date().toISOString(),
          },
          { merge: true }
        );
      });
    }
  } catch (e) {
    // swallow errors to avoid side-effects breaking main flow
    try {
      console.warn("[aggregationService][inc] failed:", e && e.message);
    } catch (_) {}
  }
}

async function recordTaskCompletion(taskType, success = true) {
  await inc("tasks_total");
  await inc(`tasks_type_${taskType}`);
  await inc(success ? "tasks_success" : "tasks_failed");
}

async function recordVelocityTrigger() {
  await inc("velocity_triggers");
}
async function recordUploadDuplicate(skipped) {
  await inc(skipped ? "duplicate_upload_hits" : "duplicate_upload_misses");
}
async function recordPlatformPostDuplicate(skipped) {
  await inc(skipped ? "duplicate_post_hits" : "duplicate_post_misses");
}

async function recordTaskEnqueued() {
  await inc("tasks_enqueued");
}
async function recordPlatformAmplifyTrigger() {
  await inc("platform_amplify_triggers");
}
async function recordPlatformAccelerationTrigger() {
  await inc("platform_acceleration_triggers");
}
async function recordPlatformDecayEvent() {
  await inc("platform_decay_events");
}
async function recordPlatformReactivationEvent() {
  await inc("platform_reactivation_events");
}
async function recordRateLimitEvent(platform) {
  await inc(`rate_limit_${platform || "generic"}`);
}

async function recordLockTakeoverAttempt(platform) {
  await inc("lock_takeover_attempt_total");
  await inc(`lock_takeover_attempt_${platform || "generic"}`);
}
async function recordLockTakeoverSuccess(platform) {
  await inc("lock_takeover_success_total");
  await inc(`lock_takeover_success_${platform || "generic"}`);
}
async function recordLockTakeoverFailure(platform) {
  await inc("lock_takeover_failure_total");
  await inc(`lock_takeover_failure_${platform || "generic"}`);
}

async function getCounters() {
  const snap = await db.collection("system").doc(COUNTERS_DOC).get();
  return snap.exists ? snap.data() : {};
}

module.exports = {
  recordTaskCompletion,
  recordVelocityTrigger,
  recordUploadDuplicate,
  recordPlatformPostDuplicate,
  recordTaskEnqueued,
  recordPlatformAmplifyTrigger,
  recordPlatformAccelerationTrigger,
  recordPlatformDecayEvent,
  recordPlatformReactivationEvent,
  recordRateLimitEvent,
  recordLockTakeoverAttempt,
  recordLockTakeoverSuccess,
  recordLockTakeoverFailure,
  getCounters,
};
