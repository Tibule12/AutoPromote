// healthRunner.js
// Provides lightweight integration-style checks to validate dashboard flows.
const { admin, db } = require("../firebaseAdmin");
const referralGrowthEngine = require("./referralGrowthEngine");

async function runIntegrationChecks(opts = {}) {
  const { dashboard = "user", userId = null } = opts;
  const results = {};
  // 1) Auth check (map token to uid). We'll just verify admin.auth() works.
  try {
    await admin.auth().listUsers(1);
    results.auth = { status: "ok", message: "Firebase Auth reachable" };
  } catch (e) {
    results.auth = {
      status: "failed",
      message: e.message,
      recommendation:
        "Verify Firebase Admin SDK credentials (service account) and network access to Firebase.",
    };
  }

  // 2) DB read/write check: create a health marker doc and read it back
  try {
    const testRef = db.collection("_health_test").doc("runner_marker");
    const mark = { ts: new Date().toISOString(), runner: "healthRunner" };
    await testRef.set(mark, { merge: true });
    const snap = await testRef.get();
    if (snap.exists) {
      results.db = {
        status: "ok",
        message: "Read/write to DB OK",
        recommendation: "No action required",
      };
    } else {
      results.db = {
        status: "failed",
        message: "Marker doc write/read failed",
        recommendation:
          "Check Firestore security rules & service account permissions; attempt to write a marker document",
      };
    }
  } catch (e) {
    results.db = { status: "failed", message: e.message };
  }

  // 3) Leaderboard check
  try {
    const snap = await db.collection("leaderboard").orderBy("score", "desc").limit(1).get();
    if (!snap.empty && snap.docs.length > 0) {
      results.leaderboard = {
        status: "ok",
        message: "Leaderboard available",
        top: snap.docs[0].data(),
      };
    } else {
      results.leaderboard = {
        status: "warning",
        message: "Leaderboard empty",
        recommendation: "Create a sample leaderboard entry or seed leaderboard via admin tools",
      };
    }
  } catch (e) {
    results.leaderboard = { status: "failed", message: e.message };
  }

  // 4) Growth squad creation / join check (user-level)
  if (dashboard === "user") {
    try {
      const uid = userId || "testUser123";
      const squad = await referralGrowthEngine.createGrowthSquad(uid, {
        name: `HR-${Date.now()}`,
        maxMembers: 3,
      });
      results.growth_squad = {
        status: "ok",
        message: "Growth squad created",
        squadId: squad.squadId,
      };
    } catch (e) {
      results.growth_squad = {
        status: "failed",
        message: e.message,
        recommendation:
          "Investigate referralGrowthEngine errors. Check DB collection permissions and available quotas",
      };
    }
  }

  // 5) Viral challenge creation check
  try {
    const challengeRef = await db
      .collection("viral_challenges")
      .add({ name: `Scan-${Date.now()}`, reward: "test", createdAt: new Date().toISOString() });
    results.viral_challenge = {
      status: "ok",
      message: "Viral challenge created",
      id: challengeRef.id,
    };
  } catch (e) {
    results.viral_challenge = {
      status: "failed",
      message: e.message,
      recommendation: "Check Firestore write permissions and that viral challenge schema is valid",
    };
  }

  // 6) Content upload (add minimal doc) and schema validation (basic)
  try {
    const contentRef = await db.collection("content").add({
      title: "Health-run content",
      url: "https://example.com/video.mp4",
      uid: userId || "testUser123",
      createdAt: new Date().toISOString(),
    });
    results.content_upload = { status: "ok", message: "Content doc added", id: contentRef.id };
  } catch (e) {
    results.content_upload = {
      status: "failed",
      message: e.message,
      recommendation:
        "Verify content schema and storage configuration (Firebase Storage) for uploads",
    };
  }

  // 7) Platform simulate check (check at least one user connection exists)
  try {
    const connSnap = await db
      .collection("users")
      .doc(userId || "testUser123")
      .collection("connections")
      .limit(1)
      .get();
    if (!connSnap.empty) {
      const first = connSnap.docs[0].data();
      results.platforms = {
        status: "ok",
        message: "User platform connections found",
        connection: first,
      };
    } else {
      results.platforms = { status: "warning", message: "No user platform connections found" };
    }
  } catch (e) {
    results.platforms = {
      status: "failed",
      message: e.message,
      recommendation:
        "Verify platform connection tokens and that connections are stored under users/{uid}/connections",
    };
  }

  // 8) Admin checks
  if (dashboard === "admin") {
    try {
      const adminSnap = await db.collection("admins").limit(1).get();
      if (!adminSnap.empty) {
        results.admin = { status: "ok", message: "Admin collection exists" };
      } else {
        results.admin = {
          status: "warning",
          message: "No admin entries found",
          recommendation:
            "Create admin users, or ensure admins collection contains at least one admin doc",
        };
      }
    } catch (e) {
      results.admin = { status: "failed", message: e.message };
    }

    // 9) Admin moderation check: try finding content id '12345' and set status to 'archived'
    try {
      const contentRef = db.collection("content").doc("12345");
      const contentSnap = await contentRef.get();
      if (contentSnap.exists) {
        await contentRef.update({ status: "archived", moderated_at: new Date().toISOString() });
        results.admin_moderate = { status: "ok", message: "Found and archived content 12345" };
      } else {
        results.admin_moderate = {
          status: "warning",
          message: "Content 12345 not found",
          recommendation:
            "Create sample content with id 12345 or ensure content seed is present for moderation checks",
        };
      }
    } catch (e) {
      results.admin_moderate = { status: "failed", message: e.message };
    }
  }

  // Evaluate overall status
  const anyFailed = Object.values(results).some(r => r.status === "failed");
  const anyWarning = Object.values(results).some(r => r.status === "warning");
  const overall = anyFailed ? "failed" : anyWarning ? "warning" : "ok";

  // Attach generic guidance per check if not present
  Object.entries(results).forEach(([, v]) => {
    if (!v.recommendation) v.recommendation = "No action required";
  });

  return { overall, checks: results };
}

