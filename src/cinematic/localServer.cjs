#!/usr/bin/env node
/* Opt-in loopback-only worker host. Never mounted by src/server.js. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync, execFileSync } = require("node:child_process");
const { validateCinematicScene, buildCinematicGraph, planCinematicIntent } = require("../../frontend/src/components/threeD/cinematicContract");
const ROOT = path.resolve(__dirname, "../..");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const PROFILES = { preview: { width: 640, height: 360, samples: 8 }, export: { width: 1280, height: 720, samples: 4 } };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".json": "application/json", ".blend": "application/octet-stream", ".ttf": "font/ttf" };

function createLocalEngine({ directory, blender, maxSeconds = 3600, threads = 4 } = {}) {
  if (!Number.isInteger(threads) || threads < 1 || threads > 8 || !Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 3600)
    throw new Error("Local CPU limits must be 1–8 threads and 1–3600 seconds");
  directory = path.resolve(directory || process.env.CINEMATIC_WORK_DIR || path.join(os.tmpdir(), "autopromote-cinematic-local"));
  if (directory === ROOT || directory.startsWith(ROOT + path.sep + "frontend")) throw new Error("Use an isolated output directory");
  blender = path.resolve(blender || process.env.BLENDER_BIN || path.join(os.homedir(), ".cache/autopromote-cinematic-runtime/blender-4.5.9-linux-x64/blender"));
  fs.mkdirSync(path.join(directory, "assets"), { recursive: true });
  fs.mkdirSync(path.join(directory, "jobs"), { recursive: true });
  const font = path.join(ROOT, "frontend/src/components/motion/fonts/Inter-SemiBold.ttf");
  const builder = path.join(ROOT, "studio_3d_renderer/cinematic_scene.py");
  const runner = path.join(ROOT, "studio_3d_renderer/cinematic_local.py");
  const inventory = new Map(), jobs = new Map();
  let active = null;
  const versions = { blender: fs.existsSync(blender) ? execFileSync(blender, ["--version"], { encoding: "utf8", timeout: 10000 }).split("\n")[0] : "unavailable",
    ffmpeg: execFileSync("ffmpeg", ["-version"], { encoding: "utf8", timeout: 10000 }).split("\n")[0] };
  const gpuProbe = spawnSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"], { encoding: "utf8", timeout: 2000 });
  const gpu = { probe: "local_nvidia_smi", detected: gpuProbe.status === 0 ? gpuProbe.stdout.trim().split("\n").filter(Boolean) : [],
    selected: false, reason: "This adapter enforces CPU execution; cloud/GPU dispatch is disabled" };
  const capabilities = () => ({ version: 1, renderer: "blender_cycles_cpu", available: versions.blender !== "unavailable", versions,
    execution: "local_cpu", gpuEnabled: false, cpuThreads: threads, maxSeconds, maxDuration: 10,
    cpu: { architecture: os.arch(), logicalCores: os.availableParallelism(), threadLimit: threads }, gpu,
    profiles: PROFILES, externalCharges: 0, currency: "USD", cloudEnabled: false });
  function register(file, name) {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > 128 * 1024 ** 2) throw new Error("Local media must be 1 byte–128 MB");
    const id = hash(fs.readFileSync(file));
    const target = path.join(directory, "assets", id + ".media");
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi,mpegts",
      "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 ** 2 }));
    const video = probe.streams.find(stream => stream.codec_type === "video");
    const duration = Number(probe.format.duration);
    if (!video || !Number.isFinite(duration) || duration < 4 || duration > 86400 || video.width * video.height > 3840 * 2160)
      throw new Error("Unsupported video; use a 4s–24h video up to UHD");
    if (!fs.existsSync(target)) fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
    const asset = { id, name: String(name || path.basename(file)).replace(/[<>\x00-\x1f]/g, "").slice(0, 120), duration,
      width: video.width, height: video.height, hasAudio: probe.streams.some(stream => stream.codec_type === "audio"), bytes: stat.size };
    inventory.set(id, { ...asset, path: target });
    fs.writeFileSync(path.join(directory, "assets", id + ".json"), JSON.stringify(asset));
    return asset;
  }
  // Recovery is scoped to this isolated directory; never read an application session.
  for (const name of fs.readdirSync(path.join(directory, "assets"))) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const asset = JSON.parse(fs.readFileSync(path.join(directory, "assets", name)));
    const media = path.join(directory, "assets", asset.id + ".media");
    if (fs.existsSync(media)) inventory.set(asset.id, { ...asset, path: media });
  }
  const assets = () => [...inventory.values()].map(({ path: _path, ...asset }) => asset);
  const statePath = id => path.join(directory, "jobs", id, "state.json");
  function persist(job) {
    jobs.set(job.id, job);
    fs.writeFileSync(statePath(job.id) + ".tmp", JSON.stringify(job));
    fs.renameSync(statePath(job.id) + ".tmp", statePath(job.id));
  }
  function status(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid render identity");
    if (jobs.has(id)) return jobs.get(id);
    if (!fs.existsSync(statePath(id))) throw new Error("Render not found");
    const job = JSON.parse(fs.readFileSync(statePath(id)));
    if (!["completed", "failed", "cancelled"].includes(job.status)) {
      job.status = "failed"; job.error = "Local worker was interrupted. Retry to rebuild this scene.";
      persist(job);
    }
    return job;
  }
  function submit(scene, quality) {
    validateCinematicScene(scene);
    if (!Object.hasOwn(PROFILES, quality)) throw new Error("Unknown render profile");
    if (!capabilities().available) throw new Error("Blender is unavailable; set BLENDER_BIN");
    const graph = buildCinematicGraph(scene);
    const media = {};
    for (const role of ["presenter", "evidence"]) {
      const asset = inventory.get(scene.cinematic.sources[role]);
      if (!asset || hash(fs.readFileSync(asset.path)) !== asset.id) throw new Error(`Missing or changed ${role} media; import it again`);
      const offset = scene.cinematic.sources[role + "Offset"];
      if (offset + scene.duration > asset.duration + .001) throw new Error(`${role} source is too short for this duration/offset`);
      media[role] = { ...asset, offset };
    }
    const identity = { version: 1, graph, quality, profile: PROFILES[quality], fps: 24,
      assetHashes: Object.fromEntries(Object.entries(media).map(([role, asset]) => [role, asset.id])),
      builderHash: hash(fs.readFileSync(builder)), runnerHash: hash(fs.readFileSync(runner)), fontHash: hash(fs.readFileSync(font)), versions,
      disclosure: scene.cinematic.content.disclosure, threads };
    const id = hash(stable(identity));
    const work = path.join(directory, "jobs", id);
    if (fs.existsSync(statePath(id))) {
      const prior = status(id);
      if (prior.status === "completed" && fs.existsSync(path.join(work, "movie.mp4")) &&
          hash(fs.readFileSync(path.join(work, "movie.mp4"))) === prior.outputSha256) return { ...prior, reused: true };
      if (active?.id === id) return { ...prior, reused: true };
    }
    if (active) throw new Error("Local CPU worker is busy; cancel or wait for the active scene");
    if (fs.statfsSync(directory).bavail * fs.statfsSync(directory).bsize < 3 * 1024 ** 3) throw new Error("Local render requires at least 3 GiB free disk");
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const manifest = { ...identity, manifestId: id, blender, font, assets: media };
    fs.writeFileSync(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2));
    let job = { id, status: "queued", progress: 0, quality, sceneId: scene.id,
      sceneRevision: hash(stable({ ...scene, hqPreviewUrl: "", hqPreviewRevision: "", hqPreviewJobId: "" })),
      createdAt: new Date().toISOString(), externalCharges: 0, reused: false };
    persist(job);
    const child = spawn("python3", [runner, path.join(work, "manifest.json")], { cwd: work, detached: true,
      env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: work, OMP_NUM_THREADS: String(threads),
        CUDA_VISIBLE_DEVICES: "", HIP_VISIBLE_DEVICES: "", OPENBLAS_NUM_THREADS: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    const log = fs.createWriteStream(path.join(work, "worker.log"));
    let buffer = "", ended = false;
    const kill = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    const timer = setTimeout(() => {
      job = { ...job, status: "failed", error: `Local render exceeded ${maxSeconds}s wall time` };
      persist(job); kill();
    }, maxSeconds * 1000);
    active = { id, kill, cancel: () => { job = { ...job, status: "cancelled", error: "Cancelled locally" }; persist(job); kill(); } };
    child.stdout.on("data", chunk => {
      log.write(chunk); buffer += chunk.toString();
      const lines = buffer.split("\n"); buffer = lines.pop();
      for (const line of lines) {
        try {
          const update = JSON.parse(line);
          if (["failed", "cancelled"].includes(job.status)) continue;
          if (["preparing", "rendering", "assembling", "completed", "failed"].includes(update.status)) {
            job = { ...job, ...update };
            // Completion is published only after subprocess success and output verification.
            if (update.status === "completed") job.status = "assembling";
            persist(job);
          }
        } catch { /* Blender output is diagnostic, never executable data. */ }
      }
    });
    child.stderr.on("data", chunk => log.write(chunk));
    const finish = (code, error) => {
      if (ended) return; ended = true;
      clearTimeout(timer); log.end();
      if (active?.id === id) active = null;
      if (!["cancelled", "failed"].includes(job.status)) {
        const output = path.join(work, "movie.mp4");
        if (code === 0 && fs.existsSync(output) && fs.existsSync(path.join(work, "receipt.json"))) {
          job = { ...job, status: "completed", progress: 1, movieUrl: `/api/cinematic/jobs/${id}/movie.mp4`,
            outputSha256: hash(fs.readFileSync(output)), receiptUrl: `/api/cinematic/jobs/${id}/receipt.json` };
        } else job = { ...job, status: "failed", error: error || "Local renderer exited before a verified output" };
      }
      job.finishedAt = new Date().toISOString(); persist(job);
      if (job.status !== "completed") {
        for (const folder of ["presenter", "evidence", "frames"]) fs.rmSync(path.join(work, folder), { recursive: true, force: true });
        fs.rmSync(path.join(work, "movie.mp4"), { force: true });
      }
    };
    child.on("error", error => finish(1, error.message));
    child.on("close", code => finish(code));
    return job;
  }
  function cancel(id) {
    const job = status(id);
    if (active?.id === id) {
      active.cancel();
    }
    return status(id);
  }
  return { directory, register, assets, submit, status, cancel, capabilities,
    assetFile: id => inventory.get(id)?.path,
    shutdown: () => { if (active) active.kill(); },
    plan: intent => planCinematicIntent(intent, assets()) };
}

