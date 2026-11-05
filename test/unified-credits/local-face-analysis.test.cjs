const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localFaceAnalysis } = require("../../scripts/monetization/local-face-analysis.cjs");
const env = { UNIFIED_CREDITS_SANDBOX: "true", UNIFIED_CREDITS_PROJECT_ID: "demo-autopromote-credits",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180", CREDITS_LOCAL_FACE_ANALYSIS: "true" };
const config = { env, origin: "http://127.0.0.1:8190" };
test("face transport requires the demo project, opt-in and loopback", () => {
  assert.throws(() => localFaceAnalysis({ config: { ...config, env: { ...env, CREDITS_LOCAL_FACE_ANALYSIS: "false" } } }));
  assert.throws(() => localFaceAnalysis({ config: { ...config, env: { ...env, UNIFIED_CREDITS_PROJECT_ID: "production" } } }));
  assert.throws(() => localFaceAnalysis({ config: { ...config, origin: "https://autopromote.org" } }));
});
test("face transport rejects external sources and excessive ranges before any network/process activity", async () => {
  const adapter = localFaceAnalysis({ config, directory: "/unused" });
  const input = { video_url: "http://127.0.0.1:8190/api/credit-pilot/object/source?cap=example",
    mode: "anchored", start: 0, end: 12 };
  for (const change of [{ video_url: "https://example.com/source" }, { end: 31 }, { start: -1 },
    { mode: "unexpected" }, { video_url: "http://127.0.0.1:8190/admin" }]) {
    await assert.rejects(adapter({ data: { ...input, ...change } }), /LOCAL_FACE_ANALYSIS_INPUT_DENIED/);
  }
});