// Remediation functions for a small set of safe checks
async function performRemediation(checkKey, opts = {}) {
  // opts: { userId, force }
  const applied = [];
  const errors = [];
  const uid = opts.userId || "testUser123";
  try {
    if (checkKey === "db") {
      // Create a _system_health/connection_test doc
      await db
        .collection("_system_health")
        .doc("connection_test")
        .set({ ts: new Date().toISOString(), by: "healthRunner" }, { merge: true });
      applied.push("created _system_health/connection_test");
    } else if (checkKey === "admin") {
      const adminUid = process.env.HEALTH_SCAN_ADMIN_UID || "adminUser";
      await db
        .collection("admins")
        .doc(adminUid)
        .set(
          {
            uid: adminUid,
            email: `${adminUid}@example.com`,
            role: "admin",
            isAdmin: true,
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      await db
        .collection("users")
        .doc(adminUid)
        .set(
          {
            uid: adminUid,
            email: `${adminUid}@example.com`,
            name: "Admin User",
            role: "admin",
            isAdmin: true,
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      applied.push(`created admin user ${adminUid}`);
    } else if (checkKey === "leaderboard") {
      const id = `lb-${Date.now().toString(16).slice(0, 8)}`;
      await db
        .collection("leaderboard")
        .doc(id)
        .set({ userId: uid, score: 10, displayName: "Health Runner" }, { merge: true });
      applied.push("seeded leaderboard with an entry");
    } else if (checkKey === "content_upload") {
      const contentRef = await db.collection("content").add({
        title: "Health-run content (remediate)",
        url: "https://example.com/video.mp4",
        uid,
        createdAt: new Date().toISOString(),
      });
      applied.push(`created content doc ${contentRef.id}`);
    } else if (checkKey === "platforms") {
      // Create a dummy platform connection
      await db
        .collection("users")
        .doc(uid)
        .collection("connections")
        .doc("spotify")
        .set(
          {
            connected: true,
            meta: { platform: "spotify", display_name: "TestUser" },
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      applied.push("created a dummy spotify connection for user");
    } else if (checkKey === "growth_squad") {
      const s = await db.collection("growth_squads").add({
        creatorId: uid,
        name: `Health Squad ${Date.now()}`,
        members: [uid],
        memberCount: 1,
        maxMembers: 5,
        createdAt: new Date().toISOString(),
      });
      applied.push(`created growth squad ${s.id}`);
    } else {
      return {
        success: false,
        message: `No remediation available for ${checkKey}`,
        applied,
        errors,
      };
    }
    return { success: true, applied, errors };
  } catch (e) {
    errors.push(e.message || String(e));
    return { success: false, applied, errors };
  }
}

module.exports = { runIntegrationChecks, performRemediation };

module.exports = { runIntegrationChecks };
