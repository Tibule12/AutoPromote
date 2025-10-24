// monetizationRoutes.js
// API routes for monetization features

const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const monetizationService = require('../services/monetizationService');
const referralGrowthEngine = require('../services/referralGrowthEngine');

// POST /subscription/subscribe - Subscribe to premium tier
router.post('/subscription/subscribe', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { tier, paymentMethod } = req.body;

    if (!tier) {
      return res.status(400).json({ error: 'Tier is required' });
    }

    const subscription = await monetizationService.subscribeToTier(
      userId,
      tier,
      paymentMethod || 'stripe'
    );

    res.json({
      success: true,
      subscription,
      subscribedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error subscribing to tier:', error);
    res.status(500).json({ error: 'Failed to subscribe to tier' });
  }
});

// GET /subscription/status - Get subscription status and limits
router.get('/subscription/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { action } = req.query;

    const status = await monetizationService.checkSubscriptionLimits(
      userId,
      action || 'upload'
    );

    res.json({
      success: true,
      status,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// POST /boost/create - Create paid boost
router.post('/boost/create', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId, platform, targetViews, duration, budget } = req.body;

    if (!contentId || !platform || !targetViews) {
      return res.status(400).json({ error: 'ContentId, platform, and targetViews are required' });
    }

    const boost = await monetizationService.createPaidBoost(userId, {
      platform,
      targetViews: parseInt(targetViews),
      duration: parseInt(duration) || 24,
      budget: budget ? parseFloat(budget) : undefined
    });

    res.json({
      success: true,
      boost,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating paid boost:', error);
    res.status(500).json({ error: 'Failed to create paid boost' });
  }
});

// GET /influencer/marketplace - Get influencer marketplace
router.get('/influencer/marketplace', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { platform, niche, budget } = req.query;

    if (!platform || !niche || !budget) {
      return res.status(400).json({ error: 'Platform, niche, and budget are required' });
    }

    const marketplace = await monetizationService.getInfluencerMarketplace(
      platform,
      niche,
      parseFloat(budget)
    );

    res.json({
      success: true,
      marketplace,
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting influencer marketplace:', error);
    res.status(500).json({ error: 'Failed to get influencer marketplace' });
  }
});

// POST /influencer/book - Book influencer repost
router.post('/influencer/book', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { influencerId, contentId, platform } = req.body;

    if (!influencerId || !contentId || !platform) {
      return res.status(400).json({ error: 'InfluencerId, contentId, and platform are required' });
    }

    const booking = await monetizationService.bookInfluencerRepost(
      userId,
      influencerId,
      contentId,
      platform
    );

    res.json({
      success: true,
      booking,
      bookedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error booking influencer repost:', error);
    res.status(500).json({ error: 'Failed to book influencer repost' });
  }
});

// GET /roi/:contentId - Calculate ROI for content
router.get('/roi/:contentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { contentId } = req.params;

    const roi = await monetizationService.calculateROI(contentId);

    res.json({
      success: true,
      roi,
      calculatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error calculating ROI:', error);
    res.status(500).json({ error: 'Failed to calculate ROI' });
  }
});

// GET /dashboard - Get monetization dashboard
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const dashboard = await monetizationService.getMonetizationDashboard(userId);

    res.json({
      success: true,
      dashboard,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting monetization dashboard:', error);
    res.status(500).json({ error: 'Failed to get monetization dashboard' });
  }
});

// POST /referral/invite - Create referral invitation
router.post('/referral/invite', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { email, message } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const invitation = await referralGrowthEngine.createReferralInvitation(
      userId,
      email,
      message
    );

    res.json({
      success: true,
      invitation,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating referral invitation:', error);
    res.status(500).json({ error: 'Failed to create referral invitation' });
  }
});

// POST /referral/signup - Process referral signup
router.post('/referral/signup', async (req, res) => {
  try {
    const { referralCode, newUserId } = req.body;

    if (!referralCode || !newUserId) {
      return res.status(400).json({ error: 'Referral code and new user ID are required' });
    }

    const result = await referralGrowthEngine.processReferralSignup(
      referralCode,
      newUserId
    );

    res.json({
      success: true,
      result,
      processedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing referral signup:', error);
    res.status(500).json({ error: 'Failed to process referral signup' });
  }
});

// GET /referral/leaderboard - Get referral leaderboard
router.get('/referral/leaderboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const leaderboard = await referralGrowthEngine.getReferralLeaderboard(userId);

    res.json({
      success: true,
      leaderboard,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting referral leaderboard:', error);
    res.status(500).json({ error: 'Failed to get referral leaderboard' });
  }
});

// GET /credits/balance - Get user's credit balance
router.get('/credits/balance', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const balance = await referralGrowthEngine.getCreditBalance(userId);

    res.json({
      success: true,
      balance,
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting credit balance:', error);
    res.status(500).json({ error: 'Failed to get credit balance' });
  }
});

// POST /squad/create - Create growth squad
router.post('/squad/create', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { name, description, maxMembers, contentFocus } = req.body;

    const squad = await referralGrowthEngine.createGrowthSquad(userId, {
      name,
      description,
      maxMembers: maxMembers || 10,
      contentFocus
    });

    res.json({
      success: true,
      squad,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating growth squad:', error);
    res.status(500).json({ error: 'Failed to create growth squad' });
  }
});

// POST /squad/join/:squadId - Join growth squad
router.post('/squad/join/:squadId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { squadId } = req.params;

    const result = await referralGrowthEngine.joinGrowthSquad(userId, squadId);

    res.json({
      success: true,
      result,
      joinedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error joining growth squad:', error);
    res.status(500).json({ error: 'Failed to join growth squad' });
  }
});

// POST /squad/share/:squadId - Share content with squad
router.post('/squad/share/:squadId', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { squadId } = req.params;
    const { contentId } = req.body;

    if (!contentId) {
      return res.status(400).json({ error: 'ContentId is required' });
    }

    const result = await referralGrowthEngine.shareWithGrowthSquad(
      userId,
      contentId,
      squadId
    );

    res.json({
      success: true,
      result,
      sharedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error sharing with growth squad:', error);
    res.status(500).json({ error: 'Failed to share with growth squad' });
  }
});

// GET /squad/activity - Get user's squad activity
router.get('/squad/activity', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const activity = await referralGrowthEngine.getGrowthSquadActivity(userId);

    res.json({
      success: true,
      activity,
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting squad activity:', error);
    res.status(500).json({ error: 'Failed to get squad activity' });
  }
});

// POST /viral-bonuses/award - Award viral loop bonuses
router.post('/viral-bonuses/award', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await referralGrowthEngine.awardViralLoopBonuses(userId);

    res.json({
      success: true,
      result,
      awardedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error awarding viral bonuses:', error);
    res.status(500).json({ error: 'Failed to award viral bonuses' });
  }
});

module.exports = router;
