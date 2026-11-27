const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert/strict');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/tibule12/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  try {
    await page.goto('http://127.0.0.1:5067/#/education/lessons/bubble-sort');
    const guide = page.locator('.edu-click-guide');
    const video = guide.getByLabel('Workspace → upload → Graphics → scroll → Copy → visible result', { exact: true });
    await video.waitFor();
    assert.equal(await page.locator('video track').count(), 0);
    assert.equal(await guide.locator('.edu-steps > li').count(), 12);
    assert.equal(await page.getByRole('group', { name: 'Short walkthrough chapters', exact: true }).count(), 0);
    await video.evaluate(element => element.load());
    await page.waitForFunction(() => document.querySelector('.edu-click-guide video')?.readyState >= 2);
    const metadata = await video.evaluate(async element => {
      await element.play();
      return { duration: element.duration, source: element.currentSrc };
    });
    assert(metadata.source.includes('first-swap-continuous-navigation.mp4'));
    assert(metadata.duration > 60 && metadata.duration < 80);
    await page.waitForFunction(() => document.querySelector('.edu-click-guide video')?.currentTime > 0.3);
    await video.evaluate(element => element.pause());
    await page.screenshot({ path: 'reports/education-phase1-20261124/continuous-navigation-player.png' });
    fs.writeFileSync('reports/education-phase1-20261124/continuous-navigation-player.json', JSON.stringify({
      actualEducationComponents: true,
      htmlVideoTracks: 0,
      writtenNavigationSteps: 12,
      continuousVideo: true,
      playbackVerified: true,
      durationSeconds: metadata.duration,
      normalPublicRelease: false,
    }, null, 2));
    console.log('Actual lesson player: continuous video plays, twelve navigation steps, zero captions.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
