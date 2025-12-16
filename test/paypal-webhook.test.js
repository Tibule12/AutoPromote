// Basic import & simulation test for PayPal webhook route
const http = require("http");

try {
  const router = require("../src/routes/paypalWebhookRoutes");
  if (!router) throw new Error("paypalWebhookRoutes missing");
  console.log("PayPal webhook routes loaded");
} catch (e) {
  console.error("PayPal webhook route load failed:", e.message);
  process.exit(1);
}
