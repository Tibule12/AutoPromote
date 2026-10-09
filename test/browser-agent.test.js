"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");
const { BrowserOperator } = require("../scripts/browser-agent/operator");
const { ResponsesPlanner } = require("../scripts/browser-agent/planner");

async function fixture(t, html, planner, task = {}) {
  const server = http.createServer((request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end(typeof html === "function" ? html(request) : html); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "browser-operator-"));
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(folder, { recursive: true, force: true }); });
  const operator = new BrowserOperator({ context, planner, folder, timeoutMs: 1200, maxSteps: 15,
    task: { goal: "Complete the local workflow", startUrl: origin, allowedOrigins: [origin], success: [{ type: "text_visible", value: "Workflow complete" }], ...task } });
  return { operator, context, folder, origin };
}
const target = (snapshot, name) => snapshot.frames.flatMap(frame => frame.controls).find(control => control.name === name);
const click = (control, value, extra = {}) => ({ type: "click", target: control.ref, reason: `Use the observed ${control.name} control`, expect: [{ type: "text_visible", value }], ...extra });

test("operator navigates changed controls, modal, offscreen content and delayed success", async t => {
  const html = `<h1>Workspace</h1><button onclick="this.remove();document.querySelector('dialog').showModal()">Start</button>
    <dialog><h2>Choose workspace</h2><button onclick="document.querySelector('dialog').close();document.querySelector('#editor').hidden=false">Continue</button></dialog>
    <section id="editor" hidden><label>Title<input aria-label="Title"></label><div style="height:1500px"></div>
    <button onclick="this.disabled=true;window.submissions=(window.submissions||0)+1;setTimeout(()=>document.querySelector('#status').textContent='Workflow complete',600)">Save draft</button><p id="status">Editor ready</p></section>`;
  const { operator } = await fixture(t, html, { async decide({ snapshot, image }) {
    assert(image?.length > 100, "Planner receives an actual screenshot");
    if (target(snapshot, "Start")) return click(target(snapshot, "Start"), "Choose workspace");
    if (target(snapshot, "Continue")) return click(target(snapshot, "Continue"), "Editor ready");
    const title = target(snapshot, "Title");
    if (title.value !== "My film") return { type: "fill", target: title.ref, value: "My film", expect: [{ type: "value", role: "textbox", name: "Title", value: "My film" }] };
    return click(target(snapshot, "Save draft"), "Workflow complete", { operationId: "save-draft" });
  } }, { allowedOperations: [{ id: "save-draft", action: "click", role: "button", name: "Save draft" }] });
  assert.equal((await operator.run()).status, "completed");
  assert.equal(await operator.page.evaluate(() => window.submissions), 1);
  assert(await operator.page.evaluate(() => scrollY) > 500);
  assert(operator.memory.actions.every(action => action.status === "verified"));
});

test("semantic target is re-resolved after the original node and CSS layout change", async t => {
  const { operator } = await fixture(t, '<button class="old">Open tools</button>', {});
  await operator.initialize();
  const observed = await operator.observe();
  const oldRef = target(observed.snapshot, "Open tools").ref;
  await operator.page.evaluate(() => { document.body.innerHTML = '<section><button class="new" style="margin-left:170px" onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p>Tools ready</p>\')">Open tools</button></section>'; });
  assert.equal(await operator.execute({ type: "click", target: oldRef, expect: [{ type: "text_visible", value: "Tools ready" }] }, observed), "verified");
});

test("exploratory clicks verify actual page changes and never authorize a vague submission", async t => {
  const { operator } = await fixture(t, '<button onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p>Editor ready</p>\')">Open tools</button><button onclick="window.sent=true">Submit job</button>', {},
    { allowedOperations: [{ id: "submit", action: "click", role: "button", name: "Submit job" }] });
  await operator.initialize();
  let observed = await operator.observe();
  assert.equal(await operator.execute({ type: "click", target: target(observed.snapshot, "Open tools").ref, expect: [{ type: "state_changed" }] }, observed), "verified");
  observed = await operator.observe();
  await assert.rejects(operator.execute({ type: "click", target: target(observed.snapshot, "Submit job").ref, operationId: "submit", expect: [{ type: "state_changed" }] }, observed), /specific outcome/);
  assert.equal(await operator.page.evaluate(() => window.sent), undefined);
});

