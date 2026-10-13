export const PLATFORM_ORDER = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"];

export const PLATFORM_NAMES = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
};

const STATUS_NAMES = {
  draft: "Ready",
  ready: "Ready",
  pending: "Scheduled",
  queued: "Scheduled",
  scheduled: "Scheduled",
  paused: "Paused",
  processing: "Publishing",
  publishing: "Publishing",
  posted: "Published",
  success: "Published",
  // The scheduler marks an item executed after queuing a provider task;
  // delivery has not been confirmed at that point.
  executed: "Publishing",
  completed: "Published",
  failed: "Failed",
  error: "Failed",
  skipped: "Failed",
};

export function scheduleStatus(schedule) {
  const raw = String(schedule?.status || "").toLowerCase();
  if (
    raw === "paused" ||
    (schedule?.isActive === false &&
      !["completed", "executed", "posted", "success", "failed", "error"].includes(raw))
  ) {
    return "Paused";
  }
  return STATUS_NAMES[raw] || (schedule?.isActive === false ? "Paused" : "Scheduled");
}

export function isValidTimezone(timezone) {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch (_) {
    return false;
  }
}

export function displayTimezone(schedule, fallback = "UTC") {
  if (isValidTimezone(schedule?.timezone)) return { value: schedule.timezone, recorded: true };
  return { value: isValidTimezone(fallback) ? fallback : "UTC", recorded: false };
}

export function formatScheduleTime(value, timezone, options = {}) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimezone(timezone) ? timezone : "UTC",
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}

function dateParts(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(
    parts.filter(part => part.type !== "literal").map(part => [part.type, part.value])
  );
}

export function localFields(value, timezone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: "", time: "" };
  const p = dateParts(value, timezone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function zonedFieldsToIso(date, time, timezone) {
  if (
    !isValidTimezone(timezone) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time)
  ) {
    throw new Error("Enter a valid date, time, and timezone.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  if (
    !Number.isFinite(desired) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error("Enter a valid date and time.");
  }
  let guess = desired;
  for (let i = 0; i < 4; i += 1) {
    const p = dateParts(guess, timezone);
    const observed = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute)
    );
    const difference = desired - observed;
    guess += difference;
    if (difference === 0) break;
  }
  const result = new Date(guess);
  const roundTrip = localFields(result, timezone);
  if (roundTrip.date !== date || roundTrip.time !== time) {
    throw new Error("That local time does not exist in this timezone. Choose another time.");
  }
  return result.toISOString();
}

export function releaseIdentity(title) {
  const match = String(title || "").match(
    /^Made in AutoPromote:\s*(.*?)\s*[—–-]\s*the\s+(timeline|final edit)$/i
  );
  if (!match) return { subject: String(title || "Untitled release"), variant: null };
  return {
    subject: match[1],
    variant: match[2].toLowerCase() === "timeline" ? "Timeline" : "Final Edit",
  };
}

function uniquePlatforms(schedule) {
  const values =
    Array.isArray(schedule?.platforms) && schedule.platforms.length
      ? schedule.platforms
      : schedule?.platform
        ? [schedule.platform]
        : [];
  return Array.from(new Set(values.map(value => String(value).toLowerCase()).filter(Boolean)));
}

export function groupSchedules(schedules = [], contents = []) {
  const contentById = new Map(
    (Array.isArray(contents) ? contents : []).map(content => [String(content.id), content])
  );
  const groups = new Map();
  (Array.isArray(schedules) ? schedules : []).forEach(schedule => {
    if (
      !schedule?.id ||
      ["cancelled", "canceled", "deleted"].includes(String(schedule.status || "").toLowerCase())
    )
      return;
    const title = String(
      schedule.title || contentById.get(String(schedule.contentId))?.title || "Untitled release"
    ).trim();
    const time = schedule.startTime || schedule.time || "";
    const identity = releaseIdentity(title);
    // Studio destinations can refer to different content records (Reddit in
    // the existing six-platform releases does). Their shared named variant
    // and publish instant identify one release without changing queue IDs.
    const instant = Number.isFinite(new Date(time).getTime()) ? new Date(time).toISOString() : time;
    const key = identity.variant
      ? `variant:${title.toLowerCase()}|${instant}`
      : `${schedule.contentId || `title:${title.toLowerCase()}`}|${instant}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        title,
        subject: identity.subject,
        variant: identity.variant,
        time,
        content: contentById.get(String(schedule.contentId)) || null,
        destinations: [],
      });
    }
    const release = groups.get(key);
    const destinationContent = contentById.get(String(schedule.contentId)) || null;
    if (
      !release.content ||
      (release.destinations.every(item => item.platform === "reddit") &&
        !uniquePlatforms(schedule).includes("reddit"))
    ) {
      release.content = destinationContent || release.content;
    }
    uniquePlatforms(schedule).forEach(platform => {
      release.destinations.push({
        platform,
        schedule,
        content: destinationContent,
        status: scheduleStatus(schedule),
      });
    });
  });
  return Array.from(groups.values())
    .map(release => {
      release.destinations.sort((a, b) => {
        const ai = PLATFORM_ORDER.indexOf(a.platform);
        const bi = PLATFORM_ORDER.indexOf(b.platform);
        return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.platform.localeCompare(b.platform);
      });
      return release;
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function aggregateStatus(destinations) {
  const counts = destinations.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const total = destinations.length;
  if (!total) return "No destinations";
  if (counts.Scheduled === total) return `${total}/${total} destinations scheduled`;
  const order = ["Ready", "Scheduled", "Publishing", "Published", "Failed", "Paused"];
  return order
    .filter(status => counts[status])
    .map(status => `${counts[status]} ${status.toLowerCase()}`)
    .join(" · ");
}

export function scheduleCopy(schedule, content) {
  const settings = schedule?.platformSpecificSettings || {};
  return {
    title:
      settings.title ||
      content?.platformOptions?.[schedule?.platform]?.title ||
      content?.title ||
      schedule?.title ||
      "",
    caption:
      settings.caption ||
      settings.description ||
      content?.platformOptions?.[schedule?.platform]?.caption ||
      content?.description ||
      content?.caption ||
      "",
  };
}

export function releaseMedia(content) {
  if (!content) return { poster: "", url: "", kind: "" };
  const firstUrl = (...values) =>
    values.find(value => typeof value === "string" && /^https?:\/\//i.test(value)) || "";
  const poster = firstUrl(
    content.posterUrl,
    content.thumbnailUrl,
    content.selectedThumbnailUrl,
    content.thumbnail
  );
  const url = firstUrl(
    content.processedUrl,
    content.persistentMediaUrl,
    content.downloadInfo?.url,
    content.mediaUrl,
    content.media_url,
    content.video_url,
    content.file_url,
    content.url
  );
  const kind = String(content.type || content.mediaType || "").toLowerCase();
  return {
    poster,
    url,
    kind: kind.includes("image") || /\.(png|jpe?g|webp)(\?|$)/i.test(url) ? "image" : "video",
  };
}
