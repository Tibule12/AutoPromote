"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hashFile = async file => {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const risky = /\b(submit|publish|send|delete|remove|pay|purchase|buy|confirm|export|render|schedule|save|upload|sign in|log in|create|order)\b/i;
const safeUrl = value => {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (/token|key|secret|auth|code|password/i.test(key)) url.searchParams.set(key, "[redacted]");
    return url.toString();
  } catch { return value; }
};

class OperatorError extends Error {
  constructor(message, code = "ACTION_FAILED") { super(message); this.code = code; }
}

class BrowserOperator {
  constructor({ context, planner, task, folder, timeoutMs = 10000, maxSteps = 40 }) {
    if (!task?.goal || !task.startUrl || !Array.isArray(task.success) || !task.success.length) throw new Error("A goal, startUrl and observable success conditions are required");
    if (!task.allowedOrigins?.length) throw new Error("Explicit allowedOrigins are required");
    this.origins = new Set(task.allowedOrigins.map(value => new URL(value).origin));
    this.resourceOrigins = new Set((task.allowedResourceOrigins || task.allowedOrigins).map(value => new URL(value).origin));
    this.context = context;
    this.planner = planner;
    this.task = task;
    this.folder = path.resolve(folder);
    this.timeoutMs = timeoutMs;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) throw new Error("maxSteps must be between 1 and 100");
    this.maxSteps = maxSteps;
    this.pages = new Map();
    this.pageIds = new WeakMap();
    this.targets = new Map();
    this.events = [];
    this.dialog = null;
    this.sequence = 0;
    this.step = 0;
    this.recoveryCount = 0;
    fs.mkdirSync(this.folder, { recursive: true, mode: 0o700 });
    this.journalPath = path.join(this.folder, "memory.json");
    const identity = hash({ goal: task.goal, startUrl: task.startUrl, success: task.success });
    if (fs.existsSync(this.journalPath)) {
      this.memory = JSON.parse(fs.readFileSync(this.journalPath, "utf8"));
      if (this.memory.identity !== identity) throw new Error("Evidence folder belongs to a different task");
    } else this.memory = { identity, actions: [], observations: [], artifacts: [], status: "running" };
    this.memory.artifacts ||= [];
    this.sequence = Math.max(0,...this.memory.observations.map(item=>Number(item.id?.match(/^observation-(\d+)$/)?.[1])||0));
    this.flush();
    this.attach = page => {
      if (this.pageIds.has(page)) return;
      const id = `page-${this.pages.size + 1}`;
      this.pageIds.set(page, id);
      this.pages.set(id, page);
      this.page = page;
      page.setDefaultTimeout(timeoutMs);
      page.on("pageerror", error => this.events.push({ type: "pageerror", page: id, message: error.message.slice(0, 600) }));
      page.on("requestfailed", request => this.events.push({ type: "requestfailed", page: id, url: safeUrl(request.url()), error: request.failure()?.errorText }));
      page.on("response", response => {
        if (response.status() >= 400) this.events.push({ type: "http_error", page: id, status: response.status(), url: safeUrl(response.url()) });
      });
      page.on("request", request => {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) this.events.push({ type: "effect_request", page: id, method: request.method(), url: safeUrl(request.url()) });
      });
      page.on("dialog", dialog => {
        this.dialog = { handle: dialog, pageId: id, type: dialog.type(), message: dialog.message() };
      });
      page.on("download", async download => {
        const filename = download.suggestedFilename();
        const directory = path.join(this.folder, "downloads");
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const artifact = path.join(directory, `${crypto.randomUUID()}-${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`);
        try {
          await download.saveAs(artifact);
          if (await download.failure()) throw new Error("Browser download failed");
          const receipt = { type: "download", page: id, filename, artifact, bytes: fs.statSync(artifact).size,
            sha256: await hashFile(artifact), at: new Date().toISOString() };
          this.memory.artifacts.push(receipt);
          this.flush(); // Retained bytes survive restart, not just a transient event.
          this.events.push(receipt);
        } catch (error) { this.events.push({ type: "download_failed", page: id, filename, message: error.message }); }
      });
    };
    context.pages().forEach(this.attach);
    context.on("page", this.attach);
  }

  flush() {
    const temporary = `${this.journalPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.memory, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.journalPath);
  }

  allowed(url) {
    try { return this.origins.has(new URL(url).origin); } catch { return false; }
  }

  async initialize() {
    // Guard all document navigation, including redirects, popups and frames.
    await this.context.route("**/*", route => {
      const request = route.request();
      const readOnlyResource = !request.isNavigationRequest() && ["GET", "HEAD", "OPTIONS"].includes(request.method()) && this.resourceOrigins.has(new URL(request.url()).origin);
      if (!this.allowed(request.url()) && !readOnlyResource) {
        this.events.push({ type: "blocked_navigation", url: safeUrl(request.url()) });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    if (!this.page || this.page.isClosed()) this.page = await this.context.newPage();
    if (this.page.url() === "about:blank") await this.page.goto(this.task.startUrl, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
    if (!this.allowed(this.page.url())) throw new OperatorError("Current page is outside task scope", "OUT_OF_SCOPE");
  }

  async settle(page = this.page) {
    // DOM quiet is bounded; streaming/video/long polling need not become idle.
    if (this.dialog || page.isClosed()) return;
    await page.waitForLoadState("domcontentloaded", { timeout: Math.min(3000, this.timeoutMs) }).catch(() => {});
    await page.evaluate(() => new Promise(resolve => {
      let quiet;
      const finish = () => { clearTimeout(quiet); clearTimeout(limit); observer.disconnect(); resolve(); };
      const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish, 180); });
      const limit = setTimeout(finish, 1200);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      quiet = setTimeout(finish, 180);
    })).catch(() => {});
  }

  async observe({ screenshot = true } = {}) {
    if (!this.page || this.page.isClosed()) this.page = [...this.pages.values()].find(page => !page.isClosed());
    if (!this.page) throw new OperatorError("All browser pages closed", "PAGE_CLOSED");
    await this.settle();
    await Promise.allSettled([...this.targets.values()].map(target => target.handle.dispose()));
    this.targets.clear();
    const observationId = `observation-${++this.sequence}`;
    const frames = [];
    if (!this.dialog) for (const [frameIndex, frame] of this.page.frames().entries()) {
      if (!this.allowed(frame.url())) continue;
      const elements = await frame.locator("button,a[href],input,textarea,select,summary,[role],[contenteditable=true],[tabindex],canvas").elementHandles().catch(() => []);
      const controls = [];
      const sampled = elements.slice(0, 200);
      // Batch DOM inspection into one browser call; individual RPCs can make
      // observing a busy editor take longer than interacting with it.
      const descriptions = await frame.evaluate(nodes => nodes.map(element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (!rect.width || !rect.height || style.visibility === "hidden" || style.display === "none" || element.closest('[inert],[aria-hidden="true"]')) return null;
          const clean = text => (text || "").replace(/\s+/g, " ").trim().slice(0, 180);
          const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map(id => document.getElementById(id)?.innerText || "").join(" ");
          const label = clean(element.labels ? [...element.labels].map(item => item.innerText).join(" ") : "");
          const tag = element.tagName.toLowerCase();
          const type = element.getAttribute("type") || "";
          const role = element.getAttribute("role") || ({ button: "button", a: "link", textarea: "textbox", select: "combobox", summary: "button" }[tag]) || (tag === "input" ? ({ checkbox: "checkbox", radio: "radio", range: "slider", submit: "button", button: "button" }[type] || "textbox") : "");
          const name = clean(element.getAttribute("aria-label") || labelled || label || element.innerText || element.getAttribute("alt") || element.getAttribute("title") || element.getAttribute("placeholder") || ((type === "submit" || type === "button") ? element.value : ""));
          const dialog = element.closest('dialog[open],[role="dialog"],[aria-modal="true"]');
          const region = element.closest('[role="region"],section,nav,form,article,header,footer');
          const regionLabel = region?.getAttribute("aria-labelledby")?.split(/\s+/).map(id => document.getElementById(id)?.innerText || "").join(" ");
          const context = region ? clean(region.getAttribute("aria-label") || regionLabel || region.querySelector("h1,h2,h3")?.innerText) : "";
          const centerX = Math.max(0, Math.min(innerWidth - 1, rect.x + rect.width / 2));
          const centerY = Math.max(0, Math.min(innerHeight - 1, rect.y + rect.height / 2));
          const top = document.elementFromPoint(centerX, centerY);
          return { role, name, label, tag, type, submitsForm: !!element.form && element.type === "submit", disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
            checked: element.checked ?? null, expanded: element.getAttribute("aria-expanded"), selected: element.getAttribute("aria-selected"),
            value: type === "password" || type === "hidden" ? "[redacted]" : clean(element.value),
            options: tag === "select" ? [...element.options].map(option => ({ label: option.label, value: option.value, disabled: option.disabled })) : null,
            href: tag === "a" ? element.href : null, inModal: !!dialog, context,
            modalName: clean(dialog?.getAttribute("aria-label") || dialog?.querySelector("h1,h2,h3")?.innerText),
            box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
            occluded: !!top && top !== element && !element.contains(top) };
        }), sampled).catch(() => []);
      for (const [index, handle] of sampled.entries()) {
        const control = descriptions[index];
        if (!control) { await handle.dispose(); continue; }
        const ref = `${observationId}:f${frameIndex}:e${controls.length}`;
        if (control.href) control.href = safeUrl(control.href);
        controls.push({ ref, ...control });
        this.targets.set(ref, { handle, frame, control, observationId });
      }
      const details = await frame.evaluate(() => ({
        text: document.body?.innerText.slice(0, 14000) || "",
        headings: [...document.querySelectorAll("h1,h2,h3")].filter(item => item.getClientRects().length && getComputedStyle(item).visibility !== "hidden").map(item => item.innerText).slice(0, 40),
        alerts: [...document.querySelectorAll('[role="alert"],[aria-live="assertive"]')].map(item => item.innerText).filter(Boolean),
        busy: !!document.querySelector('[aria-busy="true"],[role="progressbar"]'),
        captcha: !!document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],[class*="cf-turnstile"]') || /verify (you are|that you are) human|complete the captcha/i.test(document.body?.innerText || ""),
        scroll: { x: scrollX, y: scrollY, height: document.documentElement.scrollHeight, viewportHeight: innerHeight },
      })).catch(() => ({ text: "Frame changed during observation", headings: [], alerts: [], busy: true, captcha: false }));
      frames.push({ index: frameIndex, url: safeUrl(frame.url()), ...details, controls });
    }
    const snapshot = { id: observationId, pageId: this.pageIds.get(this.page), url: safeUrl(this.page.url()),
      pages: [...this.pages].filter(([, page]) => !page.isClosed()).map(([id, page]) => ({ id, url: safeUrl(page.url()) })),
      dialog: this.dialog ? { type: this.dialog.type, message: this.dialog.message, pageId: this.dialog.pageId } : null,
      frames, events: this.events.slice(-30), priorActions: this.memory.actions.slice(-20) };
    let image;
    if (screenshot && !this.dialog) image = await this.page.screenshot({ type: "png", timeout: this.timeoutMs,
      mask: [this.page.locator('input[type="password"],[data-private]')] }).catch(() => undefined);
    this.memory.observations.push({ id: snapshot.id, url: snapshot.url, pageId: snapshot.pageId, at: new Date().toISOString() });
    this.memory.observations = this.memory.observations.slice(-80);
    this.flush();
    return { snapshot, image };
  }

  async matches(condition) {
    const page = condition.pageId ? this.pages.get(condition.pageId) : this.page;
    if (!page || page.isClosed()) return false;
    if (condition.type === "state_changed") return (await this.pageState(page)) !== condition.value;
    if (condition.type === "url") return new URL(page.url()).href === new URL(condition.value, page.url()).href;
    if (condition.type === "url_contains") return page.url().includes(condition.value);
    if (condition.type === "download") {
      for (const artifact of this.memory.artifacts.filter(item=>item.type==='download' && item.filename===condition.value)) {
        try {
          const real=fs.realpathSync(artifact.artifact);
          if(!real.startsWith(path.join(this.folder,'downloads')+path.sep) || fs.statSync(real).size!==artifact.bytes)continue;
          const digest=await hashFile(real);
          if(digest===artifact.sha256 && (!condition.sha256 || digest===condition.sha256))return true;
        } catch { /* Lost or changed bytes cannot establish successful download. */ }
      }
      return false;
    }
    if (condition.type === "dialog_closed") return this.dialog === null;
    if (condition.type === "dialog_open") return this.dialog !== null && (!condition.value || this.dialog.message === condition.value);
    if (this.dialog) return false;
    if (condition.type === "modal_open" || condition.type === "modal_closed") {
      const count = await page.locator('dialog[open]:visible,[role="dialog"]:visible,[aria-modal="true"]:visible').count();
      return condition.type === "modal_open" ? count > 0 : count === 0;
    }
    const frame = page.frames()[condition.frameIndex || 0];
    if (!frame || !this.allowed(frame.url())) return false;
    if (condition.type === "text_visible") {
      const matches = frame.getByText(condition.value, { exact: false });
      for (let index = 0; index < Math.min(20, await matches.count()); index++) if (await matches.nth(index).isVisible()) return true;
      return false;
    }
    const locator = frame.getByRole(condition.role, { name: condition.name, exact: true });
    const visible = [];
    for (let index = 0; index < await locator.count(); index++) if (await locator.nth(index).isVisible()) visible.push(locator.nth(index));
    if (condition.type === "hidden") return visible.length === 0;
    if (visible.length !== 1) return false;
    if (condition.type === "visible") return true;
    if (condition.type === "value") return (await visible[0].inputValue()) === condition.value;
    if (condition.type === "checked") return (await visible[0].isChecked()) === (condition.value === "true");
    if (condition.type === "enabled") return visible[0].isEnabled();
    if (condition.type === "selected") return (await visible[0].getAttribute("aria-selected")) === condition.value;
    if (condition.type === "expanded") return (await visible[0].getAttribute("aria-expanded")) === condition.value;
    throw new OperatorError(`Unknown verification type: ${condition.type}`, "INVALID_ACTION");
  }

  async pageState(page = this.page) {
    return hash({ url: page.url(), pages: [...this.pages.values()].filter(item => !item.isClosed()).map(item => item.url()),
      dialog: this.dialog?.message || null, body: await page.evaluate(() => ({ text: document.body?.innerText,
        modals: [...document.querySelectorAll('dialog[open],[aria-modal="true"]')].map(item => item.innerText) })).catch(() => null) });
  }

  async verify(conditions, timeoutMs = this.timeoutMs) {
    const until = Date.now() + timeoutMs;
    do {
      const results = await Promise.all(conditions.map(condition => this.matches(condition).catch(() => false)));
      if (results.every(Boolean)) return true;
      await pause(150);
    } while (Date.now() < until);
    return false;
  }

  async resolve(ref, observationId) {
    const target = this.targets.get(ref);
    if (!target || target.observationId !== observationId) throw new OperatorError("Target belongs to a stale observation; observe again", "STALE_TARGET");
    const { frame, control } = target;
    if (!this.allowed(frame.url())) throw new OperatorError("Target moved outside task scope", "OUT_OF_SCOPE");
    // Semantic re-resolution survives React replacing the original DOM node.
    if (control.role && control.name) {
      let locator = frame.getByRole(control.role, { name: control.name, exact: true });
      if (control.inModal) locator = frame.locator('dialog[open],[role="dialog"],[aria-modal="true"]').getByRole(control.role, { name: control.name, exact: true });
      const visible = [];
      for (let index = 0; index < await locator.count(); index++) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible())) continue;
        if (control.context) {
          const context = await candidate.evaluate(element => {
            const region = element.closest('[role="region"],section,nav,form,article,header,footer');
            const labelled = region?.getAttribute("aria-labelledby")?.split(/\s+/).map(id => document.getElementById(id)?.innerText || "").join(" ");
            return (region?.getAttribute("aria-label") || labelled || region?.querySelector("h1,h2,h3")?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 180);
          });
          if (context !== control.context) continue;
        }
        visible.push(candidate);
      }
      if (visible.length === 1) return { element: visible[0], control };
      if (visible.length > 1) throw new OperatorError("Target is ambiguous; inspect its context", "AMBIGUOUS_TARGET");
    }
    if (!(await target.handle.evaluate(element => element.isConnected).catch(() => false))) throw new OperatorError("Target was replaced; observe its new layout", "STALE_TARGET");
    return { element: target.handle, control };
  }

  async evidence(label, observation, error) {
    const prefix = `${String(this.step).padStart(3, "0")}-${label.replace(/[^a-z0-9-]/gi, "-")}`;
    if (observation.image) fs.writeFileSync(path.join(this.folder, `${prefix}.png`), observation.image, { mode: 0o600 });
    fs.writeFileSync(path.join(this.folder, `${prefix}.json`), JSON.stringify({
      error: error ? { code: error.code, message: error.message } : null, ...observation.snapshot,
    }, null, 2), { mode: 0o600 });
  }

  async execute(action, observation) {
    const allowedTypes = ["click", "fill", "select", "check", "press", "scroll", "navigate", "back", "wait", "switch_page", "dialog", "finish", "stop"];
    if (!allowedTypes.includes(action.type)) throw new OperatorError("Unsupported action", "INVALID_ACTION");
    if (action.type === "stop") throw new OperatorError(action.reason || "Planner stopped", "PLANNER_STOP");
    if (action.type === "finish") {
      if (!(await this.verify(this.task.success))) throw new OperatorError("Goal completion is not supported by current page state", "UNVERIFIED_GOAL");
      return "completed";
    }
    if (action.type === "switch_page") {
      const page = this.pages.get(action.pageId);
      if (!page || page.isClosed() || !this.allowed(page.url())) throw new OperatorError("Unavailable or out-of-scope browser page", "OUT_OF_SCOPE");
      this.page = page;
      await page.bringToFront();
      return "switched_page";
    }
    if (action.type === "wait") { await pause(Math.max(100, Math.min(3000, action.durationMs || 600))); return "waited"; }
    if (this.dialog && action.type !== "dialog") throw new OperatorError("Resolve the visible native dialog before another action", "DIALOG_OPEN");
    if (action.type === "scroll") {
      const delta = Number(action.deltaY);
      if (!Number.isFinite(delta)) throw new OperatorError("Invalid scroll distance", "INVALID_ACTION");
      const before = await this.page.evaluate(() => scrollY);
      if (action.target) {
        const { element } = await this.resolve(action.target, observation.snapshot.id);
        await element.scrollIntoViewIfNeeded();
      } else await this.page.mouse.wheel(0, Math.max(-900, Math.min(900, delta)));
      await this.settle();
      const after = await this.page.evaluate(() => scrollY);
      return after !== before || action.target ? "scrolled" : "scroll_boundary";
    }
    let target;
    if (["click", "fill", "select", "check", "press"].includes(action.type)) target = await this.resolve(action.target, observation.snapshot.id);
    const control = target?.control;
    if (observation.snapshot.frames.some(frame => frame.controls.some(item => item.inModal)) && control && !control.inModal) throw new OperatorError("A modal covers the page; inspect and resolve it first", "MODAL_OPEN");
    if (control?.type === "password" || control?.type === "file") throw new OperatorError("This task requires user-supplied sensitive input or a file", "USER_INPUT_REQUIRED");
    if (action.type === "navigate" && !this.allowed(action.url)) throw new OperatorError("Navigation outside allowedOrigins", "OUT_OF_SCOPE");
    const consequential = !!action.operationId || action.type === "dialog" || (action.type === "click" && control && (risky.test(control.name) || control.submitsForm)) || (action.type === "press" && action.value === "Enter");
    if (consequential) {
      const operation = (this.task.allowedOperations || []).find(item => item.id === action.operationId);
      if (!operation || operation.action !== action.type || (control && (operation.role !== control.role || operation.name !== control.name))
          || (action.type === "dialog" && (operation.value !== action.value || operation.message !== this.dialog?.message))) {
        throw new OperatorError("Consequential action is outside this task's authorized operations", "OPERATION_OUT_OF_SCOPE");
      }
    }
    if (!Array.isArray(action.expect) || !action.expect.length) throw new OperatorError("Action needs an observable postcondition", "MISSING_VERIFICATION");
    if (consequential && action.expect.some(condition => condition.type === "state_changed")) throw new OperatorError("Consequential actions need specific outcome verification", "MISSING_VERIFICATION");
    const operationKey = consequential ? `operation:${action.operationId}` : null;
    const signature = hash({ url: observation.snapshot.url, type: action.type, role: control?.role, name: control?.name, value: action.value, urlTarget: action.url, pageId: observation.snapshot.pageId });
    const prior = [...this.memory.actions].reverse().find(item => (operationKey && item.operationKey === operationKey) || item.signature === signature);
    if (prior && prior.status !== "not_dispatched") {
      const priorStillTrue = prior.status === "verified" && prior.expect.some(condition => condition.type === "state_changed")
        ? prior.afterState === await this.pageState() : await this.verify(prior.expect, Math.min(1800, this.timeoutMs));
      if (priorStillTrue) {
        prior.status = "verified"; this.flush(); return "already_verified";
      }
      if (operationKey || prior.status !== "verified") throw new OperatorError("Prior action has an unresolved outcome; do not repeat its click or submission", "UNCERTAIN_OUTCOME");
    }
    if (action.type === "fill" && await target.element.inputValue() === action.value) return "already_filled";
    if (target) {
      await target.element.scrollIntoViewIfNeeded();
      if (action.type === "click") await target.element.click({ trial: true, timeout: this.timeoutMs });
    }
    action.expect = await Promise.all(action.expect.map(async condition => condition.type === "state_changed"
      ? { ...condition, value: await this.pageState() } : condition));
    const entry = { signature, operationKey, type: action.type, target: control ? { role: control.role, name: control.name } : null,
      expect: action.expect, status: "dispatching", at: new Date().toISOString(), reason: action.reason,
      planner: this.planner.lastReceipt || null };
    this.memory.actions.push(entry);
    this.flush(); // Durable intent before dispatch protects against a process crash.
    try {
      if (action.type === "click") await target.element.click({ timeout: this.timeoutMs });
      else if (action.type === "fill") await target.element.fill(action.value);
      else if (action.type === "select") await target.element.selectOption({ label: action.value });
      else if (action.type === "check") await target.element.setChecked(action.value === "true");
      else if (action.type === "press") {
        if (!["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space"].includes(action.value)) throw new OperatorError("Unsupported key", "INVALID_ACTION");
        await target.element.press(action.value);
      } else if (action.type === "navigate") await this.page.goto(action.url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      else if (action.type === "back") await this.page.goBack({ waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      else if (action.type === "dialog") {
        if (!["accept", "dismiss"].includes(action.value) || !this.dialog) throw new OperatorError("Invalid native dialog action", "INVALID_ACTION");
        await this.dialog.handle[action.value](); this.dialog = null;
      }
      entry.status = "dispatched";
      this.flush();
      await this.settle();
      if (!(await this.verify(action.expect))) throw new OperatorError("Action outcome was not verified; inspect state without resubmitting", "UNCERTAIN_OUTCOME");
      entry.status = "verified";
      entry.afterState = await this.pageState();
      this.recoveryCount = 0;
      this.flush();
      return "verified";
    } catch (error) {
      // A browser error after dispatch may conceal a successful server action.
      entry.status = "uncertain";
      entry.error = error.message;
      this.flush();
      throw error;
    }
  }

  async run() {
    await this.initialize();
    let recovery = null;
    for (this.step = 1; this.step <= this.maxSteps; this.step++) {
      const observation = await this.observe();
      await this.evidence("observe", observation);
      if (!this.allowed(this.page.url())) {
        this.memory.status = "blocked"; this.flush();
        return { status: "blocked", reason: { code: "OUT_OF_SCOPE", message: "Redirect left the task's allowed origins" }, evidence: this.folder, steps: this.step };
      }
      if (observation.snapshot.frames.some(frame => frame.captcha)) {
        this.memory.status = "user_input_required"; this.flush();
        return { status: this.memory.status, reason: "CAPTCHA requires the user's interaction", steps: this.step };
      }
      if (await this.verify(this.task.success, 300)) {
        this.memory.status = "completed"; this.flush();
        return { status: "completed", steps: this.step, evidence: this.folder };
      }
      try {
        const action = await this.planner.decide({ task: this.task, ...observation, recovery });
        const result = await this.execute(action, observation);
        recovery = result === "already_verified" ? { code: "ALREADY_VERIFIED", message: "Choose the next step; the prior action already succeeded" } : null;
        if (result === "completed") { this.memory.status = "completed"; this.flush(); return { status: "completed", steps: this.step, evidence: this.folder }; }
      } catch (error) {
        recovery = { code: error.code || "ACTION_FAILED", message: error.message.slice(0, 1200) };
        await this.evidence("failure", await this.observe(), error);
        if (["OUT_OF_SCOPE", "PLANNER_STOP", "USER_INPUT_REQUIRED"].includes(error.code) || ++this.recoveryCount >= 4) {
          this.memory.status = "blocked"; this.flush();
          return { status: "blocked", reason: recovery, steps: this.step, evidence: this.folder };
        }
      }
    }
    this.memory.status = "step_limit"; this.flush();
    return { status: "step_limit", steps: this.maxSteps, evidence: this.folder };
  }
}

module.exports = { BrowserOperator, OperatorError, safeUrl };
