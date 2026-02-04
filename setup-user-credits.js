const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function addCredits() {
  console.log(`\n💳 Adding credits to User: ${TARGET_UID}`);

  try {
    const creditRef = db.collection('user_credits').doc(TARGET_UID);
    await creditRef.set({
        credits: 1000,
        tier: 'pro',
        updatedAt: new Date(),
        stripeCustomerId: 'cus_test_12345'
    }, { merge: true });

    console.log("✅ Successfully added 1000 credits to user.");
    
  } catch (error) {
    console.error("Error adding credits:", error);
  }
}

addCredits();
