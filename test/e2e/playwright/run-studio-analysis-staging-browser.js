#!/usr/bin/env node
// Real Firebase sign-in + production editor + production API router + cloud job.
// No request interception, E2E bypass header, API mocks, or source byte substitute.
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { chromium } = require("@playwright/test");
const { assertStudioTimelineLayout, clickStudioControl } = require("./studio-timeline-layout");
const execute = promisify(execFile);
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "artifacts/studio-analysis-browser-20261004");
const baseUrl = `http://127.0.0.1:${Number(process.env.STUDIO_BROWSER_PORT || 5006)}`;
const boot = JSON.parse(fs.readFileSync(path.join(folder, "bootstrap.json"), "utf8"));
assert.equal(boot.projectId, "autopromote-staging-2026");
const write = (name, data) =>
  fs.writeFileSync(path.join(folder, name), JSON.stringify(data, null, 2));
const redact = value =>
  JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (
        [
          "url",
          "sourceUrl",
          "videoUrl",
          "signedUrl",
          "token",
          "customToken",
          "otherCustomToken",
        ].includes(key)
      )
        return "[private staging source or credential]";
      return item;
    })
  );
const readProjects = page =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("autopromote-viral-studio", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("projects", "readonly").objectStore("projects").getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => {
            db.close();
            reject(request.error);
          };
        };
      })
  );

