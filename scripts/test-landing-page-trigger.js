#!/usr/bin/env node
const admin = require("firebase-admin");
const { performance } = require("perf_hooks");

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "autopromote-cc6d3" });
  }
  const db = admin.firestore();
  const bucket = admin.storage().bucket("autopromote-cc6d3.firebasestorage.app");

  console.log(
    "Creating test content doc and then updating landingPageRequestedAt to trigger function..."
  );
  const docRef = db.collection("content").doc("e2e-test-content-landing");
  await docRef.set(
    {
      title: "E2E Landing Page Test",
      type: "video",
      url: "https://example.com/e2e.mp4",
      user_id: "testUser123",
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Wait briefly then update the doc to set the landingPageRequestedAt (this triggers onUpdate-based handler)
  await new Promise(r => setTimeout(r, 1000));
  await docRef.update({ landingPageRequestedAt: admin.firestore.FieldValue.serverTimestamp() });

  console.log("Waiting for landingPageUrl to be populated (timeout 60s)...");
  const start = performance.now();
  let found = false;
  while (performance.now() - start < 60000) {
    const snap = await docRef.get();
    const data = snap.data() || {};
    if (data.landingPageUrl) {
      console.log("Landing page URL found:", data.landingPageUrl);
      found = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!found) {
    console.error("Timed out waiting for landingPageUrl");
    process.exit(2);
  }

  // Check for a file in storage under landing-pages/
  try {
    const [files] = await bucket.getFiles({ prefix: "landing-pages/" });
    if (files && files.length > 0) {
      console.log("Found landing pages files count:", files.length);
      files.slice(0, 5).forEach(f => console.log(" -", f.name));
      process.exit(0);
    } else {
      console.error("No landing page files found in storage");
      process.exit(3);
    }
  } catch (err) {
    console.error("Storage check failed:", err.message || err);
    process.exit(4);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
