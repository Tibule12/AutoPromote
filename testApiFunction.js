const { admin } = require("./firebaseAdmin");
const fetch = require("node-fetch");

async function testApiFunction() {
  try {
    console.log("Generating Firebase Authentication token...");

    // Generate a custom token
    const customToken = await admin.auth().createCustomToken("test-user");
    console.log("Custom token generated:", customToken);

    // Exchange the custom token for an ID token
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyBA9It1gCyKBpqAhGM5TxwdNoe68c3qEBE",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    );

    const data = await response.json();
    console.log("Token exchange response:", data); // Log the entire response for debugging

    const idToken = data.idToken;
    console.log("ID token obtained:", idToken);

    // Test the API function with the ID token
    const apiResponse = await fetch(
      "https://us-central1-autopromote-cc6d3.cloudfunctions.net/api",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      }
    );

    const apiData = await apiResponse.text();
    console.log("API function response:", apiData);
  } catch (error) {
    console.error("Error testing API function:", error);
  }
}

testApiFunction();
