const { chromium } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const sourcePath =
  process.env.TEN_MINUTE_SOURCE ||
  path.join(repoRoot, "proof/viral-clip-studio/ten-minute-director/unmuted-podcast-10m-source.mp4");
const proofDir = path.join(repoRoot, "proof/viral-clip-studio/ten-minute-director");
const payloadPath = "/tmp/autopromote-10m-cloud-payload.json";
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5000";
const liveRender = process.env.FRONTEND_RENDER_LIVE === "1";
const uploadReferencePath = "/tmp/autopromote-10m-upload-reference.mp4";

const loadSourceUrl = () => {
  const explicit = String(process.env.AUTOPROMOTE_QA_SOURCE_URL || "").trim();
  if (explicit) return explicit;
  if (!fs.existsSync(payloadPath)) {
    throw new Error("AUTOPROMOTE_QA_SOURCE_URL is required for the frontend render proof");
  }
  return String(JSON.parse(fs.readFileSync(payloadPath, "utf8")).video_url || "").trim();
};

const buildPayload = sourceUrl => {
  const generator = path.join(proofDir, "generate_cloud_payload.py");
  execFileSync("python3", [generator, payloadPath], {
    cwd: repoRoot,
    env: { ...process.env, AUTOPROMOTE_QA_SOURCE_URL: sourceUrl },
    stdio: "pipe",
  });
  return JSON.parse(fs.readFileSync(payloadPath, "utf8"));
};

const defaultTrackStates = Object.fromEntries(
  ["video", "adjustment", "graphics", "broll", "captions", "originalAudio", "voiceover", "music", "sfx"].map(
    id => [id, { visible: true, locked: false, muted: false, solo: false }]
  )
);

