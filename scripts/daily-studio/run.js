#!/usr/bin/env node
// Durable daily creative work. The agent uses the ordinary Studio/Publisher UI;
// this process owns only scheduling, locks, private logs and evidence validation.
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const c = require("./contract");
const root = path.resolve(__dirname, "../..");
const runtime = path.join(root, "reports/daily-studio");
const args = process.argv.slice(2);
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const date = c.validDate(value("--date") || c.localDate());
const directory = c.dayRoot(root, date);
const bookFile = path.join(directory, "day.json");
const read = file => JSON.parse(fs.readFileSync(file));

function discoverCodex() {
  const configured = process.env.AUTOPROMOTE_CODEX_BIN;
  if (configured && fs.existsSync(configured)) return fs.realpathSync(configured);
  const lookup = spawnSync("which", ["codex"], { encoding: "utf8" });
  if (lookup.status === 0) return fs.realpathSync(lookup.stdout.trim());
  const extensionRoot = path.join(require("node:os").homedir(), ".vscode/extensions");
  if (fs.existsSync(extensionRoot)) {
    const matches = fs
      .readdirSync(extensionRoot)
      .filter(n => n.startsWith("openai.chatgpt-"))
      .sort()
      .reverse();
    for (const name of matches) {
      const file = path.join(extensionRoot, name, "bin/linux-x86_64/codex");
      if (fs.existsSync(file)) return fs.realpathSync(file);
    }
  }
  throw Error("Codex CLI is unavailable; restore the installed signed-in CLI");
}
function preflight() {
  const codex = discoverCodex();
  const auth = spawnSync(codex, ["login", "status"], { encoding: "utf8", timeout: 15000 });
  if (auth.status !== 0 || !/Logged in using ChatGPT/.test(auth.stdout + auth.stderr))
    throw Error(
      "WAITING_LOGIN: retained ChatGPT CLI login unavailable; no API-key fallback is authorized"
    );
  if (
    !fs.existsSync(path.join(root, c.policy.authState)) ||
    !require("../creative-templates/studio-session").authenticatedLocalState(
      read(path.join(root, c.policy.authState))
    )
  )
    throw Error("WAITING_LOGIN: normal Publisher browser session missing or signed out");
  require.resolve("playwright");
  const stats = fs.statfsSync(root),
    available = stats.bavail * stats.bsize;
  if (available < c.policy.minFreeBytes)
    throw Error(
      "WAITING_DISK: less than 5GiB is free; sources, films and projects must be preserved"
    );
  const sandbox = require("./sandbox-probe")(codex, root);
  return {
    checkedAt: new Date().toISOString(),
    codex,
    cliLogin: "ChatGPT",
    browserSessionFileExists: true,
    playwrightAvailable: true,
    availableBytes: available,
    minFreeBytes: c.policy.minFreeBytes,
    nativeBrowserLoginStillNeedsLiveVerification: true,
    quotaMustBeCheckedInNormalPublisher: true,
    sandbox,
  };
}
function acquireLock() {
  const file = path.join(runtime, "runner.lock.private.json");
  try {
    const fd = fs.openSync(file, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, date }));
    fs.closeSync(fd);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const old = read(file);
    let alive = false;
    try {
      process.kill(old.pid, 0);
      alive = true;
    } catch (error) {
      if (error.code !== "ESRCH") alive = true;
    }
    if (alive) throw Error("Another daily run is active; preserving its lock");
    fs.renameSync(file, `${file}.stale-${Date.now()}`);
    return acquireLock();
  }
  return () => {
    if (read(file).pid === process.pid) fs.unlinkSync(file);
  };
}
function previousHashes() {
  const hashes = new Set();
  const reference = read(path.join(root, c.policy.referencePackage));
  for (const p of reference.posts) if (p.mediaSha256) hashes.add(p.mediaSha256);
  for (const name of fs.readdirSync(runtime)) {
    const file = path.join(runtime, name, "day.json");
    if (name >= date || !/^\d{4}-\d{2}-\d{2}$/.test(name) || !fs.existsSync(file)) continue;
    const old = read(file);
    for (const story of old.stories || [])
      for (const hash of [story.movieSha256, story.recordingSha256]) if (hash) hashes.add(hash);
  }
  return [...hashes];
}
async function run() {
  const book = c.prepare(root, date);
  if (args.includes("--prepare")) {
    console.log(JSON.stringify({ date, status: book.status, file: path.relative(root, bookFile) }));
    return;
  }
  if (args.includes("--validate")) {
    console.log(
      JSON.stringify(
        c.validateDay(root, book, {
          requireSchedules: args.includes("--scheduled"),
          priorHashes: previousHashes(),
        })
      )
    );
    return;
  }
  if (args.includes("--run") && date < c.policy.startDate) {
    console.log(
      JSON.stringify({
        date,
        status: "TODAY_ALREADY_QUEUED",
        dailyStartDate: c.policy.startDate,
        resubmissions: 0,
      })
    );
    return;
  }
  const readiness = preflight();
  if (args.includes("--preflight")) {
    c.atomic(path.join(directory, "preflight.private.json"), readiness);
    console.log(
      JSON.stringify({
        date,
        cliLogin: readiness.cliLogin,
        availableGiB: +(readiness.availableBytes / 1024 ** 3).toFixed(2),
        nativeBrowserLoginStillNeedsLiveVerification: true,
      })
    );
    return;
  }
  if (!args.includes("--run"))
    throw Error("Use --prepare, --preflight, --validate [--scheduled], or --run");
  const release = acquireLock();
  try {
    const fresh = read(bookFile);
    if (fresh.status === "SCHEDULED_VERIFIED") {
      c.validateDay(root, fresh, { requireSchedules: true, priorHashes: previousHashes() });
      console.log(JSON.stringify({ date, alreadyComplete: true, resubmissions: 0 }));
      return;
    }
    const startedAt = new Date().toISOString(),
      attempt = `${startedAt.replace(/[:.]/g, "-")}-${process.pid}`;
    const attemptRoot = path.join(directory, "attempts", attempt);
    fs.mkdirSync(attemptRoot, { recursive: true, mode: 0o700 });
    c.atomic(path.join(attemptRoot, "preflight.private.json"), readiness);
    fresh.status = "RUNNING";
    fresh.attempts.push({ id: attempt, startedAt, status: "RUNNING" });
    c.atomic(bookFile, fresh);
    const task =
      fs.readFileSync(path.join(__dirname, "task.md"), "utf8") +
      `\nRuntime input: ${JSON.stringify({ date, root, daybook: path.relative(root, bookFile), attempt: path.relative(root, attemptRoot), timezone: c.policy.timezone })}\n`;
    const cliArgs = [
      "exec",
      "--sandbox",
      "workspace-write",
      "-c",
      'approval_policy="never"',
      "-c",
      "sandbox_workspace_write.network_access=true",
      "--cd",
      root,
      "--json",
      "--output-schema",
      path.join(__dirname, "result.schema.json"),
      "--output-last-message",
      path.join(attemptRoot, "result.private.json"),
      "-",
    ];
    const env = { ...process.env };
    for (const key of ["CODEX_THREAD_ID", "CODEX_TURN_ID", "CODEX_API_KEY", "OPENAI_API_KEY"])
      delete env[key];
    const stdout = fs.openSync(path.join(attemptRoot, "events.private.jsonl"), "wx", 0o600),
      stderr = fs.openSync(path.join(attemptRoot, "stderr.private.log"), "wx", 0o600);
    const child = spawn(readiness.codex, cliArgs, {
      cwd: root,
      env,
      stdio: ["pipe", stdout, stderr],
    });
    child.stdin.on("error", () => {});
    child.stdin.end(task);
    const stop = signal => child.kill(signal),
      onTerm = () => stop("SIGTERM");
    process.once("SIGTERM", onTerm);
    process.once("SIGINT", onTerm);
    const timeout = setTimeout(() => stop("SIGTERM"), c.policy.maxRunSeconds * 1000);
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });
    } finally {
      clearTimeout(timeout);
      process.removeListener("SIGTERM", onTerm);
      process.removeListener("SIGINT", onTerm);
      fs.closeSync(stdout);
      fs.closeSync(stderr);
    }
    const state = read(bookFile),
      current = state.attempts.find(a => a.id === attempt);
    let report;
    try {
      if (result.code !== 0)
        throw Error(
          `Daily creative process exited ${result.code ?? result.signal}; preserved attempt must be reconciled before retry`
        );
      report = read(path.join(attemptRoot, "result.private.json"));
      if (report.date !== date) throw Error("Agent result date differs from the daybook");
      if (report.status === "SCHEDULED_VERIFIED")
        c.validateDay(root, state, { requireSchedules: true, priorHashes: previousHashes() });
      else if (report.status === "PRODUCED_WAITING_ALLOWANCE") {
        if (state.stories.length !== 4)
          throw Error("Produced status requires four actual reviewed stories");
        const reviewed = state.stories.map(story => c.validateStory(root, story));
        if (
          new Set(reviewed.map(s => s.movieSha256)).size !== 4 ||
          new Set(reviewed.map(s => s.recordingSha256)).size !== 4
        )
          throw Error("Produced status requires four distinct reviewed outputs");
        if (
          reviewed.some(
            s =>
              previousHashes().includes(s.movieSha256) ||
              previousHashes().includes(s.recordingSha256)
          )
        )
          throw Error("Prior released media cannot count as new production");
      }
      state.status = report.status;
      state.blockers = report.blockers;
    } catch (e) {
      state.status = "FAILED";
      state.blockers = [e.message];
    }
    Object.assign(current, {
      finishedAt: new Date().toISOString(),
      status: state.status,
      exitCode: result.code,
      signal: result.signal,
    });
    c.atomic(bookFile, state);
    c.atomic(path.join(runtime, "latest-status.json"), {
      date,
      status: state.status,
      checkedAt: new Date().toISOString(),
      daybook: path.relative(root, bookFile),
      blockers: state.blockers,
      stories: state.stories.length,
      verifiedSchedules: state.posts.filter(p => p.queueVerified).length,
    });
    console.log(
      JSON.stringify({
        date,
        status: state.status,
        stories: state.stories.length,
        verifiedSchedules: state.posts.filter(p => p.queueVerified).length,
      })
    );
    // A handled allowance/login wait is an explicit blocked outcome in the
    // daybook, not a crashed service and never a publication-success claim.
    if (["FAILED", "NEEDS_REVISION"].includes(state.status)) process.exitCode = 2;
  } finally {
    release();
  }
}
run().catch(e => {
  if (args.includes("--run") && !e.message.startsWith("Another daily run")) {
    const status = e.message.startsWith("WAITING_LOGIN")
      ? "WAITING_LOGIN"
      : e.message.startsWith("WAITING_DISK")
        ? "WAITING_DISK"
        : e.message.startsWith("WAITING_RUNTIME")
          ? "WAITING_RUNTIME"
          : "FAILED";
    c.atomic(path.join(runtime, "latest-status.json"), {
      date,
      status,
      checkedAt: new Date().toISOString(),
      blockers: [e.message],
    });
  }
  console.error(e.message);
  process.exitCode = e.message.startsWith("WAITING_") ? 0 : 1;
});
