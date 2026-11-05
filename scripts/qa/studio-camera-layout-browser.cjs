// Actual Studio layout authoring/export with four labelled moving test inputs.
// This qualifies control/transport wiring, not real shoot synchronization.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
async function main() {
  const directory = path.resolve(process.argv[2]), file = name => path.join(directory, name);
  const config = JSON.parse(fs.readFileSync(file("browser-private.json")));
  assert.equal(new URL(config.origin).hostname, "127.0.0.1");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    storageState: file("browser-state.json"), recordVideo: { dir: file("recordings") } });
  const result = { actualApp: true, syntheticLayoutInputs: true, realShootSyncQualified: false, errors: [], external: [], layouts: [] };
  await context.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1" || ["blob:", "data:"].includes(u.protocol)) return route.continue();
    result.external.push(u.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", e => result.errors.push(e.message)); page.on("dialog", d => d.accept());
  const tool = name => page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name, exact: true }).click();
  try {
    await page.goto(config.origin); await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: "Moments and framing recovery v2", exact: true }).click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await tool("Reframe");
    const setup = page.getByTestId("speaker-source-setup");
    if (!await setup.evaluate(node => node.open)) await setup.locator(":scope > summary").click();
    await page.getByTestId("clean-speaker-angle-input").setInputFiles([1, 2, 3, 4].map(i => file(`layout-camera-${i}.mp4`)));
    await page.getByLabel("Angles share the same source timecode", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Angles share the same source timecode"]')?.disabled);
    for (const [count, layouts] of [[2, ["stack_2", "split_2", "pip_2", "active_2", "spotlight_2"]], [3, ["hero_3"]], [4, ["grid_4"]]]) {
      if (count < Number(process.env.STUDIO_CAMERA_QA_MIN_COUNT || 2)) continue;
      await tool("Reframe"); await page.getByLabel("Edited output position", { exact: true }).press("Home");
      await page.getByTestId(`multicam-layout-${count}`).click();
      await page.getByLabel("Angles share the same source timecode", { exact: true }).check();
      await page.getByTestId("reframe-speaker-stack").click();
      for (const layout of layouts) {
        if (count === 2) await page.getByTestId(`multicam-composition-${layout}`).click();
        if (["active_2", "spotlight_2"].includes(layout)) {
          await page.getByTestId("speaker-focus-bottom").click();
        }
        const preview = page.getByRole("button", { name: /Preview 9:16 Framing/ });
        await preview.click(); await page.waitForTimeout(700);
        await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
        await page.screenshot({ path: file(`camera-layout-${layout}.png`) });
        result.layouts.push({ count, layout, nativePreview: true });
      }
      // Export one representative layout for each supported live camera count.
      await tool("Export");
      await page.getByLabel("Export resolution", { exact: true }).selectOption("720p");
      await page.getByLabel("Export frame rate", { exact: true }).selectOption("24");
      await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
      const consent = page.getByRole("dialog", { name: "Studio export", exact: true }); await consent.waitFor();
      await consent.getByRole("button", { name: /^Approve / }).click();
      const download = page.getByRole("button", { name: "Download Rendered Clip", exact: true });
      await Promise.race([download.waitFor({ timeout: 180000 }),
        page.getByTestId("studio-export-error").waitFor({ timeout: 180000 }).then(async () => {
          throw Error(await page.getByTestId("studio-export-error").innerText());
        })]);
      const [output] = await Promise.all([page.waitForEvent("download"), download.click()]);
      const destination = file(`camera-layout-${count}-final.mp4`); await output.saveAs(destination);
      execFileSync("ffmpeg", ["-v", "error", "-i", destination, "-f", "null", "-"], { timeout: 120000 });
      result.layouts.at(-1).fullExportDecode = true;
      fs.writeFileSync(file("camera-layout-observation.json"), JSON.stringify(result, null, 2));
      console.log(`PASS: ${count} distinct owned moving sources → native layouts → consent → canonical CPU output/full decode.`);
    }
    assert.equal(result.errors.length, 0); assert.equal(result.external.length, 0);
  } catch (error) {
    await page.screenshot({ path: file("camera-layout-failure.png") }).catch(() => {});
    fs.writeFileSync(file("camera-layout-failure.txt"), error.stack + "\n" + await page.locator("body").innerText()); throw error;
  } finally {
    await context.storageState({ path: file("browser-state.json"), indexedDB: true }); await context.close(); await browser.close();
  }
}
main().catch(error => { console.error(String(error.stack).replace(/([?&]cap=)[^\s'"]+/g, "$1[PRIVATE]")); process.exitCode = 1; });
