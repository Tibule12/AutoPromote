import { isValidTimezone, zonedFieldsToIso } from "../../../UserDashboardTabs/scheduleReleaseModel";
import { buildTikTokCaption } from "./publishingUtils";

export const PUBLISHER_PLATFORMS = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"];
export const PUBLISHER_STEPS = ["Content", "Destinations", "Customize", "Delivery", "Review"];
const text = value => String(value || "").trim();
export const mediaUrl = file => typeof file === "string" ? file : file?.url || "";

export function assetFromContent(content) {
  const url = [content.persistentMediaUrl, content.url, content.mediaUrl, content.media_url,
    content.downloadInfo?.url, content.processedUrl].find(value => typeof value === "string" && /^https?:\/\//i.test(value));
  if (!url) return null;
  const type = String(content.type || content.mediaType || "video");
  return {
    url, type: type.startsWith("image") ? "image/jpeg" : "video/mp4",
    name: content.title || "Project asset", suggestedTitle: content.title || "",
    suggestedDescription: content.description || content.caption || "",
    thumbnailUrl: content.posterUrl || content.thumbnailUrl || content.selectedThumbnailUrl || "",
    duration: content.duration || content.meta?.duration,
    sourceContentId: content.id,
    source: content.source || content.origin || content.meta?.source,
    templateName: content.templateName || content.template?.name || content.meta?.template?.name,
    width: content.width || content.meta?.width,
    height: content.height || content.meta?.height,
  };
}

export function sourceLabels(asset) {
  const source = String(asset?.source || asset?.origin || asset?.workflowAction || asset?.meta?.source || "").toLowerCase();
  const studio = ["studio", "viral_clip_studio", "viral-clip-studio", "viral-clip-rendered"].includes(source);
  const template = asset?.templateName || asset?.template?.name || asset?.meta?.template?.name;
  return { origin: studio ? "Created in Studio" : "", template: typeof template === "string" && template.trim() ? `Template: ${template.trim()}` : "" };
}

export function connectionState(snapshot, platform, loaded) {
  if (!loaded) return { connected: false, label: "Checking connection" };
  const value = snapshot?.raw?.[platform] || snapshot?.summary?.[platform];
  if (!value || typeof value.connected !== "boolean") return { connected: false, label: "Connection unavailable" };
  return { connected: value.connected, label: value.connected ? "Connected" : "Not connected" };
}

export function platformIssues(platform, data, context = {}) {
  const errors = [];
  if (!context.connection?.connected) errors.push(context.connection?.label || "Connect this destination");
  if (!context.visited) errors.push("Review this destination's settings");
  if (!data.file) errors.push("Choose media for this destination");
  if (["youtube", "reddit"].includes(platform) && !text(data.title)) errors.push("Enter a title");
  if (platform === "youtube" && text(data.title).length > 100) errors.push("Keep the YouTube title within 100 characters");
  if (platform === "facebook" && !text(data.pageId)) errors.push("Choose a Facebook Page");
  if (platform === "instagram" && !data.pageId && !context.instagramAccountId) errors.push("Choose an Instagram account");
  if (platform === "reddit") {
    if (!text(data.subreddit)) errors.push("Choose a subreddit");
    if (text(data.title).length > 300) errors.push("Keep the Reddit title within 300 characters");
    if (data.kind === "self" && !text(data.text)) errors.push("Enter post text");
    if (data.kind === "link" && !/^https?:\/\//i.test(text(data.url))) errors.push("Enter a valid post link");
  }
  if (platform === "linkedin" && data.postingTarget === "company" && !/^\d+$/.test(text(data.companyId))) errors.push("Enter the company Page ID");
  if (platform === "tiktok") {
    if (!text(data.privacy)) errors.push("Select TikTok privacy");
    const aliases = { EVERYONE: "PUBLIC_TO_EVERYONE", FRIENDS: "MUTUAL_FOLLOW_FRIENDS" };
    const normalize = value => aliases[value] || value;
    if (context.creator?.privacy_level_options?.length && !context.creator.privacy_level_options.some(value => normalize(value) === normalize(data.privacy))) errors.push("Choose an available TikTok privacy option");
    if (!data.consentChecked) errors.push("Confirm the TikTok declaration");
    if (data.commercialContent && !data.yourBrand && !data.brandedContent) errors.push("Select the commercial content disclosure");
    if (data.brandedContent && data.privacy === "SELF_ONLY") errors.push("Branded content cannot use private visibility");
    if (context.creator?.posting_remaining === 0) errors.push("TikTok's posting limit has been reached");
    if (context.publishReady === false) errors.push("Reconnect TikTok with publishing permissions");
  }
  return errors;
}

export function masterCopyFor(platform, title, description) {
  const common = { title, description };
  if (platform === "tiktok") return { ...common, caption: buildTikTokCaption({ title, description }) };
  if (platform === "instagram") return { ...common, caption: [title, description].filter(Boolean).join("\n\n") };
  if (platform === "facebook") return { ...common, message: description };
  if (platform === "linkedin") return { ...common, commentary: description };
  if (platform === "reddit") return { ...common, text: description };
  return common;
}

// Used both for review and submission, preserving the existing platform option names.
export function preparePlatformOptions(platform, data, title, description) {
  const options = { ...data };
  delete options.file;
  if (mediaUrl(data.file)) options.media_url = mediaUrl(data.file);
  if (platform === "tiktok") {
    options.caption = buildTikTokCaption({ title: data.title || title, description: data.description || description, caption: data.caption });
    options.commercial = { isCommercial: data.commercialContent, yourBrand: data.yourBrand,
      brandedContent: data.brandedContent, is_commercial_content: data.commercialContent };
  }
  if (platform === "instagram" && options.isPaidPartnership && !options.sponsorUser) options.isPaidPartnership = false;
  return options;
}

export function destinationCopy(platform, options, masterTitle, masterDescription) {
  return {
    title: text(options.title || masterTitle),
    body: text(platform === "facebook" ? options.message || masterDescription :
      platform === "linkedin" ? options.commentary || options.description || masterDescription :
      platform === "reddit" ? options.text || masterDescription :
      platform === "instagram" || platform === "tiktok" ? options.caption || masterDescription :
      options.description || masterDescription),
  };
}

export function resolveDelivery({ mode, date, time, timezone, customTimes = {}, platforms = [], now = Date.now() }) {
  if (mode === "now") return { scheduledTime: "", platformTimes: {} };
  if (mode !== "schedule" || !isValidTimezone(timezone)) throw new Error("Choose a valid delivery mode and timezone.");
  const scheduledTime = zonedFieldsToIso(date, time, timezone);
  if (Date.parse(scheduledTime) <= now) throw new Error("Choose a future publish time.");
  const platformTimes = {};
  for (const platform of platforms) {
    const fields = customTimes[platform];
    if (!fields) continue;
    const instant = zonedFieldsToIso(fields.date || date, fields.time || time, timezone);
    if (Date.parse(instant) <= now) throw new Error(`${platform} needs a future publish time.`);
    platformTimes[platform] = instant;
  }
  return { scheduledTime, platformTimes };
}
