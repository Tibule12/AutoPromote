// test-payfast-provider.js
// Quick local test for PayFast provider createOrder and verifyNotification
process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || "1";
process.env.PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "33168055";
process.env.PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "moighyqtsdkng";
process.env.PAYFAST_MODE = process.env.PAYFAST_MODE || "sandbox";
process.env.PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "Auto.promote.secure.2026";
process.env.PAYFAST_NOTIFY_URL = process.env.PAYFAST_NOTIFY_URL || "https://api.autopromote.org/payment/itn";

(async function(){
  try{
    const { PayFastProvider } = require('../src/services/payments/payfastProvider');
    const prov = new PayFastProvider();

    console.log('Creating order...');
    // Include metadata so webhook fulfillment can credit ad credits
    const testUserId = 'testUser123';
    const orderRes = await prov.createOrder({
      amount: 9.99,
      metadata: { item_name: 'Test payment', type: 'ad_credits', userId: testUserId, amount: 9.99 },
    });
    console.log('Order result:', orderRes);

    // Simulate IPN body (copy params used to build signature)
    const params = { ...orderRes.order.params };
    // PayFast would post back with pf_payment_id and payment_status etc — simulate minimal
    const ipn = {
      merchant_id: params.merchant_id,
      merchant_key: params.merchant_key,
      m_payment_id: params.m_payment_id,
      pf_payment_id: '100200300',
      payment_status: 'COMPLETE',
      amount: params.amount,
      item_name: params.item_name,
    };

    // Compute signature using exported helper
    const { buildPayfastSignature } = require('../src/services/payments/payfastProvider');
    const sig = buildPayfastSignature(ipn, process.env.PAYFAST_PASSPHRASE);
    ipn.signature = sig; 

    // Simulate express request
    const fakeReq = { body: ipn };
    console.log('Simulated IPN:', ipn);

    const ver = await prov.verifyNotification(fakeReq);
    console.log('IPN verification result:', ver);

    // Inspect persisted payment and user record in in-memory DB and call shared fulfillment
    try {
      const { db } = require('../src/firebaseAdmin');
      const pid = ipn.m_payment_id;
      console.log('Payment doc before fulfillment:', (await db.collection('payments').doc(pid).get()).data());
      const { fulfillPayment } = require('../src/services/payments/fulfillmentService');
      const resFulfill = await fulfillPayment(pid, ver && ver.data ? ver.data : {});
      console.log('fulfillPayment result:', resFulfill);
      const userSnap = await db.collection('users').doc(testUserId).get().catch(()=>null);
      console.log('User doc:', userSnap && userSnap.exists ? userSnap.data() : null);
      const paySnap2 = await db.collection('payments').doc(pid).get().catch(()=>null);
      console.log('Payment doc after fulfillment:', paySnap2 && paySnap2.exists ? paySnap2.data() : null);
    } catch (e) {
      console.warn('Failed to read back persisted records:', e && e.message);
    }
  }catch(e){
    console.error(e);
    process.exit(1);
  }
})();
