const axios = require("axios");
const { buildWorkerRequestConfig } = require("../utils/cloudRunAuth");
const { applicationWorkerConfig } = require("./unifiedCredits/workerTransport");
const { getApplicationContext, assertApplicationTransport } = require("./unifiedCredits/application");

const DEFAULT_CPU = "https://media-worker-v1-341498038874.us-central1.run.app";
const DEFAULT_GPU = "https://media-worker-gpu-341498038874.us-central1.run.app";
const ANALYSIS = new Set(["/analyze-clips", "/transcribe"]);
const GPU_OPERATIONS = new Set([...ANALYSIS, "/render-viral-clip", "/render-clip", "/process-video"]);

function gpuWorkerUrl(env = process.env) {
  if (env.MEDIA_WORKER_GPU_FALLBACK === "false" || getApplicationContext()?.workerVerifier) return null;
  const production = env.NODE_ENV === "production" || env.RENDER === "true" || Boolean(env.K_SERVICE);
  const value = env.MEDIA_WORKER_GPU_URL || (production ? DEFAULT_GPU : "");
  if (!value) return null;
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(local && !production))) {
    throw new Error("MEDIA_WORKER_GPU_URL must be an authenticated HTTPS worker origin");
  }
  return url.origin;
}

function sourceSeconds(payload = {}, endpoint) {
  const hint = Number(payload.source_duration_seconds || payload.duration_seconds || 0);
  if (ANALYSIS.has(endpoint) && Number.isFinite(hint) && hint > 0) return hint;
  const timeline = payload.timeline_segments;
  if (Array.isArray(timeline) && timeline.length) {
    return timeline.reduce((sum, clip) => sum + Math.max(0,
      Number(clip.duration) || Number(clip.end_time || 0) - Number(clip.start_time || 0)), 0);
  }
  const interval = Math.max(0, Number(payload.end_time ?? payload.clipTime?.end ?? 0) -
    Number(payload.start_time ?? payload.clipTime?.start ?? 0));
  return interval || (Number.isFinite(hint) && hint > 0 ? hint : 0);
}

function selectMediaWorker(endpoint, payload = {}, env = process.env) {
  const cpu = cpuWorkerUrl(endpoint, env);
  const gpu = GPU_OPERATIONS.has(endpoint) ? gpuWorkerUrl(env) : null;
  const seconds = sourceSeconds(payload, endpoint);
  const budget = Math.max(15, Number(env.MEDIA_WORKER_CPU_BUDGET_SECONDS) || 120);
  // Speech recognition is the expensive part of analysis. Unknown source
  // duration also uses the bounded GPU lane rather than guessing a CPU budget.
  // Render estimates include the requested output pixels and layer count.
  const dimensions = payload.output_settings || payload.outputSettings || payload.export_settings || payload.exportSettings || {};
  const resolution = String(dimensions.resolution || payload.resolution || "1080p");
  const pixels = ["2160p", "4k"].includes(resolution.toLowerCase()) ? 4 : resolution === "720p" ? 4 / 9 : 1;
  const frameRate = Math.max(1, (Number(dimensions.fps) || 30) / 30);
  const motionLayers = payload.motion_graphics?.layers || payload.motion_graphics;
  const layers = (Array.isArray(payload.overlays) ? payload.overlays.length : 0) +
    (Array.isArray(motionLayers) ? motionLayers.length : 0);
  const composition = payload.composition_plan || payload.compositionPlan;
  const rasterLayers = Array.isArray(composition?.layers) ? composition.layers : [];
  // Native multi-layer composition paints each programme frame. A measured
  // 10s/1080p60 mask + animated PNG exceeded the 120s CPU budget despite having
  // only two overlays; stream duration and a small layer surcharge undercount it.
  const perFrameComposite = rasterLayers.length > 1;
  const selectedAreas=(payload.finish_plan?.adjustment_layers||[]).filter(layer=>layer.effects?.selective_mask).length;
  const renderCost = Math.max(1+Math.min(selectedAreas,32)*1.5,1 + Math.min(layers, 12) * .15, perFrameComposite ? 8 : 1);
  const estimatedCpuSeconds = ANALYSIS.has(endpoint) ? seconds || budget + 1
    : seconds ? seconds * pixels * frameRate * renderCost
      : endpoint === "/process-video" ? budget + 1 : 0;
  // Production editing and scanning prefer the qualified GPU at every size.
  // Keep the estimate for telemetry; it must not silently send short jobs to CPU.
  const { costRoutingEnabled, boundedBasicRender } = require("./processingTokens/costRouting");
  const economicalCpu = costRoutingEnabled(env) && boundedBasicRender(endpoint, payload, seconds);
  const boundedDevice = require('./processingTokens/runtime').current()?.cloudRunProfile?.device;
  const useGpu = boundedDevice ? boundedDevice === 'gpu' : Boolean(gpu) && !economicalCpu;
  return { workerUrl: useGpu ? gpu : cpu, device: useGpu ? "gpu" : "cpu", gpuUrl: gpu,
    reason: economicalCpu ? "qualified_short_cpu" : useGpu ? "gpu_primary" : "gpu_not_configured", estimatedCpuSeconds, sourceSeconds: seconds };
}

