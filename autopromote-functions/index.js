// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require("firebase-functions/v1");
// The Firebase Admin SDK to access Cloud Firestore, Realtime Database and Cloud Storage.
const admin = require("firebase-admin");
const { v4: uuidv4 } = require('./lib/uuid-compat');
const path = require('path');
admin.initializeApp();

// Diagnostic: print module paths and local directory content to assist runtime debugging
try {
  console.log('[index] module.paths:', module.paths);
  const fs = require('fs');
  const files = fs.readdirSync(__dirname).slice(0, 40);
  console.log('[index] functions directory listing (slice):', files.join(', '));
  if (fs.existsSync(path.join(__dirname, '_server'))) {
    const serverFiles = fs.readdirSync(path.join(__dirname, '_server')).slice(0, 40);
    console.log('[index] _server directory listing (slice):', serverFiles.join(', '));
  } else {
    console.log('[index] _server not found at', path.join(__dirname, '_server'));
  }
} catch (e) {
  console.warn('[index] diagnostic listing failed:', e && e.message);
}

// Expose the main Express server as `api` function for Firebase Hosting rewrites
// We'll lazy-load the server on the first request so module import-time
// won't fail in the Cloud Functions load step (avoid timeouts / require errors).
// The root package `autopromote-server` exports the Express `app` safely;
// if that isn't installed we will fall back to the local _server copy.
let _serverApp = null;
let _serverAppMissing = false;
function getServerApp() {
  if (_serverApp) return _serverApp;
  try {
    // Prefer installed package
    _serverApp = require('autopromote-server');
    console.log('[index] Loaded autopromote-server package');
  } catch (e) {
    console.warn('[index] Could not require autopromote-server package:', e.message);
    try {
      // Fallback to local copy copied during pre-deploy
      _serverApp = require('./_server/src/server.js');
      console.log('[index] Loaded local _server copy for api function');
    } catch (err2) {
      console.error('[index] Could not require local _server copy:', err2.stack || err2.message || err2);
      // Mark missing and provide a minimal fallback express handler so function can respond gracefully
      _serverAppMissing = true;
      try {
        const express = require('express');
        const fallbackApp = express();
        fallbackApp.use((req, res) => res.status(503).send('Service initializing'));
        _serverApp = fallbackApp;
      } catch (expressErr) {
        console.error('[index] Could not create fallback express app:', expressErr && expressErr.message);
        throw err2; // fallback unavailable - rethrow original error
      }
    }
  }
  return _serverApp;
}

// Simple test function to verify deployment
exports.helloWorld = functions.https.onRequest((req, res) => {
  res.send("Hello from Firebase Functions!");
});

// Export YouTube video upload function
// NOTE: to avoid heavy require-time imports we implement lazy wrappers
// for common Cloud Functions trigger types. This ensures the heavy
// provider SDKs are only required when the function is invoked.
const region = 'us-central1';

function lazyOnCall(modulePath, exportName) {
  exports[exportName] = functions.region(region).https.onCall(async (data, context) => {
    try {
      const mod = require(modulePath);
      if (!mod || typeof mod[exportName] !== 'function') throw new Error('handler not found');
      return await mod[exportName](data, context);
    } catch (err) {
      console.error('[index][lazyOnCall] failed to load', modulePath, exportName, err && err.message);
      throw new functions.https.HttpsError('internal', 'Handler initialization failed');
    }
  });
}

function lazyOnRequest(modulePath, exportName) {
  exports[exportName] = functions.region(region).https.onRequest((req, res) => {
    try {
      const mod = require(modulePath);
      if (!mod || typeof mod[exportName] !== 'function') return res.status(500).send('handler_missing');
      return mod[exportName](req, res);
    } catch (err) {
      console.error('[index][lazyOnRequest] failed to load', modulePath, exportName, err && err.message);
      return res.status(500).send('handler_initialization_failed');
    }
  });
}

function lazyNoopExport(modulePath, exportName) {
  // Fallback: export a simple wrapper that loads & invokes the handler if it's a plain function.
  exports[exportName] = (...args) => {
    const mod = require(modulePath);
    if (mod && typeof mod[exportName] === 'function') return mod[exportName](...args);
    throw new Error('handler_missing');
  };
}

