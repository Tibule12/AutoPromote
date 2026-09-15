/**
 * Basic Playwright config for AutoPromote E2E tests
 */
const { devices } = require("@playwright/test");
module.exports = {
  testDir: "./",
  timeout: 3 * 60 * 1000,
  use: {
    headless: process.env.PW_HEADFUL !== "1",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      // Video surfaces can be promoted to an overlay plane that Chromium's
      // headless screencast omits. Software composition keeps the real moving
      // footage in screenshots and retained test recordings.
      args:
        process.env.PW_HEADFUL === "1"
          ? ["--ozone-platform=x11"]
          : ["--disable-gpu"],
    },
    actionTimeout: 60000,
    extraHTTPHeaders: { "x-playwright-e2e": "1" },
    // Artifact captures for failed tests in CI/locally
    screenshot: "only-on-failure",
    video: process.env.PW_VIDEO || "retain-on-failure",
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
