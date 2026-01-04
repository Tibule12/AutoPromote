const { auth, db } = require("./firebaseAdmin");

async function createUserAccount() {
  try {
    const email = "tmtshwelo21@gmail.com";
    const password = "Tibule";
    const name = "Tulani Mtshwelo";

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: name,
      emailVerified: true,
    });

    // Store additional user data in Firestore
    await db.collection("users").doc(userRecord.uid).set({
      name: name,
      email: email,
      role: "user", // You can change this to 'admin' if needed
      createdAt: new Date().toISOString(),
    });

    console.log("✅ User account created successfully");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("User ID:", userRecord.uid);
    console.log("Role: user");
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      // If user exists, update their password
      console.log("User already exists, updating password...");
      const user = await auth.getUserByEmail("tmtshwelo21@gmail.com");

      // Update password
      await auth.updateUser(user.uid, {
        password: "Tibule",
      });

      // Update Firestore data
      await db.collection("users").doc(user.uid).set({
        name: "Tulani Mtshwelo",
        email: "tmtshwelo21@gmail.com",
        role: "user",
        createdAt: new Date().toISOString(),
      });

      console.log("✅ User account updated successfully");
      console.log("Email:", "tmtshwelo21@gmail.com");
      console.log("Password: Tibule");
      console.log("User ID:", user.uid);
      console.log("Role: user");
    } else {
      console.error("Error creating/updating user:", error);
    }
  }
}

createUserAccount()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