// Export YouTube video upload function
// The following wrappers intentionally defer requiring the heavy modules
// until the cloud function is actually invoked. We use onCall/onRequest
// wrappers depending on the handler being expected to be invoked as
// a firebase https callable function or an https request handler.
lazyOnCall('./youtubeUploader', 'uploadVideoToYouTube');
// OAuth utilities (https.onCall and https.onRequest handlers)
lazyOnCall('./tiktokOAuth', 'getTikTokAuthUrl');
lazyOnRequest('./tiktokOAuth', 'tiktokOAuthCallback');
lazyOnCall('./facebookOAuth', 'getFacebookAuthUrl');
lazyOnRequest('./facebookOAuth', 'facebookOAuthCallback');
lazyOnCall('./youtubeOAuth', 'getYouTubeAuthUrl');
lazyOnRequest('./youtubeOAuth', 'youtubeOAuthCallback');
lazyOnCall('./pinterestOAuth', 'getPinterestAuthUrl');
lazyOnRequest('./pinterestOAuth', 'pinterestOAuthCallback');
lazyOnCall('./discordOAuth', 'getDiscordAuthUrl');
lazyOnRequest('./discordOAuth', 'discordOAuthCallback');
lazyOnCall('./spotifyOAuth', 'getSpotifyAuthUrl');
lazyOnRequest('./spotifyOAuth', 'spotifyOAuthCallback');
lazyOnCall('./linkedinOAuth', 'getLinkedInAuthUrl');
lazyOnRequest('./linkedinOAuth', 'linkedinOAuthCallback');
lazyOnCall('./redditOAuth', 'getRedditAuthUrl');
lazyOnRequest('./redditOAuth', 'redditOAuthCallback');
lazyOnCall('./twitterOAuth', 'getTwitterAuthUrl');
lazyOnRequest('./twitterOAuth', 'twitterOAuthCallback');
lazyOnRequest('./telegramWebhook', 'telegramWebhook');
lazyOnCall('./instagramOAuth', 'getInstagramAuthUrl');
lazyOnRequest('./instagramOAuth', 'instagramOAuthCallback');
lazyOnCall('./snapchatOAuth', 'getSnapchatAuthUrl');
lazyOnRequest('./snapchatOAuth', 'snapchatOAuthCallback');
// Referral system and other onCall helpers
lazyNoopExport('./referralSystem', 'addReferrerToContent');
lazyNoopExport('./referralSystem', 'getReferralStats');
lazyOnCall('./promotionTemplates', 'createPromotionTemplate');
lazyOnCall('./promotionTemplates', 'listPromotionTemplates');
lazyOnCall('./promotionTemplates', 'attachTemplateToContent');
lazyNoopExport('./revenueAttribution', 'logMonetizationEvent');
lazyNoopExport('./revenueAttribution', 'getRevenueSummary');
lazyOnCall('./socialAutoPromotion', 'autoPromoteContent');
lazyOnCall('./smartLinkTracker', 'generateSmartLink');
// smartLinkRedirect may be an https request, so we lazy export as onRequest
lazyOnRequest('./smartLinkTracker', 'smartLinkRedirect');
lazyOnCall('./monetizedLandingPage', 'generateMonetizedLandingPage');

// (region already defined above)

// Lazy wrapper for API so the function can be deployed even if
// the underlying server isn't present during package-level require.
exports.api = functions.region(region).https.onRequest((req, res) => { try { return getServerApp()(req, res); } catch (e) { console.error('api error during request:', e && e.message); return res.status(500).send('Server error'); } });

exports.createPromotionOnApproval = functions.region(region).firestore
  .document("content/{contentId}")
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      const contentId = context.params.contentId;
      console.log(`createPromotionOnApproval triggered for contentId: ${contentId}`);
      console.log('Before status:', before.status, 'After status:', after.status);
      // Only trigger if status changed to 'approved'
      if (before.status !== "approved" && after.status === "approved") {
        const promotionData = {
          contentId,
          isActive: true,
          startTime: admin.firestore.Timestamp.now(),
          endTime: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          createdAt: admin.firestore.Timestamp.now()
        };
        await admin
          .firestore()
          .collection("promotion_schedules")
          .add(promotionData);
        console.log(
          `Promotion schedule created for content (onUpdate): ${contentId}`
        );
      } else {
        console.log('Status did not change to approved, no promotion created.');
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnApproval:", error);
      return null;
    }
  });

// Export Monetized Landing Page Generator
// Lazy export monetized landing page generator

