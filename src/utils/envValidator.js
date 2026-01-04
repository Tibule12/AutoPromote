// envValidator.js - central environment validation & security posture warnings
// Call early at startup to fail fast on critical misconfiguration.

const REQUIRED_GROUPS = [
  { env: "FIREBASE_PROJECT_ID", optional: true }, // Firebase Admin may derive from service account instead
];

const CONDITIONALS = [
  {
    condition: () => process.env.PAYMENTS_ENABLED === "true",
    // Stripe integration removed
  },
  {
    condition: () => process.env.PAYPAL_ENABLED === "true",
    vars: ["PAYPAL_WEBHOOK_ID"],
    label: "PayPal",
  },
];

function validateEnv({ strict = false } = {}) {
  const errors = [];
  const warnings = [];

  REQUIRED_GROUPS.forEach(item => {
    if (!process.env[item.env] && !item.optional) errors.push(`Missing required env: ${item.env}`);
  });
  CONDITIONALS.forEach(group => {
    if (group.condition()) {
      group.vars.forEach(v => {
        if (!process.env[v]) errors.push(`[${group.label}] missing ${v}`);
      });
    }
  });

  // Security recommendations
  if (process.env.NODE_ENV === "production") {
    if (process.env.CORS_ALLOW_ALL === "true") warnings.push("CORS_ALLOW_ALL=true in production");
    if (!process.env.JWT_AUDIENCE) warnings.push("JWT_AUDIENCE not set");
    if (!process.env.JWT_ISSUER) warnings.push("JWT_ISSUER not set");
  }
  if (!process.env.SESSION_SECRET)
    warnings.push("SESSION_SECRET not set (recommended for future session-based flows)");
  if (!process.env.RATE_LIMIT_GLOBAL_MAX)
    warnings.push("RATE_LIMIT_GLOBAL_MAX not set (global limiter capacity)");
  if (
    process.env.ENABLE_DISTRIBUTED_LIMITER === "true" &&
    !process.env.REDIS_URL &&
    !process.env.REDIS_HOST
  ) {
    warnings.push("Distributed limiter enabled but no REDIS_URL or REDIS_HOST set");
  }
  if (
    process.env.DOC_SIGNING_SECRET &&
    process.env.DOC_SIGNING_SECRET.includes("dev-doc-signing-secret")
  ) {
    warnings.push("DOC_SIGNING_SECRET appears to be default; replace in production");
  }

  if (errors.length) {
    const msg = `Environment validation failed (errors=${errors.length})`;
    if (strict) {
      console.error(msg);
      errors.forEach(e => console.error(" -", e));
      process.exit(1);
    } else {
      console.warn(msg);
      errors.forEach(e => console.warn(" -", e));
    }
  }
  if (warnings.length) {
    console.warn("[envValidator] Warnings:");
    warnings.forEach(w => console.warn(" -", w));
  }
  return { errors, warnings };
}

module.exports = { validateEnv };
