#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { BrowserOperator } = require("./browser-agent/operator");
const { ResponsesPlanner } = require("./browser-agent/planner");
const { NvidiaPlanner } = require("./browser-agent/nvidia-planner");

async function main() {
  const taskPath = process.argv[2];
  if (!taskPath) throw new Error("Usage: node scripts/run-browser-agent.js TASK.json [EVIDENCE_FOLDER]");
  const task = JSON.parse(fs.readFileSync(taskPath, "utf8"));
  const provider = process.env.BROWSER_AGENT_PROVIDER || "nvidia";
  if (!["nvidia", "responses"].includes(provider)) throw new Error("BROWSER_AGENT_PROVIDER must be nvidia or responses");
  const planner = provider === "nvidia" ? new NvidiaPlanner({
    host: process.env.BROWSER_AGENT_GPU_HOST || "autopromote-l40s-staging",
    spool: process.env.BROWSER_AGENT_GPU_SPOOL || "/tmp/autopromote-studio-l40s-20261006/browser-spool",
  }) : new ResponsesPlanner();
  const folder = path.resolve(process.argv[3] || `reports/browser-agent-${Date.now()}`);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const browser = await chromium.launch({ headless: process.env.BROWSER_AGENT_HEADLESS !== "false" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  try {
    const operator = new BrowserOperator({ context, planner, task, folder, maxSteps: task.maxSteps || 40 });
    const result = await operator.run();
    fs.writeFileSync(path.join(folder, "result.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
    if (result.status !== "completed") process.exitCode = 1;
  } finally {
    await context.tracing.stop({ path: path.join(folder, "trace.zip") });
    await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
