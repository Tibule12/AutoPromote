const paypalSimple = require("./paypal");
const { admin: _admin, db } = require("../firebaseAdmin");
const logger = require("../utils/logger");
void _admin;

async function executePayout(payoutDoc) {
  // payoutDoc should have: id, userId, amount, payee: { paypalEmail }
  const data = payoutDoc.data();
  if (!data) throw new Error("Invalid payout doc");
  if (!data.payee || !data.payee.paypalEmail) throw new Error("Missing payee.paypalEmail");

  const amount = Number(data.amount || 0).toFixed(2);
  const receiver = data.payee.paypalEmail;

  try {
    if (!process.env.PAYOUTS_ENABLED || process.env.PAYOUTS_ENABLED !== "true") {
      // Keep it dry-run when not enabled
      return { success: true, mock: true, message: "Payouts disabled, dry run" };
    }

    // Use our lightweight simple implementation
    const result = await paypalSimple.createPayoutBatch({
      items: [
        {
          receiver,
          amount,
          currency: "USD",
          note: "AutoPromote Earnings Payout",
        },
      ],
    });

    const batchId = result.batch_header && result.batch_header.payout_batch_id;

    // Update payout doc
    await db
      .collection("payouts")
      .doc(payoutDoc.id)
      .update({
        status: "completed",
        externalBatchId: batchId || null,
        externalResponse: result,
        processedAt: new Date().toISOString(),
      });

    // Create a payout event
    await db.collection("earnings_events").add({
      userId: data.userId,
      type: "payout_processed",
      payoutId: payoutDoc.id,
      amount: data.amount,
      method: "paypal",
      createdAt: new Date().toISOString(),
    });

    return { success: true, result };
  } catch (error) {
    logger.error("[PayPalPayout] error executing payout", { error: error.message });
    await db
      .collection("payouts")
      .doc(payoutDoc.id)
      .update({
        status: "failed",
        error: error && error.message,
        failedAt: new Date().toISOString(),
      });
    return { success: false, error: error.message };
  }
}

async function processPendingPayouts(limit = 20) {
  const pendingSnap = await db
    .collection("payouts")
    .where("status", "==", "pending")
    .limit(limit)
    .get();
  if (pendingSnap.empty) return { processed: 0 };
  let processed = 0;
  for (const doc of pendingSnap.docs) {
    try {
      // mark processing
      await db
        .collection("payouts")
        .doc(doc.id)
        .update({ status: "processing", processingAt: new Date().toISOString() });
      await executePayout(doc);
      processed++;
    } catch (e) {
      console.error("[PayPalPayout] processing payout failed for", doc.id, e && e.message);
    }
  }
  return { processed };
}

module.exports = { executePayout, processPendingPayouts };
