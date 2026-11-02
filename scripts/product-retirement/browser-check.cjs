// Ordinary App controls against an owned demo only. No sessions/graphs/results are injected.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
async function main() {
  const directory = path.resolve(process.argv[2]);
  const config = JSON.parse(fs.readFileSync(path.join(directory, "browser-private.json")));
  const privateConfig = JSON.parse(fs.readFileSync(path.join(directory, "config.json")));
  require("../../src/services/unifiedCredits/runtime").assertSandbox(privateConfig.env);
  assert.match(config.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    recordVideo: { dir: path.join(directory, "retirement-recordings") },
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [],
    checks = [];
  page.on("pageerror", error => errors.push(error.message));
  const retired = /\bAnalytics\b|Smart Promo|Idea.to.Video/i;
  const checkActions = async () => {
    const names = await page.getByRole("button").or(page.getByRole("link")).allInnerTexts();
    assert(
      !names.some(name => retired.test(name)),
      names.filter(name => retired.test(name)).join(";")
    );
  };
  const heading = async title =>
    page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
  try {
    // A signed-out old link must retain its Studio destination through normal login.
    await page.goto(`${config.origin}/#/idea-to-video`);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await checkActions();
    assert(!retired.test(await page.locator(".auth-container").innerText()));
    await page.locator("#login-email").fill(config.email);
    await page.locator("#login-password").fill(config.password);
    await page.locator("input[type=checkbox]").check();
    await page.locator("form button[type=submit]").click();
    await page.getByTestId("shared-credit-balance").waitFor();
    await heading("Viral Clip Studio");
    checks.push("normal sign-in retains retired-link Studio destination");
    await context.storageState({ path: path.join(directory, "browser-state.json") });
    for (const [name, title] of [
      ["Overview", "Overview"],
      ["Cam Combiner", "Cam Combiner"],
      ["Find Viral Clips", "Find Viral Clips"],
      ["Viral Clip Studio", "Viral Clip Studio"],
      ["Publisher", "Publisher"],
      ["Queue", "Schedule"],
      ["Billing", "Billing"],
    ]) {
      await page.getByRole("button", { name, exact: true }).first().click();
      await heading(title);
      await checkActions();
      checks.push(`native dashboard opens ${name}`);
    }
    await page.getByRole("button", { name: "Overview", exact: true }).first().click();
    await page.screenshot({ path: path.join(directory, "retirement-desktop.png"), fullPage: true });
    for (const alias of [
      "analytics",
      "metrics",
      "smart-promo",
      "smart_promo",
      "smartpromo",
      "idea-to-video",
      "idea_to_video",
      "idea-video",
      "idea_video",
    ]) {
      await page.goto(`${config.origin}/#/${alias}`);
      await heading(["analytics", "metrics"].includes(alias) ? "Schedule" : "Viral Clip Studio");
      await checkActions();
      checks.push(`old /${alias} redirects to active workspace`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(config.origin);
    await page.getByRole("navigation", { name: "Mobile bottom navigation" }).waitFor();
    const mobile = page.getByRole("navigation", { name: "Mobile bottom navigation" });
    assert.equal(await mobile.getByRole("button").count(), 4);
    await checkActions();
    await page.screenshot({ path: path.join(directory, "retirement-mobile.png"), fullPage: true });
    checks.push("mobile navigation contains four active destinations");
    // Public pages and onboarding are visited signed out through their normal entry.
    const anonymous = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await anonymous.route("**/*", route =>
      new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort()
    );
    const publicPage = await anonymous.newPage();
    for (const route of ["/", "/#/features", "/#/pricing", "/#/help"]) {
      await publicPage.goto(config.origin + route);
      await publicPage.waitForTimeout(800);
      assert(!retired.test(await publicPage.locator("main").innerText()), route);
      checks.push(`public ${route} contains no retired product offer`);
    }
    await publicPage.goto(config.origin);
    await publicPage
      .getByRole("button", { name: /Get Started|Start Creating|Create Account/ })
      .first()
      .click();
    assert(!retired.test(await publicPage.locator(".auth-container").innerText()));
    checks.push("registration copy contains no retired offers");
    await anonymous.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(directory, "retirement-browser.json"),
      JSON.stringify(
        {
          checks,
          errors,
          network: "loopback only",
          actualApp: true,
          syntheticAuth: false,
          productionWrites: 0,
        },
        null,
        2
      )
    );
    console.log(`PASS ${checks.length} actual application retirement checks`);
  } catch (error) {
    await page.screenshot({ path: path.join(directory, "retirement-failure.png"), fullPage: true });
    fs.writeFileSync(
      path.join(directory, "retirement-failure.json"),
      JSON.stringify({ checks, errors, failure: error.message, url: page.url() }, null, 2)
    );
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
