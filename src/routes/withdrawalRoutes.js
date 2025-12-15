const express = require("express");
// Use canonical src firebaseAdmin shim (which re-exports root firebaseAdmin) instead of legacy backend path
const { db } = require("../firebaseAdmin");
const router = express.Router();
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const withdrawWriteLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_WITHDRAW_WRITES || "20", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "2"),
  windowHint: "withdraw_writes",
});
const withdrawPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_WITHDRAW_PUBLIC || "60", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "5"),
  windowHint: "withdraw_public",
});
// Use consolidated authMiddleware & monetizationService in src
const authMiddleware = require("../authMiddleware");
const monetizationService = require("../monetizationService");

// NOTE: After this refactor there should be no remaining references to ../../backend/* allowing safe deletion of backend/ directory.

// POST /api/withdrawals/request - User requests a withdrawal
// User requests a withdrawal (Wise or PayPal)
router.post("/request", authMiddleware, withdrawWriteLimiter, async (req, res) => {
  try {
    const { amount, currency, method, payout_details } = req.body; // method: 'wise' or 'paypal'
    const userId = req.user.uid;

    // Check user balance
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(400).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    if (!userData.balance || userData.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Create withdrawal request
    const withdrawalRef = db.collection("withdrawals").doc();
    const withdrawalData = {
      userId,
      amount,
      currency: currency || "USD",
      status: "pending",
      method: method || "wise",
      payout_details: payout_details || {},
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await withdrawalRef.set(withdrawalData);

    // Update user balance
    await userRef.update({
      balance: userData.balance - amount,
      updated_at: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Withdrawal request submitted",
      withdrawal: {
        id: withdrawalRef.id,
        ...withdrawalData,
      },
    });
  } catch (error) {
    console.error("Error creating withdrawal request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin triggers payout (stub for Wise/PayPal integration)
router.post("/process/:id", authMiddleware, withdrawWriteLimiter, async (req, res) => {
  // TODO: Check admin role in production
  try {
    const withdrawalId = req.params.id;
    const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
    const doc = await withdrawalRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    const withdrawal = doc.data();

    // Payout logic
    let payoutResult = null;
    if (withdrawal.method === "wise") {
      // TODO: Integrate Wise API here
      // Example: Use axios or fetch to call Wise API with your WISE_API_KEY
      // Send payout to withdrawal.payout_details (bank info, email, etc.)
      // payoutResult = await sendWisePayout(withdrawal);
      payoutResult = { success: true, provider: "wise", message: "Stub: Wise payout sent." };
    } else if (withdrawal.method === "paypal") {
      // TODO: Integrate PayPal Payouts API here
      // Example: Use PayPal SDK or REST API with PAYPAL_CLIENT_ID/SECRET
      // Send payout to withdrawal.payout_details (PayPal email)
      // payoutResult = await sendPayPalPayout(withdrawal);
      payoutResult = { success: true, provider: "paypal", message: "Stub: PayPal payout sent." };
    } else {
      return res.status(400).json({ error: "Unsupported payout method" });
    }

    // Mark as paid if payoutResult.success
    if (payoutResult && payoutResult.success) {
      await withdrawalRef.update({
        status: "paid",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return res.json({ message: `Payout processed via ${payoutResult.provider}` });
    } else {
      // Optionally, mark as failed
      await withdrawalRef.update({
        status: "failed",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return res.status(500).json({ error: "Payout failed", details: payoutResult });
    }
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/withdrawals/history - User views withdrawal history
router.get("/history", authMiddleware, withdrawPublicLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;

    const withdrawalsRef = db
      .collection("withdrawals")
      .where("userId", "==", userId)
      .orderBy("requested_at", "desc");

    const snapshot = await withdrawalsRef.get();
    const withdrawals = [];

    snapshot.forEach(doc => {
      withdrawals.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    res.json({ withdrawals });
  } catch (error) {
    console.error("Error getting withdrawal history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
