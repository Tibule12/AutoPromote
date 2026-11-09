#!/usr/bin/env node
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../../..");
const folder = path.join(root, "reports/public-product-tour-20261006/homepage");
const url = process.env.LANDING_PREVIEW_URL || "http://127.0.0.1:3095";
assert(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "This check is local only");
fs.mkdirSync(path.join(folder, "videos"), { recursive: true });
const checks = [],
  errors = [],
  frames = [];
const check = (label, detail = {}) => {
  checks.push({ label, ...detail });
  console.log(`[homepage] ${label}`);
};
const shot = async (page, name) => {
  const file = path.join(folder, `${name}.png`);
  await page.screenshot({ path: file });
  frames.push({
    name,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  });
};
const observe = page => {
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
};
const waitScore = async (page, time, mode = "opening") => {
  await page.waitForFunction(
    ({ time, mode }) =>
      Number(document.querySelector(`[data-mode="${mode}"] canvas`)?.dataset.time) >= time,
    { time, mode },
    { timeout: 120000 }
  );
};
const layout = async page => {
  const data = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: [
      ...document.querySelectorAll(
        ".lp-page button, .lp-page nav, .lp-motion-scene, .lp-feature, .lp-creators article"
      ),
    ]
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1);
      })
      .map(element => element.className),
  }));
  assert.equal(data.scrollWidth, data.width);
  assert.deepEqual(data.overflow, []);
  return data;
};
async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
      recordVideo: { dir: path.join(folder, "videos"), size: { width: 720, height: 450 } },
    });
    const page = await context.newPage();
    const recording = page.video();
    observe(page);
    await page.addInitScript(() => {
      window.__landingVideos = [];
      const create = document.createElement.bind(document);
      document.createElement = (tag, ...args) => {
        const element = create(tag, ...args);
        if (tag.toLowerCase() === "video") window.__landingVideos.push(element);
        return element;
      };
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Turn podcasts/ }).waitFor();
    const canvas = page.locator('[data-mode="opening"] canvas');
    await page
      .locator('[data-mode="opening"][data-renderer="three-webgl"]')
      .waitFor({ timeout: 90000 });
    check("Public root uses the actual App/router and a Three.js WebGL hero");
    const typography = await page.locator("#landing-headline").evaluate(element => {
      const animations = element.getAnimations({ subtree: true });
      return {
        animationCount: animations.length,
        matteCount: animations.filter(animation =>
          animation.effect.getKeyframes().some(frame => frame.clipPath)
        ).length,
      };
    });
    assert(typography.animationCount >= 4 && typography.matteCount === 3);
    check(
      "Kinetic headline runs real finite mask, blur, scale and gradient animations",
      typography
    );
    assert.equal(await page.locator(".lp-authored-motion").count(), 0);
    check("Unconfigured After Effects asset slots fetch no authored media or Lottie runtime");
    let firstCamera;
    for (const [name, time] of [
      ["01-camera-entry", 2.5],
      ["02-timeline-assembly", 7.8],
      ["03-speaker-and-sync", 10.8],
      ["04-director-and-captions", 15],
      ["05-selected-range-lift", 18.5],
      ["06-vertical-export", 24],
    ]) {
      // Hold the composition using its real control before screenshot work.
      // Software WebGL can otherwise advance past a cue while capturing it.
      await page.waitForFunction(time => {
        const scene = document.querySelector('[data-mode="opening"]');
        if (Number(scene?.querySelector("canvas")?.dataset.time) < time) return false;
        scene.querySelector('[aria-label="Pause editing animation"]').click();
        return true;
      }, time, { timeout: 120000 });
      await shot(page, name);
      const state = await canvas.evaluate(element => ({ ...element.dataset }));
      if (!firstCamera) firstCamera = state.camera;
      frames.at(-1).scene = state;
      if (time >= 7.8) assert.equal(state.cutCount, "8");
      if (name === "03-speaker-and-sync") {
        assert.equal(state.speaker, "guest");
        assert.equal(state.previewSource, "video");
        assert(Number(state.videoFrames) > 2);
        assert.equal(state.videoDecoders, "1");
      }
      if (name === "01-camera-entry") {
        assert.equal(state.videoDecoders, "1");
        assert.equal(state.videoSurfaces, "3");
        assert(Number(state.videoFrames) > 1);
      }
      if (time >= 15) assert.equal(Number(state.captionLetters), 23);
      if (time >= 18.5) assert.equal(state.selected, "true");
      if (time === 24) {
        assert.equal(state.verticalCount, "3");
        assert.notEqual(state.camera, firstCamera);
        const footer = await page.locator('[data-mode="opening"]').evaluate(element => ({
          canvasBottom: element.querySelector("canvas").getBoundingClientRect().bottom,
          ctaTop: element.querySelector(".lp-scene-cta").getBoundingClientRect().top,
        }));
        assert(footer.ctaTop >= footer.canvasBottom, "Final CTA covers the film composition");
        check("Final creation CTA sits below the composition", footer);
      }
      check(`Opening sequence: ${name}`, state);
      await page.locator('[data-mode="opening"]').getByRole("button", { name: "Resume editing animation", exact: true }).click();
    }
    const held = await canvas.evaluate(element => ({ ...element.dataset }));
    await page.waitForTimeout(900);
    const looping = await canvas.evaluate(element => ({ ...element.dataset }));
    assert.equal(looping.time, held.time);
    assert.equal(looping.camera, held.camera);
    assert(Number(looping.videoFrames) > Number(held.videoFrames));
    assert.equal(looping.videoSurfaces, "4");
    assert.equal(looping.videoPaused, "false");
    check("Choreography holds at its final edit while real footage loops in all four output screens", { held, looping });
    check("Desktop 1440×900 has no horizontal overflow", await layout(page));
    await page.getByRole("button", { name: "Replay film" }).click();
    await waitScore(page, 0.3);
    await page
      .locator('[data-mode="opening"]')
      .getByRole("button", { name: "Pause editing animation", exact: true })
      .click();
    const paused = await canvas.getAttribute("data-render-count");
    await page.waitForTimeout(500);
    assert.equal(await canvas.getAttribute("data-render-count"), paused);
    assert.equal(await canvas.getAttribute("data-video-paused"), "true");
    await page
      .locator('[data-mode="opening"]')
      .getByRole("button", { name: "Resume editing animation", exact: true })
      .click();
    await waitScore(page, 0.9);
    check("Replay, pause and resume control the real animation clock");

    for (let index = 0; index < 8; index++) {
      await page.evaluate(index => {
        const element = document.querySelector(".lp-editing-story");
        const box = element.getBoundingClientRect();
        window.scrollTo(
          0,
          window.scrollY + box.top + (index / 7) * (box.height - window.innerHeight)
        );
      }, index);
      await page
        .locator('[data-mode="scroll"][data-renderer="three-webgl"]')
        .waitFor({ timeout: 90000 });
      const target = [2.8, 8.5, 10.8, 12.2, 15, 17, 20, 24][index];
      await page.waitForFunction(
        target =>
          Math.abs(
            Number(document.querySelector('[data-mode="scroll"] canvas')?.dataset.time) - target
          ) < 0.015,
        target,
        { timeout: 30000 }
      );
      await page.waitForFunction(
        index =>
          document
            .querySelectorAll(".lp-story-chapters button")
            [index]?.getAttribute("aria-current") === "step",
        index
      );
      await page.waitForTimeout(650);
      if (index === 6) {
        const ratio = Number(
          await page.locator('[data-mode="scroll"] canvas').getAttribute("data-crop-aspect")
        );
        assert(Math.abs(ratio - 9 / 16) < 0.002);
        check("Animated crop guide reaches 9:16 while the subject remains framed", { ratio });
      }
      const top = await page
        .locator(".lp-story-sticky")
        .evaluate(element => element.getBoundingClientRect().top);
      assert(Math.abs(top) <= 1, `Story not pinned: ${top}`);
      await shot(page, `scroll-${index + 1}`);
      check(`Pinned scroll chapter ${index + 1}`, { target, top });
    }
    await page.locator("#features").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const hiddenCount = await canvas.getAttribute("data-render-count");
    await page.waitForTimeout(600);
    assert.equal(await canvas.getAttribute("data-render-count"), hiddenCount);
    assert.equal(await canvas.getAttribute("data-running"), "false");
    assert.equal(await canvas.getAttribute("data-video-paused"), "true");
    check("Offscreen hero stops rendering while the visitor reads later sections");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Watch Demo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.locator("video").getAttribute("src"), null);
    await dialog.getByRole("button", { name: /Play product tour/ }).click();
    assert.equal(await dialog.locator("video").getAttribute("src"), "/landing/product-tour.mp4");
    await page.waitForFunction(() => document.querySelector("dialog video")?.currentTime > 0.1);
    await dialog.locator("video").evaluate(video => { window.__landingDemoVideo = video; });
    await shot(page, "podcast-demo");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert(await page.evaluate(() => window.__landingDemoVideo.paused && !window.__landingDemoVideo.getAttribute("src")));
    assert(
      await page
        .getByRole("button", { name: "Watch Demo" })
        .evaluate(button => button === document.activeElement)
    );
    check("Recorded product tour plays; Escape releases its media and restores focus");
    await page.evaluate(() => {
      window.__landingReviewCanvas = document.querySelector('[data-mode="opening"] canvas');
      window.__landingSampleVideos = window.__landingVideos.filter(video => video.getAttribute("src")?.includes("/landing/podcast-conversation.mp4"));
    });
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.getByPlaceholder("Enter your email").waitFor();
    await shot(page, "sign-in");
    assert(await page.evaluate(() => window.__landingReviewCanvas.dataset.disposed === "true"));
    assert(await page.evaluate(() => window.__landingSampleVideos.length > 0 && window.__landingSampleVideos.every(video => video.paused && !video.getAttribute("src"))));
    check("Sign In opens the existing form and releases homepage video sources and GPU resources");
    await page.getByRole("button", { name: "New to AutoPromote? Create an account" }).click();
    await page
      .getByRole("button", { name: /Start Creating/ })
      .first()
      .click();
    await page.getByRole("heading", { name: /Create your workspace/ }).waitFor();
    await shot(page, "registration");
    check("Start Creating opens the existing registration flow");
    await context.close();
    await recording.saveAs(path.join(folder, "editing-film.webm"));
    await recording.delete();

    for (const [name, width, height] of [
      ["desktop-1920", 1920, 1080],
      ["tablet-820", 820, 1180],
      ["mobile-390", 390, 844],
    ]) {
      const p = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "no-preference",
      });
      observe(p);
      await p.goto(url, { waitUntil: "networkidle" });
      await p
        .locator('[data-mode="opening"][data-renderer="three-webgl"]')
        .waitFor({ timeout: 90000 });
      await waitScore(p, 15);
      await p
        .locator('[data-mode="opening"]')
        .getByRole("button", { name: "Pause editing animation", exact: true })
        .click();
      await p.evaluate(() => window.scrollTo(0, 0));
      await shot(p, name);
      check(`${name} renders the animated product story without overflow`, await layout(p));
      if (width === 390) {
        await p.locator('[data-mode="opening"]').scrollIntoViewIfNeeded();
        await shot(p, "mobile-editor");
        await p.evaluate(() => {
          const element = document.querySelector(".lp-editing-story");
          const box = element.getBoundingClientRect();
          window.scrollTo(
            0,
            window.scrollY + box.top + (6 / 7) * (box.height - window.innerHeight)
          );
        });
        await p.waitForFunction(
          () =>
            document
              .querySelectorAll(".lp-story-chapters button")[6]
              ?.getAttribute("aria-current") === "step"
        );
        await p.waitForTimeout(650);
        await shot(p, "mobile-scroll-reframe");
        check(
          "Mobile retains the pinned editing story and vertical transformation",
          await layout(p)
        );
      }
      if (width < 1024) {
        await p.getByRole("button", { name: "Open navigation" }).click();
        await p.getByRole("button", { name: "Features", exact: true }).click();
        assert.equal(new URL(p.url()).hash, "");
        await p.locator("#features").scrollIntoViewIfNeeded();
        check(`${name} mobile navigation scrolls without changing the HashRouter route`);
      }
      await p.close();
    }
    const reduced = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const reducedVideoRequests = [];
    reduced.on("request", request => {
      if (request.url().includes("/landing/podcast-conversation.mp4")) reducedVideoRequests.push(request.url());
    });
    observe(reduced);
    await reduced.goto(url, { waitUntil: "networkidle" });
    assert.equal(await reduced.locator(".lp-motion-canvas").count(), 0);
    assert.deepEqual(reducedVideoRequests, []);
    assert.equal(await reduced.locator(".lp-story-reduced li").count(), 8);
    assert.equal(
      await reduced
        .locator(".lp-page")
        .evaluate(element => element.getAnimations({ subtree: true }).length),
      0
    );
    await shot(reduced, "reduced-motion");
    check(
      "Reduced motion downloads no footage, loads no WebGL, runs no animations and retains all eight editing chapters",
      await layout(reduced)
    );
    await reduced.close();
    const fallback = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    observe(fallback);
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl2" ? null : original.call(this, type, ...args);
      };
    });
    await fallback.goto(url, { waitUntil: "networkidle" });
    await fallback.locator('[data-mode="opening"][data-renderer="static"]').waitFor();
    await shot(fallback, "no-webgl-fallback");
    check("A device without WebGL keeps the editor preview and working CTAs");
    await fallback.close();

    const dashboard = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    observe(dashboard);
    await dashboard.route("http://127.0.0.1:8000/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const workspace = {
        id: "landing-local-review",
        name: "Local review",
        role: "owner",
        plan: "creator",
        creditBalance: 150,
      };
      let body = {
        success: true,
        ok: true,
        content: [],
        schedules: [],
        notifications: [],
        platforms: [],
        connections: [],
      };
      if (pathname.includes("workspaces"))
        body = { ok: true, workspaces: [workspace], workspace, activeWorkspaceId: workspace.id };
      if (pathname.includes("profile"))
        body = {
          success: true,
          plan: "creator",
          credits: 150,
          user: { name: "Local Review", email: "review@example.invalid" },
        };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
        body: JSON.stringify(body),
      });
    });
    await dashboard.addInitScript(() => {
      window.__E2E_BYPASS = true;
      window.__E2E_TEST_TOKEN = "local-review-only";
      localStorage.setItem(
        "user",
        JSON.stringify({
          uid: "landing-local-review",
          email: "review@example.invalid",
          name: "Local Review",
          role: "user",
        })
      );
    });
    await dashboard.goto(url, { waitUntil: "networkidle" });
    await dashboard.locator(".ap-dashboard-redesign").first().waitFor({ timeout: 30000 });
    assert.equal(await dashboard.locator(".lp-page").count(), 0);
    assert.equal(await dashboard.locator(".lp-motion-canvas").count(), 0);
    await shot(dashboard, "dashboard-local-fixture");
    check(
      "Existing authenticated dashboard renders with a local test user; homepage styles and WebGL are absent"
    );
    await dashboard.close();
    assert.deepEqual(errors, []);
    check("No uncaught page exceptions or browser console errors");
    fs.writeFileSync(
      path.join(folder, "browser-verification.json"),
      JSON.stringify(
        {
          status: "PASS",
          environment: "Local Chromium / software WebGL; no production login or deployment",
          video: "editing-film.webm",
          checks,
          frames,
          errors,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}
main().catch(error => {
  fs.writeFileSync(
    path.join(folder, "browser-failure.json"),
    JSON.stringify({ message: error.message, stack: error.stack, checks, errors }, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
});
