// Actual encoded movie in an ordinary HTML video element, headless and muted.
// These are declared frame-fit simulations, never fabricated platform screens.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const folder = path.join(__dirname, 'proof/reading-lesson', process.argv[2] || 'corrected-tutorial');
(async () => {
  const movie = path.join(folder, 'final/final.mp4'); assert(fs.existsSync(movie));
  const html = path.join(folder, 'phone-fit-check.html');
  fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>Actual movie — frame-fit check</title>' +
    '<style>html,body{margin:0;background:#14131f}video{display:block;width:100vw;height:100vh;object-fit:contain}</style>' +
    '<video muted playsinline preload="auto" src="final/final.mp4"></video>');
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const records = [];
  try {
    for (const [name, width, height, fit] of [['phone-390-contain', 390, 844, 'contain'],
      ['phone-390-fill', 390, 844, 'cover'], ['feed-4-5-fill', 400, 500, 'cover']]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.goto(pathToFileURL(html).href);
      const video = page.locator('video');
      await video.evaluate((v, mode) => { v.style.objectFit = mode; }, fit);
      await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
      for (const time of [2.5, 13, 22, 32, 39, 55]) {
        await video.evaluate((v, t) => { v.currentTime = t; }, time);
        await page.waitForFunction(t => { const v = document.querySelector('video');
          return !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - t) < .02; }, time);
        await page.waitForTimeout(100);
        const file = `${name}-${time}.png`;
        await page.screenshot({ path: path.join(folder, file) });
        records.push({ name, width, height, fit, time, file });
      }
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(folder, 'phone-fit-observation.json'), JSON.stringify({
    actualNativeExport: true, fabricatedPlatformUI: false, externalPlatformOrPhysicalDeviceVerified: false,
    observations: records, limitation: 'HTML contain/centre-fill scenarios assess composition only. They do not certify actual iOS platform player controls or device-specific cropping.',
  }, null, 2) + '\n');
  console.log('Actual movie inspected in three declared phone/feed frame-fit scenarios.');
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
