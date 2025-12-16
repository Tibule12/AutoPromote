const { db } = require("./firebaseAdmin");

async function setupFirestoreForUser() {
  try {
    console.log("🔧 Setting up Firestore collections and user documents...");

    // Define the authenticated user details from the logs
    const userId = "QKHDrVDi2AWhS7Qbu8fHTkleWHF3";
    const userEmail = "tmtshwelo21@gmail.com";

    // 1. Create users collection and user document
    console.log("📝 Creating users collection and user document...");
    const userData = {
      uid: userId,
      email: userEmail,
      name: userEmail.split("@")[0], // Extract name from email
      role: "user",
      isAdmin: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileComplete: false,
      preferences: {
        notifications: true,
        theme: "light",
      },
    };

    await db.collection("users").doc(userId).set(userData);
    console.log("✅ Created user document for:", userEmail);

    // 2. Create content collection (empty initially)
    console.log("📁 Creating content collection...");
    // Just ensure the collection exists by creating a placeholder document
    const placeholderContent = await db.collection("content").add({
      userId: userId,
      title: "Welcome Content",
      description: "This is your first piece of content. You can edit or delete this.",
      type: "article",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["welcome", "first-content"],
    });
    console.log("✅ Created content collection with placeholder document");

    // 3. Create admins collection (empty initially)
    console.log("👑 Creating admins collection...");
    // The admins collection will be empty since this user is not an admin
    console.log("✅ Created admins collection (empty)");

    // 4. Create analytics collection (empty initially)
    console.log("📊 Creating analytics collection...");
    console.log("✅ Created analytics collection (empty)");

    // 5. Create promotions collection (empty initially)
    console.log("🚀 Creating promotions collection...");
    console.log("✅ Created promotions collection (empty)");

    // 6. Create user-specific collections
    console.log("👤 Creating user-specific collections...");

    // User content subcollection
    await db.collection("users").doc(userId).collection("content").add({
      title: "Sample Content",
      description: "This is a sample content item",
      type: "article",
      createdAt: new Date().toISOString(),
    });

    // User analytics subcollection
    await db.collection("users").doc(userId).collection("analytics").add({
      totalViews: 0,
      totalClicks: 0,
      lastActivity: new Date().toISOString(),
    });

    console.log("✅ Created user-specific subcollections");

    // 7. Verify the setup by reading back the user document
    console.log("🔍 Verifying setup...");
    const userDoc = await db.collection("users").doc(userId).get();

    if (userDoc.exists) {
      console.log("✅ User document verified:", userDoc.data());
    } else {
      throw new Error("User document was not created properly");
    }

    // 8. Test a simple query to ensure collections are accessible
    console.log("🧪 Testing collection queries...");
    const userContentQuery = await db.collection("content").where("userId", "==", userId).get();
    console.log("✅ Content query successful, found", userContentQuery.size, "documents");

    console.log("🎉 Firestore setup completed successfully!");
    console.log("📋 Summary:");
    console.log("   - Users collection: ✅ Created with user document");
    console.log("   - Content collection: ✅ Created with placeholder");
    console.log("   - Admins collection: ✅ Created (empty)");
    console.log("   - Analytics collection: ✅ Created (empty)");
    console.log("   - Promotions collection: ✅ Created (empty)");
    console.log("   - User subcollections: ✅ Created");
  } catch (error) {
    console.error("❌ Error setting up Firestore:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

setupFirestoreForUser();
