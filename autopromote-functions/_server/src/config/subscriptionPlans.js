const SUBSCRIPTION_PLANS = {
  free: {
    id: "free",
    name: "Starter",
    price: 0,
    features: {
      monthlyCredits: 15,
      uploads: 3,
      platformLimit: 1,
      wolfHuntTasks: 3,
      analytics: "Basic",
      support: "Self-serve",
      multicam: false,
      teamSeats: 1,
    },
  },
  premium: {
    id: "premium",
    name: "Creator",
    price: 14.99,
    paypalPlanIdEnv: "PAYPAL_PREMIUM_PLAN_ID",
    features: {
      monthlyCredits: 150,
      uploads: 20,
      platformLimit: 5,
      wolfHuntTasks: 20,
      analytics: "Workflow analytics",
      support: "Email support",
      multicam: true,
      teamSeats: 1,
    },
  },
  pro: {
    id: "pro",
    name: "Studio",
    price: 34.99,
    paypalPlanIdEnv: "PAYPAL_PRO_PLAN_ID",
    features: {
      monthlyCredits: 500,
      uploads: 80,
      platformLimit: 12,
      wolfHuntTasks: 100,
      analytics: "Advanced insights",
      support: "Priority support",
      multicam: true,
      teamSeats: 3,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Agency",
    price: 99.99,
    paypalPlanIdEnv: "PAYPAL_ENTERPRISE_PLAN_ID",
    features: {
      monthlyCredits: 2000,
      uploads: 240,
      platformLimit: 30,
      wolfHuntTasks: 500,
      analytics: "Team reporting",
      support: "Dedicated support",
      multicam: true,
      teamSeats: 10,
    },
  },
};

/**
 * Credit costs per media operation.
 * These are deducted from the user's monthly credit allocation (or purchased top-ups).
 */
const CREDIT_COSTS = {
  process: 10,       // Smart Crop + Silence Removal + full pipeline
  "render-multicam": 15,
  analyze: 8,
  "render-clip": 5,
  "promo-summary": 18,
  transcribe: 3,
  hook: 3,
  music: 1,
};

/**
 * Credit top-up packages (one-time purchase via PayPal).
 * These supplement the monthly allocation for power users.
 */
const CREDIT_TOP_UP_PACKS = [
  { id: "pack_boost", credits: 50, price: 4.99, name: "Boost Pack" },
  { id: "pack_pro", credits: 200, price: 14.99, name: "Pro Pack", savings: "25%" },
  { id: "pack_studio", credits: 500, price: 29.99, name: "Studio Pack", savings: "40%" },
];

const EDITING_FEATURE_CATALOG = {
  watermarkRemoval: {
    label: "Watermark Cleanup",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "process",
    limitModel: "monthly_credits_then_topups",
  },
  audioExtract: {
    label: "Audio Extraction",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "transcribe",
    limitModel: "monthly_credits_then_topups",
  },
  multicam: {
    label: "Cam Combiner",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "included_on_paid_plans",
  },
  autoDirector: {
    label: "Auto Director",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "included_on_paid_plans",
  },
  flowEdit: {
    label: "Flow Edit / Sync to Sound",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "included_on_paid_plans",
  },
  thumbnailLab: {
    label: "Thumbnail Lab",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "included_on_paid_plans",
  },
  findViralClips: {
    label: "Find Viral Clips",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: false,
    usesStorage: true,
    creditOperation: "analyze",
    limitModel: "monthly_credits_then_topups",
  },
  viralClipStudio: {
    label: "Viral Clip Studio",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "included_on_paid_plans",
  },
  clipRender: {
    label: "Render Final Clip",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "render-clip",
    limitModel: "monthly_credits_then_topups",
  },
  smartPromoSummary: {
    label: "Smart Promo Summary",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "promo-summary",
    limitModel: "monthly_credits_then_topups",
  },
  videoProcessing: {
    label: "AI Video Processing",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "process",
    limitModel: "monthly_credits_then_topups",
  },
  multicamRender: {
    label: "Server Multicam Render",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "render-multicam",
    limitModel: "monthly_credits_then_topups",
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
  const isPaidPlan = normalizedPlanId !== "free";
  const editing = Object.fromEntries(
    Object.entries(EDITING_FEATURE_CATALOG).map(([featureId, feature]) => {
      const enabled = isPaidPlan;
      const creditCost = feature.creditOperation ? getCreditCost(feature.creditOperation) : 0;
      return [
        featureId,
        {
          label: feature.label,
          enabled,
          creditCost,
          topUpEligible: enabled && creditCost > 0,
          included: enabled && creditCost === 0,
        },
      ];
    })
  );

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
    credits: {
      monthlyAllocation: plan.features.monthlyCredits || 0,
      label: `${plan.features.monthlyCredits || 0} editing credits per month`,
    },
    multicam: !!plan.features.multicam,
    teamSeats: plan.features.teamSeats || 1,
    editing: {
      allPaidFeaturesUnlocked: isPaidPlan,
      topUpsEnabled: isPaidPlan,
      monthlyCreditsIncluded: plan.features.monthlyCredits || 0,
      policy:
        "Paid plans include the creative toolset. Credit-based generations draw from your monthly allowance first, and you can top up anytime.",
      features: editing,
    },
  };
}

function getMonthlyCreditLimit(planId) {
  return resolvePlan(planId).features.monthlyCredits || 0;
}

function getCreditCost(operation) {
  return CREDIT_COSTS[operation] || 0;
}

module.exports = {
  SUBSCRIPTION_PLANS,
  PLAN_CAPABILITIES,
  CREDIT_COSTS,
  CREDIT_TOP_UP_PACKS,
  EDITING_FEATURE_CATALOG,
  normalizePlanId,
  resolvePlan,
  getUploadLimitForPlan,
  getPlatformLimitForPlan,
  getPlanCapabilities,
  getMonthlyCreditLimit,
  getCreditCost,
};
