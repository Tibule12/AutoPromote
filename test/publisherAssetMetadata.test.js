const test = require("node:test");
const assert = require("node:assert/strict");
const { enrichPublisherAssets } = require("../src/utils/publisherAssetMetadata");

test("Publisher metadata distinguishes storage copies with identical bytes without changing records", async () => {
  const records = [
    { id: "a", storagePath: "uploads/videos/u/first.mp4", url: "https://example.test/first.mp4" },
    { id: "b", storagePath: "uploads/videos/u/second.mp4", url: "https://example.test/second.mp4" },
  ];
  const reads = [];
  const bucket = { file(path) { return { async getMetadata() {
    reads.push(path);
    return [{ md5Hash: "same-base64-digest", metadata: { sourceContext: "clip_studio" } }];
  } }; } };
  const result = await enrichPublisherAssets(records, bucket);
  assert.deepEqual(reads.sort(), records.map(record => record.storagePath).sort());
  assert.deepEqual(result.map(record => [record.id, record.mediaHash, record.source]), [
    ["a", "md5:same-base64-digest", "studio"],
    ["b", "md5:same-base64-digest", "studio"],
  ]);
  assert.equal(records[0].mediaHash, undefined);
});

test("a title and filename cannot create Studio provenance", async () => {
  const record = { id: "old", title: "Made in AutoPromote Studio", storagePath: "uploads/videos/u/edited-in-studio.mp4" };
  const bucket = { file() { return { async getMetadata() { return [{ md5Hash: "digest", metadata: { source: "unified_publisher_client_upload" } }]; } }; } };
  const [result] = await enrichPublisherAssets([record], bucket);
  assert.equal(result.source, undefined);
  assert.equal(result.mediaHash, "md5:digest");
});
