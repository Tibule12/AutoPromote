// generateSampleData.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Initialize Firebase Admin if not already initialized
try {
  if (!admin.apps.length) {
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
  process.exit(1);
}

const db = admin.firestore();
const crypto = require("crypto");
const batch = db.batch();

// Helper to generate random dates within a range
function randomFraction() {
  return crypto.randomInt(0, 1000000) / 1000000;
}

function randomDate(start, end) {
  return new Date(start.getTime() + randomFraction() * (end.getTime() - start.getTime()));
}

// Helper to generate random numbers (inclusive)
function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

// Helper to generate random boolean
function randomBool() {
  return crypto.randomInt(0, 2) === 1;
}

// Helper to choose random element from array
function randomChoice(arr) {
  return arr[crypto.randomInt(0, arr.length)];
}

// Generate sample users
async function generateUsers(count = 20) {
  console.log(`Generating ${count} sample users...`);

  const userTypes = ["free", "premium", "enterprise"];
  const statuses = ["active", "inactive", "suspended"];
  const names = [
    "John Smith",
    "Jane Doe",
    "Michael Johnson",
    "Emma Williams",
    "Robert Brown",
    "Olivia Jones",
    "William Davis",
    "Sophia Miller",
    "James Wilson",
    "Isabella Moore",
    "David Taylor",
    "Mia Anderson",
    "Joseph Thomas",
    "Charlotte Jackson",
    "Charles White",
    "Amelia Harris",
    "Daniel Martin",
    "Harper Thompson",
    "Matthew Garcia",
    "Evelyn Martinez",
  ];

  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    const email = name.toLowerCase().replace(" ", ".") + "@example.com";
    const createdAt = randomDate(new Date(2022, 0, 1), new Date());
    const userType = randomChoice(userTypes);
    const status = randomChoice(statuses);

    const userData = {
      name,
      email,
      userType,
      status,
      createdAt: admin.firestore.Timestamp.fromDate(createdAt),
      lastLogin: admin.firestore.Timestamp.fromDate(randomDate(createdAt, new Date())),
      promotions: randomInt(0, 15),
      contentCount: randomInt(0, 30),
      engagementScore: randomInt(1, 100),
      isAdmin: i < 2, // Make the first two users admins
      settings: {
        notifications: randomBool(),
        autoPromotion: randomBool(),
        theme: randomChoice(["light", "dark", "system"]),
        language: randomChoice(["en", "es", "fr"]),
      },
    };

    const userRef = db.collection("users").doc(`user_${i + 1}`);
    batch.set(userRef, userData);
  }
}

// Generate sample content
async function generateContent(count = 30) {
  console.log(`Generating ${count} sample content items...`);

  const contentTypes = ["article", "video", "image", "product"];
  const statuses = ["published", "draft", "archived"];
  const titles = [
    "Getting Started with AutoPromote",
    "How to Maximize Your Reach",
    "Best Practices for Content Creation",
    "Understanding Analytics",
    "Promotion Strategies That Work",
    "Building Your Brand",
    "Engagement Tactics for Social Media",
    "Creating Viral Content",
    "The Ultimate Guide to Digital Marketing",
    "Content Scheduling Tips",
    "Measuring ROI of Your Promotions",
    "Audience Targeting Guide",
    "Cross-Platform Promotion",
    "Visual Content Strategies",
    "Using Hashtags Effectively",
    "SEO Tips for Content",
  ];

  for (let i = 0; i < count; i++) {
    const title =
      titles[i % titles.length] + (i > titles.length ? ` ${Math.ceil(i / titles.length)}` : "");
    const createdAt = randomDate(new Date(2022, 0, 1), new Date());
    const contentType = randomChoice(contentTypes);
    const status = randomChoice(statuses);
    const views = randomInt(100, 10000);
    const engagement = randomInt(1, Math.floor(views * 0.2));

    const contentData = {
      title,
      author: `user_${randomInt(1, 20)}`,
      contentType,
      status,
      createdAt: admin.firestore.Timestamp.fromDate(createdAt),
      lastUpdated: admin.firestore.Timestamp.fromDate(randomDate(createdAt, new Date())),
      views,
      likes: randomInt(1, engagement),
      shares: randomInt(1, engagement / 2),
      comments: randomInt(0, engagement / 3),
      promotionCount: randomInt(0, 5),
      metrics: {
        clickThroughRate: randomFraction() * 0.15,
        conversionRate: randomFraction() * 0.05,
        bounceRate: randomFraction() * 0.6 + 0.2,
        averageTimeOnPage: randomInt(30, 300),
      },
      tags: Array.from({ length: randomInt(1, 5) }, () =>
        randomChoice([
          "marketing",
          "social media",
          "promotion",
          "strategy",
          "content",
          "digital",
          "brand",
          "seo",
          "analytics",
        ])
      ),
    };

    const contentRef = db.collection("content").doc(`content_${i + 1}`);
    batch.set(contentRef, contentData);
  }
}

