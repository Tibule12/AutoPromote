const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function updateContentAnalytics() {
  console.log("Searching for recent test content...");
  
  // Find the video we want to "boost"
  const contentQuery = await db.collection("content")
    .where("userId", "==", "bf04dPKELvVMivWoUyLsAVyw2sg2") // The UID from previous context
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  if (contentQuery.empty) {
    console.log("No content found for this user.");
    return;
  }

  console.log(`Found ${contentQuery.size} documents. Updating...`);

  // We'll update the most recent one (or all of them) to have stats
  const updates = [];
  
  contentQuery.forEach(doc => {
    const data = doc.data();
    console.log(`Updating content: ${doc.id} - ${data.title}`);
    
    // Simulate viral stats
    const viralViews = 68420; // 54k + 12.5k + misc
    const viralRevenue = 153.42; // Simulated ad revenue
    
    updates.push(doc.ref.update({
      views: viralViews,
      clicks: Math.floor(viralViews * 0.05), // 5% click rate
      revenue: viralRevenue, 
      status: "active",
      engagementRate: 0.082, // 8.2% engagement
      platformStats: {
        tiktok: { views: 54100, likes: 4200, shares: 850 },
        youtube: { views: 12500, likes: 380, shares: 120 },
        facebook: { views: 1200, likes: 65, shares: 15 },
        instagram: { views: 620, likes: 90, shares: 5 }
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }));
  });

  await Promise.all(updates);
  console.log("Content analytics updated successfully!");
}

updateContentAnalytics().catch(console.error);
