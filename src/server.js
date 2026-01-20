/* eslint-disable no-console */
// Bootstrap: ensure Firebase service account env is materialized as a credentials file
// This helps hosts (Render, Docker) that only provide the JSON via env var instead of a file path.
try {
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const svcRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8")
      : null);
  if (svcRaw && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const parsed = JSON.parse(svcRaw);
      if (parsed && parsed.private_key && typeof parsed.private_key === "string")
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      const tmpPath = path.join(os.tmpdir(), `autopromote-service-account-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), { mode: 0o600 });
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
      if (!process.env.FIREBASE_PROJECT_ID && parsed && parsed.project_id) {
        process.env.FIREBASE_PROJECT_ID = parsed.project_id;
      }
      console.log(
        "[startup] Wrote service account JSON to",
        tmpPath,
        "and set GOOGLE_APPLICATION_CREDENTIALS"
      );
    } catch (e) {
      console.warn(
        "[startup] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON/BASE64:",
        e && e.message
      );
    }
  }
} catch (e) {
  /* ignore bootstrap failures */
}

// Diagnostic: Log google-gax and @grpc/grpc-js versions if present to help debug runtime dependency mismatches
try {
  const fs = require("fs");
  const path = require("path");
  try {
    const gaxPkg = require("google-gax/package.json");
    const gaxResolved = require.resolve("google-gax");
    let grpcInfo = "not installed";
    try {
      const grpcPkgPath = require.resolve("@grpc/grpc-js/package.json");
      const grpcPkg = require("@grpc/grpc-js/package.json");
      let singleSubExists = false;
      try {
        const potentialPaths = [
          path.join(
            path.dirname(require.resolve("@grpc/grpc-js/package.json")),
            "build",
            "src",
            "single-subchannel-channel.js"
          ),
          path.join(
            path.dirname(require.resolve("@grpc/grpc-js/package.json")),
            "build",
            "src",
            "single_subchannel_channel.js"
          ),
          path.join(
            path.dirname(require.resolve("@grpc/grpc-js/package.json")),
            "src",
            "single-subchannel-channel.js"
          ),
        ];
        for (const p of potentialPaths) {
          if (fs.existsSync(p)) {
            singleSubExists = true;
            break;
          }
        }
      } catch (_) {
        singleSubExists = false;
      }
      grpcInfo = `@grpc/grpc-js@${grpcPkg.version} at ${grpcPkgPath} (has single-subchannel-channel: ${singleSubExists})`;
    } catch (e) {
      grpcInfo = `@grpc/grpc-js missing (${e && e.message})`;
    }
    console.log("[diagnostic] google-gax@", gaxPkg.version, "at", gaxResolved + ";", grpcInfo);
  } catch (e) {
    console.warn("[diagnostic] google-gax not found:", e && e.message);
  }
} catch (e) {
  console.warn("[diagnostic] internal check failed:", e && e.message);
}

const express = require("express");
// Initialize server-side Sentry (if configured)
try {
  const sentry = require("./sentry");
  const Sentry = sentry.init();
  global.__sentry = Sentry;
  if (Sentry) {
    process.on("unhandledRejection", err => {
      try {
        Sentry.captureException(err);
      } catch (e) {}
    });
    process.on("uncaughtException", err => {
      try {
        Sentry.captureException(err);
      } catch (e) {}
    });
  }
} catch (e) {
  /* no-op */
}
const logger = require("./utils/logger");
const cors = require("cors");
const path = require("path");
// Security & performance middlewares (declare once)
let helmet, compression;
try {
  compression = require("compression");
} catch (_) {
  /* optional */
}
try {
  helmet = require("helmet");
} catch (_) {
  /* optional */
}

// ---------------------------------------------------------------------------
// Test-run environment defaults
// Previously we auto-enabled NO_VIRAL_OPTIMIZATION when running in CI or bypass modes.
// This prevented test suites from exercising the viral optimization and sanitizer code paths.
// We only enable NO_VIRAL_OPTIMIZATION now when the FORCE_NO_VIRAL_OPTIMIZATION flag is set.
if (!process.env.NO_VIRAL_OPTIMIZATION && process.env.FORCE_NO_VIRAL_OPTIMIZATION === "1") {
  process.env.NO_VIRAL_OPTIMIZATION = "1";
  logger.debug("[TEST] FORCE_NO_VIRAL_OPTIMIZATION enabled");
}
// ---------------------------------------------------------------------------
// Enable shared keep-alive agents early (reduces cold outbound latency)
// ---------------------------------------------------------------------------
try {
  const { httpAgent, httpsAgent, summarizeAgent } = require("./utils/keepAliveAgents");
  const httpMod = require("http");
  const httpsMod = require("https");
  httpMod.globalAgent = httpAgent; // override defaults
  httpsMod.globalAgent = httpsAgent;
  global.__keepAliveAgents = () => ({
    http: summarizeAgent(httpAgent),
    https: summarizeAgent(httpsAgent),
  });
  if (process.env.KEEP_ALIVE_LOG !== "0") {
    console.log(
      "[startup] Keep-alive agents enabled (max=",
      httpAgent.maxSockets,
      ", free=",
      httpAgent.maxFreeSockets,
      ")"
    );
  }
} catch (e) {
  console.warn("[startup] keepAliveAgents initialization failed:", e.message);
}

// Graceful cleanup: destroy keep-alive agents on process exit to avoid
// lingering open sockets during test teardown or server shutdown.
try {
  const { destroy } = require("./utils/keepAliveAgents");
  if (destroy && typeof destroy === "function") {
    ["SIGINT", "SIGTERM", "exit"].forEach(ev =>
      process.on(ev, () => {
        try {
          destroy();
        } catch (e) {}
      })
    );
  }
} catch (e) {
  /* ignore */
}

// ---------------------------------------------------------------------------
// Observability & startup environment reminders
// ---------------------------------------------------------------------------
const SLOW_REQ_MS = parseInt(process.env.SLOW_REQ_MS || "3000", 10);
let __printedStartupMissing = false;
// Latency aggregation (simple ring buffer + percentile calc)
const LAT_SAMPLE_SIZE = parseInt(process.env.LAT_SAMPLE_SIZE || "500", 10); // keep last 500 by default
let __latSamples = new Array(LAT_SAMPLE_SIZE);
let __latIndex = 0;
let __latCount = 0;
function recordLatency(ms) {
  __latSamples[__latIndex] = ms;
  __latIndex = (__latIndex + 1) % LAT_SAMPLE_SIZE;
  if (__latCount < LAT_SAMPLE_SIZE) __latCount++;
}
function getLatencyStats() {
  const n = __latCount;
  if (!n) return { count: 0 };
  const arr = __latSamples.slice(0, n).filter(v => typeof v === "number");
  if (!arr.length) return { count: 0 };
  const sorted = arr.slice().sort((a, b) => a - b);
  const pick = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const p50 = pick(0.5),
    p90 = pick(0.9),
    p95 = pick(0.95),
    p99 = pick(0.99);
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const buckets = [25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];
  const counts = {};
  buckets.forEach(b => (counts[b] = 0));
  let over = 0;
  sorted.forEach(v => {
    let placed = false;
    for (const b of buckets) {
      if (v <= b) {
        counts[b]++;
        placed = true;
        break;
      }
    }
    if (!placed) over++;
  });
  return {
    count: sorted.length,
    avg: Math.round(avg),
    p50,
    p90,
    p95,
    p99,
    max: sorted[sorted.length - 1],
    buckets: counts,
    over,
  };
}

// Startup warm-up state (readiness gate)
const __warmupState = {
  started: false,
  done: false,
  error: null,
  tookMs: null,
  at: null,
  triggeredBy: "auto",
  tasks: [],
};
async function runWarmup(trigger = "auto") {
  if (__warmupState.started) return;
  __warmupState.started = true;
  __warmupState.triggeredBy = trigger;
  const t0 = Date.now();
  try {
    const tasks = [];
    const timeWrap = (label, fn) => {
      const t0 = Date.now();
      return fn()
        .then(_r => ({ status: "fulfilled", took: Date.now() - t0, label }))
        .catch(e => ({ status: "rejected", took: Date.now() - t0, label, error: e.message }));
    };
    try {
      const { db } = require("./firebaseAdmin");
      const sampleUid = process.env.WARMUP_SAMPLE_UID || "warmup_noop_uid";
      const add = (label, builder) => {
        tasks.push(timeWrap(label, builder));
      };
      // Core shallow queries
      add("promotion_tasks.head", () => db.collection("promotion_tasks").limit(1).get());
      add("content.latest", () =>
        db.collection("content").orderBy("createdAt", "desc").limit(1).get()
      );
      add("system_counters.sample", () => db.collection("system_counters").limit(3).get());
      // Composite indexes
      add("promotion_tasks.type_status_createdAt", () =>
        db
          .collection("promotion_tasks")
          .where("type", "==", "platform_post")
          .where("status", "==", "pending")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get()
      );
      add("promotion_tasks.uid_type_createdAt", () =>
        db
          .collection("promotion_tasks")
          .where("uid", "==", sampleUid)
          .where("type", "==", "platform_post")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get()
      );
      if (process.env.WARMUP_EXTRA_COLLECTIONS) {
        process.env.WARMUP_EXTRA_COLLECTIONS.split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 5)
          .forEach(col => {
            add(`extra.${col}.head`, () => db.collection(col).limit(1).get());
          });
      }
    } catch (e) {
      /* firebase not ready */
    }
    const results = await Promise.all(tasks);
    __warmupState.tasks = results;
    __warmupState.done = true;
  } catch (e) {
    __warmupState.error = e.message;
    __warmupState.done = true;
  }
  __warmupState.tookMs = Date.now() - t0;
  __warmupState.at = new Date().toISOString();
  if (!__warmupState.error) {
    console.log(
      "[warmup] completed in",
      __warmupState.tookMs + "ms",
      "(trigger=",
      __warmupState.triggeredBy,
      ")"
    );
  } else {
    console.log(
      "[warmup] completed with error in",
      __warmupState.tookMs + "ms:",
      __warmupState.error
    );
  }
}

// Immediate warmup (non-blocking). Avoid running the immediate warmup when
// the server is imported as a module inside a Cloud Functions environment
// (indicated by FUNCTIONS_* env vars), which can cause deployment timeouts.
if (require.main === module) {
  runWarmup().catch(e => console.log("[warmup] immediate failed", e.message));
}

// Lazy trigger middleware: if a qualifying request arrives before warmup started, start it.
function ensureWarmup(req, _res, next) {
  if (!__warmupState.started) {
    // Only trigger on API GETs to avoid triggering from asset requests
    if (req.method === "GET" && req.originalUrl.startsWith("/api/")) {
      runWarmup("lazy_request");
    }
  }
  next();
}

function printMissingEnvOnce() {
  if (__printedStartupMissing) return;
  const missing = [];
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!process.env.JWT_AUDIENCE) missing.push("JWT_AUDIENCE");
  if (!process.env.JWT_ISSUER) missing.push("JWT_ISSUER");
  if (!process.env.RATE_LIMIT_GLOBAL_MAX) missing.push("RATE_LIMIT_GLOBAL_MAX");
  if (!process.env.FIREBASE_PROJECT_ID) missing.push("FIREBASE_PROJECT_ID");
  if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!process.env.FIREBASE_PRIVATE_KEY) missing.push("FIREBASE_PRIVATE_KEY");
  if (missing.length) {
    console.error("[startup] Missing required env vars:", missing.join(", "));
    console.error(
      "  Backend cannot start without these. Set them in your environment and redeploy."
    );
    process.exit(1);
  }
  const enabledFlag = process.env.ENABLE_BACKGROUND_JOBS === "true";
  const typoFlag = process.env.ENABLE_BACKROUND_JOBS === "true";
  if (!enabledFlag && !typoFlag) {
    console.log(
      "ℹ️ Background jobs DISABLED. Set ENABLE_BACKGROUND_JOBS=true to activate autonomous loops."
    );
  } else if (typoFlag && !enabledFlag) {
    console.log(
      "⚠️  Using ENABLE_BACKROUND_JOBS (typo). Jobs active, but please rename to ENABLE_BACKGROUND_JOBS."
    );
  }
  __printedStartupMissing = true;
}
// Only perform the strict missing-env check when running the server as the
// main module (i.e. node src/server.js). When required as a module (for
// example, imported by a Cloud Functions wrapper), avoid exiting the process
// so the importing process can control behavior and errors.
if (require.main === module) {
  setTimeout(printMissingEnvOnce, 1200);
}

// Middleware: slow request profiler
// Attach as early as possible (after requestContext if present)
// We don't import requestContext here yet (loaded later) but we still measure duration.
function slowRequestLogger(req, res, next) {
  const started = Date.now();
  res.once("finish", () => {
    const dur = Date.now() - started;
    recordLatency(dur);
    if (dur >= SLOW_REQ_MS) {
      logger.warn("[slow]", req.method, req.originalUrl, dur + "ms", "status=", res.statusCode);
    }
  });
  next();
}

// -------------------------------------------------
// Lightweight in-memory micro-cache for hot status endpoints
// -------------------------------------------------
const MICRO_CACHE_TTL_MS = parseInt(process.env.MICRO_STATUS_CACHE_TTL_MS || "300", 10); // 300ms default (override via env)
const __microCache = new Map(); // key -> { expiry, payload, contentType }
function microCache(req, res, next) {
  if (MICRO_CACHE_TTL_MS <= 0) return next();
  if (req.method !== "GET") return next();
  // only cache explicit allowlist
  const allow = [
    "/api/platform/status",
    "/api/facebook/status",
    "/api/youtube/status",
    "/api/twitter/connection/status",
    "/api/tiktok/status",
    "/api/telegram/status",
    "/api/instagram/status",
    "/api/monetization/earnings/summary",
    "/api/status/aggregate",
  ];
  if (!allow.includes(req.path)) return next();
  const entry = __microCache.get(req.path);
  if (entry && entry.expiry > Date.now()) {
    res.setHeader("x-micro-cache", "HIT");
    res.setHeader("x-micro-cache-ttl-ms", MICRO_CACHE_TTL_MS.toString());
    if (entry.contentType) res.setHeader("Content-Type", entry.contentType);
    return res.send(entry.payload);
  }
  const originalSend = res.send.bind(res);
  res.send = body => {
    try {
      __microCache.set(req.path, {
        expiry: Date.now() + MICRO_CACHE_TTL_MS,
        payload: body,
        contentType: res.get("Content-Type"),
      });
    } catch (_) {}
    res.setHeader("x-micro-cache", "MISS");
    res.setHeader("x-micro-cache-ttl-ms", MICRO_CACHE_TTL_MS.toString());
    return originalSend(body);
  };
  next();
}

// Instrumentation helper for route handlers: measures handler time & Firestore calls (approx)
const __routeMetrics = {}; // route -> { count, totalMs, maxMs }
function instrumentHandler(fn, routeId) {
  return async function instrumented(req, res, next) {
    const t0 = Date.now();
    let finished = false;
    function finalize() {
      if (finished) return;
      finished = true;
      const ms = Date.now() - t0;
      const m = __routeMetrics[routeId] || { count: 0, totalMs: 0, maxMs: 0 };
      m.count++;
      m.totalMs += ms;
      if (ms > m.maxMs) m.maxMs = ms;
      __routeMetrics[routeId] = m;
      if (ms > parseInt(process.env.SLOW_STATUS_THRESHOLD_MS || "4000", 10)) {
        console.warn("[status-slow] route=", routeId, ms + "ms");
      }
    }
    res.once("finish", finalize);
    res.once("close", finalize);
    try {
      return await fn(req, res, next);
    } catch (e) {
      finalize();
      return next(e);
    }
  };
}
global.__getRouteMetrics = () => {
  const out = {};
  Object.entries(__routeMetrics).forEach(([k, v]) => {
    out[k] = { count: v.count, avg: v.count ? Math.round(v.totalMs / v.count) : 0, max: v.maxMs };
  });
  return out;
};
global.__instrumentWrapper = (routeId, fn) => instrumentHandler(fn, routeId);

// Load core routes with error handling
let authRoutes, userRoutes, contentRoutes, analyticsRoutes, adminRoutes, adminAnalyticsRoutes;
try {
  authRoutes = require("./authRoutes");
  console.log("✅ Auth routes loaded");
} catch (e) {
  authRoutes = express.Router();
  console.log("⚠️ Auth routes not found, using dummy router:", e.message);
}
try {
  userRoutes = require("./userRoutes");
  console.log("✅ User routes loaded");
} catch (e) {
  userRoutes = express.Router();
  console.log("⚠️ User routes not found, using dummy router:", e.message);
}
try {
  contentRoutes = require("./contentRoutes");
  console.log("✅ Content routes loaded");
} catch (e) {
  contentRoutes = express.Router();
  console.log("⚠️ Content routes not found, using dummy router:", e.message);
}
try {
  analyticsRoutes = require("./analyticsRoutes");
  console.log("✅ Analytics routes loaded");
} catch (e) {
  analyticsRoutes = express.Router();
  console.log("⚠️ Analytics routes not found, using dummy router:", e.message);
}
try {
  adminRoutes = require("./adminRoutes");
  console.log("✅ Admin routes loaded");
} catch (e) {
  adminRoutes = express.Router();
  console.log("⚠️ Admin routes not found, using dummy router:", e.message);
}
try {
  adminAnalyticsRoutes = require("./adminAnalyticsRoutes");
  console.log("✅ Admin analytics routes loaded");
} catch (e) {
  adminAnalyticsRoutes = express.Router();
  console.log("⚠️ Admin analytics routes not found, using dummy router:", e.message);
}
// Require acceptance middleware factory and auth middleware
let requireAcceptedTerms;
try {
  requireAcceptedTerms = require("./middlewares/requireAcceptedTerms");
} catch (e) {
  requireAcceptedTerms = null;
}
let authMiddleware;
try {
  authMiddleware = require("./authMiddleware");
} catch (e) {
  authMiddleware = (req, res, next) => next();
}
const viralGrowthRoutes = require("./routes/viralGrowthRoutes");
const engagementRoutes = require("./routes/engagementRoutes");
let monetizationRoutes;
try {
  monetizationRoutes = require("./routes/monetizationRoutes");
} catch (e) {
  monetizationRoutes = express.Router();
  console.log("⚠️ Monetization routes not found, using dummy router:", e.message);
}
const repostRoutes = require("./routes/repostRoutes");
let promotionTaskRoutes;
let metricsRoutes;
let tiktokRoutes;
let telegramRoutes;
let notificationsRoutes;
let captionsRoutes;
let adminCacheRoutes;
let adminOpsRoutes;
try {
  tiktokRoutes = require("../tiktokRoutes"); // use top-level tiktokRoutes which includes auth + storage
  console.log("✅ Using top-level tiktokRoutes.js");
} catch (e) {
  try {
    tiktokRoutes = require("./routes/tiktokRoutes"); // fallback to older location if present
    console.log("✅ Using legacy src/routes/tiktokRoutes.js");
  } catch (_) {
    tiktokRoutes = express.Router();
    console.log("⚠️ TikTok routes not found; using empty router");
  }
}
try {
  telegramRoutes = require("./routes/telegramRoutes");
  console.log("✅ Telegram routes loaded");
} catch (e) {
  telegramRoutes = express.Router();
  console.log("⚠️ Telegram routes not found:", e.message);
}

// Load social routers
let facebookRoutes, youtubeRoutes, instagramRoutes, twitterAuthRoutes, snapchatRoutes;
let platformConnectionsRoutes;
try {
  facebookRoutes = require("./routes/facebookRoutes");
  console.log("✅ Facebook routes loaded");
} catch (e) {
  console.log("⚠️ Facebook routes not found:", e.message);
  facebookRoutes = express.Router();
}
try {
  youtubeRoutes = require("./routes/youtubeRoutes");
  console.log("✅ YouTube routes loaded");
} catch (e) {
  console.log("⚠️ YouTube routes not found:", e.message);
  youtubeRoutes = express.Router();
}
try {
  twitterAuthRoutes = require("./routes/twitterAuthRoutes");
  console.log("✅ Twitter auth routes loaded");
} catch (e) {
  console.log("⚠️ Twitter auth routes not found:", e.message);
  twitterAuthRoutes = express.Router();
}
try {
  snapchatRoutes = require("./snapchatRoutes");
  console.log("✅ Snapchat routes loaded");
} catch (e) {
  console.log("⚠️ Snapchat routes not found:", e.message);
  snapchatRoutes = express.Router();
}
// Generic platform routes (status/auth placeholders for spotify, reddit, discord, linkedin, telegram, pinterest)
let platformRoutes = express.Router(); // default fallback
try {
  platformRoutes = require("./routes/platformRoutes");
  console.log("✅ Generic platform routes loaded");
} catch (e) {
  console.log("⚠️ Generic platform routes not found:", e.message);
  // keep the default express.Router()
}
try {
  promotionTaskRoutes = require("./routes/promotionTaskRoutes");
  console.log("✅ Promotion task routes loaded");
} catch (e) {
  console.log("⚠️ Promotion task routes not found:", e.message);
  promotionTaskRoutes = express.Router();
}
try {
  notificationsRoutes = require("./routes/notificationsRoutes");
  console.log("✅ Notifications routes loaded");
} catch (e) {
  console.log("⚠️ Notifications routes not found:", e.message);
  notificationsRoutes = express.Router();
}
try {
  captionsRoutes = require("./routes/captionsRoutes");
  console.log("✅ Captions routes loaded");
} catch (e) {
  console.log("⚠️ Captions routes not found:", e.message);
  captionsRoutes = express.Router();
}
// Intentionally not mounted in this instance; keep available for tests
void captionsRoutes;
try {
  adminCacheRoutes = require("./routes/adminCacheRoutes");
  console.log("✅ Admin cache routes loaded");
} catch (e) {
  console.log("⚠️ Admin cache routes not found:", e.message);
  adminCacheRoutes = express.Router();
}
try {
  metricsRoutes = require("./routes/metricsRoutes");
  console.log("✅ Metrics routes loaded");
} catch (e) {
  console.log("⚠️ Metrics routes not found:", e.message);
  metricsRoutes = express.Router();
}
try {
  instagramRoutes = require("./routes/instagramRoutes");
  console.log("✅ Instagram routes loaded");
} catch (e) {
  console.log("⚠️ Instagram routes not found:", e.message);
  instagramRoutes = express.Router();
}
// Load platform connections routes (may be optional)
try {
  platformConnectionsRoutes = require("./routes/platformConnectionsRoutes");
  console.log("✅ Platform connections routes loaded");
} catch (e) {
  console.log("⚠️ Platform connections routes not found:", e.message);
  platformConnectionsRoutes = express.Router();
}

// Try to load adminTestRoutes, but continue with a dummy router if not available
let adminTestRoutes;
try {
  adminTestRoutes = require("./adminTestRoutes");
} catch (error) {
  // Create a dummy router if the module is missing
  adminTestRoutes = express.Router();
  adminTestRoutes.get("/admin-test/health", (req, res) => {
    res.json({ status: "ok", message: "Admin test routes dummy endpoint" });
  });
}

// Load admin security routes
let adminSecurityRoutes;
try {
  adminSecurityRoutes = require("./routes/adminSecurityRoutes");
  console.log("✅ Admin security routes loaded");
} catch (e) {
  console.log("⚠️ Admin security routes not found:", e.message);
  adminSecurityRoutes = express.Router();
}

// Try to load optional route modules
let withdrawalRoutes;
let shortlinkRoutes;
let billingRoutes;
let paymentsStatusRoutes;
let paymentsExtendedRoutes;
let paypalWebhookRoutes;
// Stripe integration removed
let variantAdminRoutes;
let adminConfigRoutes;
let adminDashboardRoutes;
let adminBanditRoutes;
let abAdminRoutes;
let adminAlertsRoutes;
let adminEmailVerificationRoutes;
try {
  withdrawalRoutes = require("./routes/withdrawalRoutes");
} catch (error) {
  withdrawalRoutes = express.Router();
}

try {
  // Stripe integration removed
  // (removed empty try block)
  try {
    shortlinkRoutes = require("./routes/shortlinkRoutes");
    console.log("✅ Shortlink routes loaded");
  } catch (e) {
    shortlinkRoutes = express.Router();
    console.log("⚠️ Shortlink routes not found");
  }
  try {
    billingRoutes = require("./routes/billingRoutes");
    console.log("✅ Billing routes loaded");
  } catch (e) {
    billingRoutes = express.Router();
  }
  try {
    paymentsStatusRoutes = require("./routes/paymentsStatusRoutes");
    console.log("✅ Payments status routes loaded");
  } catch (e) {
    paymentsStatusRoutes = express.Router();
  }
  try {
    paymentsExtendedRoutes = require("./routes/paymentsExtendedRoutes");
    console.log("✅ Payments extended routes loaded");
  } catch (e) {
    paymentsExtendedRoutes = express.Router();
  }
  try {
    paypalWebhookRoutes = require("./routes/paypalWebhookRoutes");
    console.log("✅ PayPal webhook routes loaded");
  } catch (e) {
    paypalWebhookRoutes = express.Router();
  }
  let paypalSubscriptionRoutes;
  try {
    paypalSubscriptionRoutes = require("./routes/paypalSubscriptionRoutes");
    console.log("✅ PayPal subscription routes loaded");
  } catch (e) {
    paypalSubscriptionRoutes = express.Router();
    console.log("⚠️ PayPal subscription routes not found");
  }
  let viralBoostRoutes;
  try {
    viralBoostRoutes = require("./routes/viralBoostRoutes");
    console.log("✅ Viral boost routes loaded");
  } catch (e) {
    viralBoostRoutes = express.Router();
    console.log("⚠️ Viral boost routes not found");
  }
  let rewardsRoutes;
  try {
    rewardsRoutes = require("./routes/rewardsRoutes");
    console.log("✅ Rewards routes loaded");
  } catch (e) {
    rewardsRoutes = express.Router();
    console.log("⚠️ Rewards routes not found");
  }
  try {
    // Stripe integration removed
    // (removed empty try block)
    variantAdminRoutes = require("./routes/variantAdminRoutes");
    console.log("✅ Variant admin routes loaded");
  } catch (e) {
    variantAdminRoutes = express.Router();
    console.log("⚠️ Variant admin routes not found");
  }
  try {
    abAdminRoutes = require("./routes/abAdminRoutes");
    console.log("✅ AB admin routes loaded");
  } catch (e) {
    abAdminRoutes = express.Router();
    console.log("⚠️ AB admin routes not found");
  }
  try {
    adminConfigRoutes = require("./routes/adminConfigRoutes");
    console.log("✅ Admin config routes loaded");
  } catch (e) {
    adminConfigRoutes = express.Router();
    console.log("⚠️ Admin config routes not found");
  }
  try {
    adminDashboardRoutes = require("./routes/adminDashboardRoutes");
    console.log("✅ Admin dashboard routes loaded");
  } catch (e) {
    adminDashboardRoutes = express.Router();
    console.log("⚠️ Admin dashboard routes not found");
  }
  try {
    adminBanditRoutes = require("./routes/adminBanditRoutes");
    console.log("✅ Admin bandit routes loaded");
  } catch (e) {
    adminBanditRoutes = express.Router();
    console.log("⚠️ Admin bandit routes not found");
  }
  try {
    adminAlertsRoutes = require("./routes/adminAlertsRoutes");
    console.log("✅ Admin alerts routes loaded");
  } catch (e) {
    adminAlertsRoutes = express.Router();
    console.log("⚠️ Admin alerts routes not found");
  }
  try {
    adminOpsRoutes = require("./routes/adminOpsRoutes");
    console.log("✅ Admin ops routes loaded");
  } catch (e) {
    adminOpsRoutes = express.Router();
    console.log("⚠️ Admin ops routes not found");
  }
  try {
    adminEmailVerificationRoutes = require("./routes/adminEmailVerificationRoutes");
    console.log("✅ Admin email verification routes loaded");
  } catch (e) {
    adminEmailVerificationRoutes = express.Router();
    console.log("⚠️ Admin email verification routes not found");
  }

  let discordRoutes;
  try {
    discordRoutes = require("./routes/discordRoutes");
    console.log("✅ Discord routes loaded");
  } catch (e) {
    discordRoutes = express.Router();
    console.log("⚠️ Discord routes not found:", e.message);
  }

  // Import initialized Firebase services
  const { admin, db, auth, storage } = require("./firebaseAdmin");
  void admin; // some deployments don't use these directly in this file
  void auth;
  void storage;

  const app = express();
  // Attach Sentry request handler if Sentry initialized
  if (
    global.__sentry &&
    global.__sentry.Handlers &&
    typeof global.__sentry.Handlers.requestHandler === "function"
  ) {
    app.use(global.__sentry.Handlers.requestHandler());
  }
  // Honor X-Forwarded-* headers from Render/production proxies so req.protocol
  // reflects the original HTTPS scheme when we build OAuth redirect URLs.
  app.set("trust proxy", true);

  // CodeQL-recognizable rate limiters (express-rate-limit). These are additive to our
  // distributed limiter and provide a conservative global safety net to satisfy scanners.
  let codeqlLimiter = null;
  try {
    codeqlLimiter = require("./middlewares/codeqlRateLimit");
  } catch (_) {
    codeqlLimiter = null;
  }

  // Route-level limiter helper: prefer the global/distributed limiter if available,
  // otherwise fall back to the in-memory globalRateLimiter. If neither is
  // available (unlikely), use a noop passthrough to avoid breaking startup.
  let routeLimiter;
  try {
    routeLimiter = require("./middlewares/globalRateLimiter").rateLimiter;
  } catch (e) {
    routeLimiter =
      (_opts = {}) =>
      (req, res, next) =>
        next();
  }

  const statusPublicLimiter = routeLimiter({
    windowHint: "status_public",
    capacity: parseInt(process.env.RATE_LIMIT_STATUS_PUBLIC || "60", 10),
    refillPerSec: parseFloat(process.env.RATE_LIMIT_STATUS_REFILL || "6"),
  });

  // Facebook Data Deletion Instructions Page
  app.get("/facebook-data-deletion", (req, res) => {
    res.send(`
    <html>
      <head>
        <title>Facebook Data Deletion</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f9f9f9; }
          .container { max-width: 600px; margin: auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 2px 8px #ccc; }
          h1 { color: #4267B2; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Facebook Data Deletion Request</h1>
          <p>If you wish to delete your Facebook-related data from AutoPromote, please follow these steps:</p>
          <ol>
            <li>Send an email to <b>thulani@autopromote.org</b> with the subject "Facebook Data Deletion Request".</li>
            <li>Include your Facebook user ID and any relevant details in your message.</li>
            <li>We will process your request and delete your data as soon as possible, typically within 30 days.</li>
          </ol>
          <p>If you initiated this request from Facebook, your data will be deleted automatically as required by Facebook's policies.</p>
        </div>
      </body>
    </html>
  `);
  });
  const PORT = process.env.PORT || 5000; // Default to port 5000, Render will override with its own PORT

  // Attach request context (if available) then slow request logger
  try {
    app.use(require("./middlewares/requestContext"));
  } catch (_) {
    /* optional */
  }
  // Access log middleware - logs a single line per request with useful correlation fields
  app.use((req, res, next) => {
    try {
      const start = Date.now();
      const originalSend = res.send.bind(res);
      let bytes = 0;
      // wrap send to capture response size (best-effort)
      res.send = function (body) {
        try {
          if (typeof body === "string") bytes = Buffer.byteLength(body, "utf8");
          else if (Buffer.isBuffer(body)) bytes = body.length;
          else bytes = Buffer.byteLength(JSON.stringify(body || ""), "utf8");
        } catch (_) {
          bytes = 0;
        }
        return originalSend(body);
      };
      res.once("finish", () => {
        try {
          const duration = Date.now() - start;
          const ip =
            req.headers["x-forwarded-for"] ||
            req.ip ||
            (req.connection && req.connection.remoteAddress) ||
            "";
          const ua = req.headers["user-agent"] || "";
          const ts = new Date().toISOString();
          const uaClean = ua.replace(/"/g, "");
          const line =
            "[ACCESS] ts=" +
            ts +
            " " +
            req.method +
            " " +
            req.originalUrl +
            " status=" +
            res.statusCode +
            ' requestID="' +
            (req.requestId || "") +
            '" clientIP="' +
            ip +
            '" responseTimeMS=' +
            duration +
            " responseBytes=" +
            bytes +
            ' userAgent="' +
            uaClean +
            '"';
          logger.info(line);
          // Optional: write access log line to a daily file for security evidence (enable with LOG_EVENTS_TO_FILE=true)
          try {
            if (process.env.LOG_EVENTS_TO_FILE === "true") {
              const fs = require("fs");
              const p = require("path");
              const dir = p.join(__dirname, "../logs");
              try {
                fs.mkdirSync(dir, { recursive: true });
              } catch (_) {
                /* ignore */
              }
              const day = ts.slice(0, 10); // YYYY-MM-DD
              const file = p.join(dir, `access-${day}.log`);
              fs.appendFile(file, line + "\n", () => {});
            }
          } catch (_) {
            /* ignore file logging errors */
          }
        } catch (_) {}
      });
    } catch (_) {}
    next();
  });

  app.use(slowRequestLogger);
  // Lazy warmup trigger (will start warmup if not already and early request hits)
  try {
    app.use(ensureWarmup);
  } catch (_) {
    /* ignore */
  }
  // Micro-cache for status endpoints
  app.use(microCache);

  // CORS configuration - restrict origins to specific domains for security
  // Support env override via CORS_ALLOWED_ORIGINS (comma-separated) and CORS_ALLOW_ALL
  const defaultAllowedOrigins = [
    // Canonical custom domain (www + apex)
    "https://www.autopromote.org",
    "https://autopromote.org",
    // Legacy/onrender domains kept for backward compatibility during transition
    "https://autopromote-1.onrender.com",
    "https://autopromote.onrender.com",
    process.env.NODE_ENV === "development" ? "http://localhost:3000" : null,
  ].filter(Boolean);
  const envAllowed = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowed]));
  const allowAll = process.env.CORS_ALLOW_ALL === "true";

  const corsOptions = {
    origin: function (origin, callback) {
      try {
        logger.debug("[cors.origin] origin:", origin, "allowAll:", allowAll);
      } catch (e) {}
      // Allow requests with no origin (like mobile apps or curl requests).
      if (!origin) return callback(null, true);
      // In development or when allowAll is set, also treat the string 'null' as no-origin and allow it.
      if (origin === "null" && (allowAll || process.env.NODE_ENV === "development"))
        return callback(null, true);
      if (allowAll || allowedOrigins.includes(origin)) {
        try {
          logger.debug("[cors.origin] -> allowed");
        } catch (e) {}
        return callback(null, true);
      }
      logger.warn("[cors.origin] -> blocked", origin);
      try {
        logger.warn("[cors.origin] -> stack", new Error("origin-blocked").stack);
      } catch (e) {}
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "x-correlation-id",
      "x-request-id",
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  };
  logger.debug(
    "[diagnostic] CORS allowAll:",
    allowAll,
    "allowedOrigins:",
    allowedOrigins.join(",")
  );

  // Proactively set Vary header for caches and handle preflight explicitly
  app.use((req, res, next) => {
    res.setHeader("Vary", "Origin");
    next();
  });
  // Debug: Log inbound upload related requests and headers (helps debug CORS/preflight)
  app.use((req, res, next) => {
    try {
      if (
        req.path === "/api/content/upload" ||
        (req.headers && req.headers.origin && req.headers.origin.includes("127.0.0.1"))
      ) {
        // Log a summarized set of headers for the upload route to help identify why requests are blocked by CORS
        const sampleHeaders = {
          origin: req.headers.origin,
          host: req.headers.host,
          "user-agent": req.headers["user-agent"],
          referer: req.headers.referer,
          "content-type": req.headers["content-type"],
        };
        logger.debug(
          "[request.debug] method:",
          req.method,
          "path:",
          req.path,
          "headers:",
          sampleHeaders
        );
      }
    } catch (e) {}
    next();
  });
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  // Extra debug: For upload route, log incoming requests and ensure we capture any 403 responses
  app.use((req, res, next) => {
    if (req.path === "/api/content/upload") {
      res.once("finish", () => {
        if (res.statusCode === 403) {
          try {
            console.warn(
              "[upload.403] request finished with 403; headers:",
              JSON.stringify({
                origin: req.headers.origin,
                host: req.headers.host,
                ua: req.headers["user-agent"],
              })
            );
          } catch (e) {}
        }
      });
    }
    next();
  });

  // Debug: optional header echo endpoint to inspect request headers for debugging
  if (process.env.DEBUG_HEADERS === "true") {
    app.get("/api/debug/headers", (req, res) => {
      try {
        return res.json({ headers: req.headers });
      } catch (e) {
        return res.status(500).json({ error: "Failed to read headers" });
      }
    });
  }
  // Optional: enforce canonical host redirect to avoid duplicate origins (controlled via env)
  // Set ENFORCE_CANONICAL_HOST=true and CANONICAL_HOST=www.autopromote.org to enable
  if (process.env.ENFORCE_CANONICAL_HOST === "true" && process.env.CANONICAL_HOST) {
    const canonicalHost = process.env.CANONICAL_HOST;
    app.use((req, res, next) => {
      try {
        const host = req.headers.host;
        if (host && host !== canonicalHost) {
          const target = `${req.protocol}://${canonicalHost}${req.originalUrl}`;
          return res.redirect(308, target);
        }
      } catch (_) {
        /* ignore */
      }
      next();
    });
  }
  // Apply compression if installed
  if (compression) app.use(compression());
  // Apply security headers with CSP
  if (helmet) {
    // In production we disallow 'unsafe-inline' for scripts/styles to improve CSP security.
    const allowUnsafeInline = process.env.NODE_ENV !== "production";
    const scriptSrc = allowUnsafeInline ? ["'self'", "'unsafe-inline'"] : ["'self'"];
    const styleSrc = allowUnsafeInline ? ["'self'", "'unsafe-inline'"] : ["'self'"];
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc,
            styleSrc,
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
              "'self'",
              "https://*.firebase.com",
              "https://*.googleapis.com",
              "https://*.paypal.com",
              "https://*.tiktok.com",
              "https://*.telegram.org",
              "https://api.telegram.org",
              "https://*.reddit.com",
              "https://*.discord.com",
              "https://*.spotify.com",
              "https://*.linkedin.com",
              "https://api.linkedin.com",
            ],
            frameSrc: [
              "'self'",
              "https://*.tiktok.com",
              "https://*.telegram.org",
              "https://oauth.telegram.org",
              "https://*.reddit.com",
              "https://*.discord.com",
              "https://*.spotify.com",
              "https://*.linkedin.com",
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        },
        crossOriginEmbedderPolicy: false,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        noSniff: true,
        xssFilter: true,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      })
    );
  }
  try {
    app.use(require("./middlewares/securityHeaders")());
  } catch (_) {}
  // Apply helmet (relaxed CSP off for React inline styles) & compression if available
  // Note: Second helmet call removed to avoid conflicts with the first comprehensive configuration
  if (compression) app.use(compression());
  // Discord interactions require the raw body for signature verification, so parse them before the global JSON middleware.
  app.use(
    "/api/discord/interactions",
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    })
  );
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb", parameterLimit: 1000 }));

  // Correlation ID middleware (K)
  app.use((req, res, next) => {
    const incoming = req.headers["x-correlation-id"] || req.headers["x-request-id"];
    const cid = incoming || require("crypto").randomUUID();
    req.correlationId = cid;
    res.setHeader("x-correlation-id", cid);
    next();
  });

  // API Routes
  // Prefer distributed limiter if Redis available, else fallback
  try {
    const { distributedRateLimiter } = require("./middlewares/distributedRateLimiter");
    app.use("/api/", distributedRateLimiter({}));
    console.log("✅ Distributed rate limiter active");
  } catch (e) {
    try {
      const { rateLimiter } = require("./middlewares/globalRateLimiter");
      app.use("/api/", rateLimiter({}));
      console.log("⚠️ Fallback to in-memory rate limiter");
    } catch (_) {}
  }
  // Also apply a general express-rate-limit layer so static analyzers detect protection
  if (codeqlLimiter && codeqlLimiter.general) {
    app.use("/api/", codeqlLimiter.general);
    console.log("✅ CodeQL general rate limiter applied at /api/");
  }
  app.use("/api/auth", authRoutes);
  if (codeqlLimiter && codeqlLimiter.auth) {
    app.use("/api/auth", codeqlLimiter.auth);
  }
  app.use("/api/users", userRoutes);
  if (codeqlLimiter && codeqlLimiter.writes) {
    app.use("/api/users", codeqlLimiter.writes);
  }
  // Require latest terms before allowing access to content routes
  if (requireAcceptedTerms) {
    app.use(
      "/api/content",
      routeLimiter({ windowHint: "content" }),
      authMiddleware,
      requireAcceptedTerms({ version: process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0" }),
      contentRoutes
    );
  } else {
    app.use("/api/content", routeLimiter({ windowHint: "content" }), contentRoutes);
  }
  app.use("/api/analytics", routeLimiter({ windowHint: "analytics" }), analyticsRoutes);
  app.use("/api/admin", routeLimiter({ windowHint: "admin" }), adminRoutes);
  app.use("/api/admin/security", adminSecurityRoutes);
  app.use("/api/admin/analytics", adminAnalyticsRoutes);
  app.use("/api/engagement", engagementRoutes);
  app.use("/api/monetization", monetizationRoutes);
  // Internal endpoints (accept lightweight payloads from frontend instrumentation)
  try {
    app.use("/api/internal", require("./routes/frontendLogsRoutes"));
  } catch (e) {
    logger.warn("Failed to mount /api/internal routes", e && e.message);
  }
  try {
    app.use("/api/usage", routeLimiter({ windowHint: "usage" }), require("./routes/usageRoutes"));
  } catch (e) {
    console.warn("usageRoutes mount failed:", e.message);
  }
  app.use("/api/repost", repostRoutes);
  try {
    app.use("/api/admin/metrics", require("./routes/adminMetricsRoutes"));
  } catch (e) {
    console.warn("adminMetricsRoutes mount failed:", e.message);
  }
  // Aggregate status (composed) routes
  try {
    app.use("/api/status", require("./routes/aggregateStatusRoutes"));
  } catch (e) {
    console.warn("aggregateStatusRoutes mount failed:", e.message);
  }
  try {
    app.use("/api", adminTestRoutes); // Add admin test routes
  } catch (e) {
    console.warn("Admin test routes mount failed:", e.message);
  }
  // Mount TikTok routes if available (explicit per-mount rate limiter to satisfy scanners)
  app.use(
    "/api/tiktok",
    routeLimiter({ windowHint: "tiktok" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    tiktokRoutes
  );
  console.log("🚏 TikTok routes mounted at /api/tiktok");
  // Mount Telegram routes
  app.use(
    "/api/telegram",
    routeLimiter({ windowHint: "telegram" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    telegramRoutes
  );
  console.log("🚏 Telegram routes mounted at /api/telegram");
  // Mount new social routes
  app.use(
    "/api/facebook",
    routeLimiter({ windowHint: "facebook" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    facebookRoutes
  );
  console.log("🚏 Facebook routes mounted at /api/facebook");
  app.use(
    "/api/youtube",
    routeLimiter({ windowHint: "youtube" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    youtubeRoutes
  );
  console.log("🚏 YouTube routes mounted at /api/youtube");
  app.use(
    "/api/twitter",
    routeLimiter({ windowHint: "twitter" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    twitterAuthRoutes
  );
  console.log("🚏 Twitter routes mounted at /api/twitter");
  // Mount Snapchat routes
  app.use(
    "/api/snapchat",
    routeLimiter({ windowHint: "snapchat" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    snapchatRoutes
  );
  console.log("🚏 Snapchat routes mounted at /api/snapchat");
  app.use(
    "/api/platform",
    routeLimiter({ windowHint: "platform" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    platformConnectionsRoutes
  );
  console.log("🚏 Platform connections routes mounted at /api/platform");
  // Community social feed routes
  try {
    const communityRoutes = require("./routes/communityRoutes");
    app.use(
      "/api/community",
      routeLimiter({ windowHint: "community" }),
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      communityRoutes
    );
    console.log("🚏 Community feed routes mounted at /api/community");
  } catch (e) {
    console.log("⚠️ Community routes mount failed:", e.message);
  }
  // Viral growth routes
  try {
    app.use(
      "/api/viral",
      routeLimiter({ windowHint: "viral" }),
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      viralGrowthRoutes
    );
    console.log("🚏 Viral growth routes mounted at /api/viral");
  } catch (e) {
    console.log("⚠️ Viral growth routes mount failed:", e.message);
  }
  // AI Clip generation routes
  try {
    const clipRoutes = require("./routes/clipRoutes");
    app.use(
      "/api/clips",
      routeLimiter({ windowHint: "clips" }),
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      clipRoutes
    );
    console.log("🚏 AI Clip generation routes mounted at /api/clips");
  } catch (e) {
    console.log("⚠️ Clip routes mount failed:", e.message);
  }
  // AI Chat routes
  try {
    const chatRoutes = require("./routes/chatRoutes");
    app.use(
      "/api/chat",
      routeLimiter({ windowHint: "chat" }),
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      chatRoutes
    );
    console.log("🚏 AI Chat routes mounted at /api/chat");
  } catch (e) {
    console.log("⚠️ Chat routes mount failed:", e.message);
  }

  // PayPal routes
  try {
    const paypalRoutes = require("./routes/paypalRoutes");
    app.use("/api/paypal-subscriptions", paypalRoutes);
    console.log("🚏 PayPal subscription routes mounted at /api/paypal-subscriptions");
  } catch (e) {
    console.log("⚠️ PayPal routes mount failed:", e.message);
  }

  // Fallback handler: return default free subscription status when the PayPal status
  // endpoint is missing or not reachable in the deployed environment. This keeps the
  // frontend stable and avoids console errors while we investigate root causes.
  app.get("/api/paypal-subscriptions/status", (req, res) => {
    try {
      console.warn("[PayPal][fallback] Returning default free subscription status (fallback)");
      return res.json({
        success: true,
        subscription: {
          planId: "free",
          planName: "Free",
          status: "active",
          features: {
            uploads: 50,
            communityPosts: 20,
            aiClips: true,
            analytics: "basic",
            support: "community",
          },
        },
      });
    } catch (err) {
      console.error(
        "[PayPal][fallback] Error returning fallback status:",
        err && err.stack ? err.stack : err
      );
      return res.status(500).json({ error: "Failed to return fallback subscription status" });
    }
  });

  // Assistant routes (scaffold) - gated by ASSISTANT_ENABLED env variable
  try {
    const assistantRoutes = require("./routes/assistantRoutes");
    app.use(
      "/api/assistant",
      routeLimiter({ windowHint: "assistant" }),
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      authMiddleware,
      assistantRoutes
    );
    console.log(
      "🚏 Assistant routes mounted at /api/assistant (ASSISTANT_ENABLED must be true to respond)"
    );
  } catch (e) {
    console.log("⚠️ Assistant routes mount failed:", e.message);
  }
  // Mount generic platform routes under /api so frontend placeholder endpoints like
  // /api/spotify/auth/start and /api/spotify/status are handled by the generic router.
  try {
    app.use(
      "/api",
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      platformRoutes
    );
    console.log("🚏 Generic platform routes mounted at /api/:platform/*");
  } catch (e) {
    console.log("⚠️ Failed to mount generic platform routes:", e.message);
  }
  app.use(
    "/api/promotion-tasks",
    routeLimiter({ windowHint: "promotion_tasks" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    promotionTaskRoutes
  );
  console.log("🚏 Promotion task routes mounted at /api/promotion-tasks");
  app.use(
    "/api/metrics",
    routeLimiter({ windowHint: "metrics" }),
    codeqlLimiter && codeqlLimiter.general ? codeqlLimiter.general : (req, res, next) => next(),
    metricsRoutes
  );
  console.log("🚏 Metrics routes mounted at /api/metrics");
  app.use(
    "/api/instagram",
    routeLimiter({ windowHint: "instagram" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    instagramRoutes
  );
  console.log("🚏 Instagram routes mounted at /api/instagram");
  app.use(
    "/api/notifications",
    routeLimiter({ windowHint: "notifications" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    notificationsRoutes
  );
  console.log("🚏 Notifications routes mounted at /api/notifications");
  // AI Caption Generation routes
  try {
    const captionRoutes = require("./routes/captionRoutes");
    app.use(
      "/api/captions",
      routeLimiter({ windowHint: "captions" }),
      codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
      captionRoutes
    );
    console.log("🚏 AI Caption generation routes mounted at /api/captions");
  } catch (e) {
    console.log("⚠️ Caption routes mount failed:", e.message);
  }
  // System Diagnostics routes
  try {
    const systemDiagnosticsRoutes = require("./routes/systemDiagnosticsRoutes");
    app.use("/api/diagnostics", systemDiagnosticsRoutes);
    console.log("🔍 System diagnostics routes mounted at /api/diagnostics");
  } catch (e) {
    console.log("⚠️ Diagnostics routes mount failed:", e.message);
  }
  app.use("/api/admin/cache", adminCacheRoutes);
  console.log("🚏 Admin cache routes mounted at /api/admin/cache");

  // Content Quality Check Route
  try {
    const contentQualityCheck = require("./contentQualityCheck");
    app.use("/api/content", contentQualityCheck);
  } catch (e) {
    console.warn("Content quality check route not available:", e.message);
  }

  // AfterDark (adult) area removed from codebase per repository policy.

  // Register optional routes
  app.use("/api/withdrawals", routeLimiter({ windowHint: "withdrawals" }), withdrawalRoutes);
  app.use("/api/monetization", routeLimiter({ windowHint: "monetization" }), monetizationRoutes);
  // Stripe integration removed
  app.use("/s", shortlinkRoutes);
  // Require latest terms before allowing access to billing routes
  if (requireAcceptedTerms) {
    app.use(
      "/api/billing",
      authMiddleware,
      requireAcceptedTerms({ version: process.env.REQUIRED_TERMS_VERSION || "AUTOPROMOTE-v1.0" }),
      billingRoutes
    );
  } else {
    app.use("/api/billing", billingRoutes);
  }
  app.use(
    "/api/payments",
    routeLimiter({ windowHint: "payments" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    paymentsStatusRoutes
  );
  app.use(
    "/api/payments",
    routeLimiter({ windowHint: "payments" }),
    codeqlLimiter && codeqlLimiter.writes ? codeqlLimiter.writes : (req, res, next) => next(),
    paymentsExtendedRoutes
  );
  app.use("/api/paypal", paypalWebhookRoutes);
  // Fallback lightweight status endpoint to avoid 404s from frontends if the
  // full PayPal router isn't available in a particular deploy variant.
  try {
    // Lightweight, tolerant status endpoint: accepts optional Bearer ID token.
    app.get("/api/paypal-subscriptions/status", async (req, res) => {
      try {
        const { db, admin } = require("./firebaseAdmin");
        let userId = req.userId || (req.user && req.user.uid) || null;

        // If no user from middleware, attempt to verify Authorization Bearer token (if provided)
        if (!userId) {
          try {
            const authHeader =
              (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
            if (authHeader && authHeader.startsWith("Bearer ")) {
              const idToken = authHeader.slice(7).trim();
              if (idToken) {
                try {
                  const decoded = await admin.auth().verifyIdToken(idToken);
                  userId = decoded && decoded.uid;
                } catch (vtErr) {
                  // token invalid/expired; we'll treat as unauthenticated below
                }
              }
            }
          } catch (e) {
            // ignore verification errors
          }
        }

        // If still no user, return default free subscription so frontend doesn't 404
        if (!userId) {
          return res.json({
            success: true,
            subscription: { planId: "free", planName: "Free", status: "active", features: {} },
          });
        }

        let subDoc;
        try {
          subDoc = await db.collection("user_subscriptions").doc(userId).get();
        } catch (e) {
          return res.json({
            success: true,
            subscription: { planId: "free", planName: "Free", status: "active", features: {} },
          });
        }

        if (!subDoc.exists) {
          return res.json({
            success: true,
            subscription: { planId: "free", planName: "Free", status: "active", features: {} },
          });
        }

        const subscription = subDoc.data();
        return res.json({
          success: true,
          subscription: {
            planId: subscription.planId,
            planName: subscription.planName,
            status: subscription.status,
            amount: subscription.amount,
            currency: subscription.currency,
            nextBillingDate: subscription.nextBillingDate,
            features: subscription.features,
            cancelledAt: subscription.cancelledAt,
            expiresAt: subscription.expiresAt,
          },
        });
      } catch (err) {
        console.error("[PayPal-Fallback] status handler error:", err);
        return res.status(500).json({ error: "Failed to fetch subscription status" });
      }
    });
  } catch (e) {
    // If authMiddleware or firebaseAdmin are not available in this runtime,
    // do nothing; the normal router may be mounted elsewhere.
    console.warn("PayPal fallback status route not mounted:", e && e.message);
  }

  app.use(
    "/api/paypal-subscriptions",
    routeLimiter({ windowHint: "paypal_subscriptions" }),
    paypalSubscriptionRoutes
  );
  app.use("/api/viral-boost", routeLimiter({ windowHint: "viral_boost" }), viralBoostRoutes);
  app.use("/api/rewards", routeLimiter({ windowHint: "rewards" }), rewardsRoutes);
  try {
    const adsRoutes = require("./routes/adsRoutes");
    app.use("/api/ads", routeLimiter({ windowHint: "ads" }), adsRoutes);
    console.log("📢 Ads routes mounted at /api/ads");
  } catch (e) {
    console.warn("⚠️ Ads routes mount failed:", e.message);
  }
  // Stripe integration removed
  app.use("/api/admin/variants", variantAdminRoutes);
  app.use("/api/admin/ab_tests", abAdminRoutes);
  app.use("/api/admin/config", adminConfigRoutes);
  app.use("/api/admin/dashboard", adminDashboardRoutes);
  app.use("/api/admin/bandit", adminBanditRoutes);
  app.use("/api/admin/alerts", adminAlertsRoutes);
  app.use("/api/admin/ops", adminOpsRoutes);
  app.use("/api/admin", adminEmailVerificationRoutes);

  // New admin routes
  try {
    app.use("/api/admin/community", require("./routes/adminCommunityRoutes"));
  } catch (e) {
    console.warn("adminCommunityRoutes mount failed:", e.message);
  }
  try {
    app.use("/api/admin/system", require("./routes/adminSystemRoutes"));
  } catch (e) {
    console.warn("adminSystemRoutes mount failed:", e.message);
  }
  try {
    app.use("/api/admin/audit", require("./routes/adminAuditRoutes"));
  } catch (e) {
    console.warn("adminAuditRoutes mount failed:", e.message);
  }
  try {
    app.use("/api/admin/support", require("./routes/adminSupportRoutes"));
  } catch (e) {
    console.warn("adminSupportRoutes mount failed:", e.message);
  }
  try {
    app.use("/api/admin/approval", require("./routes/adminContentApprovalRoutes"));
  } catch (e) {
    console.warn("adminContentApprovalRoutes mount failed:", e.message);
  }
  try {
    app.use("/api/admin/analytics", require("./routes/adminAnalyticsRoutes"));
  } catch (e) {
    console.warn("adminAnalyticsRoutes mount failed:", e.message);
  }

  app.use("/api/discord", discordRoutes);

  // Debugging endpoint to expose installed dependency versions for investigation.
  // Disabled by default. To enable, set DEBUG_DEPS_TOKEN in env and call with header `x-debug-token: <token>`.
  if (process.env.DEBUG_DEPS_TOKEN) {
    app.get("/api/debug/deps", async (req, res) => {
      try {
        const token = req.headers["x-debug-token"] || "";
        if (!token || token !== process.env.DEBUG_DEPS_TOKEN)
          return res.status(403).json({ error: "forbidden" });
        const fs = require("fs");
        const path = require("path");
        const out = { found: {} };
        try {
          const gaxPkg = require("google-gax/package.json");
          out.found["google-gax"] = {
            version: gaxPkg.version,
            path: require.resolve("google-gax"),
          };
        } catch (e) {
          out.found["google-gax"] = { error: e.message };
        }
        try {
          const grpcPkg = require("@grpc/grpc-js/package.json");
          const grpcPath = require.resolve("@grpc/grpc-js");
          let single = false;
          try {
            const p = path.join(
              path.dirname(require.resolve("@grpc/grpc-js/package.json")),
              "build",
              "src",
              "single-subchannel-channel.js"
            );
            single = fs.existsSync(p);
          } catch (ee) {
            single = false;
          }
          out.found["@grpc/grpc-js"] = {
            version: grpcPkg.version,
            path: grpcPath,
            hasSingleSubchannel: single,
          };
        } catch (e) {
          out.found["@grpc/grpc-js"] = { error: e.message };
        }
        return res.json(out);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    });
  }

  // Serve site verification and other well-known files
  // 1) Try root-level /public/.well-known
  app.use("/.well-known", express.static(path.join(__dirname, "../public/.well-known")));
  // 2) Fallback to /docs/.well-known (used for GitHub Pages and documentation hosting)
  app.use("/.well-known", express.static(path.join(__dirname, "../docs/.well-known")));

  // Public demo page for TikTok reviewers
  try {
    app.get("/tiktok-demo", (req, res) => {
      try {
        const fs = require("fs");
        const demoPath = path.join(__dirname, "../docs/tiktok-demo.html");
        let html = fs.readFileSync(demoPath, "utf8");
        const clientKey = process.env.TIKTOK_SANDBOX_CLIENT_KEY || "";
        html = html.replace(/{{TIKTOK_SANDBOX_CLIENT_KEY}}/g, clientKey);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      } catch (e) {
        return res.sendFile(path.join(__dirname, "../docs/tiktok-demo.html"));
      }
    });
    console.log("✅ Demo page available at /tiktok-demo");
  } catch (e) {
    console.warn("⚠️ /tiktok-demo route not available:", e.message);
  }

  // Mock TikTok OAuth frontend for testing
  try {
    app.get("/mock/tiktok_oauth_frontend.html", (req, res) => {
      return res.sendFile(path.join(__dirname, "../docs/mock/tiktok_oauth_frontend.html"));
    });
    console.log("✅ Mock TikTok OAuth frontend available at /mock/tiktok_oauth_frontend.html");
  } catch (e) {
    console.warn("⚠️ Mock TikTok OAuth frontend route not available:", e.message);
  }

  // Explicit root-level routes for TikTok verification variations
  const sendFirstExisting = (res, candidates) => {
    const fs = require("fs");
    try {
      const allowedBases = [
        path.join(__dirname, "../public/.well-known/"),
        path.join(__dirname, "../docs/.well-known/"),
      ];
      for (const p of candidates) {
        try {
          if (!fs.existsSync(p)) continue;
          const resolved = path.resolve(p);
          // Ensure the resolved path is inside one of the allowed base directories
          const ok = allowedBases.some(base => resolved.startsWith(path.resolve(base)));
          if (!ok) continue;
          res.sendFile(resolved);
          return true;
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* ignore whole helper failures */
    }
    return false;
  };

  app.get(
    ["/tiktok-developers-site-verification.txt", "/tiktok-site-verification.txt"],
    (req, res) => {
      const targetFile = req.path.endsWith("developers-site-verification.txt")
        ? "tiktok-developers-site-verification.txt"
        : "tiktok-site-verification.txt";
      const candidates = [
        path.join(__dirname, "../public/.well-known/", targetFile),
        path.join(__dirname, "../docs/.well-known/", targetFile),
      ];
      // If static files missing, fall back to environment-provided verification token
      const sent = sendFirstExisting(res, candidates);
      if (sent) return sent;
      const token =
        process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION ||
        process.env.TIKTOK_VERIFICATION_TOKEN ||
        "";
      if (token) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.send(`tiktok-developers-site-verification=${token}`);
      }
      return res.status(404).send("Not found");
    }
  );

  // Wildcard for TikTok URL prefix verification files e.g. /tiktokXYZ123.txt
  app.get(/^\/tiktok.*\.txt$/, (req, res) => {
    const filename = req.path.replace("/", "");
    const candidates = [
      path.join(__dirname, "../public/.well-known/", filename),
      path.join(__dirname, "../docs/.well-known/", filename),
    ];
    const sent = sendFirstExisting(res, candidates);
    if (sent) return sent;
    // Handle pattern like /tiktok<TOKEN>.txt by checking env var or exact filename mapping
    const envToken =
      process.env.TIKTOK_VERIFICATION_TOKEN || process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION;
    if (envToken) {
      // If the request matches the pattern /tiktok<TOKEN>.txt where <TOKEN> equals envToken, return it
      const expectedName = `tiktok${envToken}.txt`;
      if (filename === expectedName || filename === `tiktok${envToken}.txt`) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.send(`tiktok-developers-site-verification=${envToken}`);
      }
    }
    return res.status(404).send("Not found");
  });

  // Legal policy pages
  app.get("/privacy", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/legal/privacy.html"));
  });

  app.get("/terms-of-service", routeLimiter({ windowHint: "legal" }), (req, res) => {
    res.sendFile(path.join(__dirname, "../public/legal/terms.html"));
  });

  app.get(["/privacy-policy"], routeLimiter({ windowHint: "legal" }), (req, res) => {
    res.sendFile(path.join(__dirname, "../public/legal/privacy.html"));
  });

  app.get("/data-deletion", routeLimiter({ windowHint: "legal" }), (req, res) => {
    res.sendFile(path.join(__dirname, "../docs/data-deletion.html"));
  });

  // Serve/redirect common favicon paths so clients can find the logo without
  // requiring a fresh frontend build. Prefer an explicit file serve for SVG
  // then redirect common legacy names to it.
  app.get("/favicon.svg", (req, res) => {
    return res.sendFile(path.join(__dirname, "../frontend/public/favicon.svg"));
  });
  app.get("/favicon.png", (req, res) => {
    try {
      const logoPath = path.join(
        __dirname,
        "../frontend/public",
        "WhatsApp Image 2025-10-03 at 10.19.41.jpeg"
      );
      res.setHeader("Content-Type", "image/jpeg");
      return res.sendFile(logoPath, err => {
        if (err) {
          console.error("[favicon] sendFile error:", err && err.message ? err.message : err);
          return res.status(404).end();
        }
      });
    } catch (e) {
      console.error("[favicon] unexpected error:", e && e.message ? e.message : e);
      return res.status(500).end();
    }
  });
  app.get("/favicon.ico", (req, res) => {
    return res.redirect(302, "/favicon.svg");
  });
  // Serve the uploaded JPEG directly at its original filename so requests
  // like `/WhatsApp%20Image%202025-10-03%20at%2010.19.41.jpeg` succeed.
  app.get("/WhatsApp Image 2025-10-03 at 10.19.41.jpeg", (req, res) => {
    try {
      const p = path.join(
        __dirname,
        "../frontend/public",
        "WhatsApp Image 2025-10-03 at 10.19.41.jpeg"
      );
      res.setHeader("Content-Type", "image/jpeg");
      return res.sendFile(p, err => {
        if (err) {
          console.error(
            "[static-fallback] sendFile error for uploaded logo:",
            err && err.message ? err.message : err
          );
          return res.status(404).end();
        }
      });
    } catch (e) {
      console.error("[static-fallback] unexpected error:", e && e.message ? e.message : e);
      return res.status(500).end();
    }
  });

  // Serve static files from the React app build directory
  app.use(express.static(path.join(__dirname, "../frontend/build")));

  // Warn if the frontend build is missing (helps diagnose deploys like Render where build step may be omitted)
  try {
    const fs = require("fs");
    const frontIndex = path.join(__dirname, "../frontend/build", "index.html");
    if (!fs.existsSync(frontIndex)) {
      console.warn(
        `[startup] Frontend build not found at ${frontIndex}. Static SPA will return 404 for root. Ensure 'npm --prefix frontend run build' runs during deploy.`
      );
    }

    // If the frontend build is missing, add a narrow safety middleware to ensure API calls
    // that might otherwise hit the SPA catch-all receive a JSON fallback instead of HTML.
    if (!fs.existsSync(frontIndex)) {
      const defaultAnalyticsFallback = {
        totalRevenue: 0,
        dailyBreakdown: [],
        totalTransactions: 0,
        averageRevenuePerTransaction: 0,
        revenueByMonth: [],
        byContentType: {},
        transactionTrends: {},
        _fallback: true,
        error: "frontend_build_missing",
      };

      app.use((req, res, next) => {
        try {
          // Only intercept API paths and only the revenue analytics endpoint to avoid masking other issues
          if (req.path && req.path.startsWith("/api/monetization/revenue-analytics")) {
            return res.status(200).json(defaultAnalyticsFallback);
          }
        } catch (e) {
          /* noop */
        }
        return next();
      });
    }
  } catch (e) {
    /* ignore */
  }

  // Serve the admin test HTML file
  app.get("/admin-test", routeLimiter({ windowHint: "admin_static" }), (req, res) => {
    // Check if file exists before sending
    try {
      res.sendFile(path.join(__dirname, "../public", "admin-test.html"));
    } catch (error) {
      res.send(
        "<html><body><h1>Admin Test Page</h1><p>The actual test page is not available.</p></body></html>"
      );
    }
  });

  // Serve the admin login page (only accessible by direct URL - not linked from UI)
  app.get("/admin-login", routeLimiter({ windowHint: "admin_static" }), (req, res) => {
    // Check if file exists before sending
    try {
      res.sendFile(path.join(__dirname, "../public", "admin-login.html"));
    } catch (error) {
      res.send(
        "<html><body><h1>Admin Login</h1><p>The actual login page is not available.</p></body></html>"
      );
    }
  });

  // Serve the admin dashboard (protected in frontend by auth check)
  app.get("/admin-dashboard", routeLimiter({ windowHint: "admin_static" }), (req, res) => {
    // Check if file exists before sending
    try {
      const fs = require("fs");
      const frontIndexPath = path.join(__dirname, "../frontend/build", "index.html");
      if (!fs.existsSync(frontIndexPath)) {
        console.warn(
          `[startup] Frontend build not found at ${frontIndexPath}. Run 'npm --prefix frontend run build' during deploy.`
        );
        return res.send(
          "<html><body><h1>Admin Dashboard</h1><p>The actual dashboard is not available.</p></body></html>"
        );
      }
      return res.sendFile(frontIndexPath);
    } catch (error) {
      console.warn(
        "[startup] admin-dashboard sendFile error:",
        error && error.message ? error.message : error
      );
      res.send(
        "<html><body><h1>Admin Dashboard</h1><p>The actual dashboard is not available.</p></body></html>"
      );
    }
  });

  // Redirect /pricing to the SPA hash route so direct navigation doesn't 404
  app.get(["/pricing", "/pricing/*"], (req, res) => {
    try {
      return res.redirect(302, "/#/pricing");
    } catch (e) {
      console.error("[server] /pricing redirect error", e && e.message ? e.message : e);
      return res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
    }
  });

  // Redirect /dashboard to the SPA hash route so PayPal return URLs won't 404
  app.get(["/dashboard", "/dashboard/*"], (req, res) => {
    try {
      const qs =
        req.originalUrl && req.originalUrl.includes("?")
          ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
          : "";
      return res.redirect(302, "/#/dashboard" + qs);
    } catch (e) {
      console.error("[server] /dashboard redirect error", e && e.message ? e.message : e);
      return res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
    }
  });

  // Health check endpoint (supports verbose diagnostics via ?verbose=1 or header x-health-verbose=1)
  // Simple version endpoint (package version + commit hash if available)
  app.get("/api/version", statusPublicLimiter, (_req, res) => {
    let pkgVersion = null;
    try {
      pkgVersion = require("../package.json").version;
    } catch (_) {}
    const commit =
      process.env.GIT_COMMIT ||
      process.env.COMMIT_HASH ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      null;
    return res.json({
      ok: true,
      version: pkgVersion,
      commit,
      generatedAt: new Date().toISOString(),
    });
  });

  // Ultra-lightweight ping for uptime monitors (avoid heavy Firestore reads)
  app.get("/api/ping", statusPublicLimiter, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true, ts: Date.now() });
  });

  // Test Sentry capture: sends a test event to Sentry and returns status
  app.get("/api/test/sentry", statusPublicLimiter, async (req, res) => {
    try {
      const { captureException } = require("./sentry");
      const testError = new Error("Sentry test event from /api/test/sentry");
      // Optionally attach a user if request contains test token
      try {
        if (
          req.headers &&
          req.headers.authorization &&
          typeof req.headers.authorization === "string"
        ) {
          const t = req.headers.authorization.replace(/^Bearer\s+/i, "");
          if (t.startsWith("test-token-for-"))
            captureException(new Error("Sentry test: user:" + t.replace("test-token-for-", "")));
        }
      } catch (e) {}
      captureException(testError);
      return res.status(200).json({ ok: true, message: "Sentry test event sent" });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || String(e) });
    }
  });

  // Readiness endpoint (503 until warm-up completes unless disabled)
  const READINESS_REQUIRE_WARMUP = process.env.READINESS_REQUIRE_WARMUP !== "false";
  app.get("/api/ready", statusPublicLimiter, (req, res) => {
    const verbose = req.query.verbose === "1" || req.headers["x-ready-verbose"] === "1";
    if (!READINESS_REQUIRE_WARMUP) return res.json({ ready: true, disabled: true });
    if (!__warmupState.started) return res.status(503).json({ ready: false, state: "not_started" });
    if (!__warmupState.done) return res.status(503).json({ ready: false, state: "warming" });
    const base = { ready: true, tookMs: __warmupState.tookMs, at: __warmupState.at };
    if (__warmupState.error) base.warning = __warmupState.error;
    if (verbose) {
      base.triggeredBy = __warmupState.triggeredBy;
      base.tasks = (__warmupState.tasks || []).map(t => ({
        label: t.label,
        took: t.took,
        status: t.status,
        error: t.error,
      }));
    }
    return res.json(base);
  });

  // Cache extended diagnostics to avoid repeated heavy Firestore queries.
  let __healthCache = { ts: 0, data: null };
  const HEALTH_CACHE_MS = parseInt(process.env.HEALTH_CACHE_MS || "15000", 10); // 15s default

  // Event loop delay monitoring (node >= 12.17)
  try {
    const { monitorEventLoopDelay } = require("perf_hooks");
    const eld = monitorEventLoopDelay({ resolution: 20 });
    eld.enable();
    setInterval(() => {
      const mean = Math.round(eld.mean / 1e6); // ms
      const max = Math.round(eld.max / 1e6);
      if (mean > 50 || max > 200) {
        console.warn("[perf][event-loop] mean=%dms max=%dms", mean, max);
      }
      // reset stats to avoid unbounded memory
      eld.reset();
    }, 15_000);
  } catch (e) {
    // ignore if perf_hooks not available
  }

  app.get("/api/health", statusPublicLimiter, async (req, res) => {
    const startMs = Date.now();
    const verbose =
      req.query.verbose === "1" ||
      req.query.full === "1" ||
      req.headers["x-health-verbose"] === "1";
    const base = {
      status: "OK",
      message: "AutoPromote Server is running",
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    };
    if (!verbose) {
      const total = Date.now() - startMs;
      if (total > 500)
        console.warn(
          "[health][slow] took=%dms ip=%s path=%s",
          total,
          req.ip || req.headers["x-forwarded-for"] || "unknown",
          req.originalUrl || req.url
        );
      return res.json(base);
    }
    const now = Date.now();
    if (__healthCache.data && now - __healthCache.ts < HEALTH_CACHE_MS) {
      const total = Date.now() - startMs;
      if (total > 500)
        console.warn(
          "[health][slow-cache] took=%dms ip=%s path=%s",
          total,
          req.ip || req.headers["x-forwarded-for"] || "unknown",
          req.originalUrl || req.url
        );
      return res.json(__healthCache.data);
    }
    const extended = { ...base, diagnostics: {} };
    try {
      const { db } = require("./firebaseAdmin");
      const { getAllStatus } = require("./services/statusRecorder");
      // System status docs (background workers)
      extended.diagnostics.systemStatus = await getAllStatus(50);
      // System counters (sample)
      try {
        const snap = await db.collection("system_counters").limit(100).get();
        const counters = {};
        snap.forEach(d => {
          const v = d.data();
          counters[d.id] = v.value || 0;
        });
        extended.diagnostics.counters = counters;
      } catch (e) {
        extended.diagnostics.countersError = e.message;
      }
      // Locks sample
      try {
        const lockSnap = await db.collection("system_locks").limit(50).get();
        const now = Date.now();
        const locks = [];
        lockSnap.forEach(d => {
          const v = d.data() || {};
          locks.push({
            id: d.id,
            owner: v.owner,
            msRemaining: v.expiresAt ? v.expiresAt - now : null,
          });
        });
        extended.diagnostics.locks = locks;
      } catch (e) {
        extended.diagnostics.locksError = e.message;
      }
      // Dead letter presence
      try {
        const dl = await db.collection("dead_letter_tasks").limit(1).get();
        extended.diagnostics.deadLetterPresent = !dl.empty;
      } catch (e) {
        extended.diagnostics.deadLetterError = e.message;
      }
      // Promotion task backlog sample (pending count limited)
      try {
        const pendingSnap = await db
          .collection("promotion_tasks")
          .where("status", "==", "pending")
          .limit(25)
          .get();
        extended.diagnostics.taskSamplePending = pendingSnap.size;
      } catch (e) {
        extended.diagnostics.taskSampleError = e.message;
      }
      // Latency stats (in-memory only, reset on deploy)
      try {
        extended.diagnostics.latency = getLatencyStats();
      } catch (_) {}
      // Warm-up status and degraded indicator
      extended.diagnostics.warmup = {
        started: __warmupState.started,
        done: __warmupState.done,
        error: __warmupState.error,
        tookMs: __warmupState.tookMs,
      };
      if (__warmupState.error) extended.diagnostics.degraded = true;
      // Commit / version info (best-effort)
      extended.diagnostics.version =
        process.env.GIT_COMMIT ||
        process.env.COMMIT_HASH ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        null;
      extended.diagnostics.backgroundJobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === "true";

      // OpenAI configuration status
      extended.diagnostics.openai = {
        configured: !!process.env.OPENAI_API_KEY,
        chatbot: !!process.env.OPENAI_API_KEY,
        videoClipping: !!process.env.OPENAI_API_KEY || !!process.env.GOOGLE_CLOUD_API_KEY,
        transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER || "openai",
      };
      // External platform connectivity + credential checks (non-invasive)
      extended.diagnostics.platforms = {
        tiktok: {
          configured: !!(
            process.env.TIKTOK_CLIENT_ID ||
            process.env.TIKTOK_CLIENT_SECRET ||
            process.env.TIKTOK_APP_TOKEN
          ),
        },
        facebook: {
          configured: !!(
            process.env.FACEBOOK_APP_ID ||
            process.env.FACEBOOK_APP_SECRET ||
            process.env.FACEBOOK_PAGE_ACCESS_TOKEN
          ),
        },
        paypal: {
          configured: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
        },
      };

      // Frontend build presence check - helps detect deploys missing 'npm --prefix frontend run build'
      try {
        const fs = require("fs");
        const frontIndex = path.join(__dirname, "../frontend/build", "index.html");
        const frontPresent = fs.existsSync(frontIndex);
        extended.diagnostics.frontend = { present: frontPresent, path: frontIndex };
        if (!frontPresent) {
          extended.diagnostics.frontend.message = "frontend build missing";
          extended.diagnostics.degraded = true;
        }
      } catch (e) {
        extended.diagnostics.frontendError = e.message;
        extended.diagnostics.degraded = true;
      }
    } catch (e) {
      extended.diagnosticsError = e.message;
    }
    __healthCache = { ts: Date.now(), data: extended };
    return res.json(__healthCache.data);
  });

  // Readiness probe - returns 200 if system considered ready, else 503.
  // Criteria (configurable via env):
  // - Pending promotion tasks below threshold (READY_MAX_PENDING_TASKS, default 500)
  // - Dead letter queue absent unless ignored (READY_ALLOW_DEAD_LETTER=true to ignore)
  // - Required workers (when background enabled) have run recently (READY_WORKER_STALE_SEC default 900s)
  // - Stale locks below threshold (READY_MAX_STALE_LOCKS default 10)
  // If background jobs disabled, worker freshness is skipped unless READY_REQUIRE_JOBS=true.
  app.get("/api/health/ready", async (req, res) => {
    const start = Date.now();
    const cfg = {
      maxPending: parseInt(process.env.READY_MAX_PENDING_TASKS || "500", 10),
      workerStaleSec: parseInt(process.env.READY_WORKER_STALE_SEC || "900", 10),
      maxStaleLocks: parseInt(process.env.READY_MAX_STALE_LOCKS || "10", 10),
      allowDeadLetter: process.env.READY_ALLOW_DEAD_LETTER === "true",
      requireJobs: process.env.READY_REQUIRE_JOBS === "true",
    };
    const out = {
      ok: true,
      status: "ready",
      checks: {},
      config: cfg,
      generatedAt: new Date().toISOString(),
    };
    try {
      const { db } = require("./firebaseAdmin");
      // Pending tasks
      try {
        const pendingSnap = await db
          .collection("promotion_tasks")
          .where("status", "==", "pending")
          .limit(cfg.maxPending + 1)
          .get();
        const pending = pendingSnap.size; // limited sample but enough to know if threshold exceeded
        const ok = pending <= cfg.maxPending;
        out.checks.backlog = { pending, threshold: cfg.maxPending, ok };
        if (!ok) {
          out.ok = false;
          out.status = "degraded";
        }
      } catch (e) {
        out.checks.backlog = { error: e.message, ok: false };
        out.ok = false;
        out.status = "degraded";
      }

      // Dead letter presence
      try {
        const dl = await db.collection("dead_letter_tasks").limit(1).get();
        const present = !dl.empty;
        const ok = present ? cfg.allowDeadLetter : true;
        out.checks.deadLetter = { present, ok, allowDeadLetter: cfg.allowDeadLetter };
        if (!ok) {
          out.ok = false;
          out.status = "degraded";
        }
      } catch (e) {
        out.checks.deadLetter = { error: e.message, ok: false };
        out.ok = false;
        out.status = "degraded";
      }

      // Locks assessment
      try {
        const lockSnap = await db.collection("system_locks").limit(200).get();
        const now = Date.now();
        let stale = 0;
        lockSnap.forEach(d => {
          const v = d.data() || {};
          if (v.expiresAt && v.expiresAt < now) stale++;
        });
        const ok = stale <= cfg.maxStaleLocks;
        out.checks.locks = { stale, threshold: cfg.maxStaleLocks, ok };
        if (!ok) {
          out.ok = false;
          out.status = "degraded";
        }
      } catch (e) {
        out.checks.locks = { error: e.message, ok: false };
        out.ok = false;
        out.status = "degraded";
      }

      // Worker freshness (optional if background disabled and not required)
      const bgEnabled = process.env.ENABLE_BACKGROUND_JOBS === "true";
      if (bgEnabled || cfg.requireJobs) {
        try {
          const requiredWorkers = [
            "statsPoller",
            "promotionTasks",
            "platformMetrics",
            "earningsAggregator",
          ];
          const staleCutoff = Date.now() - cfg.workerStaleSec * 1000;
          const statusSnap = await db
            .collection("system_status")
            .where(
              "__name__",
              "in",
              requiredWorkers.filter((_, i) => i < 10)
            ) // Firestore in limit safety
            .get()
            .catch(() => ({ empty: true, docs: [] }));
          const workerStatus = {};
          let allOk = true;
          requiredWorkers.forEach(
            name => (workerStatus[name] = { found: false, ok: !cfg.requireJobs && !bgEnabled })
          );
          statusSnap.docs.forEach(d => {
            const v = d.data() || {};
            const lastRun = v.lastRun ? Date.parse(v.lastRun) : null;
            const fresh = lastRun && lastRun >= staleCutoff;
            workerStatus[d.id] = { found: true, lastRun: v.lastRun || null, ok: fresh };
            if (!fresh) allOk = false;
          });
          if ((cfg.requireJobs || bgEnabled) && !allOk) {
            out.ok = false;
            out.status = "degraded";
          }
          out.checks.workers = {
            ok: allOk || (!cfg.requireJobs && !bgEnabled),
            required: requiredWorkers,
            details: workerStatus,
            staleThresholdSec: cfg.workerStaleSec,
            backgroundEnabled: bgEnabled,
          };
        } catch (e) {
          out.checks.workers = { error: e.message, ok: false };
          out.ok = false;
          out.status = "degraded";
        }
      } else {
        out.checks.workers = { skipped: true, backgroundEnabled: bgEnabled, ok: true };
      }

      out.latencyMs = Date.now() - start;
    } catch (e) {
      out.ok = false;
      out.status = "error";
      out.error = e.message;
    }
    return res.status(out.ok ? 200 : 503).json(out);
  });

  // Error handler for CORS
  app.use((err, req, res, next) => {
    if (err && err.message === "Not allowed by CORS") {
      try {
        console.error("[cors.error] request headers:", req.headers);
      } catch (e) {}
      try {
        console.error("[cors.error] err.stack:", err && err.stack);
      } catch (e) {}
      return res.status(403).json({ error: "CORS policy violation" });
    }
    next(err);
  });

  // -------------------------------------------------
  // Lightweight user progress endpoint (added with micro + explicit cache)
  // -------------------------------------------------
  app.get("/api/users/progress", require("./authMiddleware"), async (req, res) => {
    try {
      const { getCache, setCache } = require("./utils/simpleCache");
      const { dedupe } = require("./utils/inFlight");
      const { instrument } = require("./utils/queryMetrics");
      const uid = req.userId || (req.user && req.user.uid);
      if (!uid) return res.status(401).json({ error: "unauthorized" });
      const cacheKey = `user_progress_${uid}`;
      const cached = getCache(cacheKey);
      if (cached) return res.json({ ...cached, _cached: true });
      const progress = await dedupe(cacheKey, async () => {
        const { db } = require("./firebaseAdmin");
        // Parallel instrumented reads
        const [userSnap, contentSnap, promoSnap] = await Promise.all([
          instrument("progress.userDoc", () => db.collection("users").doc(uid).get()),
          instrument("progress.contentQuery", () =>
            db
              .collection("content")
              .where("owner", "==", uid)
              .limit(200)
              .get()
              .catch(() => ({ empty: true, forEach: () => {} }))
          ),
          instrument("progress.taskQuery", () =>
            db
              .collection("promotion_tasks")
              .where("uid", "==", uid)
              .limit(200)
              .get()
              .catch(() => ({ empty: true, forEach: () => {} }))
          ),
        ]);
        if (!userSnap.exists) return { ok: false, error: "user_not_found" };
        const userData = userSnap.data() || {};
        let contentCount = 0;
        let published = 0;
        let platforms = new Set();
        contentSnap.forEach(d => {
          const v = d.data() || {};
          contentCount++;
          if (v.platform) platforms.add(v.platform);
          if (v.published) published++;
        });
        let tasks = 0;
        let pending = 0;
        let completed = 0;
        promoSnap.forEach(d => {
          const v = d.data() || {};
          tasks++;
          if (v.status === "pending") pending++;
          if (v.status === "completed" || v.status === "done") completed++;
        });
        return {
          ok: true,
          contentCount,
          publishedCount: published,
          platforms: Array.from(platforms).slice(0, 10),
          promotionTasks: { total: tasks, pending, completed },
          earnings: {
            pending: userData.pendingEarnings || 0,
            total: userData.totalEarnings || 0,
            revenueEligible: !!userData.revenueEligible,
          },
          lastUpdated: Date.now(),
        };
      });
      if (!progress.ok)
        return res.status(progress.error === "user_not_found" ? 404 : 500).json(progress);
      setCache(cacheKey, progress, 7000);
      return res.json(progress);
    } catch (e) {
      return res.status(500).json({ error: "progress_failed", detail: e.message });
    }
  });

  // Ensure unmatched routes serve the React app
  app.use((req, res, next) => {
    // Avoid serving index.html for API, static, or well-known paths
    if (
      req.path &&
      (req.path.startsWith("/static") ||
        req.path.startsWith("/api") ||
        req.path.startsWith("/.well-known") ||
        req.path.startsWith("/favicon") ||
        req.path.startsWith("/WhatsApp "))
    ) {
      return next();
    }
    try {
      const fs = require("fs");
      const frontIndex = path.join(__dirname, "../frontend/build", "index.html");
      if (!fs.existsSync(frontIndex)) {
        console.warn(
          `[startup] Frontend build not found at ${frontIndex}. Returning 503 placeholder for SPA routes.`
        );
        return res.status(503).send(`
            <!doctype html>
            <html>
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width,initial-scale=1" />
                <title>Service Unavailable</title>
                <style>
                  body{font-family:Inter,Arial,sans-serif;background:#f6f3ff;margin:0;padding:24px;display:flex;align-items:center;justify-content:center;min-height:100vh}
                  .card{background:#fff;border-radius:12px;padding:28px;max-width:760px;width:100%;box-shadow:0 12px 40px rgba(79,47,247,0.06);text-align:center}
                  .foot{margin-top:20px;color:#6b6b6b;font-size:0.95rem}
                  .foot a{color:#6c4cf7;text-decoration:underline;margin:0 8px}
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>Service Unavailable</h1>
                  <p>Frontend build not found. Please run <code>npm --prefix frontend run build</code> during deploy.</p>

                  <div class="foot">
                    <div>
                      <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/terms" target="_blank" rel="noreferrer">Terms of Service</a>
                      <span>•</span>
                      <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
                    </div>
                    <div style="margin-top:8px">© ${new Date().getFullYear()} AutoPromote. All rights reserved.</div>
                  </div>
                </div>
              </body>
            </html>
          `);
      }
      return res.sendFile(frontIndex, err => {
        if (err) {
          console.warn(
            "[startup] sendFile error for SPA route:",
            err && err.message ? err.message : err
          );
          return res.status(503).send(`
              <!doctype html>
              <html>
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width,initial-scale=1" />
                  <title>Service Unavailable</title>
                  <style>
                    body{font-family:Inter,Arial,sans-serif;background:#f6f3ff;margin:0;padding:24px;display:flex;align-items:center;justify-content:center;min-height:100vh}
                    .card{background:#fff;border-radius:12px;padding:28px;max-width:760px;width:100%;box-shadow:0 12px 40px rgba(79,47,247,0.06);text-align:center}
                    .foot{margin-top:20px;color:#6b6b6b;font-size:0.95rem}
                    .foot a{color:#6c4cf7;text-decoration:underline;margin:0 8px}
                  </style>
                </head>
                <body>
                  <div class="card">
                    <h1>Service Unavailable</h1>
                    <p>Error serving frontend index. Try rebuilding.</p>

                    <div class="foot">
                      <div>
                        <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/terms" target="_blank" rel="noreferrer">Terms of Service</a>
                        <span>•</span>
                        <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
                      </div>
                      <div style="margin-top:8px">© ${new Date().getFullYear()} AutoPromote. All rights reserved.</div>
                    </div>
                  </div>
                </body>
              </html>
            `);
        }
      });
    } catch (e) {
      console.warn("[startup] SPA route error:", e && e.message ? e.message : e);
      return res.status(503).send(`
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width,initial-scale=1" />
              <title>Service Unavailable</title>
              <style>
                body{font-family:Inter,Arial,sans-serif;background:#f6f3ff;margin:0;padding:24px;display:flex;align-items:center;justify-content:center;min-height:100vh}
                .card{background:#fff;border-radius:12px;padding:28px;max-width:760px;width:100%;box-shadow:0 12px 40px rgba(79,47,247,0.06);text-align:center}
                .foot{margin-top:20px;color:#6b6b6b;font-size:0.95rem}
                .foot a{color:#6c4cf7;text-decoration:underline;margin:0 8px}
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Service Unavailable</h1>
                <p>Frontend currently unavailable.</p>

                <div class="foot">
                  <div>
                    <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/terms" target="_blank" rel="noreferrer">Terms of Service</a>
                    <span>•</span>
                    <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
                  </div>
                  <div style="margin-top:8px">© ${new Date().getFullYear()} AutoPromote. All rights reserved.</div>
                </div>
              </div>
            </body>
          </html>
        `);
    }
  });

  // Catch all handler: send back React's index.html file for client-side routing
  app.get("*", (req, res) => {
    try {
      const fs = require("fs");
      const frontIndex = path.join(__dirname, "../frontend/build", "index.html");
      if (!fs.existsSync(frontIndex)) {
        console.warn(
          `[startup] Frontend build not found at ${frontIndex}. Returning 503 placeholder.`
        );
        return res
          .status(503)
          .send(
            "<html><body><h1>Service Unavailable</h1><p>Frontend build not found. Please run <code>npm --prefix frontend run build</code> during deploy.</p></body></html>"
          );
      }
      return res.sendFile(frontIndex, err => {
        if (err) {
          console.warn(
            "[startup] catch-all sendFile error:",
            err && err.message ? err.message : err
          );
          return res
            .status(503)
            .send(
              "<html><body><h1>Service Unavailable</h1><p>Error serving frontend index. Try rebuilding.</p></body></html>"
            );
        }
      });
    } catch (e) {
      console.warn("[startup] catch-all handler error:", e && e.message ? e.message : e);
      return res.status(503).send(`
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width,initial-scale=1" />
              <title>Service Unavailable</title>
              <style>
                body{font-family:Inter,Arial,sans-serif;background:#f6f3ff;margin:0;padding:24px;display:flex;align-items:center;justify-content:center;min-height:100vh}
                .card{background:#fff;border-radius:12px;padding:28px;max-width:760px;width:100%;box-shadow:0 12px 40px rgba(79,47,247,0.06);text-align:center}
                .foot{margin-top:20px;color:#6b6b6b;font-size:0.95rem}
                .foot a{color:#6c4cf7;text-decoration:underline;margin:0 8px}
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Service Unavailable</h1>
                <p>Frontend currently unavailable.</p>

                <div class="foot">
                  <div>
                    <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/terms" target="_blank" rel="noreferrer">Terms of Service</a>
                    <span>•</span>
                    <a href="${process.env.PUBLIC_SITE_URL || "https://autopromote.org"}/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
                  </div>
                  <div style="margin-top:8px">© ${new Date().getFullYear()} AutoPromote. All rights reserved.</div>
                </div>
              </div>
            </body>
          </html>
        `);
    }
  });

  // Error handling middleware
  app.use((err, req, res, _next) => {
    console.log("Server error:", err.message);

    // Provide more specific error messages for common errors
    if (err.name === "FirebaseError") {
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        return res.status(401).json({
          error: "Authentication failed",
          message: "Invalid email or password",
        });
      } else if (err.code === "auth/id-token-expired") {
        return res.status(401).json({
          error: "Authentication failed",
          message: "Your session has expired. Please login again.",
        });
      } else if (err.code === "auth/id-token-revoked") {
        return res.status(401).json({
          error: "Authentication failed",
          message: "Your session has been revoked. Please login again.",
        });
      }
    }

    // For validation errors, return a 400
    if (err.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation error",
        message: err.message,
      });
    }

    // Default error response
    res.status(500).json({
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "production"
          ? "Something went wrong. Please try again later."
          : err.message,
    });
  });

  // Add response interceptor for debugging
  const originalSend = express.response.send;
  express.response.send = function (body) {
    const route = this.req.originalUrl;
    if (route.includes("/api/admin")) {
      console.log("\n[DEBUG] Response for", route + ":");
      console.log("Status:", this.statusCode);
      try {
        // Log request headers for admin routes
        console.log(
          "Request headers:",
          this.req.headers.authorization ? "Authorization: Present" : "Authorization: Missing"
        );

        // Only log body for JSON responses to avoid binary data
        const contentType = this.get("Content-Type");
        if (contentType && contentType.includes("application/json")) {
          // Try to parse and stringify the body to pretty-print it
          const bodyObj = typeof body === "string" ? JSON.parse(body) : body;
          // Log if it's mock data
          console.log("isMockData:", bodyObj.isMockData || false);
        }
      } catch (e) {
        // Silently ignore logging errors
      }
    }
    return originalSend.call(this, body);
  };

  // Attach Sentry error handler after routes so errors are captured and reported
  if (
    global.__sentry &&
    global.__sentry.Handlers &&
    typeof global.__sentry.Handlers.errorHandler === "function"
  ) {
    app.use(global.__sentry.Handlers.errorHandler());
  }

  if (require.main === module) {
    const http = require("http");
    const server = http.createServer(app);
    // attach Socket.IO for production/server runs
    try {
      if (typeof module.exports.attachSocket === "function") {
        module.exports.attachSocket(server, {});
      }
    } catch (e) {}
    server
      .listen(PORT, async () => {
        console.log("🚀 AutoPromote Server is running on port", PORT);
        console.log("📊 Health check available at:", "http://localhost:" + PORT + "/api/health");
        console.log("🔗 API endpoints available at:", "http://localhost:" + PORT + "/api/");

        // Run startup diagnostics to catch configuration issues immediately
        try {
          const StartupDiagnostics = require("./utils/startupDiagnostics");
          const diagnostics = new StartupDiagnostics();
          const result = await diagnostics.runAll();

          if (!result.success) {
            console.error("\n⚠️  SERVER STARTED WITH CRITICAL ERRORS - FIX IMMEDIATELY!");
            console.error("Some features will not work until these are resolved.\n");
          } else if (result.hasErrors) {
            console.warn("\n⚠️  SERVER STARTED WITH NON-CRITICAL ERRORS");
            console.warn("Some features may have limited functionality.\n");
          } else if (result.hasWarnings) {
            console.log("\n✅ SERVER STARTED SUCCESSFULLY (with minor warnings)");
          } else {
            console.log("\n✅ SERVER STARTED - ALL SYSTEMS OPERATIONAL\n");
          }
        } catch (diagError) {
          console.error("Failed to run startup diagnostics:", diagError.message);
        }
      })
      .on("error", err => {
        console.log("❌ Server startup error:", err.message);
        if (err.code === "EADDRINUSE") {
          console.log("Port", PORT, "is already in use by another application.");
          console.log(
            "Try changing the PORT environment variable or closing the other application."
          );
        }
      });
  }

  // -------------------------------------------------
  // Background Workers (Phase B - Automatic Scheduling)
  // -------------------------------------------------
  // Controlled via env flags so we can disable on serverless / multi-instance deployments
  // Support common typo ENABLE_BACKROUND_JOBS (missing 'g') as a fallback
  // Normalize env var: support the common typo ENABLE_BACKROUND_JOBS (missing 'g')
  // by mapping it to the correct ENABLE_BACKGROUND_JOBS so the rest of the
  // code can rely on a single canonical env var. We log an informational
  // message for visibility but avoid spamming repeated warnings.
  if (!process.env.ENABLE_BACKGROUND_JOBS && process.env.ENABLE_BACKROUND_JOBS) {
    // copy the value so downstream checks see the correct name
    process.env.ENABLE_BACKGROUND_JOBS = process.env.ENABLE_BACKROUND_JOBS;
    console.log(
      "[startup] Detected ENABLE_BACKROUND_JOBS (typo). Mapped to ENABLE_BACKGROUND_JOBS for compatibility."
    );
  }
  let ENABLE_BACKGROUND = process.env.ENABLE_BACKGROUND_JOBS === "true";
  const STATS_POLL_INTERVAL_MS = parseInt(process.env.STATS_POLL_INTERVAL_MS || "180000", 10); // 3 minutes default
  const TASK_PROCESS_INTERVAL_MS = parseInt(process.env.TASK_PROCESS_INTERVAL_MS || "60000", 10); // 1 minute default
  const PLATFORM_STATS_POLL_INTERVAL_MS = parseInt(
    process.env.PLATFORM_STATS_POLL_INTERVAL_MS || "300000",
    10
  ); // 5 minutes default
  const OAUTH_STATE_CLEAN_INTERVAL_MS = parseInt(
    process.env.OAUTH_STATE_CLEAN_INTERVAL_MS || "900000",
    10
  ); // 15 min default
  const EARNINGS_AGG_INTERVAL_MS = parseInt(process.env.EARNINGS_AGG_INTERVAL_MS || "600000", 10); // 10 min default
  const LOCK_CLEAN_INTERVAL_MS = parseInt(process.env.LOCK_CLEAN_INTERVAL_MS || "300000", 10); // 5 min default
  const BANDIT_TUNER_INTERVAL_MS = parseInt(process.env.BANDIT_TUNER_INTERVAL_MS || "900000", 10); // 15 min default
  const EXPLORATION_CTRL_INTERVAL_MS = parseInt(
    process.env.EXPLORATION_CTRL_INTERVAL_MS || "600000",
    10
  ); // 10 min default
  const ALERT_CHECK_INTERVAL_MS = parseInt(process.env.ALERT_CHECK_INTERVAL_MS || "900000", 10); // 15 min default
  const PAYOUTS_PROCESS_INTERVAL_MS = parseInt(
    process.env.PAYOUTS_PROCESS_INTERVAL_MS || "3600000",
    10
  ); // 1h default

  // Leader election: only one instance (the leader) should launch intervals.
  let __isLeader = false;
  const electLeader = async () => {
    try {
      const { db } = require("./firebaseAdmin");
      const id = require("crypto").randomUUID();
      const doc = db.collection("system_locks").doc("bg_leader");
      const now = Date.now();
      const leaseMs = parseInt(process.env.LEADER_LEASE_MS || "120000", 10); // 2m lease
      await db.runTransaction(async tx => {
        const snap = await tx.get(doc);
        const v = snap.exists ? snap.data() : null;
        if (v && v.expiresAt && v.expiresAt > now) {
          // Existing leader valid
          if (v.owner === id) {
            tx.update(doc, { expiresAt: now + leaseMs });
            __isLeader = true;
          } else {
            __isLeader = false;
          }
        } else {
          tx.set(doc, { owner: id, expiresAt: now + leaseMs, renewedAt: now });
          __isLeader = true;
        }
      });
      if (__isLeader) {
        if (!electLeader.__announced) {
          console.log("👑 Leader elected for background jobs.");
          electLeader.__announced = true;
        }
      }
    } catch (e) {
      console.warn("[leader] election error:", e.message);
    }
  };
  if (ENABLE_BACKGROUND) {
    // Periodically renew election
    electLeader();
    setInterval(
      electLeader,
      parseInt(process.env.LEADER_ELECTION_INTERVAL_MS || "45000", 10)
    ).unref();
  }

  // Expose leader control globally for admin routes
  global.__bgLeader = {
    isLeader: () => __isLeader,
    relinquish: async () => {
      try {
        const { db } = require("./firebaseAdmin");
        await db
          .collection("system_locks")
          .doc("bg_leader")
          .delete()
          .catch(() => {});
        __isLeader = false;
        console.log("[leader] relinquished manually via admin endpoint");
        return true;
      } catch (e) {
        console.warn("[leader] relinquish failed:", e.message);
        return false;
      }
    },
  };

  if (ENABLE_BACKGROUND) {
    console.log("🛠  Background job runner enabled.");
    try {
      const { pollYouTubeStatsBatch } = require("./services/youtubeStatsPoller");
      const { pollPlatformPostMetricsBatch } = require("./services/platformStatsPoller");
      const {
        processNextYouTubeTask,
        processNextPlatformTask,
      } = require("./services/promotionTaskQueue");
      const { acquireLock, INSTANCE_ID } = require("./services/workerLockService");
      console.log("🔐 Worker instance id:", INSTANCE_ID);

      // Simple re-entrancy guard flags
      let statsRunning = false;
      let taskRunning = false;
      let platformMetricsRunning = false;

      setInterval(async () => {
        if (statsRunning) return; // skip overlapping
        const ok = await acquireLock("statsPoller", STATS_POLL_INTERVAL_MS * 2).catch(() => false);
        if (!ok) return; // another instance owns lock
        statsRunning = true;
        try {
          const jitter = require("crypto").randomInt(0, 250);
          if (jitter) await new Promise(r => setTimeout(r, jitter));
          // Poll stats with a conservative batch size
          const uidHint = process.env.DEFAULT_STATS_UID || null; // optional: if certain actions require a user context
          const result = await pollYouTubeStatsBatch({
            uid: uidHint,
            velocityThreshold: parseInt(process.env.VELOCITY_THRESHOLD || "800", 10),
            batchSize: 5,
          });
          if (result.processed) {
            console.log("[BG][stats] Updated", result.processed, "content docs");
            try {
              require("./services/metricsRecorder").incrCounter("statsPoller.runs");
            } catch (_) {}
          }
          try {
            require("./services/statusRecorder").recordRun("statsPoller", {
              lastProcessed: result.processed || 0,
              ok: true,
            });
          } catch (_) {}
        } catch (e) {
          console.warn("[BG][stats] error:", e.message);
          try {
            require("./services/statusRecorder").recordRun("statsPoller", {
              error: e.message,
              ok: false,
            });
          } catch (_) {}
        } finally {
          statsRunning = false;
        }
      }, STATS_POLL_INTERVAL_MS).unref();

      setInterval(async () => {
        if (taskRunning) return;
        const ok = await acquireLock("promotionTasks", TASK_PROCESS_INTERVAL_MS * 2).catch(
          () => false
        );
        if (!ok) return;
        taskRunning = true;
        try {
          const jitter = require("crypto").randomInt(0, 250);
          if (jitter) await new Promise(r => setTimeout(r, jitter));
          let processed = 0;
          // Process up to N tasks per interval (interleave types)
          const MAX_BATCH = 5;
          const mt = require("./services/mediaTransform");
          for (let i = 0; i < MAX_BATCH; i++) {
            const yt = await processNextYouTubeTask();
            const pf = await processNextPlatformTask();
            if (mt && typeof mt.processNextMediaTransformTask === "function") {
              await mt.processNextMediaTransformTask();
            }
            if (!yt && !pf) break;
            processed += (yt ? 1 : 0) + (pf ? 1 : 0);
          }
          if (processed) {
            console.log("[BG][tasks] Processed", processed, "queued tasks");
            try {
              require("./services/metricsRecorder").incrCounter(
                "promotionTasks.processed",
                processed
              );
            } catch (_) {}
          }
          try {
            require("./services/statusRecorder").recordRun("promotionTasks", {
              processed,
              ok: true,
            });
          } catch (_) {}
        } catch (e) {
          console.warn("[BG][tasks] error:", e.message);
          try {
            require("./services/statusRecorder").recordRun("promotionTasks", {
              error: e.message,
              ok: false,
            });
          } catch (_) {}
        } finally {
          taskRunning = false;
        }
      }, TASK_PROCESS_INTERVAL_MS).unref();

      setInterval(async () => {
        if (platformMetricsRunning) return;
        const ok = await acquireLock("platformMetrics", PLATFORM_STATS_POLL_INTERVAL_MS * 2).catch(
          () => false
        );
        if (!ok) return;
        platformMetricsRunning = true;
        try {
          const jitter = require("crypto").randomInt(0, 250);
          if (jitter) await new Promise(r => setTimeout(r, jitter));
          const r = await pollPlatformPostMetricsBatch({ batchSize: 5 });
          if (r.processed)
            console.log("[BG][platform-metrics] Updated", r.processed, "platform post metrics");
          if (r.processed) {
            try {
              require("./services/metricsRecorder").incrCounter(
                "platformMetrics.processed",
                r.processed
              );
            } catch (_) {}
          }
          try {
            require("./services/statusRecorder").recordRun("platformMetrics", {
              processed: r.processed || 0,
              ok: true,
            });
          } catch (_) {}
        } catch (e) {
          console.warn("[BG][platform-metrics] error:", e.message);
          try {
            require("./services/statusRecorder").recordRun("platformMetrics", {
              error: e.message,
              ok: false,
            });
          } catch (_) {}
        } finally {
          platformMetricsRunning = false;
        }
      }, PLATFORM_STATS_POLL_INTERVAL_MS).unref();

      // Cleanup old oauth_states docs (stale PKCE state) to reduce clutter
      try {
        const { cleanupOldStates } = require("./services/twitterService");
        setInterval(async () => {
          try {
            const removed = await cleanupOldStates(30); // older than 30 minutes
            if (removed) console.log("[BG][oauth-states] cleaned", removed, "stale records");
            if (removed) {
              try {
                require("./services/metricsRecorder").incrCounter("oauthStates.cleaned", removed);
              } catch (_) {}
            }
            try {
              require("./services/statusRecorder").recordRun("oauthStateCleanup", {
                removed: removed || 0,
                ok: true,
              });
            } catch (_) {}
          } catch (e) {
            console.warn("[BG][oauth-states] cleanup failed:", e.message);
            try {
              require("./services/statusRecorder").recordRun("oauthStateCleanup", {
                error: e.message,
                ok: false,
              });
            } catch (_) {}
          }
        }, OAUTH_STATE_CLEAN_INTERVAL_MS).unref();
      } catch (e) {
        // twitterService may not exist if feature not deployed yet
        console.log("[BG][oauth-states] cleanup skipped:", e.message);
      }

      // Periodic earnings aggregation (best-effort, idempotent per batch)
      try {
        const { aggregateUnprocessed } = require("./services/earningsService");
        const { acquireLock } = require("./services/workerLockService");
        setInterval(async () => {
          try {
            const locked = await acquireLock(
              "earningsAggregator",
              EARNINGS_AGG_INTERVAL_MS * 2
            ).catch(() => false);
            if (!locked) return; // another instance aggregating
            const jitter = require("crypto").randomInt(0, 250);
            if (jitter) await new Promise(r => setTimeout(r, jitter));
            const r = await aggregateUnprocessed({ batchSize: 300 });
            if (r.processedEvents)
              console.log(
                "[BG][earnings] aggregated",
                r.processedEvents,
                "events for",
                r.usersUpdated,
                "users"
              );
            if (r.processedEvents) {
              try {
                require("./services/metricsRecorder").incrCounter(
                  "earnings.eventsProcessed",
                  r.processedEvents
                );
              } catch (_) {}
            }
            try {
              require("./services/statusRecorder").recordRun("earningsAggregator", {
                processedEvents: r.processedEvents || 0,
                usersUpdated: r.usersUpdated || 0,
                ok: true,
              });
            } catch (_) {}
          } catch (e) {
            console.warn("[BG][earnings] aggregation failed:", e.message);
            try {
              require("./services/statusRecorder").recordRun("earningsAggregator", {
                error: e.message,
                ok: false,
              });
            } catch (_) {}
          }
        }, EARNINGS_AGG_INTERVAL_MS).unref();
      } catch (e) {
        console.log("[BG][earnings] service not available:", e.message);
      }

      // Stale lock cleanup (best-effort) - removes expired locks to prevent clutter
      setInterval(async () => {
        try {
          const now = Date.now();
          const snap = await db.collection("system_locks").limit(200).get();
          const batch = db.batch();
          let removed = 0;
          snap.forEach(d => {
            const v = d.data();
            if (v.expiresAt && v.expiresAt < now - 60000) {
              batch.delete(d.ref);
              removed++;
            }
          });
          if (removed) {
            await batch.commit();
            console.log("[BG][locks] cleaned", removed, "stale locks");
          }
          try {
            require("./services/statusRecorder").recordRun("lockCleanup", {
              removed: removed || 0,
              ok: true,
            });
          } catch (_) {}
        } catch (e) {
          console.warn("[BG][locks] cleanup error:", e.message);
        }
      }, LOCK_CLEAN_INTERVAL_MS).unref();

      // Bandit auto-tuning, exploration factor, and alerts loops guarded by leader flag
      const leaderInterval = (fn, ms) => {
        setInterval(() => {
          if (!__isLeader) return;
          fn();
        }, ms).unref();
      };
      try {
        const { applyAutoTune } = require("./services/banditTuningService");
        leaderInterval(async () => {
          try {
            const r = await applyAutoTune();
            if (r && r.updated) {
              console.log("[BG][bandit-tuner] updated weights:", r.newWeights);
              try {
                require("./services/statusRecorder").recordRun("banditTuner", {
                  ok: true,
                  weights: r.newWeights,
                });
              } catch (_) {}
            } else {
              try {
                require("./services/statusRecorder").recordRun("banditTuner", {
                  ok: true,
                  noop: true,
                });
              } catch (_) {}
            }
          } catch (e) {
            console.warn("[BG][bandit-tuner] error:", e.message);
          }
        }, BANDIT_TUNER_INTERVAL_MS);
      } catch (e) {
        console.log("[BG][bandit-tuner] skipped:", e.message);
      }

      try {
        const { adjustExplorationFactor } = require("./services/explorationControllerService");
        leaderInterval(async () => {
          try {
            const r = await adjustExplorationFactor();
            if (r.updated) {
              console.log(
                "[BG][exploration-controller] factor updated",
                r.newFactor,
                "ratio",
                r.ratio.toFixed(3)
              );
              try {
                require("./services/statusRecorder").recordRun("explorationController", {
                  ok: true,
                  factor: r.newFactor,
                  ratio: r.ratio,
                });
              } catch (_) {}
            } else {
              try {
                require("./services/statusRecorder").recordRun("explorationController", {
                  ok: true,
                  noop: true,
                  factor: r.factor,
                  ratio: r.ratio,
                });
              } catch (_) {}
            }
          } catch (e) {
            console.warn("[BG][exploration-controller] error:", e.message);
          }
        }, EXPLORATION_CTRL_INTERVAL_MS);
      } catch (e) {
        console.log("[BG][exploration-controller] skipped:", e.message);
      }

      try {
        const { runAlertChecks } = require("./services/alertingService");
        leaderInterval(async () => {
          try {
            const r = await runAlertChecks();
            if (r.exploration.alerted || r.diversity.alerted)
              console.log("[BG][alerts] alerts dispatched");
          } catch (e) {
            console.warn("[BG][alerts] error:", e.message);
          }
        }, ALERT_CHECK_INTERVAL_MS);
      } catch (e) {
        console.log("[BG][alerts] skipped:", e.message);
      }

      // Leader-only: periodically process pending payouts if enabled and configured
      const payoutsEnabled =
        process.env.PAYOUTS_ENABLED === "true" &&
        process.env.PAYPAL_CLIENT_ID &&
        process.env.PAYPAL_CLIENT_SECRET;
      if (payoutsEnabled) {
        try {
          const paypalPayoutService = require("./services/paypalPayoutService");
          leaderInterval(async () => {
            try {
              const processed = await paypalPayoutService.processPendingPayouts(50);
              if (processed && processed.processed)
                console.log("[BG][payouts] processed", processed.processed, "pending payouts");
              try {
                require("./services/metricsRecorder").incrCounter(
                  "payouts.processed",
                  processed.processed || 0
                );
              } catch (_) {}
              try {
                require("./services/statusRecorder").recordRun("payoutProcessor", {
                  processed: processed.processed || 0,
                  ok: true,
                });
              } catch (_) {}
            } catch (e) {
              console.warn("[BG][payouts] payout processing failed:", e && e.message);
              try {
                require("./services/statusRecorder").recordRun("payoutProcessor", {
                  error: e.message,
                  ok: false,
                });
              } catch (_) {}
            }
          }, PAYOUTS_PROCESS_INTERVAL_MS);
        } catch (e) {
          console.log("[BG][payouts] skipped: payout service not found", e.message);
        }
      } else {
        console.log(
          "[BG][payouts] Payout processing disabled (PAYMENTS_ENABLED/PAYPAL not configured or PAYOUTS_ENABLED=false)"
        );
      }

      // Latency snapshot persistence (leader only)
      const LAT_SNAPSHOT_INTERVAL_MS = parseInt(
        process.env.LAT_SNAPSHOT_INTERVAL_MS || "60000",
        10
      );
      leaderInterval(async () => {
        const stats = getLatencyStats();
        if (!stats.count) return;
        try {
          await db.collection("system_latency_snapshots").add({ at: Date.now(), stats });
          // Prune older docs beyond 200
          const snap = await db.collection("system_latency_snapshots").orderBy("at", "asc").get();
          if (snap.size > 220) {
            const excess = snap.docs.slice(0, snap.size - 200);
            const batch = db.batch();
            excess.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (e) {
          console.warn("[BG][latency-snapshot] error:", e.message);
        }
      }, LAT_SNAPSHOT_INTERVAL_MS);
    } catch (e) {
      console.warn("⚠️ Background job initialization failed:", e.message);
    }
  } else {
    console.log("ℹ️ Background job runner disabled (set ENABLE_BACKGROUND_JOBS=true to enable).");
    // Kick off warmup asynchronously after server start
    if (require.main === module) {
      setTimeout(runWarmup, 50);
    }
  }

  // Export selected internals for routes/tests (avoid breaking existing behavior)
  module.exports.getLatencyStats = getLatencyStats;
  module.exports.runWarmup = runWarmup;
  module.exports.__warmupState = () => __warmupState;

  // Socket helper: attach a Socket.IO server to an existing http.Server
  module.exports.attachSocket = function attachSocket(httpServer, opts = {}) {
    try {
      const { Server } = require("socket.io");
      const io = new Server(httpServer, {
        cors: {
          origin: opts.corsOrigin || process.env.SOCKET_CORS_ORIGIN || "*",
          methods: ["GET", "POST"],
        },
        allowEIO3: true,
      });
      // store globally so other modules (e.g. tipPubsub) can emit
      global.__io = io;
      io.on("connection", socket => {
        try {
          const qs = socket.handshake && socket.handshake.query ? socket.handshake.query : {};
          if (qs.liveId) socket.join(`live:${qs.liveId}`);
          socket.on("joinLive", liveId => {
            if (liveId) socket.join(`live:${liveId}`);
          });
        } catch (e) {
          // ignore
        }
      });
      return io;
    } catch (e) {
      console.warn("[attachSocket] failed to initialize Socket.IO:", e && e.message);
      return null;
    }
  };

  module.exports.getIo = () => global.__io || null;

  // Export Express app for integration tests
  module.exports = app;
} catch (e) {
  console.error(e);
}

// Optional scheduled integration scan runner (outside try-catch to ensure we can log if not enabled)
try {
  const enableScan = process.env.ENABLE_HEALTH_SCANS === "true";
  const intervalMs = parseInt(process.env.HEALTH_SCAN_INTERVAL_MS || "3600000", 10);
  const scanStore = process.env.HEALTH_SCAN_STORE === "true";
  const scanWebhook = process.env.SCAN_FAILURE_WEBHOOK || null;
  if (enableScan && intervalMs > 0) {
    const { runIntegrationChecks } = require("./services/healthRunner");
    const runAndStore = async () => {
      try {
        const result = await runIntegrationChecks({
          dashboard: "user",
          userId: process.env.HEALTH_SCAN_USER || "system-scan",
        });
        if (scanStore || result.overall === "failed") {
          try {
            await require("./firebaseAdmin")
              .db.collection("system_scans")
              .add({
                dashboard: "user",
                uid: process.env.HEALTH_SCAN_USER || "system-scan",
                result,
                createdAt: new Date().toISOString(),
              });
          } catch (e) {}
        }
        if (scanWebhook && result.overall === "failed") {
          try {
            const doFetch = typeof fetch === "function" ? fetch : require("node-fetch");
            await doFetch(scanWebhook, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ level: "failed", details: result }),
            });
          } catch (e) {}
        }
      } catch (e) {
        console.error("[health-scan] scheduled run failed:", e && e.message);
      }
    };
    setInterval(runAndStore, intervalMs).unref();
    console.log(
      "[health-scan] scheduled scan enabled. Interval(ms)=",
      intervalMs,
      "store=",
      scanStore
    );
  }
} catch (e) {
  console.warn("[health-scan] scheduler initialization error:", e && e.message);
}

// Global process-level error handlers to surface crashes in logs and allow process managers to restart
process.on("uncaughtException", err => {
  try {
    console.error("[fatal] Uncaught exception:", err && err.stack ? err.stack : err);
  } catch (_) {
    console.error("[fatal] Uncaught exception (failed to stringify)");
  }
  // give logs a moment to flush then exit to allow a restart
  setTimeout(() => process.exit(1), 500);
});

process.on("unhandledRejection", (reason, promise) => {
  try {
    console.error(
      "[fatal] Unhandled rejection at:",
      promise,
      "reason:",
      reason && reason.stack ? reason.stack : reason
    );
  } catch (_) {
    console.error("[fatal] Unhandled rejection (failed to stringify)");
  }
  // give logs a moment to flush then exit to allow a restart
  setTimeout(() => process.exit(1), 500);
});
