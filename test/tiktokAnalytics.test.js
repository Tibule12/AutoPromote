const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePublishStatus, resolvePublicVideoId } = require("../src/services/tiktokAnalytics");

test("TikTok public IDs preserve every digit, including unsafe numeric JSON IDs", async () => {
  const body =
    '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7701756990720051281,"7701756990720051282"]},"error":{"code":"ok"}}';
  assert.deepEqual(parsePublishStatus(body).data.publicaly_available_post_id, [
    "7701756990720051281",
    "7701756990720051282",
  ]);
  assert.equal(
    await resolvePublicVideoId("v_pub_file~owned", async () => body),
    "7701756990720051281"
  );
});

test("Upload acceptance does not imply publication or fabricate a queryable video ID", async () => {
  await assert.rejects(
    resolvePublicVideoId("v_pub_file~owned", async () => '{"data":{"status":"PROCESSING_UPLOAD"}}'),
    { code: "PUBLICATION_NOT_CONFIRMED" }
  );
  await assert.rejects(
    resolvePublicVideoId("v_pub_file~owned", async () => '{"data":{"status":"PUBLISH_COMPLETE"}}'),
    { code: "PUBLIC_VIDEO_ID_MISSING" }
  );
});

test("TikTok provider errors remain explicit", async () => {
  await assert.rejects(
    resolvePublicVideoId(
      "v_pub_file~owned",
      async () => '{"error":{"code":"scope_not_authorized","message":"video.list is required"}}'
    ),
    { code: "scope_not_authorized" }
  );
});
