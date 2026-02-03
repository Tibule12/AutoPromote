const { db } = require("../firebaseAdmin");

const FREE_TIER_LIMIT = 10;

/**
 * Usage Limit Middleware
 * Enforces the "10 Free Uploads" Hard Cap.
 */
const checkUsageLimit = async (req, res, next) => {
  const { uid } = req.user;
  
  // Admin bypass
  if (req.user.isAdmin) return next();

  try {
    const usageRef = db.collection("users").doc(uid).collection("usage").doc("monthly_v1");
    const usageDoc = await usageRef.get();

    if (!usageDoc.exists) {
       // First time? Pass.
       return next();
    }

    const count = usageDoc.data().uploadCount || 0;

    if (count >= FREE_TIER_LIMIT) {
        return res.status(402).json({
            error: "Quota Exceeded",
            message: "You have reached your 10 free uploads this month.",
            action: "MARKETPLACE_REDIRECT",
            marketplaceUrl: "/marketplace"
        });
    }

    next();
  } catch (error) {
    console.error("Usage limit check failed:", error);
    // Fail open or closed? Closed for greedy model.
    return res.status(500).json({ error: "Could not verify usage quota." });
  }
};

module.exports = checkUsageLimit;
