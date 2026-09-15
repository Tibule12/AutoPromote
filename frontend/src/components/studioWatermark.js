const clamp = (value, min, max, fallback = min) => {
  const numeric = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : fallback));
};

export const WATERMARK_VARIANTS = [
  {
    id: "studio",
    label: "Viral Clip Studio",
    featureLabel: "VIRAL CLIP STUDIO",
    text: "AutoPromote · Viral Clip Studio",
  },
  {
    id: "general",
    label: "AutoPromote",
    featureLabel: "CREATE · GROW · PUBLISH",
    text: "AutoPromote",
  },
];

export const WATERMARK_SAFE_POSITIONS = [
  { id: "top_left", left: 6, top: 7, width: 28, height: 8 },
  { id: "top_right", left: 66, top: 7, width: 28, height: 8 },
  { id: "middle_left", left: 6, top: 45, width: 28, height: 8 },
  { id: "middle_right", left: 66, top: 45, width: 28, height: 8 },
  { id: "bottom_left", left: 6, top: 83, width: 28, height: 8 },
  { id: "bottom_right", left: 66, top: 83, width: 28, height: 8 },
];

const rectanglesOverlap = (left, right) =>
  left.left < right.left + right.width &&
  left.left + left.width > right.left &&
  left.top < right.top + right.height &&
  left.top + left.height > right.top;

const normalizePlacement = value =>
  String(value || "auto")
    .trim()
    .toLowerCase();

const captionRectForPlacement = placement => {
  const normalized = normalizePlacement(placement);
  if (normalized.includes("top")) {
    return {
      left: normalized.includes("left") ? 5 : normalized.includes("right") ? 45 : 15,
      top: 8,
      width: normalized.includes("left") || normalized.includes("right") ? 50 : 70,
      height: 20,
    };
  }
  if (normalized.includes("middle") || normalized.includes("center")) {
    return {
      left: normalized.includes("left") ? 5 : normalized.includes("right") ? 45 : 15,
      top: 38,
      width: normalized.includes("left") || normalized.includes("right") ? 50 : 70,
      height: 24,
    };
  }
  return {
    left: normalized.includes("left") ? 5 : normalized.includes("right") ? 45 : 12,
    top: 68,
    width: normalized.includes("left") || normalized.includes("right") ? 50 : 76,
    height: 22,
  };
};

const overlayRect = overlay => {
  const mode = String(overlay?.bRollMode || "").toLowerCase();
  if (mode === "fullscreen") return null;
  if (mode === "sidebyside" || mode === "side_by_side") {
    return { left: 50, top: 0, width: 50, height: 100 };
  }
  const width = clamp(overlay?.width, 8, 100, 35);
  const height = clamp(overlay?.height, 8, 100, 35);
  const centerX = clamp(overlay?.x, 0, 100, 75);
  const centerY = clamp(overlay?.y, 0, 100, 28);
  return {
    left: clamp(centerX - width / 2, 0, 100 - width, 0),
    top: clamp(centerY - height / 2, 0, 100 - height, 0),
    width,
    height,
  };
};

const isTimedItemActive = (item, time) => {
  const start = Number(item?.startTime ?? item?.start_time ?? item?.start ?? 0);
  const explicitEnd = Number(item?.endTime ?? item?.end_time ?? item?.end);
  const end = Number.isFinite(explicitEnd)
    ? explicitEnd
    : start + Math.max(0, Number(item?.duration || 0));
  return time >= start && time < Math.max(start + 0.05, end);
};

