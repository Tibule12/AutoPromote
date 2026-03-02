const { db, admin } = require("../src/firebaseAdmin");

async function seedWolfHunt() {
    console.log("🐺 Starting Wolf Hunt Seeding...");
    
    const campaignsRef = db.collection("engagement_campaigns");
    const fakePosterId = "system_wolf_master";

    const campaigns = [
        {
            platform: "tiktok",
            unitReward: 8, // High reward -> Frenzy
            totalSlots: 50,
            actionType: "like",
            title: "Viral Dance Challenge",
            isFrenzy: true
        },
        {
            platform: "instagram",
            unitReward: 2,
            totalSlots: 100,
            actionType: "like",
            title: "Luxury Brand Showcase",
            isFrenzy: false
        },
        {
            platform: "youtube",
            unitReward: 5,
            totalSlots: 10, // Scarce
            actionType: "comment",
            title: "Tech Review Early Access",
            isFrenzy: true
        },
        {
            platform: "tiktok",
            unitReward: 3,
            totalSlots: 200,
            actionType: "share",
            title: "Eco-Friendly Gadgets",
            isFrenzy: false
        },
        {
            platform: "instagram",
            unitReward: 10, // VERY HIGH REWARD
            totalSlots: 5, // EXTREMELY SCARCE
            actionType: "follow",
            title: "Exclusive Alpha Access", 
            isFrenzy: true
        }
    ];

    for (const c of campaigns) {
        const docRef = campaignsRef.doc();
        const expiresHours = c.isFrenzy ? 4 : 48;
        
        await docRef.set({
            campaignId: docRef.id,
            posterId: fakePosterId,
            contentId: `mock_${docRef.id}`,
            platform: c.platform,
            externalUrl: "https://example.com/mock-content", // Safe mock URL
            actionType: c.actionType,
            totalSlots: c.totalSlots,
            claimedSlots: Math.floor(Math.random() * (c.totalSlots / 2)), // Half filled already to simulate activity
            completedSlots: 0,
            unitReward: c.unitReward,
            isFrenzy: c.isFrenzy,
            status: "active",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString(),
            claimedBy: []
        });
        
        console.log(`✅ Created Prey: [${c.platform}] ${c.title} (${c.unitReward} Credits)`);
    }

    console.log("\n🐺 The hunt has begun! 5 new targets live.");
    process.exit(0);
}

seedWolfHunt().catch(console.error);