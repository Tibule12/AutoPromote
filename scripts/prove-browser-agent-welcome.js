#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { BrowserOperator } = require("./browser-agent/operator");
const { NvidiaPlanner } = require("./browser-agent/nvidia-planner");

async function main() {
  const folder = path.resolve(process.argv[2] || "reports/browser-agent-nvidia-20261006/real-welcome");
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const planner = new NvidiaPlanner();
    const base = { startUrl: "http://127.0.0.1:3095", allowedOrigins: ["http://127.0.0.1:3095"], allowedOperations: [] };
    const open = new BrowserOperator({ context, planner, folder: path.join(folder, "open"), maxSteps: 10,
      task: { ...base, goal: "Inspect AutoPromote's welcome page and open Watch Demo to see the actual product tour in its modal.",
        success: [{ type: "modal_open" }, { type: "visible", role: "button", name: "Close demo" }] } });
    const opened = await open.run();
    assert.equal(opened.status, "completed");
    const close = new BrowserOperator({ context, planner, folder: path.join(folder, "close"), maxSteps: 10,
      task: { ...base, goal: "Close the currently open product demo modal and verify the welcome page is usable again.",
        success: [{ type: "modal_closed" }, { type: "visible", role: "button", name: "Watch Demo" }] } });
    const closed = await close.run();
    assert.equal(closed.status, "completed");
    const result = { status: "PASS", opened, closed, scope: "Actual locally served production welcome page; offline L40S vision decisions; external requests blocked" };
    fs.writeFileSync(path.join(folder, "receipt.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await context.tracing.stop({ path: path.join(folder, "trace.zip") });
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
