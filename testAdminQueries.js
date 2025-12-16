// testAdminQueries.js
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

// Ensure test results directory exists
const resultsDir = path.join(__dirname, "test-results");
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir);
}

// Helper to write results to file
function writeResultsToFile(results) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(resultsDir, `admin-queries-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${filePath}`);
}

// Define admin dashboard queries to test
const adminQueries = [
  {
    name: "Recent Users",
    description: "Fetches recently created users",
    query: () => db.collection("users").orderBy("createdAt", "desc").limit(10).get(),
    validate: snapshot => snapshot.size > 0,
  },
  {
    name: "Admin Users",
    description: "Fetches users with admin privileges",
    query: () => db.collection("users").where("isAdmin", "==", true).get(),
    validate: snapshot => snapshot.size > 0,
  },
  {
    name: "Top Content",
    description: "Fetches content with highest view counts",
    query: () => db.collection("content").orderBy("views", "desc").limit(5).get(),
    validate: snapshot => snapshot.size > 0,
  },
  {
    name: "Active Promotions",
    description: "Fetches currently active promotions",
    query: () => db.collection("promotions").where("status", "==", "active").get(),
    validate: snapshot => true, // We don't require active promotions to exist
  },
  {
    name: "Recent Activities",
    description: "Fetches recent user activities",
    query: () => db.collection("activities").orderBy("timestamp", "desc").limit(20).get(),
    validate: snapshot => snapshot.size > 0,
  },
  {
    name: "Analytics Summary",
    description: "Fetches analytics summary document",
    query: () => db.collection("analytics").doc("summary").get(),
    validate: doc => doc.exists,
  },
  {
    name: "User Types Distribution",
    description: "Aggregates users by type",
    query: async () => {
      const snapshot = await db.collection("users").get();
      const types = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        types[data.userType] = (types[data.userType] || 0) + 1;
      });
      return types;
    },
    validate: result => Object.keys(result).length > 0,
  },
  {
    name: "Platform Performance",
    description: "Fetches promotion metrics by platform",
    query: async () => {
      const snapshot = await db.collection("promotions").get();
      const platforms = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!platforms[data.platform]) {
          platforms[data.platform] = {
            count: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
          };
        }
        platforms[data.platform].count++;
        platforms[data.platform].impressions += data.impressions || 0;
        platforms[data.platform].clicks += data.clicks || 0;
        platforms[data.platform].conversions += data.conversions || 0;
      });
      return platforms;
    },
    validate: result => Object.keys(result).length > 0,
  },
];

// Run all the queries and collect results
async function runAllQueries() {
  console.log("Testing admin dashboard queries...");

  const results = {
    timestamp: new Date().toISOString(),
    passed: [],
    failed: [],
  };

  for (const queryTest of adminQueries) {
    try {
      console.log(`Running query: ${queryTest.name}`);
      const result = await queryTest.query();

      // Handle different result types (snapshot vs custom data)
      let isValid;
      let data;

      if (result instanceof admin.firestore.QuerySnapshot) {
        isValid = queryTest.validate(result);
        data = result.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`  Retrieved ${result.size} documents`);
      } else if (result instanceof admin.firestore.DocumentSnapshot) {
        isValid = queryTest.validate(result);
        data = result.exists ? result.data() : null;
        console.log(`  Document ${result.exists ? "exists" : "does not exist"}`);
      } else {
        // Custom query result (like aggregations)
        isValid = queryTest.validate(result);
        data = result;
        console.log(`  Custom query executed`);
      }

      if (isValid) {
        console.log(`  ✅ Query validated successfully`);
        results.passed.push({
          name: queryTest.name,
          description: queryTest.description,
          data: data,
        });
      } else {
        console.log(`  ❌ Query failed validation`);
        results.failed.push({
          name: queryTest.name,
          description: queryTest.description,
          error: "Failed validation check",
        });
      }
    } catch (error) {
      console.error(`  ❌ Error running query ${queryTest.name}:`, error);
      results.failed.push({
        name: queryTest.name,
        description: queryTest.description,
        error: error.message,
      });
    }
  }

  // Print summary
  console.log("\n=== QUERY TEST SUMMARY ===");
  console.log(`Total Queries: ${adminQueries.length}`);
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);

  // Write results to file
  writeResultsToFile(results);

  // Exit with appropriate code
  const success = results.failed.length === 0;
  process.exit(success ? 0 : 1);
}

// Run all the tests
runAllQueries().catch(error => {
  console.error("Unhandled error during tests:", error);
  process.exit(1);
});
