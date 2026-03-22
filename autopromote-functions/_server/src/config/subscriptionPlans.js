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

const PLAN_CAPABILITIES = {
  free: {
    analytics: {
      allowedRanges: ["24h", "7d"],
      platformBreakdown: false,
      recoveryLab: false,
      canExport: false,
      topContentLimit: 10,
      summary: "Recent KPI snapshot for published content.",
    },
    support: {
      ticketAccess: false,
      allowedPriorities: ["low"],
      responseTarget: "Self-serve resources and billing page guidance",
      channel: "Self-serve",
    },
  },
  premium: {
    analytics: {
      allowedRanges: ["24h", "7d", "30d"],
      platformBreakdown: true,
      recoveryLab: false,
      canExport: false,
      topContentLimit: 25,
      summary: "Workflow analytics with platform breakdown and 30-day history.",
    },
    support: {
      ticketAccess: true,
      allowedPriorities: ["low", "medium"],
      responseTarget: "Email support lane, target reply within 2 business days",
      channel: "Email support",
    },
  },
  pro: {
    analytics: {
      allowedRanges: ["24h", "7d", "30d", "90d", "all"],
      platformBreakdown: true,
      recoveryLab: true,
      canExport: false,
      topContentLimit: 50,
      summary: "Advanced insights with Recovery Lab access and full history.",
    },
    support: {
      ticketAccess: true,
      allowedPriorities: ["low", "medium", "high"],
      responseTarget: "Priority queue, target reply within 1 business day",
      channel: "Priority support",
    },
  },
  enterprise: {
    analytics: {
      allowedRanges: ["24h", "7d", "30d", "90d", "all"],
      platformBreakdown: true,
      recoveryLab: true,
      canExport: true,
      topContentLimit: 100,
      summary: "Team reporting with export-ready analytics and Recovery Lab.",
    },
    support: {
      ticketAccess: true,
      allowedPriorities: ["low", "medium", "high"],
      responseTarget: "Dedicated support lane with fastest handling",
      channel: "Dedicated support",
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

function getPlanCapabilities(planId) {
  const normalizedPlanId = normalizePlanId(planId);
  const plan = resolvePlan(normalizedPlanId);
  const base = PLAN_CAPABILITIES[normalizedPlanId] || PLAN_CAPABILITIES.free;
  const missionQuota = Number(plan.features.wolfHuntTasks);

  return {
    planId: normalizedPlanId,
    planName: plan.name,
    analytics: {
      ...base.analytics,
      label: plan.features.analytics,
    },
    support: {
      ...base.support,
      label: plan.features.support,
    },
    missions: {
      label: `${plan.features.wolfHuntTasks} mission opportunities per month`,
      monthlyBoosts: Number.isFinite(missionQuota) ? missionQuota : 0,
    },
  };
}

module.exports = {
  SUBSCRIPTION_PLANS,
  PLAN_CAPABILITIES,
  normalizePlanId,
  resolvePlan,
  getUploadLimitForPlan,
  getPlatformLimitForPlan,
  getPlanCapabilities,
};
