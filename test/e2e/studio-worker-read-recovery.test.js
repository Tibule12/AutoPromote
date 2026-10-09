const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { readStudioWorker } = require("../../src/services/studioWorkerRead");

test("a dropped worker connection retries the same authenticated GET once", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, auth: req.headers.authorization,
      connection: req.headers.connection });
    if (seen.length === 1) return req.socket.destroy();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jobId: "owned-job", status: "completed" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await readStudioWorker(`http://127.0.0.1:${server.address().port}/jobs/owned-job`, {
      headers: { Authorization: "Bearer local-transport-test" }, timeout: 1000, maxRedirects: 0,
    });
    assert.equal(response.data.jobId, "owned-job");
    assert.equal(response.data.status, "completed");
    assert.equal(seen.length, 2);
    for (const request of seen) assert.deepEqual(request, {
      method: "GET", path: "/jobs/owned-job", auth: "Bearer local-transport-test", connection: "close",
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("permission failures are returned without another request", async () => {
  let requests = 0;
  const server = http.createServer((_req, res) => { requests += 1; res.writeHead(403); res.end(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(readStudioWorker(`http://127.0.0.1:${server.address().port}/jobs/owned-job`, {
      headers: {}, timeout: 1000, maxRedirects: 0,
    }), error => error.response.status === 403);
    assert.equal(requests, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
