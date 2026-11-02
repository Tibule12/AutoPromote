// Native project backup in the owned isolated application, using recorded normal sign-in.
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    storageState: path.join(directory, "browser-state.json"),
  });
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
    await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: "Credit lifecycle local project", exact: true }).click();
    await page.locator(".viral-studio-container").waitFor();
    if (await page.getByRole("button", { name: "Show media", exact: true }).count())
      await page.getByRole("button", { name: "Show media", exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45000 }),
      clickStudioControl(
        page,
        page.getByRole("button", {
          name: "Download project backup",
          exact: true,
          includeHidden: true,
        })
      ),
    ]);
    await download.saveAs(path.join(directory, "project-backup.autopromote.json"));
    console.log("Native project backup saved.");
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
