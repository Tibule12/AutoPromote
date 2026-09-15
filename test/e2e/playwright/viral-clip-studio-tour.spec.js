const { test } = require('@playwright/test');

test('record full edit of cam-combiner clip', async ({ page }) => {
  // Give ample time for a full demo
  test.setTimeout(120000);
  
  await page.goto('http://localhost:3000/studio');
  
  // Wait for studio to load
  await page.waitForTimeout(3000);

  // Upload the video
  const fileInput = await page.locator('input[type="file"]').first();
  await fileInput.setInputFiles('/home/tibule12/Videos/cam-combiner-c8dea340-49de-49e2-830f-abdebb2d2f5c.mp4');
  
  // Wait for processing to start
  await page.waitForTimeout(5000);
  
  // Try to upload the background audio as well
  try {
    const audioInput = await page.locator('input[type="file"][accept*="audio"]').first();
    if (audioInput) {
      await audioInput.setInputFiles('/home/tibule12/Videos/cam-combiner-c8dea340-background-only-pan.wav');
      await page.waitForTimeout(3000);
    }
  } catch (e) {
    console.log("No audio input found or failed", e);
  }

  // Click on editing features
  // 1. Sync button
  try {
    const syncBtn = await page.locator('button:has-text("Sync")').first();
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch(e) {}
  
  // 2. Captions / Subtitles
  try {
    const capBtn = await page.locator('button:has-text("Captions")').first();
    if (await capBtn.isVisible()) {
      await capBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch(e) {}

  // 3. Solo Speaker
  try {
    const trackBtn = await page.locator('button:has-text("Solo Speaker")').first();
    if (await trackBtn.isVisible()) {
      await trackBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch(e) {}

  // Wait for UI to stabilize and show the edits
  await page.waitForTimeout(10000);
  
  // Export/Render
  try {
    const exportBtn = await page.locator('button:has-text("Export"), button:has-text("Render")').first();
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
      await page.waitForTimeout(5000);
    }
  } catch(e) {}

});
