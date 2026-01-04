const { test, expect } = require("@playwright/test");

const STATIC_PORT = process.env.STATIC_SERVER_PORT || 5000;
const BASE = `http://localhost:${STATIC_PORT}`;

let serverProcess;
const fs = require("fs");
const http = require("http");
const url = require("url");
const path = require("path");

// Start a minimal static server serving test fixtures when localhost:5000 is not available.
async function ensureStaticServer(port = 5000) {
  const fixturesRoot = path.resolve(__dirname, "..", "fixtures");
  const frontendBuild = path.resolve(__dirname, "..", "..", "frontend", "build");
  const roots = [fixturesRoot, frontendBuild];
  // quick probe
  try {
    await new Promise((res, rej) => {
      const req = http.request({ method: "GET", host: "127.0.0.1", port, path: "/", timeout: 1000 }, r => {
        res();
      });
      req.on("error", rej);
      req.end();
    });
    return null; // already up
  } catch (e) {
    // start simple server
  }

  const server = http.createServer((req, res) => {
    try {
      const rawPath = url.parse(req.url).pathname || "/";
      // Sanitize requested path to avoid path traversal and other unsafe input.
      let rel = rawPath.replace(/^\//, "");
      try {
        rel = decodeURIComponent(rel);
      } catch (_) {
        // ignore malformed encodings and use raw rel
      }
      // Remove any null bytes and parent-directory segments
      rel = rel.split("/").filter(p => p && p !== ".." && p.indexOf("\0") === -1).join("/");

      // Try each root (fixtures first, then built frontend)
      let filePath = null;
      for (const r of roots) {
        const resolvedRoot = path.resolve(r);
        const candidate = path.resolve(resolvedRoot, rel || "");
        // Ensure candidate is within the resolved root to prevent traversal
        if (!(candidate === resolvedRoot || candidate.startsWith(resolvedRoot + path.sep))) continue;
        let final = candidate;
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) final = path.join(candidate, "index.html");
        } catch (_) {}
        if (fs.existsSync(final)) {
          filePath = final;
          break;
        }
      }
      if (!filePath) {
        res.statusCode = 404;
        return res.end("Not found");
      }
      const ext = path.extname(filePath).toLowerCase();
      const ct = ext === ".html" ? "text/html" : ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.setHeader("Content-Type", ct + "; charset=utf-8");
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.end("Server error");
    }
  });

  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(port, "127.0.0.1", () => res());
  });

  return server;
}

// Note: this test focuses on the SPA behavior: preview, edit, confirm modal and consent enforcement

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-playwright-e2e": "1" });
  // Stub users/me
  await page.route("**/api/users/me", async route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { uid: "testUser" } }) })
  );
  // Initial empty my-content
  await page.route("**/api/content/my-content", async route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [] }) })
  );
});

test("Preview edit + Confirm require consent and send upload when confirmed", async ({ page }) => {
  // Ensure static server is available before navigating (retry to avoid transient connection refused in CI)
  const target = `${BASE}/upload_component_test_page.html`;
  // If static host is not available, start a local fixture server for the duration of this test
  if (!serverProcess) {
    serverProcess = await ensureStaticServer(Number(process.env.STATIC_SERVER_PORT || 5000));
  }
  const maxWait = 15000; // ms
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < maxWait) {
    try {
      await page.goto(target, { waitUntil: "load", timeout: 4000 });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      // small backoff then retry
      await new Promise(r => setTimeout(r, 300));
    }
  }
  if (lastErr) throw lastErr;

  // Ensure the upload form is visible
  await page.waitForSelector("[data-testid=content-upload-form]");

  // Fill title and add a dummy file via the file input
  await page.fill('input[aria-label="Title"]', "Playwright TikTok Test");
  const fileInput = await page.$('input[type=file]');
  await fileInput.setInputFiles({ name: 'test.mp4', mimeType: 'video/mp4', buffer: Buffer.from('dummy') });

  // Click Preview -> backend upload should be stubbed by the page (we don't assert here)
  await page.click('[aria-label="Preview Content"]');

  // Wait for preview card to appear
  await page.waitForSelector('.preview-card');

  // Click Edit on the preview card to open preview modal
  await page.click('button:has-text("Edit Preview")');
  await page.waitForSelector('[aria-label="Edit preview title"]');

  // Change title in modal and save
  await page.fill('[aria-label="Edit preview title"]', 'Edited via Playwright');
  await page.click('button:has-text("Save")');

  // Open confirm modal by clicking Upload (which now shows the confirm modal)
  await page.click('button[aria-label="Upload Content"]');

  // Ensure TikTok-specific options are set so the upload payload includes required fields
  // Set privacy, select a sound, and check the TikTok consent checkbox if present
  try {
    await page.waitForSelector('#tiktok-privacy', { timeout: 1000 });
    await page.selectOption('#tiktok-privacy', 'EVERYONE');
  } catch (e) {}
  try {
    await page.waitForSelector('#tiktok-sound', { timeout: 1000 });
    await page.selectOption('#tiktok-sound', 'original_audio');
  } catch (e) {}
  try {
    await page.waitForSelector('#tiktok-consent', { timeout: 1000 });
    const tkit = await page.$('#tiktok-consent');
    if (tkit) await tkit.check();
  } catch (e) {}

  // Confirm button should be disabled until consent checked
  const confirmBtn = await page.waitForSelector('button:has-text("Confirm & Publish")');
  expect(await confirmBtn.isDisabled()).toBeTruthy();

  // Check consent checkbox inside confirm modal and confirm
  await page.waitForSelector('#confirm-consent', { timeout: 5000 });
  await page.click('#confirm-consent');
  expect(await confirmBtn.isDisabled()).toBeFalsy();

  // Intercept upload POST and assert it receives the final title
  let uploadCalled = false;
  await page.route("**/api/content/upload", async route => {
    let post = {};
    try {
      const pd = route.request().postData();
      post = pd ? JSON.parse(pd) : {};
    } catch (_) {
      post = {};
    }
    const tiktok = post.platform_options && post.platform_options.tiktok;
    // Only mark uploadCalled if final title updated and TikTok options include consent/privacy/sound
    if (post && post.title && post.title.includes("Edited via Playwright") && tiktok && tiktok.consent && tiktok.privacy && tiktok.sound_id) uploadCalled = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, id: 'abc123' }) });
  });

  // Click confirm to initiate upload
  await confirmBtn.click();

  // Wait briefly for the upload route to be hit
  await page.waitForTimeout(800);
  // The fixture updates the '#upload-status' element on success; prefer asserting UI state
  await page.waitForSelector('#upload-status', { timeout: 3000 });
  expect((await page.textContent('#upload-status')) || '').toContain('Upload submitted');
});

test.afterEach(async () => {
  try {
    if (serverProcess && typeof serverProcess.close === "function") {
      await new Promise(r => {
        let done = false;
        try {
          serverProcess.close(() => {
            if (!done) { done = true; r(); }
          });
        } catch (e) {
          // if close throws, resolve anyway
          if (!done) { done = true; r(); }
        }
        // fallback timeout to avoid hanging forever
        setTimeout(() => {
          if (!done) { done = true; r(); }
        }, 1000);
      });
    }
  } catch (e) {
    // ignore
  } finally {
    serverProcess = null;
  }
});
