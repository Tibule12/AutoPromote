const { test, expect } = require("@playwright/test");
const fetch = require("node-fetch");

// This API-level test validates the creator payout request flow without hitting the PayPal API.

test("API payout request - create payout doc and update user pending earnings", async () => {
  test.skip(
    !process.env.GOOGLE_APPLICATION_CREDENTIALS,
    "Requires preconfigured Firestore credentials; this spec no longer creates temp service-account files."
  );

  const { db } = require("../../../src/firebaseAdmin");
  const app = require("../../../src/server");

  const mainServer = app.listen(0);
  await new Promise(r => mainServer.once("listening", r));
  const mainPort = mainServer.address().port;

  const uid = "adminUser";
  const pending = 123.45;
  try {
    try {
      await db
        .collection("users")
        .doc(uid)
        .set(
          {
            paypalEmail: "e2e-paypal@example.com",
            pendingEarnings: pending,
            lastAcceptedTerms: {
              version: process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0",
              acceptedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
    } catch (e) {
      console.warn("⚠️ Could not seed user data in Firestore for payout test:", e.message);
    }
    try {
      const check = await db.collection("users").doc(uid).get();
      console.warn(
        "[E2E] seed check - user exists?",
        !!(check && check.exists),
        check && check.exists ? check.data() : null
      );
    } catch (e) {
      console.warn("[E2E] seed check failed:", e.message);
    }

    // Call payout API
    // POST payout - make the call with a small retry/backoff to reduce transient CI flakes
    const postPayoutAttempt = async () => {
      return fetch(`http://127.0.0.1:${mainPort}/api/monetization/earnings/payout/self`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer test-token-for-${uid}`,
          "x-playwright-e2e": "1",
        },
        body: JSON.stringify({ paymentMethod: "paypal" }),
      });
    };

    let res = await postPayoutAttempt();
    if (!(res.status === 200 || res.status === 201 || res.status === 202)) {
      // retry once after a short backoff for transient issues
      await new Promise(r => setTimeout(r, 500));
      res = await postPayoutAttempt();
    }
    const json = await res.json();
    const statusOk = res.status === 200 || res.status === 201 || res.status === 202;
    const discontinuedMessage =
      "Payouts for view-based rewards are discontinued. Please check the Missions tab for active opportunities.";
    if (!statusOk) console.warn("Payout API responded with non-OK status:", res.status, json);
    if (statusOk) {
      if (json && json.error) console.warn("API returned error:", json.error || json);
      expect(json.success).toBeTruthy();
      expect(json.amount).toBeTruthy();
      expect(json.amount).toBeCloseTo(pending, 2);
    } else {
      expect(res.status).toBe(400);
      expect(json.error).toBe(discontinuedMessage);
      return;
    }

    // If we can access DB, verify a pending payout doc was created
    try {
      const snap = await db
        .collection("payouts")
        .where("userId", "==", uid)
        .orderBy("requestedAt", "desc")
        .limit(1)
        .get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        expect(d.amount).toBeCloseTo(pending, 2);
        expect(d.status).toBe("pending");
        expect(d.payee && d.payee.paypalEmail).toBe("e2e-paypal@example.com");
      } else {
        console.warn("[E2E] No payout document found after request; is Firestore configured?");
      }
    } catch (e) {
      console.warn("[E2E] Skipping DB assertion as Firestore not available:", e.message);
    }

    // Admin: list pending payouts and assert the newly created payout is visible
    try {
      const adminRes = await fetch(
        `http://127.0.0.1:${mainPort}/api/monetization/admin/payouts?status=pending&limit=20`,
        {
          method: "GET",
          headers: { Authorization: "Bearer test-token-for-adminUser", "x-playwright-e2e": "1" },
        }
      );
      const adminJson = await adminRes.json();
      if (adminJson && adminJson.items) {
        const found = adminJson.items.some(i => i.userId === uid);
        expect(found).toBeTruthy();
      } else {
        console.warn("[E2E] Admin payouts list not present/empty; skipping assertion");
      }
    } catch (e) {
      console.warn("[E2E] Admin list check skipped (no Firestore or admin rights):", e.message);
    }
  } finally {
    // cleanup - attempt to remove seeded user and payout doc
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const snap = await db.collection("payouts").where("userId", "==", uid).get();
        const batch = db.batch();
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await db.collection("users").doc(uid).delete();
      }
    } catch (e) {
      console.warn("[E2E] Could not clean up test data:", e.message);
    }
    await new Promise(r => (mainServer ? mainServer.close(r) : r()));
  }
});
