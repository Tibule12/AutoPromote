const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
const {
  verifiedSubscription,
  persistVerifiedSubscription,
  persistSubscriptionEnd,
  verifyPayPalWebhook,
} = require("../../src/services/payments/subscriptionVerification");
const db = createSandboxDatabase();
const env = { PAYPAL_PLUS_PLAN_ID: "P-PLUS", PAYPAL_PRO_PLAN_ID: "P-OLD" };
const now = Date.parse("2026-11-26T08:00:00Z");
function fixture() {
  const uid = "owner-" + crypto.randomUUID();
  const id = "I-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  return {
    db,
    userId: uid,
    subscriptionId: id,
    env,
    now,
    intent: { userId: uid, planId: "plus" },
    paypalSub: {
      id,
      status: "ACTIVE",
      plan_id: "P-PLUS",
      custom_id: uid,
      create_time: new Date(now - 86400000).toISOString(),
      billing_info: {
        next_billing_time: new Date(now + 30 * 86400000).toISOString(),
        last_payment: {
          time: new Date(now - 10000).toISOString(),
          amount: { currency_code: "USD", value: "4.99" },
        },
      },
    },
  };
}
function verify(f) {
  return verifiedSubscription({ ...f, remote: f.paypalSub });
}
after(async () => db.terminate());
test("approval alone, missing payment, wrong amount, currency and expired agreement cannot activate Plus", () => {
  for (const change of [
    r => {
      r.status = "APPROVED";
    },
    r => {
      delete r.billing_info.last_payment;
    },
    r => {
      r.billing_info.last_payment.amount.value = "0.01";
    },
    r => {
      r.billing_info.last_payment.amount.currency_code = "ZAR";
    },
    r => {
      r.billing_info.next_billing_time = new Date(now - 1).toISOString();
    },
    r => {
      r.billing_info.last_payment.time = new Date(now - 60 * 86400000).toISOString();
    },
  ]) {
    const f = fixture();
    change(f.paypalSub);
    assert.throws(() => verify(f));
  }
});
test("ownership, configured plan and actual provider ID bind activation; client plan selection is irrelevant", () => {
  for (const change of [
    f => {
      f.paypalSub.custom_id = "another-user";
    },
    f => {
      f.intent.userId = "another-user";
    },
    f => {
      f.paypalSub.plan_id = "UNRECOGNIZED";
    },
    f => {
      delete f.intent;
      delete f.paypalSub.custom_id;
    },
    f => {
      f.paypalSub.id = "I-ANOTHER";
    },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => verify(f));
  }
});
test("payment replay is idempotent and one agreement cannot be claimed by another account", async () => {
  const f = fixture();
  await persistVerifiedSubscription(f);
  const firstVerified=(await db.collection('user_subscriptions').doc(f.userId).get()).data().verifiedAt;
  await persistVerifiedSubscription({...f,now:f.now+5000});
  assert.equal((await db.collection('user_subscriptions').doc(f.userId).get()).data().verifiedAt,firstVerified,'same paid event does not rewrite unchanged subscription state');
  const events = await db
    .collection("subscription_events")
    .where("subscriptionId", "==", f.subscriptionId)
    .get();
  assert.equal(events.size, 1);
  const malicious = {
    ...f,
    userId: "attacker",
    intent: { userId: "attacker", planId: "plus" },
    paypalSub: { ...f.paypalSub, custom_id: "attacker" },
  };
  await assert.rejects(persistVerifiedSubscription(malicious), {
    code: "SUBSCRIPTION_ALREADY_CLAIMED",
  });
});
test("an owner-superseded unpaid checkout cannot activate even after a late approval", async () => {
  const f = fixture();
  f.intent.status = "superseded";
  await assert.rejects(persistVerifiedSubscription(f), { code: "CHECKOUT_SUPERSEDED" });
  assert.equal((await db.collection("user_subscriptions").doc(f.userId).get()).exists, false);
  assert.equal((await db.collection("paypal_subscription_claims").doc(f.subscriptionId).get()).exists, false);
});
test("cancellation retains the paid period; suspension and expiry revoke it; stale agreement cannot cancel a replacement", async () => {
  const f = fixture();
  await persistVerifiedSubscription(f);
  const ended = await persistSubscriptionEnd({ ...f, status: "CANCELLED", eventId: "end" });
  assert.equal(ended.expiresAt, f.paypalSub.billing_info.next_billing_time);
  await persistSubscriptionEnd({ ...f, status: "SUSPENDED", eventId: "suspend" });
  assert.equal(
    (await db.collection("user_billing").doc(f.userId).get()).data().expiresAt,
    new Date(now).toISOString()
  );
  await assert.rejects(
    persistSubscriptionEnd({ ...f, subscriptionId: "I-OLD", status: "CANCELLED", eventId: "late" }),
    { code: "STALE_SUBSCRIPTION" }
  );
});
test("webhook authenticity depends on PayPal verification, fails closed and sends the full event", async () => {
  const headers = Object.fromEntries(
    ["auth-algo", "cert-url", "transmission-id", "transmission-sig", "transmission-time"].map(k => [
      "paypal-" + k,
      "test",
    ])
  );
  const event = { id: "WH-ONE", event_type: "BILLING.SUBSCRIPTION.ACTIVATED" };
  const args = { headers, event, webhookId: "WH-CONFIG", accessToken: "test", mode: "sandbox" };
  assert.equal(
    await verifyPayPalWebhook({
      ...args,
      fetchImpl: async (url, request) => {
        assert.equal(
          url,
          "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature"
        );
        assert.deepEqual(JSON.parse(request.body).webhook_event, event);
        return { ok: true, json: async () => ({ verification_status: "SUCCESS" }) };
      },
    }),
    true
  );
  assert.equal(
    await verifyPayPalWebhook({
      ...args,
      fetchImpl: async () => ({ ok: true, json: async () => ({ verification_status: "FAILURE" }) }),
    }),
    false
  );
  assert.equal(await verifyPayPalWebhook({ ...args, headers: {} }), false);
});
test("client SDK cannot edit balances, subscriptions, token ledger or claim ownership, including admin client token ledger access", async () => {
  const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
  const { doc, setDoc } = require("firebase/firestore");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const environment = await initializeTestEnvironment({
    projectId: "demo-autopromote-credits",
    firestore: { host, port: Number(port) },
  });
  try {
    for (const user of ["normal-user", "bf04dPKELvVMivWoUyLsAVyw2sg2"]) {
      const client = environment.authenticatedContext(user, { email_verified: true }).firestore();
      for (const collection of [
        "processing_accounts",
        "processing_control",
        "processing_jobs",
        "processing_events",
        "processing_topup_orders",
        "processing_topup_sessions",
        "processing_topup_captures",
        "paypal_subscription_claims",
      ]) {
        await assertFails(
          setDoc(doc(client, collection, user), { balance: 999999, enabled: true })
        );
      }
    }
    const client = environment
      .authenticatedContext("normal-user", { email_verified: true })
      .firestore();
    await assertFails(
      setDoc(doc(client, "user_billing", "normal-user"), {
        tier: "plus",
        status: "active",
        paymentVerified: true,
      })
    );
    await assertFails(
      setDoc(doc(client, "users", "normal-user"), { credits: 999999, subscriptionTier: "plus" })
    );
  } finally {
    await environment.cleanup();
  }
});
test('Plus checkout rejects foreign currency, wrong interval and setup fees before any approval link', () => {
  const {validatePlusPlanDefinition}=require('../../src/services/payments/subscriptionVerification');
  const plan={status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{currency_code:'USD',value:'4.99'}}}]};
  validatePlusPlanDefinition(plan);
  for(const mutate of [p=>p.billing_cycles[0].pricing_scheme.fixed_price.currency_code='ZAR',p=>p.billing_cycles[0].frequency.interval_unit='YEAR',p=>p.payment_preferences={setup_fee:{value:'5'}},p=>p.billing_cycles[0].total_cycles=12,p=>p.taxes={percentage:'15'},p=>p.quantity_supported=true,p=>p.payment_preferences={auto_bill_outstanding:true}]) {
    const p=structuredClone(plan);mutate(p);assert.throws(()=>validatePlusPlanDefinition(p),{code:'PAYPAL_PLUS_TERMS_MISMATCH'});
  }
});
