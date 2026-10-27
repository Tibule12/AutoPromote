// Operator report only. These flags do not enable any production entry point.
const fs = require("fs");
const path = require("path");
const { analyseCostEvidence } = require("../src/services/unifiedCredits/costEvidence");
const config = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../config/unified-credits.rollout.pending.json"), "utf8")
);
const costs = JSON.parse(
  fs.readFileSync(
    process.argv[2] || path.resolve(__dirname, "../config/unified-credits.costs.pending.json"),
    "utf8"
  )
);
const costReview = analyseCostEvidence(costs);
const pilot = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../config/unified-credits.pilot.draft.json"), "utf8")
);
const blockers = Object.entries(config.requirements)
  .filter(([, value]) => value !== true)
  .map(([name]) => name);
console.log(
  JSON.stringify(
    {
      status: blockers.length ? "NOT_READY_FOR_PRODUCTION" : "REQUIRES_SEPARATE_RUNTIME_REVIEW",
      liveAdvertisingEnabled: false,
      runtime: "local-emulator-only",
      pilot: {
        status: pilot.status,
        totalProposedBudgetMicros: pilot.lifetimeSpendMicros,
        fundingApproved: pilot.fundingApproved,
        liveAdsRequired: false,
        cloudInvoiceCapVerified: false,
        canonicalTransportQualification: "local-boundary-fixtures",
      },
      blockers,
      costReview,
      productionRewardRecommendation:
        "No live credit offer until verification, funding and approval; this is not a final commercial reward rate.",
    },
    null,
    2
  )
);
