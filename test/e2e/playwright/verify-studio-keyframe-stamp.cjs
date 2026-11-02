#!/usr/bin/env node
// Run against a separate run-studio-interaction-preview.js loopback fixture.
// Actual Studio controls; fresh signed-out browser; no user media or API writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "reports/studio-keyframe-stamp-20261031");
const origin = "http://127.0.0.1:5043";
const projectName = "Keyframe local pose regression 20261031";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const waitPaint = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--disable-gpu"] });
  const errors = [], blocked = [], apiRequests = [];
  const results = [];
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
        blocked.push(url.origin);
        return route.abort();
      }
      if (url.pathname.startsWith("/api/")) apiRequests.push(url.pathname);
      return route.continue();
    });
    page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto(`${origin}/?fixture=motionflow`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
    assert.equal(await page.evaluate(() => !!window.__E2E_BYPASS), false);
    await page.locator("video,audio").evaluateAll(nodes => nodes.forEach(el => { el.muted = true; el.pause(); }));
    await page.getByTestId("studio-mode-fxflow").click();
    await page.getByTestId("studio-comp-workbench").waitFor();
    const pause = async () => {
      for (const name of ["Pause edited preview", "Pause comparison"]) {
        const control = page.getByRole("button", { name, exact: true });
        if (await control.isVisible()) await control.click();
      }
      await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.paused === true);
    };
    const seek = async time => {
      await pause();
      await page.getByRole("slider", { name: "Edited output position" }).evaluate((el, value) => {
        el._valueTracker?.setValue("__seek__");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, time);
      await page.waitForFunction(t => {
        const v = document.querySelector('[data-testid="studio-after-video"]');
        return v && !v.seeking && Math.abs(v.currentTime - t) < .04;
      }, time);
      await waitPaint(page);
    };
    const targetProperty = page.getByLabel("Motion driver target property", { exact: true });
    const keyButton = page.getByTestId("comp-add-keyframe-playhead");
    const keyValue = page.getByLabel("Selected keyframe value", { exact: true });
    const readPlate = async () => {
      await waitPaint(page);
      return page.locator('[data-studio-layer-id="fill-cyan"]').evaluate(el => ({
        top: el.style.top, left: el.style.left, transform: getComputedStyle(el).transform,
        rotation: el.style.getPropertyValue("--title-rotation"),
        scale: el.style.getPropertyValue("--title-scale"), opacity: el.style.opacity,
      }));
    };
    const save = async () => {
      const show = page.getByRole("button", { name: "Show media", exact: true });
      if (await show.isVisible()) await show.click();
      const head = page.locator(".studio-project-rail__head");
      if (!(await head.evaluate(el => el.open))) await head.locator(":scope > summary").click();
      await page.getByRole("textbox", { name: "Project name" }).fill(projectName);
      await page.getByTestId("studio-save-project").click();
      await page.waitForFunction(() => document.querySelector(".studio-project-save-state")?.classList.contains("is-saved"));
      return page.evaluate(name => window.__compileSavedStudioProjectForParity(name), projectName);
    };

    // Rotate the parent, then parent the child through the ordinary selector.
    await seek(0);
    await page.getByTestId("comp-add-null-rig").click();
    const rigId = (await page.locator('[data-testid^="null-rig-gizmo-"]').getAttribute("data-testid"))
      .replace("null-rig-gizmo-", "");
    await targetProperty.selectOption("rotation");
    await keyButton.click();
    await keyValue.fill("45");
    await page.getByLabel("Parent layer for Cyan Fill Plate", { exact: true }).selectOption(rigId);
    await page.getByTestId("comp-layer-row-fill-cyan").locator(".ap-comp-layer-title").click();
    await seek(1.25);
    const beforeParentedStamp = await readPlate();
    await keyButton.click();
    assert.equal(Number(await keyValue.inputValue()), -45);
    assert.deepEqual(await readPlate(), beforeParentedStamp);
    results.push({ check: "Parented rotation key retains local -45 degrees and visible world pose", before: beforeParentedStamp, after: await readPlate() });

    // A live spin remains separate from its authored rotation key.
    await page.getByLabel("Motion driver expression type", { exact: true }).selectOption("spin");
    await seek(2);
    const beforeDrivenStamp = await readPlate();
    await keyButton.click();
    assert.equal(Number(await keyValue.inputValue()), -45);
    assert.deepEqual(await readPlate(), beforeDrivenStamp);
    results.push({ check: "Parenting plus spin applies the driver once when stamping", before: beforeDrivenStamp, after: await readPlate() });
    const saved = await save();
    const documentSha256 = sha(JSON.stringify(saved.studioDocument));
    fs.writeFileSync(path.join(folder, "native-compiled-project.json"), JSON.stringify(saved, null, 2));
    await page.screenshot({ path: path.join(folder, "parented-driven-stamp.png") });

    // Undo/redo uses the actual editor history and restores the same document.
    await page.getByTestId("comp-layer-row-fill-cyan").locator(".ap-comp-layer-title").click();
    await seek(2.5);
    await keyButton.click();
    assert.equal(Number(await keyValue.inputValue()), -45);
    await page.keyboard.press("Control+z");
    const undone = await save();
    const authoredKeys = doc => doc.studioDocument.linkedTiming.keys.motionKeyframes;
    assert.deepEqual(authoredKeys(undone), authoredKeys(saved));
    await page.keyboard.press("Control+Shift+z");
    const redone = await save();
    assert.equal(authoredKeys(redone).length, authoredKeys(saved).length + 1);
    results.push({ check: "Ordinary Undo/Redo retains authored key values", keyCountBefore: authoredKeys(saved).length, keyCountAfterRedo: authoredKeys(redone).length });

    await page.goto(`${origin}/?fixture=motionflow&reloaded=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
    await page.locator("video,audio").evaluateAll(nodes => nodes.forEach(el => { el.muted = true; el.pause(); }));
    await pause();
    const showMedia = page.getByRole("button", { name: "Show media", exact: true });
    if (await showMedia.isVisible()) await showMedia.click();
    const head = page.locator(".studio-project-rail__head");
    if (!(await head.evaluate(el => el.open))) await head.locator(":scope > summary").click();
    const projects = page.locator(".studio-saved-projects");
    if (!(await projects.evaluate(el => el.open))) await projects.locator(":scope > summary").click();
    await projects.locator("article > button").filter({ hasText: projectName }).click();
    await page.getByTestId("studio-mode-fxflow").click();
    await page.getByTestId("comp-layer-row-fill-cyan").locator(".ap-comp-layer-title").click();
    await seek(2);
    assert.deepEqual(await readPlate(), beforeDrivenStamp);
    const reopened = await page.evaluate(name => window.__compileSavedStudioProjectForParity(name), projectName);
    assert.deepEqual(reopened.studioDocument, redone.studioDocument);
    results.push({ check: "Cold saved-project reopen retains exact canonical document and driven preview pose", sha256: sha(JSON.stringify(reopened.studioDocument)) });
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    assert.deepEqual(blocked, []);
    const receipt = { passed: true, scope: "Signed-out actual Studio component on isolated loopback fixture; no normal-account export or creative qualification", documentSha256, results, errors, apiRequests, blocked, gpuJobs: 0, paidGenerationRequests: 0 };
    fs.writeFileSync(path.join(folder, "browser-receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } catch (error) {
    const state = page && !page.isClosed() ? await page.evaluate(() => ({
      video: Array.from(document.querySelectorAll("video")).map(el => ({ time: el.currentTime, seeking: el.seeking, paused: el.paused, readyState: el.readyState })),
      slider: document.querySelector('[aria-label="Edited output position"]')?.value,
      body: document.body.innerText.slice(-2500),
    })).catch(() => null) : null;
    fs.writeFileSync(path.join(folder, `browser-failure-${Date.now()}.json`), JSON.stringify({ message: error.message, stack: error.stack, results, errors, blocked, apiRequests, state }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
