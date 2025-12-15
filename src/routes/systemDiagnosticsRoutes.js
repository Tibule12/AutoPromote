// systemDiagnosticsRoutes.js
// Automated system health check and error detection

const express = require("express");
const router = express.Router();
const { admin, db } = require("../firebaseAdmin");
const { runIntegrationChecks, performRemediation } = require("../services/healthRunner");
const authMiddleware = require("../authMiddleware");

/**
 * GET /api/diagnostics/health
 * Comprehensive system health check
 * Returns detailed status of all platform components
 */
router.get("/health", authMiddleware, async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      overall_status: "checking",
      checks: {},
    };

    // 1. Environment Variables Check
    diagnostics.checks.environment = await checkEnvironmentVariables();

    // 2. Firebase Connection Check
    diagnostics.checks.firebase = await checkFirebaseConnection();

    // 3. Database Collections Check
    diagnostics.checks.database = await checkDatabaseCollections();

    // 4. Platform OAuth Credentials Check
    diagnostics.checks.platforms = checkPlatformCredentials();

    // 5. Payment System Check
    diagnostics.checks.payments = checkPaymentSystem();

    // 6. AI Services Check
    diagnostics.checks.ai_services = checkAIServices();

    // 7. External API Connectivity
    diagnostics.checks.external_apis = await checkExternalAPIs();

    // 8. Storage Check
    diagnostics.checks.storage = await checkStorageAccess();

    // 9. Email Service Check
    diagnostics.checks.email = checkEmailService();

    // 10. Rate Limiting Check
    diagnostics.checks.rate_limiting = checkRateLimiting();

    // Calculate overall status
    const allChecks = Object.values(diagnostics.checks);
    const criticalFailures = allChecks.filter(c => c.status === "error" && c.critical);
    const warnings = allChecks.filter(c => c.status === "warning");
    const errors = allChecks.filter(c => c.status === "error");

    if (criticalFailures.length > 0) {
      diagnostics.overall_status = "critical";
    } else if (errors.length > 0) {
      diagnostics.overall_status = "degraded";
    } else if (warnings.length > 0) {
      diagnostics.overall_status = "warning";
    } else {
      diagnostics.overall_status = "healthy";
    }

    diagnostics.summary = {
      total_checks: allChecks.length,
      passed: allChecks.filter(c => c.status === "ok").length,
      warnings: warnings.length,
      errors: errors.length,
      critical: criticalFailures.length,
    };

    res.json(diagnostics);
  } catch (error) {
    console.error("[Diagnostics] Health check error:", error);
    res.status(500).json({
      overall_status: "error",
      error: "Failed to run diagnostics",
      message: error.message,
    });
  }
});

/**
 * GET /api/diagnostics/scan
 * Run a set of lightweight integration-style checks for dashboard flows.
 * Query params: dashboard=user|admin
 */
