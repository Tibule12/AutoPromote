import React from "react";
import { STORAGE_UPLOAD_LIMIT_MB } from "../../../utils/sourceUpload";

import { buildBackendUploadError } from "../../../utils/sourceUpload";
import { API_ENDPOINTS } from "../../../config";
import { withWorkspaceHeaders } from "../../../utils/workspace";


export const PLATFORM_LABELS = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  reddit: "Reddit",
};

export const getPlatformName = platformId => {
  if (!platformId) return "";
  return (
    PLATFORM_LABELS[platformId] || `${platformId.charAt(0).toUpperCase()}${platformId.slice(1)}`
  );
};

export const DEFAULT_SELECTED_PLATFORMS = ["tiktok", "youtube"];

export const buildMediaMeta = ({
  trimStart = 0,
  trimEnd = 0,
  rotate = 0,
  flipH = false,
  flipV = false,
  filter = null,
  duration = 0,
} = {}) => ({
  trimStart: trimStart > 0 ? trimStart : undefined,
  trimEnd: trimEnd > 0 ? trimEnd : undefined,
  rotate: rotate !== 0 ? rotate : undefined,
  flipH: flipH ? true : undefined,
  flipV: flipV ? true : undefined,
  filter: filter || undefined,
  duration: duration || undefined,
});

export const hasMeaningfulMediaMeta = meta =>
  !!(
    meta && Object.values(meta).some(value => value !== undefined && value !== null && value !== "")
  );

export const formatFileSize = bytes => {
  const size = Number(bytes) || 0;
  if (size <= 0) return "unknown size";
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
};

export const getBrowserPreviewFailureMessage = (file, mediaElement) => {
  const fileName = file?.name || "This video";
  const fileType = file?.type || "";
  const extension = String(fileName).split(".").pop()?.toLowerCase() || "";
  const sizeText = file?.size ? formatFileSize(file.size) : "";
  const sizePrefix = sizeText ? `${fileName} is ${sizeText}. ` : "";
  const isOverUploadLimit = file?.size > STORAGE_UPLOAD_LIMIT_MB * 1024 * 1024;
  const isMov = extension === "mov" || fileType === "video/quicktime";
  const canPlayDeclaredType =
    typeof document !== "undefined" && fileType
      ? document.createElement("video").canPlayType(fileType)
      : "";
  const mediaErrorCode = mediaElement?.error?.code;

  if (isOverUploadLimit) {
    const uploadLimitNote = `It is above the current ${STORAGE_UPLOAD_LIMIT_MB}MB upload limit, so publishing will be blocked until it is compressed, trimmed, or uploaded through a large-file/resumable pipeline. `;
    if (isMov || canPlayDeclaredType === "" || mediaErrorCode === 3 || mediaErrorCode === 4) {
      return `${sizePrefix}${uploadLimitNote}Chrome also cannot preview this MOV/codec locally. Firefox may preview it, but for AutoPromote upload today use H.264 MP4 + AAC audio under ${STORAGE_UPLOAD_LIMIT_MB}MB.`;
    }
    return `${sizePrefix}${uploadLimitNote}`;
  }

  if (isMov || canPlayDeclaredType === "" || mediaErrorCode === 4) {
    return `${sizePrefix}The file was selected, but this browser cannot preview its video codec/container. iPhone .MOV files often use HEVC/H.265, which Chrome/Linux may reject even though the backend can still upload or process it. Convert/export to H.264 MP4 for reliable local preview, or try Firefox/VLC to confirm the file.`;
  }

  if (file?.size > STORAGE_UPLOAD_LIMIT_MB * 1024 * 1024) {
    return `${sizePrefix}This is above the current ${STORAGE_UPLOAD_LIMIT_MB}MB upload limit, so it may not publish until it is compressed or trimmed.`;
  }

  return `${sizePrefix}The browser could not decode this preview. The upload may still be possible, but for reliable preview/export use H.264 MP4 with AAC audio.`;
};

export const normalizeEditedAsset = (result, fallbackName = "edited-media") => {
  if (!result) return null;
  if (result instanceof File) return result;
  if (result instanceof Blob) {
    const extension = result.type && result.type.startsWith("image/") ? ".png" : ".mp4";
    return new File([result], `${fallbackName}${extension}`, { type: result.type || undefined });
  }
  return result;
};

