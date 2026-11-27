// Coordinated release configuration. A Render dashboard/API key is unnecessary
// for these nonsecret values; the existing merchant credentials remain private.
function applyReleaseConfig(env = process.env) {
  const release = require('../../../config/free-first-release/activation.json');
  if (!release.enabled) return false;
  const profiles = require('../../../config/free-first-release/worker-profiles.prepared.json');
  if (!profiles.length || !release.cutoverAt || !/^P-[A-Z0-9]+$/.test(release.paypalPlanId) ||
      release.monthlyMicros !== 10000000 || release.dailyMicros !== 2000000 ||
      release.apiDailyMicros !== 50000 || release.maxActive !== 1)
    throw Error('Invalid approved Free/Plus release configuration');
  env.FREE_FIRST_USAGE_ENABLED = 'true';
  env.PROCESSING_CLOUD_RUN_ADAPTER_ENABLED = 'true';
  env.PROCESSING_CLOUD_RUN_PROFILES_JSON = JSON.stringify(profiles.filter(p=>p.id!=='failure-cpu'));
  env.PROCESSING_LAUNCH_CUTOVER = release.cutoverAt;
  env.PROCESSING_BUDGET_LIMITS_JSON = JSON.stringify({ dailyMicros: release.dailyMicros,
    monthlyMicros: release.monthlyMicros, apiDailyMicros: release.apiDailyMicros,
    freeDailyMicros: release.dailyMicros, maxActive: 1, maxActiveUser: 1 });
  env.PAYPAL_PLUS_PLAN_ID = release.paypalPlanId;
  env.PLUS_PURCHASES_ENABLED = release.plusPurchasesEnabled ? 'true' : 'false';
  env.REQUIRE_PAYPAL_WEBHOOK_VERIFICATION = 'true';
  return true;
}
module.exports = { applyReleaseConfig };
