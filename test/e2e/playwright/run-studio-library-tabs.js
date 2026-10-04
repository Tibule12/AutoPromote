#!/usr/bin/env node
// Check the selected library panes against the compiled production stylesheet.
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { assertStudioTimelineLayout } = require("./studio-timeline-layout");
const root = path.resolve(__dirname, "../../..");
const boot = JSON.parse(fs.readFileSync(path.join(root,
  "artifacts/studio-analysis-browser-20261004/bootstrap.json"), "utf8"));
assert.equal(boot.projectId, "autopromote-staging-2026");

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const checks = [], errors = [];
  let submittedJobs = 0;
  page.on("pageerror", error => errors.push(error.message.replace(/https?:\/\/\S+/g, "[URL]")));
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/studio-analysis-jobs")) submittedJobs++;
  });
  try {
    await page.goto(`http://127.0.0.1:${Number(process.env.STUDIO_BROWSER_PORT || 5006)}`);
    await page.waitForFunction(() => typeof window.__STUDIO_STAGING_SIGN_IN === "function");
    await page.evaluate(token => window.__STUDIO_STAGING_SIGN_IN(token), boot.customToken);
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    for (const [width, height] of [[1440, 1000], [1280, 800], [1000, 800]]) {
      await page.setViewportSize({ width, height });
      for (const tab of ["Sequence", "Moments", "Media"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        const selector = tab === "Media" ? ".studio-media-bin" :
          `#studio-library-panel-${tab.toLowerCase()}`;
        assert(await page.locator(selector).isVisible(), `${tab} pane must be visible`);
        assert.equal(await page.locator(".studio-project-rail").getAttribute("data-active-tab"), tab.toLowerCase());
        if (tab !== "Media") assert(await page.locator(".studio-media-bin").isHidden());
        if (tab === "Sequence") assert.equal(await page.locator(`${selector} .studio-project-item`).count(), 1);
        checks.push(await assertStudioTimelineLayout(page, `${width}x${height} / ${tab} tab`));
      }
    }
    assert.deepEqual(errors, []);
    assert.equal(submittedJobs, 0);
    const files = ["frontend/src/components/ViralClipStudio.css", "test/e2e/playwright/run-studio-library-tabs.js"];
    const receipt = { passed: true, completedAt: new Date().toISOString(),
      scope: "Compiled production component and CSS; real staging Firebase sign-in; selected library pane visibility at three desktop sizes",
      submittedJobs, pageErrors: errors, checks,
      testedSourceHashes: Object.fromEntries(files.map(file => [file,
        crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])),
      testedBundleSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root,
        "artifacts/studio-analysis-browser-20261004/build/static/js/bundle.js"))).digest("hex") };
    fs.writeFileSync(path.join(root, "reports/studio-timeline-layout-20261004/library-tabs.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify({ passed: true, checks: checks.length, submittedJobs }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
