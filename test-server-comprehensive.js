const http = require("http");
const net = require("net");
const fetch = require("node-fetch");

// Function to check if a port is in use
function checkPortInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer();

    server.once("error", err => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${port} is already in use.`);
        resolve(true);
      } else {
        console.log(`Error checking port ${port}:`, err.message);
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      console.log(`Port ${port} is available.`);
      resolve(false);
    });

    server.listen(port);
  });
}

// Function to test HTTP connectivity with Node.js http module
function testWithHttpModule(url) {
  return new Promise(resolve => {
    console.log(`Testing ${url} with Node.js http module...`);

    // Parse the URL
    const [, , host, ...pathParts] = url.match(/^(https?:\/\/)?([^\/]+)(.*)$/);
    const path = pathParts.join("") || "/";

    const options = {
      hostname: host,
      port: 5000,
      path,
      method: "GET",
      timeout: 3000,
    };

    const req = http.request(options, res => {
      let data = "";
      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        console.log(`✅ Response received with status: ${res.statusCode}`);
        try {
          const jsonData = JSON.parse(data);
          console.log("Response data:", jsonData);
        } catch (e) {
          console.log("Response data (not JSON):", data.substring(0, 100));
        }
        resolve(true);
      });
    });

    req.on("error", err => {
      console.log(`❌ Error with http module: ${err.message}`);
      resolve(false);
    });

    req.on("timeout", () => {
      console.log("❌ Request timed out");
      req.abort();
      resolve(false);
    });

    req.end();
  });
}

// Function to test HTTP connectivity with Node-Fetch
async function testWithFetch(url) {
  console.log(`Testing ${url} with node-fetch...`);
  try {
    const response = await fetch(url, { timeout: 3000 });
    console.log(`✅ Response received with status: ${response.status}`);

    try {
      const data = await response.json();
      console.log("Response data:", data);
    } catch (e) {
      const text = await response.text();
      console.log("Response data (not JSON):", text.substring(0, 100));
    }

    return true;
  } catch (error) {
    console.log(`❌ Error with node-fetch: ${error.message}`);
    return false;
  }
}

// Function to test opening a TCP socket directly
function testTcpSocket(host, port) {
  return new Promise(resolve => {
    console.log(`Testing direct TCP connection to ${host}:${port}...`);

    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on("connect", () => {
      console.log(`✅ TCP socket connected to ${host}:${port}`);
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      console.log(`❌ TCP socket connection timed out`);
      socket.destroy();
      resolve(false);
    });

    socket.on("error", err => {
      console.log(`❌ TCP socket error: ${err.message}`);
      resolve(false);
    });

    socket.connect(port, host);
  });
}

// Main test function
async function comprehensiveServerTest() {
  console.log("🔍 COMPREHENSIVE SERVER TEST");
  console.log("============================\n");

  // Check if port is in use
  console.log("1. Checking if port 5000 is already in use...");
  const portInUse = await checkPortInUse(5000);

  if (portInUse) {
    console.log(
      "⚠️ Port 5000 is already in use. This suggests another application is running on that port."
    );
    console.log("Your server might be running, but let's perform more tests to be certain.\n");
  } else {
    console.log(
      "✅ Port 5000 is available. If your server is supposed to be running, it might not be binding correctly.\n"
    );
  }

  // Test TCP connectivity
  console.log("2. Testing basic TCP connectivity...");
  const tcpWorks = await testTcpSocket("localhost", 5000);

  if (!tcpWorks) {
    console.log("❌ Could not establish a TCP connection to localhost:5000");
    console.log("This indicates the server is not listening on this port at all.\n");
  } else {
    console.log("✅ TCP connection successful! The server is listening on port 5000.\n");
  }

  // Test HTTP connectivity with different methods
  console.log("3. Testing HTTP connectivity using multiple methods...");

  const endpoints = [
    "http://localhost:5000/api/health",
    "http://localhost:5000/api",
    "http://localhost:5000/",
  ];

  let anyEndpointWorked = false;

  for (const endpoint of endpoints) {
    console.log(`\nTesting endpoint: ${endpoint}`);

    // Try with http module
    const httpWorks = await testWithHttpModule(endpoint);

    // If http module failed, try with node-fetch
    if (!httpWorks) {
      const fetchWorks = await testWithFetch(endpoint);
      if (fetchWorks) {
        anyEndpointWorked = true;
      }
    } else {
      anyEndpointWorked = true;
    }
  }

  // Final assessment
  console.log("\n============================");
  console.log("CONNECTIVITY TEST RESULTS");
  console.log("============================");

  if (portInUse && !tcpWorks) {
    console.log("❌ MAJOR ISSUE: Port 5000 is in use but not by your server.");
    console.log("Recommendation: Use a different port for your server.");
  } else if (!portInUse && !tcpWorks) {
    console.log("❌ MAJOR ISSUE: Server is not binding to port 5000 correctly.");
    console.log("Recommendation: Check server logs for binding errors.");
  } else if (tcpWorks && !anyEndpointWorked) {
    console.log(
      "⚠️ PARTIAL ISSUE: Server is listening on port 5000 but HTTP requests are failing."
    );
    console.log("Recommendation: Check your Express routes and middleware.");
  } else if (anyEndpointWorked) {
    console.log("✅ SUCCESS: Server is fully operational!");
  }

  console.log("\nNote: This test attempts to establish both direct TCP connections and");
  console.log("HTTP connections. If only TCP works, your server might be listening but");
  console.log("the HTTP layer (Express) might have issues handling requests.");
}

// Run the test
comprehensiveServerTest();
