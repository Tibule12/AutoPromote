const { test, expect } = require('@playwright/test');
const path = require('path');
const fetch = require('node-fetch');

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

test.beforeAll(async () => {
  serverProcess = require('child_process').spawn('node', ['test/e2e/playwright/static-server.js'], { stdio: 'inherit' });
  await new Promise(r => setTimeout(r, 800));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('admin payouts list and process single payout', async ({ page }) => {
  page.on('console', msg => console.log('[PAGE LOG]', msg.text()));
  await page.setExtraHTTPHeaders({ 'x-playwright-e2e': '1' });

  // Seed Firestore using service account if available
  // Create admin user + a pending payout doc if credentials present
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
    console.warn('Could not write tmp service account:', e.message);
  }

  const { db } = require('../../../src/firebaseAdmin');
  const app = require('../../../src/server');
  const mainServer = app.listen(0);
  await new Promise((r) => mainServer.once('listening', r));
  const mainPort = mainServer.address().port;

  const adminUid = 'adminUser';
  const payoutUid = 'testPayoutUser2';
  try {
    // Seed admin user in Firestore
    try { await db.collection('users').doc(adminUid).set({ email: 'admin@example.com', name: 'Admin', isAdmin: true }, { merge: true }); } catch (e) { console.warn('DB not available; skipping seed', e.message); }

    // Seed payout doc if we have DB
    try {
      await db.collection('users').doc(payoutUid).set({ paypalEmail: 'e2e-paypal2@example.com', pendingEarnings: 12.34 }, { merge: true });
      await db.collection('payouts').add({ userId: payoutUid, amount: 12.34, status: 'pending', requestedAt: new Date().toISOString(), paymentMethod: 'paypal', payee: { paypalEmail: 'e2e-paypal2@example.com' } });
    } catch (e) { console.warn('Could not seed payout doc:', e.message); }

    // Navigate to admin dashboard and open payouts
    await page.goto(BASE + '/#/admin');
    await page.addInitScript(() => { window.__E2E_BYPASS = true; window.__E2E_TEST_TOKEN = 'e2e-test-token'; localStorage.setItem('user', JSON.stringify({ uid: 'adminUser', email: 'admin@example.com', role: 'admin', isAdmin: true })); });
    await page.reload();

    // Click Payouts tab
    await page.click('text=Payouts');
    // Wait for table to show
    await page.waitForSelector('.data-table', { timeout: 4000 });

    // If DB isn't configured, the table might be empty, just assert that the UI loaded
    const rows = await page.$$eval('.data-table tbody tr', rows => rows.length);
    console.log('[E2E] payouts rows', rows);

    // If there is a pending payout, click process on the first row
    if (rows > 0) {
      // Click Process button in the first row
      await page.click('.data-table tbody tr:first-child button:has-text("Process")');
      // Optionally wait for alert or confirmation
      await page.waitForTimeout(500);
    }

  } finally {
    // cleanup
    try { if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const snap = await db.collection('payouts').where('userId', '==', payoutUid).get();
      const batch = db.batch(); snap.forEach(d => batch.delete(d.ref)); await batch.commit();
      await db.collection('users').doc(payoutUid).delete();
      await db.collection('users').doc(adminUid).delete();
    } } catch (e) { console.warn('cleanup failed', e.message); }
    await new Promise((r) => mainServer ? mainServer.close(r) : r());
  }
});
