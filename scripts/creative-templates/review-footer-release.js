#!/usr/bin/env node
// Real compiled App, anonymous visitor, read-only APIs. Never submits a contact,
// signup, checkout or support request. No mocked page, session or API response.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const base = process.env.FOOTER_REVIEW_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Set FOOTER_REVIEW_URL to the separate local production build");
const proof = path.resolve("reports/footer-release-20261029/browser");
fs.mkdirSync(proof, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const deadline = setTimeout(() => void browser.close(), 240000);
  const errors = [],
    blockedWrites = [],
    checks = [],
    direct = [],
    guides = [],
    staticPages = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.route("**/*", route => {
      const request = route.request();
      if (!["GET", "HEAD"].includes(request.method())) {
        blockedWrites.push({ method: request.method(), path: new URL(request.url()).pathname });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/#/about`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { level: 1, name: "About AutoPromote" }).waitFor();
    const links = await page
      .locator(".site-footer nav a")
      .evaluateAll(elements =>
        elements.map(a => ({ label: a.textContent.trim(), href: a.getAttribute("href") }))
      );
    assert.equal(links.length, 18);
    const texts = new Set();
    for (const link of links) {
      const previous = await page.locator("h1").innerText();
      await page.locator(`.site-footer nav a[href="${link.href}"]`).click();
      await page.waitForFunction(
        ({ previous, href }) =>
          document.querySelector("h1")?.innerText !== previous && location.hash === href,
        { previous, href: link.href }
      );
      await page.locator(".public-hero h1").waitFor();
      if (link.href === "#/pricing") {
        await page.locator(".plan-card").nth(3).waitFor();
        assert.equal(await page.locator(".plan-card").count(), 4);
        assert.equal(await page.locator(".current-subscription-card").count(), 0);
        assert.equal(await page.locator(".billing-plan-options").getAttribute("open"), "");
      }
      const text = await page.locator("main").innerText();
      const digest = crypto.createHash("sha256").update(text).digest("hex");
      assert(!texts.has(digest), `Duplicate main content for ${link.label}`);
      texts.add(digest);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        const state = await page.evaluate(() => ({
          title: document.querySelector("h1")?.innerText,
          h1s: document.querySelectorAll("h1").length,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          missingImages: [...document.images]
            .filter(img => img.getBoundingClientRect().width && img.complete && !img.naturalWidth)
            .map(img => img.src),
        }));
        assert.equal(state.h1s, 1, link.label);
        assert.equal(state.overflow, false, `${link.label} at ${width}px`);
        assert.deepEqual(state.missingImages, []);
        if (link.href === "#/contact") {
          assert.equal(
            await page
              .locator(".contact-compose form")
              .evaluate(el => getComputedStyle(el).opacity),
            "1"
          );
          assert.equal(
            await page
              .locator(".contact-compose form")
              .evaluate(el => getComputedStyle(el).animationName),
            "none"
          );
        }
        checks.push({ ...link, width, contentSha256: digest, ...state });
        await page.screenshot({
          path: path.join(proof, `${link.href.slice(2)}-${width}.png`),
          fullPage: true,
        });
        if (width === 390 && (await page.locator(".public-table-scroll").count())) {
          const scroll = page.locator(".public-table-scroll");
          await scroll.evaluate(el => {
            el.scrollLeft = el.scrollWidth;
          });
          assert(await scroll.evaluate(el => el.scrollLeft > 0));
          await page.screenshot({
            path: path.join(proof, `${link.href.slice(2)}-390-last-column.png`),
            fullPage: true,
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    for (const link of links) {
      const route = link.href.slice(1);
      const response = await page.goto(base + route, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200, `Direct ${route}`);
      if (!["/privacy", "/terms"].includes(route)) {
        await page.waitForURL(`${base}/#${route}`);
        await page.locator(".public-hero h1").waitFor();
      }
      direct.push({
        route,
        status: response.status(),
        title: await page.locator("h1").innerText(),
      });
    }
    for (const topic of [
      "getting-started",
      "studio",
      "motion",
      "audio",
      "publishing",
      "templates",
      "troubleshooting",
      "controls",
    ]) {
      const response = await page.goto(`${base}/docs/${topic}`, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200);
      const article = page.locator("article.public-prose");
      await article.waitFor();
      const text = await article.innerText();
      assert(text.length > 100, topic);
      guides.push({ topic, characters: text.length, title: await page.locator("h1").innerText() });
    }
    await page.goto(`${base}/#/blog`, { waitUntil: "domcontentloaded" });
    await page.locator(".public-card a").first().click();
    await page.locator("article.public-prose").waitFor();
    assert((await page.locator("article.public-prose").innerText()).length > 100);
    await page.goto(`${base}/contact`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Subject", { exact: true }).fill("A question & a reference");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Please help with the publishing workflow.\nReference #42");
    await page.getByRole("button", { name: /Prepare email/ }).click();
    const email = new URL(
      await page.getByRole("link", { name: /Open email app/ }).getAttribute("href")
    );
    assert.equal(email.pathname, "thulani@autopromote.org");
    assert.equal(
      email.searchParams.get("body"),
      "Please help with the publishing workflow.\nReference #42"
    );
    assert((await page.getByRole("status").innerText()).includes("No message has been sent"));
    // Follow the actual keyboard skip action, rather than injecting focus into the main element.
    await page.goto(`${base}/#/accessibility`, { waitUntil: "domcontentloaded" });
    await page.locator(".public-hero h1").waitFor();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.locator(".public-skip").evaluate(el => el === document.activeElement),
      true
    );
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("main").evaluate(el => el === document.activeElement), true);
    for (const width of [360, 390, 1200, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { level: 1, name: /More creating.*Less posting work/s })
        .waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false
      );
      checks.push({ route: "/", width, welcome: true, overflow: false });
    }
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.locator('input[type="password"]').waitFor();
    assert.equal(await page.locator('input[type="email"]').count(), 1);
    await context.close();

    const noJs = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const reader = await noJs.newPage();
    for (const link of links.filter(link => link.href !== "#/pricing")) {
      const route = link.href.slice(1);
      const response = await reader.goto(base + route, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200);
      assert.equal(await reader.locator("h1").count(), 1, `Static ${route}`);
      assert((await reader.locator("body").innerText()).length > 300);
      assert.equal(
        await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `Static ${route}`
      );
      if (route === "/contact") {
        await reader.getByRole("link", { name: "thulani@autopromote.org", exact: true }).waitFor();
        assert.equal(await reader.getByRole("button", { name: /Prepare email/ }).count(), 0);
        await reader.screenshot({
          path: path.join(proof, "contact-no-javascript.png"),
          fullPage: true,
        });
      }
      staticPages.push({
        route,
        status: response.status(),
        title: await reader.locator("h1").innerText(),
      });
    }
    await noJs.close();
    assert.deepEqual(errors, []);
    const result = {
      date: "2026-10-29",
      base,
      actualCompiledApp: true,
      headless: true,
      muted: true,
      responseMocks: false,
      footerDestinations: links.length,
      distinctPageBodies: texts.size,
      checks,
      direct,
      guides,
      staticPages,
      contactEmailPreparedNotSent: true,
      keyboardSkip: true,
      normalSignInForm: true,
      blockedWrites,
      browserErrors: errors,
    };
    fs.writeFileSync(path.join(proof, "verification.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(
      JSON.stringify({
        result: "PASS",
        footerDestinations: links.length,
        responsiveChecks: checks.length,
        directUrls: direct.length,
        realGuides: guides.length,
        readableWithoutJavaScript: staticPages.length,
        blockedWrites,
        browserErrors: errors,
      })
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
