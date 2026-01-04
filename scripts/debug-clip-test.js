// Quick debug harness for /api/clips/analyze
const express = require("express");
const bodyParser = require("body-parser");
const request = require("supertest");

process.env.FIREBASE_ADMIN_BYPASS = "1";
console.log("DEBUG: start debug harness");
const firebaseAdmin = require("../src/firebaseAdmin");
console.log("DEBUG: firebaseAdmin loaded");
// stub content doc
firebaseAdmin.db.collection = name => ({
  doc: id => ({
    get: async () => ({ exists: true, data: () => ({ user_id: "testUser123" }) }),
    update: async () => true,
  }),
});

const videoClippingService = require("../src/services/videoClippingService");
// stub analyzeVideo
videoClippingService.analyzeVideo = async () => ({ analysisId: "analysis123", clipsGenerated: 2 });

const app = express();
app.use(bodyParser.json());
console.log("DEBUG: about to require clipRoutes");
app.use("/api/clips", require("../src/routes/clipRoutes"));
console.log("DEBUG: clipRoutes mounted");

(async () => {
  const res = await request(app)
    .post("/api/clips/analyze")
    .set("Authorization", "Bearer test-token-for-testUser123")
    .send({ contentId: "content123", videoUrl: "https://storage.googleapis.com/bucket/video.mp4" });

  console.log("DEBUG RESPONSE status=%s body=%o text=%s", res.status, res.body, res.text);
  process.exit(res.status === 200 ? 0 : 1);
})();
