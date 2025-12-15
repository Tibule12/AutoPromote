// check-connection.js
// This script checks if we can connect to the backend server

const fetch = require("node-fetch");

async function checkBackendConnection() {
  try {
    console.log("Checking backend connection at http://localhost:5000/api/health...");
    const response = await fetch("http://localhost:5000/api/health");

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Connected to backend successfully!");
      console.log("Response:", JSON.stringify(data, null, 2));
      return true;
    } else {
      console.log("❌ Backend responded with status:", response.status);
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to connect to backend:", error.message);
    return false;
  }
}

checkBackendConnection().then(success => {
  if (!success) {
    console.log("\nPlease make sure your backend server is running on port 5000.");
    console.log("Try running: node server.js");
  }
});