// Generate sample promotions
async function generatePromotions(count = 25) {
  console.log(`Generating ${count} sample promotions...`);

  const platforms = ["facebook", "instagram", "twitter", "linkedin", "tiktok", "pinterest"];
  const statuses = ["active", "completed", "scheduled", "cancelled"];
  const types = ["standard", "featured", "premium", "sponsored"];

  for (let i = 0; i < count; i++) {
    const createdAt = randomDate(new Date(2022, 0, 1), new Date());
    const startDate = randomDate(
      createdAt,
      new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 30)
    );
    const endDate = randomDate(startDate, new Date(startDate.getTime() + 1000 * 60 * 60 * 24 * 30));
    const status = randomChoice(statuses);
    const budget = randomInt(50, 1000);
    const spent = status === "completed" ? budget : status === "active" ? randomInt(1, budget) : 0;

    const promotionData = {
      title: `Promotion Campaign ${i + 1}`,
      contentId: `content_${randomInt(1, 30)}`,
      userId: `user_${randomInt(1, 20)}`,
      platform: randomChoice(platforms),
      status,
      type: randomChoice(types),
      createdAt: admin.firestore.Timestamp.fromDate(createdAt),
      startDate: admin.firestore.Timestamp.fromDate(startDate),
      endDate: admin.firestore.Timestamp.fromDate(endDate),
      budget,
      spent,
      impressions: randomInt(500, 50000),
      clicks: randomInt(10, 5000),
      conversions: randomInt(1, 500),
      targeting: {
        ageRange: randomChoice(["18-24", "25-34", "35-44", "45-54", "55+"]),
        locations: Array.from({ length: randomInt(1, 3) }, () =>
          randomChoice([
            "United States",
            "Canada",
            "United Kingdom",
            "Australia",
            "Germany",
            "France",
            "Japan",
          ])
        ),
        interests: Array.from({ length: randomInt(1, 4) }, () =>
          randomChoice([
            "technology",
            "sports",
            "fashion",
            "travel",
            "food",
            "music",
            "movies",
            "business",
          ])
        ),
      },
    };

    const promotionRef = db.collection("promotions").doc(`promotion_${i + 1}`);
    batch.set(promotionRef, promotionData);
  }
}

// Generate sample activities
async function generateActivities(count = 50) {
  console.log(`Generating ${count} sample activities...`);

  const actionTypes = [
    "user_registered",
    "user_login",
    "content_created",
    "content_updated",
    "promotion_created",
    "promotion_started",
    "promotion_ended",
    "content_viewed",
    "settings_updated",
    "profile_updated",
    "payment_processed",
    "subscription_changed",
  ];

  for (let i = 0; i < count; i++) {
    const timestamp = randomDate(new Date(2022, 6, 1), new Date());
    const actionType = randomChoice(actionTypes);
    let details = {};

    // Generate different details based on action type
    if (actionType.includes("user")) {
      details = {
        userId: `user_${randomInt(1, 20)}`,
        userEmail: `user${randomInt(1, 20)}@example.com`,
      };
    } else if (actionType.includes("content")) {
      details = {
        contentId: `content_${randomInt(1, 30)}`,
        userId: `user_${randomInt(1, 20)}`,
        contentType: randomChoice(["article", "video", "image", "product"]),
      };
    } else if (actionType.includes("promotion")) {
      details = {
        promotionId: `promotion_${randomInt(1, 25)}`,
        userId: `user_${randomInt(1, 20)}`,
        platform: randomChoice(["facebook", "instagram", "twitter", "linkedin"]),
      };
    } else {
      details = {
        userId: `user_${randomInt(1, 20)}`,
        status: "success",
        change: randomChoice([
          "plan upgrade",
          "plan downgrade",
          "payment method",
          "account settings",
        ]),
      };
    }

    const activityData = {
      actionType,
      timestamp: admin.firestore.Timestamp.fromDate(timestamp),
      ipAddress: `192.168.${randomInt(1, 254)}.${randomInt(1, 254)}`,
      userAgent: randomChoice([
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15",
        "Mozilla/5.0 (Linux; Android 11; SM-G998B) AppleWebKit/537.36",
      ]),
      details,
    };

    const activityRef = db.collection("activities").doc(`activity_${i + 1}`);
    batch.set(activityRef, activityData);
  }
}

