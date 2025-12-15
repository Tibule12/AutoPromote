// test-production-flow.js
// End-to-end production readiness test

require("dotenv").config();
const https = require("https");
const readline = require("readline");

const API_BASE = process.env.API_BASE_URL || "https://api.autopromote.org";
const FRONTEND_BASE = process.env.FRONTEND_URL || "https://www.autopromote.org";

// Console colors
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = https.request(requestOptions, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data ? JSON.parse(data) : {},
          });
        } catch {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data,
          });
        }
      });
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function testEndpoint(name, url, expectedStatus = 200) {
  try {
    const response = await makeRequest(url);
    if (response.status === expectedStatus) {
      log(`✅ ${name}`, "green");
      return true;
    } else {
      log(`❌ ${name} (Expected ${expectedStatus}, got ${response.status})`, "red");
      return false;
    }
  } catch (err) {
    log(`❌ ${name} - ${err.message}`, "red");
    return false;
  }
}

async function runProductionTests() {
  log("\n" + "═".repeat(70), "blue");
  log("  AUTOPROMOTE PRODUCTION READINESS TEST", "blue");
  log("═".repeat(70) + "\n", "blue");

  log(`Frontend: ${FRONTEND_BASE}`, "cyan");
  log(`Backend:  ${API_BASE}\n`, "cyan");

  let totalTests = 0;
  let passedTests = 0;

  // Category 1: Infrastructure
  log("\n" + "─".repeat(70), "magenta");
  log("  INFRASTRUCTURE CHECKS", "magenta");
  log("─".repeat(70), "magenta");

  const infrastructureTests = [
    ["Frontend Homepage", `${FRONTEND_BASE}`, 200],
    ["Backend Health", `${API_BASE}/health`, 200],
    ["Backend API Root", `${API_BASE}/api`, 404], // Should 404 without endpoint
  ];

  for (const [name, url, expected] of infrastructureTests) {
    totalTests++;
    if (await testEndpoint(name, url, expected)) passedTests++;
    await new Promise(r => setTimeout(r, 300));
  }

  // Category 2: Payment Endpoints
  log("\n" + "─".repeat(70), "magenta");
  log("  PAYMENT SYSTEM CHECKS", "magenta");
  log("─".repeat(70), "magenta");

  const paymentTests = [
    ["Payment Status Endpoint", `${API_BASE}/api/payments/status`, 200],
    ["Payment Plans Endpoint", `${API_BASE}/api/payments/plans`, 200],
    ["PayPal Subscription Plans", `${API_BASE}/api/paypal-subscriptions/plans`, 200],
    ["PayPal Webhook (GET rejection)", `${API_BASE}/api/paypal/webhook`, 400], // Should reject GET
  ];

  for (const [name, url, expected] of paymentTests) {
    totalTests++;
    if (await testEndpoint(name, url, expected)) passedTests++;
    await new Promise(r => setTimeout(r, 300));
  }

  // Category 3: Platform Integration Endpoints
  log("\n" + "─".repeat(70), "magenta");
  log("  PLATFORM INTEGRATION CHECKS", "magenta");
  log("─".repeat(70), "magenta");

  const platforms = [
    "youtube",
    "twitter",
    "facebook",
    "tiktok",
    "telegram",
    "linkedin",
    "pinterest",
    "reddit",
    "discord",
    "spotify",
    "snapchat",
  ];

  for (const platform of platforms) {
    totalTests++;
    const url = `${API_BASE}/api/${platform}/status`;
    // These require auth, so 401 or 200 is acceptable
    try {
      const response = await makeRequest(url);
      if (response.status === 200 || response.status === 401 || response.status === 403) {
        log(`✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)} endpoint exists`, "green");
        passedTests++;
      } else {
        log(
          `❌ ${platform.charAt(0).toUpperCase() + platform.slice(1)} unexpected status: ${response.status}`,
          "red"
        );
      }
    } catch (err) {
      log(`❌ ${platform.charAt(0).toUpperCase() + platform.slice(1)} - ${err.message}`, "red");
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Category 4: Critical API Endpoints
  log("\n" + "─".repeat(70), "magenta");
  log("  CRITICAL API ENDPOINTS", "magenta");
  log("─".repeat(70), "magenta");

  const apiTests = [
    ["Content Routes (requires auth)", `${API_BASE}/api/content`, 401],
    ["User Routes (requires auth)", `${API_BASE}/api/users/me`, 401],
    ["Analytics Routes (requires auth)", `${API_BASE}/api/analytics`, 401],
    ["Admin Routes (requires auth)", `${API_BASE}/api/admin`, 401],
  ];

  for (const [name, url, expected] of apiTests) {
    totalTests++;
    if (await testEndpoint(name, url, expected)) passedTests++;
    await new Promise(r => setTimeout(r, 300));
  }

  // Category 5: Legal/Compliance Pages
  log("\n" + "─".repeat(70), "magenta");
  log("  LEGAL & COMPLIANCE CHECKS", "magenta");
  log("─".repeat(70), "magenta");

  const legalTests = [
    ["Privacy Policy", "https://Tibule12.github.io/AutoPromote/docs/privacy.html", 200],
    ["Terms of Service", "https://Tibule12.github.io/AutoPromote/docs/terms.html", 200],
    ["Data Deletion", "https://Tibule12.github.io/AutoPromote/docs/data-deletion.html", 200],
  ];

  for (const [name, url, expected] of legalTests) {
    totalTests++;
    if (await testEndpoint(name, url, expected)) passedTests++;
    await new Promise(r => setTimeout(r, 300));
  }

  // Results Summary
  log("\n" + "═".repeat(70), "blue");
  log("  TEST RESULTS SUMMARY", "blue");
  log("═".repeat(70) + "\n", "blue");

  const passRate = Math.round((passedTests / totalTests) * 100);

  log(`Total Tests:    ${totalTests}`, "cyan");
  log(`Passed:         ${passedTests}`, passedTests === totalTests ? "green" : "yellow");
  log(
    `Failed:         ${totalTests - passedTests}`,
    totalTests - passedTests === 0 ? "green" : "red"
  );
  log(`Pass Rate:      ${passRate}%`, passRate >= 90 ? "green" : passRate >= 75 ? "yellow" : "red");

  // Production Readiness Assessment
  log("\n" + "─".repeat(70), "magenta");
  log("  PRODUCTION READINESS ASSESSMENT", "magenta");
  log("─".repeat(70) + "\n", "magenta");

  if (passRate >= 95) {
    log("✅ EXCELLENT - Ready for production launch!", "green");
    log("   All critical systems are operational.", "green");
  } else if (passRate >= 85) {
    log("✅ GOOD - Ready for soft launch", "yellow");
    log("   Most systems working. Monitor closely and fix minor issues.", "yellow");
  } else if (passRate >= 75) {
    log("⚠️  FAIR - Launch with caution", "yellow");
    log("   Some systems need attention. Plan for quick fixes post-launch.", "yellow");
  } else {
    log("❌ POOR - Not ready for production", "red");
    log("   Too many critical failures. Fix issues before launching.", "red");
  }

  // Next Steps
  log("\n" + "─".repeat(70), "magenta");
  log("  RECOMMENDED NEXT STEPS", "magenta");
  log("─".repeat(70) + "\n", "magenta");

  if (passRate < 85) {
    log("1. Review failed tests above", "yellow");
    log("2. Check Render deployment logs for errors", "yellow");
    log("3. Verify all environment variables are set", "yellow");
    log("4. Run: node test-paypal-integration.js", "yellow");
    log("5. Fix issues and re-test", "yellow");
  } else {
    log("1. ✅ Test user registration flow manually", "green");
    log("2. ✅ Test platform connection (YouTube, Twitter)", "green");
    log("3. ✅ Test PayPal payment flow (buy Premium)", "green");
    log("4. ✅ Upload and schedule test content", "green");
    log("5. ✅ Monitor logs for 24 hours", "green");
    log("6. 🚀 Launch on December 15!", "green");
  }

  log("\n" + "═".repeat(70) + "\n", "blue");

  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests
runProductionTests().catch(err => {
  log(`\n❌ Fatal error: ${err.message}`, "red");
  console.error(err);
  process.exit(1);
});
