// aggregationService.js
// Maintains lightweight aggregated counters for fast dashboard reads (H)
// Strategy: idempotent increment via FieldValue.increment. Consumers should call these after lifecycle events.

const { db, admin } = require("../firebaseAdmin");

const COUNTERS_DOC = "global_counters";

async function inc(field, amount = 1) {
  try {
    await db
      .collection("system")
      .doc(COUNTERS_DOC)
      .set(
        {
          [field]: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (e) {
    // swallow errors to avoid side-effects breaking main flow
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

async function getCounters() {
  const snap = await db.collection("system").doc(COUNTERS_DOC).get();
  return snap.exists ? snap.data() : {};
}

module.exports = {
  recordTaskCompletion,
  recordVelocityTrigger,
  recordUploadDuplicate,
  recordPlatformPostDuplicate,
  recordPlatformAmplifyTrigger,
  recordPlatformAccelerationTrigger,
  recordPlatformDecayEvent,
  recordPlatformReactivationEvent,
  recordRateLimitEvent,
  getCounters,
};
