// userSegmentation.js
// AutoPromote User Segmentation Logic
// Dynamically tailors flows for Beginners, Influencers, and Brands

const SEGMENTS = {
  BEGINNER: 'beginner',
  INFLUENCER: 'influencer',
  BRAND: 'brand'
};

function segmentUser(user) {
  // Example segmentation logic
  if (user.role === 'brand' || user.isBrand) return SEGMENTS.BRAND;
  if (user.followers && user.followers > 10000) return SEGMENTS.INFLUENCER;
  return SEGMENTS.BEGINNER;
}

function getSegmentFeatures(segment) {
  switch (segment) {
    case SEGMENTS.BEGINNER:
      return {
        onboarding: true,
        growthGuarantee: true,
        milestoneCelebration: true,
        handHolding: true,
        analytics: false,
        campaignTools: false
      };
    case SEGMENTS.INFLUENCER:
      return {
        onboarding: false,
        growthGuarantee: true,
        milestoneCelebration: true,
        handHolding: false,
        analytics: true,
        repostTools: true,
        campaignTools: false
      };
    case SEGMENTS.BRAND:
      return {
        onboarding: false,
        growthGuarantee: true,
        milestoneCelebration: true,
        handHolding: false,
        analytics: true,
        repostTools: true,
        campaignTools: true,
        roiTracking: true
      };
    default:
      return {};
  }
}

module.exports = {
  segmentUser,
  getSegmentFeatures,
  SEGMENTS
};
