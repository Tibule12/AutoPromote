// revenueRoutes.js
// API routes for the "Greedy" Revenue Engine

const express = require("express");
const router = express.Router();
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const revenueEngine = require("../services/revenueEngine");
const { rateLimiter } = require("../middlewares/globalRateLimiter");

// Rate limiters
const revenuePublicLimiter = rateLimiter({
  capacity: 60,
  refillPerSec: 1,
  windowHint: "revenue_public",
});

router.use(revenuePublicLimiter);

// @route   GET /api/revenue/price
// @desc    Get current dynamic pricing for an engagement block
// @access  Public (or Brand authenticated)
router.get("/price", async (req, res) => {
  try {
    const { niche, size } = req.query; // e.g. niche=fashion&size=1000
    const blockSize = parseInt(size) || 1000;

    const pricing = await revenueEngine.calculateBlockPrice(niche || "default", blockSize);
    res.json({ success: true, pricing });
  } catch (error) {
    console.error("Pricing error:", error);
    res.status(500).json({ error: "Failed to calculate price" });
  }
});

// @route   POST /api/revenue/create-bounty
// @desc    Creator sets a viral bounty (No Ads model)
// @access  Authenticated (Brand/Creator)
router.post("/create-bounty", authMiddleware, async (req, res) => {
  try {
    const brandId = req.userId;
    const { niche, amount, paymentMethodId } = req.body;

    // Validate inputs
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid bounty amount" });
    if (!niche) return res.status(400).json({ error: "Niche is required" });

    // Call the new Bounty Logic
    const result = await revenueEngine.createViralBounty(
      brandId,
      niche,
      parseFloat(amount),
      paymentMethodId
    );
    res.json(result);
  } catch (error) {
    console.error("Bounty creation error:", error);
    res.status(500).json({ error: error.message || "Bounty creation failed" });
  }
});

// @route   POST /api/revenue/claim-bounty
// @desc    Promoter claims bounty payout
// @access  Authenticated (Promoter)
router.post("/claim-bounty", authMiddleware, async (req, res) => {
  try {
    const promoterId = req.userId;
    const { bountyId, proofMetrics } = req.body;

    const result = await revenueEngine.claimBounty(promoterId, bountyId, proofMetrics);
    res.json(result);
  } catch (error) {
    console.error("Claim error:", error);
    res.status(500).json({ error: "Claim failed" });
  }
});

// @route   POST /api/revenue/purchase-block
// @desc    [Legacy] Redirects to Bounty Flow for backward compatibility
// @access  Authenticated (Brand)
router.post("/purchase-block", authMiddleware, async (req, res) => {
  try {
    // Adapter pattern: Map old 'size' based params to new 'amount' based params
    // Logic: 1000 units roughly equal $10 bounty in the old pricing model
    const brandId = req.userId;
    const { niche, size, paymentMethodId } = req.body;
    const estimatedBounty = (size / 100) * 1.5; // Roughly $15 per 1000 interactions

    const result = await revenueEngine.createViralBounty(
      brandId,
      niche,
      estimatedBounty,
      paymentMethodId
    );
    res.json(result);
  } catch (error) {
    console.error("Purchase error:", error);
    res.status(500).json({ error: error.message || "Purchase failed" });
  }
});

// @route   POST /api/revenue/redeem
// @desc    Creator redeems growth credits (fees applied)
// @access  Authenticated (Creator)
router.post("/redeem", authMiddleware, async (req, res) => {
  try {
    const creatorId = req.userId;
    const { credits } = req.body;

    if (!credits || credits <= 0) {
      return res.status(400).json({ error: "Invalid credit amount" });
    }

    const result = await revenueEngine.redeemCredits(creatorId, parseInt(credits));
    res.json({ success: true, result });
  } catch (error) {
    console.error("Redemption error:", error);
    res.status(500).json({ error: "Redemption failed" });
  }
});

// @route   GET /api/revenue/bounty-board
// @desc    List all active viral bounties for Promoters to find
// @access  Authenticated
router.get("/bounty-board", authMiddleware, async (req, res) => {
  try {
    const { niche } = req.query;
    let query = db
      .collection("content")
      .where("bounty_active", "==", true)
      .where("status", "==", "approved")
      .orderBy("created_at", "desc")
      .limit(50);

    if (niche && niche !== "all") {
      query = query.where("bounty_niche", "==", niche);
    }

    const snapshot = await query.get();
    const bounties = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      bounties.push({
        id: doc.id,
        title: data.title,
        description: data.description,
        url: data.url,
        thumbnail: data.meta?.thumbnail || null,
        bountyAmount: data.bounty_pool_amount,
        niche: data.bounty_niche,
        viralId: data.viral_bounty_id,
        postedAt: data.created_at,
      });
    });

    res.json({ success: true, count: bounties.length, bounties });
  } catch (error) {
    console.error("Bounty Board error:", error);
    res.status(500).json({ error: "Failed to fetch bounty board" });
  }
});

// @route   GET /api/revenue/my-bounties
// @desc    Creator views their portfolio of active bounties
// @access  Authenticated
router.get("/my-bounties", authMiddleware, async (req, res) => {
  try {
    const brandId = req.userId;
    const snapshot = await db
      .collection("bounties")
      .where("brandId", "==", brandId)
      .orderBy("createdAt", "desc")
      .get();

    const myBounties = [];
    snapshot.forEach(doc => {
      myBounties.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, bounties: myBounties });
  } catch (error) {
    console.error("My Bounties fetch error:", error);
    res.status(500).json({ error: "Failed to fetch your bounties" });
  }
});

module.exports = router;
