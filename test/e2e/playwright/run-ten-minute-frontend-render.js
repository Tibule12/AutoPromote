const { chromium } = require("@playwright/test");
const { execFileSync, spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const sourcePath =
  process.env.TEN_MINUTE_SOURCE ||
  path.join(repoRoot, "proof/viral-clip-studio/ten-minute-director/unmuted-podcast-10m-source.mp4");
const proofDir = process.env.TEN_MINUTE_PROOF_DIR ||
  path.join(repoRoot, "proof/viral-clip-studio/ten-minute-director");
const payloadPath = "/tmp/autopromote-10m-cloud-payload.json";
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5000";
const liveRender = process.env.FRONTEND_RENDER_LIVE === "1";
const documentStudioEdit = process.env.DOCUMENT_STUDIO_EDIT === "1";
const documentTimelineClean = process.env.DOCUMENT_TIMELINE_CLEAN === "1";
const verifyStudioButtons = process.env.VERIFY_STUDIO_BUTTONS === "1";
const verifyFrameGeometryOnly = process.env.VERIFY_FRAME_GEOMETRY_ONLY === "1";
const uploadReferencePath = "/tmp/autopromote-10m-upload-reference.mp4";
let activeContext = null;
let activePage = null;
let activeVideo = null;
let activeUnifiedCapture = null;

const startUnifiedStudioCapture = (output, windowId = null) => {
  const display = process.env.DISPLAY || ":1";
  const source = process.env.STUDIO_AUDIO_CAPTURE_SOURCE ||
    "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor";
  const x11Input = ["-f", "x11grab", "-framerate", "30"];
  if (windowId) {
    x11Input.push("-window_id", String(windowId));
  } else {
    x11Input.push(
      "-video_size", process.env.STUDIO_CAPTURE_SIZE || "1920x1080",
      "-draw_mouse", "1"
    );
  }
  x11Input.push("-i", `${display}.0`);
  const processHandle = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-thread_queue_size", "1024", "-use_wallclock_as_timestamps", "1",
    ...x11Input,
    "-thread_queue_size", "1024", "-use_wallclock_as_timestamps", "1",
    "-f", "pulse", "-i", source,
    "-map", "0:v:0", "-map", "1:a:0",
    "-vf", "setpts=PTS-STARTPTS", "-af", "aresample=async=1:first_pts=0",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", output,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  processHandle.captureOutput = output;
  processHandle.captureErrors = "";
  processHandle.stderr.on("data", chunk => {
    processHandle.captureErrors += String(chunk || "");
  });
  return processHandle;
};

const stopUnifiedStudioCapture = processHandle => new Promise(resolve => {
  if (!processHandle || processHandle.exitCode !== null) return resolve();
  const timer = setTimeout(() => processHandle.kill("SIGTERM"), 5000);
  processHandle.once("exit", () => {
    clearTimeout(timer);
    resolve();
  });
  processHandle.stdin.write("q");
});

const loadSourceUrl = () => {
  const explicit = String(process.env.AUTOPROMOTE_QA_SOURCE_URL || "").trim();
  if (explicit) return explicit;
  if (!fs.existsSync(payloadPath)) {
    throw new Error("AUTOPROMOTE_QA_SOURCE_URL is required for the frontend render proof");
  }
  return String(JSON.parse(fs.readFileSync(payloadPath, "utf8")).video_url || "").trim();
};

const buildPayload = sourceUrl => {
  const generator = path.join(repoRoot, "scripts/ten-minute-podcast-payload.py");
  execFileSync("python3", [generator, payloadPath], {
    cwd: repoRoot,
    env: { ...process.env, AUTOPROMOTE_QA_SOURCE_URL: sourceUrl },
    stdio: "pipe",
  });
  return JSON.parse(fs.readFileSync(payloadPath, "utf8"));
};

const applyDetectedPodcastPlan = (payload, analysis) => {
  if (!analysis?.editPlan || !analysis?.tracks?.solo?.keyframes?.length) return payload;
  const next = JSON.parse(JSON.stringify(payload));
  const suggestions = (analysis.editPlan.splitSuggestions || []).filter(
    suggestion => suggestion.reason === "two_clean_foreground_faces"
  );
  const cuts = [...(analysis.editPlan.timelineCuts || [])];
  suggestions.forEach(suggestion => {
    const activeShot = [...(analysis.editPlan.timelineCuts || [])]
      .filter(cut => Number(cut.time) <= Number(suggestion.end) + 1e-6)
      .sort((left, right) => Number(right.time) - Number(left.time))[0];
    cuts.push(
      { time: suggestion.start, mode: "center", zoom: 1 },
      { time: suggestion.end, mode: "speaker_track", zoom: Number(activeShot?.zoom || 1) }
    );
  });
  const first = suggestions[0];
  next.finish_plan.reframe = {
    aspect: "9:16",
    zoom: 1,
    keyframes: analysis.tracks.solo.keyframes,
    timeline_cuts: [...new Map(cuts.map(cut => [Number(cut.time), cut])).values()]
      .sort((left, right) => Number(left.time) - Number(right.time)),
    speaker_order_cuts: suggestions.map((suggestion, index) => ({
      time: suggestion.start,
      slot: index % 2 ? "bottom" : "top",
    })),
    ...(first ? { split_source: {
      divider_percent: 50,
      rounded_cards: true,
      card_inset_percent: 2.5,
      card_gap_percent: 2.5,
      card_radius_percent: 8,
      top: {
        ...first.top,
        keyframes: suggestions.map(suggestion => ({
          time: suggestion.start, x: suggestion.top.x, y: suggestion.top.y,
          source_visible_top_percent: Number(suggestion.top.source_visible_top_percent || 0),
          source_visible_bottom_percent: Number(suggestion.top.source_visible_bottom_percent || 0),
          cut: true,
        })),
      },
      bottom: {
        ...first.bottom,
        keyframes: suggestions.map(suggestion => ({
          time: suggestion.start, x: suggestion.bottom.x, y: suggestion.bottom.y,
          source_visible_top_percent: Number(suggestion.bottom.source_visible_top_percent || 0),
          source_visible_bottom_percent: Number(suggestion.bottom.source_visible_bottom_percent || 0),
          cut: true,
        })),
        source_time_offset_keyframes: suggestions.map(suggestion => ({
          time: suggestion.start,
          offset_seconds: Number(suggestion.bottom.sourceTimeOffsetSeconds || 0),
        })),
      },
    } } : {}),
  };
  next.finish_plan.main_frame = {
    enabled: true, shape: "round", inset_percent: 2.5,
    border_radius_percent: 10, background: "studio_black",
  };
  return next;
};

const defaultTrackStates = Object.fromEntries(
  ["video", "adjustment", "graphics", "broll", "captions", "originalAudio", "voiceover", "music", "sfx"].map(
    id => [id, { visible: true, locked: false, muted: false, solo: false }]
  )
);

const buildSnapshot = payload => {
  const clip = {
    id: "real-podcast-10m",
    title: "Unmuted podcast — 10 minute caption, grade and Director-split proof",
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
    // Speaker-tracked 9:16 is a reviewed cover crop. Enabling safe-face
    // containment here letterboxes the frontend while the worker exports the
    // reviewed crop, which makes the proof preview dishonest.
    safeFaceFraming: false,
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
      dividerPercent: Number(reframe.split_source?.divider_percent || 50),
      roundedCards: reframe.split_source?.rounded_cards !== false,
      cardInsetPercent: Number(reframe.split_source?.card_inset_percent || 2.5),
      gapPercent: 1.2,
      cardGapPercent: Number(reframe.split_source?.card_gap_percent || 2.5),
      cardRadiusPercent: Number(reframe.split_source?.card_radius_percent || 8),
      top: reframe.split_source?.top || { x: 30, y: 50, zoom: 1, keyframes: [] },
      bottom: reframe.split_source?.bottom || { x: 70, y: 50, zoom: 1, keyframes: [] },
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
    mainFrame: {
      enabled: payload.finish_plan.main_frame?.enabled === true,
      insetPercent: Number(payload.finish_plan.main_frame?.inset_percent || 0),
      radiusPercent: Number(payload.finish_plan.main_frame?.border_radius_percent || 0),
      background: payload.finish_plan.main_frame?.background || "studio_black",
    },
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
  const captionAt = seconds => (viral.caption_segments || []).find(
    caption => Number(caption.start_time) < seconds && Number(caption.end_time) > seconds
  );
  const splitBottom = viral.finish_plan?.reframe?.split_source?.bottom || {};
  const framingKeys = viral.finish_plan?.reframe?.keyframes || [];
  const checks = {
    renderViral: body.options.renderViral === true,
    duration600: Number(viral.end_time) === 600,
    captions200: viral.caption_segments?.length === 200,
    captionReviewCopy: viral.caption_review_copy === true,
    portrait916: viral.finish_plan?.reframe?.aspect === "9:16",
    roundedMainFrame:
      viral.finish_plan?.main_frame?.enabled === true &&
      Number(viral.finish_plan?.main_frame?.inset_percent) >= 2 &&
      Number(viral.finish_plan?.main_frame?.border_radius_percent) >= 5,
    framingKeysShotAware: viral.finish_plan?.reframe?.keyframes?.length >= 200,
    directorCutsFollowSourceEdit: viral.finish_plan?.reframe?.timeline_cuts?.length > 20,
    pictureFillRecordedPerShot:
      viral.finish_plan?.reframe?.timeline_cuts?.filter(cut => cut.mode === "speaker_track")?.length >= 226 &&
      viral.finish_plan?.reframe?.timeline_cuts?.filter(cut => Number(cut.zoom) >= 1.13)?.length >= 200,
    roundedSpeakerSplit:
      viral.finish_plan?.reframe?.split_source?.rounded_cards === true &&
      Number(viral.finish_plan?.reframe?.split_source?.card_radius_percent) >= 6 &&
      Number(viral.finish_plan?.reframe?.split_source?.card_gap_percent) <= 3 &&
      (viral.finish_plan?.reframe?.timeline_cuts || []).some(cut => cut.mode === "center"),
    activeSpeakerCaptions:
      Number(captionAt(176.5)?.caption_y) === 40 &&
      Number(captionAt(210.5)?.caption_y) === 91,
    directorUsesCleanFullFrameAlternate:
      !splitBottom.source_rect &&
      splitBottom.source_time_offset_keyframes?.length === 2,
    reviewedBadCropCuts:
      framingKeys.some(key => Math.abs(Number(key.time) - 255.019) < 0.04 && Number(key.x) > 50) &&
      framingKeys.some(key => Math.abs(Number(key.time) - 305.019) < 0.04 && Number(key.x) > 50) &&
      framingKeys.some(key => Math.abs(Number(key.time) - 546.536) < 0.04 && Number(key.x) === 0),
    adjustmentLayer: viral.finish_plan?.adjustment_layers?.length === 1,
    precisionGrade: viral.finish_plan?.color?.precisionGrade === true,
    professionalCleanupOff: viral.professional_cleanup === false,
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
            name: "10m Podcast · Captions + Director Splits + Grade",
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
  let canonicalPayload = buildPayload(sourceUrl);
  const detectedPlanPath = process.env.PODCAST_ANALYSIS_PLAN || "";
  if (detectedPlanPath && fs.existsSync(detectedPlanPath)) {
    canonicalPayload = applyDetectedPodcastPlan(
      canonicalPayload,
      JSON.parse(fs.readFileSync(detectedPlanPath, "utf8"))
    );
  }
  const snapshot = buildSnapshot(canonicalPayload);
  let submittedBody = null;
  let submittedUrl = null;
  let payloadChecks = null;
  let studioTourChecks = null;
  const pageErrors = [];
  const apiFailures = [];

  const headful = process.env.PW_HEADFUL === "1";
  const documentCapture = documentStudioEdit || documentTimelineClean;
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headful,
    viewport: headful && documentCapture ? null : { width: 1440, height: 900 },
    recordVideo: documentCapture
      ? undefined
      : { dir: proofDir, size: { width: 1440, height: 900 } },
    args: headful
      ? ["--ozone-platform=x11", "--start-maximized", "--window-position=0,0", "--window-size=1920,1080"]
      : ["--disable-gpu"],
  });
  const page = context.pages()[0] || (await context.newPage());
  const video = page.video();
  activeContext = context;
  activePage = page;
  activeVideo = video;
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
  await savedProjects.getByText("10m Podcast · Captions + Director Splits + Grade", { exact: true }).click();

  const seekOutputTimeline = async (seconds, expectedSourceSeconds = seconds) => {
    const visibleTimelineRuler = page
      .getByTestId("studio-pro-timeline")
      .locator(".pro-time-ruler");
    const bounds = await visibleTimelineRuler.boundingBox();
    if (!bounds) throw new Error("Professional timeline ruler is not measurable");
    await visibleTimelineRuler.click({
      position: {
        x: Math.max(1, Math.min(bounds.width - 1, (Number(seconds) / 600) * bounds.width)),
        y: bounds.height / 2,
      },
    });
    await page.waitForFunction(
      target => Math.abs(Number(document.querySelector('[data-testid="studio-after-video"]')?.currentTime || 0) - target) < 0.75,
      Number(expectedSourceSeconds),
      { timeout: 30000 }
    );
    await page.locator(".after-preview-loading").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(250);
  };
  const documentationPause = async (milliseconds = 1800) => {
    if (documentStudioEdit) await page.waitForTimeout(milliseconds);
  };

  // Capture both source picture geometries through the actual After monitor.
  // These are the shots that looked like two different rounded frames in the
  // previous ten minute proof.
  if (verifyFrameGeometryOnly) {
    await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
  }
  const previewFrameGeometry = [];
  for (const [seconds, label] of [[31.15, "padded-shot"], [63.65, "full-shot"]]) {
    await seekOutputTimeline(seconds);
    if (verifyFrameGeometryOnly) {
      const slider = page.getByLabel("Picture fill for this camera shot");
      const fill = Number(await slider.inputValue());
      if (Math.abs(fill - (label === "padded-shot" ? 1.14 : 1)) > 0.01) {
        throw new Error(`Studio picture fill slider is wrong at ${seconds}s: ${fill}`);
      }
      if (label === "padded-shot") {
        await slider.focus();
        await slider.press("ArrowRight");
        if (Number(await slider.inputValue()) <= fill) {
          throw new Error("Picture fill edit did not update the active camera shot");
        }
        await slider.press("ArrowLeft");
        if (Math.abs(Number(await slider.inputValue()) - fill) > 0.001) {
          throw new Error("Picture fill edit did not restore the original camera shot");
        }
      }
    }
    const previewFrame = page.getByTestId("hook-preview-frame");
    await previewFrame.screenshot({
      path: path.join(proofDir, `frontend-rounded-${label}.png`),
    });
    previewFrameGeometry.push(await previewFrame.evaluate((frame, shot) => ({
      shot,
      radius: getComputedStyle(frame).borderTopLeftRadius,
      inset: getComputedStyle(frame).getPropertyValue("--main-frame-inset"),
    }), label));
  }
  if (verifyFrameGeometryOnly) {
    for (const [seconds, label] of [[176.5, "split-first"], [210.5, "split-reversed"]]) {
      await seekOutputTimeline(seconds);
      await page.waitForTimeout(450);
      await page.getByTestId("hook-preview-frame").screenshot({
        path: path.join(proofDir, `frontend-rounded-${label}.png`),
      });
    }
    for (const [seconds, label] of [[53.74, "host-leans"], [437.4, "guest-moves"], [547.4, "laugh-cut"]]) {
      await seekOutputTimeline(seconds);
      await page.getByTestId("hook-preview-frame").screenshot({
        path: path.join(proofDir, `frontend-rounded-${label}.png`),
      });
    }
    if (previewFrameGeometry.some(frame => frame.radius !== previewFrameGeometry[0].radius ||
      frame.inset !== previewFrameGeometry[0].inset || parseFloat(frame.radius) <= 0)) {
      throw new Error(`Studio preview frame changed shape between shots: ${JSON.stringify(previewFrameGeometry)}`);
    }
    fs.writeFileSync(path.join(proofDir, "frontend-picture-fill-receipt.json"), JSON.stringify({
      previewFrameGeometry,
      speakerShots: snapshot.reframeModeCuts.filter(cut => cut.mode === "speaker_track").length,
      correctedShots: snapshot.reframeModeCuts.filter(cut => Number(cut.zoom) >= 1.13).length,
      framingPoints: snapshot.reframeKeyframes.length,
      motionPointsWithinShots: snapshot.reframeKeyframes.filter(cut => cut.cut === false).length,
      paidRenderStarted: false,
    }, null, 2));
    await context.close();
    activeContext = null;
    console.log(JSON.stringify({ mode: "studio-picture-fill-preview", previewFrameGeometry }, null, 2));
    return;
  }

  console.log("[frontend-proof] capturing captions, Director splits and grade controls");
  if (verifyStudioButtons) {
    await page.getByRole("button", { name: /^Close media/ }).click();
    await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
    await seekOutputTimeline(168);
    const programme = page.getByTestId("studio-after-video");
    const loadingPreview = page.locator(".after-preview-loading");
    const assertPlaying = async label => {
      const before = await programme.evaluate(video => Number(video.currentTime || 0));
      await page.waitForTimeout(450);
      const state = await programme.evaluate(video => ({
        currentTime: Number(video.currentTime || 0), paused: video.paused,
        muted: video.muted, volume: Number(video.volume || 0),
      }));
      if (state.paused || state.currentTime <= before + 0.15 || state.muted || state.volume < 0.05) {
        throw new Error(`${label} broke monitored playback: ${JSON.stringify({ before, state })}`);
      }
      if (await loadingPreview.isVisible()) throw new Error(`${label} exposed the blocking preview loader`);
    };
    const exerciseToggle = async (testId, firstState, secondState, label) => {
      const button = page.getByTestId(testId);
      await button.click();
      if (await button.getAttribute("aria-pressed") !== firstState) throw new Error(`${label} failed first state`);
      await assertPlaying(`${label} first state`);
      await button.click();
      if (await button.getAttribute("aria-pressed") !== secondState) throw new Error(`${label} failed return state`);
      await assertPlaying(`${label} return state`);
    };
    await page.getByRole("button", { name: "Play comparison", exact: true }).click();
    await assertPlaying("Play comparison");
    for (const mode of ["Before", "After", "Compare", "After"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await assertPlaying(`${mode} comparison mode`);
    }
    await page.getByTestId("preview-quick-both-cams").click();
    const reviewedTopZoom = await page.getByLabel("top split zoom").inputValue();
    await assertPlaying("Show Everyone");
    await page.getByTestId("preview-quick-track-speaker").click();
    await assertPlaying("Solo Speaker");
    await page.getByTestId("preview-quick-both-cams").click();
    if (await page.getByLabel("top split zoom").inputValue() !== reviewedTopZoom) {
      throw new Error("Show Everyone reset the reviewed panel crop");
    }
    await page.getByTestId("preview-quick-track-speaker").click();
    await exerciseToggle("preview-dock-toggle-btn", "true", "false", "Canvas dock");
    await exerciseToggle("preview-media-toggle", "true", "false", "Media rail");
    await page.getByTestId("preview-fit-full").click();
    await assertPlaying("Fit full");
    await page.screenshot({ path: path.join(proofDir, "frontend-after-fit-full-rounded.png") });
    const frameRadiusAfterFit = await page.getByTestId("hook-preview-frame").evaluate(frame =>
      parseFloat(getComputedStyle(frame).borderTopLeftRadius)
    );
    await page.getByTestId("preview-fill-canvas").click();
    await assertPlaying("Fill canvas");
    await page.screenshot({ path: path.join(proofDir, "frontend-after-fill-canvas-rounded.png") });
    const frameRadiusAfterFill = await page.getByTestId("hook-preview-frame").evaluate(frame =>
      parseFloat(getComputedStyle(frame).borderTopLeftRadius)
    );
    if (!(frameRadiusAfterFit > 0 && frameRadiusAfterFill > 0)) {
      throw new Error(`Rounded frame was lost: fit=${frameRadiusAfterFit}, fill=${frameRadiusAfterFill}`);
    }
    if (await page.getByTestId("main-footage-frame-toggle").getAttribute("data-rounded-locked") !== "true") {
      throw new Error("Rounded frame lock is missing");
    }
    await page.getByTestId("preview-fullscreen-button").click();
    await assertPlaying("Fullscreen");
    await page.getByRole("button", { name: "Exit preview", exact: true }).click();
    await exerciseToggle("preview-safe-zones", "true", "false", "Safe zones");
    await exerciseToggle("preview-grid", "true", "false", "Grid");
    await page.getByTestId("preview-tools").click();
    await page.getByRole("dialog", { name: "Find an editing tool" }).waitFor({ state: "visible" });
    await assertPlaying("Tools palette");
    await page.getByRole("dialog", { name: "Find an editing tool" }).getByRole("button", { name: "Esc" }).click();
    await exerciseToggle("preview-timeline-toggle", "false", "true", "Timeline");
    const buttonReceipt = {
      passed: true,
      playbackContinuous: true,
      sourceMonitoringEnabled: true,
      blockingLoaderHidden: true,
      comparisonModes: true,
      showEveryonePreservesReviewedCrop: true,
      roundedFrameAfterFitFull: frameRadiusAfterFit > 0,
      roundedFrameAfterFillCanvas: frameRadiusAfterFill > 0,
      dock: true, media: true, fullscreen: true, safeZones: true, grid: true, tools: true, timeline: true,
    };
    fs.writeFileSync(
      path.join(proofDir, "frontend-studio-button-audit.json"),
      JSON.stringify(buttonReceipt, null, 2)
    );
    await context.close();
    activeContext = null;
    console.log(JSON.stringify({ mode: "studio-button-audit", ...buttonReceipt }, null, 2));
    return;
  }
  if (documentTimelineClean) {
    await page.getByRole("button", { name: /^Close media/ }).click();
    await page.locator(".creative-tool-rail").getByRole("button", { name: "Cut", exact: true }).click();
    await seekOutputTimeline(168.0);
    await page.getByTestId("pro-track-row-video").scrollIntoViewIfNeeded();
    const rawCapture = path.join(proofDir, "frontend-studio-showcase-v2-timeline-clean-unified-raw.mp4");
    await page.evaluate(() => { document.title = "AutoPromote Studio Proof Capture"; });
    await page.waitForTimeout(250);
    const windowTree = spawnSync("xwininfo", ["-root", "-tree"], { encoding: "utf8" });
    const captureWindowId = /\s(0x[0-9a-f]+)\s+"AutoPromote Studio Proof Capture[^"]*"/i
      .exec(windowTree.stdout || "")?.[1];
    if (!captureWindowId) {
      const visibleCandidates = String(windowTree.stdout || "").split("\n")
        .filter(line => /chromium|autopromote|proof capture/i.test(line)).slice(0, 20).join(" | ");
      throw new Error(`Could not identify the Studio browser window for recording: ${visibleCandidates}`);
    }
    activeUnifiedCapture = startUnifiedStudioCapture(rawCapture, captureWindowId);
    await page.waitForTimeout(900);
    if (activeUnifiedCapture.exitCode !== null) {
      throw new Error(`Unified screen capture could not start: ${activeUnifiedCapture.captureErrors}`);
    }

    const programme = page.getByTestId("studio-after-video");
    await page.getByRole("button", { name: "Play comparison", exact: true }).click();
    const playbackStart = await programme.evaluate(video => ({
      currentTime: Number(video.currentTime || 0),
      muted: video.muted,
      volume: Number(video.volume || 0),
    }));
    await page.waitForTimeout(1800);
    const playbackEnd = await programme.evaluate(video => ({
      currentTime: Number(video.currentTime || 0),
      paused: video.paused,
      muted: video.muted,
      volume: Number(video.volume || 0),
    }));
    if (playbackEnd.paused || playbackEnd.currentTime <= playbackStart.currentTime + 0.8) {
      throw new Error("Timeline-clean recording did not start live source playback");
    }
    if (playbackEnd.muted || playbackEnd.volume < 0.05) {
      throw new Error("Timeline-clean recording source audio is muted");
    }
    await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
    await seekOutputTimeline(168.0);
    await page.getByTestId("inspector-cut-split").click();
    await page.waitForTimeout(1400);
    await seekOutputTimeline(174.0);
    await page.getByTestId("inspector-cut-split").click();
    await page.waitForTimeout(1400);
    const splitClipCount = await page.locator('[data-testid^="pro-video-clip-"]').count();
    if (splitClipCount !== 3) {
      throw new Error(`Expected three clips after two splits, found ${splitClipCount}`);
    }
    await page.getByTestId("pro-video-clip-2").click();
    await page.waitForTimeout(900);
    await page.getByTestId("inspector-cut-delete").click();
    await page.waitForTimeout(1800);
    const cleanedClipCount = await page.locator('[data-testid^="pro-video-clip-"]').count();
    if (cleanedClipCount !== 2) {
      throw new Error(`Expected the unwanted middle clip to be removed, found ${cleanedClipCount} clips`);
    }
    await page.getByRole("button", { name: "Play comparison", exact: true }).click();
    const splitAngleSamples = [];
    let sampledSplit = false;
    for (let sample = 0; sample < 10; sample += 1) {
      await page.waitForTimeout(320);
      const state = await page.evaluate(() => {
        const programme = document.querySelector('[data-testid="studio-after-video"]');
        const alternate = document.querySelector('[data-testid="source-split-alternate-video"]');
        return {
          programmeTime: Number(programme?.currentTime || 0),
          programmePlaybackRate: Number(programme?.playbackRate || 0),
          alternateTime: Number(alternate?.currentTime || 0),
          alternateReadyState: alternate?.readyState || 0,
          alternatePaused: alternate?.paused ?? true,
        };
      });
      splitAngleSamples.push(state);
      sampledSplit ||= state.programmeTime >= 176.0 && state.programmeTime < 177.0;
    }
    const cleanedDurationLabel = await page.getByTestId("timeline-output-time").innerText();
    await stopUnifiedStudioCapture(activeUnifiedCapture);
    const captureErrors = activeUnifiedCapture.captureErrors;
    activeUnifiedCapture = null;
    if (!fs.existsSync(rawCapture) || fs.statSync(rawCapture).size < 100000) {
      throw new Error(`Unified timeline recording was not created: ${captureErrors}`);
    }
    if (!(await programme.evaluate(video => video.paused))) {
      await page.getByRole("button", { name: "Pause comparison", exact: true }).click();
    }
    await programme.evaluate(video => {
      video.pause();
      video.currentTime = 176.4;
    });
    await page.waitForTimeout(900);
    let splitMediaState = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      splitMediaState = await page.evaluate(() => {
        const programme = document.querySelector('[data-testid="studio-after-video"]');
        const alternate = document.querySelector('[data-testid="source-split-alternate-video"]');
        return {
          programmeTime: Number(programme?.currentTime || 0),
          alternateTime: Number(alternate?.currentTime || 0),
          alternateReadyState: Number(alternate?.readyState || 0),
        };
      });
      if (
        splitMediaState.alternateReadyState >= 2 &&
        Math.abs(splitMediaState.alternateTime - (splitMediaState.programmeTime + 6.75)) <= 0.4
      ) break;
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(160);
    const splitVisualCheck = await page.getByTestId("studio-program-canvas").evaluate(canvas => {
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 108;
      sampleCanvas.height = 192;
      const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
      const x = Math.round(sampleCanvas.width * 0.08);
      const y = Math.round(sampleCanvas.height * 0.55);
      const width = Math.round(sampleCanvas.width * 0.84);
      const height = Math.round(sampleCanvas.height * 0.37);
      const pixels = context.getImageData(x, y, width, height).data;
      let luminanceTotal = 0;
      let darkPixels = 0;
      const pixelCount = pixels.length / 4;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
        luminanceTotal += luminance;
        if (luminance < 8) darkPixels += 1;
      }
      return {
        meanLuminance: luminanceTotal / pixelCount,
        darkPixelRatio: darkPixels / pixelCount,
      };
    });
    if (splitVisualCheck.meanLuminance < 20 || splitVisualCheck.darkPixelRatio > 0.82) {
      throw new Error(`Director split contains a blank speaker card: ${JSON.stringify(splitVisualCheck)}`);
    }
    await page.getByTestId("studio-program-canvas").screenshot({
      path: path.join(proofDir, "frontend-studio-showcase-v2-live-split.png"),
    });
    await page.screenshot({ path: path.join(proofDir, "frontend-studio-showcase-v2-timeline-clean-final.png") });
    await context.close();
    activeContext = null;

    const landscapeOutput = path.join(proofDir, "frontend-studio-showcase-v2-social-landscape.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", rawCapture,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x050914",
      "-map", "0:v:0", "-map", "0:a:0",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", landscapeOutput,
    ]);
    const verticalOutput = path.join(proofDir, "frontend-studio-showcase-v2-social-vertical.mp4");
    const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const capturedSeconds = Number(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", rawCapture,
    ], { encoding: "utf8" }).trim());
    const verticalFilter = [
      `color=c=0x050914:s=1080x1920:r=30:d=${capturedSeconds.toFixed(3)}[base]`,
      "[0:v]split=4[workspace][preview][controls][timeline]",
      "[workspace]scale=1040:585[studio]",
      "[preview]crop=380:655:695:145,scale=420:724[p]",
      "[controls]crop=390:525:1510:310,scale=500:675[c]",
      "[timeline]crop=1000:205:450:825,scale=1040:213[t]",
      "[base][studio]overlay=20:247[b1]",
      "[b1][p]overlay=35:883[b2]",
      "[b2][c]overlay=540:883[b3]",
      "[b3][t]overlay=20:1663[stage]",
      `[stage]drawtext=fontfile=${font}:text='AutoPromote':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=35,drawtext=fontfile=${font}:text='VIRAL CLIP STUDIO':fontcolor=0x9ff7de:fontsize=54:x=(w-text_w)/2:y=82,drawtext=fontfile=${font}:text='1  Play and locate the cut':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=179:enable='between(t,0,9)',drawtext=fontfile=${font}:text='2  Split at both ends':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=179:enable='between(t,9,19)',drawtext=fontfile=${font}:text='3  Delete the unwanted clip':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=179:enable='between(t,19,22)',drawtext=fontfile=${font}:text='4  Preview the joined timeline':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=179:enable='gte(t,22)',drawtext=fontfile=${font}:text='THE STUDIO WORKSPACE':fontcolor=0x9ff7de:fontsize=23:x=23:y=222,drawtext=fontfile=${font}:text='LIVE PREVIEW':fontcolor=white:fontsize=23:x=35:y=850,drawtext=fontfile=${font}:text='CUT CONTROLS':fontcolor=white:fontsize=23:x=540:y=850,drawtext=fontfile=${font}:text='EDITED TIMELINE':fontcolor=0x9ff7de:fontsize=25:x=28:y=1622[vout]`,
    ].join(";");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", landscapeOutput,
      "-filter_complex", verticalFilter,
      "-map", "[vout]", "-map", "0:a:0",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-t", capturedSeconds.toFixed(3),
      "-movflags", "+faststart", "-y", verticalOutput,
    ]);
    const streamProbe = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,start_time,duration",
      "-of", "json", landscapeOutput,
    ], { encoding: "utf8" }));
    const videoStream = streamProbe.streams?.find(stream => stream.codec_type === "video");
    const audioStream = streamProbe.streams?.find(stream => stream.codec_type === "audio");
    const recordedVolume = spawnSync("ffmpeg", [
      "-hide_banner", "-i", landscapeOutput, "-af", "volumedetect", "-f", "null", "-",
    ], { encoding: "utf8" });
    const volumeReport = `${recordedVolume.stdout || ""}\n${recordedVolume.stderr || ""}`;
    const recordedAudioMaxDb = Number(/max_volume:\s*(-?[0-9.]+) dB/.exec(volumeReport)?.[1]);
    if (!Number.isFinite(recordedAudioMaxDb) || recordedAudioMaxDb < -45) {
      throw new Error(`Timeline-clean social recording is silent (${recordedAudioMaxDb} dB)`);
    }
    const receipt = {
      mode: "studio-showcase-timeline-clean-social-demo",
      passed: true,
      sourcePlaybackAdvanced: playbackEnd.currentTime > playbackStart.currentTime + 0.8,
      sourceAudioEnabled: !playbackEnd.muted && playbackEnd.volume >= 0.05,
      splitClipCount,
      cleanedClipCount,
      removedMiddleSeconds: 6,
      cleanedDurationLabel,
      sharedCaptureClock: Number(videoStream?.start_time || 0) === Number(audioStream?.start_time || 0),
      videoStartTime: Number(videoStream?.start_time || 0),
      audioStartTime: Number(audioStream?.start_time || 0),
      recordedAudioMaxDb,
      splitAngleSamples,
      sampledSplit,
      splitMediaState,
      splitVisualCheck,
      duration: Number(streamProbe.format?.duration || 0),
      landscapeOutput,
      verticalOutput,
    };
    fs.writeFileSync(
      path.join(proofDir, "frontend-studio-showcase-v2-social-receipt.json"),
      JSON.stringify(receipt, null, 2)
    );
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  if (documentStudioEdit) {
    await page.getByRole("button", { name: /^Close media/ }).click();
    await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
    await seekOutputTimeline(168.0);
    const unifiedTourRaw = path.join(proofDir, "frontend-studio-live-edit-tour-unified-raw.mp4");
    activeUnifiedCapture = startUnifiedStudioCapture(unifiedTourRaw);
    await page.waitForTimeout(900);
    if (activeUnifiedCapture.exitCode !== null) {
      throw new Error(`Unified Studio tour capture could not start: ${activeUnifiedCapture.captureErrors}`);
    }
    const studioTourStartedAt = Date.now();
    const programme = page.getByTestId("studio-after-video");
    const loadingPreview = page.locator(".after-preview-loading");
    const playerState = () => programme.evaluate(video => ({
      currentTime: Number(video.currentTime || 0),
      paused: video.paused,
      muted: video.muted,
      volume: Number(video.volume || 0),
      readyState: video.readyState,
    }));
    const verifyContinuousPlayback = async label => {
      const before = await playerState();
      await page.waitForTimeout(900);
      const after = await playerState();
      if (after.paused || after.currentTime <= before.currentTime + 0.35) {
        throw new Error(`${label} interrupted playback: ${JSON.stringify({ before, after })}`);
      }
      if (after.muted || after.volume < 0.05) {
        throw new Error(`${label} disabled audible source monitoring: ${JSON.stringify(after)}`);
      }
      if (await loadingPreview.isVisible()) {
        throw new Error(`${label} exposed the blocking edited-preview loader during playback`);
      }
      return after;
    };

    await page.getByRole("button", { name: "Play comparison", exact: true }).click();
    const playbackStart = await verifyContinuousPlayback("Play comparison");
    for (const mode of ["Before", "After", "Compare", "After"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await verifyContinuousPlayback(`${mode} view`);
    }

    const initialFramingClips = await page.locator('[data-testid^="pro-framing-clip-"]').count();
    await page.getByTestId("preview-quick-both-cams").click();
    await verifyContinuousPlayback("Show Everyone edit");
    await page.getByTestId("preview-quick-track-speaker").click();
    await verifyContinuousPlayback("Solo Speaker edit");
    const recordedFramingClips = await page.locator('[data-testid^="pro-framing-clip-"]').count();
    // An action that lands within 80 ms of an existing detected camera cut
    // replaces that cut instead of adding a duplicate block. Both interactions
    // must change the framing track, with at least one net new interval.
    if (recordedFramingClips < initialFramingClips + 1) {
      throw new Error(`Framing edits did not land on the timeline: ${initialFramingClips} -> ${recordedFramingClips}`);
    }

    if (await page.getByTestId("main-footage-frame-toggle").getAttribute("data-rounded-locked") !== "true") {
      throw new Error("The approved rounded footage frame changed during the tour");
    }
    await page.getByTestId("pro-track-row-framing").scrollIntoViewIfNeeded();
    await verifyContinuousPlayback("Recorded framing track");
    await page.screenshot({ path: path.join(proofDir, "frontend-studio-live-editing.png") });
    studioTourChecks = {
      sourcePlaybackAdvanced: true,
      sourceMonitoringAudible: !playbackStart.muted && playbackStart.volume >= 0.05,
      loadingOverlayStayedHidden: true,
      comparisonStayedPlaying: true,
      approvedFrameStayedFixed: true,
      framingEditsRecorded: recordedFramingClips >= initialFramingClips + 1,
      framingActionsPerformed: 2,
      initialFramingClips,
      recordedFramingClips,
      netFramingClipDelta: recordedFramingClips - initialFramingClips,
    };
    fs.writeFileSync(
      path.join(proofDir, "frontend-studio-live-edit-tour-receipt.json"),
      JSON.stringify(studioTourChecks, null, 2)
    );
    await page.waitForTimeout(1200);
    const studioTourEndedAt = Date.now();
    await stopUnifiedStudioCapture(activeUnifiedCapture);
    const unifiedCaptureErrors = activeUnifiedCapture.captureErrors;
    activeUnifiedCapture = null;
    await context.close();
    activeContext = null;
    if (!fs.existsSync(unifiedTourRaw) || fs.statSync(unifiedTourRaw).size < 100000) {
      throw new Error(`Unified Studio tour capture was not created: ${unifiedCaptureErrors}`);
    }
    const audioAnalysis = spawnSync("ffmpeg", [
      "-hide_banner", "-i", unifiedTourRaw,
      "-af", "volumedetect", "-f", "null", "-",
    ], { encoding: "utf8" });
    const volumeReport = `${audioAnalysis.stdout || ""}\n${audioAnalysis.stderr || ""}`;
    const maxVolume = Number(/max_volume:\s*(-?[0-9.]+) dB/.exec(volumeReport)?.[1]);
    if (!Number.isFinite(maxVolume) || maxVolume < -45) {
      throw new Error(`Recorded Studio monitoring audio is silent (${maxVolume} dB)`);
    }
    const destination = path.join(proofDir, "frontend-studio-live-edit-tour.mp4");
    const tourDuration = Math.max(1, (studioTourEndedAt - studioTourStartedAt) / 1000);
    fs.copyFileSync(unifiedTourRaw, destination);
    const syncProbe = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type,start_time", "-of", "json", destination,
    ], { encoding: "utf8" }));
    const capturedVideo = syncProbe.streams?.find(stream => stream.codec_type === "video");
    const capturedAudio = syncProbe.streams?.find(stream => stream.codec_type === "audio");
    studioTourChecks.recordedAudioMaxDb = maxVolume;
    studioTourChecks.output = destination;
    studioTourChecks.tourDurationSeconds = Number(tourDuration.toFixed(3));
    studioTourChecks.sharedCaptureClock =
      Number(capturedVideo?.start_time || 0) === Number(capturedAudio?.start_time || 0);
    studioTourChecks.videoStartTime = Number(capturedVideo?.start_time || 0);
    studioTourChecks.audioStartTime = Number(capturedAudio?.start_time || 0);
    fs.writeFileSync(
      path.join(proofDir, "frontend-studio-live-edit-tour-receipt.json"),
      JSON.stringify(studioTourChecks, null, 2)
    );
    console.log(JSON.stringify({ mode: "studio-live-edit-tour", ...studioTourChecks }, null, 2));
    return;
  }
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Captions", exact: true }).click();
  const finalCaptionInput = page.getByLabel("Caption 196 text");
  await finalCaptionInput.waitFor({ state: "attached", timeout: 60000 });
  await seekOutputTimeline(Number(canonicalPayload.caption_segments[195]?.start_time || 598) + 0.1);
  await finalCaptionInput.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await documentationPause(2200);
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-captions.png" : "frontend-dry-run-captions.png"), fullPage: true });
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
  await seekOutputTimeline(176.5);
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-director-split-first.png" : "frontend-dry-run-director-split-first.png"), fullPage: true });
  await documentationPause(2400);
  await seekOutputTimeline(210.5);
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-director-split-reversed.png" : "frontend-dry-run-director-split-reversed.png"), fullPage: true });
  await documentationPause(2400);
  await seekOutputTimeline(0);
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Color", exact: true }).click();
  await page.getByTestId("studio-finish-rack").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await documentationPause(2200);
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-grade.png" : "frontend-dry-run-grade.png"), fullPage: true });
  await page.locator(".creative-tool-rail").getByRole("button", { name: "Export", exact: true }).click();

  const watermarkToggle = page.getByLabel("Include AutoPromote signature");
  if (await watermarkToggle.isChecked()) await watermarkToggle.uncheck();
  await page.getByRole("radio", { name: "Reels", exact: true }).click();
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-ready-to-render.png" : "frontend-dry-run-ready-to-render.png"), fullPage: true });
  await documentationPause(2400);

  console.log(`[frontend-proof] clicking ${liveRender ? "LIVE" : "dry-run"} frontend render control`);
  await page.getByTestId("render-caption-review-copy").click();
  await page.waitForFunction(() => document.body.innerText.includes("Queued for Rendering") || document.body.innerText.includes("Rendering Clip"), null, { timeout: 120000 });
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-render-started.png" : "frontend-dry-run-render-started.png"), fullPage: true });
  await Promise.race([
    page.getByTestId("rendered-output-ready").waitFor({ state: "visible", timeout: liveRender ? 65 * 60 * 1000 : 60000 }),
    page.getByText(/^Export failed:/).first().waitFor({ state: "visible", timeout: liveRender ? 65 * 60 * 1000 : 60000 }).then(async () => {
      const failure = await page.getByText(/^Export failed:/).first().innerText();
      throw new Error(failure);
    }),
  ]);
  await page.screenshot({ path: path.join(proofDir, liveRender ? "frontend-live-render-complete.png" : "frontend-dry-run-render-complete.png"), fullPage: true });

  if (!submittedBody || !payloadChecks) throw new Error("No validated frontend render request was captured");
  const expectedBackendUrl = process.env.E2E_EXPECTED_MEDIA_PROCESS_URL || (
    liveRender
      ? "http://127.0.0.1:8000/api/media/process"
      : "https://api.autopromote.org/api/media/process"
  );
  if (submittedUrl !== expectedBackendUrl) {
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
  activeContext = null;
  if (video) {
    const recordedPath = await video.path();
    const destination = path.join(
      proofDir,
      documentStudioEdit
        ? "frontend-studio-editing-guide.webm"
        : liveRender
          ? "frontend-live-render-workflow.webm"
          : "frontend-dry-run-workflow.webm"
    );
    fs.copyFileSync(recordedPath, destination);
  }
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(async error => {
  console.error(error.stack || error.message);
  if (activeUnifiedCapture) {
    await stopUnifiedStudioCapture(activeUnifiedCapture).catch(() => {});
    activeUnifiedCapture = null;
  }
  if (activePage) {
    await activePage.screenshot({ path: path.join(proofDir, "frontend-live-render-failed.png"), fullPage: true }).catch(() => {});
  }
  if (activeContext) {
    await activeContext.close().catch(() => {});
    activeContext = null;
  }
  if (activeVideo) {
    const recordedPath = await activeVideo.path().catch(() => null);
    if (recordedPath && fs.existsSync(recordedPath)) {
      fs.copyFileSync(recordedPath, path.join(proofDir, "frontend-live-render-failed-workflow.webm"));
    }
  }
  process.exitCode = 1;
});
