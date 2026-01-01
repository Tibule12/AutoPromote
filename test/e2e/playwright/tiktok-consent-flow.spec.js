const { test, expect } = require("@playwright/test");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

// Note: this test focuses on the SPA behavior: preview, edit, confirm modal and consent enforcement

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  // Stub users/me
  await page.route("**/api/users/me", async route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { uid: "testUser" } }) })
  );
  // Initial empty my-content
  await page.route("**/api/content/my-content", async route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [] }) })
  );
});

test("Preview edit + Confirm require consent and send upload when confirmed", async ({ page }) => {
  // Ensure static server is available before navigating (retry to avoid transient connection refused in CI)
  const target = `${BASE}/upload_component_test_page.html`;
  const maxWait = 15000; // ms
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < maxWait) {
    try {
      await page.goto(target, { waitUntil: "load", timeout: 4000 });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      // small backoff then retry
      await new Promise(r => setTimeout(r, 300));
    }
  }
  if (lastErr) throw lastErr;

  // Ensure the upload form is visible
  await page.waitForSelector("[data-testid=content-upload-form]");

  // Fill title and add a dummy file via the file input
  await page.fill('input[aria-label="Title"]', "Playwright TikTok Test");
  const fileInput = await page.$('input[type=file]');
  await fileInput.setInputFiles({ name: 'test.mp4', mimeType: 'video/mp4', buffer: Buffer.from('dummy') });

  // Click Preview -> backend upload should be stubbed by the page (we don't assert here)
  await page.click('[aria-label="Preview Content"]');

  // Wait for preview card to appear
  await page.waitForSelector('.preview-card');

  // Click Edit on the preview card to open preview modal
  await page.click('button:has-text("Edit Preview")');
  await page.waitForSelector('[aria-label="Edit preview title"]');

  // Change title in modal and save
  await page.fill('[aria-label="Edit preview title"]', 'Edited via Playwright');
  await page.click('button:has-text("Save")');

  // Open confirm modal by clicking Upload (which now shows the confirm modal)
  await page.click('button[aria-label="Upload Content"]');

  // Confirm button should be disabled until consent checked
  const confirmBtn = await page.waitForSelector('button:has-text("Confirm & Publish")');
  expect(await confirmBtn.isDisabled()).toBeTruthy();

  // Check consent checkbox and confirm
  await page.click('input[type=checkbox]');
  expect(await confirmBtn.isDisabled()).toBeFalsy();

  // Intercept upload POST and assert it receives the final title
  let uploadCalled = false;
  await page.route("**/api/content/upload", async route => {
    const post = await route.request().postDataJSON().catch(() => ({}));
    if (post && post.title && post.title.includes("Edited via Playwright")) uploadCalled = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, id: 'abc123' }) });
  });

  // Click confirm to initiate upload
  await confirmBtn.click();

  // Wait briefly for the upload route to be hit
  await page.waitForTimeout(800);
  expect(uploadCalled).toBeTruthy();
});
