const fetch = require("node-fetch");

async function testAuthMiddleware() {
  try {
    console.log("Testing auth middleware with custom token...");

    // First, get a custom token from login
    const loginResponse = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "tmtshwelo21@gmail.com",
        password: "Thulani1205@",
      }),
    });

    const loginData = await loginResponse.json();
    console.log("Login response:", JSON.stringify(loginData, null, 2));

    if (!loginData.token) {
      console.log("❌ No token received from login");
      return;
    }

    // Now try to use the custom token directly in auth middleware
    console.log("\nTesting auth middleware with custom token...");
    const authResponse = await fetch("http://localhost:5000/api/users/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${loginData.token}`,
        "Content-Type": "application/json",
      },
    });

    const authData = await authResponse.json();
    console.log(
      "Auth middleware response:",
      authResponse.status,
      JSON.stringify(authData, null, 2)
    );

    if (authResponse.status === 401) {
      console.log("✅ Auth middleware correctly rejected custom token");
    } else {
      console.log("❌ Auth middleware accepted custom token (this should not happen)");
    }
  } catch (error) {
    console.error("Test error:", error.message);
  }
}

testAuthMiddleware();
