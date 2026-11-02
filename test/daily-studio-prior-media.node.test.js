const test = require("node:test");
const assert = require("node:assert/strict");
const { reservedMediaHashes } = require("../scripts/daily-studio/prior-media");

const story = id => ({
  id, status: "REVIEWED", movieSha256: `${id}-clean`, recordingSha256: `${id}-public`,
});

test("reviewed unpublished drafts can resume after an interrupted day", () => {
  for (const status of ["FAILED", "RUNNING", "PRODUCED_WAITING_ALLOWANCE"])
    assert.deepEqual(reservedMediaHashes({ status, stories: [story("draft")], posts: [] }), []);
});

test("every prior post reserves its exact media and associated clean result", () => {
  for (const status of ["SUBMITTING", "SUBMISSION_UNCERTAIN", "UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED", "SCHEDULED_VERIFIED_IN_APP"])
    assert.deepEqual(new Set(reservedMediaHashes({
      status: "FAILED", stories: [story("reserved"), story("unpublished")],
      posts: [{ storyId: "reserved", mediaSha256: "reserved-public", status }],
    })), new Set(["reserved-public", "reserved-clean"]));
});

test("an incomplete post without its own hash still reserves its story", () => {
  assert.deepEqual(new Set(reservedMediaHashes({
    status: "FAILED", stories: [story("uncertain")], posts: [{ storyId: "uncertain", status: "SUBMITTING" }],
  })), new Set(["uncertain-clean", "uncertain-public"]));
});

test("completed days retain their protection even with missing post records", () => {
  assert.deepEqual(new Set(reservedMediaHashes({ status: "SCHEDULED_VERIFIED", stories: [story("released")] })),
    new Set(["released-clean", "released-public"]));
});

test("unmatched prior post hashes remain reserved and duplicates collapse", () => {
  assert.deepEqual(reservedMediaHashes({ posts: [{ mediaSha256: "orphan" }, { mediaSha256: "orphan" }] }), ["orphan"]);
});