function cpuWorkerUrl(endpoint, env = process.env) {
  return ((endpoint === "/transcribe" && env.CAPTION_WORKER_URL) ||
    env.MEDIA_WORKER_URL || DEFAULT_CPU).replace(/\/$/, "");
}

function safeToFailOver(error, endpoint) {
  if(["STUDIO_SELECTIVE_GRADING_UNAVAILABLE","STUDIO_FACE_RESTORATION_UNAVAILABLE","STUDIO_ORIGINAL_SOUNDS_UNAVAILABLE"].includes(error.code)) return true;
  if (["ECONNREFUSED", "ENOTFOUND"].includes(error.code)) return true;
  const status = Number(error.response?.status);
  if ([502, 503, 504].includes(status) && ANALYSIS.has(endpoint)) return true;
  if (ANALYSIS.has(endpoint) && ["ETIMEDOUT", "ECONNABORTED"].includes(error.code)) return true;
  // A render timeout may have an accepted job. Keep its existing recovery
  // identity; never submit that uncertain render to a second worker.
  if (![429, 503].includes(status)) return false;
  const data = error.response?.data;
  const message = String(data?.detail || data?.message || (typeof data === "string" ? data : ""));
  return /worker is busy|no available instance|unable to start|no credits were charged|maximum concurrent requests|resource exhausted|capacity/i.test(message);
}

async function requestConfig(target, payload, timeoutMs) {
  assertApplicationTransport(new URL(target).origin);
  const config = await buildWorkerRequestConfig(target, { timeout: timeoutMs });
  return applicationWorkerConfig(target, payload, config);
}

