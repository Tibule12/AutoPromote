export const MAX_STUDIO_ANGLES = 8;

const toDuration = value => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

const toOffset = value => {
  const offset = Number(value);
  return Number.isFinite(offset) && offset >= 0 ? offset : null;
};

export const getAngleGroupSharedDuration = (group, assets) => {
  const byId = new Map((assets || []).map(asset => [String(asset.id), asset]));
  if (!Array.isArray(group?.angles) || group.angles.length < 2) return 0;
  const available = group.angles.map(angle => {
    const asset = byId.get(String(angle.assetId));
    const offset = toOffset(angle.offsetSeconds);
    return asset && offset !== null ? toDuration(asset.duration) - offset : 0;
  });
  return Math.max(0, Math.min(...available));
};

export const getStudioAngleSharedRange = (group, assets) => ({
  start: 0,
  end: getAngleGroupSharedDuration(group, assets),
});

export const createStudioAngleGroup = ({ id, name, assets }) => {
  const selected = Array.isArray(assets) ? assets : [];
  const ids = new Set(selected.map(asset => String(asset?.id || "")));
  if (
    !id ||
    selected.length < 2 ||
    selected.length > MAX_STUDIO_ANGLES ||
    ids.size !== selected.length ||
    selected.some(asset => !asset?.id || !asset?.storagePath || !asset?.url || !toDuration(asset?.duration))
  ) {
    throw new Error(`Choose 2–${MAX_STUDIO_ANGLES} saved videos with a readable duration.`);
  }
  const group = {
    id: String(id),
    name: String(name || "Camera take").trim() || "Camera take",
    angles: selected.map(asset => ({ assetId: asset.id, offsetSeconds: 0 })),
    sharedStart: 0,
    sharedEnd: 0,
  };
  return { ...group, sharedEnd: getAngleGroupSharedDuration(group, selected) };
};

export const setStudioAngleOffset = ({ group, assetId, offsetSeconds, assets }) => {
  const offset = toOffset(offsetSeconds);
  if (offset === null) throw new Error("Start offset must be zero or more seconds.");
  if (!group?.angles?.some(angle => String(angle.assetId) === String(assetId))) {
    throw new Error("This camera is not in the selected take.");
  }
  const asset = (assets || []).find(item => String(item.id) === String(assetId));
  if (!asset || offset >= toDuration(asset.duration)) {
    throw new Error("Start offset must be shorter than this camera video.");
  }
  const updated = {
    ...group,
    angles: group.angles.map(angle => String(angle.assetId) === String(assetId)
      ? { ...angle, offsetSeconds: offset }
      : angle),
  };
  const duration = getAngleGroupSharedDuration(updated, assets);
  return {
    ...updated,
    sharedStart: Math.min(Math.max(0, Number(group.sharedStart) || 0), duration),
    sharedEnd: Math.min(Math.max(0, Number(group.sharedEnd) || 0), duration),
  };
};

export const createStudioAngleShot = ({ group, asset, sharedStart, sharedEnd, clipId }) => {
  const angle = group?.angles?.find(item => String(item.assetId) === String(asset?.id));
  if (!angle || !asset?.storagePath || !asset?.url || !clipId) {
    throw new Error("Choose a saved camera video from this take.");
  }
  const offset = toOffset(angle.offsetSeconds);
  const start = Number(sharedStart);
  const end = Number(sharedEnd);
  const maxDuration = toDuration(asset.duration) - offset;
  if (
    offset === null || !Number.isFinite(start) || !Number.isFinite(end) ||
    start < 0 || end <= start || end > maxDuration + 0.001
  ) {
    throw new Error("Choose a shot range that fits this camera video.");
  }
  return {
    id: String(clipId),
    sourceClipId: asset.id,
    sourceMediaId: asset.id,
    angleGroupId: group.id,
    name: `${group.name} · ${asset.name || "Camera"}`,
    url: asset.url,
    storagePath: asset.storagePath,
    sourceStoragePath: asset.storagePath,
    startRequest: start + offset,
    endRequest: end + offset,
    duration: end - start,
    isLocal: false,
  };
};
