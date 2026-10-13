const { directContentSource, contentSource } = require("../src/utils/contentSource");
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("historical copies inherit only verifiable source metadata from their original content", () => {
  const originals = new Map([
    ["studio-render", { sourceContext: "clip_studio" }],
    ["ordinary-upload", { title: "Made in AutoPromote: Coffee — the final edit" }],
  ]);
  assert.equal(contentSource({ meta: { sourceContentId: "studio-render" } }, originals), "studio");
  assert.equal(contentSource({ meta: { sourceContentId: "ordinary-upload" } }, originals), null);
  assert.equal(directContentSource({ meta: { source: "smart_promo" } }), "generated");
  assert.equal(contentSource({ meta: { sourceContentId: "loop" } }, new Map([["loop", { meta: { sourceContentId: "loop" } }]])), null);
});
