const autopilotService = require("../src/services/autopilotService");
const { calculateConfidenceForVariants } = require("../src/utils/statistics");

async function run() {
  // Simulate a test document in memory (no Firestore required for the decision)
  const testData = {
    contentId: "test-content-1",
    variants: [
      { id: "variant-a", metrics: { views: 1200, conversions: 50, engagement: 200 } },
      { id: "variant-b", metrics: { views: 300, conversions: 5, engagement: 100 } },
    ],
    autopilot: { enabled: true, confidenceThreshold: 80, minSample: 100 },
  };
  console.log("Calculated confidence:", calculateConfidenceForVariants(testData.variants));
  const decision = autopilotService.decideAutoApply(testData);
  console.log("Decision:", decision);
  // NOTE: applyAuto will try to read Firestore and perform writes; skip it here when not connected
}

run().catch(console.error);
