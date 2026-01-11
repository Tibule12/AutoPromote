// monetizationService.js
// AutoPromote Monetization Layer
// Premium tiers, paid boosts, influencer marketplace, ROI tracking

const { db } = require("../firebaseAdmin");
const crypto = require("crypto");
const logger = require("../utils/logger");
const paypalClient = require("./paypal");

class MonetizationService {
  // Premium tier definitions
  get PREMIUM_TIERS() {
    return {
      FREE: {
        name: "Free",
        price: 0,
        limits: {
          monthlyUploads: 5,
          monthlyBoosts: 2,
          analytics: "basic",
          support: "community",
        },
        features: ["Basic optimization", "Community support"],
      },
      GROWTH_PRO: {
        name: "Growth Pro",
        price: 29.99,
        limits: {
          monthlyUploads: 50,
          monthlyBoosts: 20,
          analytics: "advanced",
          support: "priority",
        },
        features: [
          "Advanced optimization",
          "Influencer reposts",
          "A/B testing",
          "Priority support",
          "Custom hashtags",
          "Growth reports",
        ],
      },
      ANALYTICS_PLUS: {
        name: "Analytics Plus",
        price: 49.99,
        limits: {
          monthlyUploads: 100,
          monthlyBoosts: 50,
          analytics: "premium",
          support: "dedicated",
        },
        features: [
          "All Growth Pro features",
          "Competitor tracking",
          "Deep analytics",
          "ROI reports",
          "API access",
          "Dedicated support",
        ],
      },
      ENTERPRISE: {
        name: "Enterprise",
        price: 99.99,
        limits: {
          monthlyUploads: -1, // unlimited
          monthlyBoosts: -1,
          analytics: "enterprise",
          support: "white_glove",
        },
        features: [
          "All Analytics Plus features",
          "Custom integrations",
          "Team management",
          "White-glove support",
          "Custom reporting",
        ],
      },
    };
  }

  // Subscribe user to premium tier
  async subscribeToTier(userId, tierName, paymentMethod = "stripe") {
    try {
      const tier = this.PREMIUM_TIERS[tierName];
      if (!tier) {
        throw new Error("Invalid tier name");
      }

      // Process payment (PayPal)
      const paymentResult = await this.processPayment(userId, tier.price, paymentMethod);

      if (paymentResult.status === "pending_approval") {
        // Return approval URL to frontend
        return {
          success: false,
          status: "pending_approval",
          approvalUrl: paymentResult.approvalUrl,
          orderId: paymentResult.paymentId,
          message: "Redirect user to PayPal for approval",
          tier,
        };
      }

      // If we ever support auto-capture methods unrelated to PayPal redirect:
      if (!paymentResult.success) {
        throw new Error("Payment processing failed");
      }

      // Update user subscription
      const subscription = {
        userId,
        tier: tierName,
        status: "active",
        startedAt: new Date().toISOString(),
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        paymentMethod,
        lastPaymentId: paymentResult.paymentId,
        autoRenew: true,
        usage: {
          uploadsThisMonth: 0,
          boostsThisMonth: 0,
          lastReset: new Date().toISOString(),
        },
      };

      await db.collection("user_subscriptions").doc(userId).set(subscription);

      // --- REFERRAL CHECK: Is this user referred? ---
      try {
        const userDoc = await db.collection("users").doc(userId).get();
        const referredBy = userDoc.exists ? userDoc.data().referredBy : null;

        if (referredBy) {
          const referralEngine = require("./referralGrowthEngine");
          // Award bonus to the INVITER because their friend just Upgraded!
          await referralEngine.awardReferralCredits(referredBy, 100, userId); // 100 credits for upgrading

          // Check if this upgrade triggers the "10 Paid Referrals" cash bonus
          await referralEngine.checkPaidReferralBonus(referredBy);
        }
      } catch (err) {
        console.error("Failed to process referral reward on upgrade:", err);
      }
      // ----------------------------------------------

      return {
        success: true,
        subscription,
        tier,
        message: `Successfully subscribed to ${tier.name} tier`,
      };
    } catch (error) {
      logger.error("Monetization.subscribeToTierError", {
        error: error && error.message ? error.message : error,
      });
      throw error;
    }
  }