async function main() {
  const startedAt = new Date().toISOString();
  for (let attempt = 0; attempt < 60; attempt++) {
    const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
    if (health?.ok) {
      assert.equal((await health.json()).projectId, boot.projectId);
      break;
    }
    if (attempt === 59) throw new Error("Staging preview did not become ready");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: folder, size: { width: 1440, height: 1000 } },
  });
  const page = await context.newPage();
  const requests = [],
    pageErrors = [],
    statuses = new Set(),
    playbackChecks = [],
    layoutChecks = [];
  let submitted = null,
    result = null,
    execution = null;
  page.on("pageerror", error => pageErrors.push(error.message.replace(/https?:\/\/\S+/g, "[URL]")));
  page.on("response", async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/media/studio-analysis-jobs")) return;
    const data = await response.json().catch(() => ({}));
    requests.push({
      at: new Date().toISOString(),
      method: response.request().method(),
      path: url.pathname,
      status: response.status(),
      jobStatus: data.status || null,
    });
    if (response.request().method() === "POST" && url.pathname.endsWith("/from-source")) {
      submitted = { request: response.request().postDataJSON(), receipt: data };
      write("browser-submission.json", submitted);
    }
    if (data.status) statuses.add(data.status);
    if (url.pathname.endsWith("/result") && response.ok()) {
      result = data;
      write("browser-result.json", result);
    }
  });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__STUDIO_STAGING_SIGN_IN === "function");
    const identity = await page.evaluate(
      token => window.__STUDIO_STAGING_SIGN_IN(token),
      boot.customToken
    );
    assert.deepEqual(identity, { uid: boot.ownerUid, projectId: boot.projectId });
    assert.equal(await page.evaluate(() => !!window.__E2E_BYPASS), false);
    await page.getByTestId("studio-after-video").waitFor({ state: "attached", timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 2,
      null,
      { timeout: 120000 }
    );
    await page
      .locator(".creative-tool-rail")
      .getByRole("button", { name: "Cut", exact: true })
      .click();
    const clipEnd = page.getByLabel("Clip end", { exact: true });
    await clipEnd.evaluate(input => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setValue.call(input, "600");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    assert.equal(
      Number(await clipEnd.inputValue()),
      600,
      "Editor trim must end at exactly ten minutes"
    );
    const reframe = page
      .locator(".creative-tool-rail")
      .getByRole("button", { name: "Reframe", exact: true });
    await reframe.click();
    const analyze = page.getByTestId("analyze-source-shots");
    await analyze.waitFor({ timeout: 30000 });
    const play = page.getByRole("button", { name: "Play comparison", exact: false });
    if (await play.isVisible()) await play.click();
    const assertPlaying = async label => {
      layoutChecks.push(await assertStudioTimelineLayout(page, label));
      const programme = page.getByTestId("studio-after-video");
      const beforeTime = await programme.evaluate(video => video.currentTime);
      await page.waitForTimeout(1000);
      const state = await programme.evaluate(video => ({
        currentTime: video.currentTime,
        paused: video.paused,
        muted: video.muted,
        volume: video.volume,
        readyState: video.readyState,
      }));
      assert(
        !state.paused &&
          !state.muted &&
          state.volume > 0.05 &&
          state.currentTime > beforeTime + 0.2,
        `${label}: monitored playback stopped`
      );
      assert(
        !(await page.locator(".after-preview-loading").isVisible()),
        `${label}: blocking loader is visible`
      );
      playbackChecks.push({ label, beforeTime, ...state });
    };
    await assertPlaying("before submission");
    await page.screenshot({ path: path.join(folder, "frontend-before.png"), fullPage: true });
    const before = await readProjects(page);
    write("editor-before.json", redact(before));
    console.log(
      "[browser] Real sign-in and source playback ready; submitting ten-minute analysis."
    );
    await analyze.click();
    await page.waitForFunction(() => document.body.innerText.includes("analysis is queued"), null, {
      timeout: 60000,
    });
    assert.equal(submitted.receipt.status, "queued");
    assert.equal(submitted.request.storagePath, boot.storagePath);
    assert.equal(submitted.request.end - submitted.request.start, 600);
    await page.screenshot({ path: path.join(folder, "frontend-queued.png"), fullPage: true });
    await assertPlaying("while queued");
    const afterQueue = await readProjects(page);
    assert.deepEqual(
      afterQueue[0]?.snapshot?.reframeKeyframes || [],
      before[0]?.snapshot?.reframeKeyframes || []
    );
    console.log("[browser] Queued; starting the existing Cloud Run analysis worker.");
    const trigger = await execute(
      "gcloud",
      [
        "run",
        "jobs",
        "execute",
        "studio-analysis-once",
        "--project=autopromote-staging-2026",
        "--region=us-central1",
        "--async",
        "--format=json",
      ],
      { timeout: 60000 }
    );
    execution = JSON.parse(trigger.stdout);
    write("browser-worker-trigger.json", execution);
    let capturedRunning = false;
    const deadline = Date.now() + 15 * 60000;
    let lastStatus = "queued";
    while (!result && Date.now() < deadline) {
      await page.waitForTimeout(5000);
      const text = await page.locator(".reframe-corrections-card").innerText();
      const status = text.includes("draft applied")
        ? "applied"
        : text.includes("Analyzing camera cuts")
          ? "running"
          : "queued";
      if (status !== lastStatus) {
        console.log(`[browser] ${status}`);
        lastStatus = status;
      }
      if (status === "running" && !capturedRunning) {
        await assertPlaying("while running");
        await page.screenshot({ path: path.join(folder, "frontend-running.png"), fullPage: true });
        capturedRunning = true;
      }
      if (!(await analyze.isDisabled()) && !text.includes("draft applied"))
        throw new Error(`Analysis did not apply: ${text}`);
    }
    assert(result, "Browser did not retrieve a completed analysis result");
    await page.waitForFunction(() => document.body.innerText.includes("draft applied"), null, {
      timeout: 30000,
    });
    await page.screenshot({ path: path.join(folder, "frontend-applied.png"), fullPage: true });
    await assertPlaying("after result applied");
    assert.equal(result.sceneCuts.length, 143);
    assert(result.tracks.solo.coverage > 0.99);
    assert(statuses.has("queued") && statuses.has("running") && statuses.has("completed"));
    assert(capturedRunning);
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    await clickStudioControl(page, page.getByTestId("studio-save-project"));
    await page.waitForFunction(() => document.body.innerText.includes("Saved locally"), null, {
      timeout: 30000,
    });
    const after = await readProjects(page);
    write("editor-after.json", redact(after));
    const snapshot = after.find(
      project => project.snapshot.reframeKeyframes.length > 1000
    )?.snapshot;
    assert(snapshot, "Editor did not persist applied framing keys");
    assert.equal(snapshot.reframeKeyframes.length, result.tracks.solo.keyframes.length);
    assert.equal(snapshot.reframeModeCuts.length, result.editPlan.timelineCuts.length);
    assert.equal(snapshot.studioDocument.projectId, submitted.request.projectId);
    assert(
      snapshot.studioDocument.clipOccurrences.some(
        clip => clip.assetId === submitted.request.sourceAssetId
      )
    );
    const token = await page.evaluate(() => window.__STUDIO_STAGING_ID_TOKEN());
    const otherLogin = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${boot.firebase.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: boot.otherCustomToken, returnSecureToken: true }),
      }
    );
    assert(otherLogin.ok, "Second real Firebase user could not sign in");
    const otherToken = (await otherLogin.json()).idToken;
    const jobUrl = `${baseUrl}/api/media/studio-analysis-jobs/${submitted.receipt.jobId}`;
    const authorization = [];
    for (const [label, credential, expected] of [
      ["owner", token, 200],
      ["other owner", otherToken, 404],
      ["unauthenticated", null, 401],
      ["test-token bypass rejected", "test-token-for-staging-smoke", 401],
    ]) {
      const response = await fetch(jobUrl, {
        headers: credential ? { Authorization: `Bearer ${credential}` } : {},
      });
      assert.equal(response.status, expected, label);
      authorization.push({ label, status: response.status });
    }
    const receipt = {
      passed: true,
      startedAt,
      completedAt: new Date().toISOString(),
      projectId: boot.projectId,
      browser: "Chromium",
      realFirebaseAuth: true,
      authBypass: false,
      mockedRequests: 0,
      productionEditorComponent: true,
      apiHost: "localhost; production media router backed by staging Firebase",
      cloudWorker: execution.metadata?.name || execution.name,
      jobId: submitted.receipt.jobId,
      states: [...statuses],
      sourceRangeSeconds: 600,
      sceneCuts: result.sceneCuts.length,
      framingPoints: snapshot.reframeKeyframes.length,
      timelineCuts: snapshot.reframeModeCuts.length,
      sampledCoverage: result.tracks.solo.coverage,
      projectBindingVerified: true,
      previousFramingPreservedWhileQueued: true,
      localCheckpointSaved: true,
      resultSha256: crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex"),
      authorization,
      playbackChecks,
      layoutChecks,
      pageErrors,
      proofScope:
        "Production Studio component in a localhost acceptance host; dashboard navigation and public deployment excluded",
    };
    assert.deepEqual(pageErrors, []);
    write("browser-receipt.json", receipt);
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    await page
      .screenshot({ path: path.join(folder, "frontend-failure.png"), fullPage: true })
      .catch(() => {});
    write("browser-failure.json", {
      at: new Date().toISOString(),
      error: error.message.replace(/https?:\/\/\S+/g, "[URL]"),
      pageErrors,
      states: [...statuses],
      jobId: submitted?.receipt?.jobId || null,
    });
    throw error;
  } finally {
    write("browser-network.json", requests);
    await context.close();
    await page.video()?.saveAs(path.join(folder, "frontend-browser.webm"));
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.message.replace(/https?:\/\/\S+/g, "[URL]"));
  process.exitCode = 1;
});
