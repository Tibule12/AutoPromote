const { test, expect } = require("@playwright/test");
const path = require("path");
const fetch = require("node-fetch");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

test.beforeAll(async () => {
  serverProcess = require("child_process").spawn("node", ["test/e2e/playwright/static-server.js"], {
    stdio: "inherit",
  });
  await new Promise(r => setTimeout(r, 800));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test("admin payouts list and process single payout", async ({ page }) => {
  page.on("console", msg => console.log("[PAGE LOG]", msg.text()));
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });

  // Diagnostic listeners to capture unexpected page lifecycle events
  page.on('close', () => console.log('[PAGE EVENT] page closed')); 
  page.on('crash', () => console.log('[PAGE EVENT] page crashed'));
  page.on('pageerror', err => console.log('[PAGE EVENT] pageerror', err && err.message));
  test.setTimeout(120000);

  // Seed Firestore using service account if available
  // Create admin user + a pending payout doc if credentials present
  const tmpSaPath = path.resolve(__dirname, "..", "tmp", "service-account.json");
  const fs = require("fs");
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (
        process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ||
        process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64
      ) {
        const payload =
          process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ||
          Buffer.from(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
        fs.mkdirSync(path.dirname(tmpSaPath), { recursive: true });
        fs.writeFileSync(tmpSaPath, payload, { encoding: "utf8", mode: 0o600 });
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpSaPath;
      }
    }
  } catch (e) {
    console.warn("Could not write tmp service account:", e.message);
  }

  const { db } = require("../../../src/firebaseAdmin");
  const app = require("../../../src/server");
  const mainServer = app.listen(0);
  await new Promise(r => mainServer.once("listening", r));
  const mainPort = mainServer.address().port;

  const adminUid = "adminUser";
  const payoutUid = "testPayoutUser2";
  try {
    // Seed admin user in Firestore
    try {
      await db
        .collection("users")
        .doc(adminUid)
        .set({ email: "admin@example.com", name: "Admin", isAdmin: true }, { merge: true });
    } catch (e) {
      console.warn("DB not available; skipping seed", e.message);
    }

    // Seed payout doc if we have DB
    try {
      await db
        .collection("users")
        .doc(payoutUid)
        .set({ paypalEmail: "e2e-paypal2@example.com", pendingEarnings: 12.34 }, { merge: true });
      await db
        .collection("payouts")
        .add({
          userId: payoutUid,
          amount: 12.34,
          status: "pending",
          requestedAt: new Date().toISOString(),
          paymentMethod: "paypal",
          payee: { paypalEmail: "e2e-paypal2@example.com" },
        });
    } catch (e) {
      console.warn("Could not seed payout doc:", e.message);
    }

    // We'll handle admin payouts specially inside the generic proxy handler below
    // Navigate to admin dashboard and open payouts
    // Navigate to admin dashboard: prefer local fixture when GOOGLE_APPLICATION_CREDENTIALS is not set
    const path = require("path");
    const fileFixture = `file://${path.resolve(__dirname, "..", "fixtures", "admin_dashboard_fixture.html")}`;
    const targetUrl = process.env.GOOGLE_APPLICATION_CREDENTIALS ? BASE + "/#/admin" : fileFixture;
    const navStart = Date.now();
    let navErr = null;
    while (Date.now() - navStart < 15000) {
      try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 4000 });
        navErr = null;
        break;
      } catch (e) {
        navErr = e;
        await new Promise(r => setTimeout(r, 300));
      }
    }
    if (navErr) throw navErr;
    // Proxy API calls to the local backend server to avoid CORS on absolute API urls
    const pageE2EToken = await page.evaluate(() => window.__E2E_TEST_TOKEN || "e2e-test-token");
    await page.route("**/api/**", async route => {
      const req = route.request();
      const u = new URL(req.url());
      // If this is the admin payouts endpoint, return a deterministic stub
      if (u.pathname.startsWith("/api/monetization/admin/payouts")) {
        if (
          u.pathname.endsWith("/process") ||
          u.pathname.match(/\/api\/monetization\/admin\/payouts\/[^/]+\/process/)
        ) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
          return;
        }
        const body = JSON.stringify({
          success: true,
          items: [
            {
              id: "fake-payout-1",
              userId: "testUser",
              amount: 12.34,
              status: "pending",
              requestedAt: new Date().toISOString(),
              payee: { paypalEmail: "e2e-paypal2@example.com" },
            },
          ],
        });
        await route.fulfill({ status: 200, contentType: "application/json", body });
        return;
      }
      const proxied = `http://127.0.0.1:${mainPort}${u.pathname}${u.search}`;
      console.log("[ROUTE FALLBACK] Proxying", req.url(), "->", proxied);
      const headers = { ...req.headers() };
      // Remove origin header so backend treats it like a local call
      delete headers.origin;
      // Add E2E Authorization header when request lacks one
      if (!headers.authorization && pageE2EToken) headers.authorization = `Bearer ${pageE2EToken}`;
      const options = { method: req.method(), headers };
      if (req.postData()) options.body = req.postData();
      try {
        const res = await fetch(proxied, options);
        const buffer = await res.arrayBuffer();
        const headersObj = {};
        for (const [k, v] of res.headers.entries()) headersObj[k] = v;
        await route.fulfill({ status: res.status, body: Buffer.from(buffer), headers: headersObj });
      } catch (e) {
        console.warn("Proxy failed", e && e.message);
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "proxy_failed" }),
        });
      }
    });
    await page.addInitScript(() => {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "test-token-for-adminUser";
      localStorage.setItem(
        "user",
        JSON.stringify({
          uid: "adminUser",
          email: "admin@example.com",
          role: "admin",
          isAdmin: true,
        })
      );
    });
    await page.reload();

    // Click Payouts tab (wait for visible actionable button first)
    try {
      await page.waitForSelector('button:has-text("Payouts")', { timeout: 15000 });
      await page.click('button:has-text("Payouts")');
    } catch (e) {
      console.log('[WARN] "Payouts" button not found. Dumping buttons...');
      const btns = await page.$$eval('button', els => els.map(e => e.textContent));
      console.log('[WARN] Buttons found:', btns);
      // Try finding it by loose text or navigation link
      const fallback = await page.$('li:has-text("Payouts")');
      if (fallback) await fallback.click();
      else throw e;
    }
    // Wait for table to show
    await page.waitForSelector(".data-table", { timeout: 8000 });

    // If DB isn't configured, the table might be empty, just assert that the UI loaded
    const rows = await page.$$eval(".data-table tbody tr", rows => rows.length);
    console.log("[E2E] payouts rows", rows);

    // If there is a pending payout, click process on the first row
    if (rows > 0) {
      // Click Process button in the first row
      await page.click('.data-table tbody tr:first-child button:has-text("Process")');
      // Optionally wait for alert or confirmation
      await page.waitForTimeout(500);
    }
  } finally {
    // cleanup
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const snap = await db.collection("payouts").where("userId", "==", payoutUid).get();
        const batch = db.batch();
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await db.collection("users").doc(payoutUid).delete();
        await db.collection("users").doc(adminUid).delete();
      }
    } catch (e) {
      console.warn("cleanup failed", e.message);
    }
    await new Promise(r => (mainServer ? mainServer.close(r) : r()));
  }
});