  // Process payment (Real PayPal Integration)
  async processPayment(userId, amount, method) {
    logger.info("Monetization.processPayment", { userId, amount, method });

    try {
      if (method === "paypal") {
        // Create PayPal Order
        const order = await paypalClient.createOrder({
          amount: amount.toFixed(2),
          currency: "USD",
        });

        return {
          success: false, // Payment not yet complete, requires user approval
          status: "pending_approval",
          paymentId: order.id,
          approvalUrl: order.links.find(l => l.rel === "approve")?.href,
          amount,
          method,
          processedAt: new Date().toISOString(),
        };
      } else {
        // Fallback for Stripe (if added later) or other methods
        // For now, simulate success for 'stripe' purely for dev compatibility if needed,
        // OR throw error to force PayPal usage as requested.
        // User requested: "we are using paypal alone for now"
        throw new Error(
          "Only PayPal is currently supported. Please select 'paypal' as payment method."
        );
      }
    } catch (error) {
      logger.error("Monetization.processPaymentFailed", { error: error.message });
      throw error;
    }
  }

  // Complete Payment (Capture Order)
  async completePayment(orderId) {
    try {
      const capture = await paypalClient.captureOrder(orderId);
      if (capture.status === "COMPLETED") {
        return { success: true, paymentId: capture.id, status: "completed" };
      }
      return { success: false, status: capture.status };
    } catch (error) {
      logger.error("Monetization.capturePaymentFailed", { error: error.message });
      throw error;
    }
  }

  // Check user's subscription status and limits
  async checkSubscriptionLimits(userId, action = "upload") {
    try {
      const subscriptionDoc = await db.collection("user_subscriptions").doc(userId).get();

      let subscription;
      if (subscriptionDoc.exists) {
        subscription = subscriptionDoc.data();

        // Check if subscription is still active
        if (new Date() > new Date(subscription.currentPeriodEnd)) {
          if (subscription.autoRenew) {
            // Auto-renew subscription
            subscription = await this.renewSubscription(userId, subscription);
          } else {
            subscription.status = "expired";
          }
        }
      } else {
        // Free tier
        subscription = {
          tier: "FREE",
          status: "active",
          usage: { uploadsThisMonth: 0, boostsThisMonth: 0 },
        };
      }

      const tier = this.PREMIUM_TIERS[subscription.tier];
      const limits = tier.limits;

      // Check monthly limits
      const canPerformAction = this.canPerformAction(subscription, action, limits);

      return {
        userId,
        subscription: {
          tier: subscription.tier,
          status: subscription.status,
          limits,
          usage: subscription.usage,
        },
        canPerformAction,
        upgradeRequired: !canPerformAction,
        suggestedTier: canPerformAction ? null : this.suggestUpgradeTier(subscription.tier, action),
      };
    } catch (error) {
      logger.error("Monetization.checkSubscriptionLimitsError", {
        error: error && error.message ? error.message : error,
      });
      throw error;
    }
  }

  // Check if user can perform action
  canPerformAction(subscription, action, limits) {
    const usage = subscription.usage;

    switch (action) {
      case "upload":
        return limits.monthlyUploads === -1 || usage.uploadsThisMonth < limits.monthlyUploads;
      case "boost":
        return limits.monthlyBoosts === -1 || usage.boostsThisMonth < limits.monthlyBoosts;
      default:
        return true;
    }
  }

  // Suggest upgrade tier
  suggestUpgradeTier(currentTier, action) {
    const tierOrder = ["FREE", "GROWTH_PRO", "ANALYTICS_PLUS", "ENTERPRISE"];
    const currentIndex = tierOrder.indexOf(currentTier);

    if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
      return null;
    }

    const suggestedTier = tierOrder[currentIndex + 1];
    const tier = this.PREMIUM_TIERS[suggestedTier];