function needsSelectiveGrading(payload={}) {
  return (payload.finish_plan?.adjustment_layers||[]).some(layer=>{
    const fx=layer.effects||{};return !!(fx.selective_mask||fx.recolor?.enabled||fx.clone_patch?.enabled);
  });
}
function requiredSelectiveVersion(payload={}) {
  if((payload.finish_plan?.adjustment_layers||[]).some(layer=>layer.effects?.clone_patch?.follow||(layer.effects?.selective_mask?.keyframes?.length||0)>128))return 3;
  return (payload.finish_plan?.adjustment_layers||[]).some(layer=>{
    const fx=layer.effects||{},mask=fx.selective_mask;
    return mask?.opacity!==undefined||mask?.material?.enabled||mask?.subtract?.length||mask?.keyframes?.some(k=>k.opacity!==undefined||k.points)||fx.clone_patch?.mode==='heal';
  })?2:1;
}
const ORIGINAL_SOUND_TONES = new Set(['prism_sweep','velvet_hit','glass_flick','paper_snap','orbit_rise','pulse_drop','shutter_tick','reverse_spark']);
function needsOriginalSounds(payload={}) {
  return (payload.sound_effects||[]).some(cue=>cue.enabled!==false&&cue.builtIn!==false&&ORIGINAL_SOUND_TONES.has(cue.tone));
}
function assertSelectiveSupport(payload,health) {
  if(needsOriginalSounds(payload)&&(health?.studioCapabilities?.originalSounds||0)<1)
    throw Object.assign(new Error('Original Studio sounds are unavailable on this worker; no credits were charged.'),{code:'STUDIO_ORIGINAL_SOUNDS_UNAVAILABLE',statusCode:503});
  const faceVersion=payload.finish_plan?.face_restoration?.model==='gfpgan-v1.4-natural-v2'?2:1;
  if(payload.finish_plan?.face_restoration?.enabled && (health?.studioCapabilities?.faceRestoration||0)<faceVersion)
    throw Object.assign(new Error('Face restoration is unavailable on this worker; no credits were charged.'),{code:'STUDIO_FACE_RESTORATION_UNAVAILABLE',statusCode:503});
  if(needsSelectiveGrading(payload)&&(health?.studioCapabilities?.selectiveGrading||0)<requiredSelectiveVersion(payload))
    throw Object.assign(new Error('Selected-area grading is unavailable on this worker.'),{code:'STUDIO_SELECTIVE_GRADING_UNAVAILABLE',statusCode:503});
}

function validateFaceRestorationPlan(payload) {
  const fx=payload.finish_plan?.face_restoration;
  if(!fx?.enabled)return;
  if((fx.model && !['gfpgan-v1.4-temporal-v1','gfpgan-v1.4-natural-v2'].includes(fx.model)) ||
      [['strength',.85],['stability',.65]].some(([field,fallback])=>{
        const value=fx[field]??fallback;
        return typeof value!=='number'||!Number.isFinite(value)||value<0||value>1;
      }))throw Object.assign(new Error('Choose valid facial restoration settings.'),{code:'STUDIO_FACE_RESTORATION_INVALID',statusCode:400});
}

async function postMediaWorker(endpoint, payload, { timeoutMs = 600000, onRoute, preferredDevice } = {}) {
  validateFaceRestorationPlan(payload);
  let route = selectMediaWorker(endpoint, payload);
  if (preferredDevice === "cpu" && route.device !== "cpu")
    route = { ...route, workerUrl: cpuWorkerUrl(endpoint), device: "cpu", reason: "gpu_unavailable" };
  if (preferredDevice === "gpu" && route.gpuUrl && route.device !== "gpu")
    route = { ...route, workerUrl: route.gpuUrl, device: "gpu", reason: "cpu_unavailable" };
  const call = async current => {
    await onRoute?.(current);
    if(!require('./processingTokens/runtime').current()?.workerTransport && (needsSelectiveGrading(payload)||needsOriginalSounds(payload))){
      const healthTarget=current.workerUrl+'/health';
      const health=await axios.get(healthTarget,await buildWorkerRequestConfig(healthTarget,{timeout:60000}));
      assertSelectiveSupport(payload,health.data);
    }
    const target = current.workerUrl + endpoint;
    const response = await axios.post(target, payload, await requestConfig(target, payload, timeoutMs));
    return { response, workerUrl: current.workerUrl, device: current.device, routeReason: current.reason };
  };
  try { return await call(route); }
  catch (error) {
    // Read-only analysis can still incur CPU or model spend. Under renewable
    // accounting an uncertain/failed attempt keeps its original liability;
    // a second worker needs its own reservation and verified attempt identity.
    if (require("./processingTokens/runtime").enabled()) throw error;
    if (route.device === "gpu") {
      // Capacity errors before render acceptance, and read-only analysis
      // failures, can use the qualified CPU lane without a second charge.
      if (!safeToFailOver(error, endpoint)) throw error;
      route = { ...route, workerUrl: cpuWorkerUrl(endpoint), device: "cpu", reason: "gpu_unavailable" };
      return call(route);
    }
    if (!route.gpuUrl || !safeToFailOver(error, endpoint)) throw error;
    route = { ...route, workerUrl: route.gpuUrl, device: "gpu", reason: "cpu_unavailable" };
    return call(route);
  }
}

