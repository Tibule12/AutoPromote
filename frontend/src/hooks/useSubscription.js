export const useSubscription = () => {
  const planId = "free";
  const credits = {
    monthlyRemaining: 15,
    remaining: 15,
  };

  const featureMatrix = {
    free: {
      watermarkRemoval: false,
      audioExtract: false,
      multicam: false,
    },
    premium: {
      watermarkRemoval: true,
      audioExtract: true,
      multicam: false,
    },
    pro: {
      watermarkRemoval: true,
      audioExtract: true,
      multicam: true,
    },
    enterprise: {
      watermarkRemoval: true,
      audioExtract: true,
      multicam: true,
    },
  };

  const current = featureMatrix[planId] || featureMatrix.free;

  const canUseFeature = feature => Boolean(current[feature]);
  const requiresUpgrade = feature => !canUseFeature(feature);

  return {
    planId,
    capabilities: current,
    credits,
    canUseFeature,
    requiresUpgrade,
  };
};