const buildSnapshot = payload => {
  const clip = {
    id: "real-podcast-10m",
    title: "Unmuted podcast — 10 minute caption, grade and director proof",
    start: 0,
    end: 600,
    duration: 600,
    url: payload.video_url,
    videoUrl: payload.video_url,
    autoCaptions: true,
  };
  const reframe = payload.finish_plan.reframe;
  const color = payload.finish_plan.color;
  const texture = payload.finish_plan.texture || {};
  return {
    orderedClips: [clip],
    selectedClipId: clip.id,
    overlays: [],
    activeOverlayId: null,
    videoFit: "cover",
    safeFaceFraming: true,
    faceAnchorPreset: "face_top",
    autoCaptions: true,
    captionStyle: payload.caption_style,
    captionPosition: payload.caption_position,
    captionScale: payload.caption_scale,
    captionTextOverride: "",
    captionSegments: payload.caption_segments.map(segment => ({
      ...segment,
      source_clip_id: clip.id,
    })),
    translateCaptionsToEnglish: false,
    previewSpeed: 1,
    pacingLevel: "balanced",
    creativeIntent: "clarity",
    creativeEffectsEnabled: false,
    creativePreset: "auto_story",
    creativeIntensity: "balanced",
    finishFx: {
      precisionGrade: true,
      preset: color.preset,
      exposureStops: color.exposureStops,
      lift: color.lift,
      gamma: color.gamma,
      gain: color.gain,
      tint: color.tint,
      brightness: color.brightness,
      contrast: color.contrast,
      saturation: color.saturation,
      temperature: color.temperature,
      sharpness: color.sharpness,
      vignette: color.vignette,
      zoom: 1,
      zoomAnchor: "center",
      filmGrain: texture.film_grain || 0,
      chromaticAberration: texture.chromatic_aberration || 0,
      vhsTracking: texture.vhs_tracking || 0,
      lightLeak: texture.light_leak || 0,
    },
    finishKeyframes: [],
    podcastVisualizer: { enabled: false, mode: "wave", color: "#72f7ff", intensity: 0.75, position: "bottom" },
    beatSnapEnabled: true,
    contentProfile: "podcast_interview",
    cutRangeStart: null,
    cutRangeEnd: null,
    joinTransition: "clean_cut",
    joinTransitionDuration: 0.18,
    smartCrop: true,
    smartCropMode: "speaker_track",
    reframeAspect: "9:16",
    speakerTrackZoom: Number(reframe.zoom || 1.02),
    reframeKeyframes: reframe.keyframes,
    reframeModeCuts: reframe.timeline_cuts,
    speakerFocusCuts: reframe.speaker_order_cuts,
    speakerStackFraming: {
      trackSpeakers: true,
      top: reframe.split_source.top,
      bottom: reframe.split_source.bottom,
      third: { x: 50, y: 50, zoom: 1, keyframes: [] },
      fourth: { x: 50, y: 50, zoom: 1, keyframes: [] },
    },
    speakerStackSourceIds: { top: null, bottom: null, third: null, fourth: null },
    speakerStackOffsets: { top: 0, bottom: 0, third: 0, fourth: 0 },
    speakerStackSources: [],
    speakerStackCameraCount: 2,
    speakerStackLayout: "stack_2",
    speakerStackSyncConfirmed: false,
    activeReframeKeyframeId: null,
    enhanceQuality: false,
    silenceRemoval: false,
    silenceThreshold: -35,
    minSilenceDuration: 0.75,
    removeWatermark: false,
    watermarkMode: "adaptive",
    brandWatermark: false,
    brandWatermarkVariant: "studio",
    brandWatermarkText: "AutoPromote · Viral Clip Studio",
    mainFrame: { enabled: false, insetPercent: 0, radiusPercent: 0, background: "studio_black" },
    exportSettings: {
      resolution: "1080p",
      fps: "30",
      codec: "h264",
      quality: "high",
      videoBitrate: "auto",
      targetFileSizeMb: "",
      audioCodec: "aac",
      audioBitrate: "192",
      colorSpace: "rec709",
    },
    manualWatermarkRegions: [],
    activeWatermarkRegionId: null,
    addHook: false,
    addMusic: false,
    muteOriginalAudio: false,
    musicTrack: null,
    soundEffects: [],
    voiceovers: [],
    audioRemix: { version: 1, enabled: false, preset: "clean", speed: 1, pitchSemitones: 0, reverbMix: 0 },
    bRollCadence: "balanced",
    timeline: [
      {
        id: "main",
        sourceClipId: clip.id,
        url: payload.video_url,
        duration: 600,
        startRequest: 0,
        endRequest: 600,
      },
    ],
    activeTimelineIndex: 0,
    timelineZoom: 1,
    timelineEditTool: "select",
    timelineSnapping: true,
    linkedSelection: true,
    rippleMode: false,
    trackStates: defaultTrackStates,
    motionKeyframes: [],
    motionScenes: [],
    threeDScenes: [],
    motionTargetId: "main-video",
    compositeTargetId: "main-video",
    mainTransform: {
      id: "main-video",
      name: "Main video",
      type: "video",
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      opacity: 1,
      cropX: 0,
      cropY: 0,
    },
    audioKeyframes: { originalAudio: [], masterPodcast: [], voiceover: [], music: [], broll: [], sfx: [] },
    speedKeyframes: [],
    adjustmentLayers: payload.finish_plan.adjustment_layers,
    compoundClips: [],
    audioAutomationSource: "originalAudio",
    audioRestoration: {
      enabled: false,
      preset: "natural",
      voiceIsolation: false,
      denoise: 0,
      deEsser: 0,
      humFrequency: 50,
      compressor: 0,
      limiter: 0,
      loudness: -14,
      eq: { low: 0, mid: 0, high: 0 },
    },
    proxySettings: { enabled: true, resolution: "720p", codec: "h264", status: "source_ready" },
    stabilization: { enabled: false, strength: 35, crop: "adaptive", rollingShutter: false },
    advancedColor: {
      lutName: "",
      lutFile: null,
      lutIntensity: 100,
      curve: { shadows: 0, midtones: 0, highlights: 0 },
      hsl: { hue: 0, saturation: 0, luminance: 0 },
    },
    creatorPreview: { enabled: false, activeDemo: null },
    splitExportEnabled: false,
    splitExportHooks: [],
  };
};

