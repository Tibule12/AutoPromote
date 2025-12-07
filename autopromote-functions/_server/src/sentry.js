// Sentry helper for functions server
let Sentry;
function init() {
  const dsn = process.env.SENTRY_DSN || process.env.SENTRY_DSN_URL;
  if (!dsn) return null;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn, environment: process.env.NODE_ENV || 'development', tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05') });
    return Sentry;
  } catch (e) {
    console.warn('[Sentry] (functions) failed to initialize', e.message || e);
    return null;
  }
}
module.exports = { init, getSentry: () => Sentry };

