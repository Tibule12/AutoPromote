// planService.js - Parses subscription plans from ENV and provides helper lookups
// ENV VAR: SUBSCRIPTION_PLANS_JSON
// Example:
// [
//  {"id":"free","price":0,"monthlyTaskQuota":15,"aiQuota":80},
//  {"id":"pro","price":19,"monthlyTaskQuota":300,"aiQuota":500},
//  {"id":"growth","price":49,"monthlyTaskQuota":1200,"aiQuota":2000}
// ]

let parsed = null;
function loadPlans() {
  if (parsed) return parsed;
  try {
    const raw = process.env.SUBSCRIPTION_PLANS_JSON;
    if (!raw) {
      parsed = [{ id: "free", price: 0, monthlyTaskQuota: 15, aiQuota: 80 }];
      return parsed;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) throw new Error("empty array");
    parsed = arr.map(p => ({
      id: String(p.id),
      price: Number(p.price) || 0,
      monthlyTaskQuota: Number(p.monthlyTaskQuota) || 0,
      aiQuota: Number(p.aiQuota) || 0,
    }));
    return parsed;
  } catch (e) {
    parsed = [{ id: "free", price: 0, monthlyTaskQuota: 15, aiQuota: 80 }];
    return parsed;
  }
}

function getPlans() {
  return loadPlans();
}
function getPlan(id) {
  return loadPlans().find(p => p.id === id) || loadPlans()[0];
}

module.exports = { getPlans, getPlan };
