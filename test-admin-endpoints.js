const fetch = require("node-fetch");
const admin = require("firebase-admin");
const fs = require("fs");

async function testAdminEndpoints() {
  const results = {
    adminLogin: null,
    overview: null,
    users: null,
    content: null,
    platformPerformance: null,
    revenueTrends: null,
    promotionPerformance: null,
    optimizationRecommendations: null,
  };

  try {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const serviceAccount = require("./serviceAccountKey.json");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://autopromote-cc6d3.firebaseio.com",
      });
    }

    console.log("1. Testing admin login...");

    // For testing purposes, we'll create a mock ID token with admin claims
    // In a real scenario, this would come from Firebase Auth SDK after signing in with custom token
    const mockIdToken =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRvcHJvbW90ZS00NjRkZSIsImlhdCI6MTY4MzYwMDAwMCwiZXhwIjoxNjgzNjg2NDAwLCJpc3MiOiJmaXJlYmFzZS1hZG1pbnNkay1mYnN2Y0BhdXRvcHJvbW90ZS00NjRkZS5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsInN1YiI6InQxS085TlZnU3FQb2M3YkpBbGpaN2p5WEJnMSIsInVpZCI6InQxS085TlZnU3FQb2M3YkpBbGpaN2p5WEJnMSIsImVtYWlsIjoidGVzdGFkbWluQGV4YW1wbGUuY29tIiwibmFtZSI6IlRlc3QgQWRtaW4iLCJhZG1pbiI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.mock_signature";

    const loginResponse = await fetch("http://localhost:5000/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: mockIdToken,
      }),
    });

    const loginData = await loginResponse.json();
    results.adminLogin = {
      status: loginResponse.status,
      data: loginData,
    };
    console.log("Admin login status:", loginResponse.status);

    if (loginData.token) {
      const token = loginData.token;

      // Test all admin endpoints
      const endpoints = [
        { name: "overview", path: "/api/admin/analytics/overview" },
        { name: "users", path: "/api/admin/analytics/users" },
        { name: "content", path: "/api/admin/analytics/content" },
        { name: "platformPerformance", path: "/api/admin/analytics/platform-performance" },
        { name: "revenueTrends", path: "/api/admin/analytics/revenue-trends" },
        { name: "promotionPerformance", path: "/api/admin/analytics/promotion-performance" },
        {
          name: "optimizationRecommendations",
          path: "/api/admin/analytics/optimization-recommendations",
        },
      ];

      for (const endpoint of endpoints) {
        console.log(`\n2. Testing ${endpoint.name} endpoint...`);
        try {
          const response = await fetch(`http://localhost:5000${endpoint.path}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });

          const data = await response.json();
          results[endpoint.name] = {
            status: response.status,
            isMockData: data.isMockData || false,
            dataSnapshot: truncateData(data),
          };

          console.log(`${endpoint.name} status:`, response.status);
          console.log(`${endpoint.name} is mock data:`, data.isMockData || false);
        } catch (error) {
          console.error(`Error testing ${endpoint.name}:`, error.message);
          results[endpoint.name] = { error: error.message };
        }
      }
    }
  } catch (error) {
    console.error("Error during admin endpoint tests:", error);
    results.error = error.message;
  }

  // Write results to file
  fs.writeFileSync("admin-endpoints-test-results.json", JSON.stringify(results, null, 2));
  console.log("\nTest results saved to admin-endpoints-test-results.json");
}

function truncateData(data) {
  // Create a shallow copy to avoid modifying the original
  const truncated = { ...data };

  // For arrays, keep only first 2 items
  Object.keys(truncated).forEach(key => {
    if (Array.isArray(truncated[key]) && truncated[key].length > 2) {
      truncated[key] = truncated[key].slice(0, 2);
      truncated[key].push({ note: `... ${truncated[key].length - 2} more items truncated` });
    } else if (typeof truncated[key] === "object" && truncated[key] !== null) {
      truncated[key] = truncateData(truncated[key]);
    }
  });

  return truncated;
}

testAdminEndpoints();