// Generate analytics summary
async function generateAnalyticsSummary() {
  console.log(`Generating analytics summary...`);

  const today = new Date();
  const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate());

  const dailyData = [];

  // Generate 30 days of data
  for (let i = 0; i < 30; i++) {
    const date = new Date(oneMonthAgo.getTime() + i * 24 * 60 * 60 * 1000);

    dailyData.push({
      date: admin.firestore.Timestamp.fromDate(date),
      newUsers: randomInt(1, 10),
      activeUsers: randomInt(50, 200),
      contentCreated: randomInt(5, 20),
      promotionsStarted: randomInt(2, 15),
      revenue: randomInt(100, 2000),
      pageViews: randomInt(500, 5000),
    });
  }

  const analyticsData = {
    lastUpdated: admin.firestore.Timestamp.fromDate(today),
    summary: {
      totalUsers: 1254 + randomInt(1, 100),
      activeUsers: 876 + randomInt(1, 50),
      totalContent: 3542 + randomInt(1, 200),
      activePromotions: 267 + randomInt(1, 30),
      totalRevenue: 187650 + randomInt(1000, 5000),
      averageDailyUsers: 156 + randomInt(1, 20),
    },
    comparison: {
      users: {
        current: 876 + randomInt(1, 50),
        previous: 812 + randomInt(1, 50),
      },
      content: {
        current: 321 + randomInt(1, 30),
        previous: 287 + randomInt(1, 30),
      },
      promotions: {
        current: 89 + randomInt(1, 15),
        previous: 76 + randomInt(1, 15),
      },
      revenue: {
        current: 24680 + randomInt(100, 1000),
        previous: 21450 + randomInt(100, 1000),
      },
    },
    platforms: {
      facebook: {
        impressions: 45000 + randomInt(1000, 5000),
        clicks: 3200 + randomInt(100, 500),
        conversions: 320 + randomInt(10, 50),
        ctr: 0.071 + Math.random() * 0.01,
        cpc: 0.34 + Math.random() * 0.1,
      },
      instagram: {
        impressions: 38000 + randomInt(1000, 5000),
        clicks: 2800 + randomInt(100, 500),
        conversions: 280 + randomInt(10, 50),
        ctr: 0.074 + Math.random() * 0.01,
        cpc: 0.38 + Math.random() * 0.1,
      },
      twitter: {
        impressions: 25000 + randomInt(1000, 5000),
        clicks: 1500 + randomInt(100, 500),
        conversions: 150 + randomInt(10, 50),
        ctr: 0.06 + Math.random() * 0.01,
        cpc: 0.28 + Math.random() * 0.1,
      },
      linkedin: {
        impressions: 18000 + randomInt(1000, 5000),
        clicks: 1200 + randomInt(100, 500),
        conversions: 120 + randomInt(10, 50),
        ctr: 0.067 + Math.random() * 0.01,
        cpc: 0.42 + Math.random() * 0.1,
      },
    },
    dailyData,
  };

  const analyticsRef = db.collection("analytics").doc("summary");
  batch.set(analyticsRef, analyticsData);
}

// Main function to generate all sample data
async function generateAllSampleData() {
  console.log("Starting sample data generation...");

  try {
    // Generate sample data for each collection
    await generateUsers();
    await generateContent();
    await generatePromotions();
    await generateActivities();
    await generateAnalyticsSummary();

    // Commit the batch
    await batch.commit();

    console.log("Sample data generation completed successfully!");
    console.log("Generated:");
    console.log("- 20 users (including 2 admin users)");
    console.log("- 30 content items");
    console.log("- 25 promotions");
    console.log("- 50 activity logs");
    console.log("- 1 analytics summary document with 30 days of data");

    // Write completion status to file
    fs.writeFileSync(
      path.join(__dirname, "sample-data-status.json"),
      JSON.stringify(
        {
          generated: true,
          timestamp: new Date().toISOString(),
          counts: {
            users: 20,
            content: 30,
            promotions: 25,
            activities: 50,
            analytics: 1,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Error generating sample data:", error);
    process.exit(1);
  }
}

// Check if sample data already exists
async function checkExistingData() {
  try {
    const collections = ["users", "content", "promotions", "activities", "analytics"];
    let allExist = true;

    for (const collection of collections) {
      const snapshot = await db.collection(collection).limit(1).get();
      if (snapshot.empty) {
        allExist = false;
        break;
      }
    }

    return allExist;
  } catch (error) {
    console.error("Error checking existing data:", error);
    return false;
  }
}

// Main execution
async function main() {
  try {
    // Check if data already exists
    const dataExists = await checkExistingData();

    if (dataExists) {
      console.log("Sample data already exists in the database.");
      console.log("If you want to regenerate the data, first delete the existing collections.");
      process.exit(0);
    }

    // Generate all sample data
    await generateAllSampleData();
  } catch (error) {
    console.error("Unhandled error:", error);
    process.exit(1);
  }
}

main();