async function body(req, limit = 128 * 1024 ** 2) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error("Request too large"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function serveFile(req, res, file, type) {
  const stat = fs.statSync(file);
  const range = req.headers.range;
  const headers = { "Content-Type": type || MIME[path.extname(file)] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) { res.writeHead(416); res.end(); return; }
    const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stat.size}` });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else { res.writeHead(200, { ...headers, "Content-Length": stat.size }); fs.createReadStream(file).pipe(res); }
}
function createLocalServer(engine, { port = 6341, build } = {}) {
  const origin = `http://127.0.0.1:${port}`;
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self' blob: data:; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'");
    const send = (data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
    try {
      if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) return send({ error: "Loopback origin required" }, 403);
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin !== origin) return send({ error: "Same-origin request required" }, 403);
      const url = new URL(req.url, origin);
      if (req.method === "GET" && url.pathname === "/api/cinematic/capabilities") return send(engine.capabilities());
      if (req.method === "GET" && url.pathname === "/api/cinematic/assets") return send({ assets: engine.assets() });
      if (req.method === "POST" && url.pathname === "/api/cinematic/assets") {
        if (req.headers["content-type"] !== "application/octet-stream") throw new Error("Upload raw video bytes");
        const tmp = path.join(engine.directory, `upload-${crypto.randomUUID()}.tmp`);
        try { fs.writeFileSync(tmp, await body(req)); return send(engine.register(tmp, decodeURIComponent(req.headers["x-file-name"] || "Local video")), 201); }
        finally { fs.rmSync(tmp, { force: true }); }
      }
      const media = /^\/api\/cinematic\/assets\/([a-f0-9]{64})\/media$/.exec(url.pathname);
      if (media && ["GET", "HEAD"].includes(req.method)) {
        const file = engine.assetFile(media[1]); if (!file) return send({ error: "Asset unavailable" }, 404);
        return serveFile(req, res, file, "video/mp4");
      }
      if (req.method === "POST" && ["/api/cinematic/jobs", "/api/cinematic/plan"].includes(url.pathname)) {
        if (req.headers["content-type"] !== "application/json") throw new Error("JSON body required");
        const input = JSON.parse((await body(req, 64 * 1024)).toString());
        return send(url.pathname.endsWith("/plan") ? engine.plan(input) : engine.submit(input.scene, input.quality), 202);
      }
      const job = /^\/api\/cinematic\/jobs\/([a-f0-9]{64})(?:\/(movie\.mp4|receipt\.json|scene\.blend|manifest\.json))?$/.exec(url.pathname);
      if (job) {
        if (req.method === "DELETE" && !job[2]) return send(engine.cancel(job[1]));
        if (req.method !== "GET") return send({ error: "Method not allowed" }, 405);
        const state = engine.status(job[1]);
        if (!job[2]) return send(state);
        if (state.status !== "completed") throw new Error("Render has no completed artifact");
        return serveFile(req, res, path.join(engine.directory, "jobs", job[1], job[2]));
      }
      if (build && req.method === "GET" && !url.pathname.startsWith("/api/")) {
        const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).slice(1);
        const file = path.resolve(build, relative);
        if (!file.startsWith(path.resolve(build) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send({ error: "Not found" }, 404);
        return serveFile(req, res, file);
      }
      return send({ error: "Local endpoint not available" }, 404);
    } catch (error) { send({ error: error.message }, /busy/.test(error.message) ? 409 : 422); }
  });
}
if (require.main === module) {
  const engine = createLocalEngine();
  for (const file of process.argv.slice(2)) engine.register(path.resolve(file));
  const port = Number(process.env.CINEMATIC_PORT || 6341);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid loopback port");
  const server = createLocalServer(engine, { port, build: path.join(ROOT, "reports/cinematic-evidence-20261031/local-app") });
  server.listen(port, "127.0.0.1", () => console.log(`Local Studio: http://127.0.0.1:${port} | CPU only | external cost $0`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { engine.shutdown(); server.close(() => process.exit(0)); });
}
module.exports = { createLocalEngine, createLocalServer, stable, hash };
