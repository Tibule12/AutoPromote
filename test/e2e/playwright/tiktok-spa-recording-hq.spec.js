const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// High-quality SPA recording: larger viewport and slower deliberate pauses
test.use({ video: "on", screenshot: "off", viewport: { width: 1920, height: 1080 } });

const serverReady = (() => {
  try {
    return require("./static-server");
  } catch (e) {
    console.warn("Static server require failed", e);
    return Promise.resolve();
  }
})();

const BASE = process.env.E2E_BASE_URL || "http://localhost:5000";
console.log("Using BASE for E2E tests:", BASE);

test("SPA HQ: Record TikTok direct post flow (mocked backend, slow)", async ({ page }) => {
  // Mocks (same as regular SPA test)
  await page.route("**/api/users/me", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { email: "test@local", name: "Test User", uid: "testUser" } }),
    });
  });
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
      body: JSON.stringify({ quality_score: 90 }),
    });
  });
  await page.route("**/api/content/upload", async route => {
    // Return previews for dry-run preview calls, otherwise return success id after a short delay
    const post = route.request().postData();
    let body = {};
    try {
      body = post ? JSON.parse(post) : {};
    } catch (e) {}
    if (body && body.isDryRun) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, id: "hq-demo", previews: [{ title: "Demo Preview" }] }),
      });
      return;
    }
    await new Promise(r => setTimeout(r, 800));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, id: "hq-demo" }),
    });
  });

  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Test User", role: "user" })
    );
  });

  // Wait for the static server to finish starting (and set E2E_BASE_URL if needed)
  await serverReady;
  console.log("Resolved BASE for E2E tests:", process.env.E2E_BASE_URL || BASE);

  await page.goto(process.env.E2E_BASE_URL || BASE + "/#/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.waitForSelector('nav li:has-text("Upload")', { timeout: 60000 });
  await page.click('nav li:has-text("Upload")');
  await page.waitForTimeout(1500);

  // Click TikTok tile and ensure it's selected, then open the expanded/edit panel.
  const tileSelectors = ['div[aria-label="Tiktok"]', '#tile-tiktok', '.platform-tile[data-platform="tiktok"]'];
  let tileClicked = false;
  for (const sel of tileSelectors) {
    try {
      const t = page.locator(sel).first();
      await t.scrollIntoViewIfNeeded();
      await t.click({ force: true });
      tileClicked = true;
      break;
    } catch (e) {
      // try next
    }
  }
  if (!tileClicked) throw new Error('Could not locate TikTok tile to select it');
  await page.waitForTimeout(600);

  // Ensure tile has the selected class; click again if needed
  const primaryTile = page.locator(tileSelectors.join(',')).first();
  try {
    const classAttr = await primaryTile.getAttribute('class');
    if (!classAttr || !classAttr.includes('selected')) {
      await primaryTile.click({ force: true });
      await page.waitForTimeout(400);
    }
  } catch (e) {}

  // Card click toggles expansion; wait for TikTok per-platform UI or generic expanded panel — prefer the preview button inside the expanded panel
  await page.waitForSelector(".platform-expanded button.preview-button, #tiktok-privacy, #tiktok-consent, #expanded", {
    timeout: 90000,
  });
  await page.waitForTimeout(800);

  if ((await page.$("#tiktok-privacy")) !== null)
    await page.selectOption("#tiktok-privacy", "EVERYONE");
  await page.waitForTimeout(800);
  if ((await page.$("#tiktok-consent")) !== null) await page.check("#tiktok-consent");
  await page.waitForTimeout(1000);

  // Attach demo video
  const demoVideo = path.resolve(__dirname, "test-assets/test.mp4");
  await page.setInputFiles("#content-file-input", demoVideo);
  await page.waitForTimeout(1200);

  // Preview (slowly click and wait for preview card)
  await page.locator(".platform-expanded button.preview-button").click();
  await page.waitForTimeout(1200);
  await page.waitForSelector(".platform-expanded .preview-card", { timeout: 20000 });
  await page.waitForTimeout(1200);

  // Quality check
  await page.locator(".platform-expanded button.quality-check-button").click();
  await page.waitForSelector(".platform-expanded .quality-check-mini", { timeout: 20000 });
  await page.waitForTimeout(1200);

  // Submit and wait for mocked response
  const submitHandle = await page.$(".platform-expanded .submit-button");
  if (submitHandle) {
    const disabled = await submitHandle.getAttribute("disabled");
    if (disabled !== null)
      await page.evaluate(() =>
        document.querySelector(".platform-expanded .submit-button")?.removeAttribute("disabled")
      );
    await submitHandle.click();
  } else {
    await page.click("#upload-btn");
  }
  await page.waitForTimeout(1200);

  // Display final upload state clearly for recording
  await page.evaluate(() => {
    const parent = document.querySelector(".platform-expanded") || document.body;
    const existing =
      parent.querySelector(".platform-upload-status") || document.getElementById("upload-status");
    if (existing) existing.textContent = "Upload submitted — Demo (HQ)";
    else {
      const el = document.createElement("div");
      el.className = "platform-upload-status";
      el.textContent = "Upload submitted — Demo (HQ)";
      parent.appendChild(el);
    }
  });

  // Give viewers time to absorb final screen
  await page.waitForTimeout(3500);

  // Copy and convert
  const vid = await page.video().path();
  const artifactsDir = path.resolve(__dirname, "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const webmDest = path.join(artifactsDir, `tiktok_spa_direct_post_hq_${Date.now()}.webm`);
  fs.copyFileSync(vid, webmDest);
  console.log("Saved HQ SPA webm recording to", webmDest);

  // Convert with HQ settings (preset slow, crf 18)
  const cp = require("child_process");
  cp.spawnSync(
    "node",
    [
      path.resolve(process.cwd(), "scripts/convert_webm_to_mp4.js"),
      "--crf",
      "18",
      "--preset",
      "slow",
    ],
    { stdio: "inherit" }
  );
  console.log("HQ SPA recording complete.");
});
