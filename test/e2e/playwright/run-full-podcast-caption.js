const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const sourcePath =
  process.env.FULL_PODCAST_SOURCE ||
  "/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4";
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5000";
const proofDir = path.join(repoRoot, "proof", "viral-clip-studio", "full-podcast-captions");
const profileDir =
  process.env.FULL_PODCAST_BROWSER_PROFILE ||
  "/home/tibule12/.cache/autopromote-full-podcast-caption-browser";

const enabledEditingProfile = {
  success: true,
  planId: "creator",
  totalCredits: 999,
  monthlyCredits: { allocation: 999, remaining: 999 },
  editing: {
    allPaidFeaturesUnlocked: true,
    topUpsEnabled: true,
    features: {
      viralClipStudio: { enabled: true },
      findViralClips: { enabled: true },
      clipRender: { enabled: true, creditCost: 5 },
      smartPromoSummary: { enabled: true },
      watermarkRemoval: { enabled: true },
      audioExtract: { enabled: true },
    },
  },
};

const fulfillJson = (route, value) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(value),
  });

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  if (!fs.existsSync(sourcePath)) throw new Error(`Podcast source not found: ${sourcePath}`);
  fs.mkdirSync(proofDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: process.env.PW_HEADFUL !== "1",
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: proofDir, size: { width: 1440, height: 900 } },
    args: process.env.PW_HEADFUL === "1" ? ["--ozone-platform=x11"] : ["--disable-gpu"],
  });
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());
  const video = page.video();
  const pageErrors = [];
  const apiFailures = [];

  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  page.on("response", response => {
    const url = response.url();
    if (url.includes("/api/media/") && response.status() >= 400) {
      apiFailures.push({ status: response.status(), url });
      response
        .text()
        .then(body => console.error(`[frontend-caption] API ${response.status()} ${url} ${body.slice(0, 1000)}`))
        .catch(() => {});
    }
  });
  page.on("request", request => {
    if (request.url().includes("/api/media/multicam/uploads/start")) {
      const authorization = request.headers().authorization || "";
      console.log(
        `[frontend-caption] Upload start auth=${authorization.startsWith("Bearer test-token-for-") ? "local-test-token" : authorization ? "other-token" : "missing"}`
      );
    }
  });

  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "test-token-for-adminUser";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({
        uid: "captionOperator",
        email: "caption.operator@example.com",
        name: "Full Podcast Caption Operator",
        role: "user",
        isAdmin: false,
      })
    );
  });

  await page.route("**/api/users/profile", route => fulfillJson(route, enabledEditingProfile));
  await page.route("**/api/users/me", route =>
    fulfillJson(route, {
      user: {
        uid: "captionOperator",
        email: "caption.operator@example.com",
        name: "Full Podcast Caption Operator",
        role: "user",
        isAdmin: false,
      },
    })
  );
  await page.route("**/api/content/my-content**", route => fulfillJson(route, { content: [] }));
  await page.route("**/api/platform/status", route => fulfillJson(route, { raw: {} }));
  await page.route("**/api/health", route => fulfillJson(route, { status: "OK" }));
  await page.route("**/api/media/credits", route =>
    fulfillJson(route, {
      balance: 999,
      monthly: { remaining: 999 },
      topUp: 0,
      costs: { analyze: 8, "render-clip": 5, "audio-extract": 3 },
      localCreditBypass: true,
    })
  );

  console.log(`[frontend-caption] Opening ${baseUrl}/#/dashboard`);
  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const studioNav = page.getByRole("button", { name: "Viral Clip Studio", exact: true });
  try {
    await studioNav.waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    await page.screenshot({ path: path.join(proofDir, "00-dashboard-diagnostic.png"), fullPage: true });
    console.error(`[frontend-caption] URL ${page.url()}`);
    console.error(`[frontend-caption] PAGE ${String(await page.locator("body").innerText()).slice(0, 3000)}`);
    console.error(`[frontend-caption] PAGE_ERRORS ${JSON.stringify(pageErrors)}`);
    await context.close();
    throw error;
  }
  await studioNav.click();

  console.log(`[frontend-caption] Selecting ${sourcePath}`);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(sourcePath);

  const openStudio = page.getByRole("button", { name: "Open Creator Studio", exact: true });
  const uploadStartedAt = Date.now();
  let lastUploadMessage = "";
  while (!(await openStudio.isVisible().catch(() => false))) {
    const errorPanel = page.locator('.progress-modal[role="alert"]');
    if (await errorPanel.isVisible().catch(() => false)) {
      throw new Error(`Frontend source upload failed: ${await errorPanel.innerText()}`);
    }
    const status = page.locator('.progress-modal[role="status"]');
    const message = (await status.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (message && message !== lastUploadMessage) {
      console.log(`[frontend-caption] ${message}`);
      lastUploadMessage = message;
    }
    if (Date.now() - uploadStartedAt > 2 * 60 * 60 * 1000) {
      throw new Error("Frontend source upload did not finish within two hours");
    }
    await sleep(5000);
  }
  await openStudio.waitFor({ state: "visible", timeout: 30000 });
  if (!(await openStudio.isEnabled())) throw new Error("Studio source preview never became ready");
  await page.screenshot({ path: path.join(proofDir, "01-full-source-uploaded.png"), fullPage: true });
  console.log(`[frontend-caption] Upload and preview ready in ${Math.round((Date.now() - uploadStartedAt) / 1000)}s`);
  await openStudio.click();

  const afterVideo = page.getByTestId("studio-after-video");
  await afterVideo.waitFor({ state: "attached", timeout: 120000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="studio-after-video"]');
    return element && element.readyState >= 1;
  }, null, { timeout: 120000 });

  const captionsTool = page.locator(".creative-tool-rail").getByRole("button", {
    name: "Captions",
    exact: true,
  });
  await captionsTool.click();
  await page.screenshot({ path: path.join(proofDir, "02-caption-tool-open.png"), fullPage: true });

  const generationStatus = page.locator(".caption-generation-status");
  const transcriptionStartedAt = Date.now();
  let lastCaptionMessage = "";
  const reuseSavedProject = process.env.FULL_PODCAST_REUSE_SAVED === "1";
  if (reuseSavedProject) {
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    const savedProjects = page.locator(".studio-saved-projects");
    await savedProjects.locator("summary").click();
    await savedProjects.locator("article > button:first-child").first().click();
    await page.getByLabel("Caption 669 text").waitFor({ state: "visible", timeout: 60000 });
    console.log("[frontend-caption] Restored saved full-podcast project from IndexedDB");
  } else {
    const generate = page.getByTestId("generate-live-transcript");
    await generate.waitFor({ state: "visible", timeout: 60000 });
    console.log("[frontend-caption] Starting captions from the frontend control");
    await generate.click();

    while (true) {
      const message = (await generationStatus.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      if (message && message !== lastCaptionMessage) {
        console.log(`[frontend-caption] ${message}`);
        lastCaptionMessage = message;
      }
      const className = await generationStatus.getAttribute("class").catch(() => "");
      if (className && className.includes("is-ready")) break;
      if (className && (className.includes("is-error") || className.includes("is-failed"))) {
        throw new Error(`Caption generation failed: ${message}`);
      }
      if (Date.now() - transcriptionStartedAt > 75 * 60 * 1000) {
        throw new Error(`Caption generation timed out. Last frontend status: ${message}`);
      }
      await sleep(10000);
    }
  }

  const captionRows = page.locator(".caption-segment-row");
  const captionCount = await captionRows.count();
  if (!captionCount) throw new Error("Frontend reported success but created no caption timeline rows");
  let firstText = await page.getByLabel("Caption 1 text").inputValue();
  const lastText = await page.getByLabel(`Caption ${captionCount} text`).inputValue();
  if (reuseSavedProject) {
    const correctedText = firstText.replace(/^omolweni\b/i, "Molweni");
    if (correctedText === firstText) throw new Error("Expected first-word spelling was not found");
    await page.getByLabel("Caption 1 text").fill(correctedText);
    firstText = correctedText;
    await page.getByTestId("studio-save-project").click();
    await page.locator(".studio-project-save-state.is-saved").waitFor({ state: "visible", timeout: 30000 });
    const storedText = await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("autopromote-viral-studio", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise((resolve, reject) => {
        const request = database.transaction("projects", "readonly").objectStore("projects").getAll();
        request.onsuccess = () => {
          const latest = request.result.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          resolve(latest?.snapshot?.captionSegments?.[0]?.text || "");
        };
        request.onerror = () => reject(request.error);
      });
    });
    if (storedText !== correctedText) throw new Error("Spelling correction was not saved in the editable project");
    console.log(`[frontend-caption] Spelling edit persisted: ${storedText}`);
  }
  const captionTexts = await page
    .locator('textarea[aria-label^="Caption "][aria-label$=" text"], input[aria-label^="Caption "][aria-label$=" text"]')
    .evaluateAll(elements => elements.map(element => element.value));
  const maxCaptionWords = Math.max(
    0,
    ...captionTexts.map(text => String(text || "").trim().split(/\s+/).filter(Boolean).length)
  );
  const captionStarts = await page
    .locator('input[aria-label^="Caption "][aria-label$=" start"]')
    .evaluateAll(elements => elements.map(element => Number(element.value)));
  const captionEnds = await page
    .locator('input[aria-label^="Caption "][aria-label$=" end"]')
    .evaluateAll(elements => elements.map(element => Number(element.value)));
  const timelineCaptionBlocks = await page.getByTestId("timeline-caption-block").count();
  if (timelineCaptionBlocks !== captionCount) {
    throw new Error(
      `Caption track mismatch: ${captionCount} editable cues but ${timelineCaptionBlocks} timeline blocks`
    );
  }
  if (maxCaptionWords > 7) {
    throw new Error(`Unreadable caption cue detected: maximum word count was ${maxCaptionWords}`);
  }

  const seekAndCapture = async (time, filename) => {
    await page.evaluate(targetTime => {
      const element = document.querySelector('[data-testid="studio-after-video"]');
      element.pause();
      element.currentTime = targetTime;
      element.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    }, time);
    await page.waitForFunction(targetTime => {
      const element = document.querySelector('[data-testid="studio-after-video"]');
      return (
        element &&
        Math.abs(element.currentTime - targetTime) < 0.7 &&
        element.readyState >= 2 &&
        element.videoWidth > 0
      );
    }, time, { timeout: 120000 });
    await page.getByText("Loading edited preview...").waitFor({ state: "hidden", timeout: 120000 });
    await page.waitForTimeout(350);
    const visibleCaption = await page.getByTestId("live-caption-preview").innerText();
    if (!visibleCaption.trim()) throw new Error(`No caption was visible at ${time}s`);
    await page.screenshot({ path: path.join(proofDir, filename), fullPage: true });
    return visibleCaption.replace(/\s+/g, " ").trim();
  };
  const firstPreviewCaption = await seekAndCapture(captionStarts[0] + 0.05, "03-caption-start.png");
  const middleIndex = Math.floor(captionCount / 2);
  const middlePreviewCaption = await seekAndCapture(
    captionStarts[middleIndex] + 0.05,
    "04-caption-middle.png"
  );
  const lastPreviewCaption = await seekAndCapture(
    Math.max(captionStarts[captionCount - 1] + 0.05, captionEnds[captionCount - 1] - 0.25),
    "05-caption-end.png"
  );

  const saveProject = page.getByRole("button", { name: "Save project", exact: true });
  if (await saveProject.isVisible().catch(() => false)) {
    await saveProject.click();
    await page.waitForTimeout(5000);
  }

  await page.screenshot({ path: path.join(proofDir, "06-full-captions-ready.png"), fullPage: true });
  const summary = {
    source: sourcePath,
    mode: reuseSavedProject ? "saved-project-spelling-edit" : "fresh-frontend-transcription",
    sourceBytes: fs.statSync(sourcePath).size,
    captionCount,
    firstCaption: firstText,
    lastCaption: lastText,
    maxCaptionWords,
    firstCaptionStart: captionStarts[0],
    lastCaptionEnd: captionEnds[captionCount - 1],
    sourceCoveragePercent: Number(
      ((100 * captionEnds[captionCount - 1]) / 2067.094).toFixed(2)
    ),
    inspectedPreviewCaptions: {
      start: firstPreviewCaption,
      middle: middlePreviewCaption,
      end: lastPreviewCaption,
    },
    timelineCaptionBlocks,
    frontendStatus: lastCaptionMessage || "Saved project restored, caption corrected and persisted",
    uploadSeconds: Math.round((transcriptionStartedAt - uploadStartedAt) / 1000),
    transcriptionSeconds: reuseSavedProject ? 0 : Math.round((Date.now() - transcriptionStartedAt) / 1000),
    pageErrors,
    apiFailures,
    completedAt: new Date().toISOString(),
    persistentBrowserProfile: profileDir,
  };
  fs.writeFileSync(path.join(proofDir, "caption-run-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`[frontend-caption] COMPLETE ${JSON.stringify(summary)}`);

  await context.close();
  if (video) {
    const recordedPath = await video.path();
    const finalVideoPath = path.join(proofDir, "full-podcast-caption-frontend.webm");
    if (recordedPath !== finalVideoPath) fs.renameSync(recordedPath, finalVideoPath);
    console.log(`[frontend-caption] Recording: ${finalVideoPath}`);
  }
}

main().catch(error => {
  console.error(`[frontend-caption] FAILED ${error.stack || error.message}`);
  process.exitCode = 1;
});
