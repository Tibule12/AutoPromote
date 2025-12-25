/* eslint-disable no-console */
/**
 * Startup Diagnostics - Runs automatically when server starts
 * Logs all critical errors and warnings to console and database
 * Prevents server from starting if critical issues are detected
 */

const admin = require("firebase-admin");
const db = admin.firestore();

class StartupDiagnostics {
  constructor() {
    this.criticalErrors = [];
    this.errors = [];
    this.warnings = [];
    this.startTime = Date.now();
  }

  log(level, category, message, details = {}) {
    const logEntry = {
      level,
      category,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    const icon =
      level === "critical"
        ? "🚨"
        : level === "error"
          ? "❌"
          : level === "warning"
            ? "⚠️"
            : level === "info"
              ? "ℹ️"
              : "✅";

    console.log(`${icon} [${category.toUpperCase()}] ${message}`);
    if (Object.keys(details).length > 0) {
      console.log("   Details:", details);
    }

    if (level === "critical") {
      this.criticalErrors.push(logEntry);
    } else if (level === "error") {
      this.errors.push(logEntry);
    } else if (level === "warning") {
      this.warnings.push(logEntry);
    }

    return logEntry;
  }

  async checkEnvironmentVariables() {
    console.log("\n🔍 Checking Environment Variables...");

    const critical = [
      "FIREBASE_PROJECT_ID",
      "FIREBASE_PRIVATE_KEY",
      "FIREBASE_CLIENT_EMAIL",
      "JWT_SECRET",
    ];

    const important = [
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "OPENAI_API_KEY",
      "FRONTEND_URL",
      "RESEND_API_KEY",
    ];

    const optional = [
      "SENDGRID_API_KEY",
      "GA_TRACKING_ID",
      "MAX_UPLOAD_SIZE",
      "MIN_WITHDRAWAL_AMOUNT",
      "DEFAULT_TIMEZONE",
      "SESSION_SECRET",
    ];

    for (const key of critical) {
      if (!process.env[key]) {
        this.log("critical", "environment", `Missing critical environment variable: ${key}`, {
          action_required: "Add this variable to Render environment settings immediately",
          impact: "Application will not function properly",
        });
      }
    }

    for (const key of important) {
      if (!process.env[key]) {
        this.log("error", "environment", `Missing important environment variable: ${key}`, {
          action_required: "Add this variable to enable full functionality",
          impact: "Some features will not work",
        });
      }
    }

    for (const key of optional) {
      if (!process.env[key]) {
        this.log("warning", "environment", `Optional environment variable not set: ${key}`, {
          action_required: "Consider adding this for enhanced functionality",
          impact: "Minor feature limitations",
        });
      }
    }

    if (this.criticalErrors.length === 0 && this.errors.length === 0) {
      this.log("success", "environment", "All critical environment variables configured");
    }
  }

  async checkFirebaseConnection() {
    console.log("\n🔍 Checking Firebase Connection...");

    try {
      // Test Firestore
      await db.collection("_test").limit(1).get();
      this.log("success", "firebase", "Firestore connection successful");
    } catch (error) {
      this.log("critical", "firebase", "Firestore connection failed", {
        error: error.message,
        action_required: "Check Firebase credentials in environment variables",
        impact: "Database operations will fail",
      });
    }

    try {
      // Test Auth
      await admin.auth().listUsers(1);
      this.log("success", "firebase", "Firebase Auth connection successful");
    } catch (error) {
      this.log("critical", "firebase", "Firebase Auth connection failed", {
        error: error.message,
        action_required: "Check Firebase Auth configuration",
        impact: "User authentication will fail",
      });
    }

    try {
      // Test Storage
      const configuredBucket =
        process.env.FIREBASE_STORAGE_BUCKET ||
        (admin && admin.options && admin.options.storageBucket);
      if (!configuredBucket) {
        this.log("warning", "firebase", "Firebase Storage bucket not configured", {
          action_required:
            "Set FIREBASE_STORAGE_BUCKET in environment variables (e.g. my-bucket.appspot.com)",
          impact: "File uploads will be disabled until configured",
        });
      } else if (!admin || typeof admin.storage !== "function") {
        this.log("warning", "firebase", "Firebase Storage SDK not available", {
          action_required: "Ensure firebase-admin has storage enabled in this build",
          impact: "Storage operations may not work",
        });
      } else {
        const bucket = admin.storage().bucket(configuredBucket);
        try {
          const [exists] = await bucket.exists();
          if (exists) {
            this.log("success", "firebase", "Firebase Storage connection successful");
          } else {
            this.log("error", "firebase", "Firebase Storage bucket not found", {
              bucket: configuredBucket,
              action_required:
                "Create or configure storage bucket with this name, or set FIREBASE_STORAGE_BUCKET to the correct bucket",
              impact: "File uploads will fail",
            });
          }
        } catch (err) {
          // Likely permission/credentials issue
          this.log("error", "firebase", "Firebase Storage connection failed", {
            error: err && err.message,
            bucket: configuredBucket,
            action_required:
              "Verify service account has Storage permissions (roles/storage.objectViewer or roles/storage.admin) and that FIREBASE_SERVICE_ACCOUNT is valid",
            impact: "File uploads will fail",
          });
        }
      }
    } catch (error) {
      this.log("error", "firebase", "Firebase Storage check encountered an unexpected error", {
        error: error && error.message,
        action_required: "Investigate runtime error during storage verification",
        impact: "File uploads may be impacted",
      });
    }
  }

  async checkDatabaseCollections() {
    console.log("\n🔍 Checking Database Collections...");

    const requiredCollections = [
      "users",
      "content",
      "analytics",
      "payments",
      "promotion_schedules",
      "community_posts",
      "forum_posts",
      "withdrawals",
    ];

    for (const collection of requiredCollections) {
      try {
        await db.collection(collection).limit(1).get();
        this.log("success", "database", `Collection '${collection}' is accessible`);
      } catch (error) {
        this.log("error", "database", `Collection '${collection}' not accessible`, {
          error: error.message,
          action_required: "Check Firestore rules and collection setup",
          impact: `${collection} operations will fail`,
        });
      }
    }
  }

  async checkPlatformCredentials() {
    console.log("\n🔍 Checking Platform Credentials...");

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
      instagram: [
        "INSTAGRAM_APP_ID",
        "INSTAGRAM_APP_SECRET",
        "INSTAGRAM_CLIENT_ID",
        "INSTAGRAM_CLIENT_SECRET",
      ],
      spotify: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    };

    let configuredCount = 0;
    for (const [platform, vars] of Object.entries(platforms)) {
      // Debug log for detected env keys per platform
      const present = vars.filter(v => !!process.env[v]);
      if (present.length > 0) {
        console.log(
          `[DIAGNOSTICS][PLATFORM] ${platform.toUpperCase()} detected envs: ${present.join(", ")}`
        );
      } else {
        console.log(`[DIAGNOSTICS][PLATFORM] ${platform.toUpperCase()} no env vars detected`);
      }
      // Platform-specific variant checks
      if (platform === "instagram") {
        const hasApp = process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET;
        const hasClient = process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET;
        if (hasApp || hasClient) {
          this.log("success", "platforms", `${platform.toUpperCase()} credentials configured`);
          configuredCount++;
        } else {
          this.log("warning", "platforms", `${platform.toUpperCase()} not fully configured`, {
            missing_variables: [
              "INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET or INSTAGRAM_CLIENT_ID/INSTAGRAM_CLIENT_SECRET",
            ],
            action_required: "Add platform credentials to enable integration",
            impact: `${platform} integration will not work`,
          });
        }
        continue;
      }
      if (platform === "tiktok") {
        const prod = process.env.TIKTOK_PROD_CLIENT_KEY && process.env.TIKTOK_PROD_CLIENT_SECRET;
        const sandbox =
          process.env.TIKTOK_SANDBOX_CLIENT_KEY && process.env.TIKTOK_SANDBOX_CLIENT_SECRET;
        const legacy = process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET;
        if (prod || sandbox || legacy) {
          this.log("success", "platforms", `${platform.toUpperCase()} credentials configured`);
          configuredCount++;
        } else {
          this.log("warning", "platforms", `${platform.toUpperCase()} not fully configured`, {
            missing_variables: [
              "TIKTOK_PROD_CLIENT_KEY/SECRET or TIKTOK_SANDBOX_CLIENT_KEY/SECRET or TIKTOK_CLIENT_KEY/SECRET",
            ],
            action_required: "Add platform credentials to enable integration",
            impact: `${platform} integration will not work`,
          });
        }
        continue;
      }
      if (platform === "snapchat") {
        const legacy = process.env.SNAPCHAT_CLIENT_ID && process.env.SNAPCHAT_CLIENT_SECRET;
        const publicConf =
          (process.env.SNAPCHAT_PUBLIC_CLIENT_ID || process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID) &&
          process.env.SNAPCHAT_CLIENT_SECRET;
        if (legacy || publicConf) {
          this.log("success", "platforms", `${platform.toUpperCase()} credentials configured`);
          configuredCount++;
        } else {
          this.log("warning", "platforms", `${platform.toUpperCase()} not fully configured`, {
            missing_variables: [
              "SNAPCHAT_CLIENT_ID/SECRET or SNAPCHAT_PUBLIC_CLIENT_ID + SNAPCHAT_CLIENT_SECRET or SNAPCHAT_CONFIDENTIAL_CLIENT_ID + SNAPCHAT_CLIENT_SECRET",
            ],
            action_required: "Add platform credentials to enable integration",
            impact: `${platform} integration will not work`,
          });
        }
        continue;
      }
      if (platform === "twitter") {
        const clientPair = process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET;
        if (clientPair) {
          this.log("success", "platforms", `${platform.toUpperCase()} credentials configured`);
          configuredCount++;
        } else {
          this.log("warning", "platforms", `${platform.toUpperCase()} not fully configured`, {
            missing_variables: ["TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET"],
            action_required: "Add platform credentials to enable integration",
            impact: `${platform} integration will not work`,
          });
        }
        continue;
      }
      if (platform === "facebook") {
        const fbClient = process.env.FB_CLIENT_ID && process.env.FB_CLIENT_SECRET;
        const fbApp = process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET;
        if (fbClient || fbApp) {
          this.log("success", "platforms", `${platform.toUpperCase()} credentials configured`);
          configuredCount++;
        } else {
          this.log("warning", "platforms", `${platform.toUpperCase()} not fully configured`, {
            missing_variables: [
              "FB_CLIENT_ID/FB_CLIENT_SECRET or FACEBOOK_APP_ID/FACEBOOK_APP_SECRET",
            ],
            action_required: "Add platform credentials to enable integration",
            impact: `${platform} integration will not work`,
          });
        }
        continue;
      }
      const allConfigured = vars.every(v => process.env[v]);
      if (allConfigured) {
        this.log("success", "platforms", `${platform.toUpperCase()} credentials configured`);
        configuredCount++;
      } else {
        const missing = vars.filter(v => !process.env[v]);
        this.log("warning", "platforms", `${platform.toUpperCase()} not fully configured`, {
          missing_variables: missing,
          action_required: "Add platform credentials to enable integration",
          impact: `${platform} integration will not work`,
        });
      }
    }

    this.log("info", "platforms", `${configuredCount}/12 platforms configured`);
  }

