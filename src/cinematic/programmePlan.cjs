/* Local transport around the SAME canonical compiler and CPU composition code. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const kernel = require("../generated/studioDirectorReplayKernel.cjs");
const { buildCinematicGraph, validateCinematicScene } = require("../../frontend/src/components/threeD/cinematicContract");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const reject = message => { throw new Error(`Programme export: ${message}`); };

function compileLocalProgramme(document, { asset, rendered }) {
  kernel.validateStudioProjectDocument(document);
  if (!["editableStateVersion", "visualStateVersion", "editStateVersion"].every(key => document.compatibility?.[key] === 1))
    reject("save this project in the current Studio first");
  const transport = { timeline: document.clipOccurrences.map(item => ({ id: item.occurrenceId })) };
  const state = kernel.projectStudioEditableStateToSnapshot(document, transport);
  const composition = kernel.compileStudioCompositionForRender(document);
  const segments = kernel.compileStudioTimelineForRender(document);
  const duration = (document.clipOccurrences.at(-1)?.programmeRange.endTick || 0) / document.clock.ticksPerSecond;
  if (!segments.length || segments.length > 16 || !(duration > 0 && duration <= 60)) reject("use 1–16 cuts and at most 60 seconds locally");
  if (document.outputTimeMap.some(map => map.rateNumerator !== map.rateDenominator)) reject("speed changes are not supported by local programme assembly yet");
  if (document.clipOccurrences.some(item => item.playback?.freeze || item.playback?.direction !== "forward")) reject("freeze/reverse playback needs the ordinary worker");
  if (segments.length > 1 && state.joinTransition && !["auto", "cut", "none"].includes(state.joinTransition)) reject("join transitions need the ordinary worker");
  const enabled = state.threeDScenes.filter(scene => scene.enabled !== false);
  if (enabled.length > 8 || enabled.some(scene => scene.sceneType !== "cinematic_evidence")) reject("local programme assembly supports up to eight cinematic evidence scenes");
  const keyTargets = new Set([...composition.layers, ...(composition.groups || [])].map(layer => layer.id));
  if (state.motionKeyframes?.some(key => !keyTargets.has(key.targetId)) || enabled.some(scene => scene.keyframes?.length))
    reject("use cinematic camera controls for scene motion; independent 3D transform keys need the ordinary worker");
  if (state.motionScenes.length > 16) reject("local programme assembly supports at most sixteen motion graphics");
  if (state.reframeAspect !== "16:9") reject("choose the 16:9 canvas for this evidence-stage preset");
  if (state.smartCrop && !["off", "center", "speaker_track"].includes(state.smartCropMode)) reject("multi-camera framing needs the ordinary worker");
  if ((state.speakerTrackZoom ?? 1) !== 1 || state.reframeKeyframes?.length || state.reframeModeCuts?.length || state.speakerFocusCuts?.length)
    reject("animated source reframing needs the ordinary worker");
  const unsupported = ["addHook", "silenceRemoval", "removeWatermark", "creativeEffectsEnabled", "autoCaptions", "enhanceQuality", "splitExportEnabled"];
  if (unsupported.some(key => state[key]) || state.stabilization?.enabled || state.podcastVisualizer?.enabled || state.mainFrame?.enabled)
    reject("hooks, captions, source effects and split exports need the ordinary worker; disable them for local assembly");
  if ([state.adjustmentLayers, state.subjectVfxScenes, state.finishKeyframes, state.voiceovers, state.soundEffects].some(items => items?.length)
      || Object.values(state.audioKeyframes || {}).some(items => items?.length)
      || state.addMusic || state.musicTrack || state.audioRemix?.enabled || state.extractedAudio)
    reject("additional audio, adjustment and subject tracks need the ordinary worker");
  const neutral = { exposureStops: 0, lift: 0, gamma: 1, gain: 1, tint: 0, brightness: 1, contrast: 1,
    saturation: 1, temperature: 0, sharpness: 0, vignette: 0, blur: 0, zoom: 1, filmGrain: 0,
    chromaticAberration: 0, vhsTracking: 0, lightLeak: 0, letterbox: 0, fadeIn: 0, fadeOut: 0 };
  if (Object.entries(neutral).some(([key, value]) => (state.finishFx?.[key] ?? value) !== value)
      || state.finishFx?.precisionGrade || state.finishFx?.preset || state.finishFx?.overlayType
      || kernel.compileStudioFinishForRender(document).color_cube)
    reject("colour/finish processing needs the ordinary worker");
  const main = composition.layers.find(layer => layer.id === "main-video");
  const identity = { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, crop_x: 0, crop_y: 0 };
  if (Object.entries(identity).some(([key, value]) => main?.base_transform?.[key] !== value)
      || main?.motion_keyframes?.length || main?.perspective || main?.blend_mode !== "normal"
      || main?.effects?.mask?.enabled || main?.effects?.blur || main?.effects?.glow?.enabled || main?.effects?.shadow?.enabled || main?.effects?.motion_blur?.enabled)
    reject("source transform/effects need the ordinary worker");
  if (Object.entries(state.trackStates || {}).some(([key, value]) => value?.solo || (key !== "originalAudio" && (value?.muted || value?.visible === false))))
    reject("hidden or solo graphic tracks need explicit local routing support");
  const cuts = segments.map((segment, index) => {
    const occurrence = document.clipOccurrences[index];
    const source = document.assets.find(item => item.assetId === occurrence.assetId);
    const media = source && asset(source.contentHash);
    if (!media || sha(fs.readFileSync(media.path)) !== source.contentHash) reject("import every original source into this local catalogue");
    if (segment.end_time > media.duration + .001) reject("a source ends before its selected cut");
    if (occurrence.parameters?.transitionIn || occurrence.parameters?.transitionOut || occurrence.parameters?.audioDetached
        || occurrence.parameters?.audioTrimOffsetStart || occurrence.parameters?.audioTrimOffsetEnd
        || occurrence.parameters?.audioSourceStart !== undefined || occurrence.parameters?.audioProgrammeStart !== undefined)
      reject("transitions and detached audio need the ordinary worker");
    if (Math.abs(segment.duration * 24 - Math.round(segment.duration * 24)) > .001) reject("align cut durations to the 24fps frame grid");
    if (state.smartCrop && state.smartCropMode === "speaker_track" && Math.abs(media.width / media.height - 16 / 9) > .001)
      reject("choose Fit full for non-landscape sources");
    return { ...segment, assetId: media.id, hasAudio: media.hasAudio };
  });
  const scenes = enabled.map(scene => {
    validateCinematicScene(scene);
    if (scene.endTime > duration + .001 || Math.abs(scene.startTime * 24 - Math.round(scene.startTime * 24)) > .001)
      reject("keep scenes inside the programme and aligned to 24fps");
    // No browser-supplied URL is trusted. Compare its scene graph to a locally
    // completed, hash-verified EXPORT manifest; strip programme placement only.
    const ref = scene.localExport;
    const job = ref && rendered(ref.jobId);
    if (!job || job.state.status !== "completed" || job.manifest.quality !== "export"
        || job.state.outputSha256 !== ref.sha256 || sha(fs.readFileSync(job.file)) !== ref.sha256)
      reject("render each cinematic scene at 720p before programme assembly");
    const graph = buildCinematicGraph(scene), prior = { ...job.manifest.graph };
    delete graph.programmeStart; delete prior.programmeStart;
    if (stable(graph) !== stable(prior)) reject("a cinematic scene changed; render its current revision first");
    return { id: scene.id, jobId: ref.jobId, sha256: ref.sha256, startTime: scene.startTime, duration: scene.duration };
  });
  const overlays = kernel.compileStudioOverlaysForRender(document, transport);
  if (overlays.length > 16 || overlays.some(layer => layer.type !== "text" || layer.bRollMode || layer.bRollPlaceholder || layer.isRainbow || layer.coverMainVideo || String(layer.text || "").length > 1000))
    reject("local assembly currently supports ordinary Inter titles; other media layers need the ordinary worker");
  if (overlays.some(layer => (layer.fontFamily || "Inter") !== "Inter")) reject("choose Inter for local titles");
  if (document.layers.some(layer => !["three_d", "motion", "caption"].includes(layer.type) && layer.legacyCollection !== "overlays"))
    reject("this project contains an unsupported layer type");
  const order = composition.order || [...overlays.map(layer => layer.id), ...state.motionScenes.map(scene => scene.id), ...scenes.map(scene => scene.id)];
  const plan = { version: 1, duration, fps: 24, cuts, scenes, overlays, motionScenes: state.motionScenes,
    composition: { ...composition, order }, audioRestoration: state.audioRestoration,
    muteAudio: !!state.muteOriginalAudio || !!state.trackStates?.originalAudio?.muted,
    sourceFit: state.videoFit === "contain" || !state.smartCrop || state.smartCropMode === "off" ? "contain" : "cover" };
  return { plan, documentHash: sha(stable(document)) };
}

const programmeCodeHashes = root => Object.fromEntries([
  "src/cinematic/programmePlan.cjs", "src/generated/studioDirectorReplayKernel.cjs",
  "python_media_worker/studio_cinematic_programme.py", "python_media_worker/studio_rendered_scene.py",
  "python_media_worker/studio_composition.py", "python_media_worker/studio_layer_motion.py",
  "python_media_worker/studio_text.py", "python_media_worker/studio_text_animator.py", "python_media_worker/studio_audio.py",
  "python_media_worker/viral_motion_graphics.py", "python_media_worker/viral_render_contract.py",
  "python_media_worker/assets/fonts/Inter-Black.ttf", "python_media_worker/assets/fonts/Inter-ExtraBold.ttf",
  "python_media_worker/assets/fonts/Inter-Regular.ttf", "python_media_worker/assets/fonts/Inter-SemiBold.ttf",
  ...fs.readdirSync(path.join(root, "python_media_worker")).filter(name => /^studio_.*\.py$/.test(name))
    .map(name => `python_media_worker/${name}`),
].map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
module.exports = { compileLocalProgramme, programmeCodeHashes };
