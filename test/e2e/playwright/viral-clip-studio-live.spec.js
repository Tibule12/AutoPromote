const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Keep complete recordings for visual review, including successful runs. The
// two workflows below intentionally use different source footage.
test.use({
  video: {
    mode: "on",
    size: { width: 1440, height: 900 },
  },
});

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const getBase = () => process.env.E2E_BASE_URL || `http://localhost:${STATIC_PORT}`;
const liveSourcePath = path.join(os.tmpdir(), `autopromote-viral-studio-${process.pid}.mp4`);
const brandLogoPath = path.join(os.tmpdir(), `autopromote-e2e-logo-${process.pid}.png`);
const generatedHqPreviewPath = path.join(os.tmpdir(), `autopromote-e2e-hq-${process.pid}.mp4`);
const motionSourcePath = path.join(
  os.tmpdir(),
  `autopromote-motion-sculpture-${process.pid}.mp4`
);
const speakerTopSourcePath = path.join(
  os.tmpdir(),
  `autopromote-speaker-top-${process.pid}.mp4`
);
const speakerBottomSourcePath = path.join(
  os.tmpdir(),
  `autopromote-speaker-bottom-${process.pid}.mp4`
);
const speakerThirdSourcePath = path.join(
  os.tmpdir(),
  `autopromote-programme-camera-3-${process.pid}.mp4`
);
const speakerFourthSourcePath = path.join(
  os.tmpdir(),
  `autopromote-layout-test-camera-4-${process.pid}.mp4`
);
const contextBRollSourcePath = path.join(
  os.tmpdir(),
  `autopromote-context-broll-${process.pid}.mp4`
);
const defaultMotionSource = path.join(os.homedir(), "Downloads", "IMG_3960.MOV");
const defaultSpeakerTopSource = path.join(os.homedir(), "Videos", "IMG_5805.MOV");
const defaultSpeakerBottomSource = path.join(os.homedir(), "Videos", "IMG_5028.MOV");
const defaultEpisodeThreeSource = path.join(
  os.homedir(),
  "Videos",
  "cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4"
);
const defaultContextBRollSource = path.join(
  os.homedir(),
  "Videos",
  "Screencasts",
  "Screencast from 2026-08-22 13-21-50.webm"
);
const hasLocalSpeakerPair =
  fs.existsSync(defaultSpeakerTopSource) && fs.existsSync(defaultSpeakerBottomSource);
const defaultBRollSource = path.join(
  os.homedir(),
  "Downloads",
  "whatsapp-085658-broll",
  "real-video-sources",
  "segments",
  "07-sunrise-camera.mp4.mp4"
);
const bRollSourcePath =
  process.env.VIRAL_STUDIO_E2E_BROLL ||
  (fs.existsSync(defaultBRollSource) ? defaultBRollSource : liveSourcePath);

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

const json = value => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(value),
});

const buildLiveSource = () => {
  const requestedSource =
    process.env.VIRAL_STUDIO_E2E_SOURCE ||
    (fs.existsSync(defaultEpisodeThreeSource) ? defaultEpisodeThreeSource : null);
  if (requestedSource && fs.existsSync(requestedSource)) {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      "0",
      "-t",
      "12",
      "-i",
      requestedSource,
      "-vf",
      "scale=640:-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-y",
      liveSourcePath,
    ]);
    return;
  }

  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=12",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    "-y",
    liveSourcePath,
  ]);
};

const assertMediaHasAudio = mediaPath => {
  const audioCodec = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    mediaPath,
  ])
    .toString()
    .trim();
  if (!audioCodec) throw new Error(`Expected an audio stream in ${mediaPath}`);
  return audioCodec;
};

const installAppRoutes = async (page, sourcePath = liveSourcePath) => {
  const sourceBody = fs.readFileSync(sourcePath);
  const state = {
    captionTranslationRequests: [],
    faceTrackingRequests: 0,
    faceTrackingResult: { tracks: { top: { coverage: .8, keyframes: [{ time: 0, x: 34, y: 47 }, { time: 8, x: 35, y: 47 }] },
      bottom: { coverage: .16, keyframes: [{ time: 0, x: 89, y: 17 }, { time: 8, x: 90, y: 17 }] } } },
    renderPayload: null,
    renderStatusPolls: 0,
    silencePreviewRequests: 0,
  };
  await page.route("**/live-studio-source.mp4*", route => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range ? Math.min(sourceBody.length - 1, start + 1024*1024 - 1,
      range[2] ? Number(range[2]) : sourceBody.length - 1) : sourceBody.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "video/mp4",
      headers: { "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${sourceBody.length}` } : {}) },
      body: sourceBody.subarray(start, end + 1),
    });
  });
  await page.route("**/api/users/profile", route => route.fulfill(json(enabledEditingProfile)));
  await page.route("**/api/users/me", route =>
    route.fulfill(json({ user: { uid: "testUser", email: "test@local", name: "Studio Tester" } }))
  );
  await page.route("**/api/content/my-content**", route => route.fulfill(json({ content: [] })));
  await page.route("**/api/platform/status", route => route.fulfill(json({ raw: {} })));
  await page.route("**/api/health", route => route.fulfill(json({ status: "OK" })));
  await page.route("**/api/media/credits", route =>
    route.fulfill(
      json({
        balance: 999,
        monthly: { remaining: 999 },
        topUp: 0,
        costs: { analyze: 8, "render-clip": 5, "audio-extract": 3 },
        localCreditBypass: true,
      })
    )
  );
  await page.route("**/api/content/upload/source-file**", route =>
    route.fulfill(
      json({
        ok: true,
        url: `${getBase()}/live-studio-source.mp4`,
        storagePath: "e2e/live-studio-source.mp4",
        size: sourceBody.length,
      })
    )
  );
  await page.route("**/api/media/track-studio-faces", async route => {
    state.faceTrackingRequests += 1;
    await route.fulfill(json(state.faceTrackingResult));
  });
  await page.route("**/api/media/transcribe", async route => {
    const multipart = (await route.request().postDataBuffer())?.toString("utf8") || "";
    const translateToEnglish = /name="translate_to_english"[\s\S]*?true/.test(multipart);
    state.captionTranslationRequests.push(translateToEnglish);
    await route.fulfill(
      json({
        language_mode: translateToEnglish ? "translated_to_english" : "preserve_spoken_languages",
        segments: translateToEnglish
          ? [
              {
                start: 0,
                end: 6.9,
                text: "Greetings! This is Unmuted, a space for honest conversations with creatives,",
                speaker: "host",
                speakerLabel: "Host",
                language: "en",
                languages: ["en"],
                languageConfidence: 0.96,
              },
              {
                start: 7.16,
                end: 11.9,
                text: "Artists, performers and everyday people. Here at Unmuted",
                speaker: "host",
                speakerLabel: "Host",
                language: "en",
                languages: ["en"],
                languageConfidence: 0.94,
              },
            ]
          : [
              {
                start: 0,
                end: 6.9,
                text: "Greetings! This is Unmuted, a space for honest conversations with creatives,",
                speaker: "host",
                speakerLabel: "Host",
                language: "en",
                languages: ["en"],
                languageConfidence: 0.96,
              },
              {
                start: 7.16,
                end: 11.9,
                text: "Artists, performers and everyday people. Here at Unmuted",
                speaker: "host",
                speakerLabel: "Host",
                language: "en",
                languages: ["en"],
                languageConfidence: 0.94,
              },
            ],
      })
    );
  });
  await page.route("**/api/media/preview-silence", route => {
    state.silencePreviewRequests += 1;
    return route.fulfill(
      json({
        silence_segments: [{ start: 6.4, end: 7.1, duration: 0.7 }],
        keep_segments: [
          { start: 0, end: 6.4 },
          { start: 7.1, end: 12 },
        ],
      })
    );
  });
  await page.route("**/api/media/process", async route => {
    state.renderPayload = route.request().postDataJSON();
    await route.fulfill(json({ jobId: "viral-live-render" }));
  });
  await page.route("**/api/media/status/viral-live-render", async route => {
    state.renderStatusPolls += 1;
    if (state.renderStatusPolls === 1) {
      await route.fulfill(
        json({ status: "processing", progress: 47, detail: "Compositing approved layers" })
      );
      return;
    }
    await route.fulfill(
      json({
        status: "completed",
        result: {
          status: "completed",
          url: `${getBase()}/live-studio-source.mp4`,
          audioProof: { expected: true, verified: true, codec: "aac" },
        },
      })
    );
  });
  return state;
};

const openViralClipStudioEntry = async page => {
  const navButton = page.getByRole("button", { name: "Viral Clip Studio", exact: true });
  await expect(navButton).toBeVisible();
  const [navBox, topbarBox] = await Promise.all([
    navButton.boundingBox(),
    page.locator(".dashboard-topbar").boundingBox(),
  ]);
  expect(navBox).not.toBeNull();
  expect(topbarBox).not.toBeNull();
  expect(navBox.y).toBeGreaterThanOrEqual(topbarBox.y + topbarBox.height - 1);
  await navButton.click();
};

test.beforeAll(async () => {
  buildLiveSource();
  assertMediaHasAudio(liveSourcePath);
  // CI has no access to the editor's laptop-only brand assets. This PNG is a
  // deterministic upload fixture; the separate local logo proof is visual QA.
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "color=c=0x211449:s=512x160",
    "-vf", "drawbox=x=28:y=28:w=456:h=104:color=0x7658f5:t=8",
    "-frames:v", "1", "-y", brandLogoPath,
  ]);
  if (hasLocalSpeakerPair) {
    [
      [defaultSpeakerTopSource, speakerTopSourcePath],
      [defaultSpeakerBottomSource, speakerBottomSourcePath],
    ].forEach(([input, output]) => {
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-ss",
        "0",
        "-t",
        "12",
        "-i",
        input,
        "-vf",
        "scale=640:-2,fps=30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-an",
        "-movflags",
        "+faststart",
        "-y",
        output,
      ]);
    });
    // Camera 3 is the real synchronized two-person programme composition from
    // the Episode 3 archive. Camera 4 remains a clearly named test-only detail
    // crop used only to exercise grid mechanics; final editorial proof relies
    // on the genuine clean pair and real programme composition.
    [
      [defaultEpisodeThreeSource, speakerThirdSourcePath, "scale=640:-2"],
      [defaultEpisodeThreeSource, speakerFourthSourcePath, "crop=iw*0.72:ih:iw*0.14:0,scale=640:-2"],
    ].forEach(([input, output, filter]) => {
      execFileSync("ffmpeg", [
        "-v", "error", "-ss", "0", "-t", "12", "-i", input,
        "-vf", `${filter},fps=30`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-an", "-movflags", "+faststart", "-y", output,
      ]);
    });
  }
  if (fs.existsSync(defaultMotionSource)) {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      "72",
      "-t",
      "12",
      "-i",
      defaultMotionSource,
      "-vf",
      "scale=960:-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-y",
      motionSourcePath,
    ]);
  }
  if (fs.existsSync(defaultContextBRollSource)) {
    // This is real moving AutoPromote/Cam Combiner footage from the same podcast
    // workflow. Crop away the desktop/browser identity chrome before using it as
    // an editorial cutaway in the frontend proof.
    execFileSync("ffmpeg", [
      "-v", "error", "-ss", "2", "-t", "9", "-i", defaultContextBRollSource,
      "-vf", "crop=1400:788:70:115,scale=960:-2,fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-an", "-movflags", "+faststart", "-y", contextBRollSourcePath,
    ]);
  }
  const staticReady = require("./static-server");
  await staticReady;
});

test.afterAll(() => {
  if (fs.existsSync(liveSourcePath)) fs.unlinkSync(liveSourcePath);
  if (fs.existsSync(brandLogoPath)) fs.unlinkSync(brandLogoPath);
  if (fs.existsSync(generatedHqPreviewPath)) fs.unlinkSync(generatedHqPreviewPath);
  if (fs.existsSync(motionSourcePath)) fs.unlinkSync(motionSourcePath);
  if (fs.existsSync(speakerTopSourcePath)) fs.unlinkSync(speakerTopSourcePath);
  if (fs.existsSync(speakerBottomSourcePath)) fs.unlinkSync(speakerBottomSourcePath);
  if (fs.existsSync(speakerThirdSourcePath)) fs.unlinkSync(speakerThirdSourcePath);
  if (fs.existsSync(speakerFourthSourcePath)) fs.unlinkSync(speakerFourthSourcePath);
  if (fs.existsSync(contextBRollSourcePath)) fs.unlinkSync(contextBRollSourcePath);
});

test("records playable voice-over, edits takes, restores audio after reload and sends it to export", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installAppRoutes(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" }));
    // Actual browser MediaRecorder, supplied a deterministic audio stream instead
    // of asking for or capturing the user's microphone during unattended QA.
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 880;
      oscillator.connect(destination); oscillator.start();
      window.__voiceTestStream = destination.stream;
      return destination.stream;
    };
  });
  const open = async () => {
    await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
    await openViralClipStudioEntry(page);
    await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
    await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
    await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
    await page.getByRole("button", { name: "After", exact: true }).click();
  };
  await open();
  const rail = page.locator(".creative-tool-rail");
  await rail.getByRole("button", { name: "Sound", exact: true }).click();
  await page.getByLabel("Edited output position").fill("1");
  await page.getByRole("button", { name: "Record at playhead", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByLabel("Voice-over takes", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__voiceTestStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
  await page.getByLabel("Source in for Voice-over 1", { exact: true }).fill("0.5");
  await page.getByLabel("Length for Voice-over 1", { exact: true }).fill("2.5");
  await page.getByLabel("Volume for Voice-over 1", { exact: true }).fill("0.5");
  await page.getByLabel("Preview master volume", { exact: true }).fill("40");
  await page.getByLabel("Automation source").selectOption("voiceover");
  await page.getByRole("button", { name: /Add volume keyframe at/ }).click();
  await page.getByLabel(/voiceover volume at .* seconds/).fill("25");
  const audio = page.getByTestId(/^voiceover-audio-/);
  await expect.poll(() => audio.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
  const previewTake = async () => {
    await page.getByLabel("Edited output position").fill("1.5");
    await page.getByTestId("studio-after-video").evaluate(video => video.play());
    await expect(audio).toHaveJSProperty("paused", false);
    await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(1);
  };
  await previewTake();
  await expect.poll(() => audio.evaluate(element => element.volume)).toBeCloseTo(.05, 2);
  const voiceTrack = page.locator(".pro-track-row").filter({ hasText: "Voice-over" });
  await voiceTrack.getByRole("button", { name: "Mute track", exact: true }).click();
  await page.getByLabel("Edited output position").fill("1.5");
  await page.getByTestId("studio-after-video").evaluate(video => video.play());
  await expect(audio).toHaveJSProperty("paused", true);
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await voiceTrack.getByRole("button", { name: "Unmute track", exact: true }).click();
  await voiceTrack.getByRole("button", { name: "Solo track", exact: true }).click();
  await previewTake();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("muted", true);
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await voiceTrack.getByRole("button", { name: "Unsolo track", exact: true }).click();
  await rail.getByRole("button", { name: "Color", exact: true }).click();
  await expect(audio).toBeAttached();
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await expect(audio).toHaveJSProperty("paused", true);
  await rail.getByRole("button", { name: "Sound", exact: true }).click();
  await page.getByRole("button", { name: "Mute take", exact: true }).click();
  await page.getByLabel("Edited output position").fill("1.5");
  await page.getByTestId("studio-after-video").evaluate(video => video.play());
  await expect(audio).toHaveJSProperty("paused", true);
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await page.getByRole("button", { name: "Unmute take", exact: true }).click();
  await page.getByRole("button", { name: "Show media", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Voice-over QA checkpoint");
  await page.getByTestId("studio-save-project").click();
  await expect(page.locator(".studio-project-save-state")).toContainText("Saved locally");
  const originalUrl = await audio.getAttribute("src");
  await page.reload({ waitUntil: "networkidle" });
  await open();
  await page.getByRole("button", { name: "Show media", exact: true }).click();
  await page.locator(".studio-saved-projects summary").click();
  await page.locator(".studio-saved-projects").getByRole("button", { name: /Voice-over QA checkpoint/ }).first().click();
  await expect(audio).not.toHaveAttribute("src", originalUrl);
  await rail.getByRole("button", { name: "Sound", exact: true }).click();
  await page.getByRole("button", { name: "Hide media", exact: true }).click();
  await previewTake();
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await page.getByLabel("Voice-over takes", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("voiceover-restored.png") });
  await page.getByRole("button", { name: "Remove take", exact: true }).click();
  await expect(audio).toHaveCount(0);
  await page.getByTestId("studio-undo-button").click();
  await expect(audio).toHaveCount(1);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".audio-repair-preset-grid button")]
      .find(element => element.textContent.trim() === "noisy room");
    if (!button) throw new Error("Noisy Room restoration preset is missing");
    button.click();
  });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".audio-restoration-lab label")]
      .find(label => label.textContent.includes("Voice isolation"))?.querySelector("input")?.checked
  )).toBe(true);
  await rail.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Render Final Clip/i }).click();
  await expect.poll(() => state.renderPayload).not.toBeNull();
  const cue = state.renderPayload.options.viralData.sound_effects.find(effect => effect.kind === "voiceover");
  expect(cue).toMatchObject({ startTime: 1, trimStart: .5, duration: 2.5, volume: .5 });
  expect(cue.url).toMatch(/^https?:/);
  expect(state.renderPayload.options.viralData.audio_automation.voiceover).toEqual([
    expect.objectContaining({ property: "volume", time: 1, value: 25 }),
  ]);
  expect(state.renderPayload.options.viralData.audio_track_states.voiceover).toMatchObject({
    muted: false, solo: false,
  });
  expect(state.renderPayload.options.viralData.audio_restoration).toMatchObject({
    enabled: true, preset: "noisy_room", voiceIsolation: true, denoise: 70,
    eq: { low: -2, mid: 3, high: 0 },
  });
  expect(errors).toEqual([]);
});

