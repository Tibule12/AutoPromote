const TESTER_PROGRAM = Object.freeze({
  id: "founding_testers_2026",
  name: "Founding Tester",
  maxSeats: 10,
  durationDays: 30,
  planId: "pro",
  bonusCredits: 1000,
  totalCreditAllowance: 1500,
  recommendedMaxRecordingMinutes: 60,
  usageLimits: Object.freeze({
    uploads: 10,
    queuedPlatformPosts: 30,
    connectedPlatforms: 3,
  }),
  allowedWorkflows: Object.freeze([
    "camCombiner",
    "publishing",
    "queue",
    "findViralClips",
    "clipRender",
    "smartPromoSummary",
  ]),
  allowedEditingFeatures: Object.freeze([
    "multicam",
    "autoDirector",
    "findViralClips",
    "clipRender",
    "smartPromoSummary",
  ]),
});

function getActiveTesterAccess(userData, nowMs = Date.now()) {
  const access = userData?.testerAccess;
  if (!access || access.programId !== TESTER_PROGRAM.id || access.status !== "active") {
    return null;
  }

  const expiresAtMs = Date.parse(access.expiresAt || "");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;

  return access;
}

function getTesterCreditState(testerAccess, basePlanCredits = 0) {
  if (!testerAccess) return null;
  const allowance = Math.max(
    0,
    Number(
      testerAccess.creditAllowance ||
        Number(basePlanCredits || 0) + Number(testerAccess.bonusCredits || 0)
    )
  );
  const used = Math.min(allowance, Math.max(0, Number(testerAccess.creditsUsed || 0)));
  return { allowance, used, remaining: Math.max(0, allowance - used) };
}

function applyTesterCapabilityAllowlist(capabilities, testerAccess) {
  if (!testerAccess) return capabilities;

  const allowed = new Set(TESTER_PROGRAM.allowedEditingFeatures);
  const editingFeatures = Object.fromEntries(
    Object.entries(capabilities?.editing?.features || {}).map(([featureId, feature]) => [
      featureId,
      {
        ...feature,
        enabled: Boolean(feature?.enabled && allowed.has(featureId)),
        topUpEligible: false,
      },
    ])
  );

  return {
    ...capabilities,
    teamSeats: 1,
    analytics: {
      ...(capabilities?.analytics || {}),
      allowedRanges: ["24h", "7d"],
      platformBreakdown: false,
      recoveryLab: false,
      canExport: false,
      topContentLimit: 10,
      summary: "Recent KPI snapshot for Founding Tester feedback.",
    },
    support: {
      ...(capabilities?.support || {}),
      ticketAccess: true,
      allowedPriorities: ["low", "medium"],
      responseTarget: "Founding Tester feedback lane",
      channel: "Email support",
    },
    missions: {
      label: "Growth missions are not included in this controlled test.",
      monthlyBoosts: 0,
    },
    editing: {
      ...(capabilities?.editing || {}),
      allPaidFeaturesUnlocked: false,
      topUpsEnabled: false,
      policy:
        "Founding Tester access is limited to the approved test workflows and its trial credit allowance.",
      features: editingFeatures,
    },
    testerProgram: {
      id: TESTER_PROGRAM.id,
      allowedWorkflows: [...TESTER_PROGRAM.allowedWorkflows],
      bonusCredits: TESTER_PROGRAM.bonusCredits,
      totalCreditAllowance: TESTER_PROGRAM.totalCreditAllowance,
      autoRenews: false,
    },
  };
}

module.exports = {
  TESTER_PROGRAM,
  getActiveTesterAccess,
  getTesterCreditState,
  applyTesterCapabilityAllowlist,
};
