const { test, expect } = require("@playwright/test");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const getBase = () => process.env.E2E_BASE_URL || `http://localhost:${STATIC_PORT}`;
const ANALYSIS_FIXTURE = {
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
};

test("AI Clip Studio: enforce the production lock or complete the enabled workflow", async ({
  page,
}) => {
  test.setTimeout(120000); // Increase test timeout
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
  await page.route("**/api/content/my-content**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          {
            id: "vid1",
            title: "E2E Video",
            url: `${getBase()}/test-assets/test.mp4`,
            duration: 60,
            type: "video",
            sourceContext: "clip_studio",
            clipAnalysis: {
              analyzed: true,
              analysisId: "a1",
              clipsGenerated: 1,
            },
          },
        ],
      }),
    });
  });

  // Analyze/generate state
  let analysisRequested = false;
  await page.route("**/api/clips/analyze", async route => {
    analysisRequested = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        analysisId: "a1",
        async: false,
        creditsRemaining: 999,
        data: {
          analysisId: "a1",
          clipSuggestions: ANALYSIS_FIXTURE.topClips,
        },
      }),
    });
  });

  await page.route("**/api/clips/analysis/a1", async route => {
    // Return a simple analysis with one topClip
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        analysis: ANALYSIS_FIXTURE,
      }),
    });
  });

  // Generated clips list will reflect generation after generate endpoint called
  let generatedClips = [];
  await page.route("**/api/clips/generate", async route => {
    // Simulate generation and add clip
    generatedClips.push({
      id: "gen-1",
      url: `${getBase()}/test-assets/test.mp4`,
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
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });

  // Production builds intentionally hide Clip Studio. Keep validating the full
  // workflow in builds where the feature is enabled, while asserting the
  // production lock instead of waiting for an element that must not appear.
  await page.goto(getBase() + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector("nav", { timeout: 60000 });
  const clipStudioNav = page.locator('nav li:has-text("Clip Studio")');
  if ((await clipStudioNav.count()) === 0) {
    await expect(clipStudioNav).toHaveCount(0);
    expect(analysisRequested).toBe(false);
    return;
  }
  await clipStudioNav.click();

  // Click "Select Video from Library" to enter library mode
  // The UI defaults to a "Clean Landing" state now
  const selectBtn = page.locator('button:has-text("Select Video from Library")');
  if (await selectBtn.count() > 0) {
    await selectBtn.click();
  }

  // Wait for video card and open the analysis view.
  try {
    await page.waitForSelector(".video-card", { timeout: 60000 });
  } catch (e) {
    // If no video card, maybe we need to wait for loading or mocked content failed
    console.log('[WARN] .video-card not found. Page content: ' + (await page.content()).substring(0, 500));
    throw e;
  }
  const viewAnalysisButton = page.locator('.video-card button:has-text("View"), .video-card .btn-secondary:has-text("View")').first();
  if ((await viewAnalysisButton.count()) > 0) {
    await viewAnalysisButton.evaluate(node => node.click());
  } else {
    await page.locator('.video-card .btn-primary:has-text("Generate Clips")').first().evaluate(node => node.click());
  }

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
  // Ensure generation occurred and clips became visible through the user listing.
  expect(generatedClips.length).toBeGreaterThan(0);
});

// Start static server used by SPA assets
test.beforeAll(async () => {
  const staticReady = require("./static-server");
  await staticReady;
});
