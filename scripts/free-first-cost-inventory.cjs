const fs = require("node:fs");
const { OPERATIONS } = require("../src/services/processingTokens/policy");
const observation = JSON.parse(
  fs.readFileSync("reports/free-first-20261126/infrastructure-observations.json")
);
const rows = [
  [
    "Find Viral Clips",
    "src/services/videoEditingService.js",
    "GPU-primary media router; legacy videoClippingService has a direct CPU route; local full-quality analysis measured separately",
    "clips.analyze",
  ],
  [
    "Cam Combiner",
    "src/services/cloudRunJobService.js",
    "GPU primary; CPU Cloud Run jobs fallback",
    "multicam.render",
  ],
  [
    "Viral Clip Studio",
    "frontend/src/components/ViralClipStudio.js",
    "Browser authoring; CPU/GPU worker on export",
    "studio.render",
  ],
  [
    "Background removal and replacement",
    "src/services/studioSubjectVfxService.js",
    "CPU/GPU segmentation worker; browser compositing",
    "background.remove",
  ],
  [
    "AI captions and transcription",
    "python_media_worker/caption_transcription.py",
    "Worker CPU and/or external transcription API",
    "captions.generate",
  ],
  [
    "Auto Director",
    "src/services/studioDirectorProvider.js",
    "Browser plans and apply; configured OpenAI or local planner",
    "captions.generate",
  ],
  [
    "Motion & Flow",
    "frontend/src/components/MultiCamCombiner.js",
    "Browser authoring/preview; canonical worker for final export",
    "studio.render",
  ],
  [
    "Visual effects",
    "python_media_worker/studio_composition.py",
    "Browser supported effects; CPU/GPU export",
    "studio.render",
  ],
  [
    "Blender / 3D",
    "src/services/studio3DService.js",
    "Retained local CPU/NVIDIA or explicitly configured Cloud Run job",
    "blender.render",
  ],
  [
    "Audio extraction and synchronization",
    "src/services/videoEditingService.js",
    "CPU media worker; browser playback",
    "audio.sync",
  ],
  [
    "Video previews and exports",
    "src/mediaRoutes.js",
    "Browser preview; CPU/GPU native exports; some server source-frame previews",
    "studio.render",
  ],
  [
    "Publisher",
    "src/services/platformPoster.js",
    "Node API plus destination uploads and optional media transform",
    "publisher.publish",
  ],
  [
    "Scheduler",
    "src/services/promotionTaskQueue.js",
    "Node queue / Firestore / Cloud Tasks / worker dispatch",
    "scheduler.dispatch",
  ],
  [
    "Media storage and downloads",
    "src/utils/mediaStreams.js",
    "Private Cloud Storage plus API or signed network downloads",
    null,
  ],
  [
    "External AI APIs",
    "src/services/openaiClient.js",
    "Configured external API provider",
    "captions.generate",
  ],
];
const inventory = rows.map(([operation, source, location, policy]) => ({
  operation,
  source,
  actualProcessingLocationFromCode: location,
  deploymentShapeEvidence: "reports/free-first-20261126/infrastructure-observations.json",
  cpu: policy === "multicam.render" || policy === "background.remove" ? 20 : null,
  gpu:
    policy === "multicam.render" || policy === "background.remove"
      ? "configured RTX PRO 6000; runtime usage unmeasured for this operation"
      : null,
  memoryGiB: policy === "multicam.render" || policy === "background.remove" ? 80 : null,
  measuredBillableSeconds: null,
  measuredStartupSeconds: null,
  measuredInvoiceUsd: null,
  measuredStorageBytesPerOperation: null,
  measuredNetworkBytesPerOperation: null,
  measuredDatabaseReads: null,
  measuredDatabaseWrites: null,
  measuredExternalApiUsd: null,
  measuredRetryFailureUsd: null,
  conservativeMaximumAllInUsd: null,
  billingMinimum:
    "Cloud Run jobs: 60 seconds including startup; services depend on configured billing mode; provider APIs have separate minimums",
  startupOverhead: "Not attributed; startup CPU boost is enabled on media service",
  storageConsumption:
    "Input/output/intermediates and retention must be measured; no assumption of zero",
  networkTransfer: "Upload/download, worker transfers and repeat downloads must be measured",
  databaseOperations:
    "Reserve/start/settle events and transaction retries plus native workflow reads/writes; unmeasured",
  externalApiCharges:
    "Provider/model/token/audio duration unknown; do not infer zero from a cloud free tier",
  retryFailureCosts:
    "No automatic retry in renewable adapter; failed processing still consumes platform budget",
  proposedBoundedAdmission: policy
    ? {
        ...OPERATIONS[policy],
        tokens: Math.ceil(OPERATIONS[policy].maxMicros / 1000),
        readiness:
          OPERATIONS[policy].calibrated === false
            ? "not admitted; exceeds proposed meaningful-workflow envelope"
            : "local bounded adapter only; financial estimate pending cloud validation",
      }
    : null,
  recommendedProductionTokenDeduction: null,
}));
const report = {
  generatedAt: "2026-11-26",
  accountingUnit:
    "1 internal token = USD 0.001 budgeted infrastructure; no purchased-credit conversion",
  measuredAggregate: observation.metrics,
  measuredAggregateIsPerOperation: false,
  referenceSources: [
    "https://cloud.google.com/run/pricing",
    "https://developer.paypal.com/api/rest/webhooks/rest/",
    "https://www.paypal.com/za/business/paypal-business-fees",
  ],
  referenceRateMicros: {
    requestVcpuSecond: 24,
    requestGiBSecond: 2.5,
    jobVcpuSecond: 18,
    jobGiBSecond: 2,
    rtxPro6000Second: 365.22,
  },
  estimates: {
    currentMediaCpuPerSecondMicros: 4 * 24 + 8 * 2.5,
    full3600SecondMediaTimeoutComputeMicros: 3600 * (4 * 24 + 8 * 2.5),
    gpu20Cpu80GiBPerSecondMicros: 20 * 18 + 80 * 2 + 365.22,
    gpu14400SecondCamTimeoutComputeMicros: 14400 * (20 * 18 + 80 * 2 + 365.22),
    cpu8Cpu12GiB14400SecondCamTimeoutComputeMicros: 14400 * (8 * 18 + 12 * 2),
  },
  limits: [
    "Rates are reference prices, not invoice or per-operation measurements.",
    "No accessible billing attribution: billingInfo denied; datasets empty.",
    "Current Cloud Run media service is 4 CPU / 8 GiB, changed from the October 4 GiB observation.",
    "Retained local render telemetry is separately recorded in native-render-evidence.json; it does not measure cloud startup, GPU or API costs.",
  ],
  inventory,
  continuationEvidence: {
    processing: "reports/free-first-optimization-20261126/README.md",
    operatingEnvironment: "reports/free-first-optimization-20261126/OPERATING-ENVIRONMENT.md",
    completedWorkflowModels: "reports/free-first-optimization-20261126/workflow-economics.json",
    operatingModel: "reports/free-first-optimization-20261126/operating-economics.json",
    historicalReceipts: "reports/free-first-optimization-20261126/operating-billing-evidence.json",
    limitsFinal: false,
  },
};
fs.writeFileSync(
  "reports/free-first-20261126/operation-cost-inventory.json",
  JSON.stringify(report, null, 2) + "\n"
);
console.log(`Wrote ${inventory.length} operation families; unmeasured values remain null.`);
