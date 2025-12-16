const { auth, db } = require("./firebaseAdmin");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { app } = require("./firebaseClient");
const fetch = require("node-fetch");

/**
 * This script tests admin authentication and API access
 * after setting up the dedicated admins collection
 */
async function testAdminSetup() {
  try {
    console.log("===== ADMIN SETUP TEST =====");

    // 1. Run the admin setup to ensure collections exist
    console.log("\n1. Setting up admin collections...");
    const { setupAdminCollection } = require("./setup-admin-collection");
    await setupAdminCollection();

    // 2. Verify admin exists in Firebase Auth
    console.log("\n2. Verifying admin user in Firebase Auth...");
    const adminEmail = "admin@autopromote.com";
    try {
      const userRecord = await auth.getUserByEmail(adminEmail);
      console.log(`Admin user found in Authentication with UID: ${userRecord.uid}`);
      console.log("Admin user custom claims:", JSON.stringify(userRecord.customClaims, null, 2));
    } catch (error) {
      console.error("Error getting admin user:", error);
      return;
    }

    // 3. Verify admin exists in admins collection
    console.log("\n3. Verifying admin document in admins collection...");
    try {
      const adminSnapshot = await db.collection("admins").where("email", "==", adminEmail).get();

      if (adminSnapshot.empty) {
        console.error("No admin document found in admins collection");
        return;
      }

      const adminDoc = adminSnapshot.docs[0];
      console.log(`Admin document found with ID: ${adminDoc.id}`);
      console.log("Admin document data:", JSON.stringify(adminDoc.data(), null, 2));
    } catch (error) {
      console.error("Error checking admin document:", error);
      return;
    }

    // 4. Test client-side login
    console.log("\n4. Testing client-side login...");
    const clientAuth = getAuth(app);
    try {
      const userCredential = await signInWithEmailAndPassword(
        clientAuth,
        adminEmail,
        "AdminPass123!"
      );

      console.log("Login successful with user:", userCredential.user.email);

      // Get ID token for API testing
      const idToken = await userCredential.user.getIdToken(true);
      console.log("ID token received, length:", idToken.length);

      // 5. Test API access with token
      console.log("\n5. Testing admin API access...");
      const apiResponse = await fetch("http://localhost:5001/api/admin/analytics/overview", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      console.log("API response status:", apiResponse.status);

      if (apiResponse.status === 200) {
        const apiData = await apiResponse.json();
        console.log("API access successful!");
        console.log("Is mock data:", apiData.isMockData === true ? "Yes" : "No");
      } else {
        console.error("API access failed");
        try {
          const errorData = await apiResponse.json();
          console.error("Error details:", errorData);
        } catch (e) {
          console.error("Could not parse error response");
        }
      }

      console.log("\n===== TEST COMPLETED =====");
    } catch (loginError) {
      console.error("Login failed:", loginError);
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testAdminSetup();
