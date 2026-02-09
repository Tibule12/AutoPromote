// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require("firebase-functions/v1");
// The Firebase Admin SDK to access Cloud Firestore, Realtime Database and Cloud Storage.
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("./lib/uuid-compat");
// path module not required in current implementation
const cors = require("cors");
const express = require("express");
admin.initializeApp();

// Removed diagnostic logging to reduce initialization time
// Moved heavy imports into functions to optimize deployment

// Expose the main Express server as `api` function for Firebase Hosting rewrites
// We'll lazy-load the server on the first request so module import-time
// won't fail in the Cloud Functions load step (avoid timeouts / require errors).
// The root package `autopromote-server` exports the Express `app` safely;
// if that isn't installed we will fall back to the local _server copy.
let _serverApp = null;
function getServerApp() {
  if (_serverApp) return _serverApp;
  try {
    // Prefer installed package
    _serverApp = require("autopromote-server");
    console.log("[index] Loaded autopromote-server package");
  } catch (e) {
    console.warn("[index] Could not require autopromote-server package:", e.message);
    try {
      // Lazy load express only if needed
      // Fallback to local _server copy (copied by copy-server.js)
      _serverApp = require("./_server/src/server");
      console.log("[index] Loaded local _server fallback");
    } catch (localErr) {
      console.warn("[index] Could not load local _server:", localErr.message);
      try {
        const express = require("express");
        const fallbackApp = express();
        fallbackApp.use((req, res) => res.status(503).send("Service initializing (Server Code Missing)"));
        _serverApp = fallbackApp;
      } catch (expressErr) {
        console.error(
          "[index] Could not create fallback express app:",
          expressErr && expressErr.message
        );
        throw e; // fallback unavailable - rethrow original error
      }
    }
  }
  return _serverApp;
}

// Simple test function to verify deployment
exports.helloWorld = functions.https.onRequest((req, res) => {
  res.send("Hello from Firebase Functions!");
});

// Initialize Express app
const app = express();

// Configure CORS. In production this should be restricted via
// the `CORS_ALLOWED_ORIGINS` env var (comma-separated). For
// short-lived smoke tests you may set `CORS_ALLOW_ALL=1` but
// the default is conservative (deny cross-origin browser requests).
const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS || "";
// Only allow wildcard CORS when running inside CI (GitHub Actions)
const corsAllowAllFlag =
  process.env.CORS_ALLOW_ALL === "1" || process.env.CORS_ALLOW_ALL === "true";
