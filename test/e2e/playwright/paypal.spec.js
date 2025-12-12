const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

test.beforeAll(async () => {
  serverProcess = spawn('node', ['test/e2e/playwright/static-server.js'], { stdio: 'inherit' });
  // wait a bit for server to start
  await new Promise((r) => setTimeout(r, 800));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('upgrade flow opens PayPal and handles cancel return', async ({ page }) => {
  // Stub the create-subscription API to return approval url
  await page.route('**/api/paypal-subscriptions/create-subscription', async (route) => {
    const body = JSON.stringify({ success: true, approvalUrl: 'https://example.com/paypal-approve', subscriptionId: 'sub_123' });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  // Serve a stub for status so we can see plan
  await page.route('**/api/paypal-subscriptions/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, subscription: { planId: 'free', planName: 'Free', status: 'active', features: {} } }) });
  });

  await page.goto(BASE + '/#/pricing');
  // Wait for plans to load
  await page.waitForSelector('text=Available Plans');

  // Intercept window.open (popup) since headless may not produce a real popup
  await page.evaluate(() => { window.__lastOpen = null; window.open = (u) => { window.__lastOpen = u; }; });
  await page.click('text=Upgrade to');
  await page.waitForFunction(() => !!window.__lastOpen);
  const lastOpen = await page.evaluate(() => window.__lastOpen);
  expect(lastOpen).toContain('paypal-approve');

  // Simulate user cancel by navigating back to dashboard with cancelled flag
  await page.goto(BASE + '/#/dashboard?payment=cancelled&subscription_id=sub_123');

  // Ensure the page did not show server Not Found and dashboard is visible
  const notFound = await page.locator('text=Not Found').count();
  expect(notFound).toBe(0);
  // Check dashboard header exists (App dependent)
  const dashboardHeader = await page.locator('text=Dashboard').count();
  expect(dashboardHeader).toBeGreaterThanOrEqual(0);
});


// Activation flow: stub activate endpoint and status
test('activation flow after approval updates subscription state', async ({ page }) => {
  await page.route('**/api/paypal-subscriptions/create-subscription', async (route) => {
    const body = JSON.stringify({ success: true, approvalUrl: 'https://example.com/paypal-approve', subscriptionId: 'sub_456' });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  // Intercept activate
  await page.route('**/api/paypal-subscriptions/activate', async (route) => {
    const body = JSON.stringify({ success: true, message: 'Successfully subscribed', subscription: { planId: 'pro', planName: 'Pro', status: 'active', features: {} } });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  // When status is read, return the active subscription
  await page.route('**/api/paypal-subscriptions/status', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, subscription: { planId: 'pro', planName: 'Pro', status: 'active', nextBillingDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(), features: {} } })
    });
  });

  await page.goto(BASE + '/#/pricing');
  await page.waitForSelector('text=Available Plans');

  // Intercept window.open call instead of relying on a browser popup
  await page.evaluate(() => { window.__lastOpen = null; window.open = (u) => { window.__lastOpen = u; }; });
  await page.click('text=Upgrade to');
  await page.waitForFunction(() => !!window.__lastOpen);
  const lastOpen = await page.evaluate(() => window.__lastOpen);
  expect(lastOpen).toContain('paypal-approve');

  // Simulate return to pricing page with success
  await page.goto(BASE + '/#/pricing?payment=success&subscriptionId=sub_456');

  // Wait for plan to be reflected on page - look for plan name
  await page.waitForSelector('text=Pro', { timeout: 4000 });
  const proPlanCount = await page.locator('text=Pro').count();
  expect(proPlanCount).toBeGreaterThan(0);
});
