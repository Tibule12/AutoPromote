#!/usr/bin/env node
// set-tiktok-alerting-defaults.js
// Apply recommended alerting thresholds and enable TikTok alert events in runtime config.

const { getConfig, updateConfig } = require("../src/services/configService");

async function main() {
  console.log("Applying TikTok alerting defaults...");
  const cfg = await getConfig(true).catch(e => {
    console.error("Failed to load config:", e && (e.message || e));
    process.exit(1);
  });

  const patch = {
    alerting: {
      // Ensure TikTok alert events are enabled
      enabledEvents: Array.from(new Set([...(cfg.alerting && cfg.alerting.enabledEvents) || [], "tiktok_publish_failure_rate_high", "tiktok_upload_fallback_high"])),
      // Publish failure alert: require at least 10 publishes and >15% failure rate by default
      tiktokPublishMinSamples: cfg.alerting && cfg.alerting.tiktokPublishMinSamples ? cfg.alerting.tiktokPublishMinSamples : 10,
      tiktokPublishFailureRateThreshold: cfg.alerting && cfg.alerting.tiktokPublishFailureRateThreshold ? cfg.alerting.tiktokPublishFailureRateThreshold : 0.15,
      // Fallback alert settings
      tiktokFallbackMinEnqueues: cfg.alerting && cfg.alerting.tiktokFallbackMinEnqueues ? cfg.alerting.tiktokFallbackMinEnqueues : 10,
      tiktokFallbackRatioThreshold: cfg.alerting && cfg.alerting.tiktokFallbackRatioThreshold ? cfg.alerting.tiktokFallbackRatioThreshold : 0.2,
      tiktokFallbackMinCount: cfg.alerting && cfg.alerting.tiktokFallbackMinCount ? cfg.alerting.tiktokFallbackMinCount : 5,
    },
  };

  console.log("Updating config with:", JSON.stringify(patch, null, 2));

  try {
    const res = await updateConfig(patch);
    console.log("Config updated successfully.");
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Failed to update config:", e && (e.message || e));
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e && (e.stack || e.message || e));
  process.exit(1);
});