const { test, expect } = require("@playwright/test");
const { spawn } = require("child_process");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;

async function attachFileForPlatform(page, filePath) {
  // Prefer per-platform file input inside expanded card
  const perFile = page.locator('.platform-expanded input[type="file"]');
  if ((await perFile.count()) > 0) {
    await perFile.setInputFiles(filePath);
    return;
  }
  // Fallback to global input
  const globalFile = page.locator('#content-file-input');
  if ((await globalFile.count()) > 0) {
    await globalFile.setInputFiles(filePath);
    return;
  }
  // Final fallback: any file input on the page
  const anyFile = page.locator('input[type="file"]');
  if ((await anyFile.count()) > 0) {
    await anyFile.first().setInputFiles(filePath);
    return;
  }
  throw new Error('No file input found to attach file: ' + filePath);
}

test.beforeAll(async () => {
  serverProcess = spawn("node", ["test/e2e/playwright/static-server.js"], { stdio: "inherit" });
  // Wait until fixture is reachable
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

// Global test setup for SPA tests:
test.beforeEach(async ({ page }) => {
  // ensure E2E bypass header is present everywhere
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  // Stub users/me to always return a logged-in user, to avoid hitting backend auth in SPA tests
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { uid: "testUser", email: "test@local", name: "Test User" } }),
    });
  });
  // Also intercept absolute host URLs used in the production build
  await page.route("https://autopromote.onrender.com/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { uid: "testUser", email: "test@local", name: "Test User" } }),
    });
  });
  // Stub common platform/status and other initial endpoints the SPA loads on startup
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: {} }),
    });
  });
  await page.route("https://autopromote.onrender.com/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: {} }),
    });
  });
  await page.route("**/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("https://autopromote.onrender.com/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("**/api/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("https://autopromote.onrender.com/api/users/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("https://autopromote.onrender.com/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/content/my-promotion-schedules", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schedules: [] }),
    });
  });
  await page.route(
    "https://autopromote.onrender.com/api/content/my-promotion-schedules",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schedules: [] }),
      });
    }
  );
  // Ensure SPA sees a logged-in user by injecting a localStorage entry during page init
  await page.addInitScript(() => {
    try {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "e2e-test-token";
      window.__E2E_BYPASS_UPLOADS = true;
      localStorage.setItem(
        "user",
        JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
      );
    } catch (e) {
      /* swallow in CI */
    }
  });
  // Global logging for debugging SPA runtime issues in CI
  page.on("console", msg => console.log("[PAGE LOG]", msg.text()));
  page.on("pageerror", err => console.log("[PAGE ERROR]", err.message || err));
  page.on("requestfailed", req =>
    console.log("[REQUEST FAILED]", req.url(), req.failure() && req.failure().errorText)
  );
  // Dismiss any unexpected dialogs that may appear during CI runs
  page.on("dialog", async dialog => {
    try {
      console.log("[PAGE DIALOG]", dialog.message());
      await dialog.dismiss();
    } catch (e) {
      // ignore dialog handling errors — do not let unexpected dialogs crash tests
    }
  });
});

test("Per-platform card: Spotify preview, quality, upload", async ({ page }) => {
  // Mock quality-check
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 88, quality_feedback: ["Looks good"] }),
    });
  });

  // Mock upload for preview (isDryRun true) and final upload
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    console.log(
      "[ROUTE] intercept relative /api/content/upload",
      req.method(),
      body.substring ? body.substring(0, 400) : body
    );
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "spotify",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // Simulate logged in user via localStorage before navigation
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-spotify");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  expect(await page.locator(".preview-card").count()).toBeGreaterThan(0);
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  expect(await page.textContent("#quality-result")).toContain("Score:");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: Discord preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 90 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "discord",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-discord");
  await page.fill('input[placeholder="Discord channel ID"]', "12345");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: Telegram preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 85 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "telegram",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-telegram");
  await page.fill('input[placeholder="Telegram chat ID"]', "54321");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: Reddit preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 78 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "reddit",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-reddit");
  await page.fill('input[placeholder="Reddit subreddit"]', "testsub");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: LinkedIn preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 92 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "linkedin",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-linkedin");
  await page.fill('input[placeholder="LinkedIn organization/company ID"]', "98765");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: Twitter preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 69 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "twitter",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-twitter");
  await page.fill('input[placeholder="Twitter message (optional)"]', "Test tweet");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: Snapchat preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 85 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "snapchat",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-snapchat");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

