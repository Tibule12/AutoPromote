// Simple mock backend that simulates TikTok sandbox token exchange and content share
// Run with: node src/mock/tiktok_share_backend.js

const express = require("express");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

// Mock: exchange code for access token (sandbox)
app.post("/oauth/exchange", (req, res) => {
  const { code, client_key, client_secret, redirect_uri } = req.body || {};
  // Do not log the full code (may be sensitive); just indicate presence and a masked preview
  const preview = code
    ? String(code).length > 8
      ? `${String(code).slice(0, 4)}...${String(code).slice(-4)}`
      : "[masked]"
    : "[missing]";
  console.log("Received exchange request for code present=%s preview=%s", !!code, preview);
  // Validate inputs (in real flow) then call TikTok token endpoint
  // Here we return a fake sandbox token
  return res.json({
    access_token: "sandbox_access_token_ABC123",
    expires_in: 86400,
    refresh_token: "sandbox_refresh_token_DEF456",
    open_id: "mock_open_id",
  });
});

// Mock: simulate uploading/posting a video to TikTok sandbox
app.post("/api/tiktok/share", (req, res) => {
  const auth = req.headers.authorization || ""; // Bearer token
  const body = req.body || {};
  // Do not log full auth or body contents as they may include sensitive tokens.
  console.log("/api/tiktok/share called, bodyKeys=%o", Object.keys(body || {}));
  // Show expected request structure for reviewers
  const expected = {
    method: "POST",
    url: "https://open-api.tiktok.com/video/upload/",
    headers: {
      Authorization: "Bearer <access_token>",
      "Content-Type": "multipart/form-data", // when uploading binary
    },
    body: {
      video: "<binary file or multipart form field>",
      description: "string",
      publish_status: "draft", // for sandbox
    },
  };
  // Return a mock success response similar to TikTok's sandbox
  return res.json({ ok: true, sandbox_video_id: "sandbox_vid_789", expectedRequest: expected });
});

app.listen(8082, () => console.log("Mock TikTok backend running on http://localhost:8082"));
