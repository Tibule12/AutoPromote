const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// Enable full video recording for this file
test.use({ video: "on", screenshot: "off" });

// Start a small static server on an ephemeral port that serves the fixture page
const express = require("express");
const fixtureServer = express();
fixtureServer.use(express.static(path.join(__dirname, "../fixtures")));
let serverHandle = null;
const startServer = () =>
  new Promise(resolve => {
    serverHandle = fixtureServer.listen(0, "127.0.0.1", () => {
      const p = serverHandle.address().port;
      console.log("Started ephemeral fixture server on port", p);
      resolve(`http://127.0.0.1:${p}`);
    });
  });
const stopServer = () => new Promise(resolve => serverHandle && serverHandle.close(resolve));
let BASE = process.env.E2E_BASE_URL || null;

test("Record TikTok direct post flow and save video", async ({ page }) => {
  // Mock creator_info to show TikTok connected state and bypass auth
  await page.route("**/api/tiktok/creator_info", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ raw: { tiktok: { connected: true, meta: {} } } }),
    });
  });

  // Mock upload endpoint to succeed so the flow completes
  await page.route("**/api/content/upload", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, id: "demo-upload-1" }),
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

  // Use the lightweight upload component fixture to make recording deterministic
  if (!BASE) BASE = await startServer();
  await page.goto(BASE + "/upload_component_test_page.html", { waitUntil: "networkidle" });

  // Click TikTok tile and expand on the fixture page
  await page.waitForSelector("#tile-tiktok", { timeout: 10000 });
  await page.click("#tile-tiktok");
  await page.waitForSelector("#expanded", { timeout: 10000 });

  // Set privacy and consent (Direct Post requirements)
  await page.selectOption("#tiktok-privacy", "EVERYONE");
  await page.check("#tiktok-consent");

  // Attach demo video from test assets
  const demoVideo = path.resolve(__dirname, "test-assets/test.mp4");
  await page.setInputFiles("#content-file-input", demoVideo);

  // Ensure upload button is enabled and click upload
  await page.waitForSelector("#upload-btn:not([disabled])", { timeout: 10000 });
  const uploadPromise = page.waitForResponse(res => res.url().includes("/api/content/upload"));
  await page.click("#upload-btn");
  await uploadPromise;

  // Give Playwright a moment to finalize the video
  await page.waitForTimeout(1000);

  // Capture video path and copy to artifacts folder for easy access
  const videoPath = await page.video().path();
  const artifactsDir = path.resolve(__dirname, "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const dest = path.join(artifactsDir, `tiktok_direct_post_${Date.now()}.webm`);
  fs.copyFileSync(videoPath, dest);

  console.log("Saved recording to", dest);
  expect(fs.existsSync(dest)).toBeTruthy();
  // Stop the local fixture server
  await stopServer();
});
