const http = require("http");

async function testContentUploadEndpoint() {
  console.log("🧪 Testing Content Upload Endpoint...\n");

  // Test 1: Valid content upload
  console.log("1. Testing valid content upload:");
  const validData = JSON.stringify({
    title: "Test Article with Validation",
    type: "article",
    url: "https://example.com/test-article",
    description: "This is a test article to verify validation works",
    target_platforms: ["youtube", "tiktok"],
    scheduled_promotion_time: new Date(Date.now() + 86400000).toISOString(),
    promotion_frequency: "daily",
    target_rpm: 100000,
    min_views_threshold: 50000,
    max_budget: 200,
  });

  const options = {
    hostname: "localhost",
    port: 5000,
    path: "/api/content/upload",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(validData),
      // Note: In a real scenario, you'd need to include authentication headers
      // For this test, we'll see what happens without auth
    },
  };

  const req = http.request(options, res => {
    console.log("   Status:", res.statusCode);
    console.log("   Headers:", res.headers);

    let data = "";
    res.on("data", chunk => {
      data += chunk;
    });

    res.on("end", () => {
      try {
        const response = JSON.parse(data);
        console.log("   Response:", response);
      } catch (e) {
        console.log("   Raw Response:", data);
      }
    });
  });

  req.on("error", e => {
    console.error("   Error:", e.message);
  });

  req.write(validData);
  req.end();

  // Test 2: Invalid content upload (after a delay)
  setTimeout(() => {
    console.log("\n2. Testing invalid content upload:");
    const invalidData = JSON.stringify({
      title: null, // Invalid: null value
      type: "invalid-type", // Invalid: wrong type
      url: "not-a-valid-url", // Invalid: malformed URL
      target_rpm: "not-a-number", // Invalid: wrong type
    });

    const invalidOptions = {
      hostname: "localhost",
      port: 5000,
      path: "/api/content/upload",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(invalidData),
      },
    };

    const invalidReq = http.request(invalidOptions, res => {
      console.log("   Status:", res.statusCode);

      let data = "";
      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          console.log("   Response:", response);
          if (response.error === "Validation failed") {
            console.log("   ✅ Validation properly rejected invalid data");
          }
        } catch (e) {
          console.log("   Raw Response:", data);
        }
      });
    });

    invalidReq.on("error", e => {
      console.error("   Error:", e.message);
    });

    invalidReq.write(invalidData);
    invalidReq.end();
  }, 1000);
}

testContentUploadEndpoint();
