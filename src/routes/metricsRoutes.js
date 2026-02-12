const express = require("express");
const { db } = require("../firebaseAdmin");
const authMiddleware = require("../authMiddleware");
const adminOnly = require("../middlewares/adminOnly");

// Basic metrics route (read-only). Optionally protect with auth (currently requires auth).
// Returns:
// - taskQueue: status counts + recent tasks
// - velocityTriggers: recent trigger events
// - highVelocityContent: content docs with youtube.velocityStatus == 'high'
// - uploadStats: number of distinct uploads recorded
// NOTE: This is a lightweight aggregation; for very large datasets, migrate to pre-aggregated counters.

const router = express.Router();
const rateLimitBasic = require("../middlewares/rateLimitBasic");

// New: business config + revenue projection endpoints
router.get("/business-config", async (req, res) => {
  try {
    const { getPlans } = require("../services/planService");
    const plans = getPlans();
    const out = {
      revenue_per_million: parseInt(process.env.REVENUE_PER_MILLION || "3000", 10),
      creator_payout_rate: parseFloat(process.env.CREATOR_PAYOUT_RATE || "0.05"),
      platform_fee_rate: parseFloat(process.env.PLATFORM_FEE_RATE || "0.10"),
      daily_target_views: parseInt(process.env.DAILY_TARGET_VIEWS || "200000", 10),
      auto_remove_days: parseInt(process.env.AUTO_REMOVE_DAYS || "2", 10),
      plans,
    };
    return res.json({ ok: true, business: out, generatedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/revenue/projection", authMiddleware, async (req, res) => {
  try {
    const windowDays = Math.min(parseInt(req.query.days || "30", 10), 90);
    const since = Date.now() - windowDays * 86400000;
    const { getPlans } = require("../services/planService");
    void getPlans(); // intentionally invoked for potential plan-based hints; not used in this route
    // Pull recent events (cap 5000) - for MVP sampling
    const snap = await db
      .collection("events")
      .orderBy("createdAt", "desc")
      .limit(5000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const events = [];
    snap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= since) events.push(v);
    });
    // Basic aggregation
    const usersActive = new Set(events.filter(e => e.userId).map(e => e.userId));
    // Fetch paid user count (best effort) - users collection where plan.tier != 'free'
    let paidUsers = 0;
    try {
      const paidSnap = await db
        .collection("users")
        .where("plan.tier", "!=", "free")
        .limit(500)
        .get();
      paidUsers = paidSnap.size;
    } catch (_) {
      /* ignore (index may be missing) */
    }
    const ARPPU = parseFloat(process.env.MODEL_ARPPU || "32");
    const subscriptionMRR = paidUsers * ARPPU;
    const taskEvents = events.filter(e => e.type === "platform_post_enqueued");
    // Simulate overage: assume each user free quota 15 tasks
    const tasksPerUser = {};
    taskEvents.forEach(t => {
      tasksPerUser[t.userId] = (tasksPerUser[t.userId] || 0) + 1;
    });
    let excessTasks = 0;
    const FREE = 15;
    Object.values(tasksPerUser).forEach(ct => {
      if (ct > FREE) excessTasks += ct - FREE;
    });
    const taskFee = parseFloat(process.env.TASK_FEE || "0.15");
    const promotionMRR = excessTasks * taskFee * (30 / windowDays); // scale to monthly
    // AI events placeholder (none yet) -> zero
    const aiMRR = 0;
    // Landing page estimate (if we had visits) -> simulate using content uploads * factor
    const uploadEvents = events.filter(e => e.type === "content_uploaded");
    const landingVisits =
      uploadEvents.length * parseInt(process.env.MODEL_VISITS_PER_UPLOAD || "20", 10);
    const rpm = parseFloat(process.env.MODEL_LANDING_RPM || "4");
    const landingRevenue = (landingVisits / 1000) * rpm;
    const addonsMRR = 0; // future
    // Real ledger overlay (best-effort)
    let ledgerTotals = null;
    try {
      const { aggregateUsageSince } = require("../services/usageLedgerService");
      ledgerTotals = await aggregateUsageSince({ sinceMs: since });
    } catch (_) {}
    const ledgerRevenue = ledgerTotals
      ? ledgerTotals.subscription_fee + ledgerTotals.overage + ledgerTotals.ai
      : 0;
    const grossMRR =
      subscriptionMRR + promotionMRR + aiMRR + landingRevenue + addonsMRR + ledgerRevenue;
    const procCost = grossMRR * 0.03 + paidUsers * 0.3;
    const infraPerPaid = parseFloat(process.env.MODEL_INFRA_PER_PAID || "2");
    const infraCost = paidUsers * infraPerPaid;
    const netMRR = grossMRR - procCost - infraCost;
    return res.json({
      ok: true,
      window_days: windowDays,
      users: { active: usersActive.size, paid: paidUsers },
      mrr_breakdown: {
        subscription: subscriptionMRR,
        promotion_overage: promotionMRR,
        ai: aiMRR,
        landing: landingRevenue,
        addons: addonsMRR,
      },
      gross_mrr: grossMRR,
      costs: { processing: procCost, infra: infraCost },
      net_mrr: netMRR,
      assumptions: {
        task_fee: taskFee,
        free_task_quota: FREE,
        arppu: ARPPU,
        landing_rpm: rpm,
      },
      ledger: ledgerTotals || null,
      sample: {
        events: events.length,
        uploads: uploadEvents.length,
        tasks_enqueued: taskEvents.length,
        excess_tasks: excessTasks,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Landing page view tracker (public, lightweight). Accepts contentId (optional) & path.
router.post("/landing/track", async (req, res) => {
  try {
    const { contentId, path } = req.body || {};
    const referer = req.get("referer") || null;
    const ua = req.get("user-agent") || null;
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
      .split(",")[0]
      .trim();
    // Attribution parse (if path includes ?src=...)
    let src = null,
      cId = contentId || null;
    let variantIndex = null;
    let taskId = null;
    if (path && path.includes("?")) {
      try {
        const q = path.split("?")[1];
        const params = new URLSearchParams(q);
        src = params.get("src");
        const contentParam = params.get("c");
        if (contentParam && !cId) cId = contentParam;
        const vIdx = params.get("v");
        if (vIdx !== null && vIdx !== undefined) {
          const parsed = parseInt(vIdx, 10);
          if (!Number.isNaN(parsed)) variantIndex = parsed;
        }
        const tParam = params.get("t");
        if (tParam) taskId = tParam;
      } catch (_) {}
    }
    const doc = {
      type: "landing_view",
      contentId: cId,
      path: path || "/",
      src: src || null,
      referer,
      ua: ua ? ua.slice(0, 200) : null,
      ipHash: ip
        ? require("crypto").createHash("sha256").update(ip).digest("hex").slice(0, 16)
        : null,
      createdAt: new Date().toISOString(),
      variantIndex,
      taskId,
    };
    await db.collection("events").add(doc);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Funnel attribution summary: aggregates recent landing_view events and platform_posts
router.get("/funnel/summary", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || "7", 10), 30);
    const since = Date.now() - days * 86400000;
    const landingSnap = await db
      .collection("events")
      .where("type", "==", "landing_view")
      .orderBy("createdAt", "desc")
      .limit(3000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const views = [];
    landingSnap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= since) views.push(v);
    });
    const bySrc = {};
    const byContent = {};
    views.forEach(v => {
      if (v.src) bySrc[v.src] = (bySrc[v.src] || 0) + 1;
      if (v.contentId) byContent[v.contentId] = (byContent[v.contentId] || 0) + 1;
    });
    // Top posts join attempt: fetch platform_posts for recent contentIds (sample)
    const contentIds = Object.keys(byContent).slice(0, 25);
    const posts = [];
    for (const cid of contentIds) {
      try {
        const snap = await db
          .collection("platform_posts")
          .where("contentId", "==", cid)
          .limit(10)
          .get();
        snap.forEach(p => {
          const d = p.data();
          posts.push({
            id: p.id,
            platform: d.platform,
            contentId: d.contentId,
            success: d.success,
            trackedLink: d.trackedLink || null,
          });
        });
      } catch (_) {}
    }
    return res.json({
      ok: true,
      window_days: days,
      totals: { views: views.length },
      bySrc,
      byContentSample: byContent,
      samplePosts: posts,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Variant performance summary (counts of usedVariant occurrences per platform/content)
router.get("/variants/summary", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 2000);
    const snap = await db
      .collection("platform_posts")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const variantCounts = {};
    snap.docs.forEach(d => {
      const v = d.data();
      const variant = v.usedVariant || (v.rawOutcome && v.rawOutcome.usedVariant) || null;
      if (!variant) return;
      const key = `${v.platform}|${v.contentId}`;
      if (!variantCounts[key])
        variantCounts[key] = { platform: v.platform, contentId: v.contentId, variants: {} };
      const bucket = variantCounts[key];
      bucket.variants[variant] = (bucket.variants[variant] || 0) + 1;
      if (typeof v.variantIndex === "number") {
        bucket.variantIndexes = bucket.variantIndexes || {};
        bucket.variantIndexes[v.variantIndex] = (bucket.variantIndexes[v.variantIndex] || 0) + 1;
      }
    });
    return res.json({ ok: true, groups: Object.values(variantCounts), sampled: snap.docs.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Variant performance scoring: join landing_view counts (by contentId + src) with variant usage
router.get("/variants/performance", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || "7", 10), 30);
    const since = Date.now() - days * 86400000;
    const postSnap = await db
      .collection("platform_posts")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const posts = [];
    postSnap.docs.forEach(d => {
      const v = d.data();
      posts.push({
        id: d.id,
        platform: v.platform,
        contentId: v.contentId,
        usedVariant: v.usedVariant,
        variantIndex: v.variantIndex,
        createdAt: v.createdAt,
      });
    });
    // Landing views sample
    const lvSnap = await db
      .collection("events")
      .where("type", "==", "landing_view")
      .orderBy("createdAt", "desc")
      .limit(4000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const views = [];
    lvSnap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= since) views.push(v);
    });
    // Aggregate views by (contentId, src)
    const viewIndex = {};
    views.forEach(v => {
      if (!v.contentId || !v.src) return;
      const key = `${v.contentId}|${v.src}`;
      viewIndex[key] = (viewIndex[key] || 0) + 1;
    });
    // Score variants (assume src == platform code: tw, fb, etc.)
    const variantStats = {};
    posts.forEach(p => {
      if (!p.usedVariant) return;
      const platformCode =
        p.platform === "twitter"
          ? "tw"
          : p.platform === "facebook"
            ? "fb"
            : p.platform === "instagram"
              ? "instagram"
              : p.platform === "tiktok"
                ? "tiktok"
                : null;
      if (!platformCode) return;
      const keyViews = `${p.contentId}|${platformCode}`;
      const viewsForPair = viewIndex[keyViews] || 0;
      const keyVariant = `${p.platform}|${p.contentId}|${p.usedVariant}`;
      if (!variantStats[keyVariant])
        variantStats[keyVariant] = {
          platform: p.platform,
          contentId: p.contentId,
          variant: p.usedVariant,
          variantIndex: p.variantIndex,
          posts: 0,
          estimatedViews: 0,
        };
      variantStats[keyVariant].posts += 1;
      variantStats[keyVariant].estimatedViews += viewsForPair; // naive: all views attributed equally per post variant
    });
    // Derive simple score: views/posts
    Object.values(variantStats).forEach(v => {
      v.viewPerPost = v.posts ? v.estimatedViews / v.posts : 0;
    });
    return res.json({
      ok: true,
      window_days: days,
      variants: Object.values(variantStats)
        .sort((a, b) => b.viewPerPost - a.viewPerPost)
        .slice(0, 200),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Usage ledger summary (admin or owner)
router.get("/usage/summary", authMiddleware, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || "30", 10), 90);
    const since = Date.now() - days * 86400000;
    const { aggregateUsageSince } = require("../services/usageLedgerService");
    const totals = await aggregateUsageSince({ sinceMs: since });
    return res.json({ ok: true, window_days: days, totals });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Record a usage line (temporary - would be behind billing auth in production)
router.post(
  "/usage/record",
  authMiddleware,
  rateLimitBasic({ windowMs: 60000, max: 10 }),
  async (req, res) => {
    try {
      const { type, amount = 0, currency = "USD", meta = {} } = req.body || {};
      if (!type) return res.status(400).json({ ok: false, error: "type required" });
      const { recordUsage } = require("../services/usageLedgerService");
      await recordUsage({ type, userId: req.userId, amount: Number(amount) || 0, currency, meta });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// Prune underperforming variants: deactivates bottom performers for a contentId
router.post("/variants/prune", async (req, res) => {
  try {
    const { contentId, keepTop = 1, minPosts = 2 } = req.body || {};
    if (!contentId) return res.status(400).json({ ok: false, error: "contentId required" });
    // Reuse performance logic (local calculation)
    const days = 30;
    const since = Date.now() - days * 86400000;
    const postSnap = await db
      .collection("platform_posts")
      .where("contentId", "==", contentId)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    const posts = [];
    postSnap.docs.forEach(d => {
      const v = d.data();
      posts.push(v);
    });
    const lvSnap = await db
      .collection("events")
      .where("type", "==", "landing_view")
      .orderBy("createdAt", "desc")
      .limit(3000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const views = [];
    lvSnap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= since) views.push(v);
    });
    const viewIndex = {};
    views.forEach(v => {
      if (v.contentId && v.src) {
        const k = `${v.contentId}|${v.src}`;
        viewIndex[k] = (viewIndex[k] || 0) + 1;
      }
    });
    const stats = {};
    posts.forEach(p => {
      if (!p.usedVariant) return;
      const srcCode = p.platform === "twitter" ? "tw" : p.platform;
      const vk = `${p.contentId}|${srcCode}`;
      const viewsForPair = viewIndex[vk] || 0;
      const key = p.usedVariant;
      if (!stats[key]) stats[key] = { variant: key, posts: 0, views: 0 };
      stats[key].posts += 1;
      stats[key].views += viewsForPair; // naive allocation
    });
    const arr = Object.values(stats)
      .filter(v => v.posts >= minPosts)
      .map(v => ({ ...v, vpp: v.posts ? v.views / v.posts : 0 }));
    if (!arr.length) return res.json({ ok: true, pruned: [], reason: "insufficient_data" });
    arr.sort((a, b) => b.vpp - a.vpp);
    const keep = new Set(arr.slice(0, keepTop).map(v => v.variant));
    const disabled = arr.slice(keepTop).map(v => v.variant);
    // Mark on content doc
    try {
      await db
        .collection("content")
        .doc(contentId)
        .set(
          { disabledVariants: disabled, variantKeep: Array.from(keep), variantStatsSnapshot: arr },
          { merge: true }
        );
    } catch (_) {}
    return res.json({ ok: true, kept: Array.from(keep), disabled, evaluated: arr.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Performance dashboard: aggregate impressions, clicks (via shortlink resolves), CTR, variant winners
router.get("/dashboard/performance", authMiddleware, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || "7", 10), 30);
    const since = Date.now() - days * 86400000;
    // Sample platform posts
    const postsSnap = await db
      .collection("platform_posts")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const posts = [];
    postsSnap.docs.forEach(d => {
      const v = d.data();
      const ts =
        v.createdAt && v.createdAt.toMillis
          ? v.createdAt.toMillis()
          : Date.parse(v.createdAt || "") || 0;
      if (ts >= since)
        posts.push({
          id: d.id,
          contentId: v.contentId,
          platform: v.platform,
          variantIndex: v.variantIndex,
          usedVariant: v.usedVariant,
          metrics: v.metrics || null,
          shortlinkCode: v.shortlinkCode || null,
        });
    });
    // Clicks via shortlink resolves (events type shortlink_resolve)
    const shortlinkSnap = await db
      .collection("events")
      .where("type", "==", "shortlink_resolve")
      .orderBy("createdAt", "desc")
      .limit(4000)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const resolves = [];
    shortlinkSnap.docs.forEach(d => {
      const v = d.data();
      const ts = Date.parse(v.createdAt || "") || 0;
      if (ts >= since) resolves.push(v);
    });
    // Map by content
    const contentStats = {};
    posts.forEach(p => {
      if (!contentStats[p.contentId])
        contentStats[p.contentId] = {
          contentId: p.contentId,
          posts: 0,
          impressions: 0,
          clicks: 0,
          variants: {},
        };
      const cs = contentStats[p.contentId];
      cs.posts += 1;
      if (p.metrics && p.metrics.impressions) cs.impressions += p.metrics.impressions;
      if (p.usedVariant) {
        if (!cs.variants[p.usedVariant])
          cs.variants[p.usedVariant] = {
            variant: p.usedVariant,
            posts: 0,
            impressions: 0,
            clicks: 0,
          };
        const vs = cs.variants[p.usedVariant];
        vs.posts += 1;
        if (p.metrics && p.metrics.impressions) vs.impressions += p.metrics.impressions;
      }
    });
    resolves.forEach(r => {
      if (r.contentId && contentStats[r.contentId]) {
        const cs = contentStats[r.contentId];
        cs.clicks += 1;
        if (typeof r.variantIndex === "number") {
          // Attempt to map variantIndex -> variant by scanning posts for same content & variantIndex
          const matchingPost = posts.find(
            p => p.contentId === r.contentId && p.variantIndex === r.variantIndex && p.usedVariant
          );
          if (matchingPost && matchingPost.usedVariant && cs.variants[matchingPost.usedVariant]) {
            cs.variants[matchingPost.usedVariant].clicks += 1;
          }
        }
      }
    });
    // Derive CTR and winner
    Object.values(contentStats).forEach(cs => {
      cs.ctr = cs.impressions ? cs.clicks / cs.impressions : 0;
      // Winner variant by impressions for now
      let winner = null;
      let best = -Infinity;
      Object.values(cs.variants).forEach(vs => {
        const score = vs.impressions;
        if (score > best) {
          best = score;
          winner = vs.variant;
        }
      });
      cs.winnerVariant = winner;
    });
    return res.json({
      ok: true,
      window_days: days,
      contents: Object.values(contentStats).slice(0, 200),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Helper: Wilson score lower bound (95%) for CTR to stabilize rankings with low impressions
function wilsonLowerBound(clicks, impressions, z = 1.96) {
  if (!impressions || impressions <= 0) return 0;
  const p = clicks / impressions;
  const denom = 1 + (z * z) / impressions;
  const centre = p + (z * z) / (2 * impressions);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * impressions)) / impressions);
  return Math.max(0, (centre - margin) / denom);
}

// Content performance (denormalized + event enriched) per contentId
router.get("/content/:id/performance", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const contentSnap = await db.collection("content").doc(id).get();
    if (!contentSnap.exists) return res.status(404).json({ ok: false, error: "content_not_found" });
    const content = contentSnap.data();
    // Gather recent posts for this content
    const postSnap = await db
      .collection("platform_posts")
      .where("contentId", "==", id)
      .orderBy("createdAt", "desc")
      .limit(250)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const posts = [];
    postSnap.docs.forEach(d => {
      const v = d.data();
      posts.push({
        id: d.id,
        platform: v.platform,
        variantIndex: v.variantIndex,
        usedVariant: v.usedVariant,
        impressions: v.metrics?.impressions || 0,
        clicks: v.clicks || 0,
        createdAt: v.createdAt,
      });
    });
    // Aggregate variant string performance
    const variantPerf = {};
    posts.forEach(p => {
      if (!p.usedVariant) return;
      if (!variantPerf[p.usedVariant])
        variantPerf[p.usedVariant] = {
          variant: p.usedVariant,
          posts: 0,
          impressions: 0,
          clicks: 0,
        };
      const vp = variantPerf[p.usedVariant];
      vp.posts += 1;
      vp.impressions += p.impressions;
      vp.clicks += p.clicks;
    });
    // Merge denormalized click counts (variantStringClicks)
    if (content.variantStringClicks && typeof content.variantStringClicks === "object") {
      Object.entries(content.variantStringClicks).forEach(([k, v]) => {
        if (!variantPerf[k]) variantPerf[k] = { variant: k, posts: 0, impressions: 0, clicks: 0 };
        // Only augment clicks if higher (avoid double counting)
        if (v > variantPerf[k].clicks) variantPerf[k].clicks = v;
      });
    }
    // Compute CTR + Wilson
    Object.values(variantPerf).forEach(v => {
      v.ctr = v.impressions ? v.clicks / v.impressions : 0;
      v.wilson = wilsonLowerBound(v.clicks, v.impressions);
    });
    const rankedVariants = Object.values(variantPerf)
      .sort((a, b) => b.wilson - a.wilson)
      .slice(0, 100);
    // Variant index based clicks
    const variantIndexClicks = content.variantClicks || {};
    const summary = {
      clicksTotal: content.clicksTotal || 0,
      variantIndexClicks,
      variantsRanked: rankedVariants,
      posts: posts.slice(0, 100),
    };
    return res.json({
      ok: true,
      contentId: id,
      performance: summary,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Champion variant endpoint: selects top variant with minimum impressions & significance threshold
router.get("/content/:id/champion", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const minImpressions = parseInt(req.query.minImpressions || "30", 10);
    const contentSnap = await db.collection("content").doc(id).get();
    if (!contentSnap.exists) return res.status(404).json({ ok: false, error: "content_not_found" });
    // Reuse performance aggregation quickly (subset)
    const postSnap = await db
      .collection("platform_posts")
      .where("contentId", "==", id)
      .orderBy("createdAt", "desc")
      .limit(250)
      .get()
      .catch(() => ({ empty: true, docs: [] }));
    const variants = {};
    postSnap.docs.forEach(d => {
      const v = d.data();
      if (!v.usedVariant) return;
      const key = v.usedVariant;
      if (!variants[key]) variants[key] = { variant: key, impressions: 0, clicks: 0 };
      variants[key].impressions += v.metrics?.impressions || 0;
      variants[key].clicks += v.clicks || 0;
    });
    const arr = Object.values(variants).filter(v => v.impressions >= minImpressions);
    if (!arr.length)
      return res.json({ ok: true, champion: null, reason: "insufficient_impressions" });
    arr.forEach(v => {
      v.ctr = v.impressions ? v.clicks / v.impressions : 0;
      v.wilson = wilsonLowerBound(v.clicks, v.impressions);
    });
    arr.sort((a, b) => b.wilson - a.wilson);
    const champion = arr[0];
    // Simple significance check vs runner-up
    let significant = false;
    if (arr.length > 1) {
      const runner = arr[1];
      significant = champion.wilson > runner.wilson; // conservative: lower-bound of champion greater than lower-bound of runner
    } else {
      significant = champion.impressions >= minImpressions * 2;
    }
    return res.json({ ok: true, champion: { ...champion, significant }, evaluated: arr.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Current user task usage vs quota (month)
router.get("/usage/current", authMiddleware, async (req, res) => {
  try {
    const uid = req.userId;
    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    ).toISOString();
    // Count tasks (approx; sample up to 5000)
    const taskSnap = await db
      .collection("promotion_tasks")
      .where("uid", "==", uid)
      .where("createdAt", ">=", monthStart)
      .limit(5000)
      .get();
    const tasksUsed = taskSnap.size;
    // Plan quota
    let quota = 0;
    let planTier = "free";
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      if (userSnap.exists) {
        const plan = userSnap.data().plan || {};
        planTier = plan.tier || plan.id || "free";
        const { getPlan } = require("../services/planService");
        quota = getPlan(planTier).monthlyTaskQuota || 0;
      }
    } catch (_) {}
    const overage = quota ? Math.max(0, tasksUsed - quota) : 0;
    return res.json({ ok: true, monthStart, plan: planTier, quota, tasksUsed, overage });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Utility safe number
function num(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

async function fetchTaskMetrics(limitPerType = 150) {
  const types = ["youtube_upload", "platform_post"];
  const results = {};
  for (const type of types) {
    const snap = await db
      .collection("promotion_tasks")
      .where("type", "==", type)
      .orderBy("createdAt", "desc")
      .limit(limitPerType)
      .get();
    const tasks = [];
    const statusCounts = {};
    snap.forEach(doc => {
      const data = doc.data();
      statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
      tasks.push({
        id: doc.id,
        status: data.status,
        platform: data.platform,
        reason: data.reason,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });
    results[type] = { totalSampled: tasks.length, statusCounts, recent: tasks.slice(0, 20) };
  }
  return results;
}

async function fetchVelocityTriggers(limit = 25, hours = 24) {
  const since = Date.now() - hours * 3600000;
  // We can't query by time unless we stored a timestamp field; createdAt is serverTimestamp.
  // We'll just pull latest N triggers and filter heuristically if they have a createdAt Timestamp.
  const snap = await db
    .collection("analytics")
    .where("type", "==", "velocity_trigger")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  const triggers = [];
  snap.forEach(doc => {
    const d = doc.data();
    const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null;
    if (!ts || ts >= since) {
      triggers.push({
        id: doc.id,
        contentId: d.contentId,
        platform: d.platform,
        videoId: d.videoId,
        velocity: d.velocity,
        threshold: d.velocityThreshold,
        createdAt: ts || null,
      });
    }
  });
  return triggers;
}

async function fetchHighVelocityContent(limit = 20) {
  // Firestore doesn't allow querying by nested field inequality + ordering easily; simple where equals.
  const snap = await db
    .collection("content")
    .where("youtube.velocityStatus", "==", "high")
    .limit(limit)
    .get()
    .catch(() => ({ empty: true, forEach: () => {} }));
  const items = [];
  if (!snap.empty) {
    snap.forEach(doc => {
      const d = doc.data();
      items.push({
        id: doc.id,
        title: d.title,
        velocity: d.youtube?.velocity,
        videoId: d.youtube?.videoId,
        publishedAt: d.youtube?.publishedAt,
      });
    });
  }
  return items;
}

async function fetchUploadStats(_limit = 1) {
  // We just count a small sample to detect presence and approximate. Real cardinality would need a count aggregation or BigQuery export.
  const snap = await db
    .collection("youtube_uploads")
    .limit(1)
    .get()
    .catch(() => ({ empty: true }));
  return { hasUploads: !snap.empty };
}

async function fetchPlatformPostsSummary(limit = 100) {
  const snap = await db
    .collection("platform_posts")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()
    .catch(() => ({ empty: true, forEach: () => {} }));
  const counts = { total: 0, success: 0, simulated: 0 };
  const perPlatform = {};
  if (!snap.empty) {
    snap.forEach(doc => {
      const d = doc.data();
      counts.total++;
      if (d.success) counts.success++;
      if (d.simulated) counts.simulated++;
      if (!perPlatform[d.platform]) perPlatform[d.platform] = { total: 0, success: 0 };
      perPlatform[d.platform].total++;
      if (d.success) perPlatform[d.platform].success++;
    });
  }
  return { counts, perPlatform, sample: Math.min(counts.total, 20) };
}

async function fetchTopPlatformPosts(limit = 10) {
  const snap = await db
    .collection("platform_posts")
    .where("success", "==", true)
    .orderBy("normalizedScore", "desc")
    .limit(limit)
    .get()
    .catch(() => ({ empty: true, forEach: () => {} }));
  const out = [];
  if (!snap.empty)
    snap.forEach(doc => {
      const d = doc.data();
      out.push({
        id: doc.id,
        platform: d.platform,
        contentId: d.contentId,
        score: d.normalizedScore,
        peak: d.peakScore,
        accel: d.acceleration,
      });
    });
  return out;
}

async function fetchTopContentUnified(limit = 10) {
  // This requires an index for amplificationUnified desc; if missing, it will error – handle gracefully.
  try {
    const snap = await db
      .collection("content")
      .orderBy("amplificationUnified", "desc")
      .limit(limit)
      .get();
    const out = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (typeof d.amplificationUnified === "number")
        out.push({
          id: doc.id,
          unified: d.amplificationUnified,
          scores: d.amplificationScores || {},
        });
    });
    return out;
  } catch (e) {
    return { indexRequired: true, message: e.message };
  }
}

const METRICS_REQUIRE_ADMIN = process.env.METRICS_REQUIRE_ADMIN !== "false";

router.get(
  "/dashboard",
  authMiddleware,
  (req, res, next) => {
    if (METRICS_REQUIRE_ADMIN) return adminOnly(req, res, next);
    return next();
  },
  async (req, res) => {
    try {
      const { getCounters } = require("../services/aggregationService");
      const dlSnap = await db
        .collection("dead_letter_tasks")
        .limit(1)
        .get()
        .catch(() => ({ empty: true }));
      const [
        taskQueue,
        triggers,
        highVelocity,
        uploadStats,
        counters,
        platformPosts,
        topPosts,
        topContent,
      ] = await Promise.all([
        fetchTaskMetrics(),
        fetchVelocityTriggers(),
        fetchHighVelocityContent(),
        fetchUploadStats(),
        getCounters(),
        fetchPlatformPostsSummary(),
        fetchTopPlatformPosts(),
        fetchTopContentUnified(),
      ]);

      // Build lock takeover summary from counters
      const lockTakeover = {
        attempts: counters.lock_takeover_attempt_total || 0,
        successes: counters.lock_takeover_success_total || 0,
        failures: counters.lock_takeover_failure_total || 0,
        perPlatform: {},
      };
      Object.entries(counters || {}).forEach(([k, v]) => {
        let m = k.match(/^lock_takeover_attempt_(.+)$/);
        if (m) {
          const p = m[1];
          lockTakeover.perPlatform[p] = lockTakeover.perPlatform[p] || {};
          lockTakeover.perPlatform[p].attempts = v;
        }
        m = k.match(/^lock_takeover_success_(.+)$/);
        if (m) {
          const p = m[1];
          lockTakeover.perPlatform[p] = lockTakeover.perPlatform[p] || {};
          lockTakeover.perPlatform[p].successes = v;
        }
        m = k.match(/^lock_takeover_failure_(.+)$/);
        if (m) {
          const p = m[1];
          lockTakeover.perPlatform[p] = lockTakeover.perPlatform[p] || {};
          lockTakeover.perPlatform[p].failures = v;
        }
      });

      // Simple alerting: flag high failure rate (configurable)
      const alerts = [];
      try {
        const attemptCount = lockTakeover.attempts || 0;
        const failureCount = lockTakeover.failures || 0;
        const failureRate = attemptCount > 0 ? failureCount / attemptCount : 0;
        const threshold = parseFloat(process.env.PLATFORM_LOCK_TAKEOVER_ALERT_RATE || "0.3");
        if (attemptCount > 0 && failureRate >= threshold) {
          const alert = {
            type: "lock_takeover_failure_rate",
            rate: failureRate,
            threshold,
            message: "High lock takeover failure rate",
          };
          alerts.push(alert);
          // best-effort: write an event for dashboards/alerting
          try {
            const ev = {
              type: "lock_takeover_alert",
              rate: failureRate,
              threshold,
              at: new Date().toISOString(),
            };
            await db.collection("events").add(ev);
            // Send to Slack if enabled (best-effort)
            try {
              const { sendSlackAlert } = require("../services/slackAlertService");
              const text = `:warning: *AutoPromote Alert:* High lock takeover failure rate (${(failureRate * 100).toFixed(1)}%) - threshold ${(threshold * 100).toFixed(0)}%`;
              // call but don't block dashboard generation (fire-and-forget)
              sendSlackAlert({ text, severity: "warning", extra: ev }).catch(() => {});
            } catch (_) {}
          } catch (_) {}
        }
      } catch (_) {}

      return res.json({
        ok: true,
        taskQueue,
        velocityTriggers: { count: triggers.length, recent: triggers },
        highVelocityContent: highVelocity,
        uploadStats,
        aggregated: counters,
        lockTakeover,
        alerts,
        platformPosts,
        topPlatformPosts: topPosts,
        topContentUnified: topContent,
        deadLetterPresent: !dlSnap.empty,
        generatedAt: new Date().toISOString(),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// System counters (lightweight, best-effort) - guarded by same admin rule if enabled
router.get(
  "/counters",
  authMiddleware,
  (req, res, next) => {
    if (METRICS_REQUIRE_ADMIN) return adminOnly(req, res, next);
    return next();
  },
  async (req, res) => {
    try {
      const snap = await db.collection("system_counters").limit(200).get();
      const counters = {};
      snap.forEach(d => {
        const v = d.data();
        counters[d.id] = v.value || 0;
      });
      return res.json({
        ok: true,
        counters,
        count: Object.keys(counters).length,
        generatedAt: new Date().toISOString(),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// Raw export (F) - limited sample for BI ingestion (admin only already enforced at router level)
router.get(
  "/raw",
  authMiddleware,
  (req, res, next) => {
    if (METRICS_REQUIRE_ADMIN) return adminOnly(req, res, next);
    return next();
  },
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "200", 10), 500);
      const postsSnap = await db
        .collection("platform_posts")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get()
        .catch(() => ({ empty: true, docs: [] }));
      const rows = [];
      postsSnap.docs.forEach(d => {
        const v = d.data();
        rows.push({
          id: d.id,
          platform: v.platform,
          contentId: v.contentId,
          score: v.normalizedScore,
          peak: v.peakScore,
          accel: v.acceleration,
          success: v.success,
          simulated: v.simulated,
          createdAt: v.createdAt,
          postHash: v.postHash,
        });
      });
      const analyticsSnap = await db
        .collection("analytics")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get()
        .catch(() => ({ empty: true, docs: [] }));
      const analytics = [];
      analyticsSnap.docs.forEach(a => {
        const d = a.data();
        analytics.push({
          id: a.id,
          type: d.type,
          platform: d.platform,
          contentId: d.contentId,
          createdAt: d.createdAt,
          velocity: d.velocity,
          normalizedScore: d.normalizedScore,
          acceleration: d.acceleration,
        });
      });
      return res.json({ ok: true, posts: rows, analyticsCount: analytics.length, analytics });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// Admin-protected test endpoint to send a Slack alert (useful to validate webhook & envs)
router.post(
  "/test-alert",
  authMiddleware,
  (req, res, next) => {
    if (METRICS_REQUIRE_ADMIN) return adminOnly(req, res, next);
    return next();
  },
  async (req, res) => {
    try {
      const { text } = req.body || {};
      const { sendSlackAlert } = require("../services/slackAlertService");
      if (String(process.env.ENABLE_SLACK_ALERTS || "false").toLowerCase() !== "true")
        return res.status(400).json({ ok: false, error: "slack alerts disabled" });
      if (!process.env.SLACK_ALERT_WEBHOOK_URL)
        return res.status(400).json({ ok: false, error: "no webhook configured" });
      const msg = text || `Test alert from AutoPromote at ${new Date().toISOString()}`;
      const out = await sendSlackAlert({ text: msg, severity: "info" });
      return res.json({ ok: true, sent: out });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
);

module.exports = router;

// Prometheus-style export (best-effort) at /api/metrics/prom
// Only exposes counters from system_counters collection.
router.get("/prom", async (req, res) => {
  try {
    const snap = await db.collection("system_counters").limit(500).get();
    const lines = [
      "# HELP autopromote_counter Generic system counters",
      "# TYPE autopromote_counter counter",
    ];
    snap.forEach(d => {
      const v = d.data();
      const val = v && typeof v.value === "number" ? v.value : 0;
      const name = d.id.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`autopromote_counter{name="${name}"} ${val}`);
    });
    res.set("Content-Type", "text/plain; version=0.0.4");
    return res.send(lines.join("\n") + "\n");
  } catch (e) {
    return res.status(500).send(`# error ${e.message}`);
  }
});
