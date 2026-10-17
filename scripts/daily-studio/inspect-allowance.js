#!/usr/bin/env node
// Read the actual signed-in Billing screen; never activate or change a plan.
const fs = require("node:fs"),
  path = require("node:path");
const { chromium } = require("playwright");
const c = require("./contract");
const root = path.resolve(__dirname, "../.."),
  date = c.validDate(process.argv[2] || c.localDate());
async function main() {
  const folder = path.join(c.dayRoot(root, date), "proof");
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  try {
    const context = await browser.newContext({
      storageState: path.join(root, c.policy.authState),
      viewport: { width: 1800, height: 1200 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const responses = [],
      mutations = [];
    page.on("request", request => {
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
        new URL(request.url()).pathname.startsWith("/api/paypal-subscriptions/")
      )
        mutations.push(request.method());
    });
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Billing", exact: true }).waitFor();
    const requests = ["status", "usage"].map(name =>
      page.waitForResponse(
        response =>
          new URL(response.url()).pathname === `/api/paypal-subscriptions/${name}` &&
          response.request().method() === "GET"
      )
    );
    await page.getByRole("button", { name: "Billing", exact: true }).click();
    for (const response of await Promise.all(requests)) {
      const value = await response.json();
      if (!response.ok()) throw Error(`Billing read failed (${response.status()})`);
      responses.push({ path: new URL(response.url()).pathname, status: response.status(), value });
    }
    if (mutations.length) throw Error("Billing check must be read-only");
    await page.waitForTimeout(500);
    fs.writeFileSync(
      path.join(folder, "billing-allowance.private.json"),
      JSON.stringify({ checkedAt: new Date().toISOString(), responses, mutations }, null, 2),
      { mode: 0o600 }
    );
    fs.writeFileSync(
      path.join(folder, "billing-allowance.private.txt"),
      await page.locator("body").innerText(),
      { mode: 0o600 }
    );
    await page.screenshot({ path: path.join(folder, "billing-allowance.png"), fullPage: true });
    const usage = responses.find(r => r.path.endsWith("/usage")).value.usage;
    console.log(JSON.stringify({ date, nativeBillingRead: true, usage, billingChanges: 0 }));
  } finally {
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
