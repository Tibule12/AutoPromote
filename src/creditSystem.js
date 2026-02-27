const { db } = require("./firebaseAdmin");

// Deduct credits from a user
// Returns { success: true, remaining: 10 } or { success: false, message: "..." }
const deductCredits = async (userId, amount) => {
  const userRef = db.collection("users").doc(userId);

  try {
    return await db.runTransaction(async transaction => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User not found");
      }

      const userData = userDoc.data();
      const currentCredits = userData.credits || 0;

      if (currentCredits < amount) {
        return { success: false, message: "Insufficient credits" };
      }

      transaction.update(userRef, {
        credits: currentCredits - amount,
        last_credit_deduction: new Date().toISOString(),
      });

      return { success: true, remaining: currentCredits - amount };
    });
  } catch (error) {
    console.error("Credit deduction failed:", error);
    return { success: false, message: error.message };
  }
};

module.exports = { deductCredits };
