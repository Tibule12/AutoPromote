// Lightweight Sentry initialization helper for server-side
// Initialize Sentry only when SENTRY_DSN is present to avoid breaking local dev/test.
let Sentry;
function init() {
  const dsn = process.env.SENTRY_DSN || process.env.SENTRY_DSN_URL;
  if (!dsn) return null;
  try {
    Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      release: process.env.COMMIT_HASH || process.env.GIT_COMMIT || null,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    });
    return Sentry;
  } catch (e) {
    // If @sentry/node is not installed, just no-op
    console.warn("[Sentry] Skipping initialization: @sentry/node not installed or failed to init");
    return null;
  }
}
// Expose a safe capture function to be used by other modules
function captureException(err) {
  try {
    if (Sentry && typeof Sentry.captureException === "function") Sentry.captureException(err);
  } catch (e) {
    /* ignore */
  }
}
module.exports = { init, getSentry: () => Sentry, captureException };
module.exports = { init, getSentry: () => Sentry };