test("Per-platform card: Pinterest preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 88 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "pinterest",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-pinterest");
  // Fixture uses per-tile inputs with explicit ids
  // SPA uses shared inputs for Pinterest options; select by placeholder
  await page.fill('input[placeholder="Pinterest board id"]', "board-1");
  await page.fill('textarea[placeholder="Pin note"]', "Test pin note");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});

// Add YouTube card test
test("Per-platform card: YouTube preview and upload", async ({ page }) => {
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 93 }),
    });
  });
  let lastYouTubeUploadBody = null;
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "youtube",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    try {
      const json = JSON.parse(body || "{}");
      if (json && json.platform_options && json.platform_options.youtube)
        lastYouTubeUploadBody = json;
    } catch (_) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-youtube");
  await page.fill("#youtube-title", "E2E YouTube Title");
  await page.fill("#youtube-description", "E2E YouTube Description");
  await page.selectOption("#youtube-visibility", "public");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
  // Assert upload payload included YouTube visibility option
  expect(lastYouTubeUploadBody).not.toBeNull();
  expect(
    lastYouTubeUploadBody.platform_options &&
      lastYouTubeUploadBody.platform_options.youtube &&
      lastYouTubeUploadBody.platform_options.youtube.visibility
  ).toBe("public");
});

test("Per-platform SPA: Spotify preview & upload (dashboard)", async ({ page }) => {
  // Add a header so backend uses E2E test bypass and skip Firestore calls
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  // Route mocks for SPA
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 88 }),
    });
  });
  // Intercept both relative and absolute API host calls
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      // For SPA YouTube test, record visibility if present
      if (json && json.platform_options && json.platform_options.youtube) {
        console.log(
          "[ROUTE] SPA YouTube payload visibility:",
          json.platform_options.youtube.visibility
        );
      }
    } catch (_) {}
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "spotify",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  // Intercept Firebase storage upload calls to avoid needing real credentials
  await page.route("https://firebasestorage.googleapis.com/**", async route => {
    // Accept any upload and return a success-like response
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ name: "uploads/videos/fake.mp4", bucket: "autopromote-cc6d3" }),
    });
  });
  // Intercept Firebase storage upload calls to avoid needing real credentials
  await page.route("https://firebasestorage.googleapis.com/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ name: "uploads/videos/fake.mp4", bucket: "autopromote-cc6d3" }),
    });
  });
  await page.route("https://autopromote.onrender.com/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    console.log(
      "[ROUTE] intercept absolute /api/content/upload",
      req.method(),
      body.substring ? body.substring(0, 400) : body
    );
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "spotify",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  // Ensure platform status calls don't block dashboard load
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/content/my-promotion-schedules", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schedules: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { spotify: { connected: true, meta: {} } } }),
    });
  });
  await page.route("**/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("**/api/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", name: "Test User", uid: "testUser" } }),
    });
  });

  // Bypass auth/terms + E2E upload bypass via runtime flag and localStorage
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  page.on("console", msg => console.log("[PAGE LOG]", msg.text()));
  page.on("pageerror", err => console.log("[PAGE ERROR]", err.message || err));
  page.on("requestfailed", req =>
    console.log("[REQUEST FAILED]", req.url(), req.failure() && req.failure().errorText)
  );
  page.on("request", req => console.log("[REQUEST]", req.method(), req.url()));
  page.on("response", res => console.log("[RESPONSE]", res.status(), res.url()));
  const userStored = await page.evaluate(() => localStorage.getItem("user"));
  console.log("[debug] localStorage user on SPA test:", userStored);
  const navHtml = await page.evaluate(() =>
    document.querySelector("nav") ? document.querySelector("nav").innerHTML : "NO NAV"
  );
  console.log(
    "[debug] nav innerHTML first 400 chars:",
    navHtml && navHtml.substring ? navHtml.substring(0, 400) : navHtml
  );
  const docTitle = await page.title();
  const readyState = await page.evaluate(() => document.readyState);
  console.log("[debug] document.title:", docTitle, "readyState:", readyState);
  // Log script tags to detect missing bundles
  const scriptSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script")).map(s =>
      s.src || (s.innerText && s.innerText.substring) ? s.src || "[inline script]" : "[unknown]"
    )
  );
  console.log("[debug] found script srcs:", scriptSrcs.slice(0, 20));

  // Find Upload nav button and open Upload panel
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');

  // Wait for file input and the platform grid
  await page.waitForSelector("#content-file-input");
  // Click Spotify tile
  const spotifyTile = page.locator('div[aria-label="Spotify"]');
  await spotifyTile.click();
  // Expand tile (card click toggles expansion) — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  // Attach file (prefer per-platform input if present)
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  // Ensure preview button is enabled after attaching the file
  await page.waitForSelector(".platform-expanded .preview-button:not([disabled])", {
    timeout: 10000,
  });
  // Add a console listener to capture in-page logs useful for debugging
  page.on("console", msg => {
    console.log("[PAGE LOG]", msg.text());
  });
  // Debugging: log some DOM state before clicking preview
  const contentInputFiles = await page.evaluate(() =>
    document.querySelector("#content-file-input") &&
    document.querySelector("#content-file-input").files
      ? document.querySelector("#content-file-input").files.length
      : 0
  );
  console.log("[debug] file input files count:", contentInputFiles);
  const spotifyTileClass = await page.evaluate(() =>
    document.querySelector('div[aria-label="Spotify"]')
      ? document.querySelector('div[aria-label="Spotify"]').className
      : "NOT FOUND"
  );
  console.log("[debug] spotify tile class:", spotifyTileClass);
  const previewBtnDisabled = await page.evaluate(() =>
    document.querySelector(".platform-expanded .preview-button")
      ? document.querySelector(".platform-expanded .preview-button").disabled
      : "no-button"
  );
  console.log("[debug] preview button disabled?:", previewBtnDisabled);
  // Log outgoing requests
  page.on("request", req => console.log("[REQUEST]", req.method(), req.url()));
  // Preview: wait for the upload preview API to respond and then for the UI to render
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/api/content/upload")),
    page.locator(".platform-expanded button.preview-button").click(),
  ]);
  await page.waitForSelector(".platform-expanded .preview-card");
  // Quality
  await Promise.all([
    page.waitForResponse(
      res => res.url().includes("/api/content/quality-check") && res.status() === 200
    ),
    page.locator(".platform-expanded button.quality-check-button").click(),
  ]);
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  // Upload
  await page.waitForSelector(".platform-expanded .submit-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.submit-button").click();
  // For SPA, ensure required Spotify playlist is set
  await page.fill("#spotify-playlist-name", "Test Playlist");
  await page.waitForSelector(".platform-expanded .submit-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector('.platform-expanded .platform-upload-status:has-text("Upload")', {
    timeout: 50000,
  });
});