test("proves new motion studio editing, linked audio, timeline seeking and local persistence", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installAppRoutes(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" }));
  });
  const open = async () => {
    await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
    await openViralClipStudioEntry(page);
    await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
    await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
    await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
    await page.getByRole("button", { name: "After", exact: true }).click();
  };
  await open();
  await page.getByRole("button", { name: "Fit full", exact: true }).click();
  const toolRail = page.locator(".creative-tool-rail");
  await toolRail.getByRole("button", { name: "Reframe", exact: true }).click();
  await page.getByTestId("auto-reframe-toggle").check();
  for (const [width, height] of [[1440, 900], [1100, 900], [1000, 800]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.locator(".studio-header-actions .close-btn").evaluate(button => {
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
    for (const aspect of ["9-16", "4-5", "1-1", "16-9"]) {
      await page.getByTestId(`reframe-aspect-${aspect}`).click();
      const [w, h] = aspect.split("-").map(Number);
      await expect.poll(() => page.getByTestId("hook-preview-frame").evaluate(frame => {
        const r = frame.getBoundingClientRect();
        return r.width / r.height;
      })).toBeCloseTo(w / h, 2);
      const geometry = await page.getByTestId("hook-preview-frame").evaluate(frame => {
        const picture = frame.getBoundingClientRect();
        const shell = frame.parentElement.getBoundingClientRect();
        const controls = frame.parentElement.querySelector(".preview-custom-controls").getBoundingClientRect();
        const timeline = document.querySelector(".studio-pro-timeline-dock").getBoundingClientRect();
        return { fits: picture.left >= shell.left - 1 && picture.right <= shell.right + 1 &&
          picture.top >= shell.top - 1 && picture.bottom <= controls.top + 1 && controls.bottom <= timeline.top + 1,
          width: picture.width, availableWidth: shell.width, availableHeight: shell.height - controls.height - 8 };
      });
      expect(geometry.fits).toBe(true);
      expect(geometry.width).toBeGreaterThan(Math.min(geometry.availableWidth, geometry.availableHeight * w / h) * .95);
      await page.screenshot({ path: testInfo.outputPath(`frame-${width}-${aspect}.png`) });
      if (aspect === "9-16") {
        await page.getByRole("button", { name: "Fill canvas", exact: true }).click();
        await expect(page.getByTestId("studio-after-video")).toHaveCSS("object-fit", "cover");
        await page.screenshot({ path: testInfo.outputPath(`frame-${width}-portrait-fill.png`) });
        await page.getByRole("button", { name: "Fit full", exact: true }).click();
        await expect(page.getByTestId("studio-after-video")).toHaveCSS("object-fit", "contain");
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("preview-quick-both-cams").click();
  await expect(page.getByTestId("reframe-aspect-9-16")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Fit full", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fill canvas", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("edit-panel-crops")).toHaveText("Adjust split crops");
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();
  await page.getByLabel("top split horizontal").fill("34");
  await page.getByLabel("top split vertical").fill("47");
  await page.getByLabel("top split zoom").fill("1.1");
  await page.getByLabel("bottom split horizontal").fill("89");
  await page.getByLabel("bottom split vertical").fill("17");
  await page.getByLabel("bottom split zoom").fill("5");
  for (const aspect of ["9-16", "4-5", "1-1"]) {
    await page.getByTestId(`reframe-aspect-${aspect}`).click();
    const [w, h] = aspect.split("-").map(Number);
    await expect.poll(() => page.getByTestId("hook-preview-frame").evaluate(frame => {
      const r = frame.getBoundingClientRect(); return r.width / r.height;
    })).toBeCloseTo(w / h, 2);
    await page.getByTestId("studio-after-video").evaluate(video => video.play());
    await page.waitForTimeout(500);
    await page.getByTestId("studio-after-video").evaluate(video => video.pause());
    await page.screenshot({ path: testInfo.outputPath(`show-everyone-${aspect}.png`) });
  }
  // The Show Everyone preset intentionally resets prior tracking points and
  // disables tracking. Enable tracking after choosing the preset so the new
  // points belong to the visible two-panel layout.
  await page.getByLabel("Edited output position").fill("1");
  await page.getByTestId("preview-quick-both-cams").click();
  await page.getByLabel("top split horizontal").fill("34");
  await page.getByLabel("bottom split horizontal").fill("89");
  await page.getByLabel("Track both speakers").check();
  await expect(page.getByTestId("reframe-preserve-frame")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Add top speaker tracking point", exact: true }).click();
  await page.getByRole("button", { name: "Add bottom speaker tracking point", exact: true }).click();
  await page.getByLabel("Edited output position").fill("4");
  await page.getByLabel("top split horizontal").fill("38");
  await page.getByLabel("bottom split horizontal").fill("90");
  await expect(page.getByLabel("top split horizontal")).toHaveValue("38");
  await page.getByLabel("Edited output position").fill("2.5");
  await expect(page.getByLabel("top split horizontal")).toHaveValue("36");
  await page.getByTestId("reframe-aspect-9-16").click();
  await page.screenshot({ path: testInfo.outputPath("show-everyone-with-tracking.png") });
  await page.getByTestId("analyze-speaker-faces").click();
  await expect(page.getByRole("status").filter({ hasText: "A face was missing" })).toBeVisible();
  await expect(page.getByLabel("top split horizontal")).toHaveValue("36");
  state.faceTrackingResult.tracks.bottom.coverage = .9;
  await page.getByTestId("analyze-speaker-faces").click();
  await expect(page.getByRole("status").filter({ hasText: "Face-follow draft applied" })).toBeVisible();
  await expect(page.getByLabel("Track both speakers")).toBeChecked();
  await expect(page.getByTestId("reframe-preserve-frame")).toHaveAttribute("aria-pressed", "true");
  expect(state.faceTrackingRequests).toBe(2);
  await page.screenshot({ path: testInfo.outputPath("detected-follow-draft-api-contract.png") });
  await page.getByTestId("preview-quick-track-speaker").click();
  await expect(page.getByTestId("reframe-follow-subject")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Left Speaker", exact: false }).click();
  await page.getByLabel("Manual frame horizontal position").fill("29");
  await page.getByLabel("Speaker zoom").fill("1.3");
  await expect(page.getByTestId("studio-after-video")).toHaveCSS("object-fit", "cover");
  await page.screenshot({ path: testInfo.outputPath("track-speaker-portrait-zoom.png") });
  await page.getByLabel("Speaker zoom").fill("1");
  await page.getByRole("button", { name: "Show timeline", exact: true }).click();
  await page.getByTestId("reframe-aspect-16-9").click();
  await toolRail.getByRole("button", { name: /Motion/ }).click();
  const ruler = page.locator(".pro-time-ruler");
  const bounds = await ruler.boundingBox();
  await ruler.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect.poll(async () => Number(await page.getByLabel("Edited output position").inputValue())).toBeCloseTo(6, 0);
  await page.getByLabel("Edited output position").fill("1");
  const motionPresets = [
    "AutoPromote launch ident",
    "Impact title",
    "Word cascade",
    "Number reveal",
    "Versus card",
    "Speaker intro",
    "Focus callout",
    "Viral hook badge",
    "Retention timer",
    "Social quote card",
    "Subscribe CTA",
    "Moving brand",
  ];
  for (const [index, preset] of motionPresets.entries()) {
    await page.getByRole("button", { name: `Add ${preset}`, exact: true }).click();
    await page.getByLabel("Motion headline", { exact: true }).fill(preset === "Moving brand" ? "@AUTOPROMOTE" : preset.toUpperCase());
    await page.getByLabel("Motion duration", { exact: true }).fill("2");
    await page.getByLabel("Edited output position").fill("1.7");
    await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("currentTime", 1.7);
    await expect(page.getByTestId("motion-preview").locator("[data-motion-id]")).toHaveCount(1);
    await expect(page.getByTestId("pro-motion-clip-1")).toContainText(preset === "Moving brand" ? "@AUTOPROMOTE" : preset.toUpperCase());
    await page.screenshot({ path: testInfo.outputPath(`motion-${index + 1}.png`) });
    if (index < motionPresets.length - 1) {
      await page.getByRole("button", { name: "Remove scene", exact: true }).click();
      await page.getByLabel("Edited output position").fill("1");
    }
  }
  await page.getByLabel("Motion sound", { exact: true }).selectOption("impact");
  await page.getByLabel("Motion start", { exact: true }).fill("5");
  await page.getByLabel("Edited output position").fill("2");
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("currentTime", 2);
  await expect(page.getByLabel("Edited output position")).toHaveValue("2");
  await page.getByTestId("pro-quick-trim-start").click();
  await expect(page.getByLabel("Motion start", { exact: true })).toHaveValue("3");
  await expect(page.getByTestId("pro-sfx-clip-1")).toBeAttached();
  await page.getByTestId("pro-quick-undo").click();
  await expect(page.getByLabel("Motion start", { exact: true })).toHaveValue("5");
  await page.getByTestId("pro-quick-redo").click();
  await expect(page.getByLabel("Motion start", { exact: true })).toHaveValue("3");
  await page.getByLabel("Edited output position").fill("3.7");
  await page.getByLabel("Preview master volume").fill("45");
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("muted", false);
  await page.getByRole("button", { name: "Show media", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Motion QA checkpoint");
  await page.getByTestId("studio-save-project").click();
  await expect(page.locator(".studio-project-save-state")).toContainText("Saved locally");
  const saved = await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("autopromote-viral-studio");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const query = db.transaction("projects").objectStore("projects").getAll();
      query.onsuccess = () => { db.close(); resolve(query.result.find(p => p.name === "Motion QA checkpoint")); };
      query.onerror = () => { db.close(); reject(query.error); };
    };
  }));
  expect(saved.snapshot.motionScenes).toHaveLength(1);
  expect(saved.snapshot.motionScenes[0]).toMatchObject({ text: "@AUTOPROMOTE", startTime: 3, sound: "impact" });
  await page.reload({ waitUntil: "networkidle" });
  await open();
  await page.getByRole("button", { name: "Show media", exact: true }).click();
  await page.locator(".studio-saved-projects summary").click();
  await page.locator(".studio-saved-projects").getByRole("button", { name: /Motion QA checkpoint/ }).first().click();
  await toolRail.getByRole("button", { name: /Motion/ }).click();
  await expect(page.getByLabel("Motion headline", { exact: true })).toHaveValue("@AUTOPROMOTE");
  await expect(page.getByLabel("Motion start", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "Hide media", exact: true }).click();
  await page.getByLabel("Edited output position").fill("3.7");
  await page.getByRole("button", { name: "Play motion + sound", exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel("Edited output position").inputValue())).toBeGreaterThan(3.4);
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await page.screenshot({ path: testInfo.outputPath("restored-motion-project.png") });
  await toolRail.getByRole("button", { name: "Captions", exact: true }).click();
  await page.getByTestId("generate-live-transcript").click();
  await expect(page.getByRole("textbox", { name: "Caption 1 text", exact: true })).toHaveValue(/Greetings/);
  await page.getByRole("textbox", { name: "Caption 1 text", exact: true }).fill("Unmuted — spelling corrected.");
  await page.getByLabel("Edited output position").fill("0.5");
  await expect(page.getByTestId("live-caption-preview")).toContainText("spelling corrected");
  await page.getByTestId("studio-undo-button").click();
  await expect(page.getByRole("textbox", { name: "Caption 1 text", exact: true })).toHaveValue(/space for honest/);
  await page.getByTestId("studio-redo-button").click();
  await expect(page.getByTestId("live-caption-preview")).toContainText("spelling corrected");
  await page.screenshot({ path: testInfo.outputPath("corrected-caption-preview.png") });
  expect(state.renderPayload).toBeNull();
  expect(errors).toEqual([]);
});

test("keeps every creative caption style and free placement inside the real programme frame", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();
  await expect(page.locator(".viral-studio-overlay")).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();

  const inspector = page.getByTestId("clip-studio-inspector");
  await page.locator(".creative-tool-rail").getByRole("button", {
    name: "Captions",
    exact: true,
  }).click();
  await inspector.getByRole("checkbox", { name: "Preview captions" }).check();
  await page.getByTestId("generate-live-transcript").click();
  await expect(inspector.getByRole("textbox", { name: "Caption 1 text" })).toHaveValue(
    /Greetings! This is Unmuted/i
  );

  for (const style of [
    "Story Pop", "Bold Pop", "Karaoke", "Neon Glow", "Bounce", "Minimal",
    "Big Headline", "Subtitle Card", "Comic Punch", "Gradient Pop", "Typewriter",
    "Editorial Serif", "Sticker Stack", "Marker Swipe", "Glass Caption", "News Flash",
    "Luxury Quote", "Retro Tape",
  ]) {
    await inspector.getByRole("button", { name: style, exact: true }).click();
  }
  for (const position of [
    "Top left", "Top centre", "Top right", "Middle left", "Dead centre",
    "Middle right", "Bottom left", "Bottom centre", "Bottom right",
  ]) {
    await inspector.getByRole("button", { name: position, exact: true }).click();
  }

  await inspector.getByRole("button", { name: "Gradient Pop", exact: true }).click();
  await inspector.getByRole("combobox", { name: "Caption 1 placement" }).selectOption("custom");
  await inspector.getByRole("slider", { name: "Caption 1 horizontal position" }).fill("93");
  await inspector.getByRole("slider", { name: "Caption 1 vertical position" }).fill("88");
  await inspector.getByLabel("Caption 1 accent").fill("#ff5d8f");
  await inspector
    .getByRole("group", { name: "Caption 1 emoji reaction" })
    .getByRole("button", { name: "Payoff", exact: true })
    .click();

  const caption = page.getByTestId("live-caption-preview");
  await expect(caption).toHaveClass(/caption-style-gradient/);
  await expect(caption).toHaveClass(/caption-placement-custom/);
  await expect(caption).toContainText("⚡");
  await expect.poll(async () => {
    const [captionBox, frameBox] = await Promise.all([
      caption.boundingBox(),
      page.getByTestId("hook-preview-frame").boundingBox(),
    ]);
    return Boolean(
      captionBox && frameBox &&
      captionBox.x >= frameBox.x - 1 && captionBox.y >= frameBox.y - 1 &&
      captionBox.x + captionBox.width <= frameBox.x + frameBox.width + 1 &&
      captionBox.y + captionBox.height <= frameBox.y + frameBox.height + 1
    );
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("creative-caption-placement.png") });
  expect(errors).toEqual([]);
});

test("records the focused Motion workflow and verifies its export payload", async ({ page }, testInfo) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installAppRoutes(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Motion QA" })
    );
  });
  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.getByRole("button", { name: "After", exact: true }).click();
  await page.getByRole("button", { name: "Fit full", exact: true }).click();
  const rail = page.getByRole("navigation", { name: "Creative tools" });
  await rail.getByRole("button", { name: /Motion/ }).click();
  const presets = [
    "AutoPromote launch ident", "Impact title", "Word cascade", "Number reveal", "Versus card", "Speaker intro",
    "Focus callout", "Viral hook badge", "Retention timer", "Social quote card",
    "Subscribe CTA", "Moving brand",
  ];
  for (const preset of presets) {
    await page.getByRole("button", { name: `Add ${preset}`, exact: true }).click();
    await page.getByLabel("Motion headline", { exact: true }).fill(preset.toUpperCase());
    if (preset === "Number reveal") {
      await page.getByLabel("Target number", { exact: true }).fill("50000");
      await page.getByLabel("Number prefix", { exact: true }).fill("R");
    }
    await page.getByLabel("Edited output position").fill("1.7");
    await expect(page.getByTestId("motion-preview").locator("[data-motion-id]")).toHaveCount(1);
    await page.getByRole("button", { name: "Play motion + sound", exact: true }).click();
    await page.waitForTimeout(240);
    await page.getByTestId("studio-after-video").evaluate(video => video.pause());
    if (preset !== "Moving brand") {
      await page.getByRole("button", { name: "Remove scene", exact: true }).click();
      await page.getByLabel("Edited output position").fill("1");
    }
  }
  const set = async (label, value) => page.getByLabel(label, { exact: true }).fill(value);
  await set("Motion supporting text", "SAFE BRAND GLIDE");
  await set("Motion start", "5");
  await set("Motion duration", "3");
  await set("Motion opacity", "0.7");
  await set("Start X", "22");
  await set("Start Y", "78");
  await set("End X", "74");
  await set("End Y", "72");
  await set("Start scale", "0.65");
  await set("End scale", "0.9");
  await set("Start rotation", "-8");
  await set("End rotation", "8");
  for (const easing of ["smooth", "punch", "spring", "linear"]) {
    await page.getByLabel("Motion easing", { exact: true }).selectOption(easing);
  }
  for (const sound of ["sweep", "impact", "pop", "click", "riser", "chime", "reverse", "glitch", "subdrop"]) {
    await page.getByLabel("Motion sound", { exact: true }).selectOption(sound);
  }
  await set("Cue delay", "0.25");
  await set("Cue volume", "0.4");
  await page.getByRole("button", { name: "Duplicate scene", exact: true }).click();
  await expect(page.getByTestId("pro-motion-clip-2")).toBeAttached();
  await page.getByRole("button", { name: "Remove scene", exact: true }).click();
  await page.getByLabel("Edited output position").fill("2");
  await page.getByTestId("pro-quick-trim-start").click();
  await page.getByTestId("pro-quick-undo").click();
  await page.getByTestId("pro-quick-redo").click();
  await page.getByLabel("Edited output position").fill("3.7");
  await expect(page.getByText("Loading edited preview…", { exact: true })).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await expect(page.getByTestId("motion-preview").locator("[data-motion-id]")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("motion-final-timeline.png") });
  await rail.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Render Final Clip/i }).click();
  await expect.poll(() => state.renderPayload).not.toBeNull();
  const data = state.renderPayload.options.viralData;
  expect(data.motionGraphics.scenes).toHaveLength(1);
  expect(data.motionGraphics.scenes[0]).toMatchObject({
    preset: "watermark", text: "MOVING BRAND", secondary: "SAFE BRAND GLIDE",
    sound: "subdrop", soundOffset: 0.25, soundVolume: 0.4,
  });
  expect(data.sound_effects).toEqual([
    expect.objectContaining({ tone: "subdrop", volume: 0.4 }),
  ]);
  expect(errors).toEqual([]);
});

