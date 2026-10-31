// Owns actual local CPU processes independently of the API. Never invokes cloud jobs.
const express = require("express");
const rateLimit = require("express-rate-limit");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  canonical,
  digest,
  workerRequestDigest,
} = require("../../src/services/unifiedCredits/workerVerification");
const { assertSandbox } = require("../../src/services/unifiedCredits/runtime");
async function createLocalWorkerProvider({ directory, python, env, apiOrigin }) {
  assertSandbox(env);
  const executionSeconds = Number(env.CREDITS_DEMO_EXECUTION_SECONDS || 120);
  if (!Number.isInteger(executionSeconds) || executionSeconds < 1 || executionSeconds > 900)
    throw Error('Invalid local worker execution limit');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const executionRoot = fs.realpathSync(directory);
  const privateFile = path.join(directory, "signing-key.pem");
  if (!fs.existsSync(privateFile)) {
    const pair = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(privateFile, pair.privateKey.export({ type: "pkcs8", format: "pem" }), {
      mode: 0o600,
    });
    fs.writeFileSync(
      path.join(directory, "public-key.pem"),
      pair.publicKey.export({ type: "spki", format: "pem" }),
      { mode: 0o600 }
    );
  }
  const key = crypto.createPrivateKey(fs.readFileSync(privateFile));
  const publicKey = fs.readFileSync(path.join(directory, "public-key.pem"), "utf8");
  const tokenFile = path.join(directory, "transport-token");
  if (!fs.existsSync(tokenFile))
    fs.writeFileSync(tokenFile, crypto.randomBytes(32).toString("base64url"), { mode: 0o600 });
  const token = fs.readFileSync(tokenFile, "utf8");
  const running = new Map();
  function groupTerminated(pid) {
    // Linux kernel process membership, excluding already terminated zombies.
    for (const name of fs.readdirSync("/proc").filter(name => /^[0-9]+$/.test(name))) {
      try {
        const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8").split(") ").pop().split(" ");
        if (Number(stat[2]) === pid && !["Z", "X"].includes(stat[0])) return false;
      } catch {
        /* Process exited during enumeration. */
      }
    }
    return true;
  }
  const app = express();
  // Bound every route, including unauthenticated health and capability downloads.
  // This process binds only to loopback and does not trust forwarded client IPs.
  app.use(rateLimit({ windowMs: 60000, max: 240, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: "512kb" }));
  app.get(["/health", "/status"], (_req, res) =>
    res.json({
      status: "ok",
      worker_state: { status: running.size ? "busy" : "idle" },
      provider: "local-process",
    })
  );
  const artifactMac = value => crypto.createHmac("sha256", token).update(value).digest("base64url");
  app.get("/local-output/:id.mp4", (req, res) => {
    const match = /^([a-f0-9]{64})\.([0-9]{13})\.([A-Za-z0-9_-]{43})$/.exec(req.params.id);
    if (!match || match[0] !== req.params.id) return res.sendStatus(400);
    const [, id, expires, cap] = match;
    const value = `${id}:${expires}`;
    if (
      Number(expires) <= Date.now() ||
      !crypto.timingSafeEqual(Buffer.from(cap), Buffer.from(artifactMac(value)))
    )
      return res.sendStatus(403);
    const dir = folder(id);
    const artifact = fs.realpathSync(path.join(dir, "artifact.mp4"));
    if (!artifact.startsWith(dir + path.sep)) return res.sendStatus(403);
    return res.sendFile(artifact);
  });
  app.use((req, res, next) => {
    if (req.get("Authorization") !== `Bearer ${token}`) return res.sendStatus(401);
    next();
  });
  function folder(id) {
    if (typeof id !== "string" || id.length !== 64 || !/^[a-f0-9]{64}$/.test(id))
      throw Object.assign(new Error("Invalid execution ID"), { status: 400 });
    const candidate = path.resolve(executionRoot, id);
    if (!candidate.startsWith(executionRoot + path.sep))
      throw Object.assign(new Error("Execution path outside scratch directory"), { status: 403 });
    if (fs.existsSync(candidate)) {
      const entry = fs.lstatSync(candidate);
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw Object.assign(new Error("Execution directory must be private"), { status: 403 });
    }
    return candidate;
  }
  function read(id) {
    const dir = folder(id);
    const receipt = path.join(dir, "receipt.json");
    if (fs.existsSync(receipt)) {
      // Never follow a replaced receipt to a file outside this execution.
      const actual = fs.realpathSync(receipt);
      if (!actual.startsWith(dir + path.sep))
        throw Object.assign(new Error("Receipt outside execution directory"), { status: 403 });
      return JSON.parse(fs.readFileSync(actual));
    }
    return { state: running.has(id) ? "running" : "unknown", creditsHeld: true };
  }
  app.get("/executions/:id", (req, res) => res.json(read(req.params.id)));
  function complete(dir, expected, code, signal, startedAt) {
    let result = null;
    try {
      result = JSON.parse(fs.readFileSync(path.join(dir, "result.json")));
    } catch {
      /* Terminal process failure. */
    }
    const meaningfulResult =
      expected.endpoint === "/analyze-clips"
        ? Array.isArray(result?.scenes)
        : expected.endpoint === "/dispatch"
          ? result?.success === true && result?.deliveryMode === "local-simulated-destination"
          : typeof result?.output_path === "string";
    const succeeded =
      code === 0 &&
      result !== null &&
      meaningfulResult &&
      result.success !== false &&
      result.status !== "failed";
    const payload = {
      ...expected,
      state: succeeded ? "succeeded" : "failed",
      exitCode: Number.isInteger(code) ? code : 128,
      signal: signal || null,
      processTerminated: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      resultDigest: digest(result || {}),
      result: result || {},
      resource: fs.existsSync(path.join(dir, "resource.json"))
        ? JSON.parse(fs.readFileSync(path.join(dir, "resource.json")))
        : null,
    };
    if (succeeded && result?.output_path) {
      const actual = fs.realpathSync(result.output_path);
      const allowed = path.resolve(__dirname, "../../tmp") + path.sep;
      if (!actual.startsWith(allowed) && !actual.startsWith(dir + path.sep))
        throw new Error("Worker artifact escaped scratch directory");
      const bytes = fs.readFileSync(actual);
      if (bytes.length > 20 * 1024 * 1024) throw new Error("Worker artifact exceeds budget");
      const artifact = path.join(dir, "artifact.mp4");
      fs.copyFileSync(actual, artifact);
      payload.output = {
        path: artifact,
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      };
    }
    const envelope = {
      provider: "local-process",
      payload,
      signature: crypto.sign(null, Buffer.from(canonical(payload)), key).toString("base64"),
    };
    fs.writeFileSync(path.join(dir, "receipt.next.json"), JSON.stringify(envelope), {
      mode: 0o600,
    });
    fs.renameSync(path.join(dir, "receipt.next.json"), path.join(dir, "receipt.json"));
    return envelope;
  }
  app.post(
    ["/render-viral-clip", "/render-clip", "/analyze-clips", "/process", "/dispatch"],
    rateLimit({ windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false }),
    async (req, res, next) => {
      try {
        const expected = JSON.parse(Buffer.from(req.get("X-Credits-Execution") || "", "base64url"));
        if (
          expected.endpoint !== req.path ||
          expected.requestDigest !== workerRequestDigest(req.body) ||
          !expected.sources?.length
        )
          return res.sendStatus(403);
        const dir = folder(expected.executionId);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const requestFile = path.join(dir, "request.json");
        const record = { expected, body: req.body, apiOrigin, directory: dir };
        if (
          fs.existsSync(requestFile) &&
          JSON.parse(fs.readFileSync(requestFile)).expected.requestDigest !== expected.requestDigest
        )
          return res.status(409).json({ error: "EXECUTION_CONFLICT" });
        if (!fs.existsSync(requestFile))
          fs.writeFileSync(requestFile, JSON.stringify(record), { mode: 0o600, flag: "wx" });
        if (!running.has(expected.executionId) && !fs.existsSync(path.join(dir, "receipt.json"))) {
          // A durable claim exists before spawn. A provider restart never silently
          // resubmits a claimed execution whose terminal outcome is unknown.
          if (fs.existsSync(path.join(dir, "claimed.json")))
            return res.status(202).json({ status: "processing", mode: "async", unknown: true });
          fs.writeFileSync(
            path.join(dir, "claimed.json"),
            JSON.stringify({ at: new Date().toISOString() }),
            { mode: 0o600, flag: "wx" }
          );
          const startedAt = new Date().toISOString();
          const failLate = fs.existsSync(path.join(directory, "fail-after-render"));
          if (failLate) fs.unlinkSync(path.join(directory, "fail-after-render"));
          const log = fs.openSync(path.join(dir, "worker.log"), "a", 0o600);
          const child = spawn(
            python,
            [path.resolve(__dirname, "local-worker-execution.py"), requestFile],
            {
              env: {
                ...env,
                CUDA_VISIBLE_DEVICES: "-1",
                HF_HUB_OFFLINE: "1",
                TRANSFORMERS_OFFLINE: "1",
                OMP_NUM_THREADS: "1",
                OPENBLAS_NUM_THREADS: "1",
                CREDITS_FAIL_AFTER_RENDER: failLate ? "1" : "0",
                PYTHONPATH: path.resolve(__dirname, "../.."),
              },
              cwd: dir,
              detached: true,
              stdio: ["ignore", log, log],
            }
          );
          fs.closeSync(log);
          fs.writeFileSync(
            path.join(dir, "process.json"),
            JSON.stringify({ pid: child.pid, startedAt }),
            { mode: 0o600 }
          );
          const timeout = setTimeout(() => {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {}
          }, executionSeconds * 1000);
          const promise = new Promise(resolve => {
            child.once("error", () => {
              clearTimeout(timeout);
              running.delete(expected.executionId);
              resolve({ state: "unknown", creditsHeld: true });
            });
            child.once("exit", async (code, signal) => {
              clearTimeout(timeout);
              running.delete(expected.executionId);
              if (!groupTerminated(child.pid)) {
                try {
                  process.kill(-child.pid, "SIGKILL");
                } catch {
                  /* Recheck below. */
                }
                for (let attempt = 0; attempt < 20 && !groupTerminated(child.pid); attempt++)
                  await new Promise(done => setTimeout(done, 50));
              }
              if (!groupTerminated(child.pid))
                return resolve({ state: "unknown", creditsHeld: true });
              try {
                resolve(complete(dir, expected, code, signal, startedAt));
              } catch (error) {
                resolve({ state: "unknown", error: error.message });
              }
            });
          });
          running.set(expected.executionId, { child, promise });
        }
        if (running.has(expected.executionId)) await running.get(expected.executionId).promise;
        const receipt = read(expected.executionId);
        if (!receipt.payload) return res.status(202).json({ status: "processing", mode: "async" });
        if (receipt.payload.state !== "succeeded")
          return res
            .status(500)
            .json({ detail: "Verified local process failure", executionId: expected.executionId });
        const result = { ...receipt.payload.result };
        if (receipt.payload.output) {
          const handoff = path.join(dir, "handoff.mp4");
          fs.copyFileSync(receipt.payload.output.path, handoff);
          result.output_path = handoff;
          const expires = Date.now() + 30 * 60000;
          result.output_url = `${app.locals.workerOrigin}/local-output/${expected.executionId}.${expires}.${artifactMac(`${expected.executionId}:${expires}`)}.mp4`;
        }
        return res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );
  app.use((error, _req, res, _next) =>
    res.status(error.status || (error.code === "ENOENT" ? 404 : 500)).json({ error: error.message })
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const workerOrigin = `http://127.0.0.1:${server.address().port}`;
  app.locals.workerOrigin = workerOrigin;
  return {
    origin: workerOrigin,
    token,
    publicKey,
    directory,
    async stop() {
      for (const { child } of running.values()) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
      await Promise.all([...running.values()].map(job => job.promise));
      await new Promise(resolve => server.close(resolve));
    },
  };
}
module.exports = { createLocalWorkerProvider };
