const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");
const { safeFetch } = require("../utils/ssrfGuard");

// Platform Health Check Routes
// Provides real-time status of external platform integrations

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

// Helper to check reachability
async function checkReachability(url) {
  if (!fetchFn) return { reachable: false, error: "fetch_unavailable" };
  const start = Date.now();
  try {
    // We expect 401/403 often because we aren't sending auth, we just want to know if the server speaks
    const res = await safeFetch(url, fetchFn, {
      fetchOptions: { method: "GET" },
      requireHttps: true,
      allowHosts: [new URL(url).hostname],
    });
    // Any response means "reachable" even 401
    return {
      reachable: true,
      latency: Date.now() - start,
      status: res.status,
    };
  } catch (e) {
    return {
      reachable: false,
      latency: Date.now() - start,
      error: e.message,
    };
  }
}

router.get("/status", authMiddleware, adminOnly, async (req, res) => {
  const platforms = {
    tiktok: {
      name: "TikTok",
      env: [
        { key: "TIKTOK_CLIENT_KEY", secure: true },
        { key: "TIKTOK_CLIENT_SECRET", secure: true },
      ],
      endpoint: "https://open.tiktokapis.com/v2/user/info/",
    },
    spotify: {
      name: "Spotify",
      env: [
        { key: "SPOTIFY_CLIENT_ID", secure: false },
        { key: "SPOTIFY_CLIENT_SECRET", secure: true },
      ],
      endpoint: "https://api.spotify.com/v1/search?q=test&type=track",
    },
    youtube: {
      name: "YouTube",
      env: [
        { key: "YOUTUBE_CLIENT_ID", secure: false },
        { key: "YOUTUBE_CLIENT_SECRET", secure: true },
      ],
      endpoint: "https://www.googleapis.com/youtube/v3/videos?id=test&key=CHECK_QUOTA",
      // Note: connecting to googleapis checks basic connectivity
    },
    facebook: {
      name: "Facebook/Instagram",
      env: [
        { key: "FACEBOOK_APP_ID", secure: false },
        { key: "FACEBOOK_APP_SECRET", secure: true },
      ],
      endpoint: "https://graph.facebook.com/v16.0/me",
    },
    reddit: {
      name: "Reddit",
      env: [
        { key: "REDDIT_CLIENT_ID", secure: false },
        { key: "REDDIT_CLIENT_SECRET", secure: true },
      ],
      endpoint: "https://www.reddit.com/api/v1/me",
    },
    discord: {
      name: "Discord",
      env: [
        { key: "DISCORD_CLIENT_ID", secure: false },
        { key: "DISCORD_CLIENT_SECRET", secure: true },
        { key: "DISCORD_BOT_TOKEN", secure: true },
      ],
      endpoint: "https://discord.com/api/v10/users/@me",
    },
    telegram: {
      name: "Telegram",
      env: [{ key: "TELEGRAM_BOT_TOKEN", secure: true }],
      endpoint: "https://api.telegram.org/bot", // Usually needs token appended
    },
  };

  const results = {};

  // Execute checks in parallel
  await Promise.all(
    Object.entries(platforms).map(async ([key, config]) => {
      // 1. Check Configuration
      const configStatus = {
        valid: true,
        missing: [],
      };

      config.env.forEach(envVar => {
        if (!process.env[envVar.key]) {
          configStatus.valid = false;
          configStatus.missing.push(envVar.key);
        }
      });

      // 2. Check Service Reachability
      // For Telegram we need to be careful not to send a malformed request that bans us,
      // but a GET to base is usually 404 which is fine.
      let endpoint = config.endpoint;
      if (key === "telegram" && process.env.TELEGRAM_BOT_TOKEN) {
        endpoint = `${config.endpoint}${process.env.TELEGRAM_BOT_TOKEN}/getMe`;
      }

      const netStatus = await checkReachability(endpoint);

      results[key] = {
        name: config.name,
        configured: configStatus.valid,
        missingEnv: configStatus.missing,
        reachable: netStatus.reachable,
        latency: netStatus.latency,
        httpStatus: netStatus.status,
        lastChecked: new Date().toISOString(),
      };
    })
  );

  res.json({
    success: true,
    platforms: results,
  });
});

module.exports = router;
