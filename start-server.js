const { spawn } = require("child_process");
const path = require("path");

// Load environment variables first
require("dotenv").config();

// Check if required environment variables are set
const requiredEnvVars = ["JWT_SECRET", "FIREBASE_SERVICE_ACCOUNT"];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error("💡 Please check your .env file and ensure all required variables are set.");
  process.exit(1);
}

console.log("✅ All required environment variables are set!");
console.log("Starting server...");

// Start the server
const server = spawn("node", ["server.js"], {
  stdio: "inherit",
  env: { ...process.env }, // Pass all environment variables
});

server.on("close", code => {
  console.log(`Server process exited with code ${code}`);
});
