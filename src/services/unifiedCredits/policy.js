const crypto = require("crypto");
const { SUBSCRIPTION_PLANS } = require("../../config/subscriptionPlans");

const OPERATIONS = [
  "queue.dispatch",
  "publisher.publish",
  "studio.render",
  "clips.analyze",
  "clips.render",
];
function fail(code, status = 400) {
  throw Object.assign(new Error(code), { code, status });
}
function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`INVALID_${name}`);
  return value;
}
function checkedAdd(a, b) {
  return integer(a + b, "ARITHMETIC");
}
function checkedMultiply(a, b) {
  return integer(a * b, "ARITHMETIC");
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function validatePolicy(input) {
  const policy = JSON.parse(JSON.stringify(input));
  if (typeof policy.version !== "string" || !/^[\w.-]{1,80}$/.test(policy.version))
    fail("INVALID_VERSION");
  for (const name of [
    "microsPerCredit",
    "maxBalance",
    "maxJobMicros",
    "monthlySpendMicros",
    "userMonthlySpendMicros",
    "monthlyIssuanceMicros",
    "maxActiveGlobal",
    "maxActiveUser",
    "rewardCredits",
    "rewardMonthlyCap",
    "rewardTtlSeconds",
  ])
    integer(policy[name], name, 1);
  policy.monthlyCredits =
    policy.monthlyCredits ||
    Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => [id, plan.features.monthlyCredits])
    );
  for (const tier of ["free", "premium", "pro", "enterprise"]) {
    integer(policy.monthlyCredits[tier], `ALLOWANCE_${tier}`);
    if (policy.monthlyCredits[tier] > policy.maxBalance) fail("ALLOWANCE_EXCEEDS_WALLET_CAP");
  }
  if (policy.rewardCredits > policy.maxBalance) fail("REWARD_EXCEEDS_WALLET_CAP");
  for (const op of OPERATIONS) {
    const price = policy.operations?.[op];
    if (!price || !["seconds", "destinations"].includes(price.unit)) fail("MISSING_OPERATION");
    integer(price.baseMicros, "BASE_COST");
    integer(price.microsPerUnit, "UNIT_COST", 1);
    integer(price.maxUnits, "MAX_UNITS", 1);
    checkedAdd(price.baseMicros, checkedMultiply(price.microsPerUnit, price.maxUnits));
  }
  // Bind consent and retries to the entire pricing configuration, not just an editable label.
  policy.revision = crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex");
  return freeze(policy);
}

function quoteOperation(policy, operation, units) {
  if (!OPERATIONS.includes(operation)) fail("UNSUPPORTED_OPERATION");
  const price = policy.operations[operation];
  integer(units, "UNITS", 1);
  if (units > price.maxUnits) fail("RESOURCE_LIMIT", 413);
  const maxCostMicros = checkedAdd(price.baseMicros, checkedMultiply(price.microsPerUnit, units));
  if (maxCostMicros > policy.maxJobMicros) fail("JOB_BUDGET_EXCEEDED", 429);
  return {
    operation,
    units,
    unit: price.unit,
    maxCostMicros,
    credits: integer(Math.ceil(maxCostMicros / policy.microsPerCredit), "PRICE", 1),
    pricingVersion: policy.version,
    pricingRevision: policy.revision,
  };
}

module.exports = {
  OPERATIONS,
  fail,
  integer,
  checkedAdd,
  checkedMultiply,
  validatePolicy,
  quoteOperation,
};
