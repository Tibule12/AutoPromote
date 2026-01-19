// referralGrowthEngine.js
// AutoPromote Referral & Viral Growth Engine
// Credits for invites, growth squads, viral loops, mutual sharing

/* eslint-disable no-console */
const { db } = require("../firebaseAdmin");

class ReferralGrowthEngine {
  // Create referral invitation
  async createReferralInvitation(inviterId, inviteeEmail, message = "") {
    try {
      // Check if invitation already exists
      const existingQuery = await db
        .collection("referral_invitations")
        .where("inviterId", "==", inviterId)
        .where("inviteeEmail", "==", inviteeEmail)
        .where("status", "==", "pending")
        .get();

      if (!existingQuery.empty) {
        throw new Error("Invitation already sent to this email");
      }

      // Generate unique referral code
      const referralCode = this.generateReferralCode();

      const invitation = {
        inviterId,
        inviteeEmail,
        referralCode,
        message: message || "Join me on AutoPromote and grow your social media together!",
        status: "pending",
        creditsOffered: 50, // 50 promotion credits for successful referral
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      };

      const invitationRef = await db.collection("referral_invitations").add(invitation);

      return {
        invitationId: invitationRef.id,
        referralCode,
        message: "Invitation sent successfully",
      };
    } catch (error) {
      console.error("Error creating referral invitation:", error);
      throw error;
    }
  }

  // Generate unique referral code
  generateReferralCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    // Make a 6-character alphanumeric code
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Process referral signup
  async processReferralSignup(referralCode, newUserId, ipAddress) {
    try {
      // Find the invitation
      const invitationQuery = await db
        .collection("referral_invitations")
        .where("referralCode", "==", referralCode)
        .where("status", "==", "pending")
        .get();

      if (invitationQuery.empty) {
        throw new Error("Invalid or expired referral code");
      }

      const invitationDoc = invitationQuery.docs[0];
      const invitation = invitationDoc.data();

      // Check if invitation hasn't expired
      if (new Date() > new Date(invitation.expiresAt)) {
        throw new Error("Referral code has expired");
      }

      // --- FRAUD CHECK: IP Address Collision ---
      if (ipAddress) {
        // Check if the INVITER created the invitation from the same IP (if we tracked it)
        // Or simpler: Check if this IP has already been used for a referral for this inviter recently
        const potentialFraud = await db
          .collection("referral_invitations")
          .where("inviterId", "==", invitation.inviterId)
          .where("completedIp", "==", ipAddress)
          .get();

        if (!potentialFraud.empty) {
          console.warn(
            "[Anti-Fraud] Blocked referral from IP",
            ipAddress,
            "for inviter",
            invitation.inviterId
          );
          throw new Error("Referral not eligible: Multiple signups from same network detected.");
        }
      }
      // -----------------------------------------

      // Update invitation status
      await db
        .collection("referral_invitations")
        .doc(invitationDoc.id)
        .update({
          status: "completed",
          inviteeId: newUserId,
          completedAt: new Date().toISOString(),
          completedIp: ipAddress || "unknown",
        });

      // --- PERSIST INVITER LINK ON USER ACCOUNT ---
      // This is crucial for tracking future upgrades
      await db.collection("users").doc(newUserId).set(
        {
          referredBy: invitation.inviterId,
          referredAt: new Date().toISOString(),
          referralCodeUsed: referralCode,
        },
        { merge: true }
      );
      // ---------------------------------------------

      // Award credits to inviter
      await this.awardReferralCredits(invitation.inviterId, invitation.creditsOffered, newUserId);

      // Award signup bonus to new user
      await this.awardSignupBonus(newUserId, 25); // 25 credits for signing up via referral

      return {
        success: true,
        inviterId: invitation.inviterId,
        creditsAwarded: invitation.creditsOffered,
        message: `Welcome! You've received 25 promotion credits, and ${invitation.inviterId} received ${invitation.creditsOffered} credits for the referral.`,
      };
    } catch (error) {
      console.error("Error processing referral signup:", error);
      throw error;
    }
  }

