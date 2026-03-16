const SUBSCRIPTION_PLANS = {
  free: {
    id: "free",
    name: "Starter",
    price: 0,
    features: {
      uploads: 5,
      platformLimit: 1,
      wolfHuntTasks: 5,
      analytics: "Basic",
      support: "Self-serve",
    },
  },
  premium: {
    id: "premium",
    name: "Creator",
    price: 9.99,
    paypalPlanIdEnv: "PAYPAL_PREMIUM_PLAN_ID",
    features: {
      uploads: 15,
      platformLimit: 3,
      wolfHuntTasks: 20,
      analytics: "Workflow analytics",
      support: "Email support",
    },
  },
  pro: {
    id: "pro",
    name: "Studio",
    price: 29.99,
    paypalPlanIdEnv: "PAYPAL_PRO_PLAN_ID",
    features: {
      uploads: 25,
      platformLimit: "Unlimited",
      wolfHuntTasks: 100,
      analytics: "Advanced insights",
      support: "Priority support",
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Team",
    price: 99.99,
    paypalPlanIdEnv: "PAYPAL_ENTERPRISE_PLAN_ID",
    features: {
      uploads: 50,
      platformLimit: "Unlimited",
      wolfHuntTasks: 500,
      analytics: "Team reporting",
      support: "Dedicated support",
    },
  },
};

function normalizePlanId(value) {
  const raw = (value || "free").toString().trim().toLowerCase();
  if (raw === "basic") return "premium";
  return SUBSCRIPTION_PLANS[raw] ? raw : "free";
}

function resolvePlan(planId) {
  return SUBSCRIPTION_PLANS[normalizePlanId(planId)] || SUBSCRIPTION_PLANS.free;
}

function getUploadLimitForPlan(planId) {
  const uploads = resolvePlan(planId).features.uploads;
  return uploads === "Unlimited" || uploads === "unlimited" ? Infinity : Number(uploads) || 0;
}

function getPlatformLimitForPlan(planId) {
  const limit = resolvePlan(planId).features.platformLimit;
  return limit === "Unlimited" || limit === "unlimited" ? Infinity : Number(limit) || 1;
}

module.exports = {
  SUBSCRIPTION_PLANS,
  normalizePlanId,
  resolvePlan,
  getUploadLimitForPlan,
  getPlatformLimitForPlan,
};
