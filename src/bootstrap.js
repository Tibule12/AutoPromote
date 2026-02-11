// src/bootstrap.js
// Handles critical environment setup before any libraries load

// 1. Disable Google Cloud Observability to prevent Render/gRPC recursion stack overflow
process.env.GOOGLE_CLOUD_DISABLE_GRPC_GCP_OBSERVABILITY = "true";
process.env.OTEL_SDK_DISABLED = "true";
process.env.OTEL_TRACES_EXPORTER = "none";

// 2. Materialize Firebase credentials from Env Var to File (for Google SDKs that need GOOGLE_APPLICATION_CREDENTIALS)
try {
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const svcRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
      : null);

  if (svcRaw && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const parsed = JSON.parse(svcRaw);
      if (parsed && parsed.private_key && typeof parsed.private_key === "string")
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");

      const tmpPath = path.join(os.tmpdir(), `autopromote-service-account-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), { mode: 0o600 });

      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;

      if (!process.env.FIREBASE_PROJECT_ID && parsed && parsed.project_id) {
        process.env.FIREBASE_PROJECT_ID = parsed.project_id;
      }
      console.log("[bootstrap] Wrote service account to", tmpPath);
    } catch (e) {
      console.warn("[bootstrap] Failed to parse credentials:", e.message);
    }
  }
} catch (e) {
  // Ignore bootstrap failures
}

module.exports = true;
