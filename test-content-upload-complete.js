const http = require("http");

// Test user credentials
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "Test123!";

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

async function testContentUploadFlow() {
  console.log("🚀 Testing Complete Content Upload Flow...\n");

  try {
    // Step 1: Login to get JWT token
    console.log("1. 🔐 Logging in to get JWT token...");
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
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    };

    const loginResponse = await makeRequest(loginOptions, loginData);

    if (loginResponse.status !== 200) {
      console.log("❌ Login failed. Creating test user first...");

      // Create test user
      console.log("2. 👤 Creating test user...");
      const createUserOptions = {
        hostname: "localhost",
        port: 5000,
        path: "/api/auth/register",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const userData = {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: "Test User",
      };

      const createResponse = await makeRequest(createUserOptions, userData);

      if (createResponse.status !== 201) {
        console.log("❌ User creation failed:", createResponse.data);
        return;
      }

      console.log("✅ Test user created successfully");

      // Try login again
      const retryLoginResponse = await makeRequest(loginOptions, loginData);
      if (retryLoginResponse.status !== 200) {
        console.log("❌ Login still failed:", retryLoginResponse.data);
        return;
      }
      var token = retryLoginResponse.data.token;
    } else {
      var token = loginResponse.data.token;
    }

    console.log("✅ Login successful! JWT token obtained\n");

    // Step 2: Upload content
    console.log("2. 📤 Uploading content...");
    const uploadOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/content/upload",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };

    const contentData = {
      title: "My First Content Upload",
      type: "article",
      url: "https://example.com/my-article",
      description: "This is a test article to demonstrate the upload functionality",
      target_platforms: ["youtube", "tiktok"],
      scheduled_promotion_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
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
    }

    // Step 3: Fetch user's content to verify
    console.log("\n3. 📋 Fetching user content to verify...");
    const fetchOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/content/user",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    const fetchResponse = await makeRequest(fetchOptions);

    console.log("\n📊 Fetch Response:");
    console.log("Status:", fetchResponse.status);
    if (fetchResponse.status === 200) {
      console.log("✅ Content retrieved successfully!");
      console.log("Number of content items:", fetchResponse.data.length || 0);
      if (fetchResponse.data.length > 0) {
        console.log("Latest content:", JSON.stringify(fetchResponse.data[0], null, 2));
      }
    } else {
      console.log("❌ Fetch failed:", fetchResponse.data);
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
}

// Run the test
testContentUploadFlow();
