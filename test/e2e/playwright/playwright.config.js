/**
 * Basic Playwright config for AutoPromote E2E tests
 */
const { devices } = require("@playwright/test");
module.exports = {
  testDir: "./",
  timeout: 3 * 60 * 1000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 60000,
    extraHTTPHeaders: { "x-playwright-e2e": "1" },
    // Artifact captures for failed tests in CI/locally
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  reporter: [
    ["list"],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["html", { outputFolder: "test-results/html-report" }],
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
};