const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
const corsAllowAll = corsAllowAllFlag && isCI;
let corsOptions;
if (corsAllowAll) {
  corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
} else if (allowedOriginsEnv) {
  const allowedList = allowedOriginsEnv
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  corsOptions = {
    origin: function (origin, callback) {
      // Allow server-to-server requests (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedList.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
} else {
  // Conservative default: allow requests from known production domains
  corsOptions = {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const builtInAllowed = [
        "https://autopromote.org",
        "https://www.autopromote.org",
        "https://autopromote-cc6d3.web.app",
        "https://autopromote-cc6d3.firebaseapp.com",
      ];
      if (builtInAllowed.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
}
app.use(cors(corsOptions));

// Export YouTube video upload function
// NOTE: to avoid heavy require-time imports we implement lazy wrappers
// for common Cloud Functions trigger types. This ensures the heavy
// provider SDKs are only required when the function is invoked.
const region = "us-central1";

function lazyOnCall(modulePath, exportName) {
  exports[exportName] = functions.region(region).https.onCall(async (data, context) => {
    try {
      const mod = require(modulePath);
      if (!mod || typeof mod[exportName] !== "function") throw new Error("handler not found");
      return await mod[exportName](data, context);
    } catch (err) {
      console.error(
        "[index][lazyOnCall] failed to load",
        modulePath,
        exportName,
        err && err.message
      );
      throw new functions.https.HttpsError("internal", "Handler initialization failed");
    }
  });
}

function lazyOnRequest(modulePath, exportName) {
  exports[exportName] = functions.region(region).https.onRequest((req, res) => {
    try {
      const mod = require(modulePath);
      if (!mod || typeof mod[exportName] !== "function")
        return res.status(500).send("handler_missing");
      return mod[exportName](req, res);
    } catch (err) {
      console.error(
        "[index][lazyOnRequest] failed to load",
        modulePath,
        exportName,
        err && err.message
      );
      return res.status(500).send("handler_initialization_failed");
    }
  });
}

function lazyNoopExport(modulePath, exportName) {
  // Fallback: export a simple wrapper that loads & invokes the handler if it's a plain function.
  exports[exportName] = (...args) => {
    const mod = require(modulePath);
    if (mod && typeof mod[exportName] === "function") return mod[exportName](...args);
    throw new Error("handler_missing");
  };
}

// Export YouTube video upload function
// The following wrappers intentionally defer requiring the heavy modules
// until the cloud function is actually invoked. We use onCall/onRequest
// wrappers depending on the handler being expected to be invoked as
// a firebase https callable function or an https request handler.
lazyOnCall("./youtubeUploader", "uploadVideoToYouTube");
// OAuth utilities (https.onCall and https.onRequest handlers)
lazyOnCall("./tiktokOAuth", "getTikTokAuthUrl");
lazyOnRequest("./tiktokOAuth", "tiktokOAuthCallback");
lazyOnCall("./facebookOAuth", "getFacebookAuthUrl");
lazyOnRequest("./facebookOAuth", "facebookOAuthCallback");
lazyOnCall("./youtubeOAuth", "getYouTubeAuthUrl");
lazyOnRequest("./youtubeOAuth", "youtubeOAuthCallback");
lazyOnCall("./pinterestOAuth", "getPinterestAuthUrl");
lazyOnRequest("./pinterestOAuth", "pinterestOAuthCallback");
lazyOnCall("./discordOAuth", "getDiscordAuthUrl");
lazyOnRequest("./discordOAuth", "discordOAuthCallback");
lazyOnCall("./spotifyOAuth", "getSpotifyAuthUrl");
lazyOnRequest("./spotifyOAuth", "spotifyOAuthCallback");
lazyOnCall("./linkedinOAuth", "getLinkedInAuthUrl");
lazyOnRequest("./linkedinOAuth", "linkedinOAuthCallback");
lazyOnCall("./redditOAuth", "getRedditAuthUrl");
lazyOnRequest("./redditOAuth", "redditOAuthCallback");
lazyOnCall("./twitterOAuth", "getTwitterAuthUrl");
lazyOnRequest("./twitterOAuth", "twitterOAuthCallback");
lazyOnRequest("./telegramWebhook", "telegramWebhook");
lazyOnCall("./instagramOAuth", "getInstagramAuthUrl");
lazyOnRequest("./instagramOAuth", "instagramOAuthCallback");
lazyOnCall("./snapchatOAuth", "getSnapchatAuthUrl");
lazyOnRequest("./snapchatOAuth", "snapchatOAuthCallback");
// Referral system and other onCall helpers
lazyNoopExport("./referralSystem", "addReferrerToContent");
lazyNoopExport("./referralSystem", "getReferralStats");
lazyOnCall("./promotionTemplates", "createPromotionTemplate");
lazyOnCall("./promotionTemplates", "listPromotionTemplates");
lazyOnCall("./promotionTemplates", "attachTemplateToContent");
lazyNoopExport("./revenueAttribution", "logMonetizationEvent");
lazyNoopExport("./revenueAttribution", "getRevenueSummary");
lazyOnCall("./socialAutoPromotion", "autoPromoteContent");
lazyOnCall("./smartLinkTracker", "generateSmartLink");
// smartLinkRedirect may be an https request, so we lazy export as onRequest
lazyOnRequest("./smartLinkTracker", "smartLinkRedirect");
lazyOnCall("./monetizedLandingPage", "generateMonetizedLandingPage");

// (region already defined above)

// Lazy wrapper for API so the function can be deployed even if
// the underlying server isn't present during package-level require.
const { verifyFirebaseToken } = require("./_server/src/authRoutes");

exports.api = functions.region(region).https.onRequest((req, res) => {
  verifyFirebaseToken(req, res, () => {
    try {
      return getServerApp()(req, res);
    } catch (e) {
      console.error("api error during request:", e && e.message);
      return res.status(500).send("Server error");
    }
  });
});

exports.createPromotionOnApproval = functions
  .region(region)
  .firestore.document("content/{contentId}")
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      const contentId = context.params.contentId;
      console.log(`createPromotionOnApproval triggered for contentId: ${contentId}`);
      console.log("Before status:", before.status, "After status:", after.status);
      // Only trigger if status changed to 'approved'
      if (before.status !== "approved" && after.status === "approved") {
        const promotionData = {
          contentId,
          isActive: true,
          startTime: admin.firestore.Timestamp.now(),
          endTime: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          createdAt: admin.firestore.Timestamp.now(),
        };
        await admin.firestore().collection("promotion_schedules").add(promotionData);
        console.log(`Promotion schedule created for content (onUpdate): ${contentId}`);
      } else {
        console.log("Status did not change to approved, no promotion created.");
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnApproval:", error);
      return null;
    }
  });

// Export Monetized Landing Page Generator
// Lazy export monetized landing page generator

exports.createPromotionOnContentCreate = functions
  .region(region)
  .firestore.document("content/{contentId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      const contentId = context.params.contentId;
      console.log(`createPromotionOnContentCreate triggered for contentId: ${contentId}`);
      console.log("Document status:", data.status);
      if (data.status === "approved") {
        const promotionData = {
          contentId,
          isActive: true,
          startTime: admin.firestore.Timestamp.now(),
          endTime: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          createdAt: admin.firestore.Timestamp.now(),
        };
        await admin.firestore().collection("promotion_schedules").add(promotionData);
        console.log(`Promotion schedule created for content (onCreate): ${contentId}`);
      } else {
        console.log("Document status is not approved, no promotion created.");
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnContentCreate:", error);
      return null;
    }
  });

// // -----------------------------
// // Intent-driven automation
// // -----------------------------

// // When a content doc marks landingPageRequestedAt and lacks landingPageUrl, generate the landing page
exports.handleLandingPageIntent = functions
  .region(region)
  .firestore.document("content/{contentId}")
  .onUpdate(async (change, context) => {
    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.exists ? change.after.data() || {} : {};
    const contentId = context.params.contentId;
    try {
      if (!before || !after) {
        console.error("handleLandingPageIntent: before or after data is undefined");
        return null;
      }
      // Guard: proceed only when intent is newly set and url not present
      const beforeIntent = before.landingPageRequestedAt;
      const afterIntent = after.landingPageRequestedAt;
      const intentNewlySet =
        (!beforeIntent && !!afterIntent) ||
        (beforeIntent === undefined && afterIntent !== undefined);
      console.log("LandingPageIntent -", {
        beforeIntent,
        afterIntent,
        intentNewlySet,
      });
      if (!intentNewlySet) {
        console.log("LandingPageIntent: intent not newly set, skipping.");
        return null;
      }
      if (after.landingPageUrl) {
        console.log("LandingPageIntent: landingPageUrl already exists, skipping.");
        return null;
      }

      // Build simple HTML landing page (free-tier)
      const title = after.title || "Promoted Content";
      const type = after.type || "video";
      const url = after.url || "";
      const embedHtml =
        type === "video"
          ? `<video src="${url}" controls style="max-width:100%"></video>`
          : type === "image"
            ? `<img src="${url}" alt="${title}" style="max-width:100%"/>`
            : type === "audio"
              ? `<audio src="${url}" controls></audio>`
              : "";
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${title}</title>
  </head>
  <body>
    <h1>${title}</h1>
    <div id="content-embed">${embedHtml}</div>
  </body>
</html>`;

      const bucket = admin.storage().bucket("autopromote-cc6d3.firebasestorage.app");
      const file = bucket.file(`landing-pages/${contentId}-${uuidv4()}.html`);
      const { saveFileSafely } = require('../src/utils/storageGuard');
      await saveFileSafely(file, html, { contentType: "text/html" });
      let signedUrl;
      try {
        const res = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
        });
        signedUrl = res && res[0];
      } catch (err) {
        // In emulator/test environments we may not have service account credentials
        // capable of signing URLs. Construct a best-effort emulator-accessible URL
        // so local tests can validate that a landing page file was generated.
        console.warn(
          "Could not create signed URL, falling back to emulator URL:",
          err && err.message
        );
        const emulatorHost =
          process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
          process.env.STORAGE_EMULATOR_HOST ||
          "localhost:9199";
        const emulatorHostStripped = emulatorHost.replace(/^https?:\/\//, "");
        const encodedName = encodeURIComponent(file.name);
        signedUrl = `http://${emulatorHostStripped}/v0/b/${bucket.name}/o/${encodedName}?alt=media`;
      }

      await admin.firestore().doc(change.after.ref.path).update({
        landingPageUrl: signedUrl,
        // Use an ISO timestamp string to avoid Timestamp SDK differences in emulator
        landingPageGeneratedAt: new Date().toISOString(),
      });
      console.log(`Landing page generated for content ${contentId}`);
      return null;
    } catch (err) {
      console.error("Error in handleLandingPageIntent:", err);
      return null;
    }
  });

