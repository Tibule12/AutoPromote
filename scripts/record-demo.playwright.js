// scripts/record-demo.playwright.js
// Simple Playwright script to record a flow using the mock backend.
// Usage: npx playwright install && node scripts/record-demo.playwright.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ recordVideo: { dir: 'tmp/videos', size: { width: 1280, height: 720 } } });
  const page = await context.newPage();

  try {
    // Navigate to demo page
    await page.goto('http://localhost:5000/tiktok-demo', { waitUntil: 'networkidle' });

    // Wait a short moment to capture the page
    await page.waitForTimeout(2000);

    // (Optional) You can add automated interactions here if you host a test flow locally
    // e.g., click a button: await page.click('text=Sign in with TikTok');

    // Wait long enough for the video to capture sample activity
    await page.waitForTimeout(5000);

    // Close context to flush video to disk
    await context.close();
    console.log('Recorded video saved to tmp/videos (check the latest file)');
  } catch (e) {
    console.error('Recording failed', e);
  } finally {
    await browser.close();
  }
})();
