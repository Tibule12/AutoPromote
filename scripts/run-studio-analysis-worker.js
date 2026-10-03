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
      const requested = Number(process.env.STUDIO_ANALYSIS_WORKER_MAX_PASSES || 4);
      const maxPasses =
        Number.isInteger(requested) && requested >= 1 && requested <= 20 ? requested : 4;
      const startDeadline = Date.now() + 2 * 60 * 1000;
      let processed = 0;
      while (
        processed < maxPasses &&
        Date.now() < startDeadline &&
        (await processNextStudioAnalysisJob({ workerId }))
      ) {
        processed += 1;
      }
      console.log(`[StudioAnalysisWorker] Bounded batch processed ${processed} due items`);
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
