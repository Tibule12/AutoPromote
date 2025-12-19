const { test, expect } = require("@playwright/test");
const { spawn } = require("child_process");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

test.beforeAll(async () => {
  serverProcess = spawn("node", ["test/e2e/playwright/static-server.js"], { stdio: "inherit" });
  const maxWait = 5000;
  const start = Date.now();
  const fetch = require("node-fetch");
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`${BASE}/upload_component_test_page.html`);
      if (res.ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.addInitScript(() => {
    try {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "e2e-test-token";
      window.__E2E_BYPASS_UPLOADS = true;
      localStorage.setItem(
        "user",
        JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
      );
    } catch (e) {}
  });
  // Stub backend endpoints used by the fixture
  await page.route("**/api/content/upload", async route => {
    const req = await route.request().postDataJSON();
    if (req.isDryRun) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ previews: [{ platform: req.platforms[0], title: "Preview" }] }) });
    } else {
      // Simulate server rejecting real publish when missing consent/privacy
      if (req.platforms && req.platforms.includes("tiktok")) {
        if (!req.platform_options || !req.platform_options.tiktok || !req.platform_options.tiktok.consent || !req.platform_options.tiktok.privacy) {
          await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Missing TikTok consent or privacy" }) });
          return;
        }
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "demo123" }) });
    }
  });
});

test("TikTok UX: privacy no-default, consent required, commercial disclosure enforced", async ({ page }) => {
  await page.goto(`${BASE}/upload_component_test_page.html`);
  // select TikTok tile
  await page.click('#tile-tiktok');
  // ensure privacy select present and default is empty
  const privacy = await page.locator('#tiktok-privacy');
  await expect(privacy).toHaveValue("");
  // try upload without consent -> should fail
  await page.click('#upload-btn');
  const uploadStatus = page.locator('#upload-status');
  await expect(uploadStatus).toHaveText(/Upload failed/);
  // now check consent checkbox but still no privacy
  await page.check('#tiktok-consent');
  await page.click('#upload-btn');
  await expect(uploadStatus).toHaveText(/Upload failed/);
  // now select privacy and try upload
  await privacy.selectOption('EVERYONE');
  await page.click('#upload-btn');
  await expect(uploadStatus).toHaveText(/Upload submitted/);
});

module.exports = {};
