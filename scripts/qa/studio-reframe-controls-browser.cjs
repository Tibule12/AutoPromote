// Normal controls in the actual signed-in App; no state/response injection.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
async function main() {
  const directory = path.resolve(process.argv[2]);
  const config = JSON.parse(fs.readFileSync(path.join(directory, "browser-private.json")));
  assert.equal(new URL(config.origin).hostname, "127.0.0.1");
  const file = name => path.join(directory, "controls-" + name);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    storageState: path.join(directory, "browser-state.json"), recordVideo: { dir: path.join(directory, "recordings") } });
  const evidence = { actualApp: true, headlessMuted: true, steps: [], external: [], errors: [] };
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || ["blob:", "data:"].includes(url.protocol)) return route.continue();
    evidence.external.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", error => evidence.errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  const record = step => { evidence.steps.push(step); fs.writeFileSync(file("observation.json"), JSON.stringify(evidence, null, 2)); console.log("PASS:", step); };
  const library = async () => {
    const show = page.getByRole("button", { name: "Show media", exact: true }); if (await show.isVisible()) await show.click();
    const head = page.locator(".studio-project-rail__head"); if (!await head.evaluate(node => node.open)) await head.locator(":scope > summary").click();
  };
  const backup = async name => {
    await library();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download project backup", exact: true }).click()]);
    await download.saveAs(file(name + ".autopromote.json")); return JSON.parse(fs.readFileSync(file(name + ".autopromote.json"))).snapshot;
  };
  const tool = name => page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name, exact: true }).click();
  const pause = async () => { const button = page.getByRole("button", { name: "Pause comparison", exact: true }); if (await button.isVisible()) await button.click(); };
  try {
    await page.goto(config.origin); await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: "Moments and framing recovery v2", exact: true }).click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await backup("original");
    await tool("Reframe"); await pause();
    const slider = page.getByLabel("Edited output position", { exact: true });
    await slider.press("Home");
    await page.getByTestId("reframe-follow-subject").click();
    await page.getByRole("button", { name: /Left Speaker$/ }).click();
    assert.equal(Number(await page.getByLabel("Manual frame horizontal position", { exact: true }).inputValue()), 28);
    await page.getByRole("button", { name: /Right Speaker$/ }).click();
    assert.equal(Number(await page.getByLabel("Manual frame horizontal position", { exact: true }).inputValue()), 72);
    await page.getByLabel("Framing point transition", { exact: true }).selectOption("smooth");
    const smooth = await backup("smooth"); assert.equal(smooth.reframeKeyframes.find(k => k.id === smooth.activeReframeKeyframeId).cut, false);
    await page.getByRole("button", { name: /Alternate Speakers$/ }).click();
    const alternate = await backup("alternate"); assert(alternate.reframeKeyframes.length >= 2); assert(alternate.reframeKeyframes.every(k => k.cut === true));
    record("Left/Right speaker positions and editable smooth/cut transitions; Alternate Speakers creates actual cuts");
    await page.getByRole("button", { name: "Remove correction", exact: true }).click();
    const removed = await backup("removed"); assert.equal(removed.reframeKeyframes.length, alternate.reframeKeyframes.length - 1);
    await page.getByTestId("studio-undo-button").click();
    assert.equal((await backup("undo")).reframeKeyframes.length, alternate.reframeKeyframes.length);
    await page.getByTestId("studio-redo-button").click();
    assert.equal((await backup("redo")).reframeKeyframes.length, removed.reframeKeyframes.length);
    await page.getByTestId("studio-undo-button").click();
    record("Remove correction → Undo → Redo → Undo restores the reviewed timed marks");
    await slider.press("Home");
    await page.getByTestId("reframe-preserve-frame").click();
    await page.getByLabel("Track both speakers", { exact: true }).check();
    const move = async (label, fraction) => {
      const control = page.getByLabel(label, { exact: true }), box = await control.boundingBox();
      await control.click({ position: { x: box.width * fraction, y: box.height / 2 } });
    };
    await move("top split horizontal", .72); await move("bottom split horizontal", .28);
    await page.getByRole("button", { name: "Add top speaker tracking point", exact: true }).click();
    await page.getByRole("button", { name: "Add bottom speaker tracking point", exact: true }).click();
    for (let i = 0; i < 24; i++) await slider.press("ArrowRight");
    await page.getByTestId("show-everyone-bottom-first").click();
    await page.getByRole("button", { name: "Add top speaker tracking point", exact: true }).click();
    await page.getByRole("button", { name: "Add bottom speaker tracking point", exact: true }).click();
    const split = await backup("split");
    assert(split.speakerStackFraming.trackSpeakers); assert(split.speakerStackFraming.top.keyframes.length >= 2);
    assert(split.speakerStackFraming.bottom.keyframes.length >= 2); assert(split.speakerFocusCuts.some(k => k.slot === "bottom"));
    await page.getByRole("button", { name: /Preview 9:16 Framing/ }).click(); await page.waitForTimeout(1100); await pause();
    await page.screenshot({ path: file("split-preview.png") });
    record("Show Everyone: independent panel positions/tracking points, timed speaker-order change and ordinary preview");
    await page.getByTestId("studio-save-project").click(); await tool("Export");
    await page.getByLabel("Export resolution", { exact: true }).selectOption("720p");
    await page.getByLabel("Export frame rate", { exact: true }).selectOption("24");
    await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
    const consent = page.getByRole("dialog", { name: "Studio export", exact: true }); await consent.waitFor();
    await consent.getByRole("button", { name: /^Approve / }).click();
    const button = page.getByRole("button", { name: "Download Rendered Clip", exact: true }); await button.waitFor({ timeout: 180000 });
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]); await download.saveAs(file("split-final.mp4"));
    execFileSync("ffmpeg", ["-v", "error", "-i", file("split-final.mp4"), "-f", "null", "-"], { timeout: 120000 });
    record("Reviewed split framing → consent → canonical CPU export → private download and full decode");
    assert.equal(evidence.external.length, 0); assert.equal(evidence.errors.length, 0);
  } catch (error) {
    await page.screenshot({ path: file("failure.png") }).catch(() => {});
    fs.writeFileSync(file("failure.txt"), String(error.stack) + "\n" + await page.locator("body").innerText()); throw error;
  } finally {
    await context.storageState({ path: path.join(directory, "browser-state.json"), indexedDB: true }); await context.close(); await browser.close();
  }
}
main().catch(error => { console.error(String(error.stack).replace(/([?&]cap=)[^\s'"]+/g, "$1[PRIVATE]")); process.exitCode = 1; });
