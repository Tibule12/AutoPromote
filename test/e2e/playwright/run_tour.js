const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/studio');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/tibule12/.gemini/antigravity/brain/ab91abb8-63b8-4e8b-88b7-02714db529aa/debug1.png' });
  await browser.close();
})();