  // Award referral credits
  async awardReferralCredits(userId, credits, referredUserId) {
    try {
      // Get or create user credits record
      const creditsRef = db.collection("user_credits").doc(userId);
      const creditsDoc = await creditsRef.get();

      const currentCredits = creditsDoc.exists ? creditsDoc.data().balance || 0 : 0;
      const totalReferrals = (creditsDoc.data()?.totalReferrals || 0) + 1; // Increment referral count

      await creditsRef.set(
        {
          balance: currentCredits + credits,
          totalEarned: (creditsDoc.data()?.totalEarned || 0) + credits,
          totalReferrals: totalReferrals,
          transactions: [
            ...(creditsDoc.data()?.transactions || []),
            {
              type: "referral_bonus",
              amount: credits,
              referredUserId,
              timestamp: new Date().toISOString(),
              description: `Referral bonus for inviting new user`,
            },
          ],
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log("✅ Awarded", credits, "referral credits to user", userId);

      // --- REFERRAL MILESTONES ---

      // LEVEL 1: 10 PAID Referrals -> $5 (Handled in `checkPaidReferralBonus`)
      // We removed the code here because we only pay Level 1 if the referrals UPGRADE.

      // LEVEL 2: 20 FREE Referrals -> $15 (Ambassador Logic)
      // Quantity over Quality, BUT the Inviter MUST be subscribed.
      // We check this every single time they get a signup, just in case they hit 20.
      if (totalReferrals === 20) {
        await this.checkAmbassadorBonus(userId);
      }
      // ----------------------------
    } catch (error) {
      console.error("Error awarding referral credits:", error);
      throw error;
    }
  }

  // New Method: Award Cash Bonus for 10 Referrals
  async awardLaunchpadCashBonus(userId) {
    try {
      // 1. Add $5 to their earnings
      const userRef = db.collection("users").doc(userId);
      const { admin } = require("../firebaseAdmin");

      await userRef.set(
        {
          totalEarnings: admin.firestore.FieldValue.increment(5.0),
          pendingEarnings: admin.firestore.FieldValue.increment(5.0), // Available for payout
          lastEarningAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // 2. Log the earnings event
      await db.collection("earnings_events").add({
        userId,
        contentId: "referral_bonus_10",
        type: "referral_milestone_bonus", // Special type
        amount: 5.0,
        description: "Bonus for referring 10 subscribers",
        createdAt: new Date().toISOString(),
      });

      // 3. Notify them
      await db.collection("notifications").add({
        userId,
        type: "cash_bonus_unlocked",
        title: "💰 $5 BONUS UNLOCKED!",
        message:
          "You did it! You referred 10 subscribers. We've added $5 cash to your earnings balance.",
        read: false,
        createdAt: new Date().toISOString(),
      });

      console.log("✅ User", userId, "hit 10 referrals and got $5 cash.");
    } catch (err) {
      console.error("Failed to award launchpad bonus:", err);
    }
  }

  // New Method: Check Ambassador Bonus (20 Referrals)
  async checkAmbassadorBonus(userId) {
    try {
      // Check subscription status
      const subDoc = await db.collection("user_subscriptions").doc(userId).get();
      const isSubscribed = subDoc.exists && subDoc.data().status === "active";

      if (isSubscribed) {
        await this.awardAmbassadorCash(userId);
      } else {
        // Send the "Hook" Notification
        await db.collection("notifications").add({
          userId,
          type: "upsell_ambassador",
          title: "🔒 $15 CASH UNLOCKED (Action Required)",
          message:
            "You just hit 20 Referrals! A $15 Cash Reward is waiting for you. Subscribe to any plan to instantly unlock and withdraw this money.",
          data: {
            reward: 15.0,
            milestone: 20,
            isAmbassadorTrigger: true,
          },
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Error checking ambassador bonus:", err);
    }
  }

  // New: Payout Helper (Prevents duplicates)
  async awardAmbassadorCash(userId) {
    try {
      const { admin } = require("../firebaseAdmin");

      // Prevent double pay
      const check = await db
        .collection("earnings_events")
        .where("userId", "==", userId)
        .where("type", "==", "ambassador_bonus_20")
        .get();

      if (!check.empty) return;

      await db
        .collection("users")
        .doc(userId)
        .set(
          {
            totalEarnings: admin.firestore.FieldValue.increment(15.0),
            pendingEarnings: admin.firestore.FieldValue.increment(15.0),
            lastEarningAt: new Date().toISOString(),
          },
          { merge: true }
        );

      await db.collection("earnings_events").add({
        userId,
        contentId: "referral_ambassador_20",
        type: "ambassador_bonus_20",
        amount: 15.0,
        description: "Ambassador Reward: 20 Fresh Users",
        createdAt: new Date().toISOString(),
      });

      await db.collection("notifications").add({
        userId,
        type: "cash_bonus_unlocked",
        title: "🏆 AMBASSADOR REWARD PAID!",
        message: "Boom! $15 has been added to your earnings balance for hitting 20 referrals.",
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to pay ambassador bonus:", err);
    }
  }

  // New Method: Check for Paid Referral Bonus (10 Subscribers)
  async checkPaidReferralBonus(inviterId) {
    try {
      // Count how many users referred by this person have active subscriptions
      // 1. Get all users referred by inviter
      const referralsSnap = await db.collection("users").where("referredBy", "==", inviterId).get();

      let paidReferralCount = 0;
      const referralIds = [];
      referralsSnap.forEach(doc => referralIds.push(doc.id));

      // 2. Check their subscriptions (batch check might be hard, so loop for now or improved query)
      // Simple loop for V1 stability:
      for (const refUserId of referralIds) {
        const subDoc = await db.collection("user_subscriptions").doc(refUserId).get();
        if (subDoc.exists && subDoc.data().status === "active") {
          paidReferralCount++;
        }
      }

      if (paidReferralCount === 10) {
        // Exact hit
        await this.awardLaunchpadCashBonus(inviterId);
      }
    } catch (err) {
      console.error("Error checking paid referral bonus:", err);
    }
  }

  // Award signup bonus
  async awardSignupBonus(userId, credits) {
    try {
      const creditsRef = db.collection("user_credits").doc(userId);
      await creditsRef.set({
        balance: credits,
        totalEarned: credits,
        transactions: [
          {
            type: "signup_bonus",
            amount: credits,
            timestamp: new Date().toISOString(),
            description: "Welcome bonus for joining via referral",
          },
        ],
        lastUpdated: new Date().toISOString(),
      });

      console.log("✅ Awarded", credits, "signup bonus to new user", userId);
    } catch (error) {
      console.error("Error awarding signup bonus:", error);
      throw error;
    }
  }

  // Create growth squad
  async createGrowthSquad(creatorId, squadData) {
    try {
      const { name, description, maxMembers, contentFocus } = squadData;

      const squad = {
        creatorId,
        name: name || `Growth Squad ${Date.now()}`,
        description: description || "A squad focused on mutual growth and viral success",
        maxMembers: maxMembers || 10,
        contentFocus: contentFocus || "general",
        members: [creatorId], // Creator is automatically a member
        memberCount: 1,
        status: "active",
        createdAt: new Date().toISOString(),
        settings: {
          autoShare: true,
          notificationEnabled: true,
          contentApproval: false,
        },
      };

      const squadRef = await db.collection("growth_squads").add(squad);

      return {
        squadId: squadRef.id,
        ...squad,
        message: "Growth squad created successfully",
      };
    } catch (error) {
      console.error("Error creating growth squad:", error);
      throw error;
    }
  }

  // Join growth squad
  async joinGrowthSquad(userId, squadId) {
    try {
      const squadRef = db.collection("growth_squads").doc(squadId);
      const squadDoc = await squadRef.get();

      if (!squadDoc.exists) {
        throw new Error("Growth squad not found");
      }

      const squad = squadDoc.data();

      // Check if squad is full
      if (squad.members.length >= squad.maxMembers) {
        throw new Error("Growth squad is full");
      }

      // Check if user is already a member
      if (squad.members.includes(userId)) {
        throw new Error("You are already a member of this squad");
      }

      // Add user to squad
      const updatedMembers = [...squad.members, userId];
      await squadRef.update({
        members: updatedMembers,
        memberCount: updatedMembers.length,
        lastUpdated: new Date().toISOString(),
      });

      // Award join bonus
      await this.awardSquadJoinBonus(userId, 10);

      return {
        success: true,
        squadId,
        message: "Successfully joined growth squad! You received 10 promotion credits.",
      };
    } catch (error) {
      console.error("Error joining growth squad:", error);
      throw error;
    }
  }

  // Award squad join bonus
  async awardSquadJoinBonus(userId, credits) {
    try {
      const creditsRef = db.collection("user_credits").doc(userId);
      const creditsDoc = await creditsRef.get();

      const currentCredits = creditsDoc.exists ? creditsDoc.data().balance || 0 : 0;

      await creditsRef.set(
        {
          balance: currentCredits + credits,
          totalEarned: (creditsDoc.data()?.totalEarned || 0) + credits,
          transactions: [
            ...(creditsDoc.data()?.transactions || []),
            {
              type: "squad_join_bonus",
              amount: credits,
              timestamp: new Date().toISOString(),
              description: "Bonus for joining a growth squad",
            },
          ],
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error awarding squad join bonus:", error);
      throw error;
    }
  }

  // Share content with growth squad
  async shareWithGrowthSquad(userId, contentId, squadId) {
    try {
      // Verify user is member of squad
      const squadDoc = await db.collection("growth_squads").doc(squadId).get();
      if (!squadDoc.exists) {
        throw new Error("Growth squad not found");
      }

      const squad = squadDoc.data();
      if (!squad.members.includes(userId)) {
        throw new Error("You are not a member of this squad");
      }

      // Get content
      const contentDoc = await db.collection("content").doc(contentId).get();
      if (!contentDoc.exists) {
        throw new Error("Content not found");
      }

      const content = contentDoc.data();
      if (content.user_id !== userId) {
        throw new Error("You can only share your own content");
      }

      // Create squad share
      const share = {
        contentId,
        squadId,
        sharerId: userId,
        sharedAt: new Date().toISOString(),
        status: "active",
        notificationsSent: 0,
        engagements: 0,
      };

      const shareRef = await db.collection("squad_shares").add(share);

      // Notify other squad members (would integrate with notification service)
      const otherMembers = squad.members.filter(id => id !== userId);
      console.log("📢 Notifying", otherMembers.length, "squad members about new content share");

      return {
        shareId: shareRef.id,
        squadName: squad.name,
        membersNotified: otherMembers.length,
        message: "Content shared with growth squad successfully",
      };
    } catch (error) {
      console.error("Error sharing with growth squad:", error);
      throw error;
    }
  }

  // Get user's growth squad activity
  async getGrowthSquadActivity(userId) {
    try {
      // Get squads user is member of
      const squadsQuery = await db
        .collection("growth_squads")
        .where("members", "array-contains", userId)
        .get();

      const squads = [];
      squadsQuery.forEach(doc => {
        squads.push({ id: doc.id, ...doc.data() });
      });

      // Get recent shares in user's squads
      const sharesPromises = squads.map(async squad => {
        const sharesQuery = await db
          .collection("squad_shares")
          .where("squadId", "==", squad.id)
          .orderBy("sharedAt", "desc")
          .limit(10)
          .get();

        const shares = [];
        sharesQuery.forEach(doc => {
          shares.push({ id: doc.id, ...doc.data() });
        });

        return {
          squadId: squad.id,
          squadName: squad.name,
          recentShares: shares,
        };
      });

      const squadShares = await Promise.all(sharesPromises);

      return {
        userId,
        memberOfSquads: squads.length,
        squads: squads.map(s => ({
          id: s.id,
          name: s.name,
          memberCount: s.memberCount,
          createdAt: s.createdAt,
        })),
        squadActivity: squadShares,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting growth squad activity:", error);
      throw error;
    }
  }

  // Calculate viral loop rewards
  async calculateViralLoopRewards(userId) {
    try {
      // Get user's referral stats
      const referralsQuery = await db
        .collection("referral_invitations")
        .where("inviterId", "==", userId)
        .where("status", "==", "completed")
        .get();

      const completedReferrals = referralsQuery.docs.length;

      // Get user's squad contributions
      const squadSharesQuery = await db
        .collection("squad_shares")
        .where("sharerId", "==", userId)
        .get();

      const squadShares = squadSharesQuery.docs.length;

      // Get user's content performance
      const contentQuery = await db.collection("content").where("user_id", "==", userId).get();

      let totalViralViews = 0;
      contentQuery.forEach(doc => {
        const content = doc.data();
        totalViralViews += content.metrics?.views || 0;
      });

      // Calculate rewards based on viral impact
      const baseReward = 10; // Base credits per action
      const referralBonus = completedReferrals * baseReward * 2; // Double for referrals
      const squadBonus = squadShares * baseReward;
      const viralBonus = Math.floor(totalViralViews / 1000) * baseReward; // 10 credits per 1K views

      const totalRewards = referralBonus + squadBonus + viralBonus;

      return {
        userId,
        viralImpact: {
          referrals: completedReferrals,
          squadShares,
          totalViralViews,
          viralMultiplier: Math.max(1, Math.floor(totalViralViews / 5000)), // Bonus multiplier
        },
        rewards: {
          referralBonus,
          squadBonus,
          viralBonus,
          total: totalRewards,
        },
        nextMilestone: this.getNextViralMilestone(completedReferrals, squadShares, totalViralViews),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error calculating viral loop rewards:", error);
      throw error;
    }
  }

  // Get next viral milestone
  getNextViralMilestone(referrals, shares, views) {
    const milestones = [
      { type: "referrals", target: 5, current: referrals, reward: 100 },
      { type: "referrals", target: 10, current: referrals, reward: 250 },
      { type: "shares", target: 20, current: shares, reward: 150 },
      { type: "views", target: 50000, current: views, reward: 300 },
      { type: "views", target: 100000, current: views, reward: 500 },
    ];

    const upcoming = milestones
      .filter(m => m.current < m.target)
      .sort((a, b) => a.target - b.target)[0];

    return (
      upcoming || { type: "legendary", target: "∞", current: "max", reward: "Legendary status" }
    );
  }

  // Award viral loop bonuses
  async awardViralLoopBonuses(userId) {
    try {
      const rewards = await this.calculateViralLoopRewards(userId);

      if (rewards.rewards.total > 0) {
        await this.awardReferralCredits(userId, rewards.rewards.total, "viral_loop_system");

        return {
          success: true,
          creditsAwarded: rewards.rewards.total,
          breakdown: rewards.rewards,
          message: `Viral loop bonus: ${rewards.rewards.total} promotion credits awarded!`,
        };
      }

      return {
        success: true,
        creditsAwarded: 0,
        message: "No viral loop bonuses available at this time",
      };
    } catch (error) {
      console.error("Error awarding viral loop bonuses:", error);
      throw error;
    }
  }

  // Get user's referral leaderboard position
  async getReferralLeaderboard(userId) {
    try {
      // Get all users with their referral counts
      const allUsersQuery = await db
        .collection("referral_invitations")
        .where("status", "==", "completed")
        .get();

      const userStats = {};
      allUsersQuery.forEach(doc => {
        const invitation = doc.data();
        const inviterId = invitation.inviterId;

        if (!userStats[inviterId]) {
          userStats[inviterId] = { referrals: 0, totalCredits: 0 };
        }
        userStats[inviterId].referrals += 1;
        userStats[inviterId].totalCredits += invitation.creditsOffered || 0;
      });

      // Convert to sorted array
      const leaderboard = Object.entries(userStats)
        .map(([userId, stats]) => ({ userId, ...stats }))
        .sort((a, b) => b.referrals - a.referrals);

      // Find current user's position
      const userPosition = leaderboard.findIndex(entry => entry.userId === userId) + 1;
      const userStatsData = leaderboard.find(entry => entry.userId === userId);

      return {
        userId,
        position: userPosition,
        userStats: userStatsData || { referrals: 0, totalCredits: 0 },
        topPerformers: leaderboard.slice(0, 10),
        totalParticipants: leaderboard.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting referral leaderboard:", error);
      throw error;
    }
  }

  // Get user's credit balance
  async getCreditBalance(userId) {
    try {
      const creditsDoc = await db.collection("user_credits").doc(userId).get();

      if (!creditsDoc.exists) {
        return {
          userId,
          balance: 0,
          totalEarned: 0,
          transactions: [],
          message: "No credits earned yet",
        };
      }

      const credits = creditsDoc.data();

      return {
        userId,
        balance: credits.balance || 0,
        totalEarned: credits.totalEarned || 0,
        transactions: credits.transactions || [],
        lastUpdated: credits.lastUpdated,
      };
    } catch (error) {
      console.error("Error getting credit balance:", error);
      throw error;
    }
  }
}

module.exports = new ReferralGrowthEngine();
