// Integrate Content Idea Engine
const { generateContentIdeas } = require('./services/contentIdeaEngine');
// Integrate Cross-Post Engine
const { crossPostContent } = require('./services/crossPostEngine');
// Integrate Collaboration Engine
const { startCollaborationSession } = require('./services/collaborationEngine');
// Integrate Sentiment Moderation Engine
const { analyzeSentiment, moderateComments } = require('./services/sentimentModerationEngine');
// Integrate Notification Engine
const { sendNotification } = require('./services/notificationEngine');
// Integrate Analytics Export Engine
const { exportAnalytics } = require('./services/analyticsExportEngine');
// Integrate API Integration Engine
const { registerThirdPartyApp } = require('./services/apiIntegrationEngine');
// Integrate Dashboard Widget Engine
const { getUserDashboard } = require('./services/dashboardWidgetEngine');
// Integrate Tutorial Engine
const { getTutorialSteps } = require('./services/tutorialEngine');
// Integrate Viral Insurance Engine
const { checkViralInsurance } = require('./services/viralInsuranceEngine');
// Integrate Dream Changer Engine
const { showRadicalTransparency, instantViralBoost, aiContentRescue, gamifiedGrowth, predictTrends } = require('./services/dreamChangerEngine');
// BUSINESS RULES (CONFIGURABLE)
// These values were previously hard‑coded with unrealistic placeholders (e.g. $900,000 per 1M views).
// They are now environment‑driven so you can tune the economic model without code changes.
// ENV VARS (with sane defaults):
//   REVENUE_PER_MILLION      -> integer USD per 1,000,000 views (default 3000)
//   CREATOR_PAYOUT_RATE      -> decimal share of revenue to creator (default 0.05 = 5%)
//   DAILY_TARGET_VIEWS       -> integer target daily views used for projections (default 200000)
//   AUTO_REMOVE_DAYS         -> integer days after which content should be auto-archived (default 2)
// NOTE: Actual enforcement of removal must be done by a scheduled job / background worker.
// Example projected payout: (DAILY_TARGET_VIEWS / 1,000,000) * REVENUE_PER_MILLION * CREATOR_PAYOUT_RATE
// Keep projections conservative to avoid user distrust.

// Example (using Firebase Cloud Functions):
// exports.cleanupOldContent = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
//   const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
//   const snapshot = await db.collection('content')
//     .where('created_at', '<', twoDaysAgo)
//     .get();
//   
//   const batch = db.batch();
//   snapshot.docs.forEach((doc) => {
//     batch.delete(doc.ref);
//   });
//   
//   await batch.commit();
// });

const express = require('express');
const { db } = require('./firebaseAdmin');
const authMiddleware = require('./authMiddleware');
const {
  validateContentData,
  validateAnalyticsData,
  validatePromotionData,
  validateRateLimit,
  sanitizeInput
} = require('./validationMiddleware');
const promotionService = require('./promotionService');
const optimizationService = require('./optimizationService');
const router = express.Router();
const { rateLimit } = require('./middleware/rateLimit');
const { validateBody } = require('./middleware/validate');

// Enforce max 10 uploads per user per calendar day (UTC)
const getStartOfDayUTC = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
const canUserUploadToday = async (userId, maxPerDay = 10) => {
  try {
    const startOfDay = getStartOfDayUTC();
    const snapshot = await db.collection('content')
      .where('user_id', '==', userId)
      .where('created_at', '>=', startOfDay)
      .get();
    const count = snapshot.size;
    return { canUpload: count < maxPerDay, reason: count >= maxPerDay ? `Daily limit reached (${maxPerDay}). Try again tomorrow.` : null, countToday: count, maxPerDay };
  } catch (error) {
    console.error('Error checking daily upload limit:', error);
    // On error, allow upload to avoid blocking users
    return { canUpload: true, reason: null, countToday: 0, maxPerDay };
  }
};

// Derive next optimal posting time per platform (simple window heuristic, returns ISO UTC)
const nextOptimalTimeForPlatform = (platform, tz = 'UTC') => {
  // Using UTC windows; a future improvement: shift by timezone
  const windowsUTC = {
    youtube: [15, 0],      // 15:00 UTC
    tiktok: [19, 0],       // 19:00 UTC
    instagram: [11, 0],    // 11:00 UTC
    facebook: [9, 0],      // 09:00 UTC
  };
  const now = new Date();
  const [h, m] = windowsUTC[platform] || [12, 0];
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
};