export const buildStructuredUploadError = (result, fallbackMessage, httpStatus) => {
  const serverErr =
    (result && (result.error || result.message || result.text)) ||
    fallbackMessage ||
    "Upload failed";
  const enrichedError = new Error(serverErr);
  if (result && typeof result === "object") {
    enrichedError.code = result.code;
    enrichedError.context = result.context || null;
    enrichedError.upgradeRequired = result.upgrade_required === true;
  }
  if (httpStatus) enrichedError.httpStatus = httpStatus;
  return enrichedError;
};

export const EXPECTED_PUBLISH_BLOCK_CODES = new Set([
  "TIER_LIMIT_EXCEEDED",
  "PLATFORM_LIMIT_EXCEEDED",
  "UPLOAD_CAP_EXCEEDED",
  "PROMOTION_TASK_QUOTA_EXCEEDED",
]);

export const formatMonthLabel = monthKey => {
  if (!monthKey || typeof monthKey !== "string") return "this month";
  const parsed = Date.parse(`${monthKey}-01T00:00:00Z`);
  if (!Number.isFinite(parsed)) return monthKey;
  return new Date(parsed).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const buildClientUploadError = error => {
  return buildBackendUploadError(error);
};

export const buildTikTokCaption = ({ title, description, caption }) => {
  const manualCaption = String(caption || "").trim();
  if (manualCaption) return manualCaption;
  return [String(title || "").trim(), String(description || "").trim()].filter(Boolean).join("\n");
};

export const toIsoDateTimeOrNull = value => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export const todayDateValue = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

export const splitDateTimeValue = value => {
  if (typeof value !== "string" || !value.trim()) {
    return { date: "", time: "" };
  }
  const [date = "", rawTime = ""] = value.split("T");
  return { date, time: rawTime.slice(0, 5) };
};

export const mergeDateTimeValue = (currentValue, patch = {}) => {
  const current = splitDateTimeValue(currentValue);
  const date = Object.prototype.hasOwnProperty.call(patch, "date") ? patch.date : current.date;
  const time = Object.prototype.hasOwnProperty.call(patch, "time") ? patch.time : current.time;

  if (!date) return "";
  return `${date}T${time || "09:00"}`;
};

export const DateTimeSplitControl = ({ value, onChange, compact = false }) => {
  const { date, time } = splitDateTimeValue(value);

  return (
    <div className={`datetime-split-control ${compact ? "compact" : ""}`}>
      <label className="datetime-part date-part">
        <span>Date</span>
        <input
          type="date"
          value={date}
          onChange={event => onChange(mergeDateTimeValue(value, { date: event.target.value }))}
        />
      </label>
      <label className="datetime-part time-part">
        <span>Time</span>
        <input
          type="time"
          value={time}
          onChange={event =>
            onChange(
              mergeDateTimeValue(value, {
                date: date || todayDateValue(),
                time: event.target.value,
              })
            )
          }
        />
      </label>
      {!compact && value ? (
        <button type="button" className="datetime-clear-btn" onClick={() => onChange("")}>
          Clear
        </button>
      ) : null}
    </div>
  );
};

export const buildPlatformScheduleTimes = ({
  platforms,
  scheduledTime,
  customPlatformSchedule,
  platformScheduleTimes,
}) => {
  if (!customPlatformSchedule || !scheduledTime || !Array.isArray(platforms)) return {};

  return platforms.reduce((acc, platform) => {
    const rawValue = platformScheduleTimes?.[platform] || scheduledTime;
    const isoValue = toIsoDateTimeOrNull(rawValue);
    if (isoValue) acc[platform] = isoValue;
    return acc;
  }, {});
};

export function normalizeTikTokCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const displayName =
    primary?.display_name ||
    primary?.user?.display_name ||
    primary?.profile?.display_name ||
    primary?.profile?.username ||
    fallbackRaw?.display_name ||
    fallbackRaw?.meta?.display_name ||
    fallbackRaw?.profile?.username ||
    fallbackSummary?.display_name ||
    primary?.open_id ||
    fallbackRaw?.open_id ||
    null;

  if (!displayName && !primary && !fallbackRaw && !fallbackSummary) {
    return null;
  }

  return {
    ...(fallbackRaw || {}),
    ...(primary || {}),
    display_name: displayName,
    open_id: primary?.open_id || fallbackRaw?.open_id || displayName,
  };
}

