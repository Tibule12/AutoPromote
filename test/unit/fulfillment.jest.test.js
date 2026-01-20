process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || "1";

const { db } = require("../../src/firebaseAdmin");
const { fulfillPayment } = require("../../src/services/payments/fulfillmentService");

describe("fulfillmentService.fulfillPayment", () => {
  test("credits user and signs ledger for ad_credits purchase", async () => {
    const paymentId = `test_pf_${Date.now()}`;
    const userId = `test_user_${Date.now()}`;

    // Prepare payment draft
    await db.collection("payments").doc(paymentId).set({
      provider: "payfast",
      m_payment_id: paymentId,
      amount: "5.00",
      currency: "ZAR",
      status: "pending",
      metadata: { type: "ad_credits", userId, amount: 5.0 },
      createdAt: new Date().toISOString(),
    });

    // Simulate IPN indicating COMPLETE
    const ipn = { m_payment_id: paymentId, payment_status: "COMPLETE", amount: "5.00" };

    const res = await fulfillPayment(paymentId, ipn);
    expect(res).toBeDefined();
    expect(res.ok).toBe(true);

    const p = await db.collection("payments").doc(paymentId).get();
    expect(p.exists).toBe(true);
    const pd = p.data();
    expect(pd.fulfilled).toBe(true);
    expect(pd.fulfillmentResult).toBeDefined();

    const u = await db.collection("users").doc(userId).get();
    expect(u.exists).toBe(true);
    const ud = u.data();
    expect(ud.adCredits).toBeGreaterThanOrEqual(5.0);

    // Check usage_ledger for signed entry (_sig present)
    const ledgerSnap = await db.collection("usage_ledger").where("type", "==", "ad_credit_purchase").get();
    const found = ledgerSnap.docs.find(d => d.data().userId === String(userId));
    expect(found).toBeDefined();
    expect(found.data()._sig).toBeDefined();
  }, 20000);

  test("is idempotent: second call does not duplicate ledger entry", async () => {
    const paymentId = `idem_pf_${Date.now()}`;
    const userId = `idem_user_${Date.now()}`;

    await db.collection("payments").doc(paymentId).set({
      provider: "payfast",
      m_payment_id: paymentId,
      amount: "3.00",
      currency: "ZAR",
      status: "pending",
      metadata: { type: "ad_credits", userId, amount: 3.0 },
      createdAt: new Date().toISOString(),
    });

    const ipn = { m_payment_id: paymentId, payment_status: "COMPLETE", amount: "3.00" };

    const first = await fulfillPayment(paymentId, ipn);
    expect(first).toBeDefined();
    expect(first.ok).toBe(true);

    const ledgerSnap1 = await db.collection('usage_ledger').where('type', '==', 'ad_credit_purchase').get();
    const found1 = ledgerSnap1.docs.find(d => (d.data().meta && d.data().meta.paymentId) === paymentId);
    expect(found1).toBeDefined();

    const second = await fulfillPayment(paymentId, ipn);
    expect(second).toBeDefined();
    // second call should indicate already fulfilled (idempotent)
    expect(second.alreadyFulfilled || second.fulfilled === false || second.ok).toBeTruthy();

    const ledgerSnap2 = await db.collection('usage_ledger').where('type', '==', 'ad_credit_purchase').get();
    const found2 = ledgerSnap2.docs.filter(d => (d.data().meta && d.data().meta.paymentId) === paymentId);
    expect(found2.length).toBe(1);
  }, 20000);
});
