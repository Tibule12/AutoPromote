const express = require("express");
const router = express.Router();
const { db, admin } = require("./firebaseAdmin");
const { createOrder, captureOrder, verifyWebhook } = require("./services/payments/paypalService");
const authMiddleware = require("./authMiddleware");
const { strictLimiter, apiLimiter } = require("./middleware/rateLimiter");

// Add explicit webhook rate limiter for CodeQL/static scanners
let codeqlLimiter = null;
try {
  codeqlLimiter = require("./middlewares/codeqlRateLimit");
} catch (e) {
  codeqlLimiter = null;
}

// Packages definition - mirroring frontend for validation
const PACKAGES = {
  pack_small: { credits: 50, price: "4.99" },
  pack_medium: { credits: 150, price: "12.99" },
  pack_large: { credits: 500, price: "39.99" },
};

function normalizeCreditAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

async function getSyncedCreditBalance(userId) {
  const creditsRef = db.collection("user_credits").doc(userId);
  const userRef = db.collection("users").doc(userId);
  const [creditsDoc, userDoc] = await Promise.all([creditsRef.get(), userRef.get()]);

  const storedBalance = creditsDoc.exists ? normalizeCreditAmount(creditsDoc.data().balance) : 0;
  const legacyBalance = userDoc.exists ? normalizeCreditAmount(userDoc.data().credits) : 0;
  const resolvedBalance = Math.max(storedBalance, legacyBalance);

  if (resolvedBalance > storedBalance) {
    const currentTotalEarned = creditsDoc.exists
      ? normalizeCreditAmount(creditsDoc.data().totalEarned)
      : 0;
    await creditsRef.set(
      {
        balance: resolvedBalance,
        totalEarned: Math.max(currentTotalEarned, resolvedBalance),
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  return resolvedBalance;
}

// Expose PayPal Client ID for frontend SDK
router.get("/config/paypal", apiLimiter, (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID || "sb" }); // Default to sandbox "sb" if missing
});

// Create Order Payload
// Returns { id: "ORDER-ID" ... } to the client
router.post("/create-order", strictLimiter, authMiddleware, async (req, res) => {
  try {
    const { packageId } = req.body;
    const pack = PACKAGES[packageId];

    if (!pack) {
      return res.status(400).json({ error: "Invalid package ID" });
    }

    const order = await createOrder({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: packageId,
          description: `Credits Pack: ${packageId}`,
          amount: {
            currency_code: "USD",
            value: pack.price,
          },
        },
      ],
    });

    res.json(order);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Capture Order Payload
// Client sends { orderID } after approval
router.post("/capture-order", strictLimiter, authMiddleware, async (req, res) => {
  try {
    const { orderID, packageId } = req.body; // packageId passed for double-check or logging
    const userId = (req.user && req.user.uid) || req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const pack = PACKAGES[packageId];
    if (!pack) {
      return res.status(400).json({ error: "Order captured but package unknown" });
    }

    const receiptRef = db.collection("transactions").doc(`paypal_${orderID}`);
    const existingReceipt = await receiptRef.get();
    if (existingReceipt.exists) {
      const balance = await getSyncedCreditBalance(userId);
      return res.json({
        success: true,
        newCredits: 0,
        balance,
        alreadyProcessed: true,
      });
    }

    const captureData = await captureOrder(orderID);

    if (captureData.status === "COMPLETED") {
      let responsePayload = null;
      const processedAt = new Date().toISOString();

      await db.runTransaction(async t => {
        const receiptDoc = await t.get(receiptRef);
        const creditsRef = db.collection("user_credits").doc(userId);
        const userRef = db.collection("users").doc(userId);
        const creditsDoc = await t.get(creditsRef);
        const userDoc = await t.get(userRef);
        const currentCredits = Math.max(
          creditsDoc.exists ? normalizeCreditAmount(creditsDoc.data().balance) : 0,
          userDoc.exists ? normalizeCreditAmount(userDoc.data().credits) : 0
        );

        if (receiptDoc.exists) {
          responsePayload = {
            success: true,
            newCredits: 0,
            balance: currentCredits,
            alreadyProcessed: true,
          };
          return;
        }

        const updatedCredits = currentCredits + pack.credits;

        const creditsUpdate = {
          balance: updatedCredits,
          totalEarned:
            Math.max(
              creditsDoc.exists ? normalizeCreditAmount(creditsDoc.data().totalEarned) : 0,
              currentCredits
            ) + pack.credits,
          lastUpdated: processedAt,
        };

        if (admin && admin.firestore && admin.firestore.FieldValue) {
          creditsUpdate.transactions = admin.firestore.FieldValue.arrayUnion({
            type: "credit_purchase",
            amount: pack.price,
            currency: "USD",
            creditsAdded: pack.credits,
            provider: "PAYPAL",
            orderId: orderID,
            timestamp: processedAt,
          });
        }

        t.set(
          creditsRef,
          creditsUpdate,
          { merge: true }
        );

        t.set(
          userRef,
          {
            credits: updatedCredits,
            lastPurchaseDate: processedAt,
          },
          { merge: true }
        );

        t.set(
          receiptRef,
          {
            userId,
            type: "CREDIT_PURCHASE",
            amount: pack.price,
            currency: "USD",
            creditsAdded: pack.credits,
            provider: "PAYPAL",
            orderId: orderID,
            status: "COMPLETED",
            timestamp: processedAt,
            balanceAfter: updatedCredits,
          },
          { merge: true }
        );

        responsePayload = {
          success: true,
          newCredits: pack.credits,
          balance: updatedCredits,
          alreadyProcessed: false,
        };
      });

      return res.json(responsePayload || { success: true, newCredits: 0, balance: 0 });
    } else {
      return res.status(400).json({ error: "Order not completed", details: captureData });
    }
  } catch (error) {
    console.error("Capture Order Error:", error);
    res.status(500).json({ error: "Failed to capture order" });
  }
});

// Public webhook endpoint for PayPal
router.post(
  "/paypal/webhook",
  // Use webhook-specific limiter (IP-based) to bound incoming webhook traffic
  codeqlLimiter && codeqlLimiter.webhooks ? codeqlLimiter.webhooks : (req, res, next) => next(),
  express.json(),
  async (req, res) => {
    try {
      const result = await verifyWebhook(req);
      if (!result.verified) {
        console.warn("PayPal webhook verification failed", result);
        // Still return 200 to PayPal to avoid retries if you're intentionally ignoring events, but
        // it's safer to return 400 so PayPal retries when verification fails. We'll return 400.
        return res.status(400).json({ ok: false, reason: "verification_failed", detail: result });
      }

      const evt = req.body || {};
      // Example: handle ORDER.CAPTURE.COMPLETED
      if (
        evt.event_type === "CHECKOUT.ORDER.APPROVED" ||
        evt.event_type === "CHECKOUT.ORDER.COMPLETED" ||
        evt.event_type === "PAYMENT.CAPTURE.COMPLETED"
      ) {
        // Implement any bookkeeping: mark orders, credit user, etc.
        try {
          const orderId =
            evt.resource &&
            (evt.resource.id || evt.resource.order_id || evt.resource.parent_payment);
          await db
            .collection("paypal_webhook_events")
            .add({ event: evt, receivedAt: new Date().toISOString() });
        } catch (e) {
          console.warn("Failed to persist paypal webhook event", e && e.message);
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error("Error handling paypal webhook", e && e.message);
      res.status(500).json({ ok: false, error: e && e.message });
    }
  }
);

module.exports = router;
