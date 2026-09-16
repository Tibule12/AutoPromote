const crypto = require("crypto");
const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");

const TEMPLATES = new Set(["cinematic_title", "neon_logo", "chrome_lyric", "audio_reactive_text", "floating_callout", "impact_explosion", "speaker_intro", "comparison_card"]);
const MATERIALS = new Set(["chrome", "glass", "neon", "gold", "matte", "holographic"]);
const ANIMATIONS = new Set(["dolly", "orbit", "burst", "pulse", "float", "slide", "fade"]);
const SCENE_KEYS = new Set(["version", "id", "template", "name", "text", "secondary", "startTime", "duration", "endTime", "layerOrder", "assetUrl", "assetStoragePath", "assetName", "fontFamily", "fontWeight", "textAlign", "lineSpacing", "material", "primaryColor", "secondaryColor", "glowColor", "extrusionDepth", "bevel", "x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ", "entrance", "hold", "exit", "easing", "intensity", "audioReactiveIntensity", "cameraMotion", "focalLength", "lightDirection", "lightColor", "lightIntensity", "shadows", "reflections", "bloom", "background", "enabled", "quality", "hqPreviewUrl", "hqPreviewRevision", "hqPreviewJobId", "keyframes"]);
const KEYFRAME_FIELDS = new Set(["x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ"]);
const validText = (value, max) => typeof value === "string" && value.length <= max && !/[\x00-\x1f]/.test(value);
const number = (value, low, high) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const oneOf = (value, allowed) => allowed.has(value);
const color = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function validateStudio3DScene(scene, ownerUid) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene) || scene.version !== 1 || Object.keys(scene).some(key => !SCENE_KEYS.has(key))) throw new Error("Invalid 3D scene");
  if (!validText(scene.id, 100) || !/^[A-Za-z0-9_-]{1,100}$/.test(scene.id)) throw new Error("Invalid scene ID");
  if (!oneOf(scene.template, TEMPLATES) || !oneOf(scene.material, MATERIALS) || !oneOf(scene.entrance, ANIMATIONS) || !oneOf(scene.hold, new Set(["still", "float", "pulse", "orbit"])) || !oneOf(scene.exit, new Set(["fade", "dolly", "spin", "burst"])) || !oneOf(scene.easing, new Set(["ease_out", "ease_in_out", "spring", "linear"]))) throw new Error("Invalid 3D template or motion");
  for (const [key, max] of Object.entries({ name: 80, text: 80, secondary: 100, assetName: 128 })) if (!validText(scene[key], max)) throw new Error(`Invalid ${key}`);
  for (const key of ["primaryColor", "secondaryColor", "glowColor", "lightColor"]) if (!color(scene[key])) throw new Error(`Invalid ${key}`);
  const bounds = { startTime: [0, 86400], duration: [.5, 15], layerOrder: [0, 100], lineSpacing: [.7, 2], extrusionDepth: [.01, 1.5], bevel: [0, .2], x: [5, 95], y: [5, 95], z: [-4, 4], scale: [.2, 3], rotationX: [-180, 180], rotationY: [-180, 180], rotationZ: [-180, 180], intensity: [0, 1], audioReactiveIntensity: [0, 1], cameraMotion: [0, 1], focalLength: [24, 85], lightDirection: [-180, 180], lightIntensity: [0, 5], bloom: [0, 1] };
  for (const [key, [low, high]] of Object.entries(bounds)) if (!number(scene[key], low, high)) throw new Error(`Invalid ${key}`);
  if (!number(scene.endTime, .5, 86415) || Math.abs(scene.endTime - scene.startTime - scene.duration) > .001) throw new Error("Invalid scene end time");
  if (scene.keyframes !== undefined && (!Array.isArray(scene.keyframes) || scene.keyframes.length > 64)) throw new Error("Invalid scene keyframes");
  for (const frame of scene.keyframes || []) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame) || Object.keys(frame).length !== 4 || Object.keys(frame).some(key => !["id", "time", "easing", "values"].includes(key))) throw new Error("Invalid 3D keyframe");
    if (!validText(frame.id, 100) || !/^[A-Za-z0-9_-]{1,100}$/.test(frame.id) || !number(frame.time, scene.startTime, scene.endTime) || !oneOf(frame.easing, new Set(["ease_out", "ease_in_out", "spring", "linear"]))) throw new Error("Invalid 3D keyframe identity or timing");
    if (!frame.values || typeof frame.values !== "object" || Array.isArray(frame.values) || Object.keys(frame.values).length !== KEYFRAME_FIELDS.size || Object.keys(frame.values).some(key => !KEYFRAME_FIELDS.has(key))) throw new Error("Invalid 3D keyframe values");
    for (const key of KEYFRAME_FIELDS) {
      const [low, high] = bounds[key];
      if (!number(frame.values[key], low, high)) throw new Error(`Invalid keyframe ${key}`);
    }
  }
  for (const key of ["shadows", "reflections", "enabled"]) if (typeof scene[key] !== "boolean") throw new Error(`Invalid ${key}`);
  for (const [key, allowed] of Object.entries({ fontFamily: ["studio", "sans", "serif"], fontWeight: ["regular", "bold", "black"], textAlign: ["left", "center", "right"], background: ["transparent", "dark", "light"], quality: ["draft", "preview", "high"] })) if (!allowed.includes(scene[key])) throw new Error(`Invalid ${key}`);
  const assetPath = scene.assetStoragePath || "";
  if (assetPath && (!assetPath.startsWith(`uploads/images/${ownerUid}/`) || assetPath.includes("..") || !/^[A-Za-z0-9_.-]{1,160}$/.test(assetPath.slice(`uploads/images/${ownerUid}/`.length)))) throw new Error("Asset must be an owned image upload");
  if (scene.assetUrl && !assetPath) throw new Error("Save the logo asset before HQ rendering");
  return { ...scene, assetUrl: "", hqPreviewUrl: "", hqPreviewRevision: "", hqPreviewJobId: "", assetStoragePath: assetPath };
}