test("ambiguous controls are not clicked and failure evidence is written", async t => {
  const { operator, folder } = await fixture(t, '<button>Continue</button><button>Continue</button>', { async decide({ snapshot }) { return click(target(snapshot, "Continue"), "Workflow complete"); } });
  const result = await operator.run();
  assert.equal(result.status, "blocked");
  assert.equal(result.reason.code, "AMBIGUOUS_TARGET");
  assert.equal(operator.memory.actions.length, 0);
  assert(fs.readdirSync(folder).some(file => file.endsWith("failure.png")));
  assert(fs.readdirSync(folder).some(file => file.endsWith("failure.json")));
});

test("section context resolves duplicate names after a layout replacement", async t => {
  const html = '<section aria-label="Import"><button>Continue</button></section><section aria-label="Edit"><button onclick="document.body.insertAdjacentHTML(\'beforeend\',\'<p>Tools ready</p>\')">Continue</button></section>';
  const { operator } = await fixture(t, html, {});
  await operator.initialize();
  const observed = await operator.observe();
  const edit = observed.snapshot.frames[0].controls.find(control => control.name === "Continue" && control.context === "Edit");
  await operator.page.evaluate(() => { document.body.innerHTML = document.body.innerHTML; });
  assert.equal(await operator.execute({ type: "click", target: edit.ref, expect: [{ type: "text_visible", value: "Tools ready" }] }, observed), "verified");
});

test("allowed popup is observed and verified on its resulting page", async t => {
  const { operator } = await fixture(t, request => request.url === "/tools" ? '<p>Workflow complete</p>' : '<button onclick="window.open(\'/tools\')">Open tools</button>', {
    async decide({ snapshot }) { return { type: "click", target: target(snapshot, "Open tools").ref, expect: [{ type: "text_visible", value: "Workflow complete" }] }; },
  });
  assert.equal((await operator.run()).status, "completed");
  assert.equal(operator.pageIds.get(operator.page), "page-2");
});

test("a browser download is retained before its success is reported", async t => {
  const { operator, folder } = await fixture(t, '<a download="review.txt" href="data:text/plain,verified%20artifact">Download review</a>', {});
  await operator.initialize();
  const observed = await operator.observe();
  assert.equal(await operator.execute({ type: "click", target: target(observed.snapshot, "Download review").ref, expect: [{ type: "download", value: "review.txt" }] }, observed), "verified");
  const event = operator.events.find(item => item.type === "download");
  assert.equal(fs.readFileSync(event.artifact, "utf8"), "verified artifact");
  assert(event.artifact.startsWith(path.join(folder, "downloads")));
});

test("retained download evidence survives restart and rejects changed bytes without another click", async t => {
  const { operator, context, folder } = await fixture(t, '<a download="review.txt" href="data:text/plain,verified%20artifact">Download review</a>', {},
    {allowedOperations:[{id:'retain-reviewed-download',action:'click',role:'link',name:'Download review'}]});
  await operator.initialize();
  let observed=await operator.observe();
  const action={type:'click',target:target(observed.snapshot,'Download review').ref,operationId:'retain-reviewed-download',expect:[{type:'download',value:'review.txt'}]};
  assert.equal(await operator.execute(action,observed),'verified');
  const resumed=new BrowserOperator({context,planner:{},task:operator.task,folder,timeoutMs:300,maxSteps:5});
  observed=await resumed.observe();
  assert.notEqual(observed.snapshot.id,operator.memory.observations[0].id);
  assert.equal(await resumed.execute({...action,target:target(observed.snapshot,'Download review').ref},observed),'already_verified');
  assert.equal(fs.readdirSync(path.join(folder,'downloads')).length,1);
  const receipt=resumed.memory.artifacts[0];
  fs.writeFileSync(receipt.artifact,'changed artifact');
  assert.equal(await resumed.matches({type:'download',value:'review.txt'}),false);
  await assert.rejects(()=>resumed.execute({...action,target:target(observed.snapshot,'Download review').ref},observed),{code:'UNCERTAIN_OUTCOME'});
  assert.equal(fs.readdirSync(path.join(folder,'downloads')).length,1);
});

