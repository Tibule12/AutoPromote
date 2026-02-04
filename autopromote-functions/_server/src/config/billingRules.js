// billingRules.js - Central configuration for billing based on Content Intent
// See: AUTO_PROMOTE_BILLING_GUIDELINES.md

module.exports = {
  organic: {
    intent: "organic",
    billing_trigger: "tier_upgrade",
    features_billed: ["upload_quota", "analytics", "priority_scheduling"],
    per_engagement_fee: 0,
    allowed_features: ["basic_analytics", "standard_scheduling"],
    description: "Creators pay only for subscription/tier, no per-engagement billing.",
  },
  commercial: {
    intent: "commercial",
    billing_trigger: "usage_metered",
    features_billed: [
      "brand_safety_checks",
      "competitor_analysis",
      "commercial_audience_targeting",
    ],
    per_engagement_fee: 0.05, // Example
    allowed_features: ["brand_safety", "commercial_targeting", "all_organic"],
    description: "Business use for self-promotion. Metered usage.",
  },
  sponsored: {
    intent: "sponsored",
    billing_trigger: "revenue_share",
    features_billed: ["partner_verification", "roi_tracking", "compliance_audit"],
    revenue_share_percent: 0.15, // 15% platform take on bounty/deal
    allowed_features: ["partner_portal", "compliance_tools", "all_commercial"],
    description: "Paid partnerships. Platform takes a cut of the transaction/bounty.",
  },
};
