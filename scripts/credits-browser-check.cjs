/* global document, window */
const assert = require("assert/strict");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { chromium } = require("@playwright/test");
const { createSandboxDatabase } = require("../src/services/unifiedCredits/runtime");
const { createMockVerifier } = require("../src/services/unifiedCredits/rewardProof");
const { createWalletService } = require("../src/services/unifiedCredits/wallet");
const { createSandboxApp } = require("../src/routes/unifiedCreditsSandboxRoutes");
const {
  createEmulatorWorker,
  createDispatcher,
} = require("../src/services/unifiedCredits/dispatch");

async function main() {
  const db = createSandboxDatabase();
  const verifier = createMockVerifier(crypto.randomBytes(32).toString("hex"));
  const service = createWalletService({
    db,
    verifier,
    policy: require("../config/unified-credits.sandbox.example.json"),
  });
  await service.initialiseControl();
  await service.enroll("demo-free");
  await service.enroll("demo-premium", { tier: "premium" });
  const server = require("http").createServer();
  server.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const dispatcher = createDispatcher({ db, service, worker: createEmulatorWorker({ db }) });
  server.on("request", createSandboxApp({ service, verifier, dispatcher, origin }));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [],
      external = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      if (!route.request().url().startsWith(`${origin}/`)) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const { expect } = require("@playwright/test");
    await page.goto(origin);
    await expect(page.locator("#balance")).toHaveText("15");
    await expect(page.locator("#watch")).toBeEnabled();
    await page.screenshot({
      path: path.join(os.tmpdir(), "autopromote-credits-desktop.png"),
      fullPage: true,
    });
    await page.locator("#notes").fill("Unfinished project stays safe during no fill");
    await page.locator("#save").click();
    await page.locator("#ad-availability").selectOption("no_fill");
    await page.locator("#watch").click();
    await expect(page.locator("#status")).toContainText("No ad available");
    await expect(page.locator("#ad")).not.toBeVisible();
    await expect(page.locator("#balance")).toHaveText("15");
    await expect(page.locator("#notes")).toHaveValue(
      "Unfinished project stays safe during no fill"
    );
    await page.locator("#ad-availability").selectOption("available");
    await page.locator("#watch").click();
    await expect(page.locator("#ad")).toBeVisible();
    await page.locator("#skip").click();
    await expect(page.locator("#ad")).not.toBeVisible();
    await expect(page.locator("#balance")).toHaveText("15");
    await page.locator("#watch").click();
    await page.locator("#complete").click();
    await expect(page.locator("#balance")).toHaveText("16");
    await page.locator("#run").click();
    await expect(page.locator("#balance")).toHaveText("15");
    await page.locator("#fail").click();
    await expect(page.locator("#status")).toContainText("refunded");
    await expect(page.locator("#balance")).toHaveText("15");
    const uidHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(["demo-free"]))
      .digest("hex");
    await db
      .collection("credits_v2_wallets")
      .doc(uidHash)
      .update({ balance: 0, expiring: 0, permanent: 0 });
    await page.reload();
    await expect(page.locator("#balance")).toHaveText("0");
    await expect(page.locator("#run")).toBeDisabled();
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator("#notes").fill("Keep creating at zero credits");
    await page.locator("#save").click();
    await page.reload();
    await expect(page.locator("#notes")).toHaveValue("Keep creating at zero credits");
    await expect(page.locator("#account")).toBeEnabled();
    await page.locator("#account").selectOption("demo-premium");
    await expect(page.locator("#balance")).toHaveText("150");
    await expect(page.locator("#watch")).toBeDisabled();
    await expect(page.locator("#watch")).toBeHidden();
    await expect(page.locator("#reward-copy")).toContainText("ad-free");
    await expect(page.locator("#account")).toBeEnabled();
    await page.locator("#account").selectOption("demo-free");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#balance")).toHaveText("0");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true
    );
    await page.screenshot({
      path: path.join(os.tmpdir(), "autopromote-credits-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      "Browser checks passed: opt-in, skip, reward, cost, consumption, refund, zero-credit saving, subscriber and mobile layout."
    );
    console.log(
      `Screenshots: ${path.join(os.tmpdir(), "autopromote-credits-desktop.png")} and ${path.join(os.tmpdir(), "autopromote-credits-mobile.png")}`
    );
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await db.terminate();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
