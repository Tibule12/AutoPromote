import {
  assetFromContent, connectionState, masterCopyFor, platformIssues, preparePlatformOptions,
  resolveDelivery, sourceLabels, destinationCopy,
} from "../publisherWorkflow";

const connected = { connection: { connected: true }, visited: true };
const file = { url: "https://example.test/coffee.mp4", type: "video/mp4" };

test("owned assets reuse their stored source URL and preserve real provenance", () => {
  const asset = assetFromContent({ id: "source-12", url: file.url, processedUrl: "https://example.test/old.mp4", title: "Coffee", source: "studio", meta: { template: { name: "Coffee launch" }, duration: 24 } });
  expect(asset.url).toBe(file.url);
  expect(asset.sourceContentId).toBe("source-12");
  expect(sourceLabels(asset)).toEqual({ origin: "Created in Studio", template: "Template: Coffee launch" });
  expect(sourceLabels({ name: "Made in Studio.mp4" })).toEqual({ origin: "", template: "" });
  expect(assetFromContent({ id: "missing", url: "javascript:bad" })).toBeNull();
});

test("connection status must come from a real loaded status snapshot", () => {
  expect(connectionState({}, "reddit", false).label).toBe("Checking connection");
  expect(connectionState({}, "reddit", true).connected).toBe(false);
  expect(connectionState({ raw: { reddit: { connected: false } }, summary: { reddit: { connected: true } } }, "reddit", true).connected).toBe(false);
});

test("a connected account does not satisfy required Reddit fields or form review", () => {
  expect(platformIssues("reddit", { file, title: "Coffee" }, connected)).toContain("Choose a subreddit");
  expect(platformIssues("reddit", { file, title: "Coffee", subreddit: "coffee" }, { ...connected, visited: false })).toContain("Review this destination's settings");
  expect(platformIssues("reddit", { file, title: "Coffee", subreddit: "coffee" }, connected)).toEqual([]);
  expect(platformIssues("reddit", { file, title: "Coffee", subreddit: "coffee", kind: "self", text: "" }, connected)).toContain("Enter post text");
  expect(platformIssues("reddit", { file, title: "Coffee", subreddit: "coffee", kind: "link", url: "invalid" }, connected)).toContain("Enter a valid post link");
});

test("TikTok declarations, creator limits and authorization cannot be bypassed", () => {
  const data = { file, privacy: "PUBLIC_TO_EVERYONE", consentChecked: true };
  expect(platformIssues("tiktok", data, { ...connected, creator: { privacy_level_options: ["SELF_ONLY"] } })).toContain("Choose an available TikTok privacy option");
  expect(platformIssues("tiktok", data, { ...connected, publishReady: false })).toContain("Reconnect TikTok with publishing permissions");
  expect(platformIssues("tiktok", { ...data, consentChecked: false }, connected)).toContain("Confirm the TikTok declaration");
  expect(platformIssues("tiktok", { ...data, brandedContent: true, privacy: "SELF_ONLY" }, connected)).toContain("Branded content cannot use private visibility");
  expect(platformIssues("tiktok", data, { ...connected, creator: { posting_remaining: 0 } })).toContain("TikTok's posting limit has been reached");
});

test("Page selection and company targets stay distinct from connection status", () => {
  expect(platformIssues("facebook", { file }, connected)).toContain("Choose a Facebook Page");
  expect(platformIssues("instagram", { file }, connected)).toContain("Choose an Instagram account");
  expect(platformIssues("linkedin", { file, postingTarget: "company", companyId: "" }, connected)).toContain("Enter the company Page ID");
});

test("master copy copies text only and submission/review use the same caption builder", () => {
  expect(masterCopyFor("facebook", "Master", "Body")).toEqual({ title: "Master", description: "Body", message: "Body" });
  expect(masterCopyFor("reddit", "Master", "Body")).not.toHaveProperty("subreddit");
  const data = { file, title: "TikTok title", description: "Body", privacy: "SELF_ONLY" };
  const options = preparePlatformOptions("tiktok", data, "Master", "Master body");
  expect(options).not.toHaveProperty("file");
  expect(options.media_url).toBe(file.url);
  expect(options.caption).toBe("TikTok title\nBody");
  expect(destinationCopy("tiktok", options).body).toBe(options.caption);
});

test("selected timezone defines the instant independently of browser timezone", () => {
  const result = resolveDelivery({ mode: "schedule", date: "2030-10-21", time: "16:00", timezone: "Africa/Johannesburg", platforms: ["reddit", "youtube"], customTimes: { youtube: { time: "17:30" } }, now: 0 });
  expect(result.scheduledTime).toBe("2030-10-21T14:00:00.000Z");
  expect(result.platformTimes.youtube).toBe("2030-10-21T15:30:00.000Z");
  expect(resolveDelivery({ mode: "now", date: "2030-10-21", time: "16:00", timezone: "Africa/Johannesburg", customTimes: { youtube: { time: "17:30" } } })).toEqual({ scheduledTime: "", platformTimes: {} });
});

test("Schedule cannot silently become immediate and rejects invalid or past times", () => {
  expect(() => resolveDelivery({ mode: "schedule", date: "", time: "16:00", timezone: "UTC" })).toThrow();
  expect(() => resolveDelivery({ mode: "schedule", date: "2020-01-01", time: "16:00", timezone: "UTC" })).toThrow(/future/);
  expect(() => resolveDelivery({ mode: "schedule", date: "2030-03-10", time: "02:30", timezone: "America/New_York", now: 0 })).toThrow(/does not exist/);
});
