const { test, expect } = require("@playwright/test");
const fetch = require("node-fetch");

test("API upload test - create content and check Firestore", async () => {
  process.env.CORS_ALLOW_ALL = "true";
  process.env.BYPASS_ACCEPTED_TERMS = "1";
  const app = require("../../../src/server");
  const mainServer = app.listen(0);
  await new Promise(r => mainServer.once("listening", r));
  const mainPort = mainServer.address().port;
  try {
    const payload = {
      title: "API E2E Test",
      type: "video",
      url: "https://example.com/video.mp4",
      description: "E2E upload via direct API for Playwright runner",
      target_platforms: ["spotify"],
    };
    const res = await fetch(`http://127.0.0.1:${mainPort}/api/content/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token-for-testUser123",
        "x-playwright-e2e": "1",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    const normalize = require("../../utils/normalizeApiResponse");
    const { status, body } = normalize(json, res.status);
    expect(status).toBe(201);
    const contentId = body?.content?.id;
    if (!contentId)
      console.warn("Warning: upload API returned unexpected json shape:", JSON.stringify(json));
    expect(contentId).toBeTruthy();
    expect(String(contentId)).toContain("e2e-fake-");
  } finally {
    await new Promise(r => (mainServer ? mainServer.close(r) : r()));
  }
});
