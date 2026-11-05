// Actual discovery, real CPU analysis, native controls, cold recovery and export.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { clickStudioControl } = require("../../test/e2e/playwright/studio-timeline-layout");
async function main() {
  const directory = path.resolve(process.argv[2]);
  const config = JSON.parse(fs.readFileSync(path.join(directory, "browser-private.json")));
  assert.equal(new URL(config.origin).hostname, "127.0.0.1");
  const file = name => path.join(directory, name);
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    storageState: file("browser-state.json"), recordVideo: { dir: file("recordings") } });
  const observations = { actualApp: true, headlessMuted: true, external: [], errors: [], steps: [] };
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || ["blob:", "data:"].includes(url.protocol)) return route.continue();
    observations.external.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => observations.errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  const record = value => { observations.steps.push(value); fs.writeFileSync(file("moments-analysis-observation.json"), JSON.stringify(observations, null, 2)); console.log("PASS:", value); };
  const pause = async () => { const b = page.getByRole("button", { name: "Pause comparison", exact: true }); if (await b.isVisible()) await b.click(); };
  const tool = name => page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name, exact: true }).click();
  const backup = async name => {
    const pending = page.waitForEvent("download");
    await clickStudioControl(page, page.getByRole("button", { name: "Download project backup", exact: true, includeHidden: true }));
    await (await pending).saveAs(file(name));
    const document = JSON.parse(fs.readFileSync(file(name)));
    return document.project || document;
  };
  const save = async () => {
    const show = page.getByRole("button", { name: "Show media", exact: true });
    if (await show.isVisible()) await show.click();
    const head = page.locator(".studio-project-rail__head");
    if (!await head.evaluate(node => node.open)) await head.locator(":scope > summary").click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Moments and framing recovery");
    await page.getByTestId("studio-save-project").click();
  };
  try {
    await page.goto(config.origin);
    await page.getByTestId("shared-credit-balance").waitFor();
    if (process.argv.includes("--resume")) {
      await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
      await page.getByRole("button", { name: "Moments and framing recovery", exact: true }).click();
      await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    } else {
    await page.getByRole("button", { name: "Find Viral Clips", exact: true }).first().click();
    await page.locator('input[type="file"][accept*="video"]').first().setInputFiles(file("source.mp4"));
    await page.getByRole("button", { name: /Analyse video/ }).click();
    const consent = page.getByRole("dialog", { name: "Find Viral Clips analysis", exact: true });
    await consent.waitFor(); await consent.getByRole("button", { name: /^Approve / }).click();
    await page.getByRole("button", { name: /Create clip/ }).first().waitFor({ timeout: 270000 });
    record("Owned source → quote/consent → actual CPU speech/scene analysis → visible suggestions");
    await page.getByRole("button", { name: /Create clip/ }).first().click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await tool("Moments");
    const inspector = page.getByTestId("studio-moments-inspector");
    await inspector.waitFor();
    await inspector.getByRole("button", { name: "Preview selected moment", exact: true }).click();
    await page.waitForTimeout(1100); await pause();
    const sourceTime = await page.getByTestId("studio-after-video").evaluate(video => video.currentTime);
    assert(sourceTime > 1);
    record("Detected source range opens in Moments and previews on the normal transport");
    await inspector.getByRole("button", { name: "Trim this moment", exact: true }).click();
    const slider = page.getByLabel("Edited output position", { exact: true });
    await slider.press("Home");
    for (let i = 0; i < 24; i++) await slider.press("ArrowRight");
    await page.getByTestId("inspector-cut-trim-start").click();
    await page.getByTestId("studio-undo-button").click();
    await page.getByTestId("studio-redo-button").click();
    record("Trim detected moment → Undo → Redo retains the ordinary edit history");
    }
    await save();
    const beforeDetection = await backup("moments-before-detection.autopromote.json");
    await tool("Reframe");
    await slider.press("Home");
    await page.getByTestId("reframe-aspect-9-16").click();
    await page.getByTestId("reframe-follow-subject").click();
    const tracked = page.waitForResponse(response => new URL(response.url()).pathname === "/api/media/track-studio-faces");
    await page.getByTestId("analyze-speaker-faces").click();
    const result = await tracked; assert.equal(result.status(), 200);
    const data = await result.json();
    assert(Array.isArray(data.tracks?.solo?.keyframes));
    observations.faceAnalysis = { engine: data.engine, points: data.tracks.solo.keyframes.length, coverage: data.tracks.solo.coverage };
    if (data.tracks.solo.coverage < .65 || data.tracks.solo.keyframes.length < 2) {
      await page.getByText(/A face was missing in too many frames|Not enough faces detected/).first().waitFor();
      const afterDetection = await backup("moments-rejected-detection.autopromote.json");
      assert.deepEqual(afterDetection.snapshot.reframeKeyframes, beforeDetection.snapshot.reframeKeyframes);
      record("Real low-coverage face detection is rejected without replacing framing");
    } else {
      await page.getByText(/Face-follow draft applied/).first().waitFor();
      record("Real CPU face analysis → reviewed source-bound framing points");
    }
    const shotResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/media/track-studio-faces");
    await page.getByTestId("analyze-source-shots").click();
    const shots = await shotResponse; assert.equal(shots.status(), 200);
    const shotData = await shots.json();
    assert(shotData.sourceShotArtifact && shotData.analysisArtifact);
    await page.getByText(/Podcast layout draft applied|Source-shot draft applied/).first().waitFor();
    observations.sourceShots = { engine: shotData.engine, sceneCuts: shotData.sceneCuts?.length || 0,
      points: shotData.tracks.solo.keyframes.length, artifactsBound: true };
    record("Follow existing camera cuts → actual local model analysis → owned durable artifacts");
    await save();
    const saved = await backup("moments-framing-before.autopromote.json");
    await page.screenshot({ path: file("moments-framing-before-reopen.png") });
    await context.storageState({ path: file("browser-state.json"), indexedDB: true });
    await page.reload();
    await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: "Moments and framing recovery", exact: true }).click();
    const reopened = await backup("moments-framing-reopened.autopromote.json");
    for (const key of ["timeline", "orderedClips", "reframeKeyframes", "reframeModeCuts", "speakerStackFraming"])
      assert.deepEqual(reopened.snapshot[key], saved.snapshot[key], `Cold reopen changed ${key}`);
    record("Save → cold reopen → exact range, moment and framing state retained");
    await tool("Export");
    await page.getByLabel("Export resolution", { exact: true }).selectOption("720p");
    await page.getByLabel("Export frame rate", { exact: true }).selectOption("24");
    await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
    const renderConsent = page.getByRole("dialog", { name: "Studio export", exact: true });
    await renderConsent.waitFor(); await renderConsent.getByRole("button", { name: /^Approve / }).click();
    const button = page.getByRole("button", { name: "Download Rendered Clip", exact: true });
    await button.waitFor({ timeout: 180000 });
    const download = page.waitForEvent("download"); await button.click();
    const output = file("moments-framing-final.mp4"); await (await download).saveAs(output);
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", output]));
    const video = info.streams.find(s => s.codec_type === "video");
    assert.equal(video.width, 720); assert.equal(video.height, 1280);
    execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], { timeout: 120000 });
    observations.export = { width: video.width, height: video.height, duration: Number(info.format.duration), fullDecode: true };
    record("Reopened trimmed moment and reviewed follow path → quote/consent → CPU export → verified private download");
    assert.equal(observations.external.length, 0); assert.equal(observations.errors.length, 0);
    record("No external network, live provider calls, browser errors or production changes");
  } catch (error) {
    await page.screenshot({ path: file("moments-analysis-failure.png") }).catch(() => {});
    fs.writeFileSync(file("moments-analysis-failure.txt"), error.stack + "\n" + await page.locator("body").innerText());
    throw error;
  } finally {
    await context.storageState({ path: file("browser-state.json"), indexedDB: true });
    await context.close(); await browser.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
