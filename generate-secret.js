#!/usr/bin/env node
// Utility script to generate a strong JWT secret
const crypto = require("crypto");

console.log("🔒 Generating a strong JWT secret...");
console.log("");

// Generate a 32-byte (256-bit) random secret
const secret = crypto.randomBytes(32).toString("hex");

console.log("✅ Your new JWT_SECRET:");
console.log("");
console.log(`JWT_SECRET=${secret}`);
console.log("");
console.log("📋 Copy this value to your .env file");
console.log("💡 Make sure to keep this secret secure and never commit it to version control!");
console.log("");
console.log("⚠️  Warning: If you change the JWT_SECRET, all existing tokens will become invalid!");
