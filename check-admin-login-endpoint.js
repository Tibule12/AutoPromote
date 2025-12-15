// check-admin-login-endpoint.js
// Script to check if we can connect to the admin-login endpoint

const http = require("http");

// Test admin login endpoint
console.log("Testing admin login endpoint...");

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/auth/admin-login",
  method: "OPTIONS",
  headers: {
    Origin: "http://localhost:3000",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Content-Type, Authorization, Accept, Origin",
  },
};

const req = http.request(options, res => {
  console.log("Preflight Status Code:", res.statusCode);
  console.log("Preflight Headers:", JSON.stringify(res.headers, null, 2));

  // Check CORS headers for preflight
  if (res.statusCode === 204 || res.statusCode === 200) {
    console.log("✅ Preflight response status code is correct");
  } else {
    console.log("❌ Preflight response status code should be 204 or 200, but got", res.statusCode);
  }

  if (res.headers["access-control-allow-origin"]) {
    console.log(
      "✅ CORS is properly configured for preflight with Access-Control-Allow-Origin header"
    );
  } else {
    console.log('❌ CORS header "Access-Control-Allow-Origin" is missing in preflight!');
  }

  if (res.headers["access-control-allow-methods"]) {
    console.log(
      "✅ CORS is properly configured for preflight with Access-Control-Allow-Methods header"
    );
    console.log("  Methods allowed:", res.headers["access-control-allow-methods"]);
  } else {
    console.log('❌ CORS header "Access-Control-Allow-Methods" is missing in preflight!');
  }

  if (res.headers["access-control-allow-headers"]) {
    console.log(
      "✅ CORS is properly configured for preflight with Access-Control-Allow-Headers header"
    );
    console.log("  Headers allowed:", res.headers["access-control-allow-headers"]);
  } else {
    console.log('❌ CORS header "Access-Control-Allow-Headers" is missing in preflight!');
  }

  res.on("data", () => {});
  res.on("end", () => {
    console.log("\nAdmin login endpoint check completed.");
  });
});

req.on("error", e => {
  console.error("Error:", e.message);
});

req.end();
