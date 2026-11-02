import { useContext, useMemo } from "react";
import AuthContext from "../contexts/AuthContext";
import { isRuntimeE2EEnabled } from "../utils/mediaAuth";
import { creditPilotEnabled } from "../utils/creditPilot";

const FREE_FALLBACK = {
  planId: "free",
  credits: {
    monthlyAllocation: 15,
    monthlyRemaining: 15,
    topUpBalance: 0,
    remaining: 15,
  },
  editing: {
    allPaidFeaturesUnlocked: false,
    topUpsEnabled: false,
    features: {
      watermarkRemoval: { enabled: false },
      audioExtract: { enabled: false },
      multicam: { enabled: false },
      autoDirector: { enabled: false },
      flowEdit: { enabled: false },
      thumbnailLab: { enabled: false },
      findViralClips: { enabled: false },
      viralClipStudio: { enabled: false },
    },
  },
};

export const useSubscription = () => {
  const authContext = useContext(AuthContext);
  const profile = authContext?.profile || null;

  const normalized = useMemo(() => {
    const planId = profile?.planId || profile?.tier || FREE_FALLBACK.planId;
    const credits = {
      monthlyAllocation:
        profile?.monthlyCredits?.allocation ?? FREE_FALLBACK.credits.monthlyAllocation,
      monthlyRemaining:
        profile?.monthlyCredits?.remaining ?? FREE_FALLBACK.credits.monthlyRemaining,
      topUpBalance: profile?.topUpBalance ?? FREE_FALLBACK.credits.topUpBalance,
      remaining: profile?.totalCredits ?? FREE_FALLBACK.credits.remaining,
    };
    const rawEditing = profile?.editing || FREE_FALLBACK.editing;
    const editing = { ...rawEditing, features: Object.fromEntries(
      Object.entries(rawEditing.features || {}).filter(([key]) => !["smartPromoSummary", "ideaVideoPreview", "ideaVideoRender", "analytics"].includes(key))
    ) };
    const capabilityFeatures = Object.fromEntries(
      Object.entries(editing.features || {}).map(([featureId, config]) => [
        featureId,
        Boolean(config?.enabled),
      ])
    );

    return {
      planId,
      credits,
      editing,
      capabilities: capabilityFeatures,
    };
  }, [profile]);

  const canUseFeature = feature =>
    !["smartPromoSummary", "ideaVideoPreview", "ideaVideoRender", "analytics"].includes(feature) && Boolean(
      (creditPilotEnabled() && ["findViralClips", "viralClipStudio"].includes(feature)) ||
      isRuntimeE2EEnabled() ||
      normalized.editing?.features?.[feature]?.enabled ||
      normalized.capabilities?.[feature]
    );
  const requiresUpgrade = feature => !canUseFeature(feature);

  return {
    loading: authContext?.loading === true,
    planId: normalized.planId,
    capabilities: normalized.capabilities,
    editing: normalized.editing,
    credits: normalized.credits,
    canUseFeature,
    requiresUpgrade,
  };
};