// // When smartLinkRequestedAt is set and smartLink is missing (and landingPageUrl is present), create a short link
exports.handleSmartLinkIntent = functions
  .region(region)
  .firestore.document("content/{contentId}")
  .onUpdate(async (change, context) => {
    const before = change.before.exists ? change.before.data() || {} : {};
    const after = change.after.exists ? change.after.data() || {} : {};
    const contentId = context.params.contentId;
    try {
      if (!before || !after) {
        console.error("handleSmartLinkIntent: before or after data is undefined");
        return null;
      }
      // Guard: only proceed when intent is newly set and smartLink not present
      const beforeIntent = before.smartLinkRequestedAt;
      const afterIntent = after.smartLinkRequestedAt;
      const intentNewlySet =
        (!beforeIntent && !!afterIntent) ||
        (beforeIntent === undefined && afterIntent !== undefined);
      console.log("SmartLinkIntent -", {
        beforeIntent,
        afterIntent,
        intentNewlySet,
      });
      if (!intentNewlySet) {
        console.log("SmartLinkIntent: intent not newly set, skipping.");
        return null;
      }
      if (after.smartLink) {
        console.log("SmartLinkIntent: smartLink already exists, skipping.");
        return null;
      }
      if (!after.landingPageUrl) {
        console.log("SmartLinkIntent: landingPageUrl missing, skipping.");
        return null;
      }

      const shortId = uuidv4().slice(0, 8);
      const redirectUrl =
        `${after.landingPageUrl}?source=autopromote` +
        `&contentId=${encodeURIComponent(contentId)}` +
        `&userId=${encodeURIComponent(after.user_id || "")}`;
      await admin
        .firestore()
        .collection("smart_links")
        .doc(shortId)
        .set({
          contentId,
          userId: after.user_id || null,
          sourcePlatform: "autopromote",
          redirectUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          clickCount: 0,
        });
      const shortLink = `https://autopromote.page.link/${shortId}`;
      await change.after.ref.update({
        smartLink: shortLink,
        smartLinkGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Smart link generated for content ${contentId}: ${shortLink}`);
      return null;
    } catch (err) {
      console.error("Error in handleSmartLinkIntent:", err);
      return null;
    }
  });

// Auto-reward creators when content metrics are updated
exports.autoRewardCreators = functions
  .region(region)
  .firestore.document("content/{contentId}")
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      const contentId = context.params.contentId;
      const userId = after.user_id || after.userId;

      if (!userId) return null;

      // Check if views increased significantly (at least 100 new views)
      const viewsBefore = before.views || 0;
      const viewsAfter = after.views || 0;
      const viewsIncrease = viewsAfter - viewsBefore;

      if (viewsIncrease < 100) return null; // Only check rewards when views increase substantially

      // Check if already rewarded recently (prevent spam)
      const rewardedAt = after.rewardedAt ? new Date(after.rewardedAt) : null;
      if (rewardedAt) {
        const hoursSinceReward = (Date.now() - rewardedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceReward < 24) return null; // Only check once per day
      }

      console.log(`Checking rewards for content ${contentId}, views increased by ${viewsIncrease}`);

      // Lazy load rewards service
      const creatorRewards = require("./_server/src/services/creatorRewardsService");
      const result = await creatorRewards.calculateContentRewards(contentId, userId);

      if (result) {
        console.log("Rewards calculated successfully:", result);
      }
    } catch (error) {
      console.error("Error in autoRewardCreators:", error);
    }
  });


// Scheduled cleanup for temp clip uploads
if (!process.env.CI) { // Only load in production/emulator to avoid errors in simplified environments
  try {
     const sc = require('./storageCleanup');
     if (sc && sc.cleanupTempUploads) exports.cleanupTempUploads = sc.cleanupTempUploads;
  } catch (e) { console.warn("Could not load storageCleanup", e); }
}
