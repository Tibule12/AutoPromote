// This process survives the API. It receives private validated files only and
// has no Firebase, cloud or publisher credentials in its environment.
process.umask(0o077);
const fs = require("node:fs/promises"), path = require("node:path"), crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const [directory, expectedHash, blender, python] = process.argv.slice(2);
let input;
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
async function status(state, extra = {}) {
  const file = path.join(directory, "status.json"), temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify({ version: 1, jobId: input.jobId, ownerUid: input.ownerUid, sceneHash: input.sceneHash, inputSha256: expectedHash, status: state, ...extra }));
  await fs.rename(temp, file);
}
(async () => {
  const bytes = await fs.readFile(path.join(directory, "input.json"));
  if (sha(bytes) !== expectedHash || !/^[a-f\d]{64}$/.test(expectedHash)) throw Error("Local render input identity changed");
  input = JSON.parse(bytes);
  if (path.basename(directory) !== input.jobId || !/^[A-Za-z0-9_-]{8,100}$/.test(input.jobId)) throw Error("Invalid local render directory");
  if (input.runtime && (!["cpu", "cuda"].includes(input.runtime.device) || ![8, 16, 32].includes(input.runtime.samples) || ![4, 8].includes(input.runtime.threads) ||
      (input.runtime.deadlineSeconds !== undefined && ![900, 1800].includes(input.runtime.deadlineSeconds)))) throw Error("Invalid local render runtime");
  await status("rendering", { workerPid: process.pid, startedAtMs: Date.now() });
  const spec = path.join(directory, "spec.json"); await fs.writeFile(spec, JSON.stringify(input.spec));
  const args = [path.join(__dirname, "render.py"), "--spec", spec, "--output", path.join(directory, "output")];
  if (input.spec.scene.assetStoragePath) args.push("--asset", path.join(directory, "asset"));
  await new Promise((resolve, reject) => {
    const child = spawn(python, args, { detached: true, stdio: ["ignore", "inherit", "inherit"], env: {
      ...process.env, PATH: `${path.dirname(blender)}${path.delimiter}${process.env.PATH || ""}`, BLENDER_BIN: blender,
      ...(input.runtime ? { STUDIO_3D_DEVICE: input.runtime.device, STUDIO_3D_SAMPLES: String(input.runtime.samples), STUDIO_3D_THREADS: String(input.runtime.threads),
        STUDIO_3D_RENDER_SECONDS: String((input.runtime.deadlineSeconds || 900) - 60) } : {}),
    } });
    let timedOut = false, killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
      killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch (_) { /* group already stopped */ } }, 3000);
    }, (input.runtime?.deadlineSeconds || 900) * 1000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (timedOut) { if (killTimer) clearTimeout(killTimer); try { process.kill(-child.pid, "SIGKILL"); } catch (_) { /* group already stopped */ } }
      if (code === 0 && !timedOut) resolve(); else reject(Error(timedOut ? "Local render exceeded its accepted runtime budget" : `Canonical Blender renderer exited ${code}`));
    });
  });
  await status("completed", { finishedAtMs: Date.now() });
})().catch(async error => {
  if (input) await status("failed", { finishedAtMs: Date.now(), error: String(error.message).slice(0, 1000) });
  console.error("Local Blender render failed:", error.message); process.exitCode = 1;
}).finally(async () => {
  if (!input) return;
  const lease = path.join(path.dirname(directory), "active.json");
  try { const current = JSON.parse(await fs.readFile(lease)); if (current.jobId === input.jobId && current.inputSha256 === expectedHash) await fs.unlink(lease); }
  catch (error) { if (error.code !== "ENOENT") console.error("Local capacity cleanup:", error.message); }
});
