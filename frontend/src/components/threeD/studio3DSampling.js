// The existing HQ scene contract produces 30fps alpha, subsequently sampled
// by the programme compositor. Select the same held frame without altering
// editable keys or the programme/source clock. Tick arithmetic avoids choosing
// the previous frame at a six-decimal browser seek boundary.
export const STUDIO_3D_FPS = 30;
export const STUDIO_3D_TEXTURE_SAMPLER = 'studio-3d-texture-frame-v1';

export function studio3DFrameSample(scene, programmeTime) {
  const start = Number(scene.startTime), duration = Number(scene.duration);
  if (scene.enabled === false || !Number.isFinite(programmeTime) ||
      programmeTime < start || programmeTime >= start + duration) return null;
  const localTick = Math.round(programmeTime * 90000) - Math.round(start * 90000);
  const frameIndex = Math.max(0, Math.min(Math.ceil(Number((duration * STUDIO_3D_FPS).toFixed(8))) - 1,
    Math.floor(localTick * STUDIO_3D_FPS / 90000)));
  return { frameIndex, localTime: frameIndex / STUDIO_3D_FPS,
    programmeTime: start + frameIndex / STUDIO_3D_FPS };
}

export function studio3DTextureFrameRequest(scene, programmeTime) {
  const sample = studio3DFrameSample(scene, programmeTime);
  if (!sample || scene.assetType !== 'video' || !scene.assetStoragePath ||
      !/^[a-f0-9]{64}$/.test(scene.assetContentHash || '')) return null;
  const start = Number(scene.assetSourceStart);
  if (!Number.isFinite(start) || start < 0 || !(scene.duration > 0 && scene.duration <= 10)) return null;
  return { storagePath: scene.assetStoragePath, sourceContentHash: scene.assetContentHash,
    start, end: start + scene.duration, fps: STUDIO_3D_FPS, frameIndex: sample.frameIndex,
    sampling: STUDIO_3D_TEXTURE_SAMPLER };
}

// Reuse a programme decoder only when both byte identity and source clock
// agree. A retimed, offset or different occurrence must keep its own texture.
export function studio3DCanShareVideo(scene, programmeTime, source) {
  if (!studio3DFrameSample(scene, programmeTime) || scene.assetType !== 'video' ||
      !/^[a-f0-9]{64}$/.test(scene.assetContentHash || '') ||
      scene.assetContentHash !== source?.contentHash || scene.assetStoragePath !== source?.storagePath ||
      !source?.video || source.video.seeking || source.video.readyState < 2 || !Number.isFinite(source.sourceTime)) return false;
  const target = Number(scene.assetSourceStart) + programmeTime - scene.startTime;
  return Math.abs(target - source.sourceTime) <= 1/90000;
}