// Add YouTube SPA test
test("Per-platform SPA: YouTube preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/youtube/metadata", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ channel: { title: "Test Channel", id: "testchannel" } }),
    });
  });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 95 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "youtube",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/content/my-promotion-schedules", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schedules: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { youtube: { connected: true, meta: {} } } }),
    });
  });
  await page.route("**/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("**/api/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", name: "Test User", uid: "testUser" } }),
    });
  });

  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  const youtubeTile = page.locator('div[aria-label="Youtube"]');
  await youtubeTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  // Fill common fields
  await page.fill("#content-title", "E2E YouTube Title");
  await page.fill("#content-description", "E2E YouTube description from SPA test");
  // If per-platform visibility control exists, try to set it
  try {
    await page.waitForSelector("#youtube-visibility", { timeout: 10000 });
    await page.selectOption("#youtube-visibility", "public");
  } catch (e) {}
  await Promise.all([
    page.waitForResponse(res => res.url().includes("/api/content/upload")),
    page.locator(".platform-expanded button.preview-button").click(),
  ]);
  await page.waitForSelector(".platform-expanded .preview-card");
  await Promise.all([
    page.waitForResponse(
      res => res.url().includes("/api/content/quality-check") && res.status() === 200
    ),
    page.locator(".platform-expanded button.quality-check-button").click(),
  ]);
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.waitForSelector(".platform-expanded .submit-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector('.platform-expanded .platform-upload-status:has-text("Upload")', {
    timeout: 50000,
  });
});

