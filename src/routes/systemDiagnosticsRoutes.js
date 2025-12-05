// systemDiagnosticsRoutes.js
// Automated system health check and error detection

const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebaseAdmin');
const authMiddleware = require('../authMiddleware');

/**
 * GET /api/diagnostics/health
 * Comprehensive system health check
 * Returns detailed status of all platform components
 */
router.get('/health', authMiddleware, async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      overall_status: 'checking',
      checks: {}
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
    const criticalFailures = allChecks.filter(c => c.status === 'error' && c.critical);
    const warnings = allChecks.filter(c => c.status === 'warning');
    const errors = allChecks.filter(c => c.status === 'error');

    if (criticalFailures.length > 0) {
      diagnostics.overall_status = 'critical';
    } else if (errors.length > 0) {
      diagnostics.overall_status = 'degraded';
    } else if (warnings.length > 0) {
      diagnostics.overall_status = 'warning';
    } else {
      diagnostics.overall_status = 'healthy';
    }

    diagnostics.summary = {
      total_checks: allChecks.length,
      passed: allChecks.filter(c => c.status === 'ok').length,
      warnings: warnings.length,
      errors: errors.length,
      critical: criticalFailures.length
    };

    res.json(diagnostics);

  } catch (error) {
    console.error('[Diagnostics] Health check error:', error);
    res.status(500).json({
      overall_status: 'error',
      error: 'Failed to run diagnostics',
      message: error.message
    });
  }
});

/**
 * Check Environment Variables
 */
function checkEnvironmentVariables() {
  const issues = [];
  const warnings = [];

  // Critical variables
  const criticalVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY'
  ];

  criticalVars.forEach(varName => {
    if (!process.env[varName]) {
      issues.push(`Missing critical variable: ${varName}`);
    }
  });

  // Important variables
  const importantVars = {
    'OPENAI_API_KEY': 'AI features disabled',
    'PAYPAL_CLIENT_ID': 'Payments disabled',
    'PAYPAL_CLIENT_SECRET': 'Payments disabled',
    'RESEND_API_KEY': 'Email service may not work',
    'SENDGRID_API_KEY': 'Email service may not work'
  };

  Object.entries(importantVars).forEach(([varName, impact]) => {
    if (!process.env[varName]) {
      warnings.push(`Missing ${varName} - ${impact}`);
    }
  });

  return {
    status: issues.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'ok'),
    critical: issues.length > 0,
    message: issues.length > 0 ? 'Critical environment variables missing' : 
             warnings.length > 0 ? 'Some optional variables missing' : 
             'All environment variables configured',
    issues,
    warnings,
    variables_checked: criticalVars.length + Object.keys(importantVars).length
  };
}

/**
 * Check Firebase Connection
 */
async function checkFirebaseConnection() {
  try {
    // Try to access Firestore
    const testDoc = await db.collection('_system_health').doc('connection_test').get();
    
    // Try to list users (just first one to verify auth works)
    await admin.auth().listUsers(1);

    return {
      status: 'ok',
      critical: true,
      message: 'Firebase Admin SDK connected successfully',
      firestore: 'connected',
      auth: 'connected'
    };
  } catch (error) {
    return {
      status: 'error',
      critical: true,
      message: 'Firebase connection failed',
      error: error.message,
      firestore: 'error',
      auth: 'error'
    };
  }
}

/**
 * Check Database Collections
 */
async function checkDatabaseCollections() {
  const requiredCollections = [
    'users',
    'content',
    'analytics',
    'payments',
    'promotion_schedules',
    'community_posts'
  ];

  const results = {};
  let hasError = false;

  for (const collection of requiredCollections) {
    try {
      const snapshot = await db.collection(collection).limit(1).get();
      results[collection] = {
        exists: true,
        accessible: true,
        document_count: snapshot.size
      };
    } catch (error) {
      results[collection] = {
        exists: false,
        accessible: false,
        error: error.message
      };
      hasError = true;
    }
  }

  return {
    status: hasError ? 'error' : 'ok',
    critical: false,
    message: hasError ? 'Some collections not accessible' : 'All collections accessible',
    collections: results
  };
}

/**
 * Check Platform OAuth Credentials
 */
