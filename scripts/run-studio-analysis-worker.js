#!/usr/bin/env node
const crypto = require("crypto");

if (process.env.ENABLE_STUDIO_ANALYSIS_WORKER !== "true") {
  console.error("Set ENABLE_STUDIO_ANALYSIS_WORKER=true to start the Studio analysis worker");
  process.exitCode = 1;
} else {
  const { processNextStudioAnalysisJob } = require("../src/services/studioAnalysisJobService");
  const workerId = `studio-${crypto.randomBytes(8).toString("hex")}`;
  let stopping = false;
  process.once("SIGTERM", () => {
    stopping = true;
  });
  process.once("SIGINT", () => {
    stopping = true;
  });
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  (async () => {
    if (process.env.STUDIO_ANALYSIS_WORKER_ONCE === "true") {
      const worked = await processNextStudioAnalysisJob({ workerId });
      console.log(`[StudioAnalysisWorker] One pass ${worked ? "processed" : "found no due job"}`);
      return;
    }
    while (!stopping) {
      try {
        const worked = await processNextStudioAnalysisJob({ workerId });
        if (!worked) await pause(5000);
      } catch (error) {
        console.error("[StudioAnalysisWorker] Poll failed:", error?.code || error?.message);
        await pause(15000);
      }
    }
  })().catch(error => {
    console.error("[StudioAnalysisWorker] Stopped:", error);
    process.exitCode = 1;
  });
}
