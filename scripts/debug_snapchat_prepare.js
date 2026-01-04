process.env.FIREBASE_ADMIN_BYPASS = "1";
process.env.SNAPCHAT_PUBLIC_CLIENT_ID = "test_public_id";
process.env.SNAPCHAT_CONFIDENTIAL_CLIENT_ID = "test_conf_id";
process.env.CANONICAL_HOST = "www.autopromote.org";
const express = require("express");
const request = require("supertest");
const bodyParser = require("body-parser");
const router = require("../src/snapchatRoutes");
(async function () {
  const app = express();
  app.use(bodyParser.json());
  app.use("/", router);
  try {
    const res = await request(app)
      .post("/oauth/prepare")
      .set("Authorization", "Bearer test-token-for-debuguser")
      .send({ test_scope: "display_name", popup: false });
    console.log("status", res.status);
    console.log("body", res.body);
    console.log("text", res.text);
  } catch (e) {
    console.error("error", e);
  }
})();