  async checkPaymentSystem() {
    console.log("\n🔍 Checking Payment System...");

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      this.log("critical", "payments", "PayPal credentials not configured", {
        action_required: "Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET",
        impact: "Payment processing and withdrawals will fail",
      });
    } else {
      this.log("success", "payments", "PayPal credentials configured");
    }

    if (process.env.PAYMENTS_ENABLED === "false") {
      this.log("warning", "payments", "Payments are disabled", {
        action_required: "Set PAYMENTS_ENABLED=true to enable payments",
        impact: "Users cannot make payments",
      });
    }

    if (process.env.PAYOUTS_ENABLED === "false") {
      this.log("warning", "payments", "Payouts are disabled", {
        action_required: "Set PAYOUTS_ENABLED=true to enable withdrawals",
        impact: "Users cannot withdraw funds",
      });
    }

    if (process.env.PAYPAL_MODE === "sandbox") {
      this.log("warning", "payments", "PayPal running in SANDBOX mode", {
        action_required: "Set PAYPAL_MODE=live for production",
        impact: "Test transactions only, no real money",
      });
    } else if (process.env.PAYPAL_MODE === "live") {
      this.log("success", "payments", "PayPal running in LIVE mode");
    }
  }

  async checkAIServices() {
    console.log("\n🔍 Checking AI Services...");

    if (!process.env.OPENAI_API_KEY) {
      this.log("error", "ai", "OpenAI API key not configured", {
        action_required: "Add OPENAI_API_KEY to environment variables",
        impact: "AI caption generation, hashtags, and chatbot will not work",
      });
    } else {
      this.log("success", "ai", "OpenAI API key configured");
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_PRIVATE_KEY) {
      this.log("warning", "ai", "Google Cloud credentials not found", {
        action_required: "Configure Google Cloud for video processing",
        impact: "AI video clipping may not work",
      });
    }
  }

  async checkEmailService() {
    console.log("\n🔍 Checking Email Service...");

    const hasResend = !!process.env.RESEND_API_KEY;
    const hasSendGrid = !!process.env.SENDGRID_API_KEY;

    if (!hasResend && !hasSendGrid) {
      this.log("error", "email", "No email service configured", {
        action_required: "Add RESEND_API_KEY or SENDGRID_API_KEY",
        impact: "Transactional emails will not be sent",
      });
    } else if (hasResend) {
      this.log("success", "email", "Resend email service configured");
    } else if (hasSendGrid) {
      this.log("success", "email", "SendGrid email service configured");
    }
  }

  async checkSchedulingSystem() {
    console.log("\n🔍 Checking Scheduling System...");

    if (process.env.SCHEDULER_ENABLED === "false") {
      this.log("warning", "scheduler", "Scheduler is disabled", {
        action_required: "Set SCHEDULER_ENABLED=true to enable scheduled posts",
        impact: "Scheduled content will not be published automatically",
      });
    } else {
      this.log("success", "scheduler", "Scheduler enabled");
    }

    if (!process.env.DEFAULT_TIMEZONE) {
      this.log("warning", "scheduler", "DEFAULT_TIMEZONE not set, using UTC", {
        action_required: "Set DEFAULT_TIMEZONE (e.g., America/New_York)",
        impact: "Scheduling times may be confusing for users",
      });
    }
  }

  async saveToDatabase() {
    if (
      this.criticalErrors.length === 0 &&
      this.errors.length === 0 &&
      this.warnings.length === 0
    ) {
      return;
    }

    try {
      await db.collection("system_diagnostics").add({
        type: "startup",
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - this.startTime,
        critical_errors: this.criticalErrors,
        errors: this.errors,
        warnings: this.warnings,
        summary: {
          critical_count: this.criticalErrors.length,
          error_count: this.errors.length,
          warning_count: this.warnings.length,
        },
      });
    } catch (error) {
      console.error("Failed to save diagnostics to database:", error);
    }
  }

  printSummary() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log("📊 STARTUP DIAGNOSTICS SUMMARY");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`🚨 Critical Errors: ${this.criticalErrors.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log("=".repeat(60));

    if (this.criticalErrors.length > 0) {
      console.log("\n🚨 CRITICAL ERRORS THAT MUST BE FIXED:");
      this.criticalErrors.forEach((err, idx) => {
        console.log(`\n${idx + 1}. ${err.message}`);
        console.log(`   Category: ${err.category}`);
        if (err.details.action_required) {
          console.log(`   Action: ${err.details.action_required}`);
        }
        if (err.details.impact) {
          console.log(`   Impact: ${err.details.impact}`);
        }
      });
    }

    if (this.errors.length > 0) {
      console.log("\n❌ ERRORS THAT SHOULD BE FIXED:");
      this.errors.forEach((err, idx) => {
        console.log(`\n${idx + 1}. ${err.message}`);
        console.log(`   Category: ${err.category}`);
        if (err.details.action_required) {
          console.log(`   Action: ${err.details.action_required}`);
        }
      });
    }

    if (this.warnings.length > 0) {
      console.log("\n⚠️  WARNINGS (Optional Improvements):");
      this.warnings.forEach((warn, idx) => {
        console.log(`${idx + 1}. ${warn.message}`);
      });
    }

    console.log("\n" + "=".repeat(60) + "\n");
  }

  async runAll() {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 RUNNING STARTUP DIAGNOSTICS");
    console.log("=".repeat(60));

    await this.checkEnvironmentVariables();
    await this.checkFirebaseConnection();
    await this.checkDatabaseCollections();
    await this.checkPlatformCredentials();
    await this.checkPaymentSystem();
    await this.checkAIServices();
    await this.checkEmailService();
    await this.checkSchedulingSystem();

    this.printSummary();
    await this.saveToDatabase();

    // Return status
    return {
      success: this.criticalErrors.length === 0,
      hasErrors: this.errors.length > 0,
      hasWarnings: this.warnings.length > 0,
      criticalErrors: this.criticalErrors,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

module.exports = StartupDiagnostics;
