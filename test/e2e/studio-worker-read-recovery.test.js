const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { readStudioWorker, cancelStudioWorker, workerConfig } = require("../../src/services/studioWorkerRead");
const secret = "local-transport-test-secret-at-least-32-bytes";
async function worker(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const previous = { url: process.env.STUDIO_NVIDIA_VFX_URL, secret: process.env.STUDIO_NVIDIA_VFX_SECRET };
  process.env.STUDIO_NVIDIA_VFX_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.STUDIO_NVIDIA_VFX_SECRET = secret;
  t.after(async () => {
    for (const [name, value] of [["STUDIO_NVIDIA_VFX_URL", previous.url], ["STUDIO_NVIDIA_VFX_SECRET", previous.secret]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await new Promise(resolve => server.close(resolve));
  });
  return process.env.STUDIO_NVIDIA_VFX_URL;
}

test("a dropped worker connection retries the same authenticated GET once", async t => {
  const seen = [];
  await worker(t, (req, res) => {
    seen.push({ method: req.method, path: req.url, auth: req.headers.authorization, connection: req.headers.connection });
    if (seen.length === 1) return req.socket.destroy();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jobId: "owned-job", status: "completed" }));
  });
  const response = await readStudioWorker("owned-job", { timeout: 1000 });
  assert.equal(response.data.status, "completed");
  assert.equal(seen.length, 2);
  for (const request of seen) assert.deepEqual(request, {
    method: "GET", path: "/jobs/owned-job", auth: `Bearer ${secret}`, connection: "close",
  });
});

test("permission failures return without another request", async t => {
  let requests = 0;
  await worker(t, (_req, res) => { requests++; res.writeHead(403); res.end(); });
  await assert.rejects(readStudioWorker("owned-job", { timeout: 1000 }), e => e.response.status === 403);
  assert.equal(requests, 1);
});

test("URL-shaped job IDs and path/query injection never reach a worker", async t => {
  let requests = 0;
  await worker(t, (_req, res) => { requests++; res.end(); });
  for (const id of ["http://169.254.169.254/latest/meta-data", "//evil.example/credential", "../metadata", "owned-job?url=evil", "owned-job#evil", "owned%2fjob", "owned\\job", "owned-job\n", {}, null]) {
    await assert.rejects(readStudioWorker(id), e => e.statusCode === 400);
    await assert.rejects(cancelStudioWorker(id), e => e.statusCode === 400);
  }
  assert.equal(requests, 0);
});

test("worker redirects cannot send credentials to another destination", async t => {
  let leaked = 0;
  const trap = http.createServer((_req, res) => { leaked++; res.end("leaked"); });
  await new Promise(resolve => trap.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => trap.close(resolve)));
  await worker(t, (_req, res) => { res.writeHead(302, { Location: `http://127.0.0.1:${trap.address().port}/metadata` }); res.end(); });
  await assert.rejects(readStudioWorker("owned-job", { maxRedirects: 5 }), e => e.response.status === 302);
  await assert.rejects(cancelStudioWorker("owned-job", { maxRedirects: 5 }), e => e.response.status === 302);
  assert.equal(leaked, 0);
});

test("callers cannot override the configured origin, authentication or operation", async t => {
  const seen = [];
  await worker(t, (req, res) => { seen.push([req.method, req.url, req.headers.authorization]); res.end("media"); });
  const result = await readStudioWorker("owned-job", {
    resource: "media", responseType: "arraybuffer", baseURL: "http://169.254.169.254/",
    url: "http://evil.example/", method: "POST", headers: { Authorization: "untrusted" }, proxy: { host: "evil.example" },
  });
  assert.equal(Buffer.from(result.data).toString(), "media");
  assert.deepEqual(seen, [["GET", "/jobs/owned-job/media", `Bearer ${secret}`]]);
});

test("explicit cancellation never retries an uncertain request", async t => {
  let requests = 0;
  await worker(t, (req) => { requests++; req.socket.destroy(); });
  await assert.rejects(cancelStudioWorker("owned-job"));
  assert.equal(requests, 1);
});

test("invalid worker configuration fails before network access", async t => {
  let requests = 0;
  await worker(t, (_req, res) => { requests++; res.end(); });
  for (const url of ["file:///etc/passwd", "http://user:password@localhost", "http://localhost/?url=evil", "http://localhost/#evil", "not-a-url"]) {
    process.env.STUDIO_NVIDIA_VFX_URL = url;
    assert.throws(() => workerConfig(), e => e.statusCode === 503);
  }
  assert.equal(requests, 0);
});
