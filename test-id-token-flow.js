const fetch = require("node-fetch");

async function testIdTokenFlow() {
  try {
    console.log("Testing ID token flow...");

    // First, get an ID token from login (using ID token method)
    const loginResponse = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken:
          "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg5ZjE5ZWJmN2M5M2Y4ODUwN2U5NzE4ZjE5ZWJmN2M5M2Y4ODUwN2U5NzE4IiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vYXV0b3Byb21vdGUtNDY0ZGUiLCJhdWQiOiJhdXRvcHJvbW90ZS00NjRkZSIsImF1dGhfdGltZSI6MTc1Njk4MTA1NSwidXNlcl9pZCI6IkkzODFReUgzWmhWQzgzZ3pXMnpCc1pQV2xzMiIsInN1YiI6IkkzODFReUgzWmhWQzgzZ3pXMnpCc1pQV2xzMiIsImlhdCI6MTc1Njk4MTA1NSwiZXhwIjoxNzU2OTg0NjU1LCJlbWFpbCI6InRtdHNod2VsbzIxQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbInRtdHNod2VsbzIxQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg5ZjE5ZWJmN2M5M2Y4ODUwN2U5NzE4ZjE5ZWJmN2M5M2Y4ODUwN2U5NzE4IiwidHlwIjoiSldUIn0", // This is a sample ID token - in real app this would come from Firebase Auth
      }),
    });

    const loginData = await loginResponse.json();
    console.log("ID Token login response:", JSON.stringify(loginData, null, 2));

    if (!loginData.token) {
      console.log("❌ No token received from ID token login");
      return;
    }

    // Now try to use the ID token in auth middleware
    console.log("\nTesting auth middleware with ID token...");
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

    if (authResponse.status === 200) {
      console.log("✅ Auth middleware correctly accepted ID token");
    } else {
      console.log("❌ Auth middleware rejected ID token");
    }
  } catch (error) {
    console.error("Test error:", error.message);
  }
}

testIdTokenFlow();
