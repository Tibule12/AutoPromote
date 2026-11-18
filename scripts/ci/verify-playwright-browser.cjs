"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

// The CI image supplies browsers and system libraries. Fail clearly if an SDK
// update needs a matching image update, rather than downloading another browser
// or silently using a different Chromium revision.
async function verifyPlaywrightBrowser() {
  const executable = chromium.executablePath();
  assert(fs.existsSync(executable),
    `Playwright's locked Chromium is missing at ${executable}. Update the pinned CI image to match package-lock.json.`);
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--mute-audio"] });
  try {
    const page = await browser.newPage();
    await page.goto("data:text/html,<title>AutoPromote browser setup</title>");
    assert.equal(await page.title(), "AutoPromote browser setup");
    console.log(`Verified Playwright ${require("playwright/package.json").version}, Chromium ${browser.version()}.`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) verifyPlaywrightBrowser().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { verifyPlaywrightBrowser };
