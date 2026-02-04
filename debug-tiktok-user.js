const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function checkUser() {
  console.log(`\n🔍 Checking User: ${TARGET_UID}`);

  try {
    // 1. Check User Profile
    const userDocRef = db.collection('users').doc(TARGET_UID);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      console.error("❌ User document NOT FOUND in 'users' collection.");
      return;
    }

    const userData = userDoc.data();
    console.log("✅ User found in database.");
    console.log(`   Display Name: ${userData.displayName || userData.name || 'N/A'}`);
    console.log(`   Email: ${userData.email || 'N/A'}`);
    
    // 2. Check TikTok Connection in Subcollection
    console.log("\n📱 Checking TikTok Connection (Subcollection)...");
    const tiktokDoc = await userDocRef.collection('connections').doc('tiktok').get();
    
    if (tiktokDoc.exists) {
        const tiktokAuth = tiktokDoc.data();
        console.log("✅ TikTok Integration Found:");
        console.log(`   Display Name: ${tiktokAuth.display_name || 'N/A'}`);
        console.log(`   OpenID: ${tiktokAuth.open_id || 'N/A'}`);
        console.log(`   Mode: ${tiktokAuth.mode || 'N/A'}`);
        
        // Check for tokens
        if (tiktokAuth.tokens || tiktokAuth.accessToken) {
            console.log("   ✅ Tokens present");
        } else {
            console.log("   ❌ No Access Token field found");
        }

        if (tiktokAuth.obtainedAt) {
             const obtained = new Date(tiktokAuth.obtainedAt._seconds * 1000);
             console.log(`   Connected At: ${obtained.toISOString()}`);
        }
    } else {
        console.error("❌ TikTok connection document NOT FOUND in 'connections' subcollection.");
    }

    // 2b. List all connections
    console.log("\n🔗 All Connected Platforms:");
    const connectionsSnapshot = await userDocRef.collection('connections').doc('tiktok').parent.get(); // Get the collection reference properly if possible or just .get() on collection
    // Actually the previous code used await userDocRef.collection('connections').get(); which is correct.
    const allConnections = await userDocRef.collection('connections').get();
    
    if (allConnections.empty) {
        console.log("   No connections found.");
    } else {
        allConnections.forEach(doc => {
            const data = doc.data();
            // 'connected' might be boolean or implicit
            const status = (data.connected === true || data.tokens) ? "Active" : "Present";
            console.log(`   - ${doc.id}: ${status} `);
        });
    }

    // 3. Check Billing / Credits
    const creditsDoc = await db.collection('user_credits').doc(TARGET_UID).get();
    console.log("\n💳 Billing & Credits:");
    if (creditsDoc.exists) {
        const creditData = creditsDoc.data();
        console.log(`   Credits Available: ${creditData.credits || 0}`);
        console.log(`   Subscription Tier: ${creditData.tier || 'Free'}`);
        console.log(`   Stripe Customer ID: ${creditData.stripeCustomerId ? "✅ Linked (" + creditData.stripeCustomerId + ")" : "❌ Not Linked"}`);
    } else {
        console.log("   ❌ No credit record found (User likely on default free tier with 0 credits).");
    }

    // 4. Check Recent Content
    console.log("\n📹 Recent Content (5 found):");
    const contentSnapshot = await db.collection('content')
        .where('userId', '==', TARGET_UID)
        .limit(5)
        .get();

    if (contentSnapshot.empty) {
        console.log("   No content found.");
    } else {
        contentSnapshot.forEach(doc => {
            const data = doc.data();
            let bountyActive = "No";
            
            if (data.viralBounty === true) bountyActive = "Yes (Global)";
            
            const platforms = data.targetPlatforms || [];
            
            console.log(`   - [${doc.id}] Platform: ${platforms.length > 0 ? platforms.join(', ') : 'Multi'}`);
            console.log(`     Bounty Active: ${bountyActive}`);
        });
    }

    // 5. Analytics
    console.log("\n📊 Analytics Data Check:");
    const analyticsSnapshot = await db.collection('analytics')
        .where('userId', '==', TARGET_UID)
        .limit(1)
        .get();
        
    if (!analyticsSnapshot.empty) {
        console.log("   ✅ Analytics records exist.");
    } else {
        console.log("   ❌ No analytics data found.");
    }

  } catch (error) {
    console.error("Error checking user:", error);
  }
}

checkUser();
