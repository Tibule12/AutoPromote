const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const { getEffectiveTierSnapshot } = require("../services/billingService");
const { resolvePlan } = require("../config/subscriptionPlans");

// Get subscription status
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const userData = userDoc.data();
    const snapshot = await getEffectiveTierSnapshot(userId, null, userData);
    const plan = resolvePlan(snapshot.tierId);

    // Check various fields where subscription might be stored
    const subscriptionId = userData.paypalSubscriptionId || null;
    const status = snapshot.tierId === "free" ? "active" : userData.subscriptionStatus || "active";

    res.json({
      status,
      subscriptionId,
      plan: snapshot.tierId,
      planName: plan.name,
      effectiveTier: snapshot.tierId,
      ok: true,
      // Support for PayPalSubscriptionPanel expecting specific structure:
      id: subscriptionId,
      status_paypal: status, // Alias if needed
    });
  } catch (error) {
    console.error("Error fetching PayPal status:", error);
    res.status(500).json({ status: "error", error: error.message });
  }
});

module.exports = router;