const json = value => ({ status: 200, contentType: "application/json", body: JSON.stringify(value) });

const redactPayload = requestBody => {
  const copy = JSON.parse(JSON.stringify(requestBody));
  if (copy.fileUrl) copy.fileUrl = "[verified Firebase source URL]";
  const viral = copy.options?.viralData;
  if (viral?.video_url) viral.video_url = "[verified Firebase source URL]";
  for (const segment of viral?.timeline_segments || []) {
    if (segment.url) segment.url = "[verified Firebase source URL]";
  }
  return copy;
};

const assertPayload = body => {
  const viral = body?.options?.viralData;
  if (!viral) throw new Error("Frontend did not submit options.viralData");
  const checks = {
    renderViral: body.options.renderViral === true,
    duration600: Number(viral.end_time) === 600,
    captions196: viral.caption_segments?.length === 196,
    captionReviewCopy: viral.caption_review_copy === true,
    portrait916: viral.finish_plan?.reframe?.aspect === "9:16",
    framingKeys60: viral.finish_plan?.reframe?.keyframes?.length === 60,
    directorCuts13: viral.finish_plan?.reframe?.timeline_cuts?.length === 13,
    splitSource: Boolean(viral.finish_plan?.reframe?.split_source?.top && viral.finish_plan?.reframe?.split_source?.bottom),
    adjustmentLayer: viral.finish_plan?.adjustment_layers?.length === 1,
    precisionGrade: viral.finish_plan?.color?.precisionGrade === true,
    watermarkOff: viral.brand_watermark === false,
    sourceAudioOn: viral.mute_audio === false,
    timeline600: viral.timeline_segments?.length === 1 && Number(viral.timeline_segments[0]?.duration) === 600,
    export1080p: viral.output_settings?.resolution === "1080p",
    export30fps: String(viral.output_settings?.fps) === "30",
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`Frontend payload gate failed: ${failed.join(", ")}`);
  return checks;
};