exports.createPromotionOnContentCreate = functions.region(region).firestore
  .document("content/{contentId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      const contentId = context.params.contentId;
      console.log(`createPromotionOnContentCreate triggered for contentId: ${contentId}`);
      console.log('Document status:', data.status);
      if (data.status === "approved") {
        const promotionData = {
          contentId,
          isActive: true,
          startTime: admin.firestore.Timestamp.now(),
          endTime: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          createdAt: admin.firestore.Timestamp.now()
        };
        await admin
          .firestore()
          .collection("promotion_schedules")
          .add(promotionData);
        console.log(
          `Promotion schedule created for content (onCreate): ${contentId}`
        );
      } else {
        console.log('Document status is not approved, no promotion created.');
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
exports.handleLandingPageIntent = functions.region(region).firestore
  .document('content/{contentId}')
  .onUpdate(async (change, context) => {
  const before = change.before.exists ? (change.before.data() || {}) : {};
  const after = change.after.exists ? (change.after.data() || {}) : {};
    const contentId = context.params.contentId;
    try {
      if (!before || !after) {
        console.error('handleLandingPageIntent: before or after data is undefined');
        return null;
      }
      // Guard: proceed only when intent is newly set and url not present
      const beforeIntent = before.landingPageRequestedAt;
      const afterIntent = after.landingPageRequestedAt;
      const intentNewlySet = (!beforeIntent && !!afterIntent) || (beforeIntent === undefined && afterIntent !== undefined);
      console.log('LandingPageIntent - before:', beforeIntent, 'after:', afterIntent, 'intentNewlySet:', intentNewlySet);
      if (!intentNewlySet) {
        console.log('LandingPageIntent: intent not newly set, skipping.');
        return null;
      }
      if (after.landingPageUrl) {
        console.log('LandingPageIntent: landingPageUrl already exists, skipping.');
        return null;
      }

      // Build simple HTML landing page (free-tier)
      const title = after.title || 'Promoted Content';
      const type = after.type || 'video';
      const url = after.url || '';
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title}</title></head><body><h1>${title}</h1><div id="content-embed">${type === 'video' ? `<video src="${url}" controls style="max-width:100%"></video>` : type === 'image' ? `<img src="${url}" alt="${title}" style="max-width:100%"/>` : type === 'audio' ? `<audio src="${url}" controls></audio>` : ''}</div></body></html>`;

      const bucket = admin.storage().bucket('autopromote-cc6d3.firebasestorage.app');
      const file = bucket.file(`landing-pages/${contentId}-${uuidv4()}.html`);
      await file.save(html, { contentType: 'text/html' });
      const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 30 });

      await admin.firestore().doc(change.after.ref.path).update({
        landingPageUrl: signedUrl,
        landingPageGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Landing page generated for content ${contentId}`);
      return null;
    } catch (err) {
      console.error('Error in handleLandingPageIntent:', err);
      return null;
    }
  });

// // When smartLinkRequestedAt is set and smartLink is missing (and landingPageUrl is present), create a short link
exports.handleSmartLinkIntent = functions.region(region).firestore
  .document('content/{contentId}')
  .onUpdate(async (change, context) => {
  const before = change.before.exists ? (change.before.data() || {}) : {};
  const after = change.after.exists ? (change.after.data() || {}) : {};
      const contentId = context.params.contentId;
      try {
        if (!before || !after) {
          console.error('handleSmartLinkIntent: before or after data is undefined');
          return null;
        }
        // Guard: only proceed when intent is newly set and smartLink not present
        const beforeIntent = before.smartLinkRequestedAt;
        const afterIntent = after.smartLinkRequestedAt;
        const intentNewlySet = (!beforeIntent && !!afterIntent) || (beforeIntent === undefined && afterIntent !== undefined);
        console.log('SmartLinkIntent - before:', beforeIntent, 'after:', afterIntent, 'intentNewlySet:', intentNewlySet);
        if (!intentNewlySet) {
          console.log('SmartLinkIntent: intent not newly set, skipping.');
          return null;
        }
        if (after.smartLink) {
          console.log('SmartLinkIntent: smartLink already exists, skipping.');
          return null;
        }
        if (!after.landingPageUrl) {
          console.log('SmartLinkIntent: landingPageUrl missing, skipping.');
          return null;
        }

        const shortId = uuidv4().slice(0, 8);
        const redirectUrl = `${after.landingPageUrl}?source=autopromote&contentId=${encodeURIComponent(contentId)}&userId=${encodeURIComponent(after.user_id || '')}`;
        await admin.firestore().collection('smart_links').doc(shortId).set({
          contentId,
          userId: after.user_id || null,
          sourcePlatform: 'autopromote',
          redirectUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          clickCount: 0
        });
        const shortLink = `https://autopromote.page.link/${shortId}`;
        await change.after.ref.update({
          smartLink: shortLink,
          smartLinkGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Smart link generated for content ${contentId}: ${shortLink}`);
        return null;
      } catch (err) {
        console.error('Error in handleSmartLinkIntent:', err);
        return null;
      }
  });

// Auto-reward creators when content metrics are updated
exports.autoRewardCreators = functions.region(region)
  .firestore.document('content/{contentId}')
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
      const creatorRewards = require('./_server/src/services/creatorRewardsService');
      const result = await creatorRewards.calculateContentRewards(contentId, userId);
      
      if (result.success) {
        console.log(`Rewarded user ${userId} for content ${contentId}: $${result.totalEarned} (${result.tier})`);
      }
      
      return null;
    } catch (err) {
      console.error('Error in autoRewardCreators:', err);
      return null;
    }
  });