// Get all content (public endpoint)
router.get('/', async (req, res) => {
  try {
    const contentRef = db.collection('content');
    const snapshot = await contentRef
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();

    const content = [];
    snapshot.forEach(doc => {
      content.push({ id: doc.id, ...doc.data() });
    });

    res.json({ content });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Central business configuration (resolved once per process)
const BUSINESS = {
  REVENUE_PER_MILLION: parseInt(process.env.REVENUE_PER_MILLION || '3000', 10),
  CREATOR_PAYOUT_RATE: parseFloat(process.env.CREATOR_PAYOUT_RATE || '0.05'),
  DAILY_TARGET_VIEWS: parseInt(process.env.DAILY_TARGET_VIEWS || '200000', 10),
  AUTO_REMOVE_DAYS: parseInt(process.env.AUTO_REMOVE_DAYS || '2', 10)
};

// Integrate Growth Guarantee Badge
const { BADGE, shouldAwardBadge, checkGrowthGuarantee, celebrateMilestone } = require('./services/growthGuaranteeBadge');
// Integrate Boost Chain Engine
const { createBoostChain, suggestRepostTiming, rewardReferral } = require('./services/boostChainEngine');
// Integrate Content Preview Engine
const { generateAllPreviews } = require('./services/contentPreviewEngine');
// Integrate Retry/Repackage Engine
const { shouldRetryContent, repackageContent } = require('./services/retryRepackageEngine');
// Integrate Influencer Boost Engine
const { scheduleInfluencerRepost, createPaidBoost } = require('./services/influencerBoostEngine');
// Integrate Deep Analytics Engine
const { getContentAnalytics, getCompetitorAnalytics } = require('./services/deepAnalyticsEngine');
// Integrate Algorithm Exploitation Engine
const { optimizeForAlgorithm } = require('./services/algorithmExploitationEngine');

// Integrate Feedback Dashboard Engine
const { getRealTimeFeedback } = require('./services/feedbackDashboardEngine');
// Integrate A/B Testing Engine
const { runABTest, selectBestVariant } = require('./services/abTestingEngine');
// Integrate Community Engine
const { createGrowthSquad, getLeaderboard, createViralChallenge } = require('./services/communityEngine');
// Integrate Fraud Detection Engine
const { detectFraud } = require('./services/fraudDetectionEngine');
// Integrate Platform Integration Engine
const { integrateWithPlatform } = require('./services/platformIntegrationEngine');
// Integrate Coaching Engine
const { getGrowthCoaching } = require('./services/coachingEngine');
// Integrate Content Repurposing Engine
const { repurposeContent } = require('./services/contentRepurposingEngine');

// Upload content with advanced scheduling and optimization
router.post('/upload', authMiddleware, rateLimit({ field: 'contentUpload', perMinute: 15, dailyLimit: 500 }),
  sanitizeInput,
  validateBody({
    title: { type: 'string', required: true, maxLength: 140 },
    type: { type: 'string', required: true },
    url: { type: 'string', required: false, maxLength: 1000 },
    description: { type: 'string', required: false, maxLength: 5000 }
  }),
  validateContentData,
  validateRateLimit,
  async (req, res) => {
    try {
    const {
      title,
      type,
      url,
      description,
      target_platforms,
      scheduled_promotion_time,
      promotion_frequency,
      schedule_hint,
      target_rpm,
      min_views_threshold,
      max_budget,
      dry_run
    } = req.body;
    // Optional auto promotion descriptor
    const autoPromote = req.body.auto_promote || {};

    // Support dry run via body or query param
    const isDryRun = dry_run === true || req.query.dry_run === 'true';

    // Only include url if valid
    let validUrl = undefined;
    if (url && url !== 'missing' && url !== undefined && url !== '') {
      validUrl = url;
    }
    console.log('Content upload request received:', {
      userId: req.userId,
      title,
      type,
      url: validUrl ? 'provided' : 'missing',
      description: description || 'none'
    });

    // Determine max daily uploads (user default override)
    let maxDaily = 10;
    try {
      const { fetchUserDefaults } = require('./services/userDefaultsCache');
      const defs = await fetchUserDefaults(req.userId);
      if (typeof defs.maxDailyUploads === 'number') {
        maxDaily = Math.min(Math.max(1, defs.maxDailyUploads), 1000);
      }
    } catch(_){ }
    const daily = await canUserUploadToday(req.userId, maxDaily);
    if (!daily.canUpload) {
  return res.status(400).json({ error: 'Daily limit reached', message: daily.reason, uploads_today: daily.countToday, max_per_day: daily.maxPerDay });
    }

    // Resolve business rule variables (env driven)
    const optimalRPM = BUSINESS.REVENUE_PER_MILLION; // kept name for backward compatibility in response
    const minViews = BUSINESS.DAILY_TARGET_VIEWS;
    const creatorPayoutRate = BUSINESS.CREATOR_PAYOUT_RATE;
    const maxBudget = max_budget || 1000;

    // Integrate Hashtag Engine
    const { generateCustomHashtags, trackHashtagPerformance } = require('./services/hashtagEngine');
    // Integrate User Segmentation
    const { segmentUser, getSegmentFeatures } = require('./services/userSegmentation');
    // Fetch user profile (stub: replace with real user fetch)
    const userProfile = { role: req.body.role, followers: req.body.followers, isBrand: req.body.isBrand };
    const userSegment = segmentUser(userProfile);
    const segmentFeatures = getSegmentFeatures(userSegment);
    // Generate hashtags for each platform
    const hashtagsByPlatform = {};
    const platforms = target_platforms || ['youtube', 'tiktok', 'instagram'];
    for (const platform of platforms) {
      hashtagsByPlatform[platform] = await generateCustomHashtags({ content: { title, type, category: req.body.category }, platform, nicheTags: req.body.niche_tags || [] });
    }
    // Insert content into Firestore
    console.log(isDryRun ? 'Preparing dry-run content preview...' : 'Preparing to save content to Firestore...');
  // Create boost chain for this content
  const squadUserIds = req.body.growth_squad_user_ids || [];
  const boostChain = createBoostChain('preview', req.userId, squadUserIds);

  const contentData = {
      user_id: req.userId,
      title,
      type,
      description: description || '',
      target_platforms: platforms,
      status: 'pending', // All new content must be reviewed by admin
      scheduled_promotion_time: scheduled_promotion_time || null,
      promotion_frequency: promotion_frequency || 'once',
      next_promotion_time: scheduled_promotion_time || null,
      target_rpm: optimalRPM,
      min_views_threshold: minViews,
      max_budget: maxBudget,
      created_at: new Date(),
      promotion_started_at: scheduled_promotion_time ? null : new Date(),
      revenue_per_million: optimalRPM,
      creator_payout_rate: creatorPayoutRate,
      views: 0,
      revenue: 0,
      schedule_hint: schedule_hint || null,
      hashtags: hashtagsByPlatform,
      user_segment: userSegment,
      segment_features: segmentFeatures,
      growth_guarantee_badge: shouldAwardBadge({ hashtags: hashtagsByPlatform }) ? BADGE : null,
  ...(validUrl ? { url: validUrl } : {}),
  boost_chain: boostChain,
      // Optional quality results if the client ran /api/content/quality-check first
      ...(req.body.quality_score !== undefined ? { quality_score: Number(req.body.quality_score) } : {}),
      ...(Array.isArray(req.body.quality_feedback) ? { quality_feedback: req.body.quality_feedback.slice(0, 20) } : {}),
      ...(typeof req.body.quality_enhanced === 'boolean' ? { quality_enhanced: req.body.quality_enhanced } : {})
    };

    let contentId = `preview_${Date.now()}`;
    if (!isDryRun) {
      const contentRef = db.collection('content').doc();
      console.log('Content data to save:', JSON.stringify(contentData, null, 2));
      console.log('Firestore document ID will be:', contentRef.id);
      try {
        await contentRef.set(contentData);
        console.log('✅ Content successfully saved to Firestore with ID:', contentRef.id);
      } catch (firestoreError) {
        console.error('❌ Firestore write error:', firestoreError);
        console.error('Error details:', {
          code: firestoreError.code,
          message: firestoreError.message,
          stack: firestoreError.stack
        });
        throw firestoreError;
      }
      contentId = contentRef.id;
      // Track hashtag performance after upload
      for (const platform of platforms) {
        await trackHashtagPerformance({ contentId, hashtags: hashtagsByPlatform[platform], platform });
      }

      // Update revenue eligibility progress after each real upload
      try {
        const MIN_CONTENT_FOR_REVENUE = parseInt(process.env.MIN_CONTENT_FOR_REVENUE || '100', 10);
        const countSnap = await db.collection('content').where('user_id','==', req.userId).select().get();
        const total = countSnap.size;
        const eligible = total >= MIN_CONTENT_FOR_REVENUE;
        await db.collection('users').doc(req.userId).set({ revenueEligible: eligible, contentCount: total, requiredForRevenue: MIN_CONTENT_FOR_REVENUE }, { merge: true });
      } catch (eligErr) {
        console.log('⚠️ Could not update revenue eligibility:', eligErr.message);
      }

      // Attempt to generate monetized landing page and smart link (best-effort)
      try {
        // Mark intent for functions to pickup (if callable functions are not wired here)
        await db.collection('content').doc(contentId).update({
          landingPageRequestedAt: new Date()
        });
        console.log('📩 Marked landing page generation intent');
      } catch (lpErr) {
        console.log('⚠️ Could not mark landing page intent:', lpErr.message);
      }

      // Create notification: content uploaded
      try {
        await db.collection('notifications').add({
          user_id: req.userId,
          type: 'content_uploaded',
          content_id: contentId,
          title: 'Content uploaded',
          message: `Your content "${title}" was uploaded successfully.`,
          created_at: new Date(),
          read: false
        });
      } catch (nErr) {
        console.log('⚠️ Could not write upload notification:', nErr.message);
      }
    }

    // Attach immutable business snapshot for future audit
    const businessSnapshot = {
      revenue_per_million: BUSINESS.REVENUE_PER_MILLION,
      creator_payout_rate: BUSINESS.CREATOR_PAYOUT_RATE,
      daily_target_views: BUSINESS.DAILY_TARGET_VIEWS,
      auto_remove_days: BUSINESS.AUTO_REMOVE_DAYS,
      captured_at: new Date().toISOString()
    };
    if (!isDryRun) {
      try { await db.collection('content').doc(contentId).set({ business_snapshot: businessSnapshot }, { merge: true }); } catch(e){ console.log('⚠️ snapshot store failed', e.message); }
    }
    const content = { id: contentId, ...contentData, business_snapshot: businessSnapshot };
    console.log('Content object', isDryRun ? 'preview' : 'created', { id: content.id, title: content.title, type: content.type });
    let promotionSchedule = null;

    // Derive schedule template using explicit schedule_hint, user defaults, or scheduled_promotion_time
    let effectiveScheduleHint = schedule_hint;
    if (!effectiveScheduleHint) {
      try {
        const { fetchUserDefaults } = require('./services/userDefaultsCache');
        const d = await fetchUserDefaults(req.userId);
        if (d.postingWindow) {
          const tz = d.postingWindow.timezone || d.timezone || 'UTC';
          const today = new Date();
          const [h,m] = (d.postingWindow.start||'15:00').split(':').map(x=>parseInt(x,10));
          const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h||15, m||0,0,0));
          if (candidate < today) candidate.setUTCDate(candidate.getUTCDate()+1);
          effectiveScheduleHint = { when: candidate.toISOString(), frequency: 'once', timezone: tz };
        }
        if (d.variantStrategy && !contentData.variant_strategy) {
          contentData.variant_strategy = d.variantStrategy;
        }
      } catch(defErr){ console.log('defaults lookup failed', defErr.message); }
    }
    const scheduleTemplate = (()=>{
      const hint = effectiveScheduleHint;
      if (hint && hint.when) {
        return {
          start_time: hint.when,
          schedule_type: hint.frequency && hint.frequency !== 'once' ? 'recurring' : 'specific',
          frequency: hint.frequency || 'once'
        };
      }
      if (scheduled_promotion_time) {
       return { start_time: scheduled_promotion_time, schedule_type: 'specific', frequency: 'once' };
      }
      return null;
    })();
    if (isDryRun) {
      // In dry run, return the schedule template preview only
      const recommendations = optimizationService.generateOptimizationRecommendations(content);
      return res.status(200).json({
        message: 'Dry run: content and schedule preview',
        dry_run: true,
        content_preview: content,
        promotion_schedule_preview: scheduleTemplate ? {
          platform: 'all',
          schedule_type: scheduleTemplate.schedule_type,
          start_time: scheduleTemplate.start_time,
          frequency: scheduleTemplate.frequency,
          is_active: true,
          budget: maxBudget,
          target_metrics: { target_views: minViews, target_rpm: optimalRPM }
        } : null,
        optimization_recommendations: recommendations
      });
    }

    if (scheduleTemplate) {
      try {
        const platformList = Array.isArray(target_platforms) && target_platforms.length ? target_platforms : ['youtube','tiktok','instagram','facebook'];
        const createdSchedules = [];
        for (const platform of platformList) {
          const startAt = scheduleTemplate.schedule_type === 'specific' && scheduleTemplate.start_time
            ? scheduleTemplate.start_time
            : nextOptimalTimeForPlatform(platform, schedule_hint?.timezone || 'UTC');
          try {
            const sched = await promotionService.schedulePromotion(content.id, {
              platform,
              schedule_type: scheduleTemplate.schedule_type,
              start_time: startAt,
              frequency: scheduleTemplate.frequency,
              is_active: true,
              budget: maxBudget,
              target_metrics: { target_views: minViews, target_rpm: optimalRPM }
            });
            createdSchedules.push(sched);
          } catch (perPlatformErr) {
            console.log(`⚠️ Could not schedule for ${platform}:`, perPlatformErr.message);
          }
        }
        promotionSchedule = createdSchedules[0] || null;
        // After schedule creation, attempt to add a smart link placeholder
        try {
          await db.collection('content').doc(content.id).update({
            smartLinkRequestedAt: new Date()
          });
          console.log('🔗 Marked smart link generation intent');
        } catch (slErr) {
          console.log('⚠️ Could not mark smart link intent:', slErr.message);
        }

        // Create notification: schedule created
        try {
          await db.collection('notifications').add({
            user_id: req.userId,
            type: 'schedule_created',
            content_id: content.id,
            title: 'Promotion scheduled',
            message: `Your content "${title}" has been scheduled (${scheduleTemplate.frequency}) across ${Array.isArray(target_platforms) ? target_platforms.join(', ') : 'platforms'}.`,
            created_at: new Date(),
            read: false
          });
        } catch (n2Err) {
          console.log('⚠️ Could not write schedule notification:', n2Err.message);
        }
      } catch (scheduleError) {
        console.error('Error creating promotion schedule:', scheduleError);
      }
    }

    // Generate optimization recommendations
    const recommendations = optimizationService.generateOptimizationRecommendations(content);

    // Schedule content for auto-removal after 2 days (pseudo, needs background job in production)
    // You should implement a cron job or scheduled function to delete content after 2 days

    console.log('✅ Upload process completed successfully');
    console.log('Response data:', {
      message: scheduled_promotion_time ? 'Content uploaded and scheduled for promotion' : 'Content uploaded successfully',
      contentId: content.id,
      hasPromotionSchedule: !!promotionSchedule,
      hasRecommendations: !!recommendations
    });

    // ----------------------------------------------------
    // Auto-Promotion Phase (YouTube upload + Twitter post)
    // Skipped for dry runs or if no auto_promote object provided.
    // ----------------------------------------------------
    const autoPromotionResults = {};
    const { recordEvent } = require('./services/eventRecorder');
    if (!isDryRun) {
      recordEvent('content_uploaded', { userId: req.userId, contentId: content.id, payload: { title, type, target_platforms } });
    }
  if (!isDryRun && autoPromote && typeof autoPromote === 'object') {
      const backgroundJobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';
      // Helper safe update of promotion_summary on content doc
      async function persistSummary() {
        try {
          await db.collection('content').doc(content.id).set({ promotion_summary: autoPromotionResults }, { merge: true });
        } catch (e) { console.log('⚠️ Could not persist promotion_summary:', e.message); }
      }

      // 1. YouTube Immediate Upload (direct call, not queued)
      if (autoPromote.youtube && (autoPromote.youtube.enabled !== false)) {
        autoPromotionResults.youtube = { requested: true };
        try {
          const { getUserYouTubeConnection, uploadVideo } = require('./services/youtubeService');
          const ytConn = await getUserYouTubeConnection(req.userId);
          if (!ytConn) {
            autoPromotionResults.youtube = { requested: true, skipped: true, reason: 'not_connected' };
          } else {
            const videoUrl = autoPromote.youtube.videoUrl || autoPromote.youtube.fileUrl || url; // fallback to content URL if supplied
            if (!videoUrl) {
              autoPromotionResults.youtube = { requested: true, skipped: true, reason: 'missing_videoUrl' };
            } else {
              const ytOutcome = await uploadVideo({
                uid: req.userId,
                title: autoPromote.youtube.title || title,
                description: autoPromote.youtube.description || description || '',
                fileUrl: videoUrl,
                mimeType: autoPromote.youtube.mimeType || 'video/mp4',
                contentId: content.id,
                shortsMode: !!autoPromote.youtube.shortsMode,
                optimizeMetadata: autoPromote.youtube.optimizeMetadata !== false,
                forceReupload: !!autoPromote.youtube.forceReupload,
                skipIfDuplicate: autoPromote.youtube.skipIfDuplicate !== false
              });
              autoPromotionResults.youtube = { requested: true, ...ytOutcome };
              recordEvent('youtube_upload', { userId: req.userId, contentId: content.id, payload: { videoId: ytOutcome.videoId, duplicate: ytOutcome.duplicate } });
            }
          }
        } catch (e) {
          autoPromotionResults.youtube = { requested: true, success: false, error: e.message };
        } finally {
          await persistSummary();
        }
      }

      // 2. Twitter promotion (immediate or queued)
      if (autoPromote.twitter && (autoPromote.twitter.enabled !== false)) {
        const immediate = !!autoPromote.twitter.immediate;
        autoPromotionResults.twitter = { requested: true, immediate };
        try {
          const twitterConnSnap = await db.collection('users').doc(req.userId).collection('connections').doc('twitter').get();
          if (!twitterConnSnap.exists) {
            autoPromotionResults.twitter = { requested: true, skipped: true, reason: 'not_connected', immediate };
          } else {
            const message = (autoPromote.twitter.message || title || 'New content').slice(0, 260);
            const link = autoPromote.twitter.link || content.url || null;
            // Variant generation (if variantMode requested)
            let variants = null;
            if (autoPromote.twitter.variantMode) {
              try {
                const { getOrGenerateVariants } = require('./services/optimizationService');
                variants = await getOrGenerateVariants({ contentId: content.id, uid: req.userId, baseMessage: message, tags: content.tags || [] });
              } catch (ovErr) { variants = null; }
            }
            if (immediate) {
              // Direct post path
              try {
                const { dispatchPlatformPost } = require('./services/platformPoster');
                const directRes = await dispatchPlatformPost({ platform: 'twitter', contentId: content.id, payload: { message, link, variants }, reason: 'post_upload_immediate', uid: req.userId });
                autoPromotionResults.twitter = { requested: true, immediate: true, posted: directRes.success !== false, outcome: directRes, variantsUsed: !!variants };
                // Persist platform post record for immediate path
                try {
                  const { recordPlatformPost } = require('./services/platformPostsService');
                  await recordPlatformPost({
                    platform: 'twitter',
                    contentId: content.id,
                    uid: req.userId,
                    reason: 'post_upload_immediate',
                    payload: { message, link, variants },
                    outcome: directRes,
                    taskId: null,
                    postHash: null
                  });
                } catch (persistErr) { /* non-fatal */ }
                recordEvent('platform_post_immediate', { userId: req.userId, contentId: content.id, payload: { platform: 'twitter', success: directRes.success !== false } });
              } catch (e) {
                autoPromotionResults.twitter = { requested: true, immediate: true, posted: false, error: e.message };
              }
            } else {
              const { enqueuePlatformPostTask, processNextPlatformTask } = require('./services/promotionTaskQueue');
              const enqueueRes = await enqueuePlatformPostTask({
                contentId: content.id,
                uid: req.userId,
                platform: 'twitter',
                reason: 'post_upload',
                payload: { message, link, variants },
                skipIfDuplicate: autoPromote.twitter.skipIfDuplicate !== false,
                forceRepost: !!autoPromote.twitter.forceRepost
              });
              autoPromotionResults.twitter = { requested: true, immediate: false, queued: !enqueueRes.skipped, ...enqueueRes, backgroundJobsEnabled };
              recordEvent('platform_post_enqueued', { userId: req.userId, contentId: content.id, payload: { platform: 'twitter', queued: !enqueueRes.skipped, reason: 'post_upload' } });
              // Inline processing fallback if background disabled
              if (!backgroundJobsEnabled && !enqueueRes.skipped && enqueueRes.id) {
                try {
                  let loops = 0; let processed = [];
                  while (loops < 3) { // limit safeguards
                    loops++;
                    const p = await processNextPlatformTask();
                    if (!p) break;
                    processed.push(p);
                  }
                  if (processed.length) {
                    autoPromotionResults.twitter.inlineProcessed = true;
                    recordEvent('platform_post_processed_inline', { userId: req.userId, contentId: content.id, payload: { platform: 'twitter', processed: processed.length } });
                  }
                } catch (inlineErr) {
                  autoPromotionResults.twitter.inlineProcessError = inlineErr.message;
                }
              }
            }
          }
        } catch (e) {
          autoPromotionResults.twitter = { requested: true, queued: false, error: e.message };
        } finally {
          await persistSummary();
        }
      }
    }

    // Algorithmic optimization
    const optimizedContent = optimizeForAlgorithm({ title, description, hashtags: hashtagsByPlatform }, platforms[0]);
    // Generate previews for all platforms
    const previews = generateAllPreviews({ ...content, ...optimizedContent });
    // Deep analytics for content and competitor (stub)
    const analytics = getContentAnalytics(contentId);
    const competitorAnalytics = req.body.competitor_id ? getCompetitorAnalytics(req.body.competitor_id) : null;
    // Retry/repackage logic (stub: always 0 views on upload, but logic ready)
    const milestone = celebrateMilestone(content, { views: 0 });
    const retryRequired = shouldRetryContent(content, { views: 0 });
    const repackagedContent = retryRequired ? repackageContent(content) : null;
    // Influencer repost and paid boost (stub)
    const influencerRepost = req.body.influencer_id ? scheduleInfluencerRepost(contentId, req.body.influencer_id, platforms[0]) : null;
    const paidBoost = req.body.paid_boost_amount ? createPaidBoost(contentId, req.userId, req.body.paid_boost_amount, platforms[0]) : null;
    // Suggest repost timing for each platform
    const repostSuggestions = {};
    for (const platform of platforms) {
      repostSuggestions[platform] = suggestRepostTiming(boostChain, platform);
    }
    // Reward referral if referralId provided
    let referralReward = null;
    if (req.body.referral_id) {
      referralReward = rewardReferral(req.userId, boostChain.chainId);
    }
  // Real-time feedback
  const feedback = getRealTimeFeedback(contentId);
  // A/B testing (stub: variants are just original and repackaged)
  const abTestResults = runABTest([content, repackagedContent || content]);
  const bestVariant = selectBestVariant(abTestResults);
  // Community features
  const growthSquad = createGrowthSquad([req.userId]);
  const leaderboard = getLeaderboard();
  const viralChallenge = createViralChallenge('Viral Growth Challenge', '1000 credits');
  // Fraud detection
  const fraudStatus = detectFraud(content, feedback);
  // Platform integration
  const platformIntegration = platforms.map(platform => integrateWithPlatform(platform, content));
  // Coaching
  const coaching = getGrowthCoaching(req.userId, feedback);
  // Content repurposing
  const repurposed = repurposeContent(content, 'short');
  // Dream Changer features
  const transparencyReport = showRadicalTransparency(contentId, feedback, { boostTime: new Date(), repackageCount: repackagedContent ? 1 : 0, algorithmTriggers: ['hook', 'sound', 'caption'] });
  const viralBoost = instantViralBoost(content);
  const contentRescue = aiContentRescue(content);
  const gamified = gamifiedGrowth(req.userId, feedback);
  const trendPrediction = predictTrends(content);
  // Content ideas for user
  const contentIdeas = generateContentIdeas(req.userId, req.body.interests || []);
  // Cross-posting
  const crossPostResults = crossPostContent(content, platforms);
  // Collaboration session
  const collaborationSession = startCollaborationSession([req.userId], contentId);
  // Sentiment moderation
  const comments = req.body.comments || [];
  const sentiment = analyzeSentiment(comments);
  const moderatedComments = moderateComments(comments);
  // Notification
  const notification = sendNotification(req.userId, 'Your content is live!', 'success');
  // Analytics export
  const analyticsExport = exportAnalytics(contentId);
  // API integration
  const apiApp = registerThirdPartyApp('AutoPromote Partner', 'https://callback.url');
  // Dashboard widgets
  const dashboard = getUserDashboard(req.userId);
  // Tutorials
  const tutorialSteps = getTutorialSteps('beginner');
  // Viral insurance
  const viralInsurance = checkViralInsurance(content, feedback);
  res.status(201).json({
      message: scheduled_promotion_time ? 'Content uploaded and scheduled for promotion' : 'Content uploaded successfully',
      content,
      promotion_schedule: promotionSchedule,
      optimization_recommendations: recommendations,
      optimal_rpm: optimalRPM,
      creator_payout: minViews * (optimalRPM / 1000000) * creatorPayoutRate,
      business_rules: {
        revenue_per_million: optimalRPM,
        creator_payout_rate: creatorPayoutRate,
        daily_target_views: minViews,
        auto_remove_days: BUSINESS.AUTO_REMOVE_DAYS
      },
      auto_promotion: Object.keys(autoPromotionResults).length ? autoPromotionResults : null,
      growth_guarantee_badge: shouldAwardBadge({ hashtags: hashtagsByPlatform }) ? BADGE : null,
      milestone_celebration: milestone,
      boost_chain: boostChain,
      repost_suggestions: repostSuggestions,
      referral_reward: referralReward,
      previews,
      analytics,
      competitor_analytics: competitorAnalytics,
      retry_required: retryRequired,
      repackaged_content: repackagedContent,
      influencer_repost: influencerRepost,
  paid_boost: paidBoost,
  feedback,
  ab_test_results: abTestResults,
  best_variant: bestVariant,
  growth_squad: growthSquad,
  leaderboard,
  viral_challenge: viralChallenge,
  fraud_status: fraudStatus,
  platform_integration: platformIntegration,
  coaching,
  repurposed_content: repurposed,
  transparency_report: transparencyReport,
  instant_viral_boost: viralBoost,
  ai_content_rescue: contentRescue,
  gamified_growth: gamified,
  trend_prediction: trendPrediction,
  content_ideas: contentIdeas,
  cross_post_results: crossPostResults,
  collaboration_session: collaborationSession,
  sentiment_analysis: sentiment,
  moderated_comments: moderatedComments,
  notification,
  analytics_export: analyticsExport,
  api_integration: apiApp,
  dashboard,
  tutorial_steps: tutorialSteps,
  viral_insurance: viralInsurance
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Promotion status snapshot for a content item
router.get('/:id/promotion-status', authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const snap = await contentRef.get();
    if (!snap.exists || snap.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }
    const data = snap.data();
    const summary = data.promotion_summary || {};
    // Fetch recent related platform tasks (best-effort)
    let tasks = [];
    try {
      const taskSnap = await db.collection('promotion_tasks')
        .where('contentId','==', req.params.id)
        .orderBy('createdAt','desc')
        .limit(10)
        .get();
      taskSnap.forEach(d => tasks.push({ id: d.id, type: d.data().type, platform: d.data().platform, status: d.data().status, reason: d.data().reason, createdAt: d.data().createdAt }));
    } catch (_) {}
    // Fetch recorded platform posts if any
    let posts = [];
    try {
      const postSnap = await db.collection('platform_posts')
        .where('contentId','==', req.params.id)
        .orderBy('createdAt','desc')
        .limit(10)
        .get();
      postSnap.forEach(d => posts.push({ id: d.id, platform: d.data().platform, success: d.data().success, createdAt: d.data().createdAt, externalId: d.data().externalId || null }));
    } catch (_) {}
    return res.json({
      contentId: req.params.id,
      youtube: data.youtube || null,
      promotion_summary: summary,
      tasks,
      posts,
      backgroundJobsEnabled: process.env.ENABLE_BACKGROUND_JOBS === 'true'
    });
  } catch (e) {
    console.error('promotion-status error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's content
router.get('/my-content', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching user content for userId:', req.userId);

    const contentSnapshot = await db.collection('content')
      .where('user_id', '==', req.userId)
      .orderBy('created_at', 'desc')
      .get();

    console.log('Found', contentSnapshot.size, 'content items for user');

    const content = [];
    contentSnapshot.forEach(doc => {
      const data = doc.data();
      content.push({
        id: doc.id,
        ...data,
        created_at: data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : data.created_at
      });
    });

    console.log('Successfully processed', content.length, 'content items');
    res.json({ content });
  } catch (error) {
    console.error('Error getting user content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all promotion schedules across user's content (flattened list)
router.get('/my-promotion-schedules', authMiddleware, async (req, res) => {
  try {
    // Find user's content IDs
    const contentSnapshot = await db.collection('content')
      .where('user_id', '==', req.userId)
      .get();

    if (contentSnapshot.empty) {
      return res.json({ schedules: [] });
    }

    const contents = contentSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const contentIds = contents.map(c => c.id);

    // Query schedules for these content IDs
    const schedulesSnap = await db.collection('promotion_schedules')
      .where('contentId', 'in', contentIds.slice(0, 10)) // Firestore 'in' has max 10 items; batch if needed
      .get();

    let schedules = schedulesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // If more than 10 contents, batch remaining
    if (contentIds.length > 10) {
      for (let i = 10; i < contentIds.length; i += 10) {
        const batchIds = contentIds.slice(i, i + 10);
        const snap = await db.collection('promotion_schedules')
          .where('contentId', 'in', batchIds)
          .get();
        schedules = schedules.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    }

    // Attach content info and filter to upcoming + recent
    const nowIso = new Date().toISOString();
    const contentMap = contents.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
    const enriched = schedules
      .filter(s => !s.endTime || s.endTime >= nowIso)
      .map(s => ({
        id: s.id,
        contentId: s.contentId,
        contentTitle: contentMap[s.contentId]?.title || 'Untitled',
        platform: s.platform || 'all',
        frequency: s.frequency || 'once',
        scheduleType: s.scheduleType || 'specific',
        startTime: s.startTime,
        endTime: s.endTime || null,
        isActive: s.isActive !== false,
      }))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
      .slice(0, 50);

    res.json({ schedules: enriched });
  } catch (error) {
    console.error('Error getting my promotion schedules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }
    const data = contentDoc.data();
    res.json({ content: { id: contentDoc.id, ...data } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update content
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, target_platforms } = req.body;
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await contentRef.update({
      title,
      description,
      target_platforms,
      updated_at: new Date()
    });

    const updatedDoc = await contentRef.get();
    res.json({
      message: 'Content updated successfully',
      content: { id: updatedDoc.id, ...updatedDoc.data() }
    });
  } catch (error) {
    console.error('Error updating content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete content
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await contentRef.delete();
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Error deleting content:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/content/promote/:id - Start promotion for content
router.post('/promote/:id', authMiddleware, async (req, res) => {
  try {
    const contentId = req.params.id;
    console.log(`🔍 Promotion request for content ID: ${contentId} by user ID: ${req.userId}`);

    // Verify content ownership
    const contentRef = db.collection('content').doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      console.error('❌ Content ownership verification failed: Content not found or access denied');
      return res.status(404).json({ error: 'Content not found or access denied' });
    }

    const content = { id: contentDoc.id, ...contentDoc.data() };
    console.log('✅ Content ownership verified successfully');

    // Schedule promotion with default parameters or customize as needed
    const scheduleData = {
      platform: req.body.platform || 'all',
      schedule_type: 'specific',
      start_time: new Date().toISOString(),
      frequency: 'once',
      is_active: true,
      budget: req.body.budget || 1000,
      target_metrics: {
        target_views: req.body.target_views || 1000000,
        target_rpm: req.body.target_rpm || 900000
      }
    };

    console.log('📋 Attempting to schedule promotion with data:', scheduleData);
    const promotion = await promotionService.schedulePromotion(contentId, scheduleData);
    console.log('✅ Promotion scheduled successfully:', promotion);

    // Immediately execute the promotion for instant results
    try {
      const executionResult = await promotionService.executePromotion(promotion.id);
      console.log('✅ Promotion executed immediately:', executionResult);

      res.status(200).json({
        message: 'Promotion started and executed successfully',
        promotion,
        execution: executionResult
      });
    } catch (executionError) {
      console.error('❌ Error executing promotion:', executionError);
      res.status(200).json({
        message: 'Promotion scheduled successfully, but execution failed',
        promotion,
        execution_error: executionError.message
      });
    }
  } catch (error) {
    console.error('❌ Error starting promotion:', error);
    console.error('📋 Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Promotion Schedule Management Endpoints

// Get all promotion schedules for content
router.get('/:id/promotion-schedules', authMiddleware, async (req, res) => {
  try {
    // Verify content ownership via Firestore
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const schedules = await promotionService.getContentPromotionSchedules(req.params.id);
    res.json({ schedules });
  } catch (error) {
    console.error('Error getting promotion schedules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create promotion schedule
router.post('/:id/promotion-schedules', authMiddleware, async (req, res) => {
  try {
    // Verify content ownership via Firestore
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const schedule = await promotionService.schedulePromotion(req.params.id, req.body);
    res.status(201).json({ schedule });
  } catch (error) {
    console.error('Error creating promotion schedule:', error);
    res.status(400).json({ error: error.message });
  }
});

// Update promotion schedule
router.put('/promotion-schedules/:scheduleId', authMiddleware, async (req, res) => {
  try {
    const schedule = await promotionService.updatePromotionSchedule(req.params.scheduleId, req.body);
    res.json({ schedule });
  } catch (error) {
    console.error('Error updating promotion schedule:', error);
    res.status(400).json({ error: error.message });
  }
});

// Convenience endpoints for schedule actions
router.post('/promotion-schedules/:scheduleId/pause', authMiddleware, async (req, res) => {
  try {
    const schedule = await promotionService.updatePromotionSchedule(req.params.scheduleId, { is_active: false, isActive: false });
    res.json({ schedule });
  } catch (error) {
    console.error('Error pausing promotion schedule:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/promotion-schedules/:scheduleId/resume', authMiddleware, async (req, res) => {
  try {
    const schedule = await promotionService.updatePromotionSchedule(req.params.scheduleId, { is_active: true, isActive: true });
    res.json({ schedule });
  } catch (error) {
    console.error('Error resuming promotion schedule:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/promotion-schedules/:scheduleId/reschedule', authMiddleware, async (req, res) => {
  try {
    const { startTime, start_time } = req.body || {};
    const newStart = startTime || start_time;
    if (!newStart) return res.status(400).json({ error: 'startTime is required' });
    const schedule = await promotionService.updatePromotionSchedule(req.params.scheduleId, { start_time: newStart, startTime: newStart });
    res.json({ schedule });
  } catch (error) {
    console.error('Error rescheduling promotion schedule:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete promotion schedule
router.delete('/promotion-schedules/:scheduleId', authMiddleware, async (req, res) => {
  try {
    await promotionService.deletePromotionSchedule(req.params.scheduleId);
    res.json({ message: 'Promotion schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting promotion schedule:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get optimization recommendations for content
router.get('/:id/optimization', authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }
    const content = { id: contentDoc.id, ...contentDoc.data() };

    // Get analytics data for better recommendations
    let analyticsData = {};
    try {
      const analyticsSnapshot = await db.collection('analytics')
        .where('content_id', '==', req.params.id)
        .orderBy('metrics_updated_at', 'desc')
        .limit(1)
        .get();
      if (!analyticsSnapshot.empty) {
        analyticsData = analyticsSnapshot.docs[0].data();
      }
    } catch (e) {
      console.log('No analytics collection or query error, proceeding without analytics');
    }

    const recommendations = optimizationService.generateOptimizationRecommendations(content, analyticsData);
    const platformOptimization = optimizationService.optimizePromotionSchedule(
      content,
      content.target_platforms || ['youtube', 'tiktok', 'instagram']
    );

    res.json({
      recommendations,
      platform_optimization: platformOptimization,
      current_metrics: {
        target_rpm: content.target_rpm,
        min_views_threshold: content.min_views_threshold,
        max_budget: content.max_budget
      }
    });
  } catch (error) {
    console.error('Error getting optimization recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update content status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['draft', 'scheduled', 'published', 'paused', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const updatePayload = {
      status,
      updated_at: new Date()
    };
    if (status === 'published' && !req.body.keep_promotion_time) {
      updatePayload.promotion_started_at = new Date();
      updatePayload.scheduled_promotion_time = null;
    }
    await contentRef.update(updatePayload);
    const updated = await contentRef.get();
    res.json({
      message: `Content status updated to ${status}`,
      content: { id: updated.id, ...updated.data() }
    });
  } catch (error) {
    console.error('Error updating content status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk update content status
router.patch('/bulk/status', authMiddleware, async (req, res) => {
  try {
    const { content_ids, status } = req.body;
    
    if (!Array.isArray(content_ids) || content_ids.length === 0) {
      return res.status(400).json({ error: 'Content IDs array is required' });
    }

    if (!['draft', 'scheduled', 'published', 'paused', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const batch = db.batch();
    const updated_content = [];
    for (const id of content_ids) {
      const ref = db.collection('content').doc(id);
      const doc = await ref.get();
      if (doc.exists && doc.data().user_id === req.userId) {
        const updatePayload = {
          status,
          updated_at: new Date()
        };
        if (status === 'published') {
          updatePayload.promotion_started_at = new Date();
          updatePayload.scheduled_promotion_time = null;
        }
        batch.update(ref, updatePayload);
        updated_content.push({ id, ...doc.data(), ...updatePayload });
      }
    }
    await batch.commit();
    res.json({
      message: `Updated status for ${updated_content.length} content items to ${status}`,
      updated_content
    });
  } catch (error) {
    console.error('Error bulk updating content status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content analytics
router.get('/:id/analytics', authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }
    const content = { id: contentDoc.id, ...contentDoc.data() };

    // Simulate platform breakdown
    const platformBreakdown = {
      youtube: Math.floor(content.views * 0.4),
      tiktok: Math.floor(content.views * 0.3),
      instagram: Math.floor(content.views * 0.2),
      twitter: Math.floor(content.views * 0.1)
    };

    res.json({
      content,
      platform_breakdown: platformBreakdown,
      performance_metrics: {
        views: content.views,
        revenue: content.revenue,
        rpm: 900000, // Revenue per million
        engagement_rate: Math.random() * 0.15 + 0.05 // 5-20% engagement
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Advanced scheduling endpoints

// Get promotion schedule analytics
router.get('/promotion-schedules/:scheduleId/analytics', authMiddleware, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    
    // Verify user has access to this schedule via Firestore
    const scheduleDoc = await db.collection('promotion_schedules').doc(scheduleId).get();
    if (!scheduleDoc.exists) {
      return res.status(404).json({ error: 'Schedule not found or access denied' });
    }
    const scheduleData = scheduleDoc.data();
    const contentDoc = await db.collection('content').doc(scheduleData.contentId).get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Schedule not found or access denied' });
    }

    const analytics = await promotionService.getPromotionAnalytics(scheduleId);
    res.json(analytics);
  } catch (error) {
    console.error('Error getting promotion analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk schedule promotions
router.post('/bulk/schedule', authMiddleware, async (req, res) => {
  try {
    const { content_ids, schedule_template } = req.body;
    
    if (!Array.isArray(content_ids) || content_ids.length === 0) {
      return res.status(400).json({ error: 'Content IDs array is required' });
    }

    if (!schedule_template || typeof schedule_template !== 'object') {
      return res.status(400).json({ error: 'Schedule template is required' });
    }
    // Verify user owns all content via Firestore
    for (const id of content_ids) {
      const doc = await db.collection('content').doc(id).get();
      if (!doc.exists || doc.data().user_id !== req.userId) {
        return res.status(403).json({ error: 'Access denied to some content items' });
      }
    }

    const results = await promotionService.bulkSchedulePromotions(content_ids, schedule_template);
    res.json({ results });
  } catch (error) {
    console.error('Error in bulk scheduling:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process completed promotions (admin endpoint)
router.post('/admin/process-completed-promotions', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (from auth middleware)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const processedCount = await promotionService.processCompletedPromotions();
    res.json({
      message: `Processed ${processedCount} completed promotions`,
      processed_count: processedCount
    });
  } catch (error) {
    console.error('Error processing completed promotions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process creator payout (admin endpoint)
router.post('/admin/process-creator-payout/:contentId', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (from auth middleware)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const contentId = req.params.contentId;
    const { recipientEmail, payoutAmount } = req.body;

    // Get content details
    const contentRef = db.collection('content').doc(contentId);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const content = { id: contentDoc.id, ...contentDoc.data() };

    // Get creator details
    const userRef = db.collection('users').doc(content.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    const creator = { id: userDoc.id, ...userDoc.data() };

    // Calculate payout amount based on business rules
    const calculatedPayout = content.revenue * content.creator_payout_rate;
    const finalPayoutAmount = payoutAmount || calculatedPayout;

    // Process PayPal payout
    const paypalClient = require('../paypalClient');
    const paypal = require('@paypal/paypal-server-sdk');

    // For now, create a payout request (placeholder implementation)
    // In production, you would use PayPal Payouts API
    const payoutRequest = {
      sender_batch_header: {
        sender_batch_id: `payout_${contentId}_${Date.now()}`,
        email_subject: 'You have a payout from AutoPromote!'
      },
      items: [{
        recipient_type: 'EMAIL',
        amount: {
          value: finalPayoutAmount.toFixed(2),
          currency: 'USD'
        },
        receiver: recipientEmail || creator.email,
        note: `Payout for content: ${content.title}`,
        sender_item_id: `item_${contentId}`
      }]
    };

    // Placeholder response - in production, make actual PayPal API call
    console.log('PayPal payout request:', payoutRequest);

    // Record payout in Firestore
    const payoutRef = db.collection('payouts').doc();
    await payoutRef.set({
      contentId,
      creatorId: creator.id,
      amount: finalPayoutAmount,
      currency: 'USD',
      recipientEmail: recipientEmail || creator.email,
      status: 'processed',
      paypalBatchId: payoutRequest.sender_batch_header.sender_batch_id,
      processedAt: new Date(),
      revenueGenerated: content.revenue,
      payoutRate: content.creator_payout_rate
    });

    res.json({
      message: 'Creator payout processed successfully',
      payout: {
        id: payoutRef.id,
        contentId,
        creatorId: creator.id,
        amount: finalPayoutAmount,
        currency: 'USD',
        recipientEmail: recipientEmail || creator.email,
        paypalBatchId: payoutRequest.sender_batch_header.sender_batch_id
      }
    });
  } catch (error) {
    console.error('Error processing creator payout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active promotions with filters
router.get('/admin/active-promotions', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (from auth middleware)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const filters = {
      platform: req.query.platform,
      content_type: req.query.content_type,
      min_budget: req.query.min_budget ? parseInt(req.query.min_budget) : undefined,
      max_budget: req.query.max_budget ? parseInt(req.query.max_budget) : undefined
    };

    const promotions = await promotionService.getActivePromotions(filters);
    res.json({ promotions });
  } catch (error) {
    console.error('Error getting active promotions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Advanced scheduling options endpoint
router.get('/:id/scheduling-options', authMiddleware, async (req, res) => {
  try {
    const contentRef = db.collection('content').doc(req.params.id);
    const contentDoc = await contentRef.get();
    if (!contentDoc.exists || contentDoc.data().user_id !== req.userId) {
      return res.status(404).json({ error: 'Content not found' });
    }
    const content = { id: contentDoc.id, ...contentDoc.data() };

    const schedulingOptions = {
      frequencies: [
        { value: 'once', label: 'One-time', description: 'Promote once at specified time' },
        { value: 'hourly', label: 'Hourly', description: 'Promote every hour' },
        { value: 'daily', label: 'Daily', description: 'Promote every day' },
        { value: 'weekly', label: 'Weekly', description: 'Promote every week' },
        { value: 'biweekly', label: 'Bi-weekly', description: 'Promote every two weeks' },
        { value: 'monthly', label: 'Monthly', description: 'Promote every month' },
        { value: 'quarterly', label: 'Quarterly', description: 'Promote every quarter' }
      ],
      platforms: [
        { value: 'youtube', label: 'YouTube', optimal_times: ['15:00-17:00'] },
        { value: 'tiktok', label: 'TikTok', optimal_times: ['19:00-21:00'] },
        { value: 'instagram', label: 'Instagram', optimal_times: ['11:00-13:00', '19:00-21:00'] },
        { value: 'facebook', label: 'Facebook', optimal_times: ['09:00-11:00', '13:00-15:00'] },
        { value: 'twitter', label: 'Twitter', optimal_times: ['08:00-10:00', '16:00-18:00'] },
        { value: 'linkedin', label: 'LinkedIn', optimal_times: ['08:00-10:00', '17:00-19:00'] },
        { value: 'pinterest', label: 'Pinterest', optimal_times: ['14:00-16:00', '20:00-22:00'] }
      ],
      default_settings: {
        budget: optimizationService.calculateOptimalBudget(content),
        target_metrics: {
          target_views: content.min_views_threshold || 1000000,
          target_rpm: content.target_rpm || 900000
        }
      }
    };

    res.json(schedulingOptions);
  } catch (error) {
    console.error('Error getting scheduling options:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
