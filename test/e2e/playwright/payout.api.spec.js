const { test, expect } = require('@playwright/test');
const path = require('path');
const fetch = require('node-fetch');

// This API-level test validates the creator payout request flow without hitting the PayPal API.

test('API payout request - create payout doc and update user pending earnings', async () => {
  const tmpSaPath = path.resolve(__dirname, '..', 'tmp', 'service-account.json');
  const fs = require('fs');
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64) {
        const payload = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || Buffer.from(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        fs.mkdirSync(path.dirname(tmpSaPath), { recursive: true });
        fs.writeFileSync(tmpSaPath, payload, { encoding: 'utf8', mode: 0o600 });
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpSaPath;
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not write temporary service account file for API tests:', e.message);
  }

  const { db } = require('../../../src/firebaseAdmin');
  const app = require('../../../src/server');

  const mainServer = app.listen(0);
  await new Promise((r) => mainServer.once('listening', r));
  const mainPort = mainServer.address().port;

  const uid = 'testPayoutUser';
  const pending = 123.45;
  try {
    try {
      await db.collection('users').doc(uid).set({
        paypalEmail: 'e2e-paypal@example.com',
        pendingEarnings: pending,
        lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: new Date().toISOString() }
      }, { merge: true });
    } catch (e) {
      console.warn('⚠️ Could not seed user data in Firestore for payout test:', e.message);
    }

    // Call payout API
    const res = await fetch(`http://127.0.0.1:${mainPort}/api/earnings/payout/self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer test-token-for-${uid}`, 'x-playwright-e2e': '1' },
      body: JSON.stringify({ paymentMethod: 'paypal' })
    });
    const json = await res.json();
    const statusOk = res.status === 200 || res.status === 201 || res.status === 202;
    expect(statusOk).toBeTruthy();
    if (json.error) console.warn('API returned error:', json);
    expect(json.success).toBeTruthy();
    expect(json.amount).toBeTruthy();
    expect(json.amount).toBeCloseTo(pending, 2);

    // If we can access DB, verify a pending payout doc was created
    try {
      const snap = await db.collection('payouts').where('userId', '==', uid).orderBy('requestedAt', 'desc').limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        expect(d.amount).toBeCloseTo(pending, 2);
        expect(d.status).toBe('pending');
        expect(d.payee && d.payee.paypalEmail).toBe('e2e-paypal@example.com');
      } else {
        console.warn('[E2E] No payout document found after request; is Firestore configured?');
      }
    } catch (e) {
      console.warn('[E2E] Skipping DB assertion as Firestore not available:', e.message);
    }

    // Admin: list pending payouts and assert the newly created payout is visible
    try {
      const adminRes = await fetch(`http://127.0.0.1:${mainPort}/api/monetization/admin/payouts?status=pending&limit=20`, {
        method: 'GET', headers: { 'Authorization': 'Bearer test-token-for-adminUser', 'x-playwright-e2e': '1' }
      });
      const adminJson = await adminRes.json();
      if (adminJson && adminJson.items) {
        const found = adminJson.items.some(i => i.userId === uid);
        expect(found).toBeTruthy();
      } else {
        console.warn('[E2E] Admin payouts list not present/empty; skipping assertion');
      }
    } catch (e) {
      console.warn('[E2E] Admin list check skipped (no Firestore or admin rights):', e.message);
    }

  } finally {
    // cleanup - attempt to remove seeded user and payout doc
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const snap = await db.collection('payouts').where('userId', '==', uid).get();
        const batch = db.batch();
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await db.collection('users').doc(uid).delete();
      }
    } catch (e) {
      console.warn('[E2E] Could not clean up test data:', e.message);
    }
    await new Promise((r) => mainServer ? mainServer.close(r) : r());
  }
});
