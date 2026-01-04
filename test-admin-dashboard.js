const { db, auth } = require("./firebaseAdmin");

async function testAdminDashboard() {
  try {
    console.log("🔍 Testing Admin Dashboard Functionality...");

    // Create a test admin user
    console.log("\n1️⃣ Creating test admin user...");
    const adminUser = await auth.createUser({
      email: "testadmin@example.com",
      password: "testpass123",
      displayName: "Test Admin",
    });

    // Set admin role in Firestore
    await db.collection("users").doc(adminUser.uid).set({
      name: "Test Admin",
      email: "testadmin@example.com",
      role: "admin",
      createdAt: new Date().toISOString(),
    });

    console.log("✅ Test admin user created:", adminUser.uid);

    // Create a test regular user
    console.log("\n2️⃣ Creating test regular user...");
    const regularUser = await auth.createUser({
      email: "testuser@example.com",
      password: "testpass123",
      displayName: "Test User",
    });

    // Set user role in Firestore
    await db.collection("users").doc(regularUser.uid).set({
      name: "Test User",
      email: "testuser@example.com",
      role: "user",
      createdAt: new Date().toISOString(),
    });

    console.log("✅ Test regular user created:", regularUser.uid);

    // Create test content
    console.log("\n3️⃣ Creating test content...");
    const contentRef = await db.collection("content").add({
      title: "Test Content",
      description: "This is test content",
      userId: regularUser.uid,
      status: "pending",
      views: 100,
      revenue: 50,
      createdAt: new Date().toISOString(),
    });

    console.log("✅ Test content created:", contentRef.id);

    // Test getting platform overview
    console.log("\n4️⃣ Testing platform overview...");
    const usersSnapshot = await db.collection("users").get();
    console.log("✅ Total users:", usersSnapshot.size);

    const contentSnapshot = await db.collection("content").get();
    console.log("✅ Total content:", contentSnapshot.size);

    // Test content approval
    console.log("\n5️⃣ Testing content approval...");
    await db.collection("content").doc(contentRef.id).update({
      status: "approved",
      updatedAt: new Date().toISOString(),
    });

    const approvedContent = await db.collection("content").doc(contentRef.id).get();
    console.log("✅ Content status:", approvedContent.data().status);

    // Clean up test data
    console.log("\n6️⃣ Cleaning up test data...");

    // Delete content
    await db.collection("content").doc(contentRef.id).delete();
    console.log("✅ Test content deleted");

    // Delete users
    await Promise.all([
      auth.deleteUser(adminUser.uid),
      auth.deleteUser(regularUser.uid),
      db.collection("users").doc(adminUser.uid).delete(),
      db.collection("users").doc(regularUser.uid).delete(),
    ]);
    console.log("✅ Test users deleted");

    console.log("\n✅ All admin dashboard tests completed successfully!");
  } catch (error) {
    console.error("❌ Error testing admin dashboard:", error);
  }
}

testAdminDashboard()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
