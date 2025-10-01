// Export YouTube video upload function
exports.uploadVideoToYouTube = require('./youtubeUploader').uploadVideoToYouTube;
// Export TikTok OAuth utilities
exports.getTikTokAuthUrl = require('./tiktokOAuth').getTikTokAuthUrl;
exports.tiktokOAuthCallback = require('./tiktokOAuth').tiktokOAuthCallback;
// Export Facebook OAuth utilities
exports.getFacebookAuthUrl = require('./facebookOAuth').getFacebookAuthUrl;
exports.facebookOAuthCallback = require('./facebookOAuth').facebookOAuthCallback;
// Export YouTube OAuth utilities
exports.getYouTubeAuthUrl = require('./youtubeOAuth').getYouTubeAuthUrl;
exports.youtubeOAuthCallback = require('./youtubeOAuth').youtubeOAuthCallback;
// Export Creator Attribution & Referral System
exports.addReferrerToContent = require('./referralSystem').addReferrerToContent;
exports.getReferralStats = require('./referralSystem').getReferralStats;
// Export Promotion Templates
exports.createPromotionTemplate = require('./promotionTemplates').createPromotionTemplate;
exports.listPromotionTemplates = require('./promotionTemplates').listPromotionTemplates;
exports.attachTemplateToContent = require('./promotionTemplates').attachTemplateToContent;
// Export Revenue Attribution System
exports.logMonetizationEvent = require('./revenueAttribution').logMonetizationEvent;
exports.getRevenueSummary = require('./revenueAttribution').getRevenueSummary;
// Export Social Media Auto-Promotion Engine
exports.autoPromoteContent = require('./socialAutoPromotion').autoPromoteContent;
// Export Smart Link Tracker
exports.generateSmartLink = require('./smartLinkTracker').generateSmartLink;
exports.smartLinkRedirect = require('./smartLinkTracker').smartLinkRedirect;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

const region = 'us-central1';

exports.createPromotionOnApproval = functions.region(region).firestore
  .document("content/{contentId}")
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();

      // Only trigger if status changed to 'approved'
      if (before.status !== "approved" && after.status === "approved") {
        const contentId = context.params.contentId;
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
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnApproval:", error);
      return null;
    }
  });

// Export Monetized Landing Page Generator
exports.generateMonetizedLandingPage = require('./monetizedLandingPage').generateMonetizedLandingPage;

exports.createPromotionOnContentCreate = functions.region(region).firestore
  .document("content/{contentId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      if (data.status === "approved") {
        const contentId = context.params.contentId;
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
      }
      return null;
    } catch (error) {
      console.error("Error in createPromotionOnContentCreate:", error);
      return null;
    }
  });

// -----------------------------
// Intent-driven automation
// -----------------------------
const { v4: uuidv4 } = require('uuid');

// When a content doc marks landingPageRequestedAt and lacks landingPageUrl, generate the landing page
exports.handleLandingPageIntent = functions.region(region).firestore
  .document('content/{contentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const contentId = context.params.contentId;
    try {
      // Guard: proceed only when intent is newly set and url not present
      const intentNewlySet = !before.landingPageRequestedAt && !!after.landingPageRequestedAt;
      if (!intentNewlySet || after.landingPageUrl) return null;

      // Build simple HTML landing page (free-tier)
      const title = after.title || 'Promoted Content';
      const type = after.type || 'video';
      const url = after.url || '';
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${title}</title></head><body><h1>${title}</h1><div id="content-embed">${type === 'video' ? `<video src="${url}" controls style="max-width:100%"></video>` : type === 'image' ? `<img src="${url}" alt="${title}" style="max-width:100%"/>` : type === 'audio' ? `<audio src="${url}" controls></audio>` : ''}</div></body></html>`;

      const bucket = admin.storage().bucket();
      const file = bucket.file(`landing-pages/${contentId}-${uuidv4()}.html`);
      await file.save(html, { contentType: 'text/html' });
      const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 30 });

      await change.after.ref.update({
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

// When smartLinkRequestedAt is set and smartLink is missing (and landingPageUrl is present), create a short link
exports.handleSmartLinkIntent = functions.region(region).firestore
  .document('content/{contentId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const contentId = context.params.contentId;
    try {
      const intentNewlySet = !before.smartLinkRequestedAt && !!after.smartLinkRequestedAt;
      if (!intentNewlySet || after.smartLink) return null;
      if (!after.landingPageUrl) return null; // need landing page first

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