// test-backend-connection.js
const fetch = require("node-fetch");

async function testBackendConnection() {
  try {
    console.log("Testing backend connection at http://localhost:5001/api/health...");

    const response = await fetch("http://localhost:5001/api/health");

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Backend is accessible!");
      console.log("Response:", JSON.stringify(data, null, 2));
    } else {
      console.log("❌ Backend returned error status:", response.status);
      console.log("Error:", await response.text());
    }
  } catch (error) {
    console.error("❌ Failed to connect to backend:", error.message);
  }
}

testBackendConnection();