async function putProject(page, snapshot) {
  await page.evaluate(
    ({ projectSnapshot }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("autopromote-viral-studio", 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("projects")) {
            const store = database.createObjectStore("projects", { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("projects", "readwrite");
          transaction.objectStore("projects").put({
            id: "ten-minute-frontend-proof",
            name: "10m Podcast · Captions + Director + Split + Grade",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            versions: [],
            snapshot: projectSnapshot,
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { projectSnapshot: snapshot }
  );
}

async function main() {
  if (!fs.existsSync(sourcePath)) throw new Error(`10-minute source not found: ${sourcePath}`);
  execFileSync("ffmpeg", [
    "-v", "error", "-ss", "0", "-t", "2", "-i", sourcePath,
    "-vf", "scale=640:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-y", uploadReferencePath,
  ]);
  fs.mkdirSync(proofDir, { recursive: true });
  const profileDir = fs.mkdtempSync(
    path.join("/tmp", liveRender ? "autopromote-browser-live-" : "autopromote-browser-dry-")
  );
  const sourceUrl = loadSourceUrl();
  const canonicalPayload = buildPayload(sourceUrl);
  const snapshot = buildSnapshot(canonicalPayload);
  let submittedBody = null;
  let submittedUrl = null;
  let payloadChecks = null;
  const pageErrors = [];
  const apiFailures = [];

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: process.env.PW_HEADFUL !== "1",
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: proofDir, size: { width: 1440, height: 900 } },
    args: process.env.PW_HEADFUL === "1" ? ["--ozone-platform=x11"] : ["--disable-gpu"],
  });
  const page = context.pages()[0] || (await context.newPage());
  const video = page.video();
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  page.on("response", response => {
    if (response.url().includes("/api/media/") && response.status() >= 400) {
      apiFailures.push({ status: response.status(), url: response.url() });
    }
  });
  page.on("request", request => {
    if (request.url().endsWith("/api/media/process") && request.method() === "POST") {
      submittedUrl = request.url();
      submittedBody = request.postDataJSON();
      payloadChecks = assertPayload(submittedBody);
      fs.writeFileSync(
        path.join(proofDir, liveRender ? "frontend-live-request-redacted.json" : "frontend-dry-run-request-redacted.json"),
        JSON.stringify(redactPayload(submittedBody), null, 2)
      );
    }
  });

  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "test-token-for-frontendProofOperator";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({
        uid: "frontendProofOperator",
        email: "frontend.proof@example.com",
        name: "Frontend Proof Operator",
        role: "user",
      })
    );
  });

  const enabledProfile = {
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
  await page.route("**/api/users/profile", route => route.fulfill(json(enabledProfile)));
  await page.route("**/api/users/me", route =>
    route.fulfill(json({ user: { uid: "frontendProofOperator", email: "frontend.proof@example.com", name: "Frontend Proof Operator" } }))
  );
  await page.route("**/api/content/my-content**", route => route.fulfill(json({ content: [] })));
  await page.route("**/api/platform/status", route => route.fulfill(json({ raw: {} })));
  await page.route("**/api/health", route => route.fulfill(json({ status: "OK" })));
  await page.route("**/api/media/credits", route =>
    route.fulfill(json({ balance: 999, monthly: { remaining: 999 }, topUp: 0, costs: { "render-clip": 5 }, localCreditBypass: true }))
  );
  await page.route(
    url => decodeURIComponent(url.href).includes("/temp/viral-qa/ten-minute-source-20260919.mp4"),
    route => {
    const total = fs.statSync(sourcePath).size;
    if (route.request().method() === "HEAD") {
      return route.fulfill({ status: 200, contentType: "video/mp4", headers: { "Access-Control-Allow-Origin": baseUrl, "Accept-Ranges": "bytes", "Content-Length": String(total) } });
    }
    const match = /^bytes=(\d+)-(\d*)$/i.exec(route.request().headers().range || "");
    const start = match ? Number(match[1]) : 0;
    const requestedEnd = match?.[2] ? Number(match[2]) : start + 4 * 1024 * 1024 - 1;
    const end = Math.min(total - 1, requestedEnd);
    const body = Buffer.alloc(Math.max(0, end - start + 1));
    const descriptor = fs.openSync(sourcePath, "r");
    try {
      fs.readSync(descriptor, body, 0, body.length, start);
    } finally {
      fs.closeSync(descriptor);
    }
    return route.fulfill({
      status: 206,
      contentType: "video/mp4",
      headers: {
        "Access-Control-Allow-Origin": baseUrl,
        "Accept-Ranges": "bytes",
        "Content-Length": String(body.length),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body,
    });
    }
  );
  await page.route("**/api/content/upload/source-file**", route =>
    route.fulfill(json({ ok: true, url: sourceUrl, storagePath: "temp/viral-qa/ten-minute-source-20260919.mp4", size: fs.statSync(sourcePath).size }))
  );
  if (!liveRender) {
    await page.route("**/api/media/process", route => route.fulfill(json({ success: true, jobId: "frontend-dry-run-job" })));
    await page.route("**/api/media/status/frontend-dry-run-job", route =>
      route.fulfill(json({ success: true, status: "completed", progress: 100, result: { success: true, url: sourceUrl, captionReviewCopy: true } }))
    );
  }

  console.log("[frontend-proof] opening dashboard");
  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("[frontend-proof] storing reviewed project");
  await putProject(page, snapshot);
  console.log("[frontend-proof] opening Viral Clip Studio entry");
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
  console.log("[frontend-proof] selecting existing-source upload reference");
  // The full source is already in Firebase. Selecting this tiny derivative
  // exercises the actual frontend upload control without retransmitting the
  // existing 791 MB object; the intercepted upload response binds the Studio
  // to the full 10-minute cloud source used by the renderer.
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(uploadReferencePath);
  console.log("[frontend-proof] waiting for source preview validation");
  const openStudio = page.getByRole("button", { name: "Open Creator Studio", exact: true });
  try {
    await openStudio.waitFor({ state: "visible", timeout: 120000 });
  } catch (error) {
    const status = await page.locator('.progress-modal[role="status"]').innerText().catch(() => "");
    const alert = await page.locator('.progress-modal[role="alert"]').innerText().catch(() => "");
    await page.screenshot({ path: path.join(proofDir, "frontend-entry-failure.png"), fullPage: true });
    await context.close();
    throw new Error(`Frontend entry did not become ready. status=${status} alert=${alert} cause=${error.message}`);
  }
  console.log("[frontend-proof] source ready; opening creator studio");
  await openStudio.click();
  await page.getByTestId("studio-after-video").waitFor({ state: "attached", timeout: 120000 });

  console.log("[frontend-proof] loading 10-minute saved edit");
  await page.getByRole("button", { name: "Show media", exact: true }).click();
  const savedProjects = page.locator(".studio-saved-projects");
  await savedProjects.locator("summary").click();
  await savedProjects.getByText("10m Podcast · Captions + Director + Split + Grade", { exact: true }).click();

  console.log("[frontend-proof] capturing caption, director/split and grade controls");
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Captions", exact: true }).click();
  await page.getByLabel("Caption 196 text").waitFor({ state: "attached", timeout: 60000 });
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-captions.png" : "frontend-dry-run-captions.png"), fullPage: true });
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-director-split.png" : "frontend-dry-run-director-split.png"), fullPage: true });
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Color", exact: true }).click();
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-grade.png" : "frontend-dry-run-grade.png"), fullPage: true });
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Export", exact: true }).click();

  const watermarkToggle = page.getByLabel("Include AutoPromote signature");
  if (await watermarkToggle.isChecked()) await watermarkToggle.uncheck();
  await page.getByRole("radio", { name: "Reels", exact: true }).click();
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-ready-to-render.png" : "frontend-dry-run-ready-to-render.png"), fullPage: true });

  console.log(`[frontend-proof] clicking ${liveRender ? "LIVE" : "dry-run"} frontend render control`);
  await page.getByTestId("render-caption-review-copy").click();
  await page.waitForFunction(() => document.body.innerText.includes("Queued for Rendering") || document.body.innerText.includes("Rendering Clip"), null, { timeout: 120000 });
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-render-started.png" : "frontend-dry-run-render-started.png"), fullPage: true });
  await page.getByTestId("rendered-output-ready").waitFor({ state: "visible", timeout: liveRender ? 65 * 60 * 1000 : 60000 });
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-render-complete.png" : "frontend-dry-run-render-complete.png"), fullPage: true });

  if (!submittedBody || !payloadChecks) throw new Error("No validated frontend render request was captured");
  if (submittedUrl !== "http://127.0.0.1:8000/api/media/process") {
    throw new Error(`Frontend render targeted the wrong backend: ${submittedUrl}`);
  }
  const receipt = {
    mode: liveRender ? "live" : "dry-run",
    capturedAt: new Date().toISOString(),
    sourceFile: sourcePath,
    sourceBytes: fs.statSync(sourcePath).size,
    uploadReferenceFile: uploadReferencePath,
    uploadReferenceBytes: fs.statSync(uploadReferencePath).size,
    checks: payloadChecks,
    backendUrl: submittedUrl,
    passed: Object.values(payloadChecks).filter(Boolean).length,
    failed: Object.values(payloadChecks).filter(value => !value).length,
    pageErrors,
    apiFailures,
  };
  fs.writeFileSync(
    path.join(proofDir, liveRender ? "frontend-live-render-receipt.json" : "frontend-dry-run-render-receipt.json"),
    JSON.stringify(receipt, null, 2)
  );

  await context.close();
  if (video) {
    const recordedPath = await video.path();
    const destination = path.join(proofDir, liveRender ? "frontend-live-render-workflow.webm" : "frontend-dry-run-workflow.webm");
    fs.copyFileSync(recordedPath, destination);
  }
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
