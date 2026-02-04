const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db, admin } = require("../firebaseAdmin");
const { recordUsage } = require("../services/usageLedgerService");

const router = express.Router();

// Create a boost (consumes adCredits or uses free boost if available)
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId || (req.user && req.user.uid);
    const {
      contentId,
      targetViews = 10000,
      durationHours = 48,
      useCredits = true,
    } = req.body || {};
    if (!uid) return res.status(401).json({ ok: false, error: "auth_required" });
    if (!contentId) return res.status(400).json({ ok: false, error: "contentId_required" });

    // simple costing: 1 USD per 1000 views
    const cost = Math.ceil(targetViews / 1000) * 1.0;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const user = userSnap.exists ? userSnap.data() : {};

    let paidByCredits = false;
    let isFree = false;

    if (useCredits) {
      const adCredits = Number(user.adCredits || 0);
      if (adCredits >= cost) {
        // deduct
        await userRef.set(
          { adCredits: admin.firestore.FieldValue.increment(-cost) },
          { merge: true }
        );
        paidByCredits = true;
        // record ledger
        await recordUsage({
          type: "ad_credit_used",
          userId: uid,
          amount: cost,
          meta: { contentId, targetViews },
        });
      } else {
        return res.status(400).json({ ok: false, error: "insufficient_credits" });
      }
    } else {
      // check free boost eligibility
      if (!user.freeBoostUsed) {
        isFree = true;
        await userRef.set({ freeBoostUsed: true }, { merge: true });
        await recordUsage({
          type: "free_boost_used",
          userId: uid,
          meta: { contentId, targetViews },
        });
      } else {
        return res.status(400).json({ ok: false, error: "free_boost_already_used" });
      }
    }

    const boost = {
      contentId,
      userId: uid,
      packageId: isFree ? "free" : "paid",
      targetViews,
      durationHours,
      cost: isFree ? 0 : cost,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidByCredits,
      isFree,
    };

    const ref = await db.collection("viral_boosts").add(boost);
    const boostId = ref.id;

    // Simulate boost processing and write a report after a short delay (demo only)
    setTimeout(async () => {
      try {
        // Simulate metrics
        const views = Math.max(0, Math.round(targetViews * (0.6 + Math.random() * 0.8)));
        const engagements = Math.round(views * (0.01 + Math.random() * 0.05));
        const followers = Math.round(engagements * (0.05 + Math.random() * 0.2));
        const cpv = boost.cost && views ? boost.cost / views : 0;
        const report = {
          boostId,
          contentId,
          userId: uid,
          views,
          engagements,
          followersGained: followers,
          cpv,
          generatedAt: new Date().toISOString(),
        };
        await db
          .collection("viral_boosts")
          .doc(boostId)
          .collection("report")
          .doc("summary")
          .set(report, { merge: true });
        await db
          .collection("viral_boosts")
          .doc(boostId)
          .set({ status: "completed", updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        try {
          await db
            .collection("viral_boosts")
            .doc(boostId)
            .set(
              { status: "failed", error: e.message, updatedAt: new Date().toISOString() },
              { merge: true }
            );
        } catch (_) {}
      }
    }, 10000); // 10s demo delay

    return res.json({ ok: true, boostId, ...boost });
  } catch (e) {
    console.error("/boosts/create error", e && e.message);
    return res.status(500).json({ ok: false, error: "create_boost_failed", reason: e.message });
  }
});

// Get boost report
router.get("/:id/report", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ ok: false, error: "id_required" });
    const doc = await db
      .collection("viral_boosts")
      .doc(id)
      .collection("report")
      .doc("summary")
      .get();
    if (!doc.exists) return res.json({ ok: true, status: "pending" });
    return res.json({ ok: true, report: doc.data() });
  } catch (e) {
    console.error("/boosts/report error", e && e.message);
    return res.status(500).json({ ok: false, error: "report_fetch_failed" });
  }
});

module.exports = router;
