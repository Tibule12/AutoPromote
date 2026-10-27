#!/usr/bin/env node
/*
 * Seed a minimal set of documents into the Firestore emulator for autopilot smoke testing.
 * Usage: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-autopilot-emulator.js
 */
// Fail before importing Admin if emulator discovery is missing or misconfigured.
const seedProject = process.env.GCLOUD_PROJECT || "";
const seedHost = process.env.FIRESTORE_EMULATOR_HOST || "";
const seedPort = /^(?:127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(seedHost);
if (!/^demo-[a-z0-9-]+$/.test(seedProject) || !seedPort ||
    Number(seedPort[1]) < 1 || Number(seedPort[1]) > 65535) {
  throw new Error("Autopilot fixtures require a local demo Firestore emulator");
}
const admin = require("firebase-admin");
async function main() {
  // Initialize the admin SDK to use the emulator. If running with FIRESTORE_EMULATOR_HOST set, this will connect to the emulator.
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: seedProject });
  }
  const db = admin.firestore();
  console.log(
    "Seeding emulator (projectId=",
    process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID || "default",
    ")"
  );

  // Create admin user
  await db.collection("admins").doc("adminUser123").set({
    email: "admin@example.com",
    name: "Autopilot Admin",
    role: "admin",
    createdAt: new Date().toISOString(),
  });
  await db
    .collection("users")
    .doc("adminUser123")
    .set({
      email: "admin@example.com",
      name: "Autopilot Admin",
      role: "admin",
      isAdmin: true,
      createdAt: new Date().toISOString(),
      lastAcceptedTerms: {
        version: process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0",
        acceptedAt: new Date().toISOString(),
      },
    });

  // Create a regular test user
  await db
    .collection("users")
    .doc("testUser123")
    .set({
      email: "testuser@example.com",
      name: "Test User",
      role: "user",
      createdAt: new Date().toISOString(),
      lastAcceptedTerms: {
        version: process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0",
        acceptedAt: new Date().toISOString(),
      },
    });

  // Create a content item
  const contentRef = db.collection("content").doc("test-content-1");
  await contentRef.set({
    title: "Test Content for Autopilot",
    userId: "testUser123",
    createdAt: new Date().toISOString(),
  });

  // Create an AB test doc
  const abTestRef = db.collection("ab_tests").doc("test-autopilot-1");
  await abTestRef.set({
    contentId: "test-content-1",
    status: "running",
    createdAt: new Date().toISOString(),
    variants: [
      { id: "A", label: "Variant A" },
      { id: "B", label: "Variant B" },
    ],
    autopilot: {
      enabled: true,
      canary: { steps: 2, stepSize: 10 },
      decisionCriteria: { metric: "engagement", pThreshold: 0.95 },
    },
  });

  // Seed a simple variant metric document so simulate/preview returns something
  await db
    .collection("ab_test_variant_metrics")
    .doc("test-autopilot-1")
    .set({
      variants: {
        A: { impressions: 100, conversions: 8 },
        B: { impressions: 110, conversions: 12 },
      },
      updatedAt: new Date().toISOString(),
    });

  console.log("✅ Emulator seeded successfully");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
