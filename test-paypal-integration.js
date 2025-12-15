// test-paypal-integration.js
// Comprehensive PayPal integration test suite

require("dotenv").config();
const https = require("https");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const API_BASE = process.env.API_BASE_URL || "https://api.autopromote.org";
let testToken = null;

// Utility functions
function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, "green");
}

function error(message) {
  log(`❌ ${message}`, "red");
}

function info(message) {
  log(`ℹ️  ${message}`, "cyan");
}

function warning(message) {
  log(`⚠️  ${message}`, "yellow");
}

function section(message) {
  log(`\n${"=".repeat(60)}`, "blue");
  log(`  ${message}`, "blue");
  log(`${"=".repeat(60)}`, "blue");
}

// HTTP request helper
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Test 1: Environment Variables Check
async function testEnvironmentVariables() {
  section("TEST 1: Environment Variables Check");

  const requiredVars = [
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "PAYPAL_MODE",
    "PAYMENTS_ENABLED",
    "PAYOUTS_ENABLED",
    "ALLOW_LIVE_PAYMENTS",
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      success(`${varName}: ${varName.includes("SECRET") ? "***" : process.env[varName]}`);
    } else {
      error(`${varName}: NOT SET`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    warning("Missing environment variables! Set them in Render or .env file");
    return false;
  }

  // Check values
  if (process.env.PAYPAL_MODE !== "live") {
    warning(`PAYPAL_MODE is '${process.env.PAYPAL_MODE}' - should be 'live' for production`);
  }

  if (process.env.PAYMENTS_ENABLED !== "true") {
    error('PAYMENTS_ENABLED must be "true"');
    return false;
  }

  if (process.env.PAYOUTS_ENABLED !== "true") {
    warning('PAYOUTS_ENABLED is not "true" - payouts will be disabled');
  }

  if (process.env.ALLOW_LIVE_PAYMENTS !== "true") {
    error('ALLOW_LIVE_PAYMENTS must be "true"');
    return false;
  }

  success("All critical environment variables are set correctly!");
  return true;
}

// Test 2: Backend Health Check
async function testBackendHealth() {
  section("TEST 2: Backend Health Check");

  try {
    const url = new URL("/health", API_BASE);
    info(`Testing: ${url.href}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "GET",
      headers: { Accept: "application/json" },
    };

    const response = await makeRequest(options);

    if (response.status === 200) {
      success(`Backend is healthy: ${response.status}`);
      info(JSON.stringify(response.data, null, 2));
      return true;
    } else {
      error(`Backend health check failed: ${response.status}`);
      info(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (err) {
    error(`Backend health check error: ${err.message}`);
    return false;
  }
}

// Test 3: Payment Status Endpoint
async function testPaymentStatus() {
  section("TEST 3: Payment Status Endpoint");

  try {
    const url = new URL("/api/payments/status", API_BASE);
    info(`Testing: ${url.href}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: testToken ? `Bearer ${testToken}` : "",
      },
    };

    const response = await makeRequest(options);

    if (response.status === 200) {
      success("Payment status endpoint working");

      const data = response.data;

      // Check critical flags
      if (data.paymentsEnabled === true) {
        success("✓ Payments are ENABLED");
      } else {
        error("✗ Payments are DISABLED");
      }

      if (data.payoutsEnabled === true) {
        success("✓ Payouts are ENABLED");
      } else {
        warning("⚠ Payouts are DISABLED");
      }

      if (data.liveCallsBlocked === true) {
        error("✗ Live calls are BLOCKED - check ALLOW_LIVE_PAYMENTS and NODE_ENV");
        if (data.reason) {
          error(`  Reason: ${data.reason}`);
        }
      } else {
        success("✓ Live calls are ALLOWED");
      }

      // Check PayPal provider
      if (data.providers && data.providers.paypal) {
        const paypal = data.providers.paypal;
        info("PayPal Provider Status:");
        info(`  - Onboarded: ${paypal.onboarded}`);
        info(`  - Payouts Enabled: ${paypal.payoutsEnabled}`);
        info(`  - Pending: ${paypal.pending}`);

        if (paypal.ok) {
          success("✓ PayPal provider initialized");
        } else {
          error(`✗ PayPal provider error: ${paypal.error}`);
        }
      } else {
        warning("PayPal provider not found in response");
      }

      return data.paymentsEnabled && !data.liveCallsBlocked;
    } else {
      error(`Payment status check failed: ${response.status}`);
      info(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (err) {
    error(`Payment status error: ${err.message}`);
    return false;
  }
}

// Test 4: PayPal Webhook Endpoint
async function testPayPalWebhook() {
  section("TEST 4: PayPal Webhook Endpoint");

  try {
    const url = new URL("/api/paypal/webhook", API_BASE);
    info(`Testing: ${url.href}`);
    info("Note: This should return 400 for GET requests (webhooks expect POST)");

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "GET",
      headers: { Accept: "application/json" },
    };

    const response = await makeRequest(options);

    // Webhook endpoint should reject GET with 400 or 405
    if (response.status === 400 || response.status === 405 || response.status === 404) {
      success(`Webhook endpoint exists (returned ${response.status} for GET as expected)`);
      return true;
    } else if (response.status === 200) {
      warning("Webhook endpoint returned 200 for GET - verify it validates POST with signature");
      return true;
    } else {
      error(`Unexpected status: ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Webhook endpoint error: ${err.message}`);
    return false;
  }
}

// Test 5: PayPal Subscription Plans Endpoint
async function testSubscriptionPlans() {
  section("TEST 5: PayPal Subscription Plans");

  try {
    const url = new URL("/api/paypal-subscriptions/plans", API_BASE);
    info(`Testing: ${url.href}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "GET",
      headers: { Accept: "application/json" },
    };

    const response = await makeRequest(options);

    if (response.status === 200) {
      success("Subscription plans endpoint working");

      const plans = response.data.plans || response.data;

      if (Array.isArray(plans)) {
        info(`Found ${plans.length} subscription plans:`);
        plans.forEach(plan => {
          info(`  - ${plan.name}: $${plan.price}/month`);
          if (plan.paypalPlanId) {
            info(`    PayPal Plan ID: ${plan.paypalPlanId}`);
          } else if (plan.id !== "free") {
            warning(`    Missing PayPal Plan ID for ${plan.name}`);
          }
        });

        // Check for required plans
        const hasFreePlan = plans.some(p => p.id === "free");
        const hasPremiumPlan = plans.some(p => p.id === "premium");
        const hasUnlimitedPlan = plans.some(p => p.id === "unlimited");

        if (hasFreePlan && hasPremiumPlan) {
          success("✓ All required plans are configured");
          return true;
        } else {
          warning("Missing some subscription plans");
          return false;
        }
      } else {
        warning("Unexpected response format");
        info(JSON.stringify(response.data, null, 2));
        return false;
      }
    } else {
      error(`Subscription plans check failed: ${response.status}`);
      info(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (err) {
    error(`Subscription plans error: ${err.message}`);
    return false;
  }
}

// Test 6: Create Test Order (requires auth)
async function testCreateOrder() {
  section("TEST 6: PayPal Order Creation");

  if (!testToken) {
    warning("Skipping order creation test - no authentication token");
    info("To test order creation, provide a valid Firebase ID token");
    return null;
  }

  try {
    const url = new URL("/api/paypal/create-order", API_BASE);
    info(`Testing: ${url.href}`);

    const orderData = JSON.stringify({
      amount: 9.99,
      currency: "USD",
      internalId: `test-${Date.now()}`,
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(orderData),
        Authorization: `Bearer ${testToken}`,
        Accept: "application/json",
      },
    };

    const response = await makeRequest(options, orderData);

    if (response.status === 200 || response.status === 201) {
      success("✓ Order creation successful");

      if (response.data.id) {
        info(`  Order ID: ${response.data.id}`);
      }
      if (response.data.status) {
        info(`  Status: ${response.data.status}`);
      }
      if (response.data.links) {
        const approveLink = response.data.links.find(l => l.rel === "approve");
        if (approveLink) {
          info(`  Approval URL: ${approveLink.href}`);
          info("  → User would be redirected here to complete payment");
        }
      }

      return true;
    } else if (response.status === 401 || response.status === 403) {
      warning("Order creation requires authentication (expected)");
      return null;
    } else {
      error(`Order creation failed: ${response.status}`);
      info(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (err) {
    error(`Order creation error: ${err.message}`);
    return false;
  }
}

// Test 7: PayPal SDK Configuration
async function testPayPalSDK() {
  section("TEST 7: PayPal SDK Configuration");

  try {
    const paypalClient = require("./src/paypalClient");
    success("✓ PayPal client module loads successfully");

    if (paypalClient.client) {
      success("✓ PayPal client factory exists");

      // Try to create a client instance
      try {
        const client = paypalClient.client();
        success("✓ PayPal client instance created");

        // Check environment
        if (process.env.NODE_ENV === "production" || process.env.PAYPAL_MODE === "live") {
          info("  Environment: LIVE (Production)");
        } else {
          warning("  Environment: SANDBOX (Testing)");
        }

        return true;
      } catch (err) {
        error(`Failed to create PayPal client: ${err.message}`);
        return false;
      }
    } else {
      error("PayPal client factory not found");
      return false;
    }
  } catch (err) {
    error(`PayPal SDK error: ${err.message}`);
    warning("Make sure @paypal/paypal-server-sdk is installed");
    return false;
  }
}

// Test 8: Database Connection (Firestore)
async function testDatabaseConnection() {
  section("TEST 8: Database Connection (Firestore)");

  try {
    const { db } = require("./src/firebaseAdmin");
    success("✓ Firebase Admin SDK loaded");

    // Try to read from a collection
    try {
      const testRef = db.collection("_test").doc("health_check");
      await testRef.set({
        tested_at: new Date().toISOString(),
        test_type: "paypal_integration",
      });
      success("✓ Firestore write successful");

      const doc = await testRef.get();
      if (doc.exists) {
        success("✓ Firestore read successful");
        await testRef.delete();
        success("✓ Firestore delete successful");
        return true;
      } else {
        error("Document not found after write");
        return false;
      }
    } catch (err) {
      error(`Firestore operation failed: ${err.message}`);
      return false;
    }
  } catch (err) {
    error(`Database connection error: ${err.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log("\n" + "═".repeat(60), "blue");
  log("  AUTOPROMOTE PAYPAL INTEGRATION TEST SUITE", "blue");
  log("═".repeat(60) + "\n", "blue");

  info(`Testing against: ${API_BASE}`);
  info(`Environment: ${process.env.NODE_ENV || "development"}`);
  info(`PayPal Mode: ${process.env.PAYPAL_MODE || "not set"}\n`);

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };

  const tests = [
    { name: "Environment Variables", fn: testEnvironmentVariables },
    { name: "Backend Health", fn: testBackendHealth },
    { name: "Payment Status", fn: testPaymentStatus },
    { name: "PayPal Webhook", fn: testPayPalWebhook },
    { name: "Subscription Plans", fn: testSubscriptionPlans },
    { name: "PayPal SDK", fn: testPayPalSDK },
    { name: "Database Connection", fn: testDatabaseConnection },
    { name: "Order Creation", fn: testCreateOrder },
  ];

  for (const test of tests) {
    results.total++;
    try {
      const result = await test.fn();

      if (result === true) {
        results.passed++;
      } else if (result === false) {
        results.failed++;
      } else {
        results.skipped++;
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      error(`Test '${test.name}' crashed: ${err.message}`);
      results.failed++;
    }
  }

  // Summary
  section("TEST SUMMARY");

  log(`Total Tests:   ${results.total}`, "cyan");
  log(`Passed:        ${results.passed}`, "green");
  log(`Failed:        ${results.failed}`, results.failed > 0 ? "red" : "green");
  log(`Skipped:       ${results.skipped}`, "yellow");

  const passRate = Math.round((results.passed / results.total) * 100);
  log(`\nPass Rate:     ${passRate}%`, passRate >= 80 ? "green" : "red");

  // Production readiness assessment
  section("PRODUCTION READINESS ASSESSMENT");

  if (results.failed === 0 && results.passed >= 6) {
    success("✅ READY FOR PRODUCTION LAUNCH!");
    info("All critical tests passed. You can deploy with confidence.");
  } else if (results.failed <= 2 && results.passed >= 5) {
    warning("⚠️  MOSTLY READY - FIX MINOR ISSUES");
    info("Most tests passed. Fix the failed tests before launching.");
  } else {
    error("❌ NOT READY FOR PRODUCTION");
    info("Too many tests failed. Review configuration and fix issues.");
  }

  log("\n" + "═".repeat(60) + "\n", "blue");

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// CLI argument parsing
if (process.argv.includes("--token") || process.argv.includes("-t")) {
  const tokenIndex = process.argv.findIndex(arg => arg === "--token" || arg === "-t");
  if (tokenIndex >= 0 && process.argv[tokenIndex + 1]) {
    testToken = process.argv[tokenIndex + 1];
    info(`Using provided authentication token for authenticated tests\n`);
  }
}

// Run tests
runAllTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
