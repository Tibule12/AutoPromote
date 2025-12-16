const fetch = require("node-fetch");

async function testAdminLogin() {
  try {
    console.log("Testing admin login...");
    const response = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin123@gmail.com",
        password: "Admin12345",
      }),
    });

    const data = await response.json();
    console.log("Admin login response:", data);

    if (data.token) {
      // Now test an admin endpoint with this token
      console.log("\nTesting admin analytics endpoint with token...");
      const analyticsResponse = await fetch("http://localhost:5000/api/admin/analytics/overview", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.token}`,
        },
      });

      const analyticsData = await analyticsResponse.json();
      console.log("Admin analytics response status:", analyticsResponse.status);
      console.log("Admin analytics response data:", analyticsData);
    }
  } catch (error) {
    console.error("Error during admin login test:", error);
  }
}

testAdminLogin();
