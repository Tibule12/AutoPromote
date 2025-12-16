const express = require("express");
const router = express.Router();
const monetizationService = require("../monetizationService");
const authMiddleware = require("../authMiddleware");
const paypalClient = require("../paypalClient");
const paypal = require("@paypal/paypal-server-sdk");

// Get revenue analytics with optional filters
router.get("/revenue-analytics", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const analytics = await monetizationService.getRevenueAnalytics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
    });

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching revenue analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Process a new transaction (e.g., from promotion execution)
router.post("/transactions", authMiddleware, async (req, res) => {
  try {
    const transactionData = req.body;
    const result = await monetizationService.processTransaction(transactionData);
    res.status(201).json(result);
  } catch (error) {
    console.error("Error processing transaction:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create PayPal order
router.post("/paypal/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount, description } = req.body;

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: amount,
          },
          description,
        },
      ],
    });

    const client = paypalClient.client();
    const order = await client.execute(request);

    res.status(201).json({ orderId: order.result.id });
  } catch (error) {
    console.error("Error creating PayPal order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Capture PayPal order
router.post("/paypal/capture-order", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const client = paypalClient.client();
    const capture = await client.execute(request);

    res.status(200).json({ captureId: capture.result.id });
  } catch (error) {
    console.error("Error capturing PayPal order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Payout to creator
router.post("/paypal/payout", authMiddleware, async (req, res) => {
  try {
    const { recipientEmail, amount, currency = "USD", note } = req.body;

    // Implement PayPal Payouts API call here
    // For now, respond with a placeholder success message
    res
      .status(200)
      .json({ message: "Payout request received", recipientEmail, amount, currency, note });
  } catch (error) {
    console.error("Error processing PayPal payout:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get creator payout summary
router.get("/creator-payout/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const payoutSummary = await monetizationService.getCreatorPayoutSummary(userId);
    res.json(payoutSummary);
  } catch (error) {
    console.error("Error fetching creator payout summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get platform fees summary
router.get("/platform-fees", authMiddleware, async (req, res) => {
  try {
    const feesSummary = await monetizationService.getPlatformFeesSummary();
    res.json(feesSummary);
  } catch (error) {
    console.error("Error fetching platform fees summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
