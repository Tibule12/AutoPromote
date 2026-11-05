// Actual signed-in App, owned emulator media and canonical local CPU worker.
// No browser state/graph injection, provider mocks or production requests.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { clickStudioControl } = require("../../test/e2e/playwright/studio-timeline-layout");

async function main() {
  const directory = path.resolve(process.argv[2]);
  const config = JSON.parse(fs.readFileSync(path.join(directory, "browser-private.json")));
  assert.equal(new URL(config.origin).hostname, "127.0.0.1");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: path.join(directory, "browser-state.json"),
    recordVideo: { dir: path.join(directory, "recordings") },
  });
  const external = [], errors = [], observations = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || ["blob:", "data:"].includes(url.protocol)) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  const report = name => path.join(directory, name);
  try {
    await page.goto(config.origin);
    await page.getByTestId("shared-credit-balance").waitFor();
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
    await page.getByRole("button", { name: "Credit lifecycle local project", exact: true }).click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 3);
    const tools = page.getByRole("navigation", { name: "Creative tools" });
    const tool = label => tools.getByRole("button", { name: label, exact: true }).click();
    const pause = async () => {
      const button = page.getByRole("button", { name: "Pause comparison", exact: true });
      if (await button.isVisible()) await button.click();
    };
    const read = () => page.evaluate(() => {
      const video = document.querySelector('[data-testid="studio-after-video"]');
      const slider = document.querySelector('[aria-label="Edited output position"]');
      const marker = document.querySelector(".pro-playhead");
      return { sourceTime: video.currentTime, outputTime: Number(slider.value),
        text: document.querySelector(".preview-timecode")?.textContent,
        marker: marker ? parseFloat(marker.style.left) : null,
        paused: video.paused, ready: video.readyState, playbackRate: video.playbackRate,
        slot: video.dataset.previewSlot, at: performance.now() };
    });
    await pause();
    await tool("Reframe");
    await page.getByTestId("reframe-aspect-4-5").click();
    await page.getByRole("button", { name: /Preview 4:5 Framing/ }).click();
    await page.getByRole("button", { name: "Pause comparison", exact: true }).waitFor();
    const start = await read();
    // Deliberate bounded main-thread load; native playback must re-anchor its
    // lightweight readouts after each busy interval without editor rerenders.
    await page.evaluate(() => {
      const end = performance.now() + 4500;
      window.reframeQaLoad = setInterval(() => {
        if (performance.now() >= end) return clearInterval(window.reframeQaLoad);
        const until = performance.now() + 80;
        while (performance.now() < until) { /* bounded synthetic UI contention */ }
      }, 300);
    });
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(250);
      observations.push(await read());
    }
    const last = observations.at(-1);
    assert.equal(last.paused, false);
    assert(last.sourceTime - start.sourceTime > 1.5, "Native source did not advance");
    assert(last.outputTime - start.outputTime > 1.5, "Readout remained frozen while the source played");
    assert(last.marker > start.marker + 5, "Timeline marker remained frozen");
    assert.notEqual(last.text, start.text, "Visible timecode remained frozen");
    console.log("PASS: native source, range, timecode and timeline all advance under bounded UI load.");
    await page.evaluate(() => clearInterval(window.reframeQaLoad));
    await pause();
    const stopped = await read();
    await page.waitForTimeout(350);
    assert(Math.abs((await read()).outputTime - stopped.outputTime) < .08, "Pause did not stop the readout");
    await tool("Sound");
    await page.getByTestId("audio-remix-preset-chipmunk").click();
    await page.getByRole("button", { name: "Pause comparison", exact: true }).waitFor();
    const chipmunk = await read();
    await page.waitForTimeout(1000);
    assert((await read()).outputTime - chipmunk.outputTime > .5, "Sound action stalled the display clock");
    await pause();
    await page.screenshot({ path: report("reframe-transport-load.png") });
    fs.writeFileSync(report("reframe-moments-transport.json"), JSON.stringify({
      headlessMuted: true, actualApp: true, productionTraffic: false, external, errors,
      start, observations, pause: stopped, chipmunkTransport: true,
      stress: { busyMilliseconds: 80, intervalMilliseconds: 300, boundedDurationMilliseconds: 4500 },
    }, null, 2));
    const showMedia = page.getByRole("button", { name: "Show media", exact: true });
    if (await showMedia.isVisible()) await showMedia.click();
    const head = page.locator(".studio-project-rail__head");
    if (!await head.evaluate(node => node.open)) await head.locator(":scope > summary").click();
    await page.getByTestId("studio-save-project").click();
    const download = page.waitForEvent("download");
    await clickStudioControl(page, page.getByRole("button", { name: "Download project backup", exact: true, includeHidden: true }));
    await (await download).saveAs(report("reframe-moments-native.autopromote.json"));
    if (process.argv.includes("--exports")) {
      const exports = [];
      for (const aspect of ["4-5", "1-1", "16-9", "9-16"]) {
        await pause();
        await tool("Reframe");
        await page.getByTestId(`reframe-aspect-${aspect}`).click();
        await page.getByLabel("Edited output position", { exact: true }).press("Home");
        await page.getByTestId("add-reframe-keyframe").click();
        const horizontal = page.getByLabel("Manual frame horizontal position", { exact: true });
        const bounds = await horizontal.boundingBox();
        await horizontal.click({ position: { x: bounds.width * .3, y: bounds.height / 2 } });
        const value = Number(await horizontal.inputValue());
        assert(Math.abs(value - 50) > 5, "Meaningful crop correction was not applied");
        await page.getByRole("button", { name: new RegExp(`Preview ${aspect.replace("-", ":")} Framing`) }).click();
        await page.waitForTimeout(700);
        await pause();
        await page.screenshot({ path: report(`reframe-${aspect}-before-export.png`) });
        await page.getByTestId("studio-save-project").click();
        await tool("Export");
        await page.getByLabel("Export resolution", { exact: true }).selectOption("720p");
        await page.getByLabel("Export frame rate", { exact: true }).selectOption("24");
        await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
        const consent = page.getByRole("dialog", { name: "Studio export", exact: true });
        await consent.waitFor();
        await consent.getByRole("button", { name: /^Approve / }).click();
        const button = page.getByRole("button", { name: "Download Rendered Clip", exact: true });
        await button.waitFor({ timeout: 180000 });
        const output = page.waitForEvent("download");
        await button.click();
        const destination = report(`reframe-${aspect}-final.mp4`);
        await (await output).saveAs(destination);
        const { execFileSync } = require("node:child_process");
        const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", destination]));
        const picture = probe.streams.find(stream => stream.codec_type === "video");
        const [w, h] = aspect.split("-").map(Number);
        assert(Math.abs(picture.width / picture.height - w / h) < .015, `Incorrect ${aspect} output aspect`);
        assert(Number(probe.format.duration) > 1, "Export contains no usable picture duration");
        execFileSync("ffmpeg", ["-v", "error", "-i", destination, "-f", "null", "-"], { timeout: 120000 });
        exports.push({ aspect, horizontal: value, width: picture.width, height: picture.height,
          duration: Number(probe.format.duration), bytes: fs.statSync(destination).size, fullDecode: true });
        fs.writeFileSync(report("reframe-actual-exports.json"), JSON.stringify(exports, null, 2));
        console.log(`PASS: ${aspect} source correction → consent → canonical CPU render → private download/full decode.`);
      }
    }
    fs.writeFileSync(report("reframe-moments-transport.json"), JSON.stringify({
      headlessMuted: true, actualApp: true, productionTraffic: false, external, errors,
      start, observations, pause: stopped, chipmunkTransport: true,
      stress: { busyMilliseconds: 80, intervalMilliseconds: 300, boundedDurationMilliseconds: 4500 },
    }, null, 2));
    console.log("PASS: actual native playback, range, timecode and timeline advance under bounded UI load; Pause and Chipmunk preserve transport.");
  } catch (error) {
    await page.screenshot({ path: report("reframe-moments-failure.png") }).catch(() => {});
    fs.writeFileSync(report("reframe-moments-failure.txt"), error.stack + "\n" + await page.locator("body").innerText());
    throw error;
  } finally {
    await context.storageState({ path: report("browser-state.json"), indexedDB: true });
    await context.close();
    await browser.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