test("a dispatched submission with missing confirmation is never duplicated across restart", async t => {
  const { operator, context, folder } = await fixture(t, '<button onclick="window.submissions=(window.submissions||0)+1">Submit job</button>', {
    async decide({ snapshot }) { return click(target(snapshot, "Submit job"), "Workflow complete", { operationId: "submit" }); },
  }, { allowedOperations: [{ id: "submit", action: "click", role: "button", name: "Submit job" }] });
  const result = await operator.run();
  assert.equal(result.status, "blocked");
  assert.equal(await operator.page.evaluate(() => window.submissions), 1);
  const resumed = new BrowserOperator({ context, planner: operator.planner, task: operator.task, folder, timeoutMs: 300, maxSteps: 5 });
  assert.equal((await resumed.run()).status, "blocked");
  assert.equal(await operator.page.evaluate(() => window.submissions), 1);
});

test("an uncertain submission is reconciled when a delayed confirmation arrives", async t => {
  const { operator } = await fixture(t, '<button onclick="window.submissions=(window.submissions||0)+1;setTimeout(()=>document.body.insertAdjacentHTML(\'beforeend\',\'<p>Workflow complete</p>\'),1600)">Submit job</button>', {
    async decide({ snapshot }) { return click(target(snapshot, "Submit job"), "Workflow complete", { operationId: "submit" }); },
  }, { allowedOperations: [{ id: "submit", action: "click", role: "button", name: "Submit job" }] });
  assert.equal((await operator.run()).status, "completed");
  assert.equal(await operator.page.evaluate(() => window.submissions), 1);
});

test("a native confirmation dialog is observed and resolved using its exact authorization", async t => {
  const { operator } = await fixture(t, '<button onclick="if(confirm(\'Open workspace?\'))document.body.innerHTML=\'<p>Workflow complete</p>\'">Open workspace</button>', {
    async decide({ snapshot }) {
      if (snapshot.dialog) return { type: "dialog", value: "accept", operationId: "confirm-open", expect: [{ type: "dialog_closed" }, { type: "text_visible", value: "Workflow complete" }] };
      return { type: "click", target: target(snapshot, "Open workspace").ref, expect: [{ type: "dialog_open", value: "Open workspace?" }] };
    },
  }, { allowedOperations: [{ id: "confirm-open", action: "dialog", value: "accept", message: "Open workspace?" }] });
  assert.equal((await operator.run()).status, "completed");
});

test("CAPTCHA is reported for user interaction without clicking", async t => {
  let called = false;
  const { operator } = await fixture(t, '<h1>Verify you are human</h1><button>Continue</button>', { async decide() { called = true; } });
  assert.equal((await operator.run()).status, "user_input_required");
  assert.equal(called, false);
});

test("planner sends screenshot, observations and durable memory as strict structured input", async () => {
  let request;
  const planner = new ResponsesPlanner({ apiKey: "test-key", model: "configured-vision-model", fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ type: "wait", durationMs: 500 }) }] }] }) };
  } });
  assert.equal((await planner.decide({ task: { goal: "Local task" }, snapshot: { priorActions: [{ status: "uncertain" }] }, image: Buffer.from("sample"), recovery: { code: "STALE_TARGET" } })).type, "wait");
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.input[0].content[1].type, "input_image");
  assert.match(request.input[0].content[0].text, /uncertain/);
});
