const test = require("node:test");
const assert = require("node:assert/strict");
const { isTransientWorkerOutput } = require("../src/services/studioWorkerOutputService");

test("only configured worker files may be transferred into owner storage", () => {
  const worker = "http://127.0.0.1:8008";
  for (const url of ["http://localhost:8008/local-output/viral_job-1.mp4",
    "http://127.0.0.1:8008/local-output/frame.jpg"]) {
    assert.equal(isTransientWorkerOutput(url, worker), true, url);
  }
  for (const url of ["http://elsewhere:8008/local-output/a.mp4",
    "http://localhost:8009/local-output/a.mp4", "http://localhost:8008/admin/a.mp4",
    "http://user:password@localhost:8008/local-output/a.mp4",
    "http://localhost:8008/local-output/a.mp4?redirect=http://elsewhere",
    "http://localhost:8008/local-output/%2e%2e%2fa.mp4",
    "http://localhost:8008/local-output/a.json", "file:///local-output/a.mp4"]) {
    assert.equal(isTransientWorkerOutput(url, worker), false, url);
  }
});

test("already durable remote URLs are not fetched as temporary worker files", () => {
  assert.equal(isTransientWorkerOutput("https://storage.googleapis.com/bucket/a.mp4?X-Goog-Signature=signed",
    "http://127.0.0.1:8008"), false);
  assert.equal(isTransientWorkerOutput("https://worker.example/local-output/a.mp4",
    "https://worker.example"), true);
});
