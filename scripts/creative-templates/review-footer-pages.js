#!/usr/bin/env node
// Read-only anonymous QA of the real App and safe generated-document endpoint.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  report = path.join(root, "reports/footer-pages-20261021"),
  base = process.env.FOOTER_REVIEW_URL || "http://127.0.0.1:5008";
(async () => {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    p = await context.newPage();
  p.setDefaultTimeout(20000);
  const errors = [],
    writes = [],
    checks = [],
    guides = [];
  let pendingPath = "";
  p.on("pageerror", e => errors.push({ path: pendingPath, error: e.message }));
  p.on("request", r => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      new URL(r.url()).pathname.startsWith("/api/")
    )
      writes.push({ method: r.method(), path: new URL(r.url()).pathname });
  });
  try {
    await p.goto(base);
    await p.locator(".site-footer").waitFor();
    const links = await p
      .locator(".site-footer nav a")
      .evaluateAll(es =>
        es.map(a => ({ text: a.textContent.trim(), href: a.getAttribute("href") }))
      );
    assert.equal(links.length, 18);
    for (const item of links) {
      pendingPath = item.href;
      // Each transition follows the actual footer link instead of substituting a route fixture.
      const previousHeading = await p
        .locator(".public-hero h1")
        .textContent()
        .catch(() => null);
      await p.locator(`.site-footer nav a[href="${item.href}"]`).click();
      await p.locator(".public-site .public-hero h1").waitFor();
      assert.equal(new URL(p.url()).hash, item.href);
      await p.waitForFunction(previous => {
        const heading = document.querySelector(".public-hero h1");
        return heading && heading.textContent !== previous && scrollY < 10;
      }, previousHeading);
      const slug = item.href.replace("#/", "").replace(/[^a-z0-9]/gi, "-");
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await p.setViewportSize(viewport);
        await p.waitForTimeout(70);
        const result = await p.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          h1s: document.querySelectorAll(".public-site h1").length,
          title: document.querySelector(".public-hero h1")?.textContent,
          missingImages: [...document.images]
            .filter(i => i.getBoundingClientRect().width && i.complete && !i.naturalWidth)
            .map(i => i.src),
          bodyWidth: document.querySelector(".public-body").getBoundingClientRect().width,
          mainTag: document.querySelector("#public-main")?.tagName,
        }));
        assert(
          result.scrollWidth <= viewport.width + 1,
          `${item.text} overflows at ${viewport.width}`
        );
        assert.equal(result.h1s, 1, item.text);
        assert.deepEqual(result.missingImages, [], item.text);
        checks.push({ href: item.href, viewport, ...result });
        await p.screenshot({
          path: path.join(report, "browser", `${slug}-${viewport.width}.png`),
          fullPage: true,
        });
      }
      await p.setViewportSize({ width: 1440, height: 1000 });
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
      pendingPath = "/docs/" + topic;
      await p.goto(base + "/#" + pendingPath);
      await p.locator("article.public-prose").waitFor({ timeout: 30000 });
      const text = await p.locator("article.public-prose").innerText();
      assert(text.length > 100);
      assert(text.includes("knowledge 1.0.42"));
      guides.push({
        topic,
        title: await p.locator(".public-hero h1").innerText(),
        characters: text.length,
      });
      if (topic === "studio") {
        const target = p
          .locator("article.public-prose a")
          .filter({ hasText: "Composition layers / Sequence tracks" })
          .first();
        await target.click();
        await p.locator("article.public-prose").waitFor();
        assert(new URL(p.url()).hash.includes("/docs/control-reference/index"));
        await p.locator("#studio-timeline-view").waitFor({ state: "attached" });
        await p.waitForFunction(
          () => document.getElementById("studio-timeline-view")?.getBoundingClientRect().top < 300
        );
      }
    }
    await p.goto(base + "/#/blog");
    await p.getByRole("link", { name: "Read article" }).first().click();
    await p.locator("article.public-prose").waitFor();
    assert(new URL(p.url()).hash.includes("/blog/one-edit-six-posts"));
    await p.goto(base + "/#/features");
    await p.getByRole("link", { name: "Skip to content" }).focus();
    await p.keyboard.press("Enter");
    assert.equal(await p.evaluate(() => document.activeElement.id), "public-main");
    assert.equal(new URL(p.url()).hash, "#/features");
    await p.locator(".public-topbar").getByRole("link", { name: "AutoPromote home" }).click();
    await p.locator(".wf-page").waitFor();
    await p.screenshot({
      path: path.join(report, "browser", "welcome-footer.png"),
      fullPage: true,
    });
    await p.goto(base + "/#/integrations");
    assert.deepEqual(
      await p
        .locator(".public-card .platform-brand-icon")
        .evaluateAll(es => es.map(e => getComputedStyle(e).filter)),
      Array(6).fill("none")
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    fs.writeFileSync(
      path.join(report, "browser", "verification.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          footerLinks: links,
          checks,
          guides,
          articleRoute: true,
          skipLinkFocus: true,
          returnToWelcome: true,
          errors,
          writes,
          headless: true,
          muted: true,
        },
        null,
        2
      )
    );
    console.log(
      `PASS: ${links.length} footer destinations, ${checks.length} viewport checks, ${guides.length} live guides, article routing and skip-link focus.`
    );
  } catch (e) {
    await p
      .screenshot({ path: path.join(report, "browser", "failure.png"), fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      path.join(report, "browser", "failure.json"),
      JSON.stringify({ path: pendingPath, error: e.stack, errors, writes, checks, guides }, null, 2)
    );
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
