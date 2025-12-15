process.env.FIREBASE_ADMIN_BYPASS = process.env.FIREBASE_ADMIN_BYPASS || "1";
const express = require("express");
const request = require("supertest");
const app = express();

// Set env for FB
process.env.FB_CLIENT_ID = "TEST_FB_CLIENT_ID";
process.env.FB_CLIENT_SECRET = "TEST_FB_CLIENT_SECRET";
process.env.FB_REDIRECT_URI = "https://example.local/api/facebook/callback";

// Monkey-patch safeFetch
const ssrf = require("../src/utils/ssrfGuard");
ssrf.safeFetch = (url, fetchFn, opts) => {
  if (String(url).includes("/oauth/access_token")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ access_token: "FB_ACCESS", token_type: "bearer", expires_in: 3600 }),
    });
  }
  if (String(url).includes("/me/accounts")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: [{ id: "page-1", name: "MyPage", access_token: "PAGE_ACCESS" }] }),
    });
  }
  if (String(url).includes("/" + "page-1")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        id: "page-1",
        name: "MyPage",
        instagram_business_account: { id: "ig-123" },
      }),
    });
  }
  return Promise.resolve({ ok: false, json: async () => ({ error: "unavailable" }) });
};

app.use("/api/facebook", require("../src/routes/facebookRoutes"));

(async () => {
  try {
    const res = await request(app)
      .get("/api/facebook/callback?code=testcode")
      .expect("Content-Type", /json/)
      .expect(200);

    const body = res.body || {};
    if (body.pages && body.pages.some(p => p.access_token)) {
      console.error("Sanitization failed - page access_token returned");
      console.error("Response body:", JSON.stringify(body));
      process.exit(1);
    }
    console.log("Facebook callback sanitization test passed");
    console.log("OK");
  } catch (e) {
    console.error("Test failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
