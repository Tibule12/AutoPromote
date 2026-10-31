// Restore a native backup through normal sign-in and UI in an independent browser.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { clickStudioControl } = require("../../test/e2e/playwright/studio-timeline-layout");
async function main() {
  const directory = path.resolve(process.argv[2]);
  const config = JSON.parse(fs.readFileSync(path.join(directory, "browser-private.json")));
  const runtime = JSON.parse(fs.readFileSync(path.join(directory, "config.json")));
  require("../../src/services/unifiedCredits/runtime").assertSandbox(runtime.env);
  assert.match(config.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(config.origin);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.locator("#login-email").fill(config.email);
    await page.locator("#login-password").fill(config.password);
    await page.locator("input[type=checkbox]").check();
    await page.locator("form button[type=submit]").click();
    await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page
      .getByLabel("Restore project backup", { exact: true })
      .setInputFiles(path.join(directory, "project-backup.autopromote.json"));
    await page.getByRole("button", { name: "Credit lifecycle local project", exact: true }).click();
    await page.locator(".viral-studio-container").waitFor();
    if (await page.getByRole("button", { name: "Show media", exact: true }).count())
      await page.getByRole("button", { name: "Show media", exact: true }).click();
    await clickStudioControl(page, page.getByTestId("studio-save-project"));
    await page.screenshot({ path: path.join(directory, "retirement-independent-restore.png") });
    fs.writeFileSync(
      path.join(directory, "independent-restore.json"),
      JSON.stringify(
        {
          freshBrowser: true,
          normalSignIn: true,
          nativeBackupImported: true,
          projectReopenedAndSaved: true,
          network: "loopback only",
        },
        null,
        2
      )
    );
    console.log("Independent native project restore passed.");
  } catch (error) {
    await page.screenshot({ path: path.join(directory, "independent-restore-failure.png") });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
