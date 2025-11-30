/**
 * Basic Playwright config for AutoPromote E2E tests
 */
const { devices } = require('@playwright/test');
module.exports = {
  testDir: './',
  timeout: 3 * 60 * 1000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 60000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
};
