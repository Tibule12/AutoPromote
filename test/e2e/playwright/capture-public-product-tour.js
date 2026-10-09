#!/usr/bin/env node
// Record the actual application with an isolated local sample workspace.
// All API requests are fulfilled here. No production accounts or publishing.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "reports/public-product-tour-20261006");
const url = process.env.LANDING_PREVIEW_URL || "http://127.0.0.1:3095";
assert(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
fs.mkdirSync(path.join(folder, "raw"), { recursive: true });
const source = `${url}/landing/podcast-conversation.mp4`;
const workspace = { id: "tour-sample-workspace", name: "Creative Studio", role: "owner", plan: "creator", creditBalance: 150 };
const user = { uid: "tour-sample-user", name: "Creative Studio", email: "creator@example.invalid", role: "user", emailVerified: true, planId: "creator", totalCredits: 150 };
const content = [
  { id: "tour-episode", title: "The conversation worth sharing", type: "video", url: source, mediaUrl: source, status: "ready", createdAt: "2026-10-06T08:00:00+02:00" },
  { id: "tour-highlight", title: "A new perspective", type: "video", url: source, mediaUrl: source, status: "ready", createdAt: "2026-10-06T08:00:00+02:00" },
];
const schedules = content.map((item, index) => ({
  id: `tour-schedule-${index}`, contentId: item.id, content: item, title: item.title,
  startTime: `2026-10-0${7 + index}T17:00:00+02:00`, status: "scheduled", isActive: true,
  platforms: index ? ["instagram"] : ["youtube", "tiktok"], frequency: "once",
}));
const requests = [], errors = [], captures = [];

function responseFor(request) {
  const endpoint = new URL(request.url());
  const pathname = endpoint.pathname;
  if (pathname.includes("workspaces")) return { ok: true, workspaces: [workspace], workspace, activeWorkspaceId: workspace.id };
  if (pathname.endsWith("/health")) return { status: "OK" };
  if (pathname.endsWith("/upload/source-file")) return { success: true, ok: true, url: source, size: 1250000 };
  if (pathname.includes("my-promotion-schedules")) return { schedules };
  if (pathname.includes("my-content")) return { content };
  if (pathname.includes("profile") || pathname.endsWith("/users/me") || pathname.endsWith("/subscription")) return { success: true, ...user, user, plan: "creator", editing: { features: { viralClipStudio: { enabled: true } } } };
  if (pathname.includes("analytics/user")) {
    const range = endpoint.searchParams.get("range") || "7d";
    const factor = range === "30d" ? 3 : 1;
    return { range, totalViews: 12480 * factor, totalClicks: 312 * factor, ctr: 2.5, topPlatform: "YouTube", publishedPostCount: 12 * factor, publishedPostCountAllTime: 36, platformBreakdown: { YouTube: { views: 6240 * factor, clicks: 156 * factor, ctr: 2.5 }, TikTok: { views: 4160 * factor, clicks: 104 * factor, ctr: 2.5 }, Instagram: { views: 2080 * factor, clicks: 52 * factor, ctr: 2.5 } }, plan: { name: "Creator" }, entitlements: { analytics: { allowedRanges: ["7d", "30d"], platformBreakdown: true, recoveryLab: false, canExport: true, label: "Advanced", summary: "Publishing and platform performance." } } };
  }
  if (pathname.includes("workflow-summary")) return { metrics: { scanStartRate: 0.9, scanCompletionRate: 1, previewRate: 0.8, editorConversionRate: 0.6, exportConversionRate: 0.5 }, funnel: [], eventCounts: {} };
  if (pathname.includes("platform/status")) return { platforms: {}, youtube: { connected: true }, tiktok: { connected: true, publishReady: true }, instagram: { connected: true } };
  if (pathname.includes("youtube")) return { connected: true, channel: { title: "Creative Studio", id: "sample-channel" } };
  if (pathname.includes("tiktok")) return { connected: true, publishReady: true, display_name: "Creative Studio", hasOpenId: true, hasAccessToken: true, missingScopes: [], creator_info: { privacy_level_options: ["PUBLIC_TO_EVERYONE"], max_video_post_duration_sec: 600 } };
  return { success: true, ok: true, content: [], schedules: [], notifications: [], platforms: [], connections: [], connected: false };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, timezoneId: "Africa/Johannesburg", recordVideo: { dir: path.join(folder, "raw"), size: { width: 1600, height: 900 } } });
    await context.route("**/*", async route => {
      const request = route.request();
      const endpoint = new URL(request.url());
      if (endpoint.hostname === "127.0.0.1" && endpoint.port === "8000") {
        requests.push({ method: request.method(), path: endpoint.pathname });
        await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": url, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify(responseFor(request)) });
      } else if (["127.0.0.1", "localhost"].includes(endpoint.hostname)) await route.continue();
      else await route.abort();
    });
    await context.addInitScript(user => {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "local-product-tour-only";
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("wolfHuntWelcomeSeen", "true");
      localStorage.setItem("activeWorkspaceId", "tour-sample-workspace");
    }, user);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("dialog", dialog => dialog.accept());
    page.on("pageerror", error => errors.push(error.message));
    const recording = page.video();
    const start = Date.now();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".ap-dashboard-redesign").waitFor();
    // Instrument only this local development bundle. Auth source stays unchanged.
    const installSampleAuth = async () => page.evaluate(async user => {
      const name = Object.keys(window).find(key => key.startsWith("webpackChunk"));
      if (!name) throw new Error("Local development module runtime unavailable");
      let require = window.__tourModuleRuntime;
      if (!require) {
        window[name].push([["local-tour-auth"], {}, runtime => { require = runtime; }]);
        window.__tourModuleRuntime = require;
      }
      const client = require("./src/firebaseClient.js");
      await client.auth.authStateReady();
      client.auth.currentUser = { ...user, auth: client.auth, _startProactiveRefresh() {}, _stopProactiveRefresh() {}, toJSON: () => user, getIdToken: async () => "local-product-tour-only", getIdTokenResult: async () => ({ claims: {} }) };
    }, user);
    await installSampleAuth();
    const nav = name => page.locator(".dashboard-sidebar").getByRole("button", { name, exact: true });
    const mark = async (name, selector) => {
      const element = page.locator(selector);
      await element.waitFor({ state: "visible" });
      await page.screenshot({ path: path.join(folder, `${name}.png`) });
      captures.push({ name, time: Date.now(), selector, bounds: await element.boundingBox() });
      console.log(`[product tour] ${name}`);
    };
    await nav("Publisher").click();
    await mark("uploads-before", ".publisher-upload-dropzone");
    await page.waitForTimeout(1000);
    await page.locator('.publisher-upload-dropzone input[type="file"]').setInputFiles(path.join(root, "frontend/public/landing/podcast-conversation.mp4"));
    await page.waitForTimeout(1200);
    await mark("uploads-ready", ".publisher-current-asset");
    assert.match(await page.locator(".publisher-stepper .active").innerText(), /Platforms/);
    await page.locator(".platform-toggles").getByRole("checkbox", { name: "YouTube", exact: true }).check();
    await page.waitForTimeout(800);
    await mark("uploads-destinations", ".platform-toggles");
    await page.getByRole("button", { name: "Customize posts →", exact: true }).click();
    const title = page.getByPlaceholder("My Awesome Video");
    if (await title.isVisible()) await title.fill("The conversation worth sharing");
    await page.waitForTimeout(1500);
    await mark("uploads-customize", ".platform-workspace");

    await nav("Viral Clip Studio").click();
    await page.locator('.creator-studio-dropzone input[type="file"]').setInputFiles(path.join(root, "frontend/public/landing/podcast-conversation.mp4"));
    await page.getByRole("button", { name: "Open Creator Studio", exact: true }).waitFor();
    await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
    await page.getByTestId("studio-after-video").waitFor({ state: "attached" });
    await page.waitForFunction(() => document.querySelector('[data-testid="studio-after-video"]')?.readyState >= 2);
    const initialPause = page.getByRole("button", { name: "Pause comparison", exact: true });
    if (await initialPause.count()) await initialPause.click();
    await page.locator(".creative-tool-rail").getByRole("button", { name: "Reframe", exact: true }).click();
    await page.getByTestId("reframe-aspect-16-9").click();
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await mark("studio-ready", ".studio-pro-timeline-dock");
    const playComparison = page.getByRole("button", { name: "Play comparison", exact: true });
    if (await playComparison.count()) await playComparison.click();
    await page.waitForTimeout(2200);
    await page.getByRole("button", { name: /Pause comparison/ }).click();
    await page.getByTestId("pro-quick-split").click();
    await page.waitForTimeout(800);
    await mark("studio-edit", ".studio-pro-timeline-dock");
    await page.waitForTimeout(1500);
    assert(await page.getByTestId("pro-video-clip-2").count() > 0, "Recorded split did not create a second timeline clip");
    await page.getByRole("button", { name: "Close Clip Studio", exact: true }).click();

    await nav("Queue").click();
    await mark("schedule-list", ".queue-kpi-grid");
    await page.waitForTimeout(1300);
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await mark("schedule-calendar", ".schedules-panel");
    await page.waitForTimeout(2200);

    await installSampleAuth();
    await nav("Analytics").click();
    await page.locator(".analytics-signal-chart b").first().waitFor();
    await mark("analytics-week", ".analytics-performance-overview");
    await page.waitForTimeout(1400);
    await page.locator(".ap-analytics-header select").selectOption("30d");
    await page.waitForTimeout(900);
    await mark("analytics-month", ".analytics-performance-overview");
    await page.waitForTimeout(2200);
    assert.deepEqual(errors, []);
    assert(requests.every(request => request.method === "GET" || request.method === "OPTIONS" || request.path.endsWith("/upload/source-file")), "Unexpected simulated mutation in capture");
    await context.close();
    await recording.saveAs(path.join(folder, "raw/application-workflow.webm"));
    await recording.delete();
    fs.writeFileSync(path.join(folder, "capture-receipt.json"), JSON.stringify({ status: "PASS", sampleWorkspace: true, captures: captures.map(capture => ({ ...capture, elapsed: (capture.time - start) / 1000 })), requests, errors, productionRequests: 0, publishingActions: 0 }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => {
  fs.writeFileSync(path.join(folder, "capture-failure.json"), JSON.stringify({ error: error.message, stack: error.stack, captures, requests, errors }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