test("records imported logo layer design and verifies preview-to-export keyframe parity", async ({ page }, testInfo) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installAppRoutes(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Logo Motion QA" }));
  });
  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);

  const rail = page.getByRole("navigation", { name: "Creative tools" });
  await rail.getByRole("button", { name: /Motion/ }).click();
  await page.getByRole("button", { name: "Logo & layers", exact: true }).click();
  await page.getByTestId("motion-logo-input").setInputFiles({
    name: "viral_v2_194x56_VIRAL_CLIP_STUDIO.png",
    mimeType: "image/png",
    buffer: fs.readFileSync(brandLogoPath),
  });
  await expect(page.getByRole("group", { name: /viral_v2_194x56_VIRAL_CLIP_STUDIO.png controls/i })).toBeVisible();
  await expect(page.getByText("6 poses", { exact: true })).toBeVisible();
  await page.getByLabel("Edited output position").fill("0.4");
  const previewLayer = page.locator(".draggable-overlay.is-media-overlay").last();
  await expect(previewLayer).toBeVisible();
  await expect.poll(() => previewLayer.evaluate(node => node.style.getPropertyValue("--title-rotation"))).not.toBe("0deg");
  await expect.poll(() => previewLayer.evaluate(node => node.style.getPropertyValue("--title-scale"))).not.toBe("1");
  await expect.poll(() => previewLayer.evaluate(node => getComputedStyle(node).transform)).not.toBe("none");

  await page.getByLabel("X", { exact: true }).fill("58");
  await page.getByLabel("Rotate", { exact: true }).fill("6");
  await page.getByRole("button", { name: /Add transform keyframe at 0.40s/i }).click();
  await page.getByLabel("Enable layer glow").check();
  await page.getByLabel("Enable layer motion blur").check();
  await page.screenshot({ path: testInfo.outputPath("logo-layer-motion-inspector.png") });

  await page.getByRole("button", { name: /Duplicate viral_v2_194x56_VIRAL_CLIP_STUDIO.png/i }).click();
  await expect(page.locator(".motion-layer-stack > div")).toHaveCount(2);
  await page.getByRole("button", { name: /Delete viral_v2_194x56_VIRAL_CLIP_STUDIO.png copy/i }).click();
  await expect(page.locator(".motion-layer-stack > div")).toHaveCount(1);

  await rail.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Render Final Clip/i }).click();
  await expect.poll(() => state.renderPayload).not.toBeNull();
  const data = state.renderPayload.options.viralData;
  const logo = data.overlays.find(overlay => overlay.motionDesign);
  const layer = data.composition_plan.layers.find(candidate => String(candidate.id) === String(logo.id));
  expect(logo).toMatchObject({ type: "image", scale: 1, anchorX: 50, anchorY: 50, motionDesign: true });
  expect(layer.motion_keyframes.length).toBeGreaterThanOrEqual(14);
  expect(layer.effects).toMatchObject({
    glow: expect.objectContaining({ enabled: true }),
    shadow: expect.objectContaining({ enabled: true }),
    motion_blur: expect.objectContaining({ enabled: true, samples: 4 }),
  });
  expect(layer.motion_keyframes).toEqual(expect.arrayContaining([
    expect.objectContaining({ property: "x", time: 0.4, value: 58 }),
    expect.objectContaining({ property: "rotation", time: 0.4, value: 6 }),
  ]));
  expect(errors).toEqual([]);
});