const buildConflictRegions = ({
  time,
  captions,
  captionPosition,
  overlays,
  hookEnabled,
  hookEndTime,
  aspect,
}) => {
  const conflicts = [];

  // Auto Reframe deliberately keeps a speaking subject in the central portrait
  // zone. Reserve that zone even before worker tracking samples exist.
  conflicts.push(
    aspect === "16:9"
      ? { left: 34, top: 12, width: 32, height: 75, weight: 7 }
      : { left: 27, top: 13, width: 46, height: 58, weight: 8 }
  );

  (captions || [])
    .filter(item => isTimedItemActive(item, time))
    .forEach(item => {
      conflicts.push({
        ...captionRectForPlacement(
          item.captionPlacement || item.caption_placement || captionPosition
        ),
        weight: 12,
      });
    });

  if (!(captions || []).length && captionPosition) {
    conflicts.push({ ...captionRectForPlacement(captionPosition), weight: 4 });
  }

  (overlays || [])
    .filter(item => isTimedItemActive(item, time))
    .forEach(item => {
      const rect = overlayRect(item);
      if (rect) conflicts.push({ ...rect, weight: 14 });
    });

  if (hookEnabled && time <= Math.max(0.1, Number(hookEndTime || 3))) {
    conflicts.push({ left: 8, top: 6, width: 84, height: 31, weight: 15 });
  }

  return conflicts;
};

export const buildWatermarkMovementSchedule = ({
  duration,
  captions = [],
  captionPosition = "lower",
  overlays = [],
  hookEnabled = false,
  hookEndTime = 0,
  aspect = "9:16",
  destination = "general",
  interval = 3.75,
} = {}) => {
  const safeDuration = Math.max(0.1, Number(duration || 0.1));
  const cueDuration = clamp(interval, 2.5, 8, 3.75);
  const cueCount = Math.max(1, Math.ceil(safeDuration / cueDuration));
  const schedule = [];
  let previousPosition = null;

  for (let index = 0; index < cueCount; index += 1) {
    const startTime = Number((index * cueDuration).toFixed(3));
    const endTime = Number(Math.min(safeDuration, (index + 1) * cueDuration).toFixed(3));
    const sampleTime = startTime + Math.max(0.01, (endTime - startTime) / 2);
    const conflicts = buildConflictRegions({
      time: sampleTime,
      captions,
      captionPosition,
      overlays,
      hookEnabled,
      hookEndTime,
      aspect,
    });

    const priorPosition = previousPosition;
    const ranked = WATERMARK_SAFE_POSITIONS.map((position, candidateIndex) => {
      const collisionPenalty = conflicts.reduce(
        (score, conflict) =>
          score + (rectanglesOverlap(position, conflict) ? Number(conflict.weight || 10) : 0),
        0
      );
      const platformPenalty =
        ["tiktok", "reels", "shorts"].includes(String(destination).toLowerCase()) &&
        ["middle_right", "bottom_right"].includes(position.id)
          ? 5
          : 0;
      const repeatPenalty = position.id === priorPosition ? 9 : 0;
      const rhythmPenalty =
        (candidateIndex - index + WATERMARK_SAFE_POSITIONS.length) %
        WATERMARK_SAFE_POSITIONS.length;
      return {
        position,
        score: collisionPenalty * 100 + platformPenalty * 10 + repeatPenalty * 10 + rhythmPenalty,
      };
    }).sort((left, right) => left.score - right.score);

    const selected = ranked[0].position;
    previousPosition = selected.id;
    schedule.push({
      startTime,
      endTime,
      position: selected.id,
      left: selected.left,
      top: selected.top,
      width: selected.width,
      height: selected.height,
    });
  }

  return schedule;
};

export const getActiveWatermarkCue = (schedule, time) => {
  const cues = Array.isArray(schedule) ? schedule : [];
  const safeTime = Math.max(0, Number(time || 0));
  return (
    cues.find(
      cue => safeTime >= Number(cue.startTime || 0) && safeTime < Number(cue.endTime || 0)
    ) ||
    cues[cues.length - 1] ||
    WATERMARK_SAFE_POSITIONS[0]
  );
};

export const getWatermarkPreviewStyle = cue => ({
  left: `${clamp(cue?.left, 0, 95, 6)}%`,
  top: `${clamp(cue?.top, 0, 92, 7)}%`,
});