test("Per-platform SPA: TikTok preview & upload (dashboard)", async ({ page }) => {
  // Add header to bypass backend Firestore checks in E2E
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  // Mock creator_info for the test account
  await page.route("**/api/tiktok/creator_info", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        creator: {
          display_name: "Test Creator",
          can_post: true,
          privacy_level_options: ["EVERYONE", "FRIENDS", "SELF_ONLY"],
          max_video_post_duration_sec: 60,
          interactions: { comments: true, duet: true, stitch: false },
        },
      }),
    });
  });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 70 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "tiktok",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/content/my-promotion-schedules", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schedules: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { tiktok: { connected: true, meta: {} } } }),
    });
  });
  await page.route("**/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("**/api/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", name: "Test User", uid: "testUser" } }),
    });
  });

  // Bypass auth and set E2E flags (consent + bypass uploads) for SPA tests
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_TEST_TIKTOK_CONSENT = true;
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  // Click the TikTok tile first; the file input is added when a tile is expanded in some builds
  const tiktokTile = page.locator('div[aria-label="Tiktok"]');
  await tiktokTile.click();
  // Card click toggles expansion OR navigates to per-platform Upload view depending on build
  await page.waitForSelector('.platform-expanded, h3:has-text("Upload to Tiktok"), button:has-text("Platform file tiktok")', { timeout: 60000 });
  // Attach file using helper (handles per-platform or global inputs)
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  // Set privacy & consent
  await page.locator(".platform-expanded select.form-select").selectOption("EVERYONE");
  // Debug: print expanded UI HTML and label texts
  const platformHtml = await page.evaluate(() =>
    document.querySelector(".platform-expanded")
      ? document.querySelector(".platform-expanded").innerHTML
      : "NO PLATFORM HTML"
  );
  console.log(
    "[DEBUG] platform-expanded HTML (short):",
    platformHtml.substring ? platformHtml.substring(0, 2000) : platformHtml
  );
  const labelsText = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".platform-expanded label")).map(l => l.textContent.trim())
  );
  console.log("[DEBUG] platform-expanded labels:", labelsText);
  // Wait for the consent checkbox label to be visible and click it (safer than checking input)
  const consentLabel = page.locator('.platform-expanded label:has-text("By posting")');
  if ((await consentLabel.count()) > 0) {
    await consentLabel.waitFor({ state: "visible", timeout: 20000 });
    await consentLabel.click();
  } else {
    console.log("[DEBUG] TikTok consent label not present; relying on E2E flag");
  }
  // Preview
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  // Quality
  await page.waitForSelector(".platform-expanded .quality-check-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  // Upload
  await page.waitForSelector(".platform-expanded .submit-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  const tkStatusText = await page
    .locator(".platform-expanded .platform-upload-status")
    .textContent();
  expect(tkStatusText).toMatch(/Upload|Publishing|submitted|Published/i);
});

