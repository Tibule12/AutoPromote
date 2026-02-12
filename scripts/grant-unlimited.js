require("dotenv").config(); // Load env vars
require("../src/bootstrap"); // Materialize credentials
const { auth, db } = require("../src/firebaseAdmin");

async function grantUnlimited() {
  const email = process.argv[2];
  if (!email) {
    console.error("Please provide an email address.");
    process.exit(1);
  }

  try {
    console.log(`Looking up user ${email}...`);
    const user = await auth.getUserByEmail(email);
    console.log(`Found user: ${user.uid}`);

    // Update Firestore to remove blocks and grant unlimited subscription
    await db.collection("users").doc(user.uid).set({
      subscriptionTier: "premium",
      unlimited: true,
      isPaid: true,
      uploadBlocked: false,
      uploadBlockedReason: null, // clear any reason
      lastQuotaCheck: new Date().toISOString()
    }, { merge: true });

    console.log(`✅ User ${email} (UID: ${user.uid}) has been upgraded to **UNLIMITED** tier and unblocked.`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

grantUnlimited();
