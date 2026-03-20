// planService.js - Parses subscription plans from ENV and provides helper lookups
// ENV VAR: SUBSCRIPTION_PLANS_JSON
// Example:
// [
//  {"id":"free","price":0,"monthlyTaskQuota":5,"aiQuota":80},
//  {"id":"pro","price":19,"monthlyTaskQuota":100,"aiQuota":500},
//  {"id":"enterprise","price":99,"monthlyTaskQuota":500,"aiQuota":2000}
// ]

const { SUBSCRIPTION_PLANS, normalizePlanId } = require("../config/subscriptionPlans");

const DEFAULT_AI_QUOTAS = {
  free: 80,
  premium: 200,
  pro: 500,
  enterprise: 2000,
};

function buildDefaultPlans() {
  return Object.values(SUBSCRIPTION_PLANS).map(plan => ({
    id: plan.id,
    price: Number(plan.price) || 0,
    monthlyTaskQuota: Number(plan.features && plan.features.wolfHuntTasks) || 0,
    aiQuota: DEFAULT_AI_QUOTAS[plan.id] || 0,
  }));
}

function normalizePlanRecord(plan, defaultsById) {
  const id = normalizePlanId(plan && plan.id);
  const defaults = defaultsById[id] || defaultsById.free;
  return {
    id,
    price: Number(plan && plan.price) || defaults.price,
    monthlyTaskQuota: Number(plan && plan.monthlyTaskQuota) || defaults.monthlyTaskQuota,
    aiQuota: Number(plan && plan.aiQuota) || defaults.aiQuota,
  };
}

let parsed = null;
function loadPlans() {
  if (parsed) return parsed;

  const defaultPlans = buildDefaultPlans();
  const defaultsById = defaultPlans.reduce((accumulator, plan) => {
    accumulator[plan.id] = plan;
    return accumulator;
  }, {});

  try {
    const raw = process.env.SUBSCRIPTION_PLANS_JSON;
    if (!raw) {
      parsed = defaultPlans;
      return parsed;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) throw new Error("empty array");
    parsed = arr.map(plan => normalizePlanRecord(plan, defaultsById));
    return parsed;
  } catch (e) {
    parsed = defaultPlans;
    return parsed;
  }
}

function getPlans() {
  return loadPlans();
}
function getPlan(id) {
  const normalizedId = normalizePlanId(id);
  return loadPlans().find(p => p.id === normalizedId) || loadPlans()[0];
}

module.exports = { getPlans, getPlan };
