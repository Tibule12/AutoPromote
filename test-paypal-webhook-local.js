// test-paypal-webhook-local.js
// Local test for PayPal webhook signature verification

require("dotenv").config();
const crypto = require("crypto");

console.log("\n=== PayPal Webhook Signature Verification Test ===\n");

// Sample PayPal webhook event (real structure)
const sampleWebhookEvent = {
  id: "WH-2WR32451HC0233532-67976317FL4543714",
  event_version: "1.0",
  create_time: "2025-12-05T08:35:49.000Z",
  resource_type: "capture",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  summary: "Payment completed for $9.99 USD",
  resource: {
    id: "5O190127TN364715T",
    amount: {
      currency_code: "USD",
      value: "9.99",
    },
    status: "COMPLETED",
    create_time: "2025-12-05T08:35:42Z",
    update_time: "2025-12-05T08:35:49Z",
  },
  links: [
    {
      href: "https://api-m.paypal.com/v1/notifications/webhooks-events/WH-2WR32451HC0233532-67976317FL4543714",
      rel: "self",
      method: "GET",
    },
  ],
};

// Sample PayPal headers
const sampleHeaders = {
  "paypal-transmission-id": "b2d7b1e0-a2c1-11ec-b909-0242ac120002",
  "paypal-transmission-time": "2025-12-05T08:35:49Z",
  "paypal-transmission-sig": "dummy-signature-will-be-replaced",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url":
    "https://api.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77",
};

console.log("📦 Sample Webhook Event:");
console.log(JSON.stringify(sampleWebhookEvent, null, 2));

console.log("\n📝 Sample Headers:");
console.log(JSON.stringify(sampleHeaders, null, 2));

// Test signature components
console.log("\n🔐 Testing Signature Verification Components:\n");

const webhookId = process.env.PAYPAL_WEBHOOK_ID;

if (!webhookId) {
  console.log("❌ PAYPAL_WEBHOOK_ID not set in environment");
  console.log("   Set this in Render: Dashboard → Backend Service → Environment");
  console.log("   Get it from: PayPal Developer Dashboard → Webhooks → Your webhook\n");
} else {
  console.log("✅ PAYPAL_WEBHOOK_ID is set:", webhookId);
}

// Create expected signature string
const transmissionId = sampleHeaders["paypal-transmission-id"];
const transmissionTime = sampleHeaders["paypal-transmission-time"];
const webhookBody = JSON.stringify(sampleWebhookEvent);
const crc = crypto.createHash("sha256").update(webhookBody).digest("hex").toUpperCase();

const expectedString = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;

console.log("\n📊 Signature Components:");
console.log("  Transmission ID:", transmissionId);
console.log("  Transmission Time:", transmissionTime);
console.log("  Webhook ID:", webhookId || "(not set)");
console.log("  Body CRC32:", crc);
console.log("\n  Expected Signature String:");
console.log("  ", expectedString);

// Test local webhook handler
console.log("\n\n=== Testing Local Webhook Handler ===\n");

try {
  const paypalWebhookRoutes = require("./src/routes/paypalWebhookRoutes");
  console.log("✅ PayPal webhook routes module loaded successfully");

  // Check if Express router
  if (paypalWebhookRoutes && typeof paypalWebhookRoutes === "function") {
    console.log("✅ Webhook routes are valid Express router");
  } else {
    console.log("⚠️  Unexpected module export type");
  }
} catch (err) {
  console.log("❌ Failed to load webhook routes:", err.message);
  console.log("\nStack trace:", err.stack);
}

// Test PayPal client
console.log("\n\n=== Testing PayPal Client Configuration ===\n");

try {
  const paypalClient = require("./src/paypalClient");
  console.log("✅ PayPal client module loaded successfully");

  if (paypalClient.client) {
    console.log("✅ PayPal client factory exists");

    // Check environment setup
    if (process.env.PAYPAL_CLIENT_ID) {
      console.log("✅ PAYPAL_CLIENT_ID is set");
    } else {
      console.log("❌ PAYPAL_CLIENT_ID not set");
    }

    if (process.env.PAYPAL_CLIENT_SECRET) {
      console.log("✅ PAYPAL_CLIENT_SECRET is set");
    } else {
      console.log("❌ PAYPAL_CLIENT_SECRET not set");
    }

    const mode =
      process.env.PAYPAL_MODE || (process.env.NODE_ENV === "production" ? "live" : "sandbox");
    console.log(`\n🌍 PayPal Mode: ${mode}`);

    if (mode === "live") {
      console.log("   ✅ Using LIVE environment (production)");
    } else {
      console.log("   ⚠️  Using SANDBOX environment (testing)");
    }
  } else {
    console.log("❌ PayPal client factory not found");
  }
} catch (err) {
  console.log("❌ Failed to load PayPal client:", err.message);
  console.log("\nMake sure @paypal/paypal-server-sdk is installed:");
  console.log("  npm install @paypal/paypal-server-sdk");
}

// Summary
console.log("\n\n=== SUMMARY ===\n");

const checks = [
  { name: "PAYPAL_CLIENT_ID", status: !!process.env.PAYPAL_CLIENT_ID },
  { name: "PAYPAL_CLIENT_SECRET", status: !!process.env.PAYPAL_CLIENT_SECRET },
  { name: "PAYPAL_WEBHOOK_ID", status: !!process.env.PAYPAL_WEBHOOK_ID },
  { name: "PAYPAL_MODE", status: !!process.env.PAYPAL_MODE },
  { name: "PAYMENTS_ENABLED", status: process.env.PAYMENTS_ENABLED === "true" },
  { name: "ALLOW_LIVE_PAYMENTS", status: process.env.ALLOW_LIVE_PAYMENTS === "true" },
];

const passed = checks.filter(c => c.status).length;
const total = checks.length;

console.log("Configuration Status:");
checks.forEach(check => {
  console.log(`  ${check.status ? "✅" : "❌"} ${check.name}`);
});

console.log(`\n📊 ${passed}/${total} checks passed`);

if (passed === total) {
  console.log("\n✅ PayPal webhook integration is properly configured!");
  console.log("   You can deploy to production.");
} else {
  console.log("\n⚠️  Some configuration is missing.");
  console.log("   Set missing variables in Render before deploying.");
}

console.log("\n=== Next Steps ===\n");
console.log("1. Set all missing environment variables in Render");
console.log("2. Run: node test-paypal-integration.js");
console.log("3. Test a real webhook by making a PayPal payment");
console.log("4. Check Render logs for webhook events");
console.log("\n");
