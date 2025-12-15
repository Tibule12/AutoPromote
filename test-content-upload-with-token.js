const http = require("http");

// This script demonstrates how to upload content using Firebase Auth tokens
// You'll need to get the ID token from your frontend or Firebase Auth

async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = "";
      res.on("data", chunk => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on("error", err => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testContentUpload() {
  console.log("🚀 Testing Content Upload with Firebase Auth Token...\n");

  // IMPORTANT: Replace this with your actual Firebase ID token
  // You can get this from:
  // 1. Your frontend application after user login
  // 2. Firebase Console -> Authentication -> Users -> Generate ID token
  // 3. Using Firebase Admin SDK to create a custom token

  const FIREBASE_ID_TOKEN = "YOUR_FIREBASE_ID_TOKEN_HERE"; // <-- REPLACE THIS

  if (FIREBASE_ID_TOKEN === "YOUR_FIREBASE_ID_TOKEN_HERE") {
    console.log("❌ Please replace YOUR_FIREBASE_ID_TOKEN_HERE with your actual Firebase ID token");
    console.log("\n📝 How to get a Firebase ID token:");
    console.log("1. Login to your frontend application");
    console.log("2. Open browser developer tools (F12)");
    console.log("3. Go to Application/Storage -> Local Storage");
    console.log("4. Look for firebaseLocalStorageDb or similar");
    console.log("5. Find the ID token in the stored auth data");
    console.log("\nOr use this curl command to login first:");
    console.log(`
curl -X POST http://localhost:5000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"idToken": "YOUR_ACTUAL_ID_TOKEN"}'
    `);
    return;
  }

  try {
    // Step 1: Verify the token works
    console.log("1. 🔐 Verifying Firebase ID token...");
    const loginOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    const loginData = {
      idToken: FIREBASE_ID_TOKEN,
    };

    const loginResponse = await makeRequest(loginOptions, loginData);

    if (loginResponse.status !== 200) {
      console.log("❌ Token verification failed:", loginResponse.data);
      return;
    }

    console.log("✅ Token verified successfully!");
    console.log("User:", loginResponse.data.user.email);
    console.log("Role:", loginResponse.data.user.role);

    // Step 2: Upload content
    console.log("\n2. 📤 Uploading content...");
    const uploadOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/content/upload",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIREBASE_ID_TOKEN}`,
      },
    };

    const contentData = {
      title: "Test Content Upload",
      type: "article",
      url: "https://example.com/test-content",
      description: "This is a test content upload to verify the API works",
      target_platforms: ["youtube", "tiktok"],
      scheduled_promotion_time: new Date(Date.now() + 86400000).toISOString(),
      promotion_frequency: "daily",
      target_rpm: 100000,
      min_views_threshold: 50000,
      max_budget: 200,
    };

    console.log("📝 Content data:", JSON.stringify(contentData, null, 2));

    const uploadResponse = await makeRequest(uploadOptions, contentData);

    console.log("\n📊 Upload Response:");
    console.log("Status:", uploadResponse.status);
    console.log("Response:", JSON.stringify(uploadResponse.data, null, 2));

    if (uploadResponse.status === 201) {
      console.log("\n🎉 SUCCESS! Content uploaded successfully!");
      console.log("Content ID:", uploadResponse.data.content?.id || "Check response above");
    } else {
      console.log("\n❌ Upload failed!");
      console.log("Error details:", uploadResponse.data);
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
}

// Instructions for the user
console.log("📋 CONTENT UPLOAD INSTRUCTIONS");
console.log("===============================");
console.log("");
console.log("To use the curl command you asked about, follow these steps:");
console.log("");
console.log("1. 🔑 GET YOUR FIREBASE ID TOKEN:");
console.log("   - Login to your frontend application");
console.log("   - Open browser dev tools (F12)");
console.log("   - Go to Application -> Local Storage");
console.log("   - Find firebase auth data and copy the ID token");
console.log("");
console.log("2. 🚀 USE THIS CURL COMMAND:");
console.log(`
curl -X POST http://localhost:5000/api/content/upload \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \\
  -d '{
    "title": "Your Content Title",
    "type": "article",
    "url": "https://example.com/content",
    "description": "Content description",
    "target_platforms": ["youtube"],
    "scheduled_promotion_time": "2025-09-04T00:00:00.000Z",
    "target_rpm": 100000,
    "max_budget": 500
  }'
`);
console.log("");
console.log("3. 📝 REQUIRED FIELDS:");
console.log("   - title (string)");
console.log("   - type (article, video, etc.)");
console.log("   - url (valid URL)");
console.log("   - description (string)");
console.log("   - target_platforms (array)");
console.log("   - scheduled_promotion_time (ISO date string)");
console.log("   - target_rpm (number)");
console.log("   - max_budget (number)");
console.log("");
console.log("4. 🔧 OPTIONAL FIELDS:");
console.log("   - promotion_frequency (daily, weekly, monthly)");
console.log("   - min_views_threshold (number)");
console.log("");

// Run the test (will show instructions if token not provided)
testContentUpload();
