// Director-facing inventory of executable Viral Clip Studio operations.
// A UI control or a validated request field alone is not evidence of rendering.
// Bump the registry version when a capability's contract or support changes.
export const STUDIO_CAPABILITY_REGISTRY_VERSION = 4;

const objectSchema = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const id = { type: "string", minLength: 1, maxLength: 160 };
const tick = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const sourceRange = objectSchema(
  {
    space: { const: "source" },
    startTick: tick,
    endTick: tick,
  },
  ["space", "startTick", "endTick"]
);
const target = objectSchema({ occurrenceId: id }, ["occurrenceId"]);
const preconditions = objectSchema({ sourceRange }, []);

const entries = [
  {
    id: "split_clip",
    version: 1,
    operationType: "split_clip",
    parameterSchema: objectSchema(
      {
        target,
        at: objectSchema(
          { space: { enum: ["source", "programme", "clip_local", "output"] }, ticks: tick },
          ["space", "ticks"]
        ),
        newOccurrenceIds: objectSchema({ left: id, right: id }, ["left", "right"]),
        preconditions,
      },
      ["target", "at", "newOccurrenceIds"]
    ),
    requiredEvidence: ["target occurrence", "interior source/programme point"],
    readSet: ["occurrences", "locks", "timeMap"],
    writeSet: ["occurrences", "revision", "journal"],
    previewEngine: "studio project adapter",
    previewFidelity: "exact project state",
    finalRenderEngine: "Python timeline segments + FFmpeg",
    costClass: "low",
    resourceClass: "cpu",
    fallback: "reject with structured error",
    releaseState: "foundation",
    executable: true,
    supportStatus: "exact",
    limits: { frameQuantizationAtExport: true, commandKernelMigrated: true, humanUiRouted: true },
    compatibility: [
      "requires unique occurrence IDs",
      "output point requires an invertible speed map",
    ],
    conflicts: ["locked source range"],
    rendererVersion: "viral-render-contract/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/studioTimelineEdits.test.js",
      "python_media_worker/test_viral_render_contract.py",
    ],
  },
  {
    id: "trim_clip",
    version: 3,
    operationType: "trim_clip",
    parameterSchema: objectSchema({ target, keep: sourceRange, preconditions }, ["target", "keep"]),
    requiredEvidence: ["target occurrence", "nonempty source range within occurrence", "valid linked programme timing"],
    readSet: ["occurrences", "locks", "timeMap", "layers", "linkedTiming", "speedKeyframes"],
    writeSet: ["occurrences", "layers", "linkedTiming", "speedKeyframes", "revision", "journal"],
    previewEngine: "studio project adapter",
    previewFidelity: "exact project state",
    finalRenderEngine: "Python timeline segments + FFmpeg",
    costClass: "low",
    resourceClass: "cpu",
    fallback: "reject with structured error",
    releaseState: "foundation",
    executable: true,
    supportStatus: "exact",
    limits: { frameQuantizationAtExport: true, commandKernelMigrated: true, humanUiRouted: true, humanUiRoute: "trim_start_and_end" },
    compatibility: ["source range is half-open", "programme cues and keys ripple with the retained source range", "captions remain source-timed"],
    conflicts: ["locked source range", "invalid linked programme timing"],
    rendererVersion: "viral-render-contract/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/studioCommands.test.js",
      "frontend/src/components/__tests__/ViralClipStudio.test.js",
      "frontend/src/components/__tests__/studioRenderCompiler.test.js",
      "frontend/src/components/__tests__/studioTimelineEdits.test.js",
      "python_media_worker/test_studio_trim_timing_contract.py",
      "python_media_worker/test_viral_render_contract.py",
    ],
  },
  {
    id: "remove_range",
    version: 1,
    operationType: "remove_range",
    parameterSchema: objectSchema(
      {
        range: objectSchema(
          {
            space: { const: "programme" },
            startTick: tick,
            endTick: tick,
          },
          ["space", "startTick", "endTick"]
        ),
      },
      ["range"]
    ),
    requiredEvidence: ["nonempty programme range"],
    readSet: ["occurrences", "layers", "locks"],
    writeSet: ["occurrences", "layers", "revision", "journal"],
    previewEngine: "Studio timeline state",
    previewFidelity: "approximate time remapping",
    finalRenderEngine: "Python timeline segments + FFmpeg",
    costClass: "low",
    resourceClass: "cpu",
    fallback: "use existing reviewed UI removal flow",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["legacy overlays and audio are retimed by separate helpers"],
    conflicts: ["locked programme range"],
    rendererVersion: "viral-render-contract/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/studioTimelineEdits.test.js",
      "python_media_worker/test_viral_render_contract.py",
    ],
  },
  {
    id: "preserve_range",
    version: 1,
    operationType: "preserve_range",
    parameterSchema: objectSchema({ target, range: sourceRange, lockId: id, preconditions }, [
      "target",
      "range",
      "lockId",
    ]),
    requiredEvidence: ["target occurrence", "nonempty source range within occurrence"],
    readSet: ["occurrences", "locks"],
    writeSet: ["locks", "revision", "journal"],
    previewEngine: "studio command kernel",
    previewFidelity: "exact constraint state",
    finalRenderEngine: "constraint only; no media render",
    costClass: "low",
    resourceClass: "cpu",
    fallback: "reject with structured error",
    releaseState: "foundation",
    executable: true,
    supportStatus: "exact",
    limits: { mediaEffect: false, commandKernelMigrated: true, humanUiRouted: false },
    compatibility: ["blocks migrated destructive commands only"],
    conflicts: ["overlapping destructive edit"],
    rendererVersion: null,
    templateVersion: null,
    evidenceSuite: ["frontend/src/components/__tests__/studioTimelineEdits.test.js"],
  },
  {
    id: "reframe",
    version: 1,
    operationType: "reframe",
    parameterSchema: objectSchema(
      { aspect: { enum: ["9:16", "16:9", "1:1", "4:5"] }, keyframes: { type: "array" } },
      ["aspect"]
    ),
    requiredEvidence: ["video asset", "reviewed crop/aspect"],
    readSet: ["occurrences", "videoAsset", "reframeKeyframes"],
    writeSet: ["reframeKeyframes"],
    previewEngine: "browser CSS transform",
    previewFidelity: "approximate",
    finalRenderEngine: "Python reframe timeline + FFmpeg",
    costClass: "medium",
    resourceClass: "cpu",
    fallback: "centre crop",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["aspect-specific coordinates"],
    conflicts: [],
    rendererVersion: "main_media_server/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/studioReframeInterpolation.test.js",
      "python_media_worker/test_studio_reframe_cuts.py",
    ],
  },
  {
    id: "captions",
    version: 1,
    operationType: "caption_segments",
    parameterSchema: objectSchema({ segments: { type: "array" }, style: { type: "string" } }, [
      "segments",
    ]),
    requiredEvidence: ["reviewed caption text and source timing"],
    readSet: ["captionSegments", "occurrences", "timeMap"],
    writeSet: ["captionSegments"],
    previewEngine: "browser caption overlay",
    previewFidelity: "approximate typography and frame timing",
    finalRenderEngine: "Python ASS subtitles + FFmpeg",
    costClass: "medium",
    resourceClass: "cpu",
    fallback: "reject unreviewed transcript where review is required",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["source captions remap through timeline and speed plan"],
    conflicts: [],
    rendererVersion: "viral-render-contract/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/viralRenderPayload.test.js",
      "python_media_worker/test_viral_render_contract.py",
    ],
  },
  {
    id: "title_callout",
    version: 1,
    operationType: "text_overlay",
    parameterSchema: objectSchema(
      { text: { type: "string", minLength: 1 }, placement: { type: "object" } },
      ["text"]
    ),
    requiredEvidence: ["reviewed text and programme range"],
    readSet: ["overlays"],
    writeSet: ["overlays"],
    previewEngine: "browser DOM/CSS overlay",
    previewFidelity: "approximate fonts and geometry",
    finalRenderEngine: "Python FFmpeg drawtext",
    costClass: "low",
    resourceClass: "cpu",
    fallback: "plain text overlay",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["ordered only within regular overlay stack"],
    conflicts: [],
    rendererVersion: "main_media_server/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/viralRenderPayload.test.js",
      "python_media_worker/test_studio_overlay_zero.py",
    ],
  },
  {
    id: "b_roll",
    version: 1,
    operationType: "video_overlay",
    parameterSchema: objectSchema(
      {
        assetId: id,
        programmeRange: { type: "object" },
        mode: { enum: ["fullscreen", "pip", "split"] },
      },
      ["assetId", "programmeRange"]
    ),
    requiredEvidence: ["owned video asset", "source trim", "programme range"],
    readSet: ["overlays", "videoAsset"],
    writeSet: ["overlays", "audioRouting"],
    previewEngine: "browser video overlay",
    previewFidelity: "approximate",
    finalRenderEngine: "Python studio_broll + FFmpeg overlay",
    costClass: "medium",
    resourceClass: "cpu",
    fallback: "retain main video",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["regular overlay stack"],
    conflicts: [],
    rendererVersion: "studio_broll/current",
    templateVersion: null,
    evidenceSuite: [
      "python_media_worker/test_studio_overlay_zero.py",
      "python_media_worker/test_studio_layer_motion.py",
    ],
  },
  {
    id: "audio_ducking",
    version: 1,
    operationType: "audio_ducking",
    parameterSchema: objectSchema(
      { strength: { type: "number", minimum: 0, maximum: 1 }, programmeRange: { type: "object" } },
      ["strength", "programmeRange"]
    ),
    requiredEvidence: ["audio source", "reviewed ducking range"],
    readSet: ["audioTracks", "overlays"],
    writeSet: ["audioRouting"],
    previewEngine: "browser audio mix",
    previewFidelity: "approximate loudness and timing",
    finalRenderEngine: "Python FFmpeg audio filters",
    costClass: "low",
    resourceClass: "cpu",
    fallback: "no ducking",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["different music and overlay ducking paths"],
    conflicts: [],
    rendererVersion: "main_media_server/current",
    templateVersion: null,
    evidenceSuite: [
      "python_media_worker/test_studio_audio_automation.py",
      "python_media_worker/test_viral_clip_audio.py",
    ],
  },
  {
    id: "motion_graphic",
    version: 1,
    operationType: "motion_scene",
    parameterSchema: objectSchema({ scene: { type: "object" } }, ["scene"]),
    requiredEvidence: ["validated motion scene", "programme range"],
    readSet: ["motionScenes", "timeMap"],
    writeSet: ["motionScenes"],
    previewEngine: "browser motion layer",
    previewFidelity: "approximate",
    finalRenderEngine: "Python viral_motion_graphics + FFmpeg",
    costClass: "medium",
    resourceClass: "cpu",
    fallback: "omit rejected scene with explicit error",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false },
    compatibility: ["composited after regular overlays, before 3D"],
    conflicts: [],
    rendererVersion: "viral_motion_graphics/v1",
    templateVersion: 1,
    evidenceSuite: [
      "python_media_worker/test_viral_motion_graphics.py",
      "python_media_worker/test_studio_motion.py",
    ],
  },
  {
    id: "speed",
    version: 1,
    operationType: "speed_segments",
    parameterSchema: objectSchema({ segments: { type: "array" } }, ["segments"]),
    requiredEvidence: ["source ranges", "positive playback rates"],
    readSet: ["occurrences", "speedKeyframes"],
    writeSet: ["timeMap", "speedKeyframes"],
    previewEngine: "browser playback-rate plan",
    previewFidelity: "approximate frame/audio rounding",
    finalRenderEngine: "Python speed plan + FFmpeg",
    costClass: "medium",
    resourceClass: "cpu",
    fallback: "reject invalid/incomplete plan",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false, reverse: false, freeze: false },
    compatibility: ["captions and overlays require post-speed remapping"],
    conflicts: [],
    rendererVersion: "viral-render-contract/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/viralRenderPayload.test.js",
      "python_media_worker/test_viral_render_contract.py",
    ],
  },
  {
    id: "creator_fx",
    version: 1,
    operationType: "creative_plan",
    parameterSchema: objectSchema({ plan: { type: "object" } }, ["plan"]),
    requiredEvidence: ["validated effect recipe", "source video"],
    readSet: ["creativePlan", "videoAsset"],
    writeSet: ["creativePlan"],
    previewEngine: "browser approximation",
    previewFidelity: "effect-dependent approximate",
    finalRenderEngine: "Python viral_creative_effects + FFmpeg",
    costClass: "high",
    resourceClass: "cpu",
    fallback: "effect-specific CPU path or explicit rejection",
    releaseState: "legacy",
    executable: true,
    supportStatus: "approximate",
    limits: { commandKernelMigrated: false, gpuAccelerationProven: false },
    compatibility: ["effect-specific preview/export contracts"],
    conflicts: [],
    rendererVersion: "viral_creative_effects/current",
    templateVersion: null,
    evidenceSuite: [
      "frontend/src/components/__tests__/studioCreatorRecipes.test.js",
      "python_media_worker/test_viral_creative_effects.py",
    ],
  },
  {
    id: "three_d_scene",
    version: 1,
    operationType: "three_d_scene",
    parameterSchema: objectSchema(
      { scene: { type: "object" }, aspect: { enum: ["9:16", "16:9", "1:1"] } },
      ["scene", "aspect"]
    ),
    requiredEvidence: [
      "validated v1 scene",
      "owned completed HQ alpha job for current scene revision",
    ],
    readSet: ["threeDScenes", "ownedAssets", "timeMap"],
    writeSet: ["threeDScenes"],
    previewEngine: "browser Three.js",
    previewFidelity: "approximate; field-level matrix required",
    finalRenderEngine: "Blender Eevee alpha render, then CPU FFmpeg composite",
    costClass: "high",
    resourceClass: "isolated GPU job + CPU composite",
    fallback: "local Blender proof only; no automatic production fallback",
    releaseState: "unverified",
    executable: false,
    supportStatus: "approximate",
    limits: {
      maxWidth: 1280,
      maxHeight: 1280,
      maxPixels: 921600,
      maxFps: 30,
      maxPreviewSeconds: 10,
      maxExportSeconds: 10,
      maxScenes: 8,
      native1080p: false,
      native4k: false,
      gpuAccelerationProven: false,
    },
    unsupportedSceneFields: [
      "fontFamily",
      "fontWeight",
      "easing",
      "audioReactiveIntensity",
      "lightDirection",
      "shadows",
      "reflections",
      "background",
      "quality",
    ],
    unsupportedSceneModes: {
      template: ["audio_reactive_text"],
      hold: ["pulse"],
      entrance: ["fade", "pulse", "float"],
      exit: ["fade", "dolly", "burst"],
    },
    compatibility: [
      "production renderer availability has not been requalified since the 2026-09-16 audit",
      "requires same-revision HQ job",
      "3D layerOrder sorts only 3D scenes",
      "always composited after motion graphics",
    ],
    conflicts: ["missing or stale HQ job", "unsupported render fields"],
    rendererVersion: "studio_3d_renderer/spec-v1",
    templateVersion: 1,
    evidenceSuite: [
      "studio_3d_renderer/tests/test_spec.py",
      "python_media_worker/test_studio_3d_overlay.py",
      "frontend/src/components/threeD/studio3DModel.test.js",
    ],
  },
  {
    id: "three_d_audio_reactivity",
    version: 1,
    operationType: "three_d_audio_reactivity",
    parameterSchema: objectSchema(
      { audioReactiveIntensity: { type: "number", minimum: 0, maximum: 1 } },
      ["audioReactiveIntensity"]
    ),
    requiredEvidence: ["sample-aligned audio envelope"],
    readSet: ["audioAnalysis", "threeDScenes"],
    writeSet: ["threeDScenes"],
    previewEngine: "browser Three.js audioLevel",
    previewFidelity: "preview only",
    finalRenderEngine: null,
    costClass: "high",
    resourceClass: "unimplemented",
    fallback: "set intensity to zero and request review",
    releaseState: "unsupported",
    executable: false,
    supportStatus: "unsupported",
    limits: { finalAudioInput: false },
    compatibility: [],
    conflicts: ["final export"],
    rendererVersion: null,
    templateVersion: 1,
    evidenceSuite: [
      "frontend/src/components/threeD/Studio3DCanvas.js",
      "studio_3d_renderer/blender_scene.py",
    ],
  },
];

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

// The registry is data, not a dispatch table. Only migrated commands use it as
// an authorization gate; legacy entries document real render paths and gaps.
export const STUDIO_CAPABILITIES = deepFreeze(entries.map(entry => {
  const reviewedDirectorCommand = ["split_clip", "trim_clip"].includes(entry.id);
  return { ...entry, directorPermission: {
    directorCommandSupported: reviewedDirectorCommand,
    serverValidated: reviewedDirectorCommand,
    rendererVerified: reviewedDirectorCommand,
    releaseEnabled: reviewedDirectorCommand,
  } };
}));
const byId = new Map(STUDIO_CAPABILITIES.map(entry => [entry.id, entry]));

export function getStudioCapability(id) {
  return byId.get(id) || null;
}

export function isStudioCapabilityExecutable(id) {
  return getStudioCapability(id)?.executable === true;
}

export function isStudioCapabilityDirectorAllowed(id) {
  const capability = getStudioCapability(id);
  const permission = capability?.directorPermission;
  return capability?.executable === true && permission?.directorCommandSupported === true &&
    permission.serverValidated === true && permission.rendererVerified === true &&
    permission.releaseEnabled === true;
}
