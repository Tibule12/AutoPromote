// server-check.js
// This script checks if the server is running and starts it if needed

const http = require("http");
const { exec } = require("child_process");
const path = require("path");

// Function to check if server is running
const checkServer = () => {
  return new Promise(resolve => {
    const req = http.get("http://localhost:5001/api/health", res => {
      if (res.statusCode === 200) {
        console.log("✅ Server is already running on port 5001");
        resolve(true);
      } else {
        console.log("❌ Server returned unexpected status:", res.statusCode);
        resolve(false);
      }
    });

    req.on("error", () => {
      console.log("❌ Server is not running on port 5001");
      resolve(false);
    });

    req.end();
  });
};

// Function to start the server
const startServer = () => {
  console.log("🚀 Starting server...");

  const serverProcess = exec("node server.js", {
    cwd: path.resolve(__dirname),
  });

  serverProcess.stdout.on("data", data => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on("data", data => {
    console.error(`Server Error: ${data}`);
  });

  console.log("Server started in background. Check for messages above.");
};

// Main function
const main = async () => {
  const isServerRunning = await checkServer();

  if (!isServerRunning) {
    startServer();
  }
};

main().catch(err => {
  console.error("Error:", err);
});
