const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const {
  createLoopbackPreviewServer,
} = require("../../scripts/monetization/loopback-preview-server.cjs");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
function get(origin, requestPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: requestPath, method, agent: false },
      response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}
async function fixture(run, requestLimit = 6000) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "preview-http-"));
  fs.writeFileSync(path.join(directory, "index.html"), "<h1>Review</h1>");
  fs.writeFileSync(path.join(directory, ".env"), "PRIVATE_TEST_VALUE");
  const requests = [];
  const api = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ path: req.url }));
  });
  const forbiddenRequests = [];
  const unrelated = http.createServer((req, res) => {
    forbiddenRequests.push(req.url);
    res.end("UNRELATED_LOCAL_SERVICE");
  });
  const apiOrigin = await listen(api),
    unrelatedOrigin = await listen(unrelated);
  const proxy = createLoopbackPreviewServer({
    appOrigin: apiOrigin,
    build: directory,
    requestLimit,
  });
  const origin = await listen(proxy);
  try {
    await run({ origin, apiOrigin, unrelatedOrigin, requests, forbiddenRequests });
  } finally {
    for (const server of [proxy, api, unrelated]) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("review proxy forwards relative API paths to its one configured loopback service", async () => {
  await fixture(async ({ origin, requests }) => {
    const response = await get(origin, "/api/ping?check=1");
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { path: "/api/ping?check=1" });
    assert.deepEqual(requests, ["/api/ping?check=1"]);
    assert.equal((await get(origin, "/editor")).body, "<h1>Review</h1>");
  });
});
test("absolute URLs and network-path references cannot select another local port or remote host", async () => {
  await fixture(async ({ origin, unrelatedOrigin, requests, forbiddenRequests }) => {
    for (const target of [
      unrelatedOrigin + "/api/private",
      "//" + new URL(unrelatedOrigin).host + "/api/private",
      "http://169.254.169.254/api/private",
      "https://example.invalid/api/private",
    ])
      assert.equal((await get(origin, target)).status, 403);
    assert.deepEqual(requests, []);
    assert.deepEqual(forbiddenRequests, []);
  });
});
test("rate limiting precedes both static reads and API forwarding", async () => {
  await fixture(async ({ origin, requests }) => {
    await get(origin, "/");
    await get(origin, "/api/ping");
    assert.equal((await get(origin, "/api/ping")).status, 429);
    assert.equal((await get(origin, "/")).status, 429);
    assert.deepEqual(requests, ["/api/ping"]);
  }, 2);
});
test("hidden configuration cannot be served as static data", async () => {
  await fixture(async ({ origin }) => {
    assert.notEqual((await get(origin, "/.env")).body, "PRIVATE_TEST_VALUE");
    assert.notEqual((await get(origin, "/%2eenv")).body, "PRIVATE_TEST_VALUE");
  });
});
test("review server rejects non-loopback configuration before opening any server", () => {
  for (const appOrigin of [
    "https://example.invalid",
    "http://localhost:12",
    "http://127.0.0.1:12/api",
    "http://user:pass@127.0.0.1:12",
  ])
    assert.throws(
      () => createLoopbackPreviewServer({ appOrigin, build: "/not-used" }),
      /explicit loopback/
    );
});
