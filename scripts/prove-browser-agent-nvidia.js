#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const { BrowserOperator } = require("./browser-agent/operator");
const { NvidiaPlanner } = require("./browser-agent/nvidia-planner");

async function main() {
  let submissions = 0;
  const html = `<!doctype html><html><head><title>Review workspace</title><style>
    body{font:18px system-ui;background:#15121e;color:#f2edff;padding:36px}button,input,select{font:inherit;padding:12px;margin:10px}dialog{background:#302744;color:white;border:1px solid #a855f7;border-radius:16px;padding:30px}input{display:block}section{max-width:850px}label{display:block;margin:20px 0}header{color:#c9b7ff}
    </style></head><body><header>Local browser operator regression fixture</header><h1>Prepare a review copy</h1>
    <p>Open the editor, enter a title, choose landscape, and create one draft.</p><button id="entry" onclick="this.remove();document.querySelector('dialog').showModal()">Open editor</button>
    <dialog><h2>Editing workspace</h2><p>The saved source is ready.</p><button onclick="document.querySelector('dialog').close();document.querySelector('section').hidden=false">Continue to draft</button></dialog>
    <section hidden><h2>Draft settings</h2><label>Film title<input aria-label="Film title" required></label><label>Format<select aria-label="Format"><option>Portrait</option><option>Landscape</option></select></label>
    <p>Scroll down to the draft action after editing the settings.</p><div style="height:850px"></div>
    <button onclick="const title=document.querySelector('input').value;const format=document.querySelector('select').value;if(title!=='Stories move'||format!=='Landscape'){document.querySelector('#status').textContent='Please enter Stories move and select Landscape';return}this.disabled=true;document.querySelector('#status').textContent='Preparing review copy…';fetch('/draft',{method:'POST'}).then(()=>setTimeout(()=>location.href='/ready',900))">Create review copy</button><p id="status" role="status">Ready for editing</p></section></body></html>`;
  const server = http.createServer((request, response) => {
    if (request.url === "/draft" && request.method === "POST") { submissions++; response.writeHead(200); response.end("ok"); return; }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(request.url === "/ready" ? '<h1>Stories move review copy ready</h1><p>Landscape · draft for review</p>' : html);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const folder = path.resolve(process.argv[2] || `reports/browser-agent-nvidia-20261006/run-${Date.now()}`);
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const task = { goal: "Open the editing workspace, set Film title to Stories move, select Landscape Format, then create exactly one review copy and verify its ready page.",
      startUrl: origin, allowedOrigins: [origin], success: [{ type: "url", value: `${origin}/ready` }, { type: "text_visible", value: "Stories move review copy ready" }],
      allowedOperations: [{ id: "create-review-copy", action: "click", role: "button", name: "Create review copy" }] };
    const operator = new BrowserOperator({ context, planner: new NvidiaPlanner(), task, folder, maxSteps: 15 });
    const result = await operator.run();
    fs.writeFileSync(path.join(folder, "result.json"), JSON.stringify({ ...result, submissions, scope: "Local dynamic regression fixture, actual offline L40S vision inference; no production requests" }, null, 2));
    console.log(JSON.stringify({ ...result, submissions }));
    assert.equal(result.status, "completed");
    assert.equal(submissions, 1);
  } finally {
    await context.tracing.stop({ path: path.join(folder, "trace.zip") });
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