    return {
      tier: suggestedTier,
      name: tier.name,
      price: tier.price,
      reason: `Your ${currentTier} tier limit exceeded for ${action}s`,
    };
  }

  // Update usage counters
  async updateUsage(userId, action) {
    try {
      const subscriptionRef = db.collection("user_subscriptions").doc(userId);
      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        // Free tier user - still track usage
        await subscriptionRef.set({
          tier: "FREE",
          status: "active",
          usage: {
            uploadsThisMonth: action === "upload" ? 1 : 0,
            boostsThisMonth: action === "boost" ? 1 : 0,
            lastReset: new Date().toISOString(),
          },
        });
        return;
      }

      const subscription = subscriptionDoc.data();
      const usage = subscription.usage;

      // Reset counters if month changed
      const lastReset = new Date(usage.lastReset);
      const now = new Date();
      if (
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear()
      ) {
        usage.uploadsThisMonth = 0;
        usage.boostsThisMonth = 0;
        usage.lastReset = now.toISOString();
      }

      // Update usage
      if (action === "upload") {
        usage.uploadsThisMonth += 1;
      } else if (action === "boost") {
        usage.boostsThisMonth += 1;
      }

      await subscriptionRef.update({ usage });
    } catch (error) {
      console.error("Error updating usage:", error);
      throw error;
    }
  }

  // Renew subscription
  async renewSubscription(userId, subscription) {
    try {
      const tier = this.PREMIUM_TIERS[subscription.tier];

      // Process renewal payment
      const paymentResult = await this.processPayment(
        userId,
        tier.price,
        subscription.paymentMethod
      );

      if (!paymentResult.success) {
        // Payment failed - mark as expired
        await db.collection("user_subscriptions").doc(userId).update({
          status: "payment_failed",
          lastPaymentAttempt: new Date().toISOString(),
        });

        return {
          ...subscription,
          status: "payment_failed",
        };
      }

      // Update subscription
      const renewedSubscription = {
        ...subscription,
        status: "active",
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastPaymentId: paymentResult.paymentId,
        renewedAt: new Date().toISOString(),
      };

      await db.collection("user_subscriptions").doc(userId).update(renewedSubscription);

      return renewedSubscription;
    } catch (error) {
      console.error("Error renewing subscription:", error);
      throw error;
    }
  }

  // Create paid boost
  async createPaidBoost(userId, contentId, boostOptions) {
    try {
      const { platform, targetViews, duration, budget } = boostOptions;

      // Check subscription limits
      const limitsCheck = await this.checkSubscriptionLimits(userId, "boost");
      if (!limitsCheck.canPerformAction) {
        throw new Error("Boost limit exceeded. Upgrade your plan to boost more content.");
      }

      // Calculate boost cost
      const boostCost = this.calculateBoostCost(platform, targetViews, duration);

      // Check if user has enough credits/balance (SKIP for direct PayPal Flow)
      // const hasCredits = await this.checkCreditBalance(userId, boostCost);
      // if (!hasCredits) {
      //   throw new Error(`Insufficient credits. Need ${boostCost} credits for this boost.`);
      // }

      // Process real payment for the boost request immediately (Pay-as-you-go)
      const paymentResult = await this.processPayment(userId, boostCost, "paypal");

      // Create boost record (pending payment)
      const boost = {
        userId,
        contentId,
        platform,
        targetViews,
        duration,
        budget: budget || boostCost,
        status: "pending_payment", // Changed from scheduled to pending
        paymentOrderId: paymentResult.paymentId,
        createdAt: new Date().toISOString(),
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        progress: {
          views: 0,
          engagements: 0,
          spent: 0,
        },
      };

      const boostRef = await db.collection("paid_boosts").add(boost);

      // Return approval URL
      if (paymentResult.status === "pending_approval") {
        return {
          success: false,
          status: "pending_approval",
          approvalUrl: paymentResult.approvalUrl,
          boostId: boostRef.id,
          message: "Please approve PayPal payment to activate boost.",
        };
      }
    } catch (error) {
      console.error("Error creating paid boost:", error);
      throw error;
    }
  }

  // Calculate boost cost
  calculateBoostCost(platform, targetViews, duration) {
    const baseCosts = {
      tiktok: 0.01, // $0.01 per view
      instagram: 0.015, // $0.015 per view
      youtube: 0.02, // $0.02 per view
      twitter: 0.008, // $0.008 per view
    };

    const baseCost = baseCosts[platform] || baseCosts.tiktok;
    const durationMultiplier = Math.max(1, duration / 24); // Bonus for longer campaigns

    return Math.ceil(targetViews * baseCost * durationMultiplier);
  }

  // Check credit balance
  async checkCreditBalance(userId, requiredCredits) {
    try {
      const creditsDoc = await db.collection("user_credits").doc(userId).get();

      if (!creditsDoc.exists) {
        return false;
      }

      const balance = creditsDoc.data().balance || 0;
      return balance >= requiredCredits;
    } catch (error) {
      console.error("Error checking credit balance:", error);
      return false;
    }
  }

  // Deduct credits
  async deductCredits(userId, amount, description) {
    try {
      const creditsRef = db.collection("user_credits").doc(userId);
      const creditsDoc = await creditsRef.get();

      if (!creditsDoc.exists) {
        throw new Error("No credit balance found");
      }

      const currentBalance = creditsDoc.data().balance || 0;
      if (currentBalance < amount) {
        throw new Error("Insufficient credits");
      }

      await creditsRef.update({
        balance: currentBalance - amount,
        transactions: [
          ...(creditsDoc.data().transactions || []),
          {
            type: "debit",
            amount: -amount,
            timestamp: new Date().toISOString(),
            description,
          },
        ],
        lastUpdated: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error("Error deducting credits:", error);
      throw error;
    }
  }

  // Get influencer marketplace
  async getInfluencerMarketplace(platform, niche, budget) {
    try {
      // Mock influencer data (would be from real marketplace API)
      const influencers = [
        {
          id: "inf_001",
          name: "Sarah Johnson",
          platform,
          niche,
          followers: 250000,
          engagementRate: 8.5,
          pricePerPost: 500,
          specialties: ["lifestyle", "fashion", "beauty"],
          rating: 4.8,
          completedCampaigns: 45,
        },
        {
          id: "inf_002",
          name: "Mike Chen",
          platform,
          niche,
          followers: 180000,
          engagementRate: 12.2,
          pricePerPost: 350,
          specialties: ["tech", "gaming", "education"],
          rating: 4.9,
          completedCampaigns: 67,
        },
        {
          id: "inf_003",
          name: "Emma Rodriguez",
          platform,
          niche,
          followers: 320000,
          engagementRate: 6.8,
          pricePerPost: 750,
          specialties: ["fitness", "health", "motivation"],
          rating: 4.7,
          completedCampaigns: 89,
        },
      ];

      // Filter by budget and niche
      const filtered = influencers.filter(
        inf => inf.pricePerPost <= budget && inf.specialties.includes(niche)
      );

      return {
        platform,
        niche,
        budget,
        availableInfluencers: filtered,
        totalAvailable: filtered.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting influencer marketplace:", error);
      throw error;
    }
  }

  // Book influencer repost
  async bookInfluencerRepost(userId, influencerId, contentId, platform) {
    try {
      // Check subscription allows influencer reposts
      const limitsCheck = await this.checkSubscriptionLimits(userId, "boost");
      if (limitsCheck.subscription.tier === "FREE") {
        throw new Error("Influencer reposts require a premium subscription");
      }

      // Get influencer details (mock)
      const influencer = await this.getInfluencerDetails(influencerId);

      // Check credit balance
      const hasCredits = await this.checkCreditBalance(userId, influencer.pricePerPost);
      if (!hasCredits) {
        throw new Error(`Insufficient credits. Need ${influencer.pricePerPost} credits.`);
      }

      // Create booking
      const booking = {
        userId,
        influencerId,
        contentId,
        platform,
        status: "booked",
        price: influencer.pricePerPost,
        bookedAt: new Date().toISOString(),
        expectedDelivery: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
        progress: {
          contacted: false,
          contentReceived: false,
          posted: false,
          reported: false,
        },
      };

      const bookingRef = await db.collection("influencer_bookings").add(booking);

      // Deduct credits
      await this.deductCredits(
        userId,
        influencer.pricePerPost,
        `Influencer repost booking with ${influencer.name}`
      );

      return {
        bookingId: bookingRef.id,
        ...booking,
        influencer,
        message: `Influencer repost booked successfully. ${influencer.pricePerPost} credits deducted.`,
      };
    } catch (error) {
      console.error("Error booking influencer repost:", error);
      throw error;
    }
  }

  // Get influencer details (mock)
  async getInfluencerDetails(influencerId) {
    // Mock data - would come from real marketplace
    const influencers = {
      inf_001: {
        id: "inf_001",
        name: "Sarah Johnson",
        platform: "instagram",
        followers: 250000,
        engagementRate: 8.5,
        pricePerPost: 500,
        specialties: ["lifestyle", "fashion", "beauty"],
        rating: 4.8,
      },
    };

    return influencers[influencerId] || null;
  }

  // Calculate ROI for content
  async calculateROI(contentId) {
    try {
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) {
        throw new Error("Content not found");
      }

      const content = contentDoc.data();

      // Get all boosts and costs for this content
      const boostsQuery = await db
        .collection("paid_boosts")
        .where("contentId", "==", contentId)
        .get();

      let totalCost = 0;
      boostsQuery.forEach(doc => {
        const boost = doc.data();
        totalCost += boost.budget || 0;
      });

      // Get revenue generated
      const revenue = content.revenue || 0;
      const currentMetrics = content.metrics || {};

      // Calculate ROI
      const roi = totalCost > 0 ? ((revenue - totalCost) / totalCost) * 100 : 0;
      const profit = revenue - totalCost;

      return {
        contentId,
        costs: {
          totalSpent: totalCost,
          boostsCount: boostsQuery.size,
        },
        revenue: {
          totalRevenue: revenue,
          currentMetrics,
        },
        roi: {
          percentage: roi,
          profit,
          status: profit > 0 ? "profitable" : profit === 0 ? "break_even" : "loss",
        },
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error calculating ROI:", error);
      throw error;
    }
  }

  // Get user's monetization dashboard
  async getMonetizationDashboard(userId) {
    try {
      // Get subscription info
      const subscriptionDoc = await db.collection("user_subscriptions").doc(userId).get();
      const subscription = subscriptionDoc.exists ? subscriptionDoc.data() : { tier: "FREE" };

      // Get credit balance
      const creditsDoc = await db.collection("user_credits").doc(userId).get();
      const credits = creditsDoc.exists ? creditsDoc.data() : { balance: 0, totalEarned: 0 };

      // Get recent boosts
      const boostsQuery = await db
        .collection("paid_boosts")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();

      const recentBoosts = [];
      boostsQuery.forEach(doc => {
        recentBoosts.push({ id: doc.id, ...doc.data() });
      });

      // Get earnings summary
      const earnings = await this.getEarningsSummary(userId);

      return {
        userId,
        subscription: {
          tier: subscription.tier,
          status: subscription.status || "active",
          currentPeriodEnd: subscription.currentPeriodEnd,
          usage: subscription.usage,
        },
        credits: {
          balance: credits.balance || 0,
          totalEarned: credits.totalEarned || 0,
        },
        recentBoosts,
        earnings,
        tierLimits: this.PREMIUM_TIERS[subscription.tier].limits,
        upgradeOptions: this.getUpgradeOptions(subscription.tier),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting monetization dashboard:", error);
      throw error;
    }
  }

  // Get earnings summary
  async getEarningsSummary(userId) {
    try {
      // Get user's content and calculate earnings
      const contentQuery = await db.collection("content").where("user_id", "==", userId).get();

      let totalRevenue = 0;
      let totalViews = 0;
      let totalEngagements = 0;

      contentQuery.forEach(doc => {
        const content = doc.data();
        totalRevenue += content.revenue || 0;
        totalViews += content.metrics?.views || 0;
        totalEngagements += content.metrics?.engagements || 0;
      });

      return {
        totalRevenue,
        totalViews,
        totalEngagements,
        averageRPM: totalViews > 0 ? (totalRevenue / totalViews) * 1000 : 0,
        contentCount: contentQuery.size,
      };
    } catch (error) {
      console.error("Error getting earnings summary:", error);
      return { totalRevenue: 0, totalViews: 0, totalEngagements: 0 };
    }
  }

  // Get upgrade options
  getUpgradeOptions(currentTier) {
    const tierOrder = ["FREE", "GROWTH_PRO", "ANALYTICS_PLUS", "ENTERPRISE"];
    const currentIndex = tierOrder.indexOf(currentTier);

    if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
      return [];
    }

    const upgradeOptions = [];
    for (let i = currentIndex + 1; i < tierOrder.length; i++) {
      const tierName = tierOrder[i];
      const tier = this.PREMIUM_TIERS[tierName];
      upgradeOptions.push({
        tier: tierName,
        name: tier.name,
        price: tier.price,
        features: tier.features,
        savings: i > currentIndex + 1 ? "Bundle discount available" : null,
      });
    }

    return upgradeOptions;
  }
}

module.exports = new MonetizationService();
