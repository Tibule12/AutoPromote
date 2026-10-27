/* global document, window */
// Explicit sample-only, anonymous browser check. No Firebase/wallet imported.
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { createGoogleTestApp } = require("./credits-google-test.cjs");
async function main() {
  process.env.GOOGLE_REWARDED_TEST_ONLY = "true";
  const app = createGoogleTestApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const result = {
    testUnit: "/22639388115/rewarded_web_example",
    publisherInventoryUsed: false,
    creditsAwarded: 0,
    walletApiRequests: 0,
    states: [],
    externalHosts: [],
    advertisementDisplayed: false,
  };
  try {
    browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const hosts = new Set();
    await page.addInitScript(() => {
      window.__googleTestStates = [];
      document.addEventListener("google-test-state", event =>
        window.__googleTestStates.push(event.detail)
      );
    });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) hosts.add(url.hostname);
      if (url.origin === origin && url.pathname.startsWith("/api/")) {
        result.walletApiRequests++;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(origin);
    await page.locator("#test-consent").check();
    await page.locator("#request-test").click();
    await page.waitForFunction(
      () =>
        [
          "ready",
          "unsupported",
          "no_fill",
          "no_fill_or_blocked",
          "sdk_blocked",
          "sdk_timeout",
          "api_ready_timeout",
        ].includes(document.getElementById("google-status").dataset.state),
      {},
      { timeout: 35000 }
    );
    const state = await page.locator("#google-status").getAttribute("data-state");
    result.states.push(state);
    if (state === "ready" && process.argv.includes("--display")) {
      await page.locator("#show-test").click();
      result.advertisementDisplayed = true;
      await page
        .waitForFunction(
          () =>
            [
              "client_reward_event",
              "closed_after_client_event",
              "closed_without_reward",
              "not_visible",
            ].includes(document.getElementById("google-status").dataset.state),
          {},
          { timeout: 30000 }
        )
        .catch(() => {});
      result.states.push(await page.locator("#google-status").getAttribute("data-state"));
    }
    // Fullscreen test creative covers the page. Invoke only our own cleanup control;
    // never click an advertisement or alter Google's creative controls.
    await page.evaluate(() => document.getElementById("dismiss-test").click());
    result.states = await page.evaluate(() => window.__googleTestStates.map(event => event.state));
    result.externalHosts = [...hosts].sort();
    result.observation =
      "Google test availability only; browser events do not authenticate a paid reward.";
    if (result.walletApiRequests !== 0) throw new Error("Wallet isolation failed");
  } finally {
    await browser?.close();
    await new Promise(r => server.close(r));
  }
  const file = path.resolve(
    __dirname,
    "../docs/monetization/evidence/20261027/google-test-browser.json"
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ ...result, observedAtUtc: new Date().toISOString() }, null, 2) + "\n"
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
