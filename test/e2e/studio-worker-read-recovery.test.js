const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { readStudioWorker } = require("../../src/services/studioWorkerRead");

test("a dropped worker connection retries the same authenticated GET once", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({
      method: req.method,
      path: req.url,
      auth: req.headers.authorization,
      connection: req.headers.connection,
    });
    if (seen.length === 1) return req.socket.destroy();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jobId: "owned-job", status: "completed" }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await readStudioWorker(
      {
        url: `http://127.0.0.1:${server.address().port}`,
        headers: { Authorization: "Bearer local-transport-test" },
      },
      "owned-job",
      {
        timeout: 1000,
      }
    );
    assert.equal(response.data.jobId, "owned-job");
    assert.equal(response.data.status, "completed");
    assert.equal(seen.length, 2);
    for (const request of seen)
      assert.deepEqual(request, {
        method: "GET",
        path: "/jobs/owned-job",
        auth: "Bearer local-transport-test",
        connection: "close",
      });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("permission failures are returned without another request", async () => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests += 1;
    res.writeHead(403);
    res.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      readStudioWorker(
        { url: `http://127.0.0.1:${server.address().port}`, headers: {} },
        "owned-job",
        {
          timeout: 1000,
        }
      ),
      error => error.response.status === 403
    );
    assert.equal(requests, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("stored job identities and read options cannot change the configured worker origin", async () => {
  const { cancelStudioWorkerJob } = require("../../src/services/studioWorkerRead");
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push([req.method, req.url]);
    res.end("ok");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const config = { url: `http://127.0.0.1:${server.address().port}`, headers: {} };
  try {
    for (const id of [
      "https://attacker.invalid/",
      "../metadata",
      "owned-job/../../secret",
      "owned-job?x=1",
      "%2f%2fattacker.invalid",
      "x".repeat(129),
      { toString: () => "owned-job" },
    ]) {
      await assert.rejects(readStudioWorker(config, id), /Invalid render identity/);
      await assert.rejects(cancelStudioWorkerJob(config, id), /Invalid render identity/);
    }
    await readStudioWorker(config, "owned-job", {
      url: "http://attacker.invalid",
      baseURL: "http://attacker.invalid",
      media: true,
    });
    await cancelStudioWorkerJob(config, "owned-job");
    assert.deepEqual(seen, [
      ["GET", "/jobs/owned-job/media"],
      ["DELETE", "/jobs/owned-job"],
    ]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("worker redirects cannot forward credentials or cancellation to a second origin", async () => {
  const { cancelStudioWorkerJob } = require("../../src/services/studioWorkerRead");
  let escaped = 0;
  const other = http.createServer((_req, res) => {
    escaped += 1;
    res.end("unexpected");
  });
  await new Promise(resolve => other.listen(0, "127.0.0.1", resolve));
  const worker = http.createServer((_req, res) => {
    res.writeHead(307, { Location: `http://127.0.0.1:${other.address().port}/metadata` });
    res.end();
  });
  await new Promise(resolve => worker.listen(0, "127.0.0.1", resolve));
  try {
    const config = {
      url: `http://127.0.0.1:${worker.address().port}`,
      headers: { Authorization: "Bearer private-worker-secret" },
    };
    await assert.rejects(
      readStudioWorker(config, "owned-job"),
      error => error.response.status === 307
    );
    await assert.rejects(
      cancelStudioWorkerJob(config, "owned-job"),
      error => error.response.status === 307
    );
    assert.equal(escaped, 0);
  } finally {
    await Promise.all([
      new Promise(resolve => worker.close(resolve)),
      new Promise(resolve => other.close(resolve)),
    ]);
  }
});