function stableSceneHash(scene) {
  const {
    hqPreviewUrl: _hqPreviewUrl,
    hqPreviewRevision: _hqPreviewRevision,
    hqPreviewJobId: _hqPreviewJobId,
    assetUrl: _assetUrl,
    ...values
  } = scene;
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function studio3DBucket() {
  const name = process.env.STUDIO_3D_BUCKET;
  if (!name || !/^[-a-z0-9.]{3,222}$/.test(name)) throw new Error("Private 3D storage bucket is not configured");
  return admin.storage().bucket(name);
}

async function dispatchStudio3DJob(jobId) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!project) throw new Error("3D GPU project is not configured");
  const job = process.env.STUDIO_3D_JOB_NAME || "viral-studio-3d-renderer";
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const url = `https://run.googleapis.com/v2/projects/${project}/locations/us-central1/jobs/${job}:run`;
  const response = await client.request({ url, method: "POST", data: { overrides: { containerOverrides: [{ env: [{ name: "STUDIO_3D_JOB_ID", value: jobId }] }], taskCount: 1 } }, timeout: 60000 });
  return response.data?.name || null;
}

async function createStudio3DPreview({ ownerUid, scene, aspect = "9:16", clientRequestId }) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid || "") || !/^[A-Za-z0-9_-]{8,100}$/.test(clientRequestId || "")) throw new Error("Invalid request identity");
  if (!["9:16", "16:9", "1:1"].includes(aspect)) throw new Error("Invalid preview aspect ratio");
  const clean = validateStudio3DScene(scene, ownerUid);
  const sourceBucket = admin.storage().bucket();
  const previewBucket = studio3DBucket();
  if (clean.assetStoragePath) {
    const [metadata] = await sourceBucket.file(clean.assetStoragePath).getMetadata();
    if (Number(metadata.size) <= 0 || Number(metadata.size) > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(metadata.contentType) || metadata.metadata?.ownerUid !== ownerUid) throw new Error("Logo asset failed ownership or size validation");
  }
  const spec = { version: 1, ownerUid, mode: "preview", width: aspect === "9:16" ? 720 : aspect === "1:1" ? 720 : 1280, height: aspect === "9:16" ? 1280 : 720, fps: 30, duration: Math.min(10, clean.duration), scene: { ...clean } };
  const db = admin.firestore();
  const leaseRef = db.collection("studio_3d_capacity").doc("global");
  const day = new Date().toISOString().slice(0, 10);
  const userUsageRef = db.collection("studio_3d_usage").doc(`${day}_${ownerUid}`);
  const globalUsageRef = db.collection("studio_3d_usage").doc(`${day}_global`);
  const requestRef = db.collection("studio_3d_requests").doc(`${ownerUid}_${clientRequestId}`);
  const jobId = crypto.randomUUID();
  if (clean.assetStoragePath) {
    const extension = clean.assetStoragePath.toLowerCase().endsWith(".png") ? "png" : clean.assetStoragePath.toLowerCase().endsWith(".webp") ? "webp" : "jpg";
    spec.scene.assetStoragePath = `temp_studio_3d/${ownerUid}/${jobId}/asset.${extension}`;
  }
  const jobRef = db.collection("studio_3d_jobs").doc(jobId);
  const hash = stableSceneHash(clean);
  const now = Date.now();
  const result = await db.runTransaction(async tx => {
    const [existing, lease, userUsage, globalUsage] = await Promise.all([tx.get(requestRef), tx.get(leaseRef), tx.get(userUsageRef), tx.get(globalUsageRef)]);
    if (existing.exists) {
      const previous = existing.data();
      if (previous.hash !== hash) throw new Error("Idempotency key was reused for a different scene");
      return { jobId: previous.jobId, reused: true };
    }
    if (lease.exists && Number(lease.data().expiresAtMs) > now) throw new Error("3D preview capacity is busy; retry shortly");
    if (Number(userUsage.data()?.count || 0) >= 4 || Number(globalUsage.data()?.count || 0) >= 20) throw new Error("3D preview daily limit reached");
    tx.create(requestRef, { ownerUid, hash, jobId, createdAtMs: now });
    tx.set(leaseRef, { jobId, ownerUid, expiresAtMs: now + 20 * 60 * 1000 });
    tx.set(userUsageRef, { count: Number(userUsage.data()?.count || 0) + 1, day, ownerUid });
    tx.set(globalUsageRef, { count: Number(globalUsage.data()?.count || 0) + 1, day });
    tx.create(jobRef, { jobId, ownerUid, spec, hash, status: "queued", createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAtMs: now + 24 * 60 * 60 * 1000 });
    return { jobId, reused: false };
  });
  if (result.reused) return result;
  try {
    if (clean.assetStoragePath) {
      await sourceBucket.file(clean.assetStoragePath).copy(previewBucket.file(spec.scene.assetStoragePath));
    }
    const executionName = await dispatchStudio3DJob(jobId);
    await jobRef.update({ executionName });
  } catch (error) {
    await Promise.all([jobRef.update({ status: "failed", errorCode: "DISPATCH_FAILED" }), db.runTransaction(async tx => { const current = await tx.get(leaseRef); if (current.data()?.jobId === jobId) tx.delete(leaseRef); })]);
    throw new Error("3D preview could not be queued");
  }
  return result;
}

