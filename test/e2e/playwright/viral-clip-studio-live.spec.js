const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const getBase = () => process.env.E2E_BASE_URL || `http://localhost:${STATIC_PORT}`;
const liveSourcePath = path.join(os.tmpdir(), `autopromote-viral-studio-${process.pid}.mp4`);

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
  const requestedSource = process.env.VIRAL_STUDIO_E2E_SOURCE;
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

const installAppRoutes = async page => {
  const sourceBody = fs.readFileSync(liveSourcePath);
  const state = {
    captionTranslationRequests: [],
    renderPayload: null,
    renderStatusPolls: 0,
    silencePreviewRequests: 0,
  };
  await page.route("**/live-studio-source.mp4*", route =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: sourceBody })
  );
  await page.route("**/api/users/profile", route => route.fulfill(json(enabledEditingProfile)));
  await page.route("**/api/users/me", route =>
    route.fulfill(
      json({ user: { uid: "testUser", email: "test@local", name: "Studio Tester" } })
    )
  );
  await page.route("**/api/content/my-content**", route =>
    route.fulfill(json({ content: [] }))
  );
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
  await page.route("**/api/media/transcribe", async route => {
    const multipart = (await route.request().postDataBuffer())?.toString("utf8") || "";
    const translateToEnglish = /name="translate_to_english"[\s\S]*?true/.test(multipart);
    state.captionTranslationRequests.push(translateToEnglish);
    await route.fulfill(
      json({
        language_mode: translateToEnglish
          ? "translated_to_english"
          : "preserve_spoken_languages",
        segments: translateToEnglish
          ? [
              {
                start: 0.4,
                end: 2.8,
                text: "Welcome home, this story matters",
                speaker: "host",
                speakerLabel: "Host",
                language: "en",
                languages: ["en"],
                languageConfidence: 0.96,
              },
              {
                start: 3.1,
                end: 5.6,
                text: "We built it together",
                speaker: "guest",
                speakerLabel: "Guest",
                language: "en",
                languages: ["en"],
                languageConfidence: 0.94,
              },
            ]
          : [
              {
                start: 0.4,
                end: 2.8,
                text: "Molo, welcome ekhaya",
                speaker: "host",
                speakerLabel: "Host",
                language: "mixed",
                languages: ["xh", "en"],
                languageConfidence: 0.92,
              },
              {
                start: 3.1,
                end: 5.6,
                text: "Siyakha together, ngiyabonga",
                speaker: "guest",
                speakerLabel: "Guest",
                language: "mixed",
                languages: ["xh", "en", "zu"],
                languageConfidence: 0.88,
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

test.beforeAll(async () => {
  buildLiveSource();
  const staticReady = require("./static-server");
  await staticReady;
});

test.afterAll(() => {
  if (fs.existsSync(liveSourcePath)) fs.unlinkSync(liveSourcePath);
});

test("runs the production Viral Clip Studio feature workflow with real playable media", async ({
  page,
}) => {
  test.setTimeout(120000);
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
  await page.locator('nav li:has-text("Viral Clip Studio")').click();
  await expect(page.getByRole("heading", { name: "Viral Clip Studio" })).toBeVisible();

  await page
    .locator('.viral-studio-entry-panel input[type="file"]')
    .setInputFiles(liveSourcePath);
  const openStudio = page.getByRole("button", { name: "Open Clip Studio" });
  await expect(openStudio).toBeEnabled({ timeout: 30000 });
  await openStudio.click();

  await expect(page.locator(".viral-studio-overlay")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await expect(page.getByTestId("timeline-source-track")).toBeVisible();

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

  const toolRail = page.locator(".creative-tool-rail");
  const inspector = page.getByTestId("clip-studio-inspector");

  await toolRail.getByRole("button", { name: "Cut", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "Remove from time" }).fill("1");
  await inspector.getByRole("spinbutton", { name: "Remove to time" }).fill("2.5");
  await inspector.getByRole("button", { name: "Soft Dip" }).click();
  await inspector.getByTestId("remove-marked-range").click();
  await expect(page.getByTestId("timeline-applied-cut")).toBeVisible();
  await expect(page.getByTestId("timeline-output-time")).toContainText("0:10.5");
  await page.getByTestId("studio-undo-button").click();
  await expect(page.getByTestId("timeline-applied-cut")).toHaveCount(0);
  await page.getByTestId("studio-redo-button").click();
  await expect(page.getByTestId("timeline-applied-cut")).toBeVisible();

  await toolRail.getByRole("button", { name: "Moments", exact: true }).click();
  await expect(page.locator(".studio-header-status")).toContainText("HookOff");
  await page.getByRole("button", { name: "Motion Sculpture", exact: true }).click();
  await page
    .locator('[aria-label="Creative intensity"]')
    .getByRole("button", { name: "Unreal", exact: true })
    .click();
  await expect(page.locator(".studio-header-status")).toContainText("HookOff");
  await expect(page.getByTestId("creative-effect-live-layer")).toBeVisible();
  await expect(page.getByAltText("Motion Sculpture unreal visual target")).toBeVisible();
  await expect(page.getByTestId(/timeline-creative-block-/)).toBeVisible();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await expect
    .poll(async () => {
      const [afterTime, beforeTime] = await Promise.all([
        page.getByTestId("studio-after-video").evaluate(video => video.currentTime),
        page.getByLabel("Untouched source preview").evaluate(video => video.currentTime),
      ]);
      return Math.abs(afterTime - beforeTime);
    })
    .toBeLessThan(0.12);

  await page.getByRole("tab", { name: "Signature Lab" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "signature");
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
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-live-grade-tools.png"),
    fullPage: true,
  });
  await finishRack.getByRole("button", { name: "Off", exact: true }).click();
  await finishRack.getByRole("button", { name: /Pulse ring/i }).click();
  await expect(page.getByTestId("studio-audio-visualizer")).toBeVisible();
  await expect(page.getByTestId("studio-after-video")).toHaveCSS("filter", /brightness/);
  await expect(page.getByTestId("studio-after-video")).toHaveCSS(
    "clip-path",
    /inset\(2\.2% round 22px\)/
  );
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-live-signature.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Creator Studio" }).click();
  await expect(workspace).toHaveAttribute("data-workspace-mode", "creator");

  await toolRail.getByRole("button", { name: "Hook", exact: true }).click();
  const enableHook = inspector.getByRole("checkbox", { name: "Enable opening hook" });
  await expect(enableHook).not.toBeChecked();
  await inspector.getByRole("button", { name: "Zoom Focus", exact: true }).click();
  await expect(enableHook).toBeChecked();
  await enableHook.click();
  await expect(enableHook).not.toBeChecked();
  await expect(page.getByTestId("creative-effect-live-layer")).toBeVisible();

  await toolRail.getByRole("button", { name: "Captions", exact: true }).click();
  const translateToEnglish = inspector.getByRole("checkbox", {
    name: "Translate captions to English",
  });
  await expect(translateToEnglish).not.toBeChecked();
  await inspector.getByRole("checkbox", { name: "Preview captions" }).click();
  await expect(inspector.getByText(/spoken languages preserved automatically/i)).toBeVisible();
  await expect(inspector.getByRole("textbox", { name: "Caption 1 text" })).toHaveValue(
    /Molo, welcome ekhaya/i
  );
  await expect(inspector.getByRole("combobox", { name: "Caption 1 speaker" })).toHaveValue("host");
  await expect(inspector.getByRole("combobox", { name: "Caption 1 language" })).toHaveValue(
    "mixed"
  );
  await translateToEnglish.click();
  await expect(inspector.getByTestId("generate-live-transcript")).toContainText(
    "Generate speech captions"
  );
  await inspector.getByTestId("generate-live-transcript").click();
  await expect(inspector.getByText(/translated to English/i)).toBeVisible();
  await expect(inspector.getByRole("combobox", { name: "Caption 1 language" })).toHaveValue("en");
  await inspector.getByRole("textbox", { name: "Caption 1 text" }).fill(
    "Welcome home — this creator-reviewed story matters"
  );
  await inspector.getByRole("button", { name: "Neon Glow", exact: true }).click();
  await expect(page.getByTestId("live-caption-preview")).toHaveClass(/caption-style-glow/);

  await toolRail.getByRole("button", { name: "Pacing", exact: true }).click();
  await inspector.getByRole("button", { name: "1.5×", exact: true }).click();
  await inspector.getByRole("button", { name: "Energetic", exact: true }).click();
  await inspector.getByRole("checkbox", { name: "Remove dead air" }).click();
  await expect.poll(() => appState.silencePreviewRequests).toBeGreaterThan(0);

  await toolRail.getByRole("button", { name: "B-roll", exact: true }).click();
  await page.getByTestId("broll-video-input").setInputFiles(liveSourcePath);
  await expect(page.getByTestId(/timeline-broll-/)).toBeVisible();
  await inspector.getByRole("textbox", { name: "B-roll duration", exact: true }).fill("3.5");
  await inspector.getByRole("button", { name: "Picture-in-picture", exact: true }).click();
  await expect(inspector.getByRole("slider", { name: "Frame corner curve" })).toHaveValue("28");
  await inspector.getByRole("button", { name: /Apply B-roll/i }).click();
  const roundBrollPreview = page.getByTestId(/broll-preview-/);
  await expect(roundBrollPreview).toBeVisible();
  await expect(roundBrollPreview.locator("xpath=..")).toHaveClass(/frame-shape-round/);
  await expect(roundBrollPreview).toHaveCSS("border-radius", "28px");
  await expect(roundBrollPreview).toHaveCSS("object-fit", "cover");
  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-live-round-broll.png"),
    fullPage: true,
  });

  await toolRail.getByRole("button", { name: "Sound", exact: true }).click();
  await page.getByTestId("sound-effect-preset-whoosh").click();
  await expect(page.getByTestId("sound-effect-editor")).toBeVisible();
  await page.getByTestId("sound-effect-duration").fill("1.2");
  await page.getByTestId("sound-effect-volume").fill("62");
  await expect(page.getByTestId(/timeline-sfx-/)).toBeVisible();

  await page.getByRole("radio", { name: "TikTok", exact: true }).click();
  await page.getByRole("button", { name: "Render Final Clip", exact: true }).click();
  await expect(page.getByRole("button", { name: /Rendering Clip.*47%/i })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("rendered-output-ready")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("studio-after-video")).toHaveAttribute(
    "src",
    /live-studio-source\.mp4/
  );

  expect(appState.captionTranslationRequests).toEqual([false, true]);
  expect(appState.renderStatusPolls).toBeGreaterThanOrEqual(2);
  expect(appState.renderPayload).toBeTruthy();
  const viralData = appState.renderPayload.options.viralData;
  expect(viralData.export_destination).toBe("tiktok");
  expect(viralData.translate_captions_to_english).toBe(true);
  expect(viralData.caption_segments[0].text).toContain("creator-reviewed");
  expect(viralData.caption_segments[0]).toEqual(
    expect.objectContaining({
      speaker: "host",
      speaker_label: "Host",
      language: "en",
      languages: ["en"],
      review_required: false,
    })
  );
  expect(viralData.timeline_segments).toHaveLength(3);
  expect(viralData.timeline_segments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ start_time: 0, end_time: 1 }),
      expect.objectContaining({ start_time: 2.5, end_time: 6.4 }),
      expect.objectContaining({ start_time: 7.1, end_time: 12 }),
    ])
  );
  expect(
    viralData.timeline_segments.some(
      segment => Number(segment.start_time) < 7.1 && Number(segment.end_time) > 6.4
    )
  ).toBe(false);
  expect(viralData.creative_plan.effects[0]).toEqual(
    expect.objectContaining({ preset: "motion_sculpture", intensity: "unreal" })
  );
  expect(viralData.finish_plan).toEqual(
    expect.objectContaining({
      enabled: true,
      main_frame: expect.objectContaining({
        enabled: true,
        shape: "round",
        inset: 24,
        border_radius: 52,
      }),
      color: expect.objectContaining({ preset: "podcast_pro", contrast: 1.2 }),
      visualizer: expect.objectContaining({ enabled: true, mode: "ring" }),
      keyframes: expect.arrayContaining([
        expect.objectContaining({
          interpolation: "linear",
          values: expect.objectContaining({ brightness: 1.05, contrast: 1.2 }),
        }),
      ]),
      magnetic_beats: expect.objectContaining({ enabled: true }),
    })
  );
  expect(viralData.overlays).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        bRollMode: "pip",
        duration: 3.5,
        isLocal: false,
        frameShape: "round",
        borderRadius: 28,
        mediaFit: "cover",
      }),
    ])
  );
  expect(viralData.sound_effects).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Whoosh", volume: 0.62 })])
  );

  await page.screenshot({
    path: path.join("test-results", "viral-clip-studio-live-complete.png"),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});
