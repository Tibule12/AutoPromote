const express = require("express");
const router = express.Router();
const { auth, db } = require("./firebaseAdmin");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { app } = require("./firebaseClient");

// Setup admin collection
router.post("/setup-admin", async (req, res) => {
  try {
    console.log("Setting up admin collection...");

    // Get existing setup function or create a simpler version if not available
    let setupAdminCollection;
    try {
      // Try to import the full setup function
      setupAdminCollection = require("./setup-admin-collection").setupAdminCollection;
    } catch (importError) {
      console.log("Could not import setup-admin-collection.js, using simple setup");
      // Simple setup function as fallback
      setupAdminCollection = async () => {
        // Admin user credentials
        const adminEmail = "admin123@gmail.com";
        const adminPassword = "Admin12345";
        const adminName = "System Administrator";

        // Check if admin user exists in Auth
        try {
          const userRecord = await auth.getUserByEmail(adminEmail);
          console.log("Admin user already exists in Auth:", userRecord.uid);

          // Set admin custom claims
          await auth.setCustomUserClaims(userRecord.uid, {
            admin: true,
            role: "admin",
          });

          // Create or update admin document
          await db.collection("admins").doc(userRecord.uid).set(
            {
              uid: userRecord.uid,
              email: adminEmail,
              name: adminName,
              role: "admin",
              isAdmin: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );

          return {
            success: true,
            message: "Admin user updated",
            uid: userRecord.uid,
          };
        } catch (error) {
          if (error.code === "auth/user-not-found") {
            // Create new admin user
            const newUser = await auth.createUser({
              email: adminEmail,
              password: adminPassword,
              displayName: adminName,
              emailVerified: true,
            });

            // Set admin claims
            await auth.setCustomUserClaims(newUser.uid, {
              admin: true,
              role: "admin",
            });

            // Create admin document
            await db.collection("admins").doc(newUser.uid).set({
              uid: newUser.uid,
              email: adminEmail,
              name: adminName,
              role: "admin",
              isAdmin: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            return {
              success: true,
              message: "Admin user created",
              uid: newUser.uid,
            };
          } else {
            throw error;
          }
        }
      };
    }

    // Run the setup function
    const result = await setupAdminCollection();

    res.json({
      success: true,
      message: "Admin collection setup completed",
      details: result,
    });
  } catch (error) {
    console.error("Error setting up admin collection:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test admin login
router.post("/auth/login-test", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("Testing admin login with:", email);

    // Get client Auth instance
    const clientAuth = getAuth(app);

    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(clientAuth, email, password);
    const user = userCredential.user;

    console.log("Firebase Auth login successful for:", user.email);

    // Get ID token
    const idToken = await user.getIdToken(true);

    // Verify token on server side
    const decodedToken = await auth.verifyIdToken(idToken);

    // Check if user is in admins collection
    const adminDoc = await db.collection("admins").doc(decodedToken.uid).get();
    const isAdminInCollection = adminDoc.exists;

    let userData = {};
    let fromCollection = null;

    if (isAdminInCollection) {
      userData = adminDoc.data();
      fromCollection = "admins";

      // Update last login time
      await db.collection("admins").doc(decodedToken.uid).update({
        lastLogin: new Date().toISOString(),
      });

      console.log("Admin found in admins collection");
    } else {
      // Check regular users collection
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();

      if (userDoc.exists) {
        userData = userDoc.data();
        fromCollection = "users";
        console.log("User found in users collection");
      } else {
        console.log("User not found in any collection");
      }
    }

    // Return user data and token
    res.json({
      success: true,
      message: "Login successful",
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: userData.name || decodedToken.name || email.split("@")[0],
        role: userData.role || (decodedToken.admin ? "admin" : "user"),
        isAdmin: userData.isAdmin === true || decodedToken.admin === true,
        fromCollection,
      },
      token: idToken,
    });
  } catch (error) {
    console.error("Login test error:", error);
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
});

// Trigger Protocol 7 Watchdog (Manual Cron)
router.post("/run-protocol-7-watchdog", async (req, res) => {
  try {
    const viralInsuranceService = require('./src/services/viralInsuranceService');
    const results = await viralInsuranceService.runWatchdog();
    res.json({ success: true, results });
  } catch (error) {
    console.error("Watchdog failed:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
