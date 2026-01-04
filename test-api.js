const axios = require("axios");

// Use environment variable for base URL or default to localhost
const BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}/api`;

async function testAPI() {
  console.log("Testing AutoPromote API endpoints...\n");
  console.log(`Using base URL: ${BASE_URL}`);

  let testPassed = true;

  try {
    // Test root endpoint
    console.log("1. Testing root endpoint...");
    const rootResponse = await axios.get(`${BASE_URL}/`);
    console.log("✓ Root endpoint:", rootResponse.data);
  } catch (error) {
    console.log("✗ Root endpoint error:", error.message);
    testPassed = false;
  }

  try {
    // Test user registration
    console.log("\n2. Testing user registration...");
    const userData = {
      name: "Test User",
      email: "newtest@example.com",
      password: "password123",
      role: "creator",
    };
    const registerResponse = await axios.post(`${API_URL}/auth/register`, userData);
    console.log("✓ User registered:", registerResponse.data);
  } catch (error) {
    console.log("✗ User registration error:", error.response?.data?.message || error.message);
    // Don't fail the test for "user already exists" as this is expected
    if (!error.response?.data?.message?.includes("already exists")) {
      testPassed = false;
    }
  }

  try {
    // Test user login
    console.log("\n3. Testing user login...");
    const loginData = {
      email: "test@example.com",
      password: "password123",
    };
    const loginResponse = await axios.post(`${API_URL}/auth/login`, loginData);
    console.log("✓ User logged in:", loginResponse.data);
  } catch (error) {
    console.log("✗ User login error:", error.response?.data?.message || error.message);
    testPassed = false;
  }

  try {
    // Test getting all content
    console.log("\n4. Testing get all content...");
    const contentResponse = await axios.get(`${API_URL}/content`);
    console.log("✓ Content retrieved:", contentResponse.data);
  } catch (error) {
    console.log("✗ Get content error:", error.response?.data?.message || error.message);
    testPassed = false;
  }

  console.log("\nAPI test completed!");

  if (!testPassed) {
    console.log("❌ Some tests failed");
    process.exit(1);
  } else {
    console.log("✅ All tests passed!");
    process.exit(0);
  }
}

// Start the test
testAPI().catch(error => {
  console.error("Test execution error:", error.message);
  process.exit(1);
});