export function normalizeYouTubeCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const source =
    primary?.channel ||
    primary ||
    fallbackRaw?.channel ||
    (fallbackSummary?.channelTitle || fallbackSummary?.display_name
      ? {
          snippet: {
            title: fallbackSummary.channelTitle || fallbackSummary.display_name,
          },
        }
      : null);

  const title =
    source?.snippet?.title ||
    fallbackRaw?.display_name ||
    fallbackSummary?.channelTitle ||
    fallbackSummary?.display_name ||
    null;
  const thumbnailUrl =
    source?.snippet?.thumbnails?.default?.url ||
    source?.snippet?.thumbnails?.medium?.url ||
    source?.snippet?.thumbnails?.high?.url ||
    null;

  if (!title && !thumbnailUrl && !primary && !fallbackRaw && !fallbackSummary) {
    return null;
  }

  return {
    ...(source || {}),
    snippet: {
      ...(source?.snippet || {}),
      title: title || source?.snippet?.title || "Unknown Channel",
      thumbnails: {
        ...(source?.snippet?.thumbnails || {}),
        default: thumbnailUrl
          ? {
              ...(source?.snippet?.thumbnails?.default || {}),
              url: thumbnailUrl,
            }
          : source?.snippet?.thumbnails?.default,
      },
    },
  };
}

export function normalizeLinkedInCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const localizedName =
    primary?.meta?.localizedName ||
    primary?.localizedName ||
    [primary?.localizedFirstName, primary?.localizedLastName].filter(Boolean).join(" ") ||
    fallbackRaw?.meta?.display_name ||
    fallbackSummary?.display_name ||
    null;
  const profilePicture =
    primary?.profilePicture ||
    primary?.meta?.profilePicture ||
    fallbackRaw?.profilePicture ||
    fallbackRaw?.meta?.profilePicture ||
    null;
  const followers =
    primary?.meta?.followers ||
    primary?.followers ||
    fallbackRaw?.meta?.followers ||
    fallbackSummary?.followers ||
    null;

  if (
    !localizedName &&
    !profilePicture &&
    !followers &&
    !primary &&
    !fallbackRaw &&
    !fallbackSummary
  ) {
    return null;
  }

  const [firstName, ...restName] = (localizedName || "").split(" ").filter(Boolean);

  return {
    ...(fallbackRaw || {}),
    ...(primary || {}),
    localizedName,
    localizedFirstName: primary?.localizedFirstName || firstName || null,
    localizedLastName: primary?.localizedLastName || restName.join(" ") || null,
    profilePicture,
    meta: {
      ...((fallbackRaw && fallbackRaw.meta) || {}),
      ...((primary && primary.meta) || {}),
      localizedName,
      followers,
      profilePicture,
    },
  };
}

export function normalizeRedditCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const username =
    primary?.name ||
    primary?.meta?.name ||
    primary?.meta?.username ||
    fallbackRaw?.meta?.username ||
    fallbackRaw?.name ||
    fallbackSummary?.name ||
    fallbackSummary?.display_name ||
    null;
  const iconImg =
    primary?.icon_img ||
    primary?.meta?.icon_img ||
    fallbackRaw?.icon_img ||
    fallbackRaw?.meta?.icon_img ||
    null;
  const totalKarma =
    primary?.total_karma ||
    primary?.meta?.total_karma ||
    fallbackRaw?.total_karma ||
    fallbackRaw?.meta?.total_karma ||
    null;

  if (!username && !iconImg && !primary && !fallbackRaw && !fallbackSummary) {
    return null;
  }

  return {
    ...(fallbackRaw || {}),
    ...(primary || {}),
    name: username,
    icon_img: iconImg,
    total_karma: totalKarma,
    meta: {
      ...((fallbackRaw && fallbackRaw.meta) || {}),
      ...((primary && primary.meta) || {}),
      name: username,
      username,
      icon_img: iconImg,
      total_karma: totalKarma,
    },
  };
}

export function normalizeUpgradePlanId(planId) {
  if (!planId) return null;
  const normalized = String(planId).trim().toLowerCase();
  if (["starter", "free"].includes(normalized)) return "free";
  if (["basic", "premium", "creator"].includes(normalized)) return "premium";
  if (["pro", "studio"].includes(normalized)) return "pro";
  if (["enterprise", "team"].includes(normalized)) return "enterprise";
  return normalized;
}

export async function fetchPlatformStatusSnapshot(token) {
  const res = await fetch(API_ENDPOINTS.PLATFORM_STATUS, {
    headers: withWorkspaceHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  if (!res.ok) return { raw: {}, summary: {} };
  const json = await res.json();
  return {
    raw: json.raw || {},
    summary: json.summary || {},
  };
}

// --- Sub-components ---