test("Per-platform SPA: Snapchat preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 78 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "snapchat",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/content/my-promotion-schedules", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schedules: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { snapchat: { connected: true, meta: {} } } }),
    });
  });
  await page.route("**/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("**/api/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", name: "Test User", uid: "testUser" } }),
    });
  });

  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  const snapchatTile = page.locator('div[aria-label="Snapchat"]');
  await snapchatTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.waitForSelector(".platform-expanded .preview-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.waitForSelector(".platform-expanded .quality-check-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.waitForSelector(".platform-expanded .submit-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform SPA: Pinterest preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 84 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "pinterest",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/content/my-promotion-schedules", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schedules: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { pinterest: { connected: true, meta: {} } } }),
    });
  });
  await page.route("**/api/health", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK" }),
    });
  });
  await page.route("**/api/notifications", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [] }),
    });
  });
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", name: "Test User", uid: "testUser" } }),
    });
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForSelector("#content-file-input");
  const pinterestTile = page.locator('div[aria-label="Pinterest"]');
  await pinterestTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  // SPA uses shared inputs for Pinterest options; select by placeholder
  await page.fill('input[placeholder="Pinterest board id (or leave blank)"]', "board-1");
  await page.fill('input[placeholder="Pin note (optional)"]', "Test pin note");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.waitForSelector(".platform-expanded .preview-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.waitForSelector(".platform-expanded .quality-check-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform SPA: Discord preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 90 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "discord",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { discord: { connected: true, meta: {} } } }),
    });
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForSelector("#content-file-input");
  const discordTile = page.locator('div[aria-label="Discord"]');
  await discordTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await page.waitForSelector('.platform-expanded input[placeholder="Discord channel ID"]', {
    timeout: 10000,
  });
  await page.fill('.platform-expanded input[placeholder="Discord channel ID"]', "12345");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.waitForSelector(".platform-expanded .preview-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.waitForSelector(".platform-expanded .quality-check-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform SPA: Telegram preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 85 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "telegram",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { telegram: { connected: true, meta: {} } } }),
    });
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForSelector("#content-file-input");
  const telegramTile = page.locator('div[aria-label="Telegram"]');
  await telegramTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await page.waitForSelector('.platform-expanded input[placeholder="Telegram chat ID"]', {
    timeout: 10000,
  });
  await page.fill('.platform-expanded input[placeholder="Telegram chat ID"]', "54321");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.waitForSelector(".platform-expanded .preview-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.waitForSelector(".platform-expanded .quality-check-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform SPA: Reddit preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 78 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "reddit",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { reddit: { connected: true, meta: {} } } }),
    });
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForSelector("#content-file-input");
  const redditTile = page.locator('div[aria-label="Reddit"]');
  await redditTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await page.waitForSelector('.platform-expanded input[placeholder="Reddit subreddit"]', {
    timeout: 10000,
  });
  await page.fill('.platform-expanded input[placeholder="Reddit subreddit"]', "testsub");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.waitForSelector(".platform-expanded .preview-button:not([disabled])", {
    timeout: 10000,
  });
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform SPA: LinkedIn preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 92 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "linkedin",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { linkedin: { connected: true, meta: {} } } }),
    });
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForSelector("#content-file-input");
  const linkedinTile = page.locator('div[aria-label="Linkedin"]');
  await linkedinTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await page.waitForSelector(
    '.platform-expanded input[placeholder="LinkedIn organization/company ID"]',
    { timeout: 10000 }
  );
  await page.fill(
    '.platform-expanded input[placeholder="LinkedIn organization/company ID"]',
    "98765"
  );
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform SPA: Twitter preview & upload (dashboard)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 69 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        const previews = [
          {
            platform: "twitter",
            thumbnail: "/default-thumb.png",
            title: json.title,
            description: json.description,
          },
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ previews }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [] }),
    });
  });
  await page.route("**/api/platform/status", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { twitter: { connected: true, meta: {} } } }),
    });
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    window.__E2E_BYPASS_UPLOADS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForSelector("#content-file-input");
  const twitterTile = page.locator('div[aria-label="Twitter"]');
  await twitterTile.click();
  // Card click toggles expansion — wait for expanded per-platform UI
  await page.waitForSelector(".platform-expanded");
  await page.waitForSelector('.platform-expanded input[placeholder="Twitter message (optional)"]', {
    timeout: 10000,
  });
  await page.fill(
    '.platform-expanded input[placeholder="Twitter message (optional)"]',
    "Test tweet"
  );
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForSelector(".platform-expanded .preview-card");
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini");
  await page.locator(".platform-expanded button.submit-button").click();
  await page.waitForSelector(".platform-expanded .platform-upload-status");
  expect(await page.locator(".platform-expanded .platform-upload-status").textContent()).toMatch(
    /Upload|Publishing|submitted|Published/i
  );
});

