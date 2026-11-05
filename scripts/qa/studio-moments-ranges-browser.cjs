// Native creator-selected Moments lifecycle; no fabricated suggestions/graphs.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
async function main() {
  const directory = path.resolve(process.argv[2]), file = name => path.join(directory, name);
  const config = JSON.parse(fs.readFileSync(file("browser-private.json")));
  const title = process.env.STUDIO_MOMENTS_RANGE_TITLE || "Moments saved range recovery";
  const sourceProject = process.env.STUDIO_MOMENTS_RANGE_SOURCE_PROJECT || "Moments and framing recovery v2";
  const clean = value => JSON.parse(JSON.stringify(value, (_k, v) => typeof v === "string" && v.startsWith(`${config.origin}/api/credit-pilot/object/`) ? new URL(v).pathname : v));
  assert.equal(new URL(config.origin).hostname, "127.0.0.1");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: file("browser-state.json"), recordVideo: { dir: file("recordings") } });
  const result = { actualApp: true, headlessMuted: true, steps: [], external: [], errors: [] };
  await context.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1" || ["blob:", "data:"].includes(u.protocol)) return route.continue();
    result.external.push(u.origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on("pageerror", e => result.errors.push(e.message));
  page.on("dialog", d => d.accept(d.type() === "prompt" ? "Creator selected interval" : undefined));
  const record = step => { result.steps.push(step); fs.writeFileSync(file("moments-ranges-observation.json"), JSON.stringify(result, null, 2)); console.log("PASS:", step); };
  const tools = name => page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name, exact: true }).click();
  const library = async () => {
    const show = page.getByRole("button", { name: "Show media", exact: true }); if (await show.isVisible()) await show.click();
    const head = page.locator(".studio-project-rail__head"); if (!await head.evaluate(node => node.open)) await head.locator(":scope > summary").click();
  };
  const backup = async name => {
    await library(); const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download project backup", exact: true }).click()]);
    await download.saveAs(file(name)); return JSON.parse(fs.readFileSync(file(name)));
  };
  try {
    await page.goto(config.origin); await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: sourceProject, exact: true }).click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    if (process.env.STUDIO_MOMENTS_PRUNE_UNUSED === "true") {
      await tools("Reframe");
      const setup = page.getByTestId("speaker-source-setup");
      if (!await setup.evaluate(node => node.open)) await setup.locator(":scope > summary").click();
      await page.getByRole("button", { name: "Remove unused angles", exact: true }).click();
      await page.getByTestId("studio-undo-button").click();
      await page.getByTestId("studio-redo-button").click();
      record("Remove unused camera references → Undo/Redo; original media retained");
    }
    await library(); await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill(title);
    if (process.env.STUDIO_MOMENTS_RANGE_TRIM === "true") {
      const pause = page.getByRole("button", { name: "Pause comparison", exact: true });
      if (await pause.isVisible()) await pause.click();
      await tools("Cut");
      const range = page.getByLabel("Edited output position", { exact: true }); await range.press("Home");
      for (let i = 0; i < 24; i++) await range.press("ArrowRight");
      await page.getByTestId("inspector-cut-trim-start").click();
    }
    await tools("Moments");
    const before = await backup("moments-ranges-before.autopromote.json");
    const count = before.snapshot.orderedClips.length;
    await page.getByRole("button", { name: "Save current range as moment", exact: true }).click();
    const inspector = page.getByTestId("studio-moments-inspector");
    await inspector.getByText(`${count + 1} available`, { exact: true }).waitFor();
    await page.getByTestId("studio-undo-button").click(); await inspector.getByText(`${count} available`, { exact: true }).waitFor();
    await page.getByTestId("studio-redo-button").click(); await inspector.getByText(`${count + 1} available`, { exact: true }).waitFor();
    const saved = await backup("moments-ranges-added.autopromote.json");
    assert.deepEqual(clean(saved.snapshot.timeline), clean(before.snapshot.timeline));
    assert.deepEqual(clean(saved.snapshot.orderedClips.slice(0, count)), clean(before.snapshot.orderedClips));
    record("Save current trimmed range as named moment → Undo/Redo; original ranges and current sequence preserved");
    const moments = page.locator("#studio-library-panel-moments .studio-project-moment");
    await moments.first().click(); await moments.last().click();
    const selected = await backup("moments-ranges-selected.autopromote.json");
    const bookmark = selected.snapshot.orderedClips.find(c => c.id === selected.snapshot.selectedClipId);
    assert.equal(bookmark.origin, "creator_range");
    assert.equal(selected.snapshot.timeline[0].startRequest, bookmark.start);
    assert.equal(selected.snapshot.timeline[0].endRequest, bookmark.end);
    await inspector.getByRole("button", { name: "Preview selected moment", exact: true }).click();
    await page.waitForTimeout(900); await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
    record("Switch between real discovered and creator-saved moments; exact range and native playback follow selection");
    await page.getByTestId("studio-save-project").click();
    await context.storageState({ path: file("browser-state.json"), indexedDB: true });
    await page.reload(); await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    const reopened = await backup("moments-ranges-reopened.autopromote.json");
    assert.deepEqual(clean(reopened.snapshot.orderedClips), clean(selected.snapshot.orderedClips));
    assert.equal(reopened.snapshot.selectedClipId, selected.snapshot.selectedClipId);
    record("Native save → cold reopen retains all discovered/saved ranges and selected moment");
    await tools("Moments");
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
    const play = page.getByRole("button", { name: "Play comparison", exact: true });
    if (await play.isVisible()) await play.click();
    await page.waitForTimeout(700);
    const pause = page.getByRole("button", { name: "Pause comparison", exact: true });
    if (await pause.isVisible()) await pause.click();
    await page.screenshot({ path: file("moments-ranges-reopened.png") });
    await tools("Export");
    await page.getByLabel("Export resolution", { exact: true }).selectOption("720p");
    await page.getByLabel("Export frame rate", { exact: true }).selectOption("24");
    await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
    const consent = page.getByRole("dialog", { name: "Studio export", exact: true }); await consent.waitFor();
    await consent.getByRole("button", { name: /^Approve / }).click();
    const download = page.getByRole("button", { name: "Download Rendered Clip", exact: true });
    await Promise.race([download.waitFor({ timeout: 180000 }),
      page.getByTestId("studio-export-error").waitFor({ timeout: 180000 }).then(async () => { throw Error(await page.getByTestId("studio-export-error").innerText()); })]);
    const [movie] = await Promise.all([page.waitForEvent("download"), download.click()]);
    await movie.saveAs(file("moments-ranges-final.mp4"));
    execFileSync("ffmpeg", ["-v", "error", "-i", file("moments-ranges-final.mp4"), "-f", "null", "-"], { timeout: 120000 });
    record("Reopened creator-saved moment → quote/consent → canonical CPU export → private download/full decode");
    assert.equal(result.external.length, 0); assert.equal(result.errors.length, 0);
  } catch (error) {
    await page.screenshot({ path: file("moments-ranges-failure.png") }).catch(() => {});
    fs.writeFileSync(file("moments-ranges-failure.txt"), error.stack + "\n" + await page.locator("body").innerText()); throw error;
  } finally { await context.storageState({ path: file("browser-state.json"), indexedDB: true }); await context.close(); await browser.close(); }
}
main().catch(error => { console.error(String(error.stack).replace(/([?&]cap=)[^\s'"]+/g, "$1[PRIVATE]")); process.exitCode = 1; });
