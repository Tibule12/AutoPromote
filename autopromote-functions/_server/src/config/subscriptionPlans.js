const LEGACY_SUBSCRIPTION_PLANS = {
  free: {
    id: "free",
    name: "Starter",
    price: 0,
    features: {
      monthlyCredits: 15,
      uploads: 3,
      platformLimit: 1,
      monthlyPromotions: 3,
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
      monthlyPromotions: 20,
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
      platformLimit: 6,
      monthlyPromotions: 100,
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
      platformLimit: 6,
      monthlyPromotions: 500,
      support: "Priority support",
      multicam: true,
      teamSeats: 10,
    },
  },
};

// Legacy IDs remain resolvable for existing agreements and purchased-credit accounting.
// They are never returned as new purchase options.
const SHARED_FEATURES = {
  monthlyCredits: 0,
  uploads: 20,
  platformLimit: 6,
  monthlyPromotions: 30,
  support: "Email support",
  multicam: true,
  teamSeats: 1,
};
const SUBSCRIPTION_PLANS = {
  free: {
    id: "free",
    name: "AutoPromote Free",
    price: 0,
    currency: "USD",
    provisional: true,
    features: { ...SHARED_FEATURES },
    processing: { tokens: 100, resetHours: 144, rolling30DayTokens: 500, storageBytes: 1073741824 },
  },
  plus: {
    id: "plus",
    name: "AutoPromote Plus",
    price: 4.99,
    currency: "USD",
    provisional: true,
    paypalPlanIdEnv: "PAYPAL_PLUS_PLAN_ID",
    features: { ...SHARED_FEATURES, uploads: 80, monthlyPromotions: 150 },
    processing: { tokens: 500, resetHours: 24, rolling30DayTokens: 2000, storageBytes: 5368709120 },
  },
};
const ALL_SUBSCRIPTION_PLANS = { ...LEGACY_SUBSCRIPTION_PLANS, ...SUBSCRIPTION_PLANS };

/**
 * Credit costs per media operation.
 * These are deducted from the user's monthly credit allocation (or purchased top-ups).
 */
const CREDIT_COSTS = {
  process: 10, // Smart Crop + Silence Removal + full pipeline
  "render-multicam": 150,
  "clean-audio-sync": 18,
  analyze: 8,
  "render-clip": 5,
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
    limitModel: "server_resource_allowance",
  },
  audioExtract: {
    label: "Audio Extraction",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "transcribe",
    limitModel: "server_resource_allowance",
  },
  multicam: {
    label: "Cam Combiner",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "shared_tools",
  },
  autoDirector: {
    label: "Auto Director",
    clientSide: true,
    backendProcessing: true,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "shared_tools",
  },
  flowEdit: {
    label: "Flow Edit / Sync to Sound",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "shared_tools",
  },
  thumbnailLab: {
    label: "Thumbnail Lab",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "shared_tools",
  },
  findViralClips: {
    label: "Find Viral Clips",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: false,
    usesStorage: true,
    creditOperation: "analyze",
    limitModel: "server_resource_allowance",
  },
  viralClipStudio: {
    label: "Viral Clip Studio",
    clientSide: true,
    backendProcessing: false,
    pythonWorker: false,
    usesStorage: false,
    creditOperation: null,
    limitModel: "shared_tools",
  },
  clipRender: {
    label: "Render Final Clip",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "render-clip",
    limitModel: "server_resource_allowance",
  },
  videoProcessing: {
    label: "AI Video Processing",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "process",
    limitModel: "server_resource_allowance",
  },
  multicamRender: {
    label: "Server Multicam Render",
    clientSide: false,
    backendProcessing: true,
    pythonWorker: true,
    usesStorage: true,
    creditOperation: "render-multicam",
    limitModel: "server_resource_allowance",
  },
};

const PLAN_CAPABILITIES = {
  free: {
    recoveryLab: false,
    support: {
      ticketAccess: false,
      allowedPriorities: ["low"],
      responseTarget: "Self-serve resources and billing page guidance",
      channel: "Self-serve",
    },
  },
  premium: {
    recoveryLab: false,
    support: {
      ticketAccess: true,
      allowedPriorities: ["low", "medium"],
      responseTarget: "Email support lane, target reply within 2 business days",
      channel: "Email support",
    },
  },
  pro: {
    recoveryLab: true,
    support: {
      ticketAccess: true,
      allowedPriorities: ["low", "medium", "high"],
      responseTarget: "Priority queue, target reply within 1 business day",
      channel: "Priority support",
    },
  },
  enterprise: {
    recoveryLab: true,
    support: {
      ticketAccess: true,
      allowedPriorities: ["low", "medium", "high"],
      responseTarget: "Priority queue, target reply within 1 business day",
      channel: "Priority support",
    },
  },
};

function normalizePlanId(value) {
  const raw = (value || "free").toString().trim().toLowerCase();
  if (raw === "basic") return "premium";
  return ALL_SUBSCRIPTION_PLANS[raw] ? raw : "free";
}

function resolvePlan(planId) {
  return ALL_SUBSCRIPTION_PLANS[normalizePlanId(planId)] || SUBSCRIPTION_PLANS.free;
}

function getUploadLimitForPlan(planId) {
  const uploads = resolvePlan(planId).features.uploads;
  return uploads === "Unlimited" || uploads === "unlimited" ? Infinity : Number(uploads) || 0;
}

function getPlatformLimitForPlan(planId) {
  return 6;
}

function getPlanCapabilities(planId) {
  const normalizedPlanId = normalizePlanId(planId);
  const plan = resolvePlan(normalizedPlanId);
  const base = PLAN_CAPABILITIES[normalizedPlanId] || PLAN_CAPABILITIES.free;

  const editing = Object.fromEntries(
    Object.entries(EDITING_FEATURE_CATALOG).map(([featureId, feature]) => {
      const enabled = true;
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
    recoveryLab: true,
    processing: plan.processing || SUBSCRIPTION_PLANS.plus.processing,
    support: {
      ...base.support,
      ticketAccess: true,
      label: plan.features.support,
    },
    credits: {
      monthlyAllocation: plan.features.monthlyCredits || 0,
      label: `${plan.features.monthlyCredits || 0} editing credits per month`,
    },
    multicam: true,
    teamSeats: plan.features.teamSeats || 1,
    editing: {
      allPaidFeaturesUnlocked: true, // Compatibility field: tools are shared by every plan.
      topUpsEnabled: true,
      monthlyCreditsIncluded: plan.features.monthlyCredits || 0,
      policy:
        "Same creativity. Same tools. More usage when you upgrade. Local editing uses no cloud processing tokens.",
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
  LEGACY_SUBSCRIPTION_PLANS,
  ALL_SUBSCRIPTION_PLANS,
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
