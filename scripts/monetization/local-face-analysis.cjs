// Explicitly opted-in CPU transport for the existing face-analysis route.
// Runs real canonical Python against owned emulator bytes; never supplies a
// wallet settlement receipt, external provider result or production fallback.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { assertSandbox } = require("../../src/services/unifiedCredits/runtime");

function localFaceAnalysis({ config, directory }) {
  assertSandbox(config.env);
  if (config.env.CREDITS_LOCAL_FACE_ANALYSIS !== "true") throw Error("LOCAL_FACE_ANALYSIS_DISABLED");
  const origin = new URL(config.origin);
  if (origin.hostname !== "127.0.0.1") throw Error("LOOPBACK_REQUIRED");
  let running = false, attempts = 0;
  return async request => {
    if (running || attempts >= 8) throw Error("LOCAL_FACE_ANALYSIS_BUDGET_EXHAUSTED");
    const body = typeof request.data === "string" ? JSON.parse(request.data) : request.data;
    const source = new URL(body.video_url);
    const endpoint = new URL(request.url).pathname;
    const isFaces = endpoint === "/track-studio-faces";
    if (source.origin !== origin.origin || !source.pathname.startsWith("/api/credit-pilot/object/") ||
        !["/track-studio-faces", "/preview-silence"].includes(endpoint) ||
        (isFaces && (!Number.isFinite(body.start) || !Number.isFinite(body.end) || body.start < 0 ||
          body.end <= body.start || body.end - body.start > 30 ||
          !["anchored", "source_shots"].includes(body.mode)))) throw Error("LOCAL_FACE_ANALYSIS_INPUT_DENIED");
    running = true; attempts++;
    const scratch = fs.mkdtempSync(path.join(directory, "face-analysis-"));
    fs.chmodSync(scratch, 0o700);
    try {
      const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error("OWNED_SOURCE_UNAVAILABLE");
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 50 * 1024 ** 2) throw Error("LOCAL_SOURCE_LIMIT");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const record = { body, directory: scratch, apiOrigin: origin.origin,
        expected: { endpoint, sources: [{ gatewayPath: source.pathname,
          size, contentHash: crypto.createHash("sha256").update(bytes).digest("hex") }] },
        localCpuSeconds: 60 };
      const filename = path.join(scratch, "request.json");
      fs.writeFileSync(filename, JSON.stringify(record), { mode: 0o600 });
      const log = fs.openSync(path.join(scratch, "worker.log"), "a", 0o600);
      const child = spawn(config.env.CREDITS_PYTHON_BIN || "python3",
        [path.join(__dirname, "local-worker-execution.py"), filename], {
          cwd: scratch, detached: true, stdio: ["ignore", log, log],
          env: { ...config.env, CUDA_VISIBLE_DEVICES: "-1", HF_HUB_OFFLINE: "1",
            TRANSFORMERS_OFFLINE: "1", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" },
        });
      fs.closeSync(log);
      const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 90000);
      let terminal;
      try {
        terminal = await new Promise((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code, signal) => resolve({ code, signal }));
        });
      } finally { clearTimeout(timer); }
      fs.writeFileSync(path.join(scratch, "termination.json"), JSON.stringify(terminal), { mode: 0o600 });
      if (terminal.code !== 0 || terminal.signal) throw Error("LOCAL_FACE_ANALYSIS_PROCESS_FAILED");
      const data = JSON.parse(fs.readFileSync(path.join(scratch, "result.json")));
      if (isFaces ? !data.tracks || !data.engine
        : !Array.isArray(data.silence_segments) || !Number.isFinite(data.duration) || data.duration > 30)
        throw Error("LOCAL_FACE_ANALYSIS_RESULT_INVALID");
      return { data, status: 200, statusText: "OK", headers: {}, config: request };
    } finally { running = false; }
  };
}
module.exports = { localFaceAnalysis };