async function assertMediaWorkerReady(payload = {}) {
  validateFaceRestorationPlan(payload);
  if (require('./processingTokens/runtime').current()?.workerTransport)
    return { ...selectMediaWorker('/render-viral-clip',payload), immutableJobAdmission: true };
  let route = selectMediaWorker("/render-viral-clip", payload);
  const check = async current => {
    const target = current.workerUrl + "/health";
    assertApplicationTransport(current.workerUrl);
    const response = await axios.get(target, await buildWorkerRequestConfig(target, {
      timeout: Math.max(10000, Number(process.env.MEDIA_WORKER_HEALTH_TIMEOUT_MS) || 60000),
    }));
    if (response.data?.status !== "ok") throw Object.assign(new Error("Worker health is not ready"), {
      code: "STUDIO_RENDER_WORKER_UNAVAILABLE", statusCode: 503,
    });
    assertSelectiveSupport(payload,response.data);
    if (current.device === "gpu" && (response.data.computeDevice !== "cuda" ||
        response.data.videoEncoder !== "h264_nvenc" || response.data.gpuRequired !== true))
      throw new Error("GPU worker has not passed CUDA and NVENC qualification");
    if (response.data?.worker_state?.status && response.data.worker_state.status !== "idle") {
      throw Object.assign(new Error("The render worker is busy. Try again shortly; no credits were charged."), {
        code: "STUDIO_RENDER_WORKER_BUSY", statusCode: 503,
      });
    }
    return current;
  };
  try { return await check(route); }
  catch (error) {
    if (route.gpuUrl) {
      route = { ...route, workerUrl: route.device === "cpu" ? route.gpuUrl : cpuWorkerUrl("/render-viral-clip"),
        device: route.device === "cpu" ? "gpu" : "cpu",
        reason: route.device === "cpu" ? "cpu_unavailable" : "gpu_unavailable" };
      try { return await check(route); } catch (fallbackError) { error = fallbackError; }
    }
    if (["STUDIO_RENDER_WORKER_BUSY","STUDIO_SELECTIVE_GRADING_UNAVAILABLE","STUDIO_FACE_RESTORATION_UNAVAILABLE","STUDIO_ORIGINAL_SOUNDS_UNAVAILABLE"].includes(error.code)) throw error;
    throw Object.assign(new Error("The render workers are unavailable. Try again once they are online; no credits were charged."), {
      code: "STUDIO_RENDER_WORKER_UNAVAILABLE", statusCode: 503,
    });
  }
}

async function mediaWorkerHealth(sourceDurationSeconds) {
  const route = selectMediaWorker("/analyze-clips", { source_duration_seconds: Number(sourceDurationSeconds) || 0 });
  const urls = [...new Set([route.workerUrl,
    route.device === "gpu" ? (process.env.MEDIA_WORKER_URL || DEFAULT_CPU).replace(/\/$/, "") : route.gpuUrl].filter(Boolean))];
  let last;
  for (const workerUrl of urls) {
    try {
      const target = workerUrl + "/health";
      assertApplicationTransport(workerUrl);
      const response = await axios.get(target, await buildWorkerRequestConfig(target, { timeout: Math.max(10000, Number(process.env.MEDIA_WORKER_HEALTH_TIMEOUT_MS) || 60000) }));
      if (response.data?.status !== "ok") throw new Error("Worker is not ready");
      return response;
    } catch (error) { last = error; }
  }
  throw last;
}

module.exports = { selectMediaWorker, postMediaWorker, assertMediaWorkerReady, safeToFailOver, mediaWorkerHealth };
