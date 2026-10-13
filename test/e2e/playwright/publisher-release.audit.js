/* Run after a local frontend build:
 * PUBLISHER_CHROMIUM_PATH=/path/to/chrome node test/e2e/playwright/publisher-release.audit.js
 * Every API request is intercepted. Unknown writes and all external traffic are blocked.
 * Loads the production App, dashboard, Publisher and all six real provider forms.
 */
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "../../..");
const output = path.join(root, "docs/publisher-verification-2026-10-13");
const source = path.join(os.tmpdir(), "publisher-audit-fixture.mp4");
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const platforms = ["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"];
const names = ["Facebook", "Instagram", "LinkedIn", "Reddit", "TikTok", "YouTube"];
const asset = { id: "audit-owned", title: "Coffee launch — final edit", description: "A brighter morning. Destination copy fixture.", url: "https://fixture.invalid/owned.mp4", type: "video", source: "studio", meta: { template: { name: "Coffee launch" }, width: 640, height: 360, duration: 6 } };
const pages = [{ id: "101", name: "Coffee Cape Town", instagram_business_account: { id: "ig101", username: "coffee.capetown" } }, { id: "202", name: "Coffee Johannesburg", instagram_business_account: { id: "ig202", username: "coffee.joburg" } }];
const fixtures = {
  "/api/platform/status": { raw: Object.fromEntries(platforms.map(n => [n, { connected: true, publishReady: true, meta: { display_name: `Audit ${n}` } }])), summary: Object.fromEntries(platforms.map(n => [n, { connected: true, publishReady: true }])) },
  "/api/facebook/status": { connected: true, pages },
  "/api/instagram/status": { connected: true, ig_business_account_id: "ig101" },
  "/api/tiktok/creator_info": { creator: { display_name: "Coffee creator (fixture)", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], max_video_post_duration_sec: 600, posting_remaining: 10 } },
  "/api/youtube/status": { connected: true, channel: { snippet: { title: "Coffee channel (fixture)" } } },
  "/api/linkedin/status": { connected: true, localizedName: "Coffee founder (fixture)" },
  "/api/reddit/status": { connected: true, meta: { username: "coffee_fixture", subreddits: [] } },
  "/api/users/me": { user: { timezone: "Africa/Johannesburg", schedulingDefaults: { frequency: "once", platforms } } },
  "/api/content/my-content": { content: [asset, { id: "plain", title: "Plain owned media", url: "https://fixture.invalid/plain.mp4", type: "video" }, { id: "image", title: "Owned image", url: "https://fixture.invalid/image.png", type: "image" }] },
  "/api/content/my-promotion-schedules": { schedules: [] },
  "/api/content/upload/readiness": { readiness: { allowed: true } },
  "/api/content/upload": { success: true, contentId: "audit-mocked", content: { id: "audit-mocked", status: "queued" } },
  "/api/monetization/subscription/status": { success: true, planId: "creator", totalCredits: 999, editing: { allPaidFeaturesUnlocked: true, features: { viralClipStudio: { enabled: true }, clipRender: { enabled: true } } } },
  "/api/media/credits": { balance: 999, monthly: { remaining: 999 }, topUp: 0, costs: { "render-clip": 5 }, localCreditBypass: true },
};
const evidence = { checks: [], requests: [], pageErrors: [], blocked: [], accountData: "API-shaped local fixtures, no production credentials or live account snapshot" };
function passed(name) { evidence.checks.push(name); console.log(`PASS ${name}`); }
let browser;
async function open(overrides = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", e => evidence.pageErrors.push(e.message));
  page.on("dialog", d => d.dismiss());
  await context.route("**/*", async route => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.hostname === "fixture.invalid") return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, contentType: u.pathname.endsWith(".png") ? "image/png" : "video/mp4", body: u.pathname.endsWith(".png") ? image : fs.readFileSync(source) });
    if (u.pathname.startsWith("/api/")) {
      const record = { path: u.pathname, method: request.method(), body: request.postData() };
      evidence.requests.push(record);
      const allowed = ["/api/content/upload/readiness", "/api/content/upload", "/api/content/upload/source-file", "/api/media/process"];
      if (request.method() !== "GET" && !allowed.includes(u.pathname)) { evidence.blocked.push(record); return route.abort("blockedbyclient"); }
      if (u.pathname === "/api/content/upload/source-file") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, url: "https://fixture.invalid/uploaded.mp4", size: 5000 }) });
      if (u.pathname === "/api/media/process" && !overrides[u.pathname]) return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ message: "Fixture edit rejected", details: "Unsupported edit combination" }) });
      const custom = typeof overrides[u.pathname] === "function" ? overrides[u.pathname](request) : overrides[u.pathname];
      return route.fulfill({ status: custom?.status || 200, contentType: "application/json", body: JSON.stringify(custom?.body || custom || fixtures[u.pathname] || {}) });
    }
    if (u.origin === "http://127.0.0.1:5000") {
      const local = path.join(root, "frontend/build", u.pathname);
      const filename = fs.existsSync(local) && fs.statSync(local).isFile() ? local : path.join(root, "frontend/build/index.html");
      return route.fulfill({ status: 200, contentType: ({ ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png" })[path.extname(filename)] || "application/octet-stream", body: fs.readFileSync(filename) });
    }
    evidence.blocked.push({ url: u.origin + u.pathname, method: request.method() });
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    window.__E2E_BYPASS = true; window.__E2E_TEST_TOKEN = "audit-local-only";
    localStorage.setItem("user", JSON.stringify({ uid: "audit-local", email: "audit@local.invalid", name: "Publisher Audit", role: "user" }));
    localStorage.setItem("autopromote.activeWorkspaceId", "audit-workspace");
  });
  await page.goto("http://127.0.0.1:5000");
  await page.getByRole("button", { name: "Publisher", exact: true }).first().click();
  await page.getByRole("button", { name: /Coffee launch — final edit/ }).click();
  return { page, context };
}
async function select(page, chosen) {
  await page.getByRole("button", { name: /Choose destinations/ }).click();
  for (let i = 0; i < names.length; i++) await page.getByRole("checkbox", { name: new RegExp(names[i]) }).setChecked(chosen.includes(platforms[i]));
  await page.getByRole("button", { name: /Customize destinations/ }).click();
}
async function form(page, name) {
  await page.getByRole("tab", { name, exact: true }).click();
  return page.getByRole("region", { name: `${name} form` });
}
async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.locator(".publisher-release .release-media").evaluateAll(elements => elements.filter(e => e.getClientRects().length).every(e => e.tagName === "VIDEO" ? e.readyState >= 2 : e.complete && e.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: "disabled" });
}
async function layout(page, name) {
  const overflow = await page.locator(".release-workspace,.release-main,.release-customize,.release-form-card,.release-inspector,.release-footer").evaluateAll(elements => elements.filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 2).map(e => ({ class: e.className, width: e.clientWidth, scroll: e.scrollWidth })));
  expect(overflow, `${name} overflow`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  passed(`${name}: no workspace or page overflow`);
}
async function allForms() {
  const { page, context } = await open();
  await expect(page.locator(".release-content-card")).toContainText("Created in Studio");
  await expect(page.locator(".release-content-card")).toContainText("Template: Coffee launch");
  await select(page, platforms);
  let f = await form(page, "Facebook");
  await f.locator("select").selectOption("202"); await f.locator("textarea").fill("Facebook edited copy");
  await expect(page.getByRole("region", { name: "Facebook post preview" })).toContainText("Facebook edited copy");
  await f.getByRole("button", { name: "Use master copy" }).click(); await expect(f.locator("select")).toHaveValue("202");
  await f.locator("textarea").fill("Facebook preserved copy");
  await shot(page, "facebook-form");
  f = await form(page, "Instagram");
  await f.locator("select").selectOption("202"); await f.getByPlaceholder("Write a caption...").fill("Instagram edited caption"); await f.getByPlaceholder("Add Location").fill("Cape Town");
  await f.getByRole("button", { name: "Use master copy" }).click(); await expect(f.locator("select")).toHaveValue("202"); await expect(f.getByPlaceholder("Add Location")).toHaveValue("Cape Town");
  await f.getByPlaceholder("Write a caption...").fill("Instagram preserved caption");
  await expect(page.getByRole("region", { name: "Instagram post preview" })).toContainText("Instagram preserved caption");
  await shot(page, "instagram-form");
  f = await form(page, "LinkedIn");
  await f.locator("select").first().selectOption("company");
  await expect(f.locator(".release-issues")).toContainText("Enter the company Page ID");
  await f.getByRole("button", { name: "Use master copy" }).click();
  await expect(f.locator("select").first()).toHaveValue("company");
  await expect(f.locator(".release-issues")).toContainText("Enter the company Page ID");
  await f.locator("#linkedin-company-id").fill("bad-id"); await expect(f.locator(".release-issues")).toContainText("Enter the company Page ID");
  await f.locator("select").first().selectOption("profile"); await expect(f.locator(".release-issues")).toHaveCount(0);
  await f.locator("select").first().selectOption("company"); await f.locator("#linkedin-company-id").fill("303");
  await f.getByPlaceholder("Share your thoughts or professional update...").fill("LinkedIn preserved commentary");
  await f.getByRole("button", { name: "Use master copy" }).click(); await expect(f.locator("select").first()).toHaveValue("company"); await expect(f.locator("#linkedin-company-id")).toHaveValue("303");
  await f.getByPlaceholder("Share your thoughts or professional update...").fill("LinkedIn preserved commentary");
  await expect(f).toContainText("Posting as Company Page 303");
  await shot(page, "linkedin-form");
  f = await form(page, "YouTube");
  await f.locator("#youtube-title-input").fill(""); await expect(f.locator(".release-issues")).toContainText("Enter a title");
  await f.locator("#youtube-title-input").fill("YouTube preserved title"); await f.getByPlaceholder("Tell viewers about your video...").fill("YouTube preserved description");
  await f.locator("select").first().selectOption("unlisted"); await f.getByPlaceholder("gaming, vlog, tutorial").fill("coffee,audit");
  await shot(page, "youtube-form");
  f = await form(page, "TikTok");
  await f.locator("#tiktok-privacy").selectOption(""); await expect(f.locator(".release-issues")).toContainText("Select TikTok privacy");
  await f.locator("#tiktok-privacy").selectOption("PUBLIC_TO_EVERYONE");
  await expect(f.locator(".release-issues")).toContainText("Confirm the TikTok declaration");
  await f.locator("details").filter({ hasText: "Advanced TikTok disclosures" }).locator("summary").click();
  await f.locator(".declaration-section input").check(); await expect(f.locator(".release-issues")).toHaveCount(0);
  await f.getByRole("checkbox", { name: /This content is commercial/ }).check();
  await expect(f.locator(".release-issues")).toContainText("Select the commercial content disclosure");
  await f.locator("#tiktok-privacy").selectOption("SELF_ONLY");
  await f.getByRole("checkbox", { name: /^Branded Content/ }).check();
  await expect(f.locator("#tiktok-privacy")).not.toHaveValue("SELF_ONLY");
  await f.getByRole("checkbox", { name: /This content is commercial/ }).uncheck();
  await f.locator("#tiktok-privacy").selectOption("PUBLIC_TO_EVERYONE");
  await f.locator(".declaration-section input").check();
  await f.locator("#tiktok-caption").fill("TikTok preserved caption");
  await shot(page, "tiktok-form");
  f = await form(page, "Reddit");
  await expect(page.locator(".release-readiness")).toContainText("6 of 6 destinations connected");
  await expect(page.locator(".release-readiness")).toContainText("5 of 6 forms complete");
  await expect(f.locator(".release-issues")).toContainText("Choose a subreddit");
  await expect(page.getByRole("button", { name: /Continue to Delivery/ })).toBeDisabled();
  await page.getByRole("button", { name: /^4 Delivery$/ }).click(); await expect(page.getByRole("region", { name: "Delivery settings" })).toHaveCount(0);
  await shot(page, "desktop-reddit-blocked"); await layout(page, "Desktop 1600");
  for (const width of [1280, 1024, 768, 390]) { await page.setViewportSize({ width, height: 900 }); await layout(page, `Viewport ${width}`); await shot(page, `reddit-blocked-${width}`); }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await f.locator("#reddit-subreddit").fill("coffee"); await f.locator("#reddit-title").fill("Reddit preserved title"); await f.locator("#reddit-post-text").fill("Reddit preserved copy");
  await f.locator("#reddit-kind").selectOption("link"); await expect(f.locator(".release-issues")).toContainText("Enter a valid post link"); await f.locator("#reddit-post-link").fill("https://fixture.invalid/coffee");
  await f.getByRole("button", { name: "Use master copy" }).click(); await expect(f.locator("#reddit-subreddit")).toHaveValue("coffee"); await expect(f.locator("#reddit-kind")).toHaveValue("link"); await expect(f.locator("#reddit-post-link")).toHaveValue("https://fixture.invalid/coffee");
  await f.locator("#reddit-kind").selectOption("self"); await f.locator("#reddit-post-text").fill(""); await expect(f.locator(".release-issues")).toContainText("Enter post text"); await f.locator("#reddit-post-text").fill("Reddit preserved copy");
  await f.locator("#reddit-kind").selectOption("video"); await f.locator("#reddit-title").fill("Reddit preserved title");
  await f.locator("details.reddit-media-tools summary").click(); await expect(f.locator('input[type="file"]')).toBeVisible();
  await shot(page, "reddit-form");
  await page.getByRole("button", { name: /Back to Destinations/ }).click(); await page.getByRole("button", { name: /Customize destinations/ }).click();
  const checks = { Facebook: ['textarea', "Facebook preserved copy"], Instagram: ['textarea', "Instagram preserved caption"], LinkedIn: ['textarea', "LinkedIn preserved commentary"], Reddit: ['#reddit-title', "Reddit preserved title"], TikTok: ['#tiktok-caption', "TikTok preserved caption"], YouTube: ['#youtube-title-input', "YouTube preserved title"] };
  for (const [name, [selector, value]] of Object.entries(checks)) {
    f = await form(page, name); await expect(f.locator(selector)).toHaveValue(value);
    for (const width of [1280, 390]) { await page.setViewportSize({ width, height: 900 }); await layout(page, `${name} ${width}`); }
    await page.setViewportSize({ width: 1600, height: 1000 });
  }
  await expect(page.getByRole("button", { name: /Continue to Delivery/ })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: /Continue to Delivery/ }).click();
  await expect(page.getByRole("region", { name: "Delivery settings" })).toBeVisible();
  await page.getByRole("button", { name: /Back to Customize/ }).click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  passed("All six real forms: fields, preview, target validation, master copy and edit preservation");
  await context.close();
}
async function delivery(mode) {
  const { page, context } = await open(); await select(page, ["reddit", "youtube"]);
  const r = await form(page, "Reddit"); await r.locator("#reddit-subreddit").fill("coffee"); await form(page, "YouTube");
  await page.getByRole("button", { name: /Continue to Delivery/ }).click();
  const d = page.getByRole("region", { name: "Delivery settings" });
  await d.getByRole("radio", { name: /^Schedule/ }).check();
  await expect(d.getByRole("combobox").first()).toHaveValue("Africa/Johannesburg");
  await expect(page.getByRole("button", { name: /Review release/ })).toBeDisabled();
  await d.getByLabel("Date", { exact: true }).fill("2030-10-21"); await d.getByLabel("Time", { exact: true }).fill("16:00"); await d.getByRole("combobox").first().selectOption("America/New_York"); await d.getByRole("combobox").last().selectOption("weekly");
  await d.getByRole("checkbox", { name: /different time/ }).check();
  await d.locator("fieldset").filter({ hasText: "Reddit" }).getByLabel("Time").fill("17:30");
  if (mode === "now") await d.getByRole("radio", { name: /^Publish now/ }).check();
  await shot(page, `delivery-${mode}`); await page.getByRole("button", { name: /Review release/ }).click();
  const review = page.getByRole("region", { name: "Review release" });
  const cta = page.getByRole("button", { name: mode === "now" ? /Publish to 2 destinations/ : /Schedule 2 posts/ });
  await expect(cta).toBeEnabled();
  if (mode === "schedule") await expect(review).toContainText("America/New_York (UTC-04)");
  await shot(page, `review-${mode}`);
  const start = evidence.requests.length; await cta.click();
  await expect.poll(() => evidence.requests.slice(start).filter(req => req.path === "/api/content/upload").length).toBe(1);
  const payload = JSON.parse(evidence.requests.slice(start).find(req => req.path === "/api/content/upload").body);
  expect(payload.url).toBe(asset.url); expect(payload.meta.sourceContentId).toBe(asset.id); expect(payload.meta.template.name).toBe("Coffee launch");
  if (mode === "schedule") {
    expect(payload.scheduled_promotion_time).toBe("2030-10-21T20:00:00.000Z"); expect(payload.schedule_hint.timezone).toBe("America/New_York"); expect(payload.promotion_frequency).toBe("weekly"); expect(payload.platform_schedule_times).toEqual({ reddit: "2030-10-21T21:30:00.000Z" });
  } else { expect(payload.scheduled_promotion_time).toBeUndefined(); expect(payload.platform_schedule_times).toBeUndefined(); expect(payload.schedule_hint.mode).toBe("publish_now"); expect(payload.schedule_hint.date).toBeUndefined(); }
  expect(evidence.requests.slice(start).some(req => /\/api\/(youtube|reddit)\/upload/.test(req.path))).toBe(false);
  expect(evidence.requests.slice(start).some(req => req.path === "/api/content/upload/source-file")).toBe(false);
  passed(`${mode}: real App upload adapter, exact mocked JSON and action-specific review CTA`); await context.close();
}
async function imageReuse() {
  const { page, context } = await open(); await select(page, ["instagram", "tiktok"]); await form(page, "Instagram"); await form(page, "TikTok");
  await page.getByRole("button", { name: "Change content", exact: true }).click(); await page.getByRole("tab", { name: "Project assets", exact: true }).click();
  await page.getByRole("button", { name: "Owned image", exact: true }).click(); await page.getByRole("button", { name: /Choose destinations/ }).click(); await page.getByRole("button", { name: /Customize destinations/ }).click();
  const f = await form(page, "Instagram"); await expect(f.getByRole("button", { name: /Crop Image/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Instagram post preview" }).locator("img")).toHaveAttribute("src", "https://fixture.invalid/image.png");
  await form(page, "TikTok"); await expect(page.getByRole("region", { name: "TikTok post preview" }).locator("img")).toBeVisible();
  await shot(page, "owned-image-reuse"); passed("Owned image reuse does not crash mounted Instagram or TikTok forms"); await context.close();
}
async function connectionBlocks() {
  const status = JSON.parse(JSON.stringify(fixtures["/api/platform/status"])); status.raw.facebook.connected = false; status.summary.tiktok.publishReady = false;
  const { page, context } = await open({ "/api/platform/status": status, "/api/facebook/status": { connected: false, pages: [] }, "/api/tiktok/creator_info": { creator: { display_name: "Posting limited fixture", privacy_level_options: ["SELF_ONLY"], posting_remaining: 0 } } });
  await select(page, ["facebook", "tiktok"]); let f = await form(page, "Facebook"); await expect(f.locator(".release-issues")).toContainText("Not connected"); await expect(f.locator(".release-issues")).toContainText("Choose a Facebook Page");
  f = await form(page, "TikTok"); await expect(f.locator(".release-issues")).toContainText("Reconnect TikTok with publishing permissions"); await expect(f.locator(".release-issues")).toContainText("posting limit");
  await shot(page, "account-readiness-blocked"); passed("Disconnected destination, missing Page, TikTok permissions and quota visibly block delivery"); await context.close();
  const directStatus = JSON.parse(JSON.stringify(fixtures["/api/platform/status"])); directStatus.raw.instagram.ig_business_account_id = "ig101";
  const direct = await open({ "/api/platform/status": directStatus, "/api/facebook/status": { connected: false, pages: [] } });
  await select(direct.page, ["instagram"]); const instagram = await form(direct.page, "Instagram");
  await expect(instagram).toContainText("Direct Instagram Connection Active (ID: ig101)");
  await expect(direct.page.getByRole("button", { name: /Continue to Delivery/ })).toBeEnabled();
  passed("Direct Instagram account identity and readiness work without Facebook Pages"); await direct.context.close();
}
async function rejectedDelivery() {
  const { page, context } = await open({ "/api/content/upload/readiness": { status: 403, body: { error: "Fixture account readiness rejected", code: "ACCOUNT_INCOMPLETE" } } });
  await select(page, ["youtube"]); await form(page, "YouTube"); await page.getByRole("button", { name: /Continue to Delivery/ }).click(); await page.getByRole("button", { name: /Review release/ }).click();
  const start = evidence.requests.length; await page.getByRole("button", { name: /Publish to 1 destinations/ }).click();
  await expect(page.locator(".release-footer")).toContainText("Fixture account readiness rejected");
  expect(evidence.requests.slice(start).some(req => req.path === "/api/content/upload")).toBe(false);
  await expect(page.locator(".release-footer")).not.toContainText("submitted");
  await shot(page, "submission-readiness-error"); passed("Rejected mocked readiness makes no upload request and shows no success"); await context.close();
}
async function advancedMedia() {
  const { page, context } = await open();
  await page.locator("details.release-advanced").getByText("Media and optional settings", { exact: true }).click();
  await page.getByRole("button", { name: "Open media editor", exact: true }).click();
  const modal = page.locator(".modal-overlay.open");
  await expect(modal.locator("video").first()).toHaveAttribute("src", asset.url);
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Trim start (seconds)").fill("1"); await page.getByLabel("Trim end (0 = full)").fill("4");
  await page.getByLabel("Rotation").selectOption("90"); await page.getByRole("checkbox", { name: "Flip horizontally" }).check(); await page.getByRole("checkbox", { name: "Flip vertically" }).check(); await page.getByLabel("Visual filter").selectOption("sepia");
  await page.getByLabel("Alternate hook or title").fill("Alternate coffee hook"); await page.getByLabel("Bounty amount").fill("10"); await page.getByLabel("Bounty niche").fill("coffee");
  await page.getByRole("checkbox", { name: "Request existing viral optimization" }).check();
  await select(page, ["youtube"]); await form(page, "YouTube"); await page.getByRole("button", { name: /Continue to Delivery/ }).click(); await page.getByRole("button", { name: /Review release/ }).click();
  const start = evidence.requests.length; await page.getByRole("button", { name: /Publish to 1 destinations/ }).click();
  await expect.poll(() => evidence.requests.slice(start).filter(req => req.path === "/api/content/upload").length).toBe(1);
  const payload = JSON.parse(evidence.requests.slice(start).find(req => req.path === "/api/content/upload").body);
  expect(payload.platform_options.youtube.meta).toEqual(expect.objectContaining({ trimStart: 1, trimEnd: 4, rotate: 90, flipH: true, flipV: true, filter: "sepia" }));
  expect(payload.meta).toEqual(expect.objectContaining({ trimStart: 1, trimEnd: 4, rotate: 90, flipH: true, flipV: true, filter: "sepia" }));
  expect(payload.variants).toEqual(["Alternate coffee hook"]); expect(payload.bounty).toEqual({ amount: 10, niche: "coffee" }); expect(payload.viral_boost.force_seeding).toBe(true);
  passed("Advanced media controls: editor URL preview, trim/rotate/flip/filter and optional JSON contracts preserved");
  await context.close();
}
async function cropAndMetadata() {
  const { page, context } = await open();
  await page.getByRole("button", { name: "Plain owned media", exact: true }).click();
  await expect(page.locator(".release-content-card")).not.toContainText("Created in Studio"); await expect(page.locator(".release-content-card")).not.toContainText("Template:");
  await page.getByRole("button", { name: "Owned image", exact: true }).click();
  await page.locator("details.release-advanced").getByText("Media and optional settings", { exact: true }).click();
  await page.getByRole("button", { name: "Crop image", exact: true }).click();
  await expect(page.locator(".reactEasyCrop_Image")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Crop image", exact: true }).click();
  await expect(page.locator(".reactEasyCrop_Image")).toBeVisible();
  await page.getByRole("button", { name: "Apply Crop", exact: true }).click();
  await expect(page.getByRole("region", { name: "Release content" }).locator("img")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator(".reactEasyCrop_Image")).toHaveCount(0);
  passed("No fabricated source/template metadata; global image crop loads, cancels and applies a real image Blob"); await context.close();
}
async function studioHandoff() {
  let renderSucceeds = false;
  const { page, context } = await open({ "/api/media/process": () => renderSucceeds ? { body: { success: true, url: "https://fixture.invalid/rendered.mp4", audioProof: { verified: true } } } : { status: 422, body: { message: "Fixture edit rejected", details: "Unsupported edit combination" } } });
  await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
  await page.locator(".creator-studio-dropzone input").setInputFiles(source);
  await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
  await expect(page.getByTestId("studio-after-video")).toHaveJSProperty("readyState", 4);
  await page.getByRole("navigation", { name: "Creative tools" }).getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /Render Final Clip/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Export failed: Unsupported edit combination" }).first()).toBeVisible();
  await shot(page, "studio-media-error");
  renderSucceeds = true; await page.getByRole("button", { name: /Render Final Clip/ }).click();
  await page.getByRole("button", { name: "Use in Publisher", exact: true }).click();
  await expect(page.getByRole("region", { name: "Customize destinations" })).toBeVisible();
  await expect(page.locator(".release-content-card video")).toHaveAttribute("src", "https://fixture.invalid/rendered.mp4");
  await expect(page.locator(".release-content-card")).toContainText("Created in Studio"); await expect(page.locator(".release-content-card")).not.toContainText("Template:");
  await shot(page, "studio-publisher-handoff");
  passed("Actual Studio render error/retry and Use in Publisher handoff retain owned rendered URL and real provenance"); await context.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x503080:s=640x360:d=6", "-vf", "drawtext=text='Publisher verification fixture':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", source]);
  browser = await chromium.launch({ executablePath: process.env.PUBLISHER_CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const cases = { forms: allForms, schedule: () => delivery("schedule"), now: () => delivery("now"), images: imageReuse, connections: connectionBlocks, rejected: rejectedDelivery, media: advancedMedia, crop: cropAndMetadata, studio: studioHandoff };
  for (const [name, run] of Object.entries(cases)) if (!process.env.PUBLISHER_AUDIT_CASE || process.env.PUBLISHER_AUDIT_CASE === name) await run();
  expect(evidence.pageErrors).toEqual([]);
  expect(evidence.requests.filter(req => req.method !== "GET" && /promotion-schedules/.test(req.path))).toEqual([]);
  passed("Zero browser page errors; zero requests to mutate existing schedules");
})().catch(e => { evidence.failure = e.stack; console.error(e); process.exitCode = 1; }).finally(async () => { fs.writeFileSync(path.join(output, process.env.PUBLISHER_AUDIT_CASE ? `browser-evidence-${process.env.PUBLISHER_AUDIT_CASE}.json` : "browser-evidence.json"), JSON.stringify(evidence, null, 2)); if (browser) await browser.close(); });