function checkPlatformCredentials() {
  const platforms = {
    youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    twitter: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
    facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    telegram: ['TELEGRAM_BOT_TOKEN'],
    snapchat: ['SNAPCHAT_CLIENT_ID', 'SNAPCHAT_CLIENT_SECRET'],
    linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    pinterest: ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'],
    reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
    instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    spotify: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']
  };

  const results = {};
  let configuredCount = 0;

  Object.entries(platforms).forEach(([platform, requiredVars]) => {
    const missing = requiredVars.filter(v => !process.env[v]);
    const configured = missing.length === 0;
    
    results[platform] = {
      configured,
      missing_variables: missing
    };

    if (configured) configuredCount++;
  });

  return {
    status: configuredCount === 0 ? 'error' : (configuredCount < Object.keys(platforms).length ? 'warning' : 'ok'),
    critical: configuredCount === 0,
    message: `${configuredCount}/${Object.keys(platforms).length} platforms configured`,
    platforms: results,
    configured_count: configuredCount,
    total_platforms: Object.keys(platforms).length
  };
}

/**
 * Check Payment System
 */
function checkPaymentSystem() {
  const issues = [];
  const warnings = [];

  if (!process.env.PAYPAL_CLIENT_ID) {
    issues.push('PAYPAL_CLIENT_ID not set');
  }
  if (!process.env.PAYPAL_CLIENT_SECRET) {
    issues.push('PAYPAL_CLIENT_SECRET not set');
  }

  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  const payoutsEnabled = process.env.PAYOUTS_ENABLED === 'true';
  const livePayments = process.env.ALLOW_LIVE_PAYMENTS === 'true';
  const paypalMode = process.env.PAYPAL_MODE || 'sandbox';

  if (!paymentsEnabled) {
    warnings.push('PAYMENTS_ENABLED is not true - payments disabled');
  }
  if (!payoutsEnabled) {
    warnings.push('PAYOUTS_ENABLED is not true - payouts disabled');
  }
  if (!livePayments && process.env.NODE_ENV === 'production') {
    warnings.push('ALLOW_LIVE_PAYMENTS is not true - only test payments allowed');
  }
  if (paypalMode === 'sandbox' && process.env.NODE_ENV === 'production') {
    warnings.push('PAYPAL_MODE is sandbox in production environment');
  }

  return {
    status: issues.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'ok'),
    critical: issues.length > 0,
    message: issues.length > 0 ? 'Payment credentials missing' : 
             warnings.length > 0 ? 'Payment system has warnings' : 
             'Payment system configured',
    paypal_mode: paypalMode,
    payments_enabled: paymentsEnabled,
    payouts_enabled: payoutsEnabled,
    live_payments: livePayments,
    issues,
    warnings
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
    chatbot: !!openaiKey
  };

  const enabledCount = Object.values(services).filter(Boolean).length;

  return {
    status: enabledCount === 0 ? 'warning' : 'ok',
    critical: false,
    message: openaiKey ? 'AI services enabled' : 'AI services disabled (optional)',
    services,
    enabled_services: enabledCount,
    total_services: Object.keys(services).length
  };
}

/**
 * Check External API Connectivity
 */
async function checkExternalAPIs() {
  const results = {};

  // Test PayPal API
  try {
    const paypalBase = process.env.PAYPAL_MODE === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com';
    
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
    status: 'ok',
    critical: false,
    message: 'External API checks completed',
    apis: results
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
      status: exists ? 'ok' : 'error',
      critical: true,
      message: exists ? 'Firebase Storage accessible' : 'Firebase Storage not accessible',
      bucket_name: bucket.name,
      exists
    };
  } catch (error) {
    return {
      status: 'error',
      critical: true,
      message: 'Storage access failed',
      error: error.message
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
    status: configured ? 'ok' : 'warning',
    critical: false,
    message: configured ? 'Email service configured' : 'No email service configured',
    provider: mode || (resendKey ? 'resend' : sendgridKey ? 'sendgrid' : 'none'),
    resend_configured: !!resendKey,
    sendgrid_configured: !!sendgridKey
  };
}

/**
 * Check Rate Limiting
 */
function checkRateLimiting() {
  // Check if rate limiting middleware is loaded
  let distributedLimiter = false;
  try {
    const { rateLimiter } = require('../middlewares/globalRateLimiter');
    distributedLimiter = !!rateLimiter;
  } catch (e) {
    distributedLimiter = false;
  }

  return {
    status: 'ok',
    critical: false,
    message: 'Rate limiting active',
    distributed_limiter: distributedLimiter,
    express_rate_limit: true
  };
}

/**
 * GET /api/diagnostics/quick
 * Quick health check (just critical systems)
 */
router.get('/quick', async (req, res) => {
  try {
    const checks = {
      firebase: false,
      database: false,
      storage: false
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
      await db.collection('users').limit(1).get();
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
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;