test("designs an AutoPromote 3D logo and verifies HQ preview transport and export payload", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installAppRoutes(page);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({
      uid: "testUser",
      email: "test@local",
      name: "3D Logo Motion QA",
    }));
  });

  const repositoryRoot = path.resolve(__dirname, "../../..");
  const recordedLogoProofPath = path.resolve(
    repositoryRoot,
    "artifacts",
    "viral-studio-3d",
    "logo-proof",
    "preview.mp4"
  );
  // The recorded Blender proof exists on the QA laptop but is intentionally
  // not checked into Git. CI uses a playable local stub for transport checks.
  const useRecordedLogoProof = process.env.CI !== "true" && fs.existsSync(recordedLogoProofPath);
  if (!useRecordedLogoProof) {
    execFileSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "color=c=0x110d29:s=360x640:r=18:d=4",
      "-vf", "drawbox=x=65:y=225:w=230:h=190:color=0x7658f5:t=8",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-y", generatedHqPreviewPath,
    ]);
  }
  const logoProofPath = useRecordedLogoProof ? recordedLogoProofPath : generatedHqPreviewPath;
  const proofDir = useRecordedLogoProof
    ? path.resolve(repositoryRoot, "proof", "viral-clip-studio")
    : testInfo.outputDir;
  const logoProofBody = fs.readFileSync(logoProofPath);
  await page.route("**/studio-3d-logo-proof.mp4*", route => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range
      ? Math.min(
          logoProofBody.length - 1,
          start + 1024 * 1024 - 1,
          range[2] ? Number(range[2]) : logoProofBody.length - 1
        )
      : logoProofBody.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "video/mp4",
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${logoProofBody.length}` } : {}),
      },
      body: logoProofBody.subarray(start, end + 1),
    });
  });
  await page.route("**/api/media/studio-3d/preview", route =>
    route.fulfill(json({ jobId: "studio-3d-logo-proof" }))
  );
  await page.route("**/api/media/studio-3d/preview/studio-3d-logo-proof", route =>
    route.fulfill(json({
      status: "completed",
      url: `${getBase()}/studio-3d-logo-proof.mp4`,
    }))
  );

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);

  const rail = page.getByRole("navigation", { name: "Creative tools" });
  await rail.getByRole("button", { name: "Reframe", exact: true }).click();
  await page.getByTestId("reframe-aspect-9-16").click();
  await rail.getByRole("button", { name: /Motion/ }).click();
  await page.getByRole("button", { name: "3D Motion", exact: true }).click();
  await page.getByRole("button", { name: /Neon Logo Reveal/ }).click();
  await page.getByLabel("Main text", { exact: true }).fill("AutoPromote");
  await page.getByLabel("Supporting line", { exact: true }).fill("CREATE WHAT MOVES PEOPLE");
  await page.getByLabel(/Motion intensity/).fill("0.78");
  await page.getByLabel("Edited output position").fill("2.15");

  const canvas = page.getByTestId("studio-3d-preview");
  await expect(canvas).toBeVisible();
  await expect(page.locator(".studio-3d-scene-list").getByText("AutoPromote", { exact: true })).toBeVisible();
  fs.mkdirSync(proofDir, { recursive: true });
  await page.screenshot({
    path: path.resolve(proofDir, "autopromote-3d-logo-live-editor.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  const threeDPanel = page.getByTestId("studio-3d-panel");
  const selectField = label => threeDPanel.locator("label", { hasText: label }).locator("select").first();
  const numberField = label => threeDPanel.locator("label", { hasText: label }).locator('input[type="number"]').first();
  await selectField("Material").selectOption("neon");
  await selectField("Hold").selectOption("orbit");
  await selectField("Exit").selectOption("spin");
  await numberField("Bloom").fill("0.72");
  await numberField("Camera motion").fill("0.34");

  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".studio-3d-scene-list > button")).toHaveCount(2);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".studio-3d-scene-list > button")).toHaveCount(1);
  const visibleUndo = page.locator("button:visible", { hasText: "Undo" }).first();
  const visibleRedo = page.locator("button:visible", { hasText: "Redo" }).first();
  await expect(visibleUndo).toBeEnabled();
  await visibleUndo.click();
  await expect(page.locator(".studio-3d-scene-list > button")).toHaveCount(2);
  await expect(visibleRedo).toBeEnabled();
  await visibleRedo.click();
  await expect(page.locator(".studio-3d-scene-list > button")).toHaveCount(1);

  await page.getByRole("button", { name: "Generate HQ 3D Preview", exact: true }).click();
  const hqVideo = page.getByLabel("HQ 3D preview");
  await expect(hqVideo).toBeVisible();
  await expect(hqVideo).toHaveJSProperty("readyState", 4);
  const standaloneDownload = page.getByRole("link", { name: "Download standalone motion" });
  await expect(standaloneDownload).toBeVisible();
  await expect(standaloneDownload).toHaveAttribute("href", `${getBase()}/studio-3d-logo-proof.mp4`);
  await hqVideo.evaluate(video => { video.currentTime = 2.4; });
  await page.waitForTimeout(250);
  await hqVideo.screenshot({
    path: path.resolve(proofDir, "autopromote-3d-logo-hq-render-frame.png"),
  });
  await hqVideo.evaluate(video => video.play());
  await page.waitForTimeout(2400);
  await page.screenshot({
    path: path.resolve(proofDir, "autopromote-3d-logo-hq-preview.png"),
    fullPage: false,
  });
  await standaloneDownload.scrollIntoViewIfNeeded();
  await threeDPanel.screenshot({
    path: path.resolve(proofDir, "autopromote-3d-logo-standalone-download.png"),
  });

  await rail.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Render Final Clip/i }).click();
  await expect.poll(() => state.renderPayload).not.toBeNull();
  const data = state.renderPayload.options.viralData;
  expect(data.threeDGraphics).toHaveLength(1);
  expect(data.threeDGraphics[0]).toMatchObject({
    jobId: "studio-3d-logo-proof",
    aspect: "9:16",
    scene: expect.objectContaining({
      template: "neon_logo",
      text: "AutoPromote",
      secondary: "CREATE WHAT MOVES PEOPLE",
      material: "neon",
      hold: "orbit",
      exit: "spin",
      bloom: .72,
      cameraMotion: .34,
    }),
  });
  expect(pageErrors).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(/optimized for laptop and desktop editing/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Launch Clip Studio/i })).toBeDisabled();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.resolve(proofDir, "autopromote-3d-logo-mobile-guard.png"),
    fullPage: false,
  });

  const recording = page.video();
  const proofPath = path.resolve(proofDir, "autopromote-3d-logo-frontend-workflow.webm");
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  await page.close();
  await recording.saveAs(proofPath);
  await testInfo.attach("autopromote-3d-logo-frontend-workflow", {
    path: proofPath,
    contentType: "video/webm",
  });
});

test("runs the production Viral Clip Studio feature workflow with real playable media", async ({
  page,
}) => {
  // This is the intentionally exhaustive cross-feature journey, including
  // multiple real-video screenshots. Keep its budget separate from focused specs.
  test.setTimeout(420000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const appState = await installAppRoutes(page);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  const identityImage = page.locator(".overview-identity-card img");
  await expect(identityImage).toBeVisible();
  const identityBounds = await identityImage.boundingBox();
  expect(identityBounds.width).toBeLessThanOrEqual(60);
  expect(identityBounds.height).toBeLessThanOrEqual(60);
  await expect(page.locator(".overview-feature-grid")).toHaveCSS("display", "grid");
  await page.screenshot({ path: "test-results/overview-restored.png", fullPage: false });
  await openViralClipStudioEntry(page);
  await expect(page.getByRole("heading", { name: "Viral Clip Studio" })).toBeVisible();

  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();

  await expect(page.locator(".viral-studio-overlay")).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await expect(page.getByTestId("preview-audio-status")).toContainText("Source audio on");
  await page.getByRole("button", { name: "After", exact: true }).click();
  const programmeAudio = page.getByTestId("studio-after-video");
  await expect(programmeAudio).toHaveJSProperty("muted", false);
  await page.getByTestId("preview-audio-toggle").click();
  await expect(page.getByTestId("preview-audio-status")).toContainText("Monitoring muted");
  await expect(programmeAudio).toHaveJSProperty("muted", true);
  await page.getByLabel("Preview master volume").fill("37");
  await expect(page.getByTestId("preview-audio-status")).toContainText("Source audio on");
  await expect(programmeAudio).toHaveJSProperty("muted", false);
  await expect.poll(() => programmeAudio.evaluate(video => video.volume)).toBeCloseTo(0.37, 2);
  const originalViewport = page.viewportSize();
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator(".preview-custom-controls").evaluate(controls => {
      const bounds = controls.getBoundingClientRect();
      const picture = document.querySelector('[data-testid="hook-preview-frame"]').getBoundingClientRect();
      return picture.bottom <= bounds.top + 1 && Array.from(controls.querySelectorAll("button, input, span")).every(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right + 1;
      });
    })).toBe(true);
  }
  await page.setViewportSize(originalViewport);
  await expect(page.getByTestId("studio-pro-timeline")).toBeVisible();
  await expect(page.getByTestId("pro-video-clip-1")).toBeVisible();
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();
  await expect(page.getByTestId("studio-pro-timeline")).toBeHidden();
  await page.getByRole("button", { name: "Show timeline", exact: true }).click();
  await expect(page.getByTestId("studio-pro-timeline")).toBeVisible();

  const timelineTools = page.getByRole("toolbar", { name: "Timeline edit tools" });
  for (const tool of ["Razor", "Ripple", "Roll", "Slip", "Slide", "Hand", "Select"]) {
    await timelineTools.getByRole("button", { name: `${tool} tool`, exact: true }).click();
    await expect(
      timelineTools.getByRole("button", { name: `${tool} tool`, exact: true })
    ).toHaveClass(/is-active/);
  }
  for (const toggleName of ["Snap", "Linked", "Ripple"]) {
    const toggle = page.getByRole("button", { name: new RegExp(toggleName), exact: false }).last();
    await toggle.click();
    await toggle.click();
  }
  const firstTrackHeader = page.locator(".pro-track-header").first();
  for (const control of ["Hide track", "Lock track", "Mute track", "Solo track"]) {
    const button = firstTrackHeader.getByRole("button", { name: control, exact: true });
    await button.click();
    const restoreName =
      control === "Hide track"
        ? "Show track"
        : control === "Lock track"
          ? "Unlock track"
          : control === "Mute track"
            ? "Unmute track"
            : "Unsolo track";
    await firstTrackHeader.getByRole("button", { name: restoreName, exact: true }).click();
  }

  const workspace = page.getByTestId("viral-studio-workspace");
  await expect(workspace).toHaveAttribute("data-workspace-mode", "creator");
  await page.getByRole("tab", { name: "Quick Create" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "quick");
  await expect(
    page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", {
      name: "Cut",
    })
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Signature Lab" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "signature");
  await page.getByRole("tab", { name: "Creator Studio" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "creator");

  await page.getByRole("button", { name: "Fit full", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fit full", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "Fill canvas", exact: true }).click();
  await page.getByRole("button", { name: "Safe zones", exact: true }).click();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.getByRole("button", { name: "Safe zones", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByTestId("preview-fullscreen-button").click();
  await expect(page.getByTestId("hook-preview-frame")).toHaveClass(/preview-expanded/);
  await expect(page.getByRole("button", { name: "After", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect.poll(async () => {
    const box = await page.getByTestId("hook-preview-frame").boundingBox();
    return box ? box.height / 900 : 0;
  }).toBeGreaterThan(0.92);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page.getByRole("button", { name: "Safe zones", exact: true }).click();
  await page.getByRole("button", { name: "Grid", exact: true }).click();

  const toolRail = page.locator(".creative-tool-rail");
  const inspector = page.getByTestId("clip-studio-inspector");
  const resetProofViewport = async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll(".viral-studio-overlay, .viral-studio-container").forEach(element => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });
      document
        .querySelectorAll(
          ".studio-sidebar, .clip-inspector-panel, .clip-inspector-body, .studio-finish-rack"
        )
        .forEach(element => {
          element.scrollTop = 0;
          element.scrollLeft = 0;
        });
    });
    await page.evaluate(
      () =>
        new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        })
    );
    await page.waitForTimeout(180);
  };
  const setTimelineExpanded = async expanded => {
    const button = page.getByRole("button", {
      name: expanded ? "Show timeline" : "Hide timeline",
      exact: true,
    });
    if (await button.count()) await button.click();
  };
  const revealInspectorSection = async (locator, parentSelector) => {
    await locator.evaluate((element, selector) => {
      (element.closest(selector) || element).scrollIntoView({
        block: "start",
        inline: "nearest",
      });
    }, parentSelector);
    await page.waitForTimeout(80);
  };
  const seekAfterPreview = async time => {
    const pauseControl = page.getByRole("button", { name: "Pause comparison", exact: true });
    if (await pauseControl.count()) await pauseControl.click();
    // A seek beyond the current retained segment first activates the next
    // timeline segment. Repeat once after that state transition so the proof
    // lands on the requested source frame, not merely the next clip boundary.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByTestId("studio-after-video").evaluate(async (video, targetTime) => {
        video.pause();
        const ready = new Promise(resolve => {
          const timeout = window.setTimeout(resolve, 800);
          video.addEventListener(
            "seeked",
            () => {
              window.clearTimeout(timeout);
              resolve();
            },
            { once: true }
          );
        });
        video.currentTime = Math.min(Number(targetTime), Math.max(0, video.duration - 0.1));
        await ready;
      }, time);
      await page.waitForTimeout(80);
    }
  };
  const captureLiveProof = async proofPath => {
    await page.getByTestId("studio-after-video").evaluate(video => video.pause());
    await page.waitForTimeout(220);
    await page.screenshot({ path: proofPath, fullPage: false });
  };

  // Actual timeline zoom, no CSS-only duplicate; restore before the cut workflow.
  await toolRail.getByRole("button", { name: "Creator FX", exact: true }).click();
  await page.getByTestId("creator-section-motion").click();
  await page.getByLabel("Creator zoom amount").fill("1.24");
  await seekAfterPreview(0.5);
  await page.getByLabel("Edited output position").fill("0.5");
  await page.getByTestId("creator-demo-punch_zoom").click();
  await expect(page.getByTestId("studio-creator-preview-layer")).toHaveCount(0);
  await expect(page.locator(".studio-program-canvas")).not.toHaveClass(/creator-canvas-punch/);
  await page.getByRole("button", { name: /Open full X\/Y/i }).click();
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  await expect(inspector.getByText("3 poses", { exact: true })).toBeVisible();
  await page.getByLabel("Edited output position").fill("0.8");
  // A fitting issue is not zoom proof: use the full real frame for this check.
  await page.getByRole("button", { name: "Fit full", exact: true }).click();
  await captureLiveProof(path.join("test-results", "studio-motion-keyframes.png"));
  await inspector.getByRole("button", { name: "Reset transform", exact: true }).click();
  await expect(inspector.getByText("0 poses", { exact: true })).toBeVisible();
  await toolRail.getByRole("button", { name: "Creator FX", exact: true }).click();
  await page.getByTestId("creator-section-audio").click();
  await page.getByRole("button", { name: "Snap impact to beat", exact: true }).click();
  await expect(page.getByText(/No detected beats are available yet; no impact was added/)).toBeVisible();

  await toolRail.getByRole("button", { name: "Cut", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "Remove from time" }).fill("1");
  await inspector.getByRole("spinbutton", { name: "Remove to time" }).fill("2.5");
  await inspector.getByRole("button", { name: "Soft Dip" }).click();
  await inspector.getByTestId("remove-marked-range").click();
  await expect(page.getByTestId("pro-video-clip-2")).toBeVisible();
  await expect(page.getByTestId("timeline-output-time")).toContainText("0:10.5");
  await page.getByTestId("studio-undo-button").click();
  await expect(page.getByTestId("pro-video-clip-2")).toHaveCount(0);
  await page.getByTestId("studio-redo-button").click();
  await expect(page.getByTestId("pro-video-clip-2")).toBeVisible();

  await toolRail.getByRole("button", { name: "Moments", exact: true }).click();
  await expect(page.locator(".studio-header-status")).toContainText("HookOff");
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await expect
    .poll(async () => {
      const [afterTime, beforeTime] = await Promise.all([
        page.getByTestId("studio-after-video").evaluate(video => video.currentTime),
        page.getByLabel("Untouched source preview").evaluate(video => video.currentTime),
      ]);
      return Math.abs(afterTime - beforeTime);
    })
    .toBeLessThan(0.5);

  // Establish a real subject-safe composition before demonstrating finish/VFX.
  // Signature tools should be judged on a correctly framed shot, never a center-crop guess.
  await toolRail.getByRole("button", { name: "Reframe", exact: true }).click();
  await expect(inspector.getByTestId("auto-reframe-toggle")).toBeChecked();
  await inspector.getByTestId("reframe-aspect-4-5").click();
  await inspector.getByTestId("add-reframe-keyframe").click();
  await inspector.getByLabel("Manual frame horizontal position").fill("32");
  await inspector.getByLabel("Manual frame vertical position").fill("50");

  await page.getByRole("tab", { name: "Signature Lab" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "signature");
  await page.getByRole("button", { name: /Open Color & Finish/i }).click();
  const finishRack = page.getByTestId("studio-finish-rack");
  await finishRack.getByRole("button", { name: /Podcast Pro/i }).click();
  await finishRack.getByRole("button", { name: /Add grade keyframe/i }).click();
  await expect(
    finishRack.getByRole("button", { name: /Finish keyframe at .* seconds/i })
  ).toBeVisible();
  await finishRack.getByRole("tab", { name: "Luma", exact: true }).click();
  await expect(page.getByTestId("studio-video-scopes")).toBeVisible();
  await expect(page.getByTestId("studio-video-scopes").locator("span")).toContainText(
    /Luma histogram live|Waiting for frame/
  );
  await finishRack.getByRole("tab", { name: "RGB Parade", exact: true }).click();
  await seekAfterPreview(0.5);
  await resetProofViewport();
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-grade-tools.png"));
  await finishRack.getByRole("button", { name: "Off", exact: true }).click();
  await finishRack.getByRole("button", { name: /Pulse ring/i }).click();
  await expect(page.getByTestId("studio-audio-visualizer")).toBeVisible();
  await expect(page.getByTestId("studio-program-canvas")).toHaveAttribute(
    "data-programme-filter",
    /brightness/
  );
  await expect(page.getByTestId("studio-program-canvas")).toHaveCSS("border-radius", "8%");
  await expect(page.getByTestId("main-footage-frame-toggle")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await setTimelineExpanded(false);
  await resetProofViewport();
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-signature.png"));
  await setTimelineExpanded(true);
  await page.getByRole("tab", { name: "Creator Studio" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "creator");

  await toolRail.getByRole("button", { name: "Hook", exact: true }).click();
  const enableHook = inspector.getByRole("checkbox", { name: "Enable opening hook" });
  await expect(enableHook).not.toBeChecked();
  await inspector.getByRole("button", { name: "Zoom Focus", exact: true }).click();
  await expect(enableHook).toBeChecked();
  await enableHook.click();
  await expect(enableHook).not.toBeChecked();

  await toolRail.getByRole("button", { name: "Reframe", exact: true }).click();
  await expect(inspector.getByTestId("auto-reframe-inspector")).toBeVisible();
  await expect(inspector.getByTestId("auto-reframe-toggle")).toBeChecked();
  await inspector.getByTestId("auto-reframe-toggle").click();
  await expect(inspector.getByTestId("auto-reframe-toggle")).not.toBeChecked();
  await inspector.getByTestId("auto-reframe-toggle").click();
  await expect(inspector.getByTestId("auto-reframe-toggle")).toBeChecked();
  await inspector.getByTestId("reframe-preserve-frame").click();
  await expect(inspector.getByTestId("reframe-preserve-frame")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await inspector.getByTestId("reframe-aspect-16-9").click();
  await expect(page.getByTestId("reframe-preview-status")).toContainText(
    "Everyone in frame"
  );
  await seekAfterPreview(0.5);
  await setTimelineExpanded(false);
  await resetProofViewport();
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-show-everyone.png"));
  await setTimelineExpanded(true);
  if (hasLocalSpeakerPair) {
    const speakerSetup = inspector.getByTestId("speaker-source-setup");
    await speakerSetup.locator("summary").click();
    await inspector
      .getByTestId("clean-speaker-angle-input")
      .setInputFiles([speakerTopSourcePath, speakerBottomSourcePath]);
    await expect(inspector.getByLabel("Top speaker source")).toContainText(
      path.basename(speakerTopSourcePath)
    );
    await expect(inspector.getByLabel("Bottom speaker source")).toContainText(
      path.basename(speakerBottomSourcePath)
    );
    const topSourceId = await inspector.getByLabel("Top speaker source").inputValue();
    const bottomSourceId = await inspector.getByLabel("Bottom speaker source").inputValue();
    expect(topSourceId).not.toBe(bottomSourceId);
    // Audio silence landmarks in the two original camera files place the top
    // camera about 260 ms behind the bottom camera at the beginning.
    await inspector.getByLabel("Top angle start").fill("0.26");
    const sharedTimecode = inspector.getByRole("checkbox", {
      name: "Angles share the same source timecode",
    });
    await expect(sharedTimecode).toBeEnabled({ timeout: 120000 });
    await sharedTimecode.check();
    await expect(inspector.getByTestId("reframe-speaker-stack")).toBeEnabled({ timeout: 120000 });
    await inspector.getByTestId("reframe-speaker-stack").click();
    await inspector.getByTestId("reframe-aspect-9-16").click();
    await expect(page.getByTestId("reframe-preview-status")).toContainText(
      "⌗ 2 cameras · stacked"
    );
    const topSpeakerVideo = page.getByTestId("speaker-stack-top-video");
    const bottomSpeakerVideo = page.getByTestId("speaker-stack-bottom-video");
    await expect
      .poll(() => topSpeakerVideo.evaluate(video => video.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => bottomSpeakerVideo.evaluate(video => video.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    expect(await topSpeakerVideo.getAttribute("src")).not.toBe(
      await bottomSpeakerVideo.getAttribute("src")
    );
    await seekAfterPreview(0.5);
    const startTimes = await Promise.all([
      topSpeakerVideo.evaluate(video => video.currentTime),
      bottomSpeakerVideo.evaluate(video => video.currentTime),
    ]);
    await page.getByRole("button", { name: "Play comparison" }).click();
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: "Pause comparison" }).click();
    const endTimes = await Promise.all([
      topSpeakerVideo.evaluate(video => video.currentTime),
      bottomSpeakerVideo.evaluate(video => video.currentTime),
    ]);
    // The programme monitor continuously corrects secondary-angle drift, so a
    // short UI playback sample may be less than wall-clock time. Any clear
    // forward advance proves these are moving video sources rather than stills.
    expect(endTimes[0]).toBeGreaterThan(startTimes[0] + 0.05);
    expect(endTimes[1]).toBeGreaterThan(startTimes[1] + 0.05);
    expect(Math.abs(endTimes[0] - endTimes[1] - 0.26)).toBeLessThan(0.15);
    await setTimelineExpanded(false);
    await resetProofViewport();
    // Hold the verified stack on screen long enough for the retained browser
    // recording to show both synchronized camera angles clearly.
    await page.waitForTimeout(1800);
    await captureLiveProof(
      path.join("test-results", "viral-clip-studio-live-two-speaker-stack.png")
    );
    await setTimelineExpanded(true);
  } else {
    await expect(inspector.getByTestId("reframe-speaker-stack")).toBeDisabled();
    await expect(inspector.getByTestId("speaker-source-setup")).toContainText(
      "Reaction insets are never treated as independent cameras"
    );
  }
  await inspector.getByTestId("reframe-follow-subject").click();
  await expect(inspector.getByTestId("reframe-follow-subject")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  for (const aspect of ["9-16", "1-1", "16-9", "4-5"]) {
    await inspector.getByTestId(`reframe-aspect-${aspect}`).click();
    await expect(inspector.getByTestId(`reframe-aspect-${aspect}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  }
  await inspector.getByTestId("reframe-aspect-4-5").click();
  await expect(inspector.getByTestId("reframe-aspect-4-5")).toHaveAttribute("aria-pressed", "true");
  await inspector.getByTestId("add-reframe-keyframe").click();
  await inspector.getByLabel("Manual frame horizontal position").fill("32");
  await inspector.getByLabel("Manual frame vertical position").fill("50");
  await seekAfterPreview(0.5);
  await setTimelineExpanded(false);
  await resetProofViewport();
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-auto-reframe.png"));
  await setTimelineExpanded(true);

  await toolRail.getByRole("button", { name: "Captions", exact: true }).click();
  const translateToEnglish = inspector.getByRole("checkbox", {
    name: "Translate captions to English",
  });
  await expect(translateToEnglish).not.toBeChecked();
  await inspector.getByRole("checkbox", { name: "Preview captions" }).check();
  await page.getByTestId("generate-live-transcript").click();
  await expect(inspector.getByText(/spoken languages preserved automatically/i)).toBeVisible();
  await expect(inspector.getByRole("textbox", { name: "Caption 1 text" })).toHaveValue(
    /Greetings! This is Unmuted/i
  );
  await expect(inspector.getByRole("combobox", { name: "Caption 1 speaker" })).toHaveValue("host");
  await expect(inspector.getByRole("combobox", { name: "Caption 1 language" })).toHaveValue(
    "en"
  );
  await inspector.getByRole("button", { name: "Neon Glow", exact: true }).click();
  for (const style of ["Story Pop", "Bold Pop", "Karaoke", "Bounce", "Minimal", "Neon Glow"]) {
    await inspector.getByRole("button", { name: style, exact: true }).click();
  }
  for (const position of ["Top centre", "Dead centre", "Bottom centre"]) {
    await inspector.getByRole("button", { name: position, exact: true }).click();
  }
  await inspector.getByRole("button", { name: "Neon Glow", exact: true }).click();
  await expect(page.getByTestId("live-caption-preview")).toHaveClass(/caption-style-glow/);
  await expect(page.getByTestId("live-caption-preview")).toContainText(
    "Greetings! This is Unmuted"
  );
  await seekAfterPreview(0.5);
  await setTimelineExpanded(false);
  await resetProofViewport();
  await revealInspectorSection(
    page.getByTestId("caption-segment-editor"),
    ".caption-segment-editor"
  );
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-captions.png"));
  await setTimelineExpanded(true);

  await toolRail.getByRole("button", { name: "Graphics", exact: true }).click();
  await inspector.getByRole("button", { name: /Headline/i }).click();
  await inspector
    .getByRole("textbox", { name: "Title text", exact: true })
    .fill("THE STORY CHANGES HERE");
  await expect(page.getByTestId("pro-graphics-clip-1")).toBeVisible();

  await toolRail.getByRole("button", { name: "Motion", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "X", exact: true }).fill("38");
  await inspector.getByRole("spinbutton", { name: "Y", exact: true }).fill("44");
  await inspector.getByRole("button", { name: /Add transform keyframe/i }).click();
  await expect(inspector.getByText("1 pose", { exact: true })).toBeVisible();
  const outputPosition = page.getByRole("slider", { name: "Edited output position" });
  // Cross a retained-segment boundary without losing the requested output time.
  await outputPosition.fill("4");
  await expect(inspector.getByRole("button", { name: /Add transform keyframe at 4\.00s/i })).toBeVisible();
  await inspector.getByRole("spinbutton", { name: "X", exact: true }).fill("62");
  await inspector.getByRole("spinbutton", { name: "Y", exact: true }).fill("55");
  await inspector.getByRole("button", { name: /Add transform keyframe/i }).click();
  await expect(inspector.getByText("2 poses", { exact: true })).toBeVisible();
  await expect(page.getByTestId("studio-motion-path").locator("polyline")).toBeVisible();
  const firstPoseEasing = inspector
    .getByRole("combobox", { name: /Transform pose at .* seconds easing/i })
    .first();
  await firstPoseEasing.selectOption("bezier");
  await inspector.getByRole("slider", { name: /Bezier in handle/i }).first().fill("0.3");
  await inspector.getByRole("slider", { name: /Bezier out handle/i }).first().fill("0.8");
  await firstPoseEasing.selectOption("ease_in_out");
  const motionPathToggle = inspector.getByRole("button", { name: /Motion path/i });
  await motionPathToggle.click();
  await expect(page.getByTestId("studio-motion-path")).toHaveCount(0);
  await motionPathToggle.click();
  await expect(page.getByTestId("studio-motion-path")).toBeVisible();
  await setTimelineExpanded(true);
  await resetProofViewport();
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-motion-editor.png"));

  await toolRail.getByRole("button", { name: "Composite", exact: true }).click();
  await inspector.getByRole("checkbox", { name: "Enable mask" }).check();
  await inspector.getByRole("button", { name: "ellipse", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "ellipse", exact: true })).toHaveClass(
    /is-active/
  );
  await inspector.getByRole("checkbox", { name: "Enable mask" }).uncheck();
  await inspector.getByText("Chroma key / green screen", { exact: true }).click();
  const chromaToggle = inspector.getByRole("checkbox", { name: /Key a color/i });
  await chromaToggle.check();
  await inspector.getByRole("slider", { name: /Tolerance/i }).fill("42");
  await inspector.getByRole("slider", { name: /Spill removal/i }).fill("55");
  await chromaToggle.uncheck();
  await inspector.getByText("Background & tracking", { exact: true }).click();
  const backgroundToggle = inspector.getByRole("checkbox", { name: /Remove background/i });
  await backgroundToggle.check();
  await inspector.getByRole("combobox", { name: "Replacement", exact: true }).selectOption(
    "studio_black"
  );
  await backgroundToggle.uncheck();
  const trackingToggle = inspector.getByRole("checkbox", { name: /Track layer to motion/i });
  await trackingToggle.check();
  await inspector.getByRole("button", { name: "object", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "object", exact: true })).toHaveClass(
    /is-active/
  );
  await trackingToggle.uncheck();
  await inspector.getByText("Presenter polish", { exact: true }).click();
  for (const polish of [
    "Eye-contact correction",
    "Natural face polish",
    "Studio background refinement",
  ]) {
    const toggle = inspector.getByRole("checkbox", { name: new RegExp(polish, "i") });
    await toggle.check();
    await toggle.uncheck();
  }
  await inspector.getByRole("button", { name: /Adjustment layer/i }).click();
  await inspector.getByRole("checkbox", { name: "Enable mask" }).click();
  await expect(page.getByTestId(/pro-adjustment-clip-/)).toBeVisible();

  await toolRail.getByRole("button", { name: "Graphics", exact: true }).click();
  await inspector.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByTestId("pro-graphics-clip-1")).toHaveCount(0);

  await toolRail.getByRole("button", { name: "Pacing", exact: true }).click();
  await inspector.getByRole("button", { name: "1.5×", exact: true }).click();
  await inspector.getByRole("button", { name: "Energetic", exact: true }).click();
  await inspector.getByRole("checkbox", { name: "Remove dead air" }).click();
  await expect.poll(() => appState.silencePreviewRequests).toBeGreaterThan(0);

  await seekAfterPreview(0.7);
  await toolRail.getByRole("button", { name: "B-roll", exact: true }).click();
  await page.getByTestId("broll-video-input").setInputFiles(bRollSourcePath);
  await expect(page.getByTestId("pro-broll-clip-1")).toBeVisible();
  const bRollDuration = inspector.getByRole("textbox", { name: "B-roll duration", exact: true });
  await bRollDuration.fill("3.5");
  await bRollDuration.press("Enter");
  await inspector.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Full screen", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await inspector.getByRole("button", { name: "Side by side", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Side by side", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await inspector.getByRole("button", { name: "Picture-in-picture", exact: true }).click();
  for (const endBehavior of ["Loop B-roll", "Hold last frame", "Return to original"]) {
    await inspector.getByRole("button", { name: endBehavior, exact: true }).click();
  }
  for (const audioMode of ["Use overlay", "Mix both", "Keep original"]) {
    await inspector.getByRole("button", { name: audioMode, exact: true }).click();
  }
  await expect(inspector.getByRole("slider", { name: "Frame corner curve" })).toHaveValue("28");
  await inspector.getByRole("button", { name: /Apply B-roll/i }).click();
  await seekAfterPreview(0.7);
  const roundBrollPreview = page.getByTestId(/broll-preview-/);
  await expect(roundBrollPreview).toBeVisible();
  await inspector.getByRole("button", { name: "Mix both", exact: true }).click();
  await page.getByLabel("B-roll overlay volume", { exact: true }).fill("50");
  await page.getByLabel("Preview master volume", { exact: true }).fill("20");
  await expect.poll(() => roundBrollPreview.evaluate(video => video.volume)).toBeCloseTo(.1, 2);
  await page.getByLabel("Preview master volume", { exact: true }).fill("0");
  await expect(roundBrollPreview).toHaveJSProperty("muted", true);
  await page.getByLabel("Preview master volume", { exact: true }).fill("100");
  await expect.poll(() => roundBrollPreview.evaluate(video => video.volume)).toBeCloseTo(.5, 2);
  await inspector.getByRole("button", { name: "Keep original", exact: true }).click();
  await expect(roundBrollPreview.locator("xpath=..")).toHaveClass(/frame-shape-round/);
  await expect(roundBrollPreview).toHaveCSS("border-radius", "7%");
  await expect(roundBrollPreview).toHaveCSS("object-fit", "cover");
  await setTimelineExpanded(false);
  await resetProofViewport();
  await revealInspectorSection(
    inspector.getByRole("button", { name: "Picture-in-picture", exact: true }),
    ".inspector-field"
  );
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-round-broll.png"));
  await setTimelineExpanded(true);

  await toolRail.getByRole("button", { name: "Sound", exact: true }).click();
  await inspector.getByRole("button", { name: "podcast", exact: true }).click();
  await inspector.getByRole("checkbox", { name: "Voice isolation" }).click();
  await inspector.getByRole("button", { name: /Add volume keyframe/i }).click();
  await expect(inspector.getByText("1 keys", { exact: true })).toBeVisible();
  await page.getByTestId("sound-effect-preset-whoosh").click();
  await expect(page.getByTestId("sound-effect-editor")).toBeVisible();
  await page.getByTestId("sound-effect-duration").fill("1.2");
  await page.getByTestId("sound-effect-volume").fill("62");
  await expect(page.getByTestId("pro-sfx-clip-1")).toBeVisible();

  await page.getByRole("button", { name: "Show media", exact: true }).click();
  await page.getByTestId("studio-save-project").click();
  await expect(page.locator(".studio-project-save-state")).toContainText("Saved locally");
  await page.getByRole("button", { name: "Hide media", exact: true }).click();

  await toolRail.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator(".export-panel.is-tool-visible")).toBeVisible();
  await expect(inspector).toBeHidden();
  await page.getByRole("radio", { name: "TikTok", exact: true }).click();
  await page.getByLabel("Export resolution").selectOption("1080p");
  await page.getByLabel("Export frame rate").selectOption("30");
  await page.getByLabel("Export codec").selectOption("h264");
  await expect(page.getByTestId("watermark-path-status")).toContainText(
    "preview = export"
  );
  await seekAfterPreview(0.5);
  const firstWatermarkPosition = await page
    .getByTestId("brand-watermark-preview")
    .getAttribute("data-position");
  // Exercise real synchronized playback across the next watermark cue.
  await page.getByRole("button", { name: "After", exact: true }).click();
  await page.getByRole("button", { name: "Play comparison" }).click();
  await expect(page.getByTestId("brand-watermark-preview")).not.toHaveAttribute(
    "data-position",
    firstWatermarkPosition,
    { timeout: 12000 }
  );
  await page.getByRole("button", { name: "Pause comparison" }).click();
  // Return to a decoded Episode 3 frame before capturing export readiness.
  await page.getByRole("slider", { name: "Edited output position" }).fill("0");
  await seekAfterPreview(0.5);
  await expect
    .poll(() => page.getByTestId("studio-after-video").evaluate(video => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(180);
  // The export proof represents the clean programme frame, not an actively
  // selected overlay with transform handles covering the speaker. Blur the
  // transport control first so the studio-level Escape shortcut receives it.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Escape");
  await expect(page.locator(".overlay-controls")).toHaveCount(0);

  expect(appState.captionTranslationRequests).toEqual([false]);
  expect(appState.renderStatusPolls).toBe(0);
  expect(appState.renderPayload).toBeNull();

  await setTimelineExpanded(false);
  await resetProofViewport();
  await captureLiveProof(path.join("test-results", "viral-clip-studio-live-complete.png"));
  expect(pageErrors).toEqual([]);
});

