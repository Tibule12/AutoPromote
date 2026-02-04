const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function inspectUser() {
  console.log(`\n🔍 DEEP INSPECTION for User: ${TARGET_UID}`);

  try {
    const userRef = db.collection('users').doc(TARGET_UID);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.error("❌ User document NOT FOUND.");
      return;
    }

    console.log("\n📄 User Document Data:");
    console.log(JSON.stringify(userDoc.data(), null, 2));

    console.log("\n📂 Checking Subcollections:");
    const collections = await userRef.listCollections();
    
    if (collections.length === 0) {
        console.log("   No subcollections found.");
    } else {
        for (const col of collections) {
            console.log(`   - ${col.id}`);
            const snapshot = await col.get();
            console.log(`     Documents (${snapshot.size}):`);
            snapshot.forEach(doc => {
                console.log(`       ID: ${doc.id}`);
                console.log(JSON.stringify(doc.data(), null, 2));
            });
        }
    }

  } catch (error) {
    console.error("Error detecting user:", error);
  }
}

inspectUser();
