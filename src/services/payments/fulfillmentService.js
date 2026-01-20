const { db, admin } = require("../../firebaseAdmin");
const { recordUsage } = require("../usageLedgerService");
const { attachSignature } = require("../../utils/docSigner");

async function fulfillPayment(paymentId, ipnData = {}) {
  if (!paymentId) return { ok: false, reason: "missing_payment_id" };
  const paymentRef = db.collection("payments").doc(String(paymentId));

  // Prefer to use a Firestore transaction for atomic idempotent updates when available
  if (db.runTransaction && typeof db.runTransaction === "function") {
    const txResult = await db.runTransaction(async tx => {
      const snap = await tx.get(paymentRef);
      if (!snap.exists) return { ok: false, reason: "payment_not_found" };
      const payment = snap.data() || {};
      if (payment.fulfilled) return { ok: true, alreadyFulfilled: true };

      // Determine whether the IPN indicates completion
      const statusFromIpn =
        ipnData && ipnData.payment_status ? String(ipnData.payment_status) : null;
      const statusFromDoc = payment.status || (payment.raw && payment.raw.payment_status) || null;
      const status = (statusFromIpn || statusFromDoc || "").toString();
      const wasCompleted =
        String(status).toLowerCase() === "completed" || String(status).toUpperCase() === "COMPLETE";

      if (!wasCompleted) {
        // mark verified/updated but do not fulfill
        tx.set(paymentRef, { updatedAt: new Date().toISOString() }, { merge: true });
        return { ok: true, fulfilled: false };
      }

      // Prepare fulfillment payload
      const meta = payment.metadata || (payment.params && payment.params.metadata) || {};
      const purchaseType = (meta && meta.type) || null;

      // Perform user credit updates inside transaction when possible
      if (purchaseType === "ad_credits" && meta.userId) {
        const userRef = db.collection("users").doc(String(meta.userId));
        const amt =
          Number(meta.amount || payment.amount || (payment.params && payment.params.amount) || 0) ||
          0;
        if (amt > 0) {
          try {
            if (
              admin &&
              admin.firestore &&
              typeof admin.firestore.FieldValue.increment === "function"
            ) {
              tx.set(
                userRef,
                { adCredits: admin.firestore.FieldValue.increment(amt) },
                { merge: true }
              );
            } else {
              const userSnap = await tx.get(userRef);
              const cur =
                userSnap.exists && Number(userSnap.data().adCredits)
                  ? Number(userSnap.data().adCredits)
                  : 0;
              tx.set(userRef, { adCredits: cur + amt }, { merge: true });
            }
          } catch (e) {}
        }
      }

      // Mark payment fulfilled
      tx.set(
        paymentRef,
        {
          fulfilled: true,
          fulfilledAt: new Date().toISOString(),
          fulfillmentResult: { purchaseType: purchaseType || null, ipn: ipnData },
        },
        { merge: true }
      );

      return { ok: true, fulfilled: true };
    });

    // If fulfilled, record ledger entry outside transaction (best-effort)
    try {
      if (txResult && txResult.fulfilled) {
        const snap = await db
          .collection("payments")
          .doc(String(paymentId))
          .get()
          .catch(() => null);
        const paymentDoc = snap && snap.exists ? snap.data() : null;
        const meta =
          (paymentDoc &&
            (paymentDoc.metadata || (paymentDoc.params && paymentDoc.params.metadata))) ||
          {};
        if (meta && meta.type === "ad_credits" && meta.userId) {
          const amt = Number(meta.amount || paymentDoc.amount || 0) || 0;
          try {
            // Create signed ledger entry for auditability
            const ledgerDoc = {
              type: "ad_credit_purchase",
              userId: String(meta.userId),
              amount: amt,
              currency: paymentDoc.currency || "ZAR",
              meta: { provider: "payfast", paymentId },
              createdAt:
                admin &&
                admin.firestore &&
                admin.firestore.FieldValue &&
                admin.firestore.FieldValue.serverTimestamp
                  ? admin.firestore.FieldValue.serverTimestamp()
                  : new Date().toISOString(),
            };
            const signed = attachSignature(ledgerDoc);
            await db
              .collection("usage_ledger")
              .add(signed)
              .catch(() => {});
          } catch (_) {}
        }
      }
    } catch (_) {}

    return txResult;
  }

  // Fallback for environments without transactions (e.g., in-memory DB used for tests)
  try {
    const snap = await paymentRef.get().catch(() => null);
    if (!snap || !snap.exists) return { ok: false, reason: "payment_not_found" };
    const payment = snap.data() || {};
    if (payment.fulfilled) return { ok: true, alreadyFulfilled: true };

    const statusFromIpn = ipnData && ipnData.payment_status ? String(ipnData.payment_status) : null;
    const statusFromDoc = payment.status || (payment.raw && payment.raw.payment_status) || null;
    const status = (statusFromIpn || statusFromDoc || "").toString();
    const wasCompleted =
      String(status).toLowerCase() === "completed" || String(status).toUpperCase() === "COMPLETE";
    if (!wasCompleted) {
      await paymentRef.set({ updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true, fulfilled: false };
    }

    const meta = payment.metadata || (payment.params && payment.params.metadata) || {};
    const purchaseType = (meta && meta.type) || null;
    if (purchaseType === "ad_credits" && meta.userId) {
      const userRef = db.collection("users").doc(String(meta.userId));
      const amt = Number(meta.amount || payment.amount || 0) || 0;
      try {
        if (
          admin &&
          admin.firestore &&
          typeof admin.firestore.FieldValue.increment === "function"
        ) {
          await userRef.set(
            { adCredits: admin.firestore.FieldValue.increment(amt) },
            { merge: true }
          );
        } else {
          const uSnap = await userRef.get().catch(() => null);
          const cur =
            uSnap && uSnap.exists && Number(uSnap.data().adCredits)
              ? Number(uSnap.data().adCredits)
              : 0;
          await userRef.set({ adCredits: cur + amt }, { merge: true });
        }
      } catch (e) {}
    }

    await paymentRef.set(
      {
        fulfilled: true,
        fulfilledAt: new Date().toISOString(),
        fulfillmentResult: { purchaseType: purchaseType || null, ipn: ipnData },
      },
      { merge: true }
    );

    // ledger
    try {
      const paymentDoc = (await paymentRef.get().catch(() => null)).data();
      const meta2 =
        (paymentDoc &&
          (paymentDoc.metadata || (paymentDoc.params && paymentDoc.params.metadata))) ||
        {};
      if (meta2 && meta2.type === "ad_credits" && meta2.userId) {
        const amt = Number(meta2.amount || paymentDoc.amount || 0) || 0;
        try {
          const ledgerDoc = {
            type: "ad_credit_purchase",
            userId: String(meta2.userId),
            amount: amt,
            currency: paymentDoc.currency || "ZAR",
            meta: { provider: "payfast", paymentId },
            createdAt:
              admin &&
              admin.firestore &&
              admin.firestore.FieldValue &&
              admin.firestore.FieldValue.serverTimestamp
                ? admin.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString(),
          };
          const signed = attachSignature(ledgerDoc);
          await db
            .collection("usage_ledger")
            .add(signed)
            .catch(() => {});
        } catch (_) {}
      }
    } catch (_) {}

    return { ok: true, fulfilled: true };
  } catch (e) {
    return { ok: false, reason: e && e.message };
  }
}

module.exports = { fulfillPayment };
