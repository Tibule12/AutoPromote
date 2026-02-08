const { test, expect } = require("@playwright/test");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

test("AI Clip Studio: analyze and generate clip (SPA)", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });

  // Stub common endpoints
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { uid: "testUser", email: "test@local", name: "Test User" } }),
    });
  });
  await page.route("https://autopromote.onrender.com/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { uid: "testUser", email: "test@local", name: "Test User" } }),
    });
  });

  // Provide one video content
  await page.route("**/api/content/my-content", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          {
            id: "vid1",
            title: "E2E Video",
            url: `${BASE}/test-assets/test.mp4`,
            duration: 60,
            type: "video",
          },
        ],
      }),
    });
  });

  // Analyze/generate state
  let analysisRequested = false;
  await page.route("**/api/clips/analyze", async (route, req) => {
    analysisRequested = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, analysisId: "a1", clipsGenerated: 1 }),
    });
  });

  await page.route("**/api/clips/analysis/a1", async route => {
    // Return a simple analysis with one topClip
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        analysis: {
          id: "a1",
          duration: 60,
          scenesDetected: 4,
          transcriptLength: 1,
          topClips: [
            {
              id: "clip1",
              start: 0,
              end: 8,
              duration: 8,
              score: 90,
              reason: "Great hook",
              platforms: ["tiktok"],
              captionSuggestion: "Test caption",
              text: "hello world",
            },
          ],
        },
      }),
    });
  });

  // Generated clips list will reflect generation after generate endpoint called
  let generatedClips = [];
  await page.route("**/api/clips/generate", async (route, req) => {
    const body = JSON.parse(req.postData() || "{}");
    // Simulate generation and add clip
    generatedClips.push({
      id: "gen-1",
      url: `${BASE}/test-assets/test.mp4`,
      viralScore: 90,
      duration: 8,
      caption: "Test caption",
      platforms: ["tiktok"],
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, clipId: "gen-1" }),
    });
  });

  await page.route("**/api/clips/user", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, clips: generatedClips, count: generatedClips.length }),
    });
  });

  // Other stubs
  await page.route("**/api/platform/status", async route => {
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

  // Inject E2E bypass and user
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });

  // Visit dashboard and open AI Clips
  await page.goto(BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector('nav li:has-text("AI Clips")', { timeout: 60000 });
  await page.click('nav li:has-text("AI Clips")');

  // Click "Select Video from Library" to enter library mode
  // The UI defaults to a "Clean Landing" state now
  const selectBtn = page.locator('button:has-text("Select Video from Library")');
  if (await selectBtn.count() > 0) {
    await selectBtn.click();
  }

  // Wait for video card and click Generate Clips
  try {
    await page.waitForSelector(".video-card", { timeout: 60000 });
  } catch (e) {
    // If no video card, maybe we need to wait for loading or mocked content failed
    console.log('[WARN] .video-card not found. Page content: ' + (await page.content()).substring(0, 500));
    throw e;
  }
  await page.click('.video-card .btn-primary:has-text("Generate Clips")');

  // Ensure analysis results appear
  await page.waitForSelector(".analysis-results", { timeout: 10000 });

  // Generate the first suggested clip
  await page.waitForSelector('.clip-suggestion .btn-primary:has-text("Generate Clip")', {
    timeout: 10000,
  });
  await page.click('.clip-suggestion .btn-primary:has-text("Generate Clip")');

  // After generation, poll the user's clips endpoint until it returns the generated clip, then assert DOM updates
  const start = Date.now();
  let userClips = null;
  while (Date.now() - start < 10000) {
    userClips = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/clips/user");
        if (!r.ok) return null;
        return await r.json();
      } catch (e) {
        return null;
      }
    });
    if (userClips && userClips.clips && userClips.clips.length > 0) break;
    await page.waitForTimeout(250);
  }

  expect(userClips && userClips.clips && userClips.clips.length).toBeGreaterThan(0);
  // Ensure analysis endpoint was called and generation occurred
  expect(analysisRequested).toBe(true);
});

// Start static server used by SPA assets
test.beforeAll(async () => {
  const { spawn } = require("child_process");
  global.__clipServerProcess = spawn("node", ["test/e2e/playwright/static-server.js"], {
    stdio: "inherit",
  });
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
  if (global.__clipServerProcess) global.__clipServerProcess.kill();
});