async function getOwnedStudio3DPreview({ ownerUid, jobId }) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(jobId || "")) throw new Error("Invalid job ID");
  const db = admin.firestore();
  const doc = await db.collection("studio_3d_jobs").doc(jobId).get();
  if (!doc.exists || doc.data().ownerUid !== ownerUid) return null;
  const data = doc.data();
  const response = { jobId, status: data.status, hash: data.hash, errorCode: data.errorCode || null };
  if (data.status === "completed" && data.previewPath) {
    const [url] = await studio3DBucket().file(data.previewPath).getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 });
    response.url = url;
  }
  return response;
}

async function resolveStudio3DExport({ ownerUid, items }) {
  if (!Array.isArray(items) || items.length > 8) throw new Error("Invalid 3D export scene count");
  const db = admin.firestore();
  const bucket = studio3DBucket();
  const resolved = [];
  for (const item of items) {
    if (!item || Object.keys(item).some(key => !["jobId", "scene", "aspect"].includes(key)) || !/^[A-Za-z0-9_-]{8,100}$/.test(item.jobId || "")) throw new Error("Invalid 3D export reference");
    const scene = validateStudio3DScene(item.scene, ownerUid);
    const doc = await db.collection("studio_3d_jobs").doc(item.jobId).get();
    if (!doc.exists) throw new Error("3D preview is missing");
    const data = doc.data();
    if (data.ownerUid !== ownerUid || data.status !== "completed" || data.hash !== stableSceneHash(scene) || data.spec?.duration < scene.duration - .001) throw new Error("3D preview is stale or not owned by this project");
    const aspect = data.spec.width < data.spec.height ? "9:16" : data.spec.width === data.spec.height ? "1:1" : "16:9";
    if (aspect !== item.aspect) throw new Error("3D preview aspect ratio changed; generate a new preview");
    const expectedPath = `temp_studio_3d/${ownerUid}/${item.jobId}/overlay.mov`;
    if (data.overlayPath !== expectedPath) throw new Error("Invalid 3D overlay path");
    const file = bucket.file(expectedPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) <= 0 || Number(metadata.size) > 750 * 1024 * 1024 || metadata.contentType !== "video/quicktime") throw new Error("3D overlay is unavailable");
    const [overlayUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 2 * 60 * 60 * 1000 });
    resolved.push({ id: scene.id, jobId: item.jobId, ownerUid, startTime: scene.startTime, duration: scene.duration, layerOrder: scene.layerOrder, overlayUrl });
  }
  return resolved.sort((a, b) => a.layerOrder - b.layerOrder);
}

module.exports = { validateStudio3DScene, stableSceneHash, createStudio3DPreview, getOwnedStudio3DPreview, resolveStudio3DExport, dispatchStudio3DJob };
