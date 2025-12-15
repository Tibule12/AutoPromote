// insertTestDashboardData.js
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://autopromote-cc6d3.firebaseio.com",
});
const db = admin.firestore();
const uid = "bf04dPKELvVMivWoUyLsAVyw2sg2";
const contentId = "943bLAkTZP0fo6iGZ7Ei"; // Use one of your content IDs

async function insertTestData() {
  // Declare 'now' ONCE at the top
  const now = new Date(); // Declare 'now' ONCE at the top

  // 1. Insert multiple users (admin, power, regular, inactive)
  const users = [
    {
      name: "Test Admin",
      email: "testadmin@example.com",
      role: "admin",
      isAdmin: true,
      createdAt: new Date().toISOString(),
    },
    {
      name: "Power User",
      email: "poweruser@example.com",
      role: "user",
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    },
    {
      name: "Regular User",
      email: "regularuser@example.com",
      role: "user",
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      name: "Inactive User",
      email: "inactiveuser@example.com",
      role: "user",
      createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
  ];
  const userIds = [];
  for (const user of users) {
    const ref = await db.collection("users").add(user);
    userIds.push(ref.id);
  }

  // 2. Insert multiple content items (varied views, revenue, status, user)
  const contents = [
    {
      title: "Viral Video",
      description: "High performing content",
      userId: userIds[1],
      status: "published",
      views: 5000,
      revenue: 200,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      title: "Steady Growth",
      description: "Medium content",
      userId: userIds[2],
      status: "published",
      views: 1200,
      revenue: 75.5,
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      title: "Low Engagement",
      description: "Low performing",
      userId: userIds[2],
      status: "published",
      views: 100,
      revenue: 5,
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
    {
      title: "Scheduled Promo",
      description: "Scheduled content",
      userId: userIds[1],
      status: "promoting",
      views: 0,
      revenue: 0,
      createdAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ];
  const contentIds = [];
  for (const content of contents) {
    const ref = await db.collection("content").add(content);
    contentIds.push(ref.id);
  }

  // 3. Insert multiple promotion schedules
  const schedules = [
    {
      contentTitle: "Viral Video",
      platform: "youtube",
      frequency: "once",
      startTime: new Date(Date.now() + 3600 * 1000).toISOString(),
      isActive: true,
    },
    {
      contentTitle: "Steady Growth",
      platform: "tiktok",
      frequency: "daily",
      startTime: new Date(Date.now() + 86400000 * 2).toISOString(),
      isActive: true,
    },
    {
      contentTitle: "Low Engagement",
      platform: "facebook",
      frequency: "weekly",
      startTime: new Date(Date.now() + 86400000 * 3).toISOString(),
      isActive: false,
    },
  ];
  for (const schedule of schedules) {
    await db.collection("promotion_schedules").add(schedule);
  }

  // 4. Insert analytics for each content/platform
  const analytics = [
    {
      contentId: contentIds[0],
      userId: userIds[1],
      platform: "youtube",
      views: 5000,
      revenue: 200,
      likes: 400,
      shares: 80,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      contentId: contentIds[1],
      userId: userIds[2],
      platform: "tiktok",
      views: 1200,
      revenue: 75.5,
      likes: 100,
      shares: 20,
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      contentId: contentIds[2],
      userId: userIds[2],
      platform: "facebook",
      views: 100,
      revenue: 5,
      likes: 10,
      shares: 2,
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
    {
      contentId: contentIds[3],
      userId: userIds[1],
      platform: "youtube",
      views: 0,
      revenue: 0,
      likes: 0,
      shares: 0,
      createdAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ];
  for (const analytic of analytics) {
    await db.collection("analytics").add(analytic);
  }

  // 5. Insert monthly revenue analytics
  for (let i = 0; i < 6; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 15);
    await db.collection("analytics").add({
      contentId: contentIds[0],
      userId: userIds[1],
      platform: i % 2 === 0 ? "youtube" : "tiktok",
      views: 1000 + i * 100,
      revenue: 50 + i * 10,
      likes: 50 + i * 5,
      shares: 10 + i,
      createdAt: monthDate.toISOString(),
    });
  }

  // 6. Insert revenue by content type
  const contentTypes = ["video", "image", "article"];
  for (let i = 0; i < contentTypes.length; i++) {
    await db.collection("analytics").add({
      contentId: contentIds[i % contentIds.length],
      userId: userIds[i % userIds.length],
      platform: "youtube",
      contentType: contentTypes[i],
      views: 500 + i * 100,
      revenue: 30 + i * 15,
      likes: 20 + i * 3,
      shares: 5 + i,
      createdAt: new Date(now.getTime() - 86400000 * (i + 1)).toISOString(),
    });
  }

  // 7. Insert transaction trends
  for (let i = 0; i < 5; i++) {
    await db.collection("transactions").add({
      userId: userIds[i % userIds.length],
      contentId: contentIds[i % contentIds.length],
      orderValue: 20 + i * 5,
      conversionRate: 0.05 + i * 0.01,
      repeatPurchaseRate: 0.1 + i * 0.02,
      createdAt: new Date(now.getTime() - 86400000 * i).toISOString(),
    });
  }

  // 8. Insert event counts
  await db.collection("ad_events").add({
    contentId: contentIds[0],
    userId: userIds[1],
    ad_impression: 1000,
    ad_click: 120,
    createdAt: now.toISOString(),
  });
  await db.collection("affiliate_events").add({
    contentId: contentIds[1],
    userId: userIds[2],
    affiliate_click: 80,
    affiliate_conversion: 12,
    createdAt: now.toISOString(),
  });

  // 9. Insert recent activity
  for (let i = 0; i < 4; i++) {
    await db.collection("recent_activity").add({
      userId: userIds[i],
      activityType: i % 2 === 0 ? "login" : "content_upload",
      description: i % 2 === 0 ? "User logged in" : "User uploaded content",
      timestamp: new Date(now.getTime() - 3600000 * i).toISOString(),
    });
  }

  // 10. Insert variant anomalies
  await db.collection("variant_anomalies").add({
    contentId: contentIds[0],
    platform: "youtube",
    variant: "A",
    posts: 10,
    clicks: 120,
    decayedCTR: 0.12,
    suppressed: false,
    quarantined: false,
    detectedAt: now.toISOString(),
  });

  // 11. All date formatting is ISO above
}