test("records focused proof of the synchronized two-speaker stack", async ({ page }) => {
  test.skip(!hasLocalSpeakerPair, "Local synchronized speaker angles are unavailable");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);

  const inspector = page.getByTestId("clip-studio-inspector");
  await page
    .getByRole("navigation", { name: "Creative tools" })
    .getByRole("button", { name: "Reframe", exact: true })
    .click();
  const setup = inspector.getByTestId("speaker-source-setup");
  await setup.locator("summary").click();
  await inspector
    .getByTestId("clean-speaker-angle-input")
    .setInputFiles([speakerTopSourcePath, speakerBottomSourcePath]);
  await inspector.getByLabel("Top angle start").fill("0.26");
  await inspector
    .getByRole("checkbox", { name: "Angles share the same source timecode" })
    .check();
  await inspector.getByTestId("reframe-speaker-stack").click();
  await inspector.getByTestId("reframe-aspect-9-16").click();
  await expect(page.getByRole("button", { name: "Fit full", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("edit-panel-crops")).toHaveText("Adjust camera crops");
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();

  const programmeVideo = page.getByTestId("studio-after-video");
  const topVideo = page.getByTestId("speaker-stack-top-video");
  const bottomVideo = page.getByTestId("speaker-stack-bottom-video");
  await programmeVideo.evaluate(async video => {
    video.pause();
    const seeked = new Promise(resolve =>
      video.addEventListener("seeked", resolve, { once: true })
    );
    video.currentTime = 2;
    await seeked;
  });
  await expect
    .poll(() => topVideo.evaluate(video => video.readyState), { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => bottomVideo.evaluate(video => video.readyState), { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  expect(await topVideo.getAttribute("src")).not.toBe(await bottomVideo.getAttribute("src"));

  const startTimes = await Promise.all([
    topVideo.evaluate(video => video.currentTime),
    bottomVideo.evaluate(video => video.currentTime),
  ]);
  await page.getByTestId("preview-fullscreen-button").click();
  await expect(page.getByTestId("hook-preview-frame")).toHaveClass(/preview-expanded/);
  await page.getByRole("button", { name: "Play edited preview" }).click();
  await expect
    .poll(() => programmeVideo.evaluate(video => video.currentTime), { timeout: 10000 })
    .toBeGreaterThan(6.1);
  await page.waitForTimeout(500);
  const movingTimes = await Promise.all([
    topVideo.evaluate(video => video.currentTime),
    bottomVideo.evaluate(video => video.currentTime),
  ]);
  expect(movingTimes[0]).toBeGreaterThan(startTimes[0] + 3);
  expect(movingTimes[1]).toBeGreaterThan(startTimes[1] + 3);
  expect(Math.abs(movingTimes[0] - movingTimes[1] - 0.26)).toBeLessThan(0.22);
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-focused-stack-playing.png"),
    fullPage: false,
  });
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  const pauseComparison = page.getByRole("button", { name: "Pause comparison" });
  if (await pauseComparison.count()) await pauseComparison.click();
  const setProgrammeTime = async targetTime => {
    await programmeVideo.evaluate((video, time) => {
      video.pause();
      video.currentTime = Number(time);
      video.dispatchEvent(new Event("timeupdate"));
    }, targetTime);
    await expect
      .poll(() => programmeVideo.evaluate(video => video.currentTime))
      .toBeCloseTo(targetTime, 1);
  };

  await inspector.getByTestId("multicam-composition-active_2").click();
  await setProgrammeTime(1);
  await inspector.getByTestId("speaker-focus-top").click();
  await setProgrammeTime(4);
  await inspector.getByTestId("speaker-focus-bottom").click();
  await expect(page.getByTestId("reframe-preview-status")).toContainText(
    "2 reviewed speaker cuts"
  );
  await inspector.getByRole("button", { name: "Place reaction frame bottom right" }).click();
  await inspector.getByLabel("Reaction frame size").fill("34");
  await setProgrammeTime(4.4);
  await inspector.locator(".speaker-focus-director").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-reviewed-speaker-cuts.png"),
    fullPage: false,
  });

  // Exercise visible editorial corrections, then return to the spacious default.
  await inspector.getByLabel("Top speaker horizontal position").fill("40");
  await inspector.getByLabel("Bottom speaker horizontal position").fill("66");
  await page.waitForTimeout(900);
  await inspector.getByTestId("speaker-stack-editor").getByRole("button", { name: "Reset" }).click();
  for (const aspect of ["4-5", "1-1", "16-9", "9-16"]) {
    await inspector.getByTestId(`reframe-aspect-${aspect}`).click();
    await expect(inspector.getByTestId(`reframe-aspect-${aspect}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.waitForTimeout(700);
  }
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-focused-stack-controls.png"),
    fullPage: false,
  });
  expect(pageErrors).toEqual([]);
});

test("proves the three-input hero and duo multicamera layout", async ({ page }) => {
  test.skip(!hasLocalSpeakerPair, "Local synchronized speaker angles are unavailable");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);

  const inspector = page.getByTestId("clip-studio-inspector");
  await page
    .getByRole("navigation", { name: "Creative tools" })
    .getByRole("button", { name: "Reframe", exact: true })
    .click();
  await inspector.getByTestId("speaker-source-setup").locator("summary").click();
  await inspector.getByTestId("clean-speaker-angle-input").setInputFiles([
    speakerTopSourcePath,
    speakerBottomSourcePath,
    speakerThirdSourcePath,
  ]);
  await expect(inspector.getByTestId("multicam-layout-3")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(inspector.getByLabel("Camera 3 source")).toContainText("programme-camera-3");
  await inspector.getByLabel("Top angle start").fill("0.26");
  await inspector.getByLabel("Camera 3 start").fill("0");
  await inspector
    .getByRole("checkbox", { name: "Angles share the same source timecode" })
    .check();
  await inspector.getByTestId("reframe-speaker-stack").click();
  await inspector.getByLabel("Camera 3 horizontal position").fill("30");
  await expect(page.getByTestId("reframe-preview-status")).toContainText("3 cameras live");
  await expect(page.getByRole("button", { name: "Fit full", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("edit-panel-crops")).toHaveText("Adjust camera crops");
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();

  const programmeVideo = page.getByTestId("studio-after-video");
  const cameraVideos = [
    page.getByTestId("speaker-stack-top-video"),
    page.getByTestId("speaker-stack-bottom-video"),
    page.getByTestId("speaker-stack-third-video"),
  ];
  for (const cameraVideo of cameraVideos) {
    await expect
      .poll(() => cameraVideo.evaluate(video => video.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
  }
  const sourceUrls = await Promise.all(cameraVideos.map(video => video.getAttribute("src")));
  expect(new Set(sourceUrls).size).toBe(3);
  const pauseBeforeProof = page.getByRole("button", { name: "Pause comparison" });
  if (await pauseBeforeProof.count()) await pauseBeforeProof.click();
  await page.getByLabel("Edited output position").fill("0");
  await expect.poll(() => programmeVideo.evaluate(video => video.currentTime)).toBeLessThan(0.4);
  const startTimes = await Promise.all(
    cameraVideos.map(video => video.evaluate(element => element.currentTime))
  );
  await page.getByTestId("preview-fullscreen-button").click();
  await page.getByRole("button", { name: "Play edited preview" }).click();
  await expect
    .poll(() => programmeVideo.evaluate(video => video.currentTime), { timeout: 10000 })
    .toBeGreaterThan(3.2);
  await page.waitForTimeout(3000);
  const movingTimes = await Promise.all(
    cameraVideos.map(video => video.evaluate(element => element.currentTime))
  );
  movingTimes.forEach((time, index) => expect(time).toBeGreaterThan(startTimes[index] + 2.5));
  const normalizedTimes = movingTimes.map((time, index) => time - ([0.26, 0, 0][index]));
  expect(Math.max(...normalizedTimes) - Math.min(...normalizedTimes)).toBeLessThan(0.25);
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-three-camera-hero-playing.png"),
    fullPage: false,
  });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  const pauseComparison = page.getByRole("button", { name: "Pause comparison" });
  if (await pauseComparison.count()) await pauseComparison.click();
  await inspector.getByTestId("speaker-source-setup").evaluate(element => {
    element.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-three-camera-controls.png"),
    fullPage: false,
  });
  expect(pageErrors).toEqual([]);
});

test("proves the four-input multicamera grid with moving synchronized test views", async ({
  page,
}) => {
  test.skip(!hasLocalSpeakerPair, "Local synchronized speaker angles are unavailable");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);

  const inspector = page.getByTestId("clip-studio-inspector");
  await page
    .getByRole("navigation", { name: "Creative tools" })
    .getByRole("button", { name: "Reframe", exact: true })
    .click();
  await inspector.getByTestId("speaker-source-setup").locator("summary").click();
  await inspector.getByTestId("clean-speaker-angle-input").setInputFiles([
    speakerTopSourcePath,
    speakerBottomSourcePath,
    speakerThirdSourcePath,
    speakerFourthSourcePath,
  ]);
  await expect(inspector.getByTestId("multicam-layout-4")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(inspector.getByLabel("Camera 3 source")).toContainText("programme-camera-3");
  await expect(inspector.getByLabel("Camera 4 source")).toContainText("layout-test-camera-4");
  await inspector.getByLabel("Top angle start").fill("0.26");
  await inspector.getByLabel("Camera 3 start").fill("0");
  await inspector
    .getByRole("checkbox", { name: "Angles share the same source timecode" })
    .check();
  await inspector.getByTestId("reframe-speaker-stack").click();
  await inspector.getByLabel("Camera 3 horizontal position").fill("30");
  await inspector.getByLabel("Camera 4 horizontal position").fill("70");
  await expect(page.getByTestId("reframe-preview-status")).toContainText("4 cameras live");
  await expect(page.getByRole("button", { name: "Fit full", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("edit-panel-crops")).toHaveText("Adjust camera crops");
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();

  const cameraVideos = [
    page.getByTestId("speaker-stack-top-video"),
    page.getByTestId("speaker-stack-bottom-video"),
    page.getByTestId("speaker-stack-third-video"),
    page.getByTestId("speaker-stack-fourth-video"),
  ];
  for (const cameraVideo of cameraVideos) {
    await expect
      .poll(() => cameraVideo.evaluate(video => video.readyState), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
  }
  const sourceUrls = await Promise.all(cameraVideos.map(video => video.getAttribute("src")));
  expect(new Set(sourceUrls).size).toBe(4);

  const programmeVideo = page.getByTestId("studio-after-video");
  const pauseBeforeProof = page.getByRole("button", { name: "Pause comparison" });
  if (await pauseBeforeProof.count()) await pauseBeforeProof.click();
  await page.getByLabel("Edited output position").fill("0");
  await expect.poll(() => programmeVideo.evaluate(video => video.currentTime)).toBeLessThan(0.4);
  const startTimes = await Promise.all(
    cameraVideos.map(video => video.evaluate(element => element.currentTime))
  );
  await page.getByTestId("preview-fullscreen-button").click();
  await page.getByRole("button", { name: "Play edited preview" }).click();
  await expect
    .poll(() => programmeVideo.evaluate(video => video.currentTime), { timeout: 10000 })
    .toBeGreaterThan(3.2);
  await page.waitForTimeout(3000);
  const movingTimes = await Promise.all(
    cameraVideos.map(video => video.evaluate(element => element.currentTime))
  );
  movingTimes.forEach((time, index) => expect(time).toBeGreaterThan(startTimes[index] + 2.5));
  const normalizedTimes = movingTimes.map((time, index) => time - ([0.26, 0, 0, 0][index]));
  expect(Math.max(...normalizedTimes) - Math.min(...normalizedTimes)).toBeLessThan(0.25);
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-four-camera-grid-playing.png"),
    fullPage: false,
  });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  const pauseComparison = page.getByRole("button", { name: "Pause comparison" });
  if (await pauseComparison.count()) await pauseComparison.click();
  await inspector.getByTestId("speaker-source-setup").evaluate(element => {
    element.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-four-camera-controls.png"),
    fullPage: false,
  });
  expect(pageErrors).toEqual([]);
});

test("keeps comparison monitors fitted and transport usable at every output aspect", async ({ page }, testInfo) => {
  await installAppRoutes(page);
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true; window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" }));
  });
  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
  await page.getByTestId("auto-reframe-toggle").check();
  // This is a manually reviewed host crop, not an automatic-tracking claim.
  await page.getByTestId("preview-quick-track-speaker").click();
  await page.getByRole("button", { name: "Left Speaker", exact: false }).click();
  await page.getByLabel("Manual frame horizontal position").fill("29");
  for (const width of [1440, 1280, 1100, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    for (const aspect of ["9-16", "4-5", "1-1", "16-9"]) {
      await page.getByTestId(`reframe-aspect-${aspect}`).click();
      await page.locator(".preview-mode-switch button").nth(2).click();
      await expect(page.getByLabel("Edited output position")).toBeVisible();
      const [w, h] = aspect.split("-").map(Number);
      await expect.poll(() => page.getByTestId("hook-preview-frame").evaluate(f => {
        const r = f.getBoundingClientRect(); return r.width/r.height;
      })).toBeCloseTo(w/h, 2);
      const geometry = await page.locator(".preview-player-shell").evaluate(shell => {
        const box = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
        return { shell: box(shell), before: box(shell.querySelector(".phone-frame-before")),
          after: box(shell.querySelector('[data-testid="hook-preview-frame"]')),
          controls: box(shell.querySelector(".preview-custom-controls")) };
      });
      for (const r of [geometry.before, geometry.after, geometry.controls]) {
        expect(r.x).toBeGreaterThanOrEqual(geometry.shell.x - 1);
        expect(r.right).toBeLessThanOrEqual(geometry.shell.right + 1);
        expect(r.y).toBeGreaterThanOrEqual(geometry.shell.y - 1);
        expect(r.bottom).toBeLessThanOrEqual(geometry.shell.bottom + 1);
      }
      expect(geometry.before.right).toBeLessThanOrEqual(geometry.after.x);
      expect(Math.max(geometry.before.bottom, geometry.after.bottom)).toBeLessThanOrEqual(geometry.controls.y);
      expect(geometry.before.width/geometry.before.height).toBeCloseTo(16/9, 2);
      await page.getByLabel("Edited output position").fill("3");
      await expect.poll(() => page.getByTestId("studio-after-video").evaluate(v => v.currentTime)).toBeCloseTo(3, 1);
      await expect.poll(() => page.getByLabel("Untouched source preview").evaluate(v => v.currentTime)).toBeCloseTo(3, 1);
      if (aspect === "9-16") await page.screenshot({ path: testInfo.outputPath(`comparison-${width}.png`) });
    }
    await page.getByRole("button", { name: "Before", exact: true }).click();
    await expect(page.getByLabel("Edited output position")).toBeVisible();
    await expect(page.getByTestId("hook-preview-frame")).not.toBeVisible();
    await expect(page.getByTestId("before-preview-frame")).toBeVisible();
    const before = await page.locator(".phone-frame-before").boundingBox();
    const controls = await page.locator(".preview-custom-controls").boundingBox();
    expect(before.width/before.height).toBeCloseTo(16/9, 2);
    expect(before.y + before.height).toBeLessThanOrEqual(controls.y);
  }
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: "Play edited preview", exact: true }).click();
  await expect.poll(() => page.getByTestId("studio-after-video").evaluate(v => v.currentTime)).toBeGreaterThan(3.2);
  await page.getByRole("button", { name: "Pause edited preview", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("paused", true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId("reframe-aspect-9-16").click();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  for (const mediaOpen of [false, true]) {
    if (mediaOpen) await page.getByRole("button", { name: "Show media", exact: true }).click();
    for (const dock of ["side", "center"]) {
      await page.getByTestId("preview-dock-toggle-btn").click();
      const rects = await page.locator(".studio-layout").evaluate(layout => {
        const selectors = [".creative-tool-rail", ".studio-project-rail", ".phone-preview-container", ".studio-sidebar"];
        return selectors.map(s => layout.querySelector(s)).filter(el => el && el.getBoundingClientRect().width > 0)
          .map(el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right }; });
      });
      for (let i = 0; i < rects.length; i++) {
        expect(rects[i].left).toBeGreaterThanOrEqual(0);
        expect(rects[i].right).toBeLessThanOrEqual(1281);
        for (let j = i+1; j < rects.length; j++) {
          expect(rects[i].right <= rects[j].left + 1 || rects[j].right <= rects[i].left + 1).toBe(true);
        }
      }
      const picture = await page.getByTestId("hook-preview-frame").boundingBox();
      const transport = await page.locator(".preview-custom-controls").boundingBox();
      expect(picture.width/picture.height).toBeCloseTo(9/16, 2);
      expect(picture.height).toBeGreaterThan(mediaOpen ? 300 : 360);
      expect(picture.y + picture.height).toBeLessThanOrEqual(transport.y);
      const tabs = page.getByRole("tablist", { name: "Clip Studio tools", exact: true });
      expect(await tabs.evaluate(el => [...el.querySelectorAll("button")]
        .every(button => button.scrollWidth <= button.clientWidth + 1))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`comparison-${dock}-media-${mediaOpen}.png`) });
    }
  }
  await page.getByRole("button", { name: "Hide media", exact: true }).click();
  await page.getByRole("button", { name: "After", exact: true }).click();
  await page.getByTestId("preview-quick-both-cams").click();
  await expect(page.locator(".preview-mode-switch").getByRole("button", { name: "After", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("follows existing camera cuts using real full-minute analysis in the programme preview", async ({ page }, testInfo) => {
  const source = path.join(os.homedir(), "Videos", "cam-combiner-60sec.mp4");
  const proof = path.resolve(__dirname, "../../../proof/studio-60s-2026-09-12/source-shot-follow-02/tracking.json");
  test.skip(!fs.existsSync(source) || !fs.existsSync(proof), "Run verify_source_shot_follow.py on the local master first");
  const tracked = JSON.parse(fs.readFileSync(proof, "utf8"));
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await installAppRoutes(page, source);
  state.faceTrackingResult = tracked.analysis;
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true; window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" }));
  });
  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(source);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.getByTestId("preview-quick-track-speaker").click();
  await page.getByRole("button", { name: "Left Speaker", exact: false }).click();
  await page.getByLabel("Manual frame horizontal position").fill("29");
  await page.getByLabel("Speaker zoom").fill("1.05");
  const request = page.waitForRequest("**/api/media/track-studio-faces");
  await page.getByTestId("analyze-source-shots").click();
  expect((await request).postDataBuffer().includes(Buffer.from('name="mode"\r\n\r\nsource_shots'))).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Source-shot draft applied" })).toBeVisible();
  expect(state.faceTrackingRequests).toBe(1);
  await page.getByRole("button", { name: "After", exact: true }).click();
  for (const [time, side] of [[49.45, "host"], [49.55, "guest"], [52.55, "host"], [53.55, "guest"], [57.35, "host"]]) {
    await page.getByLabel("Edited output position").fill(String(time));
    const video = page.getByTestId("studio-after-video");
    await expect.poll(() => video.evaluate(v => v.currentTime)).toBeCloseTo(time, 1);
    await expect(video).toHaveJSProperty("seeking", false);
    await expect.poll(async () => parseFloat(await video.evaluate(v => v.style.objectPosition)))
      [side === "host" ? "toBeLessThan" : "toBeGreaterThan"](50);
    // Verify decoded pixels, not just CSS coordinates. A previous bug drew
    // the stale Before video for small scrubs across the first source cut.
    await expect.poll(() => page.evaluate(() => {
      const v = document.querySelector('[data-testid="studio-after-video"]');
      const actual = document.querySelector('[data-testid="studio-program-canvas"]');
      const expected = document.createElement("canvas");
      expected.width = actual.width; expected.height = actual.height;
      const ctx = expected.getContext("2d");
      ctx.fillStyle = "black"; ctx.fillRect(0, 0, expected.width, expected.height);
      ctx.filter = actual.dataset.programmeFilter || "none";
      const [x, y] = v.style.objectPosition.split(" ").map(parseFloat);
      const scale = Math.max(expected.width/v.videoWidth, expected.height/v.videoHeight)*1.05;
      const width = v.videoWidth*scale, height = v.videoHeight*scale;
      ctx.drawImage(v, (expected.width-width)*x/100, (expected.height-height)*y/100, width, height);
      const a = actual.getContext("2d").getImageData(0, 0, actual.width, actual.height).data;
      const b = ctx.getImageData(0, 0, expected.width, expected.height).data;
      let error = 0, count = 0;
      for (let i = 0; i < a.length; i += 16) {
        error += Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]); count += 3;
      }
      return error/count;
    })).toBeLessThan(4);
    await page.screenshot({ path: testInfo.outputPath(`source-cut-${time}-${side}.png`) });
  }
  for (const [width, height] of [[1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const frame = page.getByTestId("hook-preview-frame");
    await expect.poll(() => frame.evaluate(f => f.getBoundingClientRect().height)).toBeGreaterThan(height*.52);
    const geometry = await frame.evaluate(f => {
      const r = f.getBoundingClientRect();
      const timeline = document.querySelector(".studio-pro-timeline-dock").getBoundingClientRect();
      return { ratio: r.width/r.height, bottom: r.bottom, timeline: timeline.top,
        corners: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"]
          .map(key => parseFloat(getComputedStyle(f)[key])) };
    });
    expect(geometry.ratio).toBeCloseTo(9/16, 2);
    expect(geometry.bottom).toBeLessThan(geometry.timeline);
    expect(geometry.corners.every(radius => radius > 0)).toBe(true);
    await expect(page.getByTestId("main-footage-frame-toggle")).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: testInfo.outputPath(`large-rounded-preview-${width}.png`) });
  }
  const handle = page.getByRole("separator", { name: "Resize timeline" });
  await handle.focus();
  await handle.press("ArrowUp");
  await expect(handle).toHaveAttribute("aria-valuenow", "212");
  await handle.press("ArrowDown");
  await expect(handle).toHaveAttribute("aria-valuenow", "188");
  await page.getByTestId("main-footage-frame-toggle").click();
  await expect(page.getByTestId("hook-preview-frame")).toHaveCSS("border-top-left-radius", "0px");
  await page.getByTestId("main-footage-frame-toggle").click();
  await expect(page.getByTestId("main-footage-frame-toggle")).toHaveAttribute("aria-pressed", "true");
  for (const width of [1440, 1280, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    const geometry = await page.locator('[aria-label="Project navigator"]').evaluate(rail => {
      const r = rail.getBoundingClientRect();
      const p = document.querySelector('.phone-preview-container').getBoundingClientRect();
      return { disjoint: r.right <= p.left + 1, width: p.width };
    });
    expect(geometry.disjoint).toBe(true);
    expect(geometry.width).toBeGreaterThan(400);
    const hide = page.getByRole("button", { name: "Hide media", exact: true });
    expect(await hide.evaluate(button => {
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`media-open-no-overlap-${width}.png`) });
    await page.getByRole("button", { name: "Close media ×", exact: true }).click();
    await expect(page.getByRole("button", { name: "Show media", exact: true })).toBeVisible();
  }
});

test("switches the full-minute programme from Show Everyone to a solo speaker at the later camera cut", async ({ page }, testInfo) => {
  const source = path.join(os.homedir(), "Videos", "cam-combiner-60sec.mp4");
  test.skip(!fs.existsSync(source), "The user's 60-second source is unavailable");
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page, source);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true; window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" }));
  });
  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(source);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  const video = page.getByTestId("studio-after-video");
  await expect(video).toHaveJSProperty("readyState", 4);
  await page.getByRole("button", { name: "After", exact: true }).click();

  await page.getByLabel("Edited output position").fill("1.5");
  await page.getByTestId("preview-quick-both-cams").click();
  await expect(page.getByTestId("reframe-preserve-frame")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("source-split-editor")).toBeVisible();
  await expect(page.getByLabel("bottom split zoom")).toHaveValue("6.2");
  await expect(page.getByTestId("pro-framing-clip-1")).toContainText("Solo Speaker");
  await expect(page.getByTestId("pro-framing-clip-2")).toContainText("Show Everyone");
  await page.screenshot({ path: testInfo.outputPath("show-everyone-same-time-pair.png") });

  await page.getByTestId("show-everyone-bottom-first").click();
  await expect(page.getByTestId("show-everyone-bottom-first")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pro-framing-speaker-cut")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("show-everyone-speaker-2-on-top.png") });

  await page.getByLabel("Edited output position").fill("53.6");
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeCloseTo(53.6, 1);
  await page.getByTestId("preview-quick-track-speaker").click();
  await expect(page.getByTestId("reframe-follow-subject")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("source-split-editor")).toHaveCount(0);
  await expect(page.getByTestId("pro-framing-clip-3")).toContainText("Solo Speaker");
  await page.getByRole("button", { name: "Right Speaker", exact: false }).click();
  await page.getByLabel("Speaker zoom").fill("1.15");
  await expect(page.getByTestId("reframe-preview-status")).toContainText("1 framing correction");
  await expect.poll(() => page.getByTestId("hook-preview-frame").evaluate(frame => {
    const rect = frame.getBoundingClientRect();
    return rect.width / rect.height;
  })).toBeCloseTo(9 / 16, 2);
  await page.screenshot({ path: testInfo.outputPath("later-speaker-solo.png") });

  await page.getByLabel("Edited output position").fill("2");
  await expect(page.getByTestId("reframe-preserve-frame")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("source-split-editor")).toBeVisible();
  await page.getByLabel("Edited output position").fill("53.6");
  await expect(page.getByTestId("reframe-follow-subject")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("proves precision grade, curves and imported LUT on the full 60 second source", async ({ page }, testInfo) => {
  const source = path.join(os.homedir(), "Videos", "cam-combiner-60sec.mp4");
  test.skip(!fs.existsSync(source), "The user's 60-second source is unavailable");
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page, source);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true; window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem("user", JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" }));
  });
  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(source);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.getByRole("button", { name: "After", exact: true }).click();
  await page.getByLabel("Edited output position").fill("3");
  await page.getByTestId("preview-quick-track-speaker").click();
  await page.getByRole("button", { name: "Left Speaker", exact: false }).click();
  await page.getByLabel("Manual frame horizontal position").fill("29");
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Color", exact: true }).click();
  const rack = page.getByTestId("studio-finish-rack");
  await rack.getByRole("button", { name: /Studio Natural/ }).click();
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(page.getByLabel("Precision RGB grade")).toBeChecked();
  const pixels = () => page.getByTestId("studio-program-canvas").evaluate(canvas => {
    const p = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0; for (let i = 0; i < p.length; i += 16) sum += p[i]+p[i+1]+p[i+2]; return sum;
  });
  const initial = await pixels();
  await page.getByLabel("Exposure stops").fill("0.4");
  await expect.poll(pixels).toBeGreaterThan(initial * 1.05);
  await expect(page.getByRole("button", { name: /Add grade keyframe/ })).toBeDisabled();
  await page.getByLabel("Exposure stops").fill("0");
  const lutInput = page.locator('.lut-import-button input[type="file"]');
  await lutInput.setInputFiles({ name: "invalid.cube", mimeType: "text/plain", buffer: Buffer.from("LUT_3D_SIZE 33\n0 0 0") });
  await expect(page.getByText("The LUT must contain a complete 2–65 point 3D cube and a valid domain.", { exact: true })).toBeVisible();
  const valid = "LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0";
  const beforeLut = await pixels();
  await lutInput.setInputFiles({ name: "qa-invert.cube", mimeType: "text/plain", buffer: Buffer.from(valid) });
  await expect(page.getByRole("button", { name: "Remove LUT", exact: true })).toBeVisible();
  await expect.poll(async () => Math.abs(await pixels()-beforeLut)).toBeGreaterThan(10000);
  await page.screenshot({ path: testInfo.outputPath("lut-actually-changes-programme.png") });
  await page.getByRole("button", { name: "Remove LUT", exact: true }).click();
  await page.locator(".advanced-color-sliders label").filter({ hasText: "Curve · midtones" }).locator("input").fill("20");
  await page.locator(".advanced-color-sliders label").filter({ hasText: "HSL · saturation" }).locator("input").fill("-8");
  await expect(page.getByLabel("RGB parade live")).toBeVisible();
  await page.getByTestId("studio-after-video").evaluate(video => video.play());
  await page.waitForTimeout(2500);
  await page.getByTestId("studio-after-video").evaluate(video => video.pause());
  await page.screenshot({ path: testInfo.outputPath("full-minute-live-precision-grade.png") });
  for (const time of [49.6, 52.6, 53.6, 57.4, 59.8]) {
    await page.getByLabel("Edited output position").fill(String(time));
    await expect.poll(() => page.getByTestId("studio-after-video").evaluate(video => video.currentTime)).toBeCloseTo(time, 1);
  }
  await rack.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Precision RGB grade")).not.toBeChecked();
  await expect(page.locator(".advanced-color-sliders label").filter({ hasText: "Curve · midtones" }).locator("input")).toHaveValue("0");
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Captions", exact: true }).click();
  await page.locator('.caption-import-srt-btn input[type="file"]').setInputFiles({
    name: "confirmed-speaker-names.srt", mimeType: "text/plain", buffer: Buffer.from(
      "1\n00:00:39,100 --> 00:00:40,340\nLisakhanya Mdoda\n\n2\n00:00:52,240 --> 00:00:54,040\nSiphamandla Tsephe\n") });
  await expect(page.getByTestId("caption-segment-editor").locator("textarea").first()).toHaveValue("Lisakhanya Mdoda");
  await page.getByLabel("Edited output position").fill("39.4");
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("seeking", false);
  await expect(page.getByText("Loading edited preview…", { exact: true })).not.toBeVisible();
  await expect(page.getByTestId("live-caption-preview")).toBeVisible();
  await expect(page.getByTestId("live-caption-preview")).toContainText("Lisakhanya");
  await expect(page.getByTestId("live-caption-preview")).toContainText("Mdoda");
  await page.screenshot({ path: testInfo.outputPath("confirmed-host-name-caption-preview.png") });
  expect(errors).toEqual([]);
});

test("proves Motion Sculpture with real full-body movement footage", async ({ page }) => {
  test.skip(!fs.existsSync(motionSourcePath), "Local movement source is unavailable");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppRoutes(page, motionSourcePath);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(
    motionSourcePath
  );
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);

  const toolRail = page.getByRole("navigation", { name: "Creative tools" });
  const inspector = page.getByTestId("clip-studio-inspector");
  await toolRail.getByRole("button", { name: "Reframe", exact: true }).click();
  await inspector.getByTestId("reframe-aspect-16-9").click();
  await inspector.getByTestId("reframe-preserve-frame").click();
  await toolRail.getByRole("button", { name: "Moments", exact: true }).click();
  await page.getByRole("button", { name: "Motion Sculpture", exact: true }).click();
  await page
    .locator('[aria-label="Creative intensity"]')
    .getByRole("button", { name: "Unreal", exact: true })
    .click();
  await page.getByRole("button", { name: "After", exact: true }).click();
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();

  const motionVideo = page.getByTestId("studio-after-video");
  await motionVideo.evaluate(async video => {
    video.currentTime = 5;
    await video.play();
  });
  const firstTime = await motionVideo.evaluate(video => video.currentTime);
  await page.waitForTimeout(3000);
  const secondTime = await motionVideo.evaluate(video => video.currentTime);
  expect(secondTime).toBeGreaterThan(firstTime + 0.25);
  await expect(page.getByTestId("creative-effect-live-layer")).toBeVisible();
  await expect(page.getByAltText("Motion Sculpture unreal visual target")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Motion Sculpture", exact: true })
  ).toHaveClass(/is-active/);
  await expect(motionVideo).toHaveCSS("opacity", "0");
  await expect(page.getByTestId("studio-program-canvas")).toHaveCSS("opacity", "1");

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll(".viral-studio-overlay, .viral-studio-container").forEach(element => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  });
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-live-motion-sculpture.png"),
    fullPage: false,
  });
  await motionVideo.evaluate(video => video.pause());
  expect(pageErrors).toEqual([]);
});

test("records the complete frontend-first creator feature tour without rendering", async ({
  page,
}, testInfo) => {
  test.setTimeout(7 * 60 * 1000);
  const recordingEpoch = Date.now();
  await page.setViewportSize({ width: 1440, height: 900 });
  const appState = await installAppRoutes(page);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true;
    window.__E2E_TEST_TOKEN = "e2e-test-token";
    localStorage.setItem("E2E_BYPASS", "true");
    localStorage.setItem(
      "user",
      JSON.stringify({ uid: "testUser", email: "test@local", name: "Studio Tester" })
    );
  });

  await page.goto(`${getBase()}/#/dashboard`, { waitUntil: "networkidle" });
  await openViralClipStudioEntry(page);
  await page.locator('.viral-studio-entry-panel input[type="file"]').setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Creator Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 120000 });
  await openStudio.click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.getByRole("button", { name: "After", exact: true }).click();
  const studioProofStartSeconds = Math.max(0, (Date.now() - recordingEpoch) / 1000 - 0.8);

  for (const controlName of ["Safe zones", "Grid"]) {
    const control = page.getByRole("button", { name: controlName, exact: true });
    if ((await control.getAttribute("aria-pressed")) === "true") await control.click();
  }

  const toolRail = page.getByRole("navigation", { name: "Creative tools" });
  const inspector = page.getByTestId("clip-studio-inspector");
  const programme = page.getByTestId("studio-after-video");
  const workbench = page.getByTestId("creator-workbench");
  const presentPreview = async (hold = 620) => {
    await page.getByTestId("preview-fullscreen-button").click();
    await expect(page.getByTestId("hook-preview-frame")).toHaveClass(/preview-expanded/);
    await page.waitForTimeout(hold);
    await page.getByRole("button", { name: "Exit preview", exact: true }).click();
    await expect(page.getByTestId("hook-preview-frame")).not.toHaveClass(/preview-expanded/);
    await page.waitForTimeout(160);
  };
  const showDemo = async (id, hold = 620, expand = true) => {
    const button = workbench.getByTestId(`creator-demo-${id}`);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page.getByTestId("studio-creator-preview-layer")).toHaveAttribute(
      "data-active-demo",
      id
    );
    await page.waitForTimeout(260);
    if (expand) await presentPreview(hold);
    else await page.waitForTimeout(hold);
  };
  const showSection = async id => {
    const button = workbench.getByTestId(`creator-section-${id}`);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(220);
  };
  const seekProgramme = async time => {
    await programme.evaluate(async (video, targetTime) => {
      video.pause();
      const ready = new Promise(resolve => {
        const timeout = window.setTimeout(resolve, 900);
        video.addEventListener("seeked", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
      video.currentTime = Math.min(Number(targetTime), Math.max(0, video.duration - 0.1));
      await ready;
      video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    }, time);
    await page.waitForTimeout(140);
  };

  // SECTION 1 — timeline, tracks and simultaneous visual layers.
  await expect(page.getByTestId("studio-pro-timeline")).toBeVisible();
  const timelineTools = page.getByRole("toolbar", { name: "Timeline edit tools" });
  for (const tool of ["Razor", "Ripple", "Roll", "Slip", "Slide", "Select"]) {
    await timelineTools.getByRole("button", { name: `${tool} tool`, exact: true }).click();
  }
  await toolRail.getByRole("button", { name: "Creator FX", exact: true }).click();
  await showSection("layers");
  await workbench.getByTestId("creator-demo-layer_stack").click();
  await expect(page.getByTestId("studio-creator-preview-layer")).toHaveCount(0);
  await expect(page.getByTestId("studio-pro-timeline")).toBeVisible();
  await page.getByRole("button", { name: "Hide timeline", exact: true }).click();

  // SECTION 2 — real transform keyframes and creator zoom curves.
  await showSection("motion");
  await workbench.getByLabel("Creator zoom amount").fill("1.56");
  for (const [index, demo] of ["punch_zoom", "snap_zoom", "crash_zoom"].entries()) {
    await seekProgramme(index + 0.5);
    await workbench.getByTestId(`creator-demo-${demo}`).click();
    await expect(page.getByTestId("studio-creator-preview-layer")).toHaveCount(0);
    await programme.evaluate(video => video.play());
    await page.waitForTimeout(750);
    await programme.evaluate(video => video.pause());
  }
  await page.waitForTimeout(500);
  await workbench.getByRole("button", { name: /Open full X\/Y/i }).click();
  await page.getByRole("button", { name: "Transform keyframes", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "X", exact: true }).fill("39");
  await inspector.getByRole("spinbutton", { name: "Y", exact: true }).fill("43");
  await inspector.getByRole("button", { name: /Add transform keyframe/i }).click();
  await page.getByLabel("Edited output position").fill("3");
  await inspector.getByRole("spinbutton", { name: "X", exact: true }).fill("63");
  await inspector.getByRole("spinbutton", { name: "Y", exact: true }).fill("54");
  await inspector.getByRole("button", { name: /Add transform keyframe/i }).click();
  await page.waitForTimeout(700);
  await inspector.getByRole("button", { name: "Reset transform", exact: true }).click();
  await expect(inspector.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue("50.0");
  await expect(inspector.getByText("0 poses", { exact: true })).toBeVisible();

  // SECTION 3 — six-bus audio envelope editing.
  await toolRail.getByRole("button", { name: "Sound", exact: true }).click();
  const sourceSelect = inspector.getByRole("combobox", { name: "Automation source" });
  for (const source of ["originalAudio", "masterPodcast", "music", "broll", "sfx", "voiceover"]) {
    await sourceSelect.selectOption(source);
    await inspector.getByRole("button", { name: /Add volume keyframe/i }).click();
  }
  await sourceSelect.selectOption("originalAudio");
  const gainSlider = inspector.getByRole("slider", { name: /originalAudio volume/i }).first();
  await gainSlider.fill("24");
  await inspector.getByLabel("originalAudio keyframe time").first().fill("1.25");
  await page.waitForTimeout(800);

  // SECTION 4 — Show Everyone plus every two-camera composition.
  await toolRail.getByRole("button", { name: "Reframe", exact: true }).click();
  await inspector.getByTestId("reframe-follow-subject").click();
  await seekProgramme(0.6);
  await inspector.getByTestId("add-reframe-keyframe").click();
  await inspector.getByRole("slider", { name: "Manual frame horizontal position" }).fill("34");
  await presentPreview(850);
  await seekProgramme(4.2);
  await inspector.getByTestId("add-reframe-keyframe").click();
  await inspector.getByRole("slider", { name: "Manual frame horizontal position" }).fill("68");
  await presentPreview(850);
  await inspector.getByTestId("reframe-preserve-frame").click();
  await page.waitForTimeout(600);
  for (const aspect of ["16-9", "1-1", "4-5", "9-16"]) {
    await inspector.getByTestId(`reframe-aspect-${aspect}`).click();
    await expect(inspector.getByTestId(`reframe-aspect-${aspect}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await presentPreview(aspect === "16-9" ? 1100 : 760);
  }
  if (hasLocalSpeakerPair) {
    const setup = inspector.getByTestId("speaker-source-setup");
    await setup.locator("summary").click();
    await inspector
      .getByTestId("clean-speaker-angle-input")
      .setInputFiles([speakerTopSourcePath, speakerBottomSourcePath]);
    await inspector
      .getByRole("checkbox", { name: "Angles share the same source timecode" })
      .check();
    await inspector.getByTestId("reframe-speaker-stack").click();
    for (const layout of ["stack_2", "split_2", "pip_2", "active_2", "spotlight_2"]) {
      await inspector.getByTestId(`multicam-composition-${layout}`).click();
      await expect(inspector.getByTestId(`multicam-composition-${layout}`)).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      if (layout === "active_2") {
        await seekProgramme(1);
        await inspector.getByTestId("speaker-focus-top").click();
        await seekProgramme(4);
        await inspector.getByTestId("speaker-focus-bottom").click();
        await expect(page.getByTestId("reframe-preview-status")).toContainText(
          "2 reviewed speaker cuts"
        );
      }
      await page.waitForTimeout(260);
      await presentPreview(layout === "spotlight_2" ? 1300 : 900);
    }
  }

  // SECTION 5 — moving, story-connected B-roll in every supported layout.
  await seekProgramme(0.7);
  await toolRail.getByRole("button", { name: "B-roll", exact: true }).click();
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await page
    .getByTestId("broll-video-input")
    .setInputFiles(fs.existsSync(contextBRollSourcePath) ? contextBRollSourcePath : bRollSourcePath);
  await expect(page.getByTestId(/pro-broll-clip-/)).toHaveCount(1);
  await expect
    .poll(() =>
      inspector
        .locator(".inspector-selected-asset video")
        .evaluate(video => Number(video.readyState || 0))
    )
    .toBeGreaterThanOrEqual(2);
  const bRollDuration = inspector.getByRole("textbox", {
    name: "B-roll duration",
    exact: true,
  });
  await bRollDuration.fill("3.5");
  await bRollDuration.press("Enter");
  for (const layout of ["Full screen", "Side by side", "Picture-in-picture"]) {
    const beforeButton = page.getByRole("button", { name: "Before", exact: true });
    if ((await beforeButton.getAttribute("aria-pressed")) !== "true") await beforeButton.click();
    await inspector.getByRole("button", { name: layout, exact: true }).click();
    await expect(inspector.getByRole("button", { name: layout, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await seekProgramme(0.7);
    await page.getByRole("button", { name: "After", exact: true }).click();
    const activeBRollVideo = page.getByTestId(/broll-preview-/);
    await expect(activeBRollVideo).toBeVisible();
    await expect
      .poll(() => activeBRollVideo.evaluate(video => Number(video.readyState || 0)))
      .toBeGreaterThanOrEqual(2);
    const playButton = page.getByRole("button", { name: "Play comparison", exact: true });
    if (await playButton.count()) await playButton.click();
    await presentPreview(1300);
    const pauseButton = page.getByRole("button", { name: "Pause comparison", exact: true });
    if (await pauseButton.count()) await pauseButton.click();
  }
  // Remove the reviewed cutaway so its selection controls cannot contaminate
  // the clean programme monitor during later caption/effect demonstrations.
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await page.locator(".panel-heading h4", { hasText: "Preview" }).click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId(/pro-broll-clip-/)).toHaveCount(0);
  // Move beyond the former cutaway before reviewing the programme's own effects.
  await seekProgramme(5.2);
  await page.getByRole("button", { name: "After", exact: true }).click();

  // SECTION 6 — reactions and replay.
  await toolRail.getByRole("button", { name: "Creator FX", exact: true }).click();
  await showSection("reactions");
  for (const demo of ["reaction_freeze", "reaction_punch", "reaction_montage", "instant_replay", "slow_replay"]) {
    await showDemo(demo, 650);
  }
  await workbench.getByRole("button", { name: /Resume programme/i }).click();

  // SECTION 7 — editable speaker introductions.
  await showSection("intros");
  await showDemo("speaker_intro", 600);
  await workbench.getByLabel("Speaker intro name").fill("THULANI TSHWELO");
  await workbench.getByLabel("Speaker intro role").fill("Founder · AutoPromote");
  for (const style of ["clean", "bold", "cinematic", "playful", "creator", "minimal"]) {
    await workbench.getByRole("button", { name: style, exact: true }).click();
    await page.waitForTimeout(220);
  }

  // SECTION 8 — contextual graphics, shapes, comparisons and rankings.
  await showSection("context");
  await workbench.getByLabel("Contextual graphic value").fill("R50,000");
  await workbench.getByLabel("Context graphic horizontal position").fill("78");
  await workbench.getByLabel("Context graphic vertical position").fill("72");
  for (const demo of ["contextual_logos", "contextual_number"]) {
    await showDemo(demo, 520);
  }
  await showDemo("contextual_screen", 520);
  const contextualScreenBox = await page.locator(".creator-ui-insert").boundingBox();
  const contextualFrameBox = await page.getByTestId("hook-preview-frame").boundingBox();
  expect(contextualScreenBox.x).toBeGreaterThan(
    contextualFrameBox.x + contextualFrameBox.width * 0.52
  );
  expect(contextualScreenBox.y).toBeGreaterThan(
    contextualFrameBox.y + contextualFrameBox.height * 0.38
  );
  for (const demo of ["arrow", "circle", "highlight", "comparison", "ranking"]) {
    await showDemo(demo, 520);
  }

  // SECTION 9 — free text, kinetic type, captions and quote cards.
  await showSection("text");
  await workbench.getByLabel("Creator effect text").fill("CREATORS USING AI WILL WIN");
  for (const demo of ["kinetic_text", "caption_emphasis", "quote"]) await showDemo(demo, 650);
  await workbench.getByTestId("creator-clear-preview").click();
  await expect(page.getByTestId("studio-creator-preview-layer")).toHaveCount(0);
  await toolRail.getByRole("button", { name: "Captions", exact: true }).click();
  const previewCaptions = inspector.getByRole("checkbox", { name: "Preview captions" });
  if (!(await previewCaptions.isChecked())) await previewCaptions.click();
  await page.getByTestId("generate-live-transcript").click();
  await expect(page.getByRole("textbox", { name: "Caption 1 text", exact: true })).toBeVisible();
  await seekProgramme(0.5);
  await expect(page.getByTestId("live-caption-preview")).toBeVisible({ timeout: 120000 });
  for (const style of ["Story Pop", "Bold Pop", "Karaoke", "Bounce", "Minimal", "Neon Glow"]) {
    await inspector.getByRole("button", { name: style, exact: true }).click();
    if (["Story Pop", "Karaoke", "Neon Glow"].includes(style)) await presentPreview(850);
    else await page.waitForTimeout(220);
  }
  await previewCaptions.click();
  await expect(page.getByTestId("live-caption-preview")).toHaveCount(0);

  // SECTION 10 — visible, honestly-labelled browser compositing proxies.
  await toolRail.getByRole("button", { name: "Creator FX", exact: true }).click();
  await showSection("composite");
  for (const demo of ["mask", "cutout", "background", "text_behind", "tracking", "censor"]) {
    await showDemo(demo, 560);
  }
  await showDemo("screen_replace", 560);
  const screenReplacementBox = await page.locator(".creator-screen-replacement").boundingBox();
  const screenReplacementFrameBox = await page.getByTestId("hook-preview-frame").boundingBox();
  expect(screenReplacementBox.x).toBeGreaterThan(
    screenReplacementFrameBox.x + screenReplacementFrameBox.width * 0.54
  );
  expect(screenReplacementBox.y).toBeGreaterThan(
    screenReplacementFrameBox.y + screenReplacementFrameBox.height * 0.44
  );
  for (const demo of ["cleanup", "clone", "parallax"]) {
    await showDemo(demo, 560);
  }

  // SECTION 11 — creator timing, motion and pattern interrupts.
  await showSection("effects");
  for (const demo of ["emoji", "meme", "micro_freeze", "shake", "stabilization", "transition"]) {
    await showDemo(demo, 560);
  }
  await workbench.getByLabel("Reaction emoji").fill("😂");
  await workbench.getByLabel("Creator effect intensity").fill("82");
  await workbench.getByRole("button", { name: "Apply smooth speed ramp" }).click();
  await programme.evaluate(video => video.play());
  await page.waitForTimeout(1700);
  await programme.evaluate(video => video.pause());

  // SECTION 12 — the moving brand mark uses the same timed path in preview/export.
  await workbench.getByTestId("creator-clear-preview").click();
  await toolRail.getByRole("button", { name: "Reframe", exact: true }).click();
  await inspector.getByTestId("reframe-aspect-16-9").click();
  await inspector.getByTestId("reframe-preserve-frame").click();
  await toolRail.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByTestId("watermark-path-status")).toContainText("preview = export");
  await seekProgramme(5.2);
  const initialWatermarkPosition = await page
    .getByTestId("brand-watermark-preview")
    .getAttribute("data-position");
  await page.getByRole("button", { name: "Play comparison", exact: true }).click();
  await page.getByTestId("preview-fullscreen-button").click();
  await expect(page.getByTestId("brand-watermark-preview")).not.toHaveAttribute(
    "data-position",
    initialWatermarkPosition,
    { timeout: 12000 }
  );
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page.getByRole("button", { name: "Pause comparison", exact: true }).click();

  // SECTION 13 — editable semantic suggestion and reusable style.
  await toolRail.getByRole("button", { name: "Creator FX", exact: true }).click();
  await showSection("assist");
  await showDemo("director", 1200, false);
  await expect(workbench.locator(".creator-director-receipt")).toContainText(
    "Reviewed transcript evidence"
  );
  await page.screenshot({
    path: path.join("proof", "viral-clip-studio", "frontend-feature-tour-final-frame.png"),
    fullPage: false,
  });

  expect(appState.renderStatusPolls).toBe(0);
  expect(appState.renderPayload).toBeNull();
  expect(pageErrors).toEqual([]);

  const recording = page.video();
  const proofPath = path.resolve(
    "proof",
    "viral-clip-studio",
    "viral-clip-studio-frontend-feature-tour.webm"
  );
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  const rawProofPath = path.join(
    os.tmpdir(),
    `viral-clip-studio-frontend-feature-tour-raw-${process.pid}.webm`
  );
  await page.close();
  await recording.saveAs(rawProofPath);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    studioProofStartSeconds.toFixed(3),
    "-i",
    rawProofPath,
    "-an",
    "-c:v",
    "libvpx",
    "-crf",
    "10",
    "-b:v",
    "4M",
    "-deadline",
    "realtime",
    "-cpu-used",
    "4",
    "-y",
    proofPath,
  ]);
  fs.unlinkSync(rawProofPath);
  await testInfo.attach("frontend-feature-tour", {
    path: proofPath,
    contentType: "video/webm",
  });
});