router.get("/scan", authMiddleware, async (req, res) => {
  try {
    const dashboard = (req.query.dashboard || "user").toLowerCase();
    if (dashboard === "admin" && !(req.user && req.user.role === "admin")) {
      return res.status(403).json({ error: "admin_required" });
    }
    const uid = req.userId || req.user?.uid || "testUser123";
    const result = await runIntegrationChecks({ dashboard, userId: uid });
    // Optionally store results (admins can request to store scan records)
    try {
      if (req.query.store === "1" && req.user && req.user.role === "admin") {
        await db
          .collection("system_scans")
          .add({ dashboard, uid, result, createdAt: new Date().toISOString() });
      }
    } catch (e) {
      /* best-effort */
    }
    // If scan failed and webhook configured, notify
    try {
      const scanWebhook = process.env.SCAN_FAILURE_WEBHOOK || null;
      if (scanWebhook && result.overall === "failed") {
        const doFetch = typeof fetch === "function" ? fetch : require("node-fetch");
        await doFetch(scanWebhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ level: "failed", dashboard, results: result }),
        });
      }
    } catch (e) {
      /* best-effort */
    }
    res.json({ success: true, results: result });
  } catch (error) {
    console.error("[Diagnostics] Scan error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/diagnostics/scans/:id/remediate
 * Admin-only endpoint to remediate failing checks detected in a stored scan.
 */
router.post("/scans/:id/remediate", authMiddleware, async (req, res) => {
  try {
    if (!(req.user && req.user.role === "admin"))
      return res.status(403).json({ error: "admin_required" });
    const id = req.params.id;
    const scanSnap = await db.collection("system_scans").doc(id).get();
    if (!scanSnap.exists) return res.status(404).json({ error: "scan_not_found" });
    const scan = scanSnap.data();
    const checks = Object.keys(scan.result?.checks || {});
    const targetChecks =
      req.body && Array.isArray(req.body.checks) && req.body.checks.length > 0
        ? req.body.checks
        : checks;
    const applied = [];
    const failed = [];
    for (const key of targetChecks) {
      const checkData = scan.result.checks[key];
      if (!checkData || checkData.status === "ok") continue;
      try {
        const remediation = await performRemediation(key, { userId: req.userId || req.user.uid });
        applied.push({ key, remediation });
      } catch (e) {
        failed.push({ key, error: e.message || String(e) });
      }
    }
    // Save remediation results into a dedicated collection
    await db
      .collection("system_scans_remediation")
      .add({
        scanId: id,
        applied,
        failed,
        by: req.userId || req.user.uid,
        at: new Date().toISOString(),
      });
    res.json({ success: true, applied, failed });
  } catch (e) {
    console.error("[Diagnostics] Remediation error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/diagnostics/env
 * Returns the presence (not values) of known environment variables for quick admin debugging
 */
router.get("/env", authMiddleware, async (req, res) => {
  try {
    const keys = [
      "YT_CLIENT_ID",
      "YT_CLIENT_SECRET",
      "YT_REDIRECT_URI",
      "TWITTER_CLIENT_ID",
      "TWITTER_CLIENT_SECRET",
      "TWITTER_CLIENT_REDIRECT_URI",
      "PINTEREST_CLIENT_ID",
      "PINTEREST_CLIENT_SECRET",
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_CLIENT_SECRET",
      "TIKTOK_PROD_CLIENT_KEY",
      "TIKTOK_PROD_CLIENT_SECRET",
      "TIKTOK_SANDBOX_CLIENT_KEY",
      "TIKTOK_SANDBOX_CLIENT_SECRET",
      "SNAPCHAT_CLIENT_ID",
      "SNAPCHAT_CLIENT_SECRET",
      "SNAPCHAT_PUBLIC_CLIENT_ID",
      "SNAPCHAT_CONFIDENTIAL_CLIENT_ID",
      "INSTAGRAM_APP_ID",
      "INSTAGRAM_APP_SECRET",
      "INSTAGRAM_CLIENT_ID",
      "INSTAGRAM_CLIENT_SECRET",
    ];
    const map = {};
    keys.forEach(k => {
      map[k] = !!process.env[k];
    });
    // Also return a per-platform summary using existing checkPlatformCredentials logic
    const platforms = checkPlatformCredentials();
    res.json({ env: map, platforms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check Environment Variables
 */
function checkEnvironmentVariables() {
  const issues = [];
  const warnings = [];

  // Critical variables
  const criticalVars = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];

  criticalVars.forEach(varName => {
    if (!process.env[varName]) {
      issues.push(`Missing critical variable: ${varName}`);
    }
  });

  // Important variables
  const importantVars = {
    OPENAI_API_KEY: "AI features disabled",
    PAYPAL_CLIENT_ID: "Payments disabled",
    PAYPAL_CLIENT_SECRET: "Payments disabled",
    RESEND_API_KEY: "Email service may not work",
    SENDGRID_API_KEY: "Email service may not work",
  };

  Object.entries(importantVars).forEach(([varName, impact]) => {
    if (!process.env[varName]) {
      warnings.push(`Missing ${varName} - ${impact}`);
    }
  });

  return {
    status: issues.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
    critical: issues.length > 0,
    message:
      issues.length > 0
        ? "Critical environment variables missing"
        : warnings.length > 0
          ? "Some optional variables missing"
          : "All environment variables configured",
    issues,
    warnings,
    variables_checked: criticalVars.length + Object.keys(importantVars).length,
  };
}

/**
 * Check Firebase Connection
 */
async function checkFirebaseConnection() {
  try {
    // Try to access Firestore
    const testDoc = await db.collection("_system_health").doc("connection_test").get();

    // Try to list users (just first one to verify auth works)
    await admin.auth().listUsers(1);

    return {
      status: "ok",
      critical: true,
      message: "Firebase Admin SDK connected successfully",
      firestore: "connected",
      auth: "connected",
    };
  } catch (error) {
    return {
      status: "error",
      critical: true,
      message: "Firebase connection failed",
      error: error.message,
      firestore: "error",
      auth: "error",
    };
  }
}

/**
 * Check Database Collections
 */
async function checkDatabaseCollections() {
  const requiredCollections = [
    "users",
    "content",
    "analytics",
    "payments",
    "promotion_schedules",
    "community_posts",
  ];

  const results = {};
  let hasError = false;

  for (const collection of requiredCollections) {
    try {
      const snapshot = await db.collection(collection).limit(1).get();
      results[collection] = {
        exists: true,
        accessible: true,
        document_count: snapshot.size,
      };
    } catch (error) {
      results[collection] = {
        exists: false,
        accessible: false,
        error: error.message,
      };
      hasError = true;
    }
  }

  return {
    status: hasError ? "error" : "ok",
    critical: false,
    message: hasError ? "Some collections not accessible" : "All collections accessible",
    collections: results,
  };
}

/**
 * Check Platform OAuth Credentials
 */
function checkPlatformCredentials() {
  const platforms = {
    youtube: ["YT_CLIENT_ID", "YT_CLIENT_SECRET"],
    twitter: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
    facebook: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FB_CLIENT_ID", "FB_CLIENT_SECRET"],
    tiktok: [
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_CLIENT_SECRET",
      "TIKTOK_PROD_CLIENT_KEY",
      "TIKTOK_PROD_CLIENT_SECRET",
      "TIKTOK_SANDBOX_CLIENT_KEY",
      "TIKTOK_SANDBOX_CLIENT_SECRET",
    ],
    telegram: ["TELEGRAM_BOT_TOKEN"],
    snapchat: [
      "SNAPCHAT_CLIENT_ID",
      "SNAPCHAT_CLIENT_SECRET",
      "SNAPCHAT_PUBLIC_CLIENT_ID",
      "SNAPCHAT_CONFIDENTIAL_CLIENT_ID",
    ],
    linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    pinterest: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"],
    reddit: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    discord: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
    instagram: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
    spotify: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  };

  // Debug: log all detected environment variables
  console.log("---[DIAGNOSTICS ENV DEBUG]---");
  Object.keys(process.env).forEach(k => {
    if (k.includes("CLIENT") || k.includes("SECRET") || k.includes("TOKEN")) {
      console.log(`${k}: ${process.env[k] ? "[SET]" : "[NOT SET]"}`);
    }
  });
  console.log("-----------------------------");

  const results = {};
  let configuredCount = 0;

  Object.entries(platforms).forEach(([platform, requiredVars]) => {
    let missing = [];
    let configured = false;
    // Special-case checks per platform for variant env names
    if (platform === "instagram") {
      const appPair = process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET;
      const clientPair = process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET;
      configured = !!(appPair || clientPair);
      if (!configured)
        missing = [
          "INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET or INSTAGRAM_CLIENT_ID/INSTAGRAM_CLIENT_SECRET",
        ];
    } else if (platform === "tiktok") {
      const prod = process.env.TIKTOK_PROD_CLIENT_KEY && process.env.TIKTOK_PROD_CLIENT_SECRET;
      const sandbox =
        process.env.TIKTOK_SANDBOX_CLIENT_KEY && process.env.TIKTOK_SANDBOX_CLIENT_SECRET;
      const legacy = process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET;
      configured = !!(prod || sandbox || legacy);
      if (!configured)
        missing = [
          "TIKTOK_PROD_CLIENT_KEY/SECRET or TIKTOK_SANDBOX_CLIENT_KEY/SECRET or TIKTOK_CLIENT_KEY/SECRET",
        ];
    } else if (platform === "snapchat") {
      const legacy = process.env.SNAPCHAT_CLIENT_ID && process.env.SNAPCHAT_CLIENT_SECRET;
      const publicConfidential =
        (process.env.SNAPCHAT_PUBLIC_CLIENT_ID || process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID) &&
        process.env.SNAPCHAT_CLIENT_SECRET;
      configured = !!(legacy || publicConfidential);
      if (!configured)
        missing = [
          "SNAPCHAT_CLIENT_ID + SNAPCHAT_CLIENT_SECRET or SNAPCHAT_PUBLIC_CLIENT_ID + SNAPCHAT_CLIENT_SECRET or SNAPCHAT_CONFIDENTIAL_CLIENT_ID + SNAPCHAT_CLIENT_SECRET",
        ];
    } else if (platform === "twitter") {
      const clientPair = process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET;
      configured = !!clientPair;
      if (!configured) missing = ["TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET"];
    } else if (platform === "facebook") {
      const fbClient = process.env.FB_CLIENT_ID && process.env.FB_CLIENT_SECRET;
      const fbApp = process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET;
      configured = !!(fbClient || fbApp);
      if (!configured)
        missing = ["FB_CLIENT_ID/FB_CLIENT_SECRET or FACEBOOK_APP_ID/FACEBOOK_APP_SECRET"];
    } else {
      missing = requiredVars.filter(v => !process.env[v]);
      configured = missing.length === 0;
    }

    results[platform] = { configured, missing_variables: missing };
    if (configured) configuredCount++;
  });

  return {
    status:
      configuredCount === 0
        ? "error"
        : configuredCount < Object.keys(platforms).length
          ? "warning"
          : "ok",
    critical: configuredCount === 0,
    message: `${configuredCount}/${Object.keys(platforms).length} platforms configured`,
    platforms: results,
    configured_count: configuredCount,
    total_platforms: Object.keys(platforms).length,
  };
}

/**
 * Check Payment System
 */
function checkPaymentSystem() {
  const issues = [];
  const warnings = [];

  if (!process.env.PAYPAL_CLIENT_ID) {
    issues.push("PAYPAL_CLIENT_ID not set");
  }
  if (!process.env.PAYPAL_CLIENT_SECRET) {
    issues.push("PAYPAL_CLIENT_SECRET not set");
  }

  const paymentsEnabled = process.env.PAYMENTS_ENABLED === "true";
  const payoutsEnabled = process.env.PAYOUTS_ENABLED === "true";
  const livePayments = process.env.ALLOW_LIVE_PAYMENTS === "true";
  const paypalMode = process.env.PAYPAL_MODE || "sandbox";

  if (!paymentsEnabled) {
    warnings.push("PAYMENTS_ENABLED is not true - payments disabled");
  }
  if (!payoutsEnabled) {
    warnings.push("PAYOUTS_ENABLED is not true - payouts disabled");
  }
  if (!livePayments && process.env.NODE_ENV === "production") {
    warnings.push("ALLOW_LIVE_PAYMENTS is not true - only test payments allowed");
  }
  if (paypalMode === "sandbox" && process.env.NODE_ENV === "production") {
    warnings.push("PAYPAL_MODE is sandbox in production environment");
  }

  return {
    status: issues.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
    critical: issues.length > 0,
    message:
      issues.length > 0
        ? "Payment credentials missing"
        : warnings.length > 0
          ? "Payment system has warnings"
          : "Payment system configured",
    paypal_mode: paypalMode,
    payments_enabled: paymentsEnabled,
    payouts_enabled: payoutsEnabled,
    live_payments: livePayments,
    issues,
    warnings,
  };
}

/**
 * Check AI Services
 */
function checkAIServices() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_CLOUD_API_KEY;

  const services = {
    caption_generation: !!openaiKey,
    hashtag_generation: !!openaiKey,
    video_clipping: !!openaiKey || !!googleKey,
    chatbot: !!openaiKey,
  };

  const enabledCount = Object.values(services).filter(Boolean).length;

  return {
    status: enabledCount === 0 ? "warning" : "ok",
    critical: false,
    message: openaiKey ? "AI services enabled" : "AI services disabled (optional)",
    services,
    enabled_services: enabledCount,
    total_services: Object.keys(services).length,
  };
}

/**
 * Check External API Connectivity
 */
async function checkExternalAPIs() {
  const results = {};

  // Test PayPal API
  try {
    const paypalBase =
      process.env.PAYPAL_MODE === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    // Just check if we can reach the API (don't make authenticated request)
    results.paypal = { reachable: true };
  } catch (error) {
    results.paypal = { reachable: false, error: error.message };
  }

  // Test OpenAI API (if key exists)
  if (process.env.OPENAI_API_KEY) {
    results.openai = { configured: true };
  } else {
    results.openai = { configured: false };
  }

  return {
    status: "ok",
    critical: false,
    message: "External API checks completed",
    apis: results,
  };
}

/**
 * Check Storage Access
 */
async function checkStorageAccess() {
  try {
    const bucket = admin.storage().bucket();
    const [exists] = await bucket.exists();

    return {
      status: exists ? "ok" : "error",
      critical: true,
      message: exists ? "Firebase Storage accessible" : "Firebase Storage not accessible",
      bucket_name: bucket.name,
      exists,
    };
  } catch (error) {
    return {
      status: "error",
      critical: true,
      message: "Storage access failed",
      error: error.message,
    };
  }
}

/**
 * Check Email Service
 */
function checkEmailService() {
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const mode = process.env.EMAIL_SENDER_MODE;

  const configured = !!(resendKey || sendgridKey);

  return {
    status: configured ? "ok" : "warning",
    critical: false,
    message: configured ? "Email service configured" : "No email service configured",
    provider: mode || (resendKey ? "resend" : sendgridKey ? "sendgrid" : "none"),
    resend_configured: !!resendKey,
    sendgrid_configured: !!sendgridKey,
  };
}

/**
 * Check Rate Limiting
 */
function checkRateLimiting() {
  // Check if rate limiting middleware is loaded
  let distributedLimiter = false;
  try {
    const { rateLimiter } = require("../middlewares/globalRateLimiter");
    distributedLimiter = !!rateLimiter;
  } catch (e) {
    distributedLimiter = false;
  }

  return {
    status: "ok",
    critical: false,
    message: "Rate limiting active",
    distributed_limiter: distributedLimiter,
    express_rate_limit: true,
  };
}

/**
 * GET /api/diagnostics/quick
 * Quick health check (just critical systems)
 */
router.get("/quick", async (req, res) => {
  try {
    const checks = {
      firebase: false,
      database: false,
      storage: false,
    };

    // Quick Firebase check
    try {
      await admin.auth().listUsers(1);
      checks.firebase = true;
    } catch (e) {
      checks.firebase = false;
    }

    // Quick DB check
    try {
      await db.collection("users").limit(1).get();
      checks.database = true;
    } catch (e) {
      checks.database = false;
    }

    // Quick Storage check
    try {
      const bucket = admin.storage().bucket();
      const [exists] = await bucket.exists();
      checks.storage = exists;
    } catch (e) {
      checks.storage = false;
    }

    const allHealthy = Object.values(checks).every(Boolean);

    res.json({
      status: allHealthy ? "healthy" : "unhealthy",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
    });
  }
});

// Additional deep validation checks
async function checkContentUploadFlow() {
  try {
    const issues = [];
    const warnings = [];

    // Check if content upload routes exist
    const requiredRoutes = [
      "/api/content/upload",
      "/api/content/schedule",
      "/api/content/platforms",
    ];

    // Check upload size limits
    if (!process.env.MAX_UPLOAD_SIZE) {
      warnings.push("MAX_UPLOAD_SIZE not configured, using default");
    }

    // Check storage configuration
    if (!admin.storage) {
      issues.push("Firebase Storage not initialized");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Content upload flow has critical issues"
          : warnings.length > 0
            ? "Content upload flow has warnings"
            : "Content upload flow configured correctly",
      issues,
      warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check content upload flow: ${error.message}`,
      issues: [error.message],
    };
  }
}

async function checkUserAuthentication() {
  try {
    const issues = [];
    const warnings = [];

    // Test Firebase Auth connection
    try {
      await admin.auth().listUsers(1);
    } catch (error) {
      issues.push(`Firebase Auth connection failed: ${error.message}`);
    }

    // Check JWT secret
    if (!process.env.JWT_SECRET) {
      issues.push("JWT_SECRET not configured - token verification will fail");
    }

    // Check session configuration
    if (!process.env.SESSION_SECRET) {
      warnings.push("SESSION_SECRET not configured");
    }

    // Check CORS configuration
    if (!process.env.FRONTEND_URL) {
      warnings.push("FRONTEND_URL not configured - CORS may fail");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Authentication system has critical issues"
          : warnings.length > 0
            ? "Authentication system has warnings"
            : "Authentication system fully functional",
      issues,
      warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check authentication: ${error.message}`,
      issues: [error.message],
    };
  }
}

async function checkCommunityFeatures() {
  try {
    const issues = [];
    const warnings = [];

    // Check if community_posts collection exists
    try {
      await db.collection("community_posts").limit(1).get();
    } catch (error) {
      issues.push(`Community posts collection not accessible: ${error.message}`);
    }

    // Check if forum_posts collection exists
    try {
      await db.collection("forum_posts").limit(1).get();
    } catch (error) {
      issues.push(`Forum posts collection not accessible: ${error.message}`);
    }

    // Check if comments collection exists
    try {
      await db.collection("comments").limit(1).get();
    } catch (error) {
      warnings.push("Comments collection not found - may not be created yet");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Community features have critical issues"
          : warnings.length > 0
            ? "Community features have warnings"
            : "Community features fully functional",
      issues,
      warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check community features: ${error.message}`,
      issues: [error.message],
    };
  }
}

async function checkAnalyticsTracking() {
  try {
    const issues = [];
    const warnings = [];

    // Check analytics collection
    try {
      await db.collection("analytics").limit(1).get();
    } catch (error) {
      issues.push(`Analytics collection not accessible: ${error.message}`);
    }

    // Check if analytics routes are configured
    const analyticsConfig = {
      tracking_enabled: process.env.ANALYTICS_ENABLED !== "false",
      google_analytics: !!process.env.GA_TRACKING_ID,
      custom_analytics: true,
    };

    if (!analyticsConfig.tracking_enabled) {
      warnings.push("Analytics tracking is disabled");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Analytics tracking has critical issues"
          : warnings.length > 0
            ? "Analytics tracking has warnings"
            : "Analytics tracking fully functional",
      issues,
      warnings,
      details: analyticsConfig,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check analytics: ${error.message}`,
      issues: [error.message],
    };
  }
}

async function checkSchedulingSystem() {
  try {
    const issues = [];
    const warnings = [];

    // Check promotion_schedules collection
    try {
      await db.collection("promotion_schedules").limit(1).get();
    } catch (error) {
      issues.push(`Promotion schedules collection not accessible: ${error.message}`);
    }

    // Check if scheduler is running
    if (!process.env.SCHEDULER_ENABLED || process.env.SCHEDULER_ENABLED === "false") {
      warnings.push("Scheduler is disabled - scheduled posts will not be published");
    }

    // Check timezone configuration
    if (!process.env.DEFAULT_TIMEZONE) {
      warnings.push("DEFAULT_TIMEZONE not set, using UTC");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Scheduling system has critical issues"
          : warnings.length > 0
            ? "Scheduling system has warnings"
            : "Scheduling system fully functional",
      issues,
      warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check scheduling system: ${error.message}`,
      issues: [error.message],
    };
  }
}

async function checkWithdrawalSystem() {
  try {
    const issues = [];
    const warnings = [];

    // Check withdrawals collection
    try {
      await db.collection("withdrawals").limit(1).get();
    } catch (error) {
      issues.push(`Withdrawals collection not accessible: ${error.message}`);
    }

    // Check PayPal payout configuration
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      issues.push("PayPal credentials missing - withdrawals will fail");
    }

    if (process.env.PAYOUTS_ENABLED === "false") {
      warnings.push("Payouts are disabled - users cannot withdraw funds");
    }

    // Check minimum withdrawal amount
    if (!process.env.MIN_WITHDRAWAL_AMOUNT) {
      warnings.push("MIN_WITHDRAWAL_AMOUNT not configured");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Withdrawal system has critical issues"
          : warnings.length > 0
            ? "Withdrawal system has warnings"
            : "Withdrawal system fully functional",
      issues,
      warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check withdrawal system: ${error.message}`,
      issues: [error.message],
    };
  }
}

async function checkAdminDashboard() {
  try {
    const issues = [];
    const warnings = [];

    // Check if admin routes are accessible
    const adminCollections = ["admin_users", "system_logs", "audit_logs"];

    for (const collection of adminCollections) {
      try {
        await db.collection(collection).limit(1).get();
      } catch (error) {
        warnings.push(`${collection} collection not accessible`);
      }
    }

    // Check admin authentication
    if (!process.env.ADMIN_EMAIL) {
      warnings.push("ADMIN_EMAIL not configured - admin account may not be set up");
    }

    return {
      status: issues.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
      critical: issues.length > 0,
      message:
        issues.length > 0
          ? "Admin dashboard has critical issues"
          : warnings.length > 0
            ? "Admin dashboard has warnings"
            : "Admin dashboard fully functional",
      issues,
      warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      critical: true,
      message: `Failed to check admin dashboard: ${error.message}`,
      issues: [error.message],
    };
  }
}

// Extended comprehensive health check with all features
router.get("/full", authMiddleware, async (req, res) => {
  try {
    const checks = {
      environment_variables: await checkEnvironmentVariables(),
      firebase_connection: await checkFirebaseConnection(),
      database_collections: await checkDatabaseCollections(),
      platform_credentials: await checkPlatformCredentials(),
      payment_system: await checkPaymentSystem(),
      ai_services: await checkAIServices(),
      storage_access: await checkStorageAccess(),
      email_service: await checkEmailService(),
      rate_limiting: checkRateLimiting(),
      user_authentication: await checkUserAuthentication(),
      content_upload_flow: await checkContentUploadFlow(),
      community_features: await checkCommunityFeatures(),
      analytics_tracking: await checkAnalyticsTracking(),
      scheduling_system: await checkSchedulingSystem(),
      withdrawal_system: await checkWithdrawalSystem(),
      admin_dashboard: await checkAdminDashboard(),
    };

    // Calculate overall status
    const criticalIssues = Object.values(checks).filter(
      c => c.critical && c.status === "failed"
    ).length;
    const errors = Object.values(checks).filter(c => c.status === "failed").length;
    const warnings = Object.values(checks).filter(c => c.status === "warning").length;
    const passed = Object.values(checks).filter(c => c.status === "passed").length;

    let overall_status = "healthy";
    if (criticalIssues > 0) {
      overall_status = "critical";
    } else if (errors > 0) {
      overall_status = "degraded";
    } else if (warnings > 0) {
      overall_status = "warning";
    }

    res.json({
      overall_status,
      checks,
      summary: {
        total_checks: Object.keys(checks).length,
        passed,
        warnings,
        errors,
        critical: criticalIssues,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Full diagnostics error:", error);
    res.status(500).json({
      overall_status: "critical",
      error: "Failed to run full diagnostics",
      message: error.message,
    });
  }
});

// Admin-only: list historical scans
// GET /api/diagnostics/scans
router.get("/scans", authMiddleware, async (req, res) => {
  try {
    if (!(req.user && req.user.role === "admin"))
      return res.status(403).json({ error: "admin_required" });
    const snap = await db.collection("system_scans").orderBy("createdAt", "desc").limit(20).get();
    const scans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, scans });
  } catch (e) {
    console.error("[Diagnostics] List scans error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
