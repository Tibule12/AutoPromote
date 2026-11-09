#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const folder = path.resolve(__dirname, "../../../reports/vfx-l40s-20261006/backdrop-browser");

async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [], missing = [], checks = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on("page", page => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.url().includes("autopromote-violet-ribbon") && response.status() >= 400) missing.push(response.status()); });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto("http://127.0.0.1:3095", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const v = document.querySelector(".lp-brand-motion video"); return v?.readyState >= 3 && !v.paused; }, null, { timeout: 90000 });
    checks.push("Original generated backdrop loads and plays with the available editing scene");
    const hero = page.locator(".lp-hero");
    await hero.getByRole("button", { name: "Pause editing animation", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".lp-brand-motion video").paused);
    checks.push("Hero Pause controls the decorative video");
    await hero.getByRole("button", { name: "Resume editing animation", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".lp-brand-motion video").paused);
    checks.push("Hero Resume restarts the same source");
    await page.evaluate(() => scrollTo(0, document.querySelector(".lp-hero").getBoundingClientRect().bottom + scrollY + 100));
    await page.waitForFunction(() => document.querySelector(".lp-brand-motion video").paused);
    checks.push("Offscreen backdrop pauses");
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector(".lp-brand-motion video").paused);
    checks.push("Returning to the hero resumes playback");
    await page.screenshot({ path: path.join(folder, "desktop.png") });
    await page.evaluate(() => { window.__retainedBackdrop = document.querySelector(".lp-brand-motion video"); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => !document.querySelector(".lp-brand-motion video"));
    assert(await page.evaluate(() => window.__retainedBackdrop.paused && !window.__retainedBackdrop.hasAttribute("src")));
    checks.push("Reduced motion uses a poster and releases the old video source");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => document.querySelector(".lp-brand-motion video")?.readyState >= 3);
    checks.push("Motion can be restored after a live preference change");
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true });
    const phone = await mobile.newPage();
    await phone.goto("http://127.0.0.1:3095");
    await phone.locator(".lp-brand-motion img").waitFor();
    assert.equal(await phone.locator(".lp-brand-motion video").count(), 0);
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await phone.screenshot({ path: path.join(folder, "mobile-reduced-motion.png") });
    checks.push("Mobile reduced motion stays within the viewport and uses its poster");
    await mobile.close();
    const failed = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await failed.route("**/autopromote-violet-ribbon.mp4", route => route.abort("failed"));
    const fallback = await failed.newPage();
    await fallback.goto("http://127.0.0.1:3095");
    await fallback.waitForFunction(() => { const img = document.querySelector(".lp-brand-motion img"); return img?.complete && img.naturalWidth > 0 && !document.querySelector(".lp-brand-motion video"); }, null, { timeout: 90000 });
    checks.push("Failed video retains the usable poster");
    await failed.close();
    assert.deepEqual(missing, []);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify({ status: "PASS", checks, missing, errors }, null, 2));
    console.log(JSON.stringify({ status: "PASS", checks: checks.length }));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    fs.writeFileSync(path.join(folder, "failure.json"), JSON.stringify({ error: error.message, checks, missing, errors }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
