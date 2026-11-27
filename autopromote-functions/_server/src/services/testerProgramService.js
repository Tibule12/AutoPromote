const { admin, db } = require("../firebaseAdmin");
const { resolvePlan } = require("../config/subscriptionPlans");
const { TESTER_PROGRAM } = require("../config/testerProgram");

function testerProgramError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function grantTesterAccess({ userId, adminId }) {
  if (!userId) throw testerProgramError("user_required", "A user is required.");
  if (!adminId) throw testerProgramError("admin_required", "An administrator is required.", 403);

  const programRef = db.collection("programs").doc(TESTER_PROGRAM.id);
  const testerRef = programRef.collection("testers").doc(userId);
  const userRef = db.collection("users").doc(userId);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + TESTER_PROGRAM.durationDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const plan = resolvePlan(TESTER_PROGRAM.planId);

  return db.runTransaction(async transaction => {
    const [programDoc, testerDoc, userDoc] = await Promise.all([
      transaction.get(programRef),
      transaction.get(testerRef),
      transaction.get(userRef),
    ]);

    if (!userDoc.exists) {
      throw testerProgramError("user_not_found", "The selected user no longer exists.", 404);
    }

    if (testerDoc.exists) {
      return {
        alreadyGranted: true,
        claimedSeats: Number(programDoc.data()?.claimedSeats || 0),
        tester: testerDoc.data() || {},
        user: userDoc.data() || {},
      };
    }

    const claimedSeats = Math.max(0, Number(programDoc.data()?.claimedSeats || 0));
    if (claimedSeats >= TESTER_PROGRAM.maxSeats) {
      throw testerProgramError(
        "tester_program_full",
        `All ${TESTER_PROGRAM.maxSeats} Founding Tester places have been granted.`,
        409
      );
    }

    const user = userDoc.data() || {};
    const access = {
      programId: TESTER_PROGRAM.id,
      programName: TESTER_PROGRAM.name,
      status: "active",
      planId: TESTER_PROGRAM.planId,
      grantedAt: now.toISOString(),
      expiresAt,
      grantedBy: adminId,
      bonusCredits: TESTER_PROGRAM.bonusCredits,
      creditAllowance: TESTER_PROGRAM.totalCreditAllowance,
      creditsUsed: 0,
      allowedWorkflows: [...TESTER_PROGRAM.allowedWorkflows],
      autoRenews: false,
    };
    const tester = {
      userId,
      email: String(user.email || "")
        .trim()
        .toLowerCase(),
      name: user.name || "",
      ...access,
    };

    transaction.set(
      userRef,
      {
        testerAccess: access,
        testerProgramUpdatedAt: now.toISOString(),
      },
      { merge: true }
    );
    transaction.set(testerRef, tester);
    transaction.set(
      programRef,
      {
        id: TESTER_PROGRAM.id,
        name: TESTER_PROGRAM.name,
        claimedSeats: claimedSeats + 1,
        maxSeats: TESTER_PROGRAM.maxSeats,
        planId: TESTER_PROGRAM.planId,
        bonusCreditsPerTester: TESTER_PROGRAM.bonusCredits,
        totalCreditAllowancePerTester: TESTER_PROGRAM.totalCreditAllowance,
        usageLimits: TESTER_PROGRAM.usageLimits,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      alreadyGranted: false,
      claimedSeats: claimedSeats + 1,
      tester,
      user,
      bundle: {
        planId: plan.id,
        planName: plan.name,
        durationDays: TESTER_PROGRAM.durationDays,
        monthlyCredits: Number(plan.features.monthlyCredits || 0),
        bonusCredits: TESTER_PROGRAM.bonusCredits,
        totalStartingCredits: TESTER_PROGRAM.totalCreditAllowance,
        uploads: TESTER_PROGRAM.usageLimits.uploads,
        queuedPlatformPosts: TESTER_PROGRAM.usageLimits.queuedPlatformPosts,
        connectedPlatforms: TESTER_PROGRAM.usageLimits.connectedPlatforms,
      },
    };
  });
}

module.exports = { grantTesterAccess, testerProgramError };
