const { SUBSCRIPTION_PLANS } = require("../../config/subscriptionPlans");
const { integer, fail } = require("../unifiedCredits/policy");

const TOKEN_MICROS = 1000; // Budget unit only. Never a purchased-credit exchange rate.
const DAY = 86400000;
const DESTINATIONS = ["youtube", "tiktok", "instagram", "facebook", "linkedin", "reddit"];
// Estimates, pending invoice attribution. These limits must be enforced by the worker.
const OPERATIONS = Object.freeze({
  "clips.analyze": { maxMicros: 20000, maxSeconds: 60, resource: "cpu", retries: 0 },
  "clips.render": { maxMicros: 30000, maxSeconds: 120, resource: "cpu", retries: 0 },
  "audio.extract": { maxMicros: 10000, maxSeconds: 30, resource: "cpu", retries: 0 },
  "audio.sync": { maxMicros: 20000, maxSeconds: 60, resource: "cpu", retries: 0 },
  "captions.generate": { maxMicros: 10000, maxSeconds: 30, resource: "external-api", retries: 0 },
  "publisher.publish": { maxMicros: 10000, maxSeconds: 60, resource: "network", retries: 0 },
  "scheduler.dispatch": { maxMicros: 2000, maxSeconds: 10, resource: "cpu", retries: 0 },
  // A 60s native title edit includes source/crop/composite passes. The measured
  // 120s attempt timed out; 240s still fits this unchanged reference reservation
  // (240 * 116 CPU/memory micros + 1000 overhead = 28,840 micros).
  "studio.render": { maxMicros: 30000, maxSeconds: 240, resource: "cpu", retries: 0 },
  "video.process": { maxMicros: 30000, maxSeconds: 240, resource: "cpu", retries: 0 },
  // Current GPU/long-job ceilings cannot fit the proposed Free envelope.
  "multicam.render": {
    maxMicros: 12747168,
    maxSeconds: 14400,
    resource: "cpu",
    retries: 0,
    calibrated: false,
  },
  "background.remove": {
    maxMicros: 531132,
    maxSeconds: 600,
    resource: "gpu",
    retries: 0,
    calibrated: false,
  },
  "blender.render": {
    maxMicros: 2921226,
    maxSeconds: 3300,
    resource: "gpu",
    retries: 0,
    calibrated: false,
  },
});
function processingPlan(tier) {
  if (["premium", "basic", "pro", "enterprise"].includes(tier))
    return SUBSCRIPTION_PLANS.plus.processing;
  return SUBSCRIPTION_PLANS[tier]?.processing || SUBSCRIPTION_PLANS.free.processing;
}
function quote(operation, policy = OPERATIONS) {
  const cost = policy[operation];
  if (!cost) fail("UNPRICED_OPERATION", 409);
  if (cost.calibrated === false) fail("COST_VALIDATION_REQUIRED", 409);
  integer(cost.maxMicros, "COST", 1);
  integer(cost.maxSeconds, "DURATION", 1);
  return {
    ...cost,
    operation,
    tokens: Math.ceil(cost.maxMicros / TOKEN_MICROS),
    costBasis: "conservative-estimate",
    provisional: true,
  };
}
module.exports = { TOKEN_MICROS, DAY, DESTINATIONS, OPERATIONS, processingPlan, quote };
