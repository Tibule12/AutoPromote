#!/usr/bin/env node
// Fast visual regression: real component, Firebase sign-in and podcast source.
// Restores the already verified local checkpoint; it submits no analysis job.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const { assertStudioTimelineLayout } = require("./studio-timeline-layout");
const root = path.resolve(__dirname, "../../..");
const stagingFolder = path.join(root, "artifacts/studio-analysis-browser-20261004");
const folder = path.join(root, "artifacts/studio-timeline-layout-20261004");
const boot = JSON.parse(fs.readFileSync(path.join(stagingFolder, "bootstrap.json"), "utf8"));
const checkpoint = JSON.parse(
  fs.readFileSync(path.join(stagingFolder, "editor-after.json"), "utf8"),
  (_key, value) => (value === "[private staging source or credential]" ? boot.sourceUrl : value)
)[0];
assert.equal(boot.projectId, "autopromote-staging-2026");
assert.equal(checkpoint.snapshot.reframeKeyframes.length, 1277);
assert.equal(checkpoint.snapshot.timeline.length, 1);
const sourceSegment = checkpoint.snapshot.timeline[0];
const outputDuration = Number(sourceSegment.endRequest) - Number(sourceSegment.startRequest);
assert.equal(outputDuration, 600);
// Presentation fixture: multiple library references to the verified source.
// Actual batch import and distinct placement are covered by the editor tests.
const batchFixture = process.env.STUDIO_MEDIA_BATCH_FIXTURE === "1";
if (batchFixture) {
  const libraryPoster = `data:image/jpeg;base64,${fs.readFileSync(path.join(folder, "library-poster.jpg")).toString("base64")}`;
  const librarySource = checkpoint.snapshot.projectMedia[0];
  checkpoint.snapshot.projectMedia = [
    { ...librarySource, poster: libraryPoster },
    ...Array.from({ length: 13 }, (_, index) => ({
      ...librarySource,
      id: `library-sample-${index + 1}`,
      isPrimary: false,
      name: `Library sample ${String(index + 1).padStart(2, "0")}.mp4`,
      poster: libraryPoster,
    })),
  ];
}
fs.mkdirSync(folder, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [],
    checks = [],
    seekChecks = [];
  let submittedJobs = 0;
  page.on("pageerror", error => errors.push(error.message.replace(/https?:\/\/\S+/g, "[URL]")));
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/studio-analysis-jobs"))
      submittedJobs++;
  });
  try {
    await page.goto(`http://127.0.0.1:${Number(process.env.STUDIO_BROWSER_PORT || 5006)}`);
    await page.waitForFunction(() => typeof window.__STUDIO_STAGING_SIGN_IN === "function");
    await page.evaluate(
      project =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("autopromote-viral-studio", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("projects", { keyPath: "id" });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction("projects", "readwrite");
            transaction.objectStore("projects").put(project);
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
      checkpoint
    );
    await page.evaluate(token => window.__STUDIO_STAGING_SIGN_IN(token), boot.customToken);
    console.log("[layout] Firebase signed in");
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 2,
      null,
      { timeout: 120000 }
    );
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    await page.locator(".studio-project-rail__head > summary").click();
    await page.locator(".studio-saved-projects > summary").click();
    const sourceResolved = page.waitForResponse(
      response =>
        response.url().endsWith("/api/media/studio-assets/resolve") && response.status() === 200
    );
    await page.locator(".studio-saved-projects article > button").first().click();
    await sourceResolved;
    await page.waitForFunction(
      source => document.querySelector('[data-testid="studio-after-video"]').src !== source,
      boot.sourceUrl
    );
    await page.locator(".studio-project-rail__head > summary").click();
    await page.getByRole("button", { name: "Hide media", exact: true }).click();
    await page
      .locator(".creative-tool-rail")
      .getByRole("button", { name: "Reframe", exact: true })
      .click();
    await page.getByRole("button", { name: "Play comparison", exact: false }).click();
    await page.waitForFunction(
      () => {
        const video = document.querySelector('[data-testid="studio-after-video"]');
        return !video.paused && video.readyState >= 3;
      },
      null,
      { timeout: 30000 }
    );
    checks.push(await assertStudioTimelineLayout(page, "restored checkpoint"));
    console.log("[layout] Verified checkpoint restored");
    await page.getByRole("button", { name: "Pause comparison", exact: false }).click();

    // Reintroduce the missing assignments from the original layout. The same
    // geometry gate must reject the observed 92px-wide timeline regression.
    const broken = await page.addStyleTag({
      content: `
      .studio-layout > .creative-tool-rail, .studio-layout > .phone-preview-container,
      .studio-layout > .studio-sidebar, .studio-layout > .studio-pro-timeline-dock {
        grid-area: auto !important;
      }`,
    });
    let rejected = false;
    try {
      await assertStudioTimelineLayout(page, "original auto-placement regression");
    } catch (_) {
      rejected = true;
    }
    assert(rejected, "The geometry gate failed to catch the original clipping");
    const regressionWidth = await page
      .locator(".studio-pro-timeline-dock")
      .evaluate(node => node.getBoundingClientRect().width);
    await page.screenshot({ path: path.join(folder, "negative-control.png") });
    await broken.evaluate(node => node.remove());

    for (const [width, height] of process.env.STUDIO_LAYOUT_SKIP_MATRIX === "1"
      ? []
      : [
          [1920, 1080],
          [1440, 1000],
          [1280, 800],
          [1100, 900],
          [1000, 800],
        ]) {
      await page.setViewportSize({ width, height });
      for (const mediaOpen of [false, true]) {
        if (mediaOpen) await page.getByRole("button", { name: "Show media", exact: true }).click();
        for (const side of ["center", "side"]) {
          if (side === "side") {
            await page.locator(".studio-view-options > summary").click();
            await page.getByRole("button", { name: "Dock canvas right", exact: false }).click();
          }
          await page.waitForTimeout(150);
          checks.push(
            await assertStudioTimelineLayout(
              page,
              `${width}x${height} / media ${mediaOpen ? "open" : "closed"} / ${side}`
            )
          );
          console.log(`[layout] ${checks[checks.length - 1].label}`);
          if ([1440, 1000].includes(width) && side === "center")
            await page.screenshot({
              path: path.join(
                folder,
                `layout-${width}-${mediaOpen ? "open" : "closed"}-${side}.png`
              ),
              timeout: 15000,
            });
          if (side === "side") {
            await page.locator(".studio-view-options > summary").click();
            await page.getByRole("button", { name: "Center canvas", exact: false }).click();
          }
        }
        if (mediaOpen) await page.getByRole("button", { name: "Hide media", exact: true }).click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator(".creative-tool-rail")
      .getByRole("button", { name: "Cut", exact: true })
      .click();
    const programme = page.getByTestId("studio-after-video");
    const sourceClip = page.getByTestId("pro-video-clip-1");
    assert.equal(Number(await sourceClip.getAttribute("data-end-time")), outputDuration);
    assert(await programme.evaluate(video => video.paused));
    for (const outputTime of [150, 450]) {
      const lane = await page
        .locator('[data-testid="pro-track-row-video"] .pro-track-lane')
        .boundingBox();
      await page.mouse.click(
        Math.round(lane.x + (lane.width * outputTime) / outputDuration),
        lane.y + lane.height / 2
      );
      await page.waitForFunction(
        time =>
          Math.abs(
            document.querySelector('[data-testid="studio-after-video"]').currentTime - time
          ) < 0.5,
        outputTime,
        { timeout: 30000 }
      );
      const currentTime = await programme.evaluate(video => video.currentTime);
      assert(await sourceClip.evaluate(node => node.classList.contains("is-at-playhead")));
      const position = await page
        .locator(".pro-time-ruler > .pro-playhead")
        .evaluate(node => parseFloat(node.style.left));
      assert(Math.abs(position - (outputTime / outputDuration) * 100) < 0.1);
      seekChecks.push({ outputTime, currentTime, playheadPercent: position });
      console.log(`[layout] Source click seeks ${outputTime}s`);
    }
    await page.waitForFunction(
      () => {
        const images = document.querySelectorAll(
          '[data-testid="pro-track-row-video"] .pro-source-filmstrip img'
        );
        return images.length === 6 && Array.from(images).every(image => image.naturalWidth === 128);
      },
      null,
      { timeout: 180000 }
    );
    const decodedSourceThumbnails = await page.locator(".pro-source-filmstrip img").count();
    assert.equal(decodedSourceThumbnails, 6);
    const overviewCheck = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll('[data-testid="pro-track-row-framing"] .pro-track-clip')
      );
      const images = Array.from(document.querySelectorAll(".pro-source-filmstrip img"));
      return {
        narrowLabelsHidden: blocks
          .filter(block => block.getBoundingClientRect().width < 120)
          .every(block => getComputedStyle(block.firstElementChild).display === "none"),
        thumbnailRatios: images.map(
          image => image.getBoundingClientRect().width / image.getBoundingClientRect().height
        ),
        inspectorNavigationHidden:
          getComputedStyle(document.querySelector(".clip-inspector-tabs")).display === "none",
      };
    });
    assert(overviewCheck.narrowLabelsHidden && overviewCheck.inspectorNavigationHidden);
    assert(overviewCheck.thumbnailRatios.every(ratio => Math.abs(ratio - 128 / 72) < 0.02));
    const moreActions = page.locator(".pro-more-actions");
    await moreActions.locator("summary").click();
    assert(await page.getByTestId("pro-quick-auto-motion").isVisible());
    await moreActions.locator("summary").press("Escape");
    assert.equal(await moreActions.evaluate(node => node.open), false);
    await page
      .locator(".creative-tool-rail")
      .getByRole("button", { name: "Reframe", exact: true })
      .click();
    const activeFraming = page.locator('[data-testid="pro-track-row-framing"] .is-at-playhead');
    assert.equal(await activeFraming.count(), 1);
    assert.equal(await activeFraming.getAttribute("data-framing-mode"), "speaker_track");
    const activeFramingRange = await activeFraming.evaluate(node => ({
      start: Number(node.dataset.startTime),
      end: Number(node.dataset.endTime),
      label: node.textContent.trim(),
    }));
    assert(activeFramingRange.start <= 450 && activeFramingRange.end > 450);
    assert((await page.getByTestId("pro-current-edit").textContent()).includes("Camera punch"));
    for (let step = 0; step < 5; step++)
      await page.getByRole("button", { name: "Zoom in timeline", exact: true }).click();
    const zoomCheck = await page.evaluate(() => {
      const scroll = document.querySelector(".pro-timeline-scroll");
      const header = document.querySelector(
        '[data-testid="pro-track-row-video"] .pro-track-header'
      );
      const playhead = document.querySelector(".pro-time-ruler > .pro-playhead");
      const visible = scroll.getBoundingClientRect(),
        fixed = header.getBoundingClientRect();
      const cursor = playhead.getBoundingClientRect();
      const blocks = Array.from(
        document.querySelectorAll('[data-testid="pro-track-row-framing"] .pro-track-clip')
      );
      return {
        level: document.querySelector('[aria-label="Timeline zoom level"]').textContent,
        scrollLeft: scroll.scrollLeft,
        cursorX: cursor.left,
        expectedCenter: (fixed.right + visible.right) / 2,
        fixedHeaderLeft: fixed.left,
        viewportLeft: visible.left,
        narrowLabelsHidden: blocks
          .filter(block => block.getBoundingClientRect().width < 120)
          .every(block => getComputedStyle(block.firstElementChild).display === "none"),
        readableLabels: blocks
          .filter(block => block.getBoundingClientRect().width >= 120)
          .filter(block => getComputedStyle(block.firstElementChild).display !== "none").length,
      };
    });
    assert.equal(zoomCheck.level, "32×");
    assert(zoomCheck.scrollLeft > 0);
    assert(Math.abs(zoomCheck.cursorX - zoomCheck.expectedCenter) <= 3);
    assert(Math.abs(zoomCheck.fixedHeaderLeft - zoomCheck.viewportLeft) <= 2);
    assert(zoomCheck.narrowLabelsHidden && zoomCheck.readableLabels > 0);
    await page.screenshot({ path: path.join(folder, "frontend-zoomed.png") });
    await page.getByRole("button", { name: "Fit entire timeline", exact: true }).click();
    assert.equal(await page.locator(".pro-timeline-scroll").evaluate(node => node.scrollLeft), 0);
    await page.getByRole("button", { name: "Play comparison", exact: false }).click();
    const resize = page.getByRole("separator", { name: "Resize timeline" });
    await resize.focus();
    await resize.press("ArrowUp");
    assert.equal(await resize.getAttribute("aria-valuenow"), "304");
    checks.push(await assertStudioTimelineLayout(page, "resized to 304px"));
    await resize.press("ArrowDown");
    assert.equal(await resize.getAttribute("aria-valuenow"), "280");
    await page.getByRole("button", { name: "Hide timeline", exact: true }).click();
    assert.equal(await page.locator(".studio-pro-timeline-dock").isVisible(), false);
    await page.getByRole("button", { name: "Show timeline", exact: true }).click();
    checks.push(await assertStudioTimelineLayout(page, "hidden and reopened"));
    const before = await programme.evaluate(video => video.currentTime);
    await page.waitForFunction(
      time => {
        const video = document.querySelector('[data-testid="studio-after-video"]');
        return !video.paused && video.currentTime > time + 0.2;
      },
      before,
      { timeout: 30000 }
    );
    const playback = await programme.evaluate(video => ({
      currentTime: video.currentTime,
      paused: video.paused,
      muted: video.muted,
      volume: video.volume,
    }));
    assert(
      !playback.paused &&
        !playback.muted &&
        playback.volume > 0.05 &&
        playback.currentTime > before + 0.2,
      `Playback failed after timeline toggles: ${JSON.stringify({ before, playback })}`
    );
    assert.equal(await page.locator(".after-preview-loading").isVisible(), false);
    assert.equal(submittedJobs, 0);
    assert.deepEqual(errors, []);
    await page.waitForFunction(
      () => {
        const images = document.querySelectorAll(
          '[data-testid="pro-track-row-video"] .pro-source-filmstrip img'
        );
        return images.length === 6 && Array.from(images).every(image => image.naturalWidth === 128);
      },
      null,
      { timeout: 90000 }
    );
    await page.screenshot({ path: path.join(folder, "frontend-fixed.png") });
    console.log("[layout] Zoom, resize and continued playback verified");
    let batchLibraryCheck = null;
    if (batchFixture) {
      await page.getByRole("button", { name: "Pause comparison", exact: false }).click({
        noWaitAfter: true,
      });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="studio-after-video"]').paused
      );
      await page.getByRole("button", { name: "Show media", exact: true }).click();
      const library = page.getByTestId("project-media-library");
      assert.equal(await library.locator("article").count(), 12);
      await page.getByRole("button", { name: /Show more videos/ }).click({ noWaitAfter: true });
      assert.equal(await library.locator("article").count(), 14);
      await library.locator(".studio-media-card__thumb").first().click();
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll(".studio-media-card")).every(card =>
            card.classList.contains("is-ready")
          ),
        null,
        { timeout: 30000 }
      );
      batchLibraryCheck = {
        scope:
          "14 library references to one real staging source; presentation fixture; no batch cloud uploads",
        cards: await library.locator("article").count(),
        visibleActionGroups: await library.locator(".studio-media-card__actions:visible").count(),
        hiddenSequence: await page
          .locator('[aria-labelledby="studio-sequence-heading"]')
          .isHidden(),
        hiddenMoments: await page.locator('[aria-labelledby="studio-moments-heading"]').isHidden(),
        libraryHeight: await library.evaluate(node => node.getBoundingClientRect().height),
      };
      assert.equal(batchLibraryCheck.visibleActionGroups, 1);
      assert(batchLibraryCheck.hiddenSequence && batchLibraryCheck.hiddenMoments);
      assert(batchLibraryCheck.libraryHeight <= 421);
      await page.locator(".studio-project-rail").evaluate(node => { node.scrollTop = 0; });
      await library.evaluate(node => { node.scrollTop = 0; });
      await page.screenshot({ path: path.join(folder, "media-library-batch.png") });
      await page.getByRole("searchbox", { name: "Search project media" }).fill("Library sample 13");
      assert.equal(await library.locator("article").count(), 1);
      batchLibraryCheck.searchPassed = true;
      console.log("[layout] Populated library, selected-card actions and search verified");
    }
    const receipt = {
      passed: true,
      completedAt: new Date().toISOString(),
      scope:
        "Local production component layout; real staging Firebase auth and podcast media; restored verified checkpoint; no new cloud analysis or public deployment",
      regressionCaught: rejected,
      regressionWidth,
      layoutChecks: checks.length,
      matrixSkipped: process.env.STUDIO_LAYOUT_SKIP_MATRIX === "1",
      submittedJobs,
      restoredFramingPoints: checkpoint.snapshot.reframeKeyframes.length,
      outputDuration,
      playback,
      seekChecks,
      decodedSourceThumbnails,
      activeFramingRange,
      overviewCheck,
      zoomCheck,
      batchLibraryCheck,
      pageErrors: errors,
      checks,
    };
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(
      JSON.stringify({ passed: true, layoutChecks: checks.length, regressionWidth, submittedJobs })
    );
  } catch (error) {
    const diagnostic = await page
      .getByTestId("studio-after-video")
      .evaluate(video => ({
        currentTime: video.currentTime,
        paused: video.paused,
        muted: video.muted,
        volume: video.volume,
        seeking: video.seeking,
        readyState: video.readyState,
        networkState: video.networkState,
        error: video.error ? { code: video.error.code, message: video.error.message } : null,
        buffered: Array.from({ length: video.buffered.length }, (_, i) => [
          video.buffered.start(i),
          video.buffered.end(i),
        ]),
        playbackRate: video.playbackRate,
      }))
      .catch(() => null);
    const thumbnailDiagnostic = await page
      .evaluate(() => ({
        decodedImages: document.querySelectorAll(".pro-source-filmstrip img").length,
        error: document.querySelector(".pro-source-filmstrip")?.dataset.samplingError,
        sampleTime: document.querySelector(".pro-source-filmstrip")?.dataset.samplingTime,
        decoder: Array.from(document.querySelectorAll("[data-studio-thumbnail-decoder]")).map(
          video => ({
            currentTime: video.currentTime,
            readyState: video.readyState,
            seeking: video.seeking,
            networkState: video.networkState,
          })
        ),
      }))
      .catch(() => null);
    console.error(JSON.stringify({ failure: error.message, diagnostic, thumbnailDiagnostic }));
    fs.writeFileSync(
      path.join(folder, "failure.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          failure: error.message,
          diagnostic,
          thumbnailDiagnostic,
          layoutChecks: checks,
          seekChecks,
        },
        null,
        2
      )
    );
    await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
