// check-cors.js
// Script to test CORS configuration of the backend server

const http = require("http");

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/health",
  method: "GET",
  headers: {
    Origin: "http://localhost:3000",
    Accept: "application/json",
  },
};

const req = http.request(options, res => {
  console.log("Status Code:", res.statusCode);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));

  // Check CORS headers
  if (res.headers["access-control-allow-origin"]) {
    console.log("\n✅ CORS is properly configured with Access-Control-Allow-Origin header");
  } else {
    console.log('\n❌ CORS header "Access-Control-Allow-Origin" is missing!');
  }

  if (res.headers["access-control-allow-methods"]) {
    console.log("✅ CORS is properly configured with Access-Control-Allow-Methods header");
  } else {
    console.log('❌ CORS header "Access-Control-Allow-Methods" is missing!');
  }

  if (res.headers["access-control-allow-headers"]) {
    console.log("✅ CORS is properly configured with Access-Control-Allow-Headers header");
  } else {
    console.log('❌ CORS header "Access-Control-Allow-Headers" is missing!');
  }

  let data = "";
  res.on("data", chunk => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("\nResponse Data:", data);
  });
});

req.on("error", e => {
  console.error("Error:", e.message);
});

req.end();

// Now test with OPTIONS request (preflight)
const optionsReq = http.request(
  {
    ...options,
    method: "OPTIONS",
  },
  res => {
    console.log("\n--- OPTIONS (Preflight) Request ---");
    console.log("Status Code:", res.statusCode);
    console.log("Headers:", JSON.stringify(res.headers, null, 2));

    if (res.statusCode === 204 || res.statusCode === 200) {
      console.log("✅ Preflight response status code is correct");
    } else {
      console.log(
        "❌ Preflight response status code should be 204 or 200, but got",
        res.statusCode
      );
    }

    res.on("data", () => {});
    res.on("end", () => {
      console.log("\nCORS check completed.");
    });
  }
);

optionsReq.on("error", e => {
  console.error("Error in preflight request:", e.message);
});

optionsReq.end();
