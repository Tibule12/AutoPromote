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

test("Find Viral Clips uses the redesigned dashboard workflow", async ({ page }) => {
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

  await page.goto(getBase() + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector("nav", { timeout: 60000 });
  const findViralClipsNav = page.locator('nav li:has-text("Find Viral Clips")');
  await expect(findViralClipsNav).toHaveCount(1);
  await findViralClipsNav.click();

  await expect(page.getByRole("heading", { name: "Find Viral Clips" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source video" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clip settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suggested moments" })).toBeVisible();
  await expect(page.locator(".clip-studio-progress")).toHaveCount(0);

  const sourceInput = page.locator('.find-viral-clips-panel input[type="file"]').first();
  await sourceInput.setInputFiles(require("path").join(__dirname, "test-assets", "test.mp4"));
  await expect(page.getByRole("button", { name: /Analyse video/i })).toBeEnabled();

  await expect(page.getByRole("button", { name: /TikTok/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(analysisRequested).toBe(false);
});

// Start static server used by SPA assets
test.beforeAll(async () => {
  const staticReady = require("./static-server");
  await staticReady;
});