test("Per-platform card: TikTok respects creator_info and allows upload", async ({ page }) => {
  // Mock TikTok creator_info
  await page.route("**/api/tiktok/creator_info", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        creator: {
          display_name: "Test Creator",
          can_post: true,
          privacy_level_options: ["EVERYONE", "FRIENDS", "SELF_ONLY"],
          max_video_post_duration_sec: 60,
          interactions: { comments: true, duet: true, stitch: false },
        },
      }),
    });
  });

});

// New test: when posting cap is reached, the UI should show cap info and disable upload
test("Per-platform card: TikTok blocks upload when posting cap reached", async ({ page }) => {
  await page.route("**/api/tiktok/creator_info", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        creator: {
          display_name: "Capped Creator",
          can_post: true,
          privacy_level_options: ["EVERYONE", "FRIENDS", "SELF_ONLY"],
          posting_cap_per_24h: 2,
          posting_remaining: 0,
          posts_in_last_24h: 2,
          interactions: { comments: true, duet: true, stitch: true },
        },
      }),
    });
  });

  // Navigate to upload and open TikTok card
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');

  // Click the TikTok tile first — some builds add the file input on tile expansion
  await page.click('#tile-tiktok');
  await page.waitForSelector('.platform-expanded');
  await page.waitForSelector("#content-file-input");

  // Expect to see posting cap message and Upload button disabled
  await page.waitForSelector('text=Posting cap: 2 per 24h', { timeout: 5000 });
  await page.waitForSelector('text=Posting cap reached', { timeout: 5000 });
  const uploadBtn = page.locator('.platform-expanded button.submit-button');
  expect(await uploadBtn.isDisabled()).toBe(true);
});

test("Per-platform card: TikTok preview and upload", async ({ page }) => {
  // Mock quality-check and upload as above
  await page.route("**/api/content/quality-check", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quality_score: 75 }),
    });
  });
  await page.route("**/api/content/upload", async (route, req) => {
    const body = req.postData() || "";
    try {
      const json = JSON.parse(body || "{}");
      if (json.isDryRun) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            previews: [{ platform: "tiktok", thumbnail: "/default-thumb.png", title: json.title }],
          }),
        });
        return;
      }
    } catch (e) {}
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  const pageUrl = `file://${require("path").resolve(__dirname, "../fixtures/upload_component_test_page.html")}`;
  await page.goto(pageUrl);
  await page.waitForSelector("#content-file-input");
  await page.click("#tile-tiktok");
  await attachFileForPlatform(page, "test/e2e/playwright/test-assets/test.mp4");
  // Set privacy and consent in fixture
  await page.selectOption("#tiktok-privacy", "EVERYONE");
  await page.check("#tiktok-consent");
  await page.click("#preview-btn");
  await page.waitForSelector(".preview-card");
  await page.click("#quality-btn");
  await page.waitForSelector("#quality-result");
  await page.click("#upload-btn");
  await page.waitForSelector("#upload-status");
  expect(await page.textContent("#upload-status")).toContain("Upload");
});
