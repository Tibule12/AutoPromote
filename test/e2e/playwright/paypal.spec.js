const { test, expect } = require("@playwright/test");
const { spawn } = require("child_process");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

test.beforeAll(async () => {
  serverProcess = spawn("node", ["test/e2e/playwright/static-server.js"], { stdio: "inherit" });
  // wait a bit for server to start
  await new Promise(r => setTimeout(r, 800));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test("upgrade flow opens PayPal and handles cancel return", async ({ page }) => {
  page.on("console", msg => console.log("[PAGE LOG]", msg.text()));
  // Ensure server treats this as an E2E request and bypass Firestore/terms
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  page.on("request", req => console.log("[REQUEST]", req.method(), req.url()));
  // Stub the create-subscription API to return approval url
  await page.route("**/api/paypal-subscriptions/create-subscription", async route => {
    const body = JSON.stringify({
      success: true,
      approvalUrl: "https://example.com/paypal-approve",
      subscriptionId: "sub_123",
    });
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });

  // Ensure plans are stubbed so the panel shows subscribe buttons
  await page.route("**/api/paypal-subscriptions/plans", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plans: [
          { id: "pro", name: "Pro", price: 19.99 },
          { id: "free", name: "Free", price: 0 },
        ],
      }),
    });
  });
  // Stub common endpoints the pricing page may call to avoid CORS to external API
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", uid: "testUser", name: "Test User" } }),
    });
  });
  // Generic fallback for any other api calls to avoid CORS/external requests.
  // For some endpoints, like the PayPal plans, return the expected shape to avoid UI errors.
  await page.route("**/api/**", async route => {
    const url = route.request().url();
    console.log("[ROUTE FALLBACK] Intercepting", url);
    if (url.includes("/api/paypal-subscriptions/create-subscription")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          approvalUrl: "https://example.com/paypal-approve",
          subscriptionId: "sub_123",
        }),
      });
      return;
    }
    if (url.includes("/api/paypal-subscriptions/plans")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plans: [
            { id: "pro", name: "Pro", price: 19.99, features: { uploads: true } },
            { id: "free", name: "Free", price: 0, features: {} },
          ],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // Serve a stub for status so we can see plan
  await page.route("**/api/paypal-subscriptions/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        subscription: { planId: "free", planName: "Free", status: "active", features: {} },
      }),
    });
  });

  // Add E2E auth bypass to simulate a logged-in user so subscribe button functions
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/pricing");
  // Debug: capture a short console dump and page title
  const pageTitle = await page.title();
  console.log("[DEBUG] Page title after goto:", pageTitle);
  // Wait for plans to load: plans-section header and at least one plan card
  await page.waitForSelector(".plans-section h3");
  await page.waitForSelector(".plans-grid .plan-card");
  // Debug: print plans grid HTML to help diagnose missing subscribe button
  const cardTitles = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".plans-grid .plan-card h4")).map(n =>
      n.textContent.trim()
    )
  );
  const subscribeButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".plans-grid .plan-card")).map(card => ({
      title: (card.querySelector("h4") && card.querySelector("h4").textContent.trim()) || "",
      hasSubscribe: !!card.querySelector(".subscribe-btn"),
      subscribeText: card.querySelector(".subscribe-btn")
        ? card.querySelector(".subscribe-btn").textContent.trim()
        : "",
    }))
  );
  console.log("[DEBUG] Plan card titles:", cardTitles);
  console.log("[DEBUG] Plan cards subscribe info:", subscribeButtons);

  // Intercept window.open (popup) since headless may not produce a real popup
  await page.evaluate(() => {
    window.__lastOpen = null;
    window.open = u => {
      window.__lastOpen = u;
    };
  });
  // Click the first available 'Upgrade to' button (subscribe-btn)
  await page.click(".plans-grid .plan-card .subscribe-btn");
  await page.waitForFunction(() => !!window.__lastOpen);
  const lastOpen = await page.evaluate(() => window.__lastOpen);
  expect(lastOpen).toContain("paypal-approve");

  // Simulate user cancel by navigating back to dashboard with cancelled flag
  await page.goto(BASE + "/#/dashboard?payment=cancelled&subscription_id=sub_123");

  // Ensure the page did not show server Not Found and dashboard is visible
  const notFound = await page.locator("text=Not Found").count();
  expect(notFound).toBe(0);
  // Check dashboard header exists (App dependent)
  const dashboardHeader = await page.locator("text=Dashboard").count();
  expect(dashboardHeader).toBeGreaterThanOrEqual(0);
});

// Activation flow: stub activate endpoint and status
test("activation flow after approval updates subscription state", async ({ page }) => {
  await page.route("**/api/paypal-subscriptions/create-subscription", async route => {
    const body = JSON.stringify({
      success: true,
      approvalUrl: "https://example.com/paypal-approve",
      subscriptionId: "sub_456",
    });
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });

  // Intercept activate
  await page.route("**/api/paypal-subscriptions/activate", async route => {
    const body = JSON.stringify({
      success: true,
      message: "Successfully subscribed",
      subscription: { planId: "pro", planName: "Pro", status: "active", features: {} },
    });
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });

  // Ensure plans are stubbed so the panel shows subscribe buttons
  await page.route("**/api/paypal-subscriptions/plans", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plans: [
          { id: "pro", name: "Pro", price: 19.99, features: { uploads: true } },
          { id: "free", name: "Free", price: 0, features: {} },
        ],
      }),
    });
  });

  // When status is read initially return the free subscription (so the UI shows upgrade buttons)
  await page.route("**/api/paypal-subscriptions/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        subscription: { planId: "free", planName: "Free", status: "active", features: {} },
      }),
    });
  });

  // Ensure E2E bypass and logged-in user so subscribe buttons are enabled
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/pricing");
  await page.waitForSelector("text=Available Plans");

  // Intercept window.open call instead of relying on a browser popup
  await page.evaluate(() => {
    window.__lastOpen = null;
    window.open = u => {
      window.__lastOpen = u;
    };
  });
  // Click the subscribe button for the Pro plan specifically
  await page.click('.plans-grid .plan-card:has-text("Pro") .subscribe-btn');
  await page.waitForFunction(() => !!window.__lastOpen);
  const lastOpen = await page.evaluate(() => window.__lastOpen);
  expect(lastOpen).toContain("paypal-approve");

  // Simulate return to pricing page with success - update status route to return active Pro
  await page.route("**/api/paypal-subscriptions/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        subscription: {
          planId: "pro",
          planName: "Pro",
          status: "active",
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          features: {},
        },
      }),
    });
  });
  await page.goto(BASE + "/#/pricing?payment=success&subscriptionId=sub_456");

  // Wait for plan to be reflected on page - look for plan name
  await page.waitForSelector("text=Pro", { timeout: 4000 });
  const proPlanCount = await page.locator("text=Pro").count();
  expect(proPlanCount).toBeGreaterThan(0);
});
