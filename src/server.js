
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
// Security & performance middlewares
let helmet, compression;
try { helmet = require('helmet'); } catch(_) { /* optional until installed */ }
try { compression = require('compression'); } catch(_) { /* optional until installed */ }
// Performance & security middleware (added)
let compression, helmet;
try { compression = require('compression'); } catch(_) { /* optional */ }
try { helmet = require('helmet'); } catch(_) { /* optional */ }

// Load core routes
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const contentRoutes = require('./contentRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const adminRoutes = require('./adminRoutes');
const adminAnalyticsRoutes = require('./adminAnalyticsRoutes');
let promotionTaskRoutes;
let metricsRoutes;
let tiktokRoutes;
let notificationsRoutes;
try {
  tiktokRoutes = require('../tiktokRoutes'); // use top-level tiktokRoutes which includes auth + storage
  console.log('✅ Using top-level tiktokRoutes.js');
} catch (e) {
  try {
    tiktokRoutes = require('./routes/tiktokRoutes'); // fallback to older location if present
    console.log('✅ Using legacy src/routes/tiktokRoutes.js');
  } catch (_) {
    tiktokRoutes = express.Router();
    console.log('⚠️ TikTok routes not found; using empty router');
  }
}

// Load social routers
let facebookRoutes, youtubeRoutes, instagramRoutes, twitterAuthRoutes;
let platformConnectionsRoutes;
try {
  facebookRoutes = require('./routes/facebookRoutes');
  console.log('✅ Facebook routes loaded');
} catch (e) {
  console.log('⚠️ Facebook routes not found:', e.message);
  facebookRoutes = express.Router();
}
try {
  youtubeRoutes = require('./routes/youtubeRoutes');
  console.log('✅ YouTube routes loaded');
} catch (e) {
  console.log('⚠️ YouTube routes not found:', e.message);
  youtubeRoutes = express.Router();
}
try {
  twitterAuthRoutes = require('./routes/twitterAuthRoutes');
  console.log('✅ Twitter auth routes loaded');
} catch (e) {
  console.log('⚠️ Twitter auth routes not found:', e.message);
  twitterAuthRoutes = express.Router();
}
try {
  platformConnectionsRoutes = require('./routes/platformConnectionsRoutes');
  console.log('✅ Platform connections routes loaded');
} catch (e) {
  console.log('⚠️ Platform connections routes not found:', e.message);
  platformConnectionsRoutes = express.Router();
}
try {
  promotionTaskRoutes = require('./routes/promotionTaskRoutes');
  console.log('✅ Promotion task routes loaded');
} catch (e) {
  console.log('⚠️ Promotion task routes not found:', e.message);
  promotionTaskRoutes = express.Router();
}
try {
  notificationsRoutes = require('./routes/notificationsRoutes');
  console.log('✅ Notifications routes loaded');
} catch (e) {
  console.log('⚠️ Notifications routes not found:', e.message);
  notificationsRoutes = express.Router();
}
try {
  metricsRoutes = require('./routes/metricsRoutes');
  console.log('✅ Metrics routes loaded');
} catch (e) {
  console.log('⚠️ Metrics routes not found:', e.message);
  metricsRoutes = express.Router();
}
try {
  instagramRoutes = require('./routes/instagramRoutes');
  console.log('✅ Instagram routes loaded');
} catch (e) {
  console.log('⚠️ Instagram routes not found:', e.message);
  instagramRoutes = express.Router();
}

// Try to load adminTestRoutes, but continue with a dummy router if not available
let adminTestRoutes;
let adminSecurityRoutes;
try {
  adminTestRoutes = require('./adminTestRoutes');
} catch (error) {
try {
  adminSecurityRoutes = require('./routes/adminSecurityRoutes');
  console.log('✅ Admin security routes loaded');
} catch (e) {
  console.log('⚠️ Admin security routes not found:', e.message);
  adminSecurityRoutes = express.Router();
}
  // Create a dummy router if the module is missing
  adminTestRoutes = express.Router();
  adminTestRoutes.get('/admin-test/health', (req, res) => {
    res.json({ status: 'ok', message: 'Admin test routes dummy endpoint' });
  });
}

// Try to load optional route modules
let withdrawalRoutes, monetizationRoutes, stripeOnboardRoutes;
try {
  withdrawalRoutes = require('./routes/withdrawalRoutes');
} catch (error) {
  withdrawalRoutes = express.Router();
}

try {
  monetizationRoutes = require('./routes/monetizationRoutes');
  console.log('✅ Monetization routes loaded successfully');
} catch (error) {
  console.log('⚠️ Monetization routes not found, using dummy router:', error.message);
  monetizationRoutes = express.Router();
}

try {
  stripeOnboardRoutes = require('./routes/stripeOnboardRoutes');
} catch (error) {
  stripeOnboardRoutes = express.Router();
  // Add warning for missing Stripe secret key only if we have the route module
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('ℹ️ STRIPE_SECRET_KEY not found. Stripe features will be disabled.');
  }
}

// Import initialized Firebase services
const { db, auth, storage } = require('./firebaseAdmin');

const app = express();
const PORT = process.env.PORT || 5000; // Default to port 5000, Render will override with its own PORT

// CORS configuration - allow all origins for debugging (tighten in prod)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin']
}));
// Apply compression if installed
if (compression) app.use(compression());
// Apply security headers (disable CSP by default to avoid blocking React build assets)
if (helmet) app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Apply helmet (relaxed CSP off for React inline styles) & compression if available
if (helmet) app.use(helmet({ contentSecurityPolicy: false }));
if (compression) app.use(compression());

// Correlation ID middleware (K)
app.use((req, res, next) => {
  const incoming = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const cid = incoming || require('crypto').randomUUID();
  req.correlationId = cid;
  res.setHeader('x-correlation-id', cid);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/security', adminSecurityRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api', adminTestRoutes); // Add admin test routes
// Mount TikTok routes if available
app.use('/api/tiktok', tiktokRoutes);
console.log('🚏 TikTok routes mounted at /api/tiktok');
// Mount new social routes
app.use('/api/facebook', facebookRoutes);
console.log('🚏 Facebook routes mounted at /api/facebook');
app.use('/api/youtube', youtubeRoutes);
console.log('🚏 YouTube routes mounted at /api/youtube');
app.use('/api/twitter', twitterAuthRoutes);
console.log('🚏 Twitter routes mounted at /api/twitter');
app.use('/api/platform', platformConnectionsRoutes);
console.log('🚏 Platform connections routes mounted at /api/platform');
app.use('/api/promotion-tasks', promotionTaskRoutes);
console.log('🚏 Promotion task routes mounted at /api/promotion-tasks');
app.use('/api/metrics', metricsRoutes);
console.log('🚏 Metrics routes mounted at /api/metrics');
app.use('/api/instagram', instagramRoutes);
console.log('🚏 Instagram routes mounted at /api/instagram');
app.use('/api/notifications', notificationsRoutes);
console.log('🚏 Notifications routes mounted at /api/notifications');

// Content Quality Check Route
const contentQualityCheck = require('./contentQualityCheck');
app.use('/api/content', contentQualityCheck);

// Register optional routes
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/monetization', monetizationRoutes);
app.use('/api/stripe', stripeOnboardRoutes);

// Serve site verification and other well-known files
// 1) Try root-level /public/.well-known
app.use('/.well-known', express.static(path.join(__dirname, '../public/.well-known')));
// 2) Fallback to /docs/.well-known (used for GitHub Pages and documentation hosting)
app.use('/.well-known', express.static(path.join(__dirname, '../docs/.well-known')));

// Explicit root-level routes for TikTok verification variations
function sendFirstExisting(res, candidates) {
  const fs = require('fs');
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return res.sendFile(p);
      }
    } catch (_) { /* ignore */ }
  }
  return res.status(404).send('Not found');
}

app.get(['/tiktok-developers-site-verification.txt', '/tiktok-site-verification.txt'], (req, res) => {
  const targetFile = req.path.endsWith('developers-site-verification.txt')
    ? 'tiktok-developers-site-verification.txt'
    : 'tiktok-site-verification.txt';
  const candidates = [
    path.join(__dirname, '../public/.well-known/', targetFile),
    path.join(__dirname, '../docs/.well-known/', targetFile)
  ];
  return sendFirstExisting(res, candidates);
});

// Wildcard for TikTok URL prefix verification files e.g. /tiktokXYZ123.txt
app.get(/^\/tiktok.*\.txt$/, (req, res) => {
  const filename = req.path.replace('/', '');
  const candidates = [
    path.join(__dirname, '../public/.well-known/', filename),
    path.join(__dirname, '../docs/.well-known/', filename)
  ];
  return sendFirstExisting(res, candidates);
});

// Legal policy pages served from docs on the same domain
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/terms.html'));
});

app.get('/data-deletion', (req, res) => {
  res.sendFile(path.join(__dirname, '../docs/data-deletion.html'));
});


// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Serve the admin test HTML file
app.get('/admin-test', (req, res) => {
  // Check if file exists before sending
  try {
    res.sendFile(path.join(__dirname, 'public', 'admin-test.html'));
  } catch (error) {
    res.send('<html><body><h1>Admin Test Page</h1><p>The actual test page is not available.</p></body></html>');
  }
});

// Serve the admin login page (only accessible by direct URL - not linked from UI)
app.get('/admin-login', (req, res) => {
  // Check if file exists before sending
  try {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
  } catch (error) {
    res.send('<html><body><h1>Admin Login</h1><p>The actual login page is not available.</p></body></html>');
  }
});

// Serve the admin dashboard (protected in frontend by auth check)
app.get('/admin-dashboard', (req, res) => {
  // Check if file exists before sending
  try {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
  } catch (error) {
    res.send('<html><body><h1>Admin Dashboard</h1><p>The actual dashboard is not available.</p></body></html>');
  }
});

// Health check endpoint (supports verbose diagnostics via ?verbose=1 or header x-health-verbose=1)
app.get('/api/health', async (req, res) => {
  const verbose = req.query.verbose === '1' || req.query.full === '1' || req.headers['x-health-verbose'] === '1';
  const base = {
    status: 'OK',
    message: 'AutoPromote Server is running',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
  };
  if (!verbose) return res.json(base);

  // Collect extended diagnostics best-effort; failures should not break health.
  const extended = { ...base, diagnostics: {} };
  try {
    const { db } = require('./firebaseAdmin');
    const { getAllStatus } = require('./services/statusRecorder');
    // System status docs (background workers)
    extended.diagnostics.systemStatus = await getAllStatus(50);
    // System counters (sample)
    try {
      const snap = await db.collection('system_counters').limit(100).get();
      const counters = {};
      snap.forEach(d => { const v = d.data(); counters[d.id] = v.value || 0; });
      extended.diagnostics.counters = counters;
    } catch (e) {
      extended.diagnostics.countersError = e.message;
    }
    // Locks sample
    try {
      const lockSnap = await db.collection('system_locks').limit(50).get();
      const now = Date.now();
      const locks = [];
      lockSnap.forEach(d => { const v = d.data() || {}; locks.push({ id: d.id, owner: v.owner, msRemaining: v.expiresAt ? v.expiresAt - now : null }); });
      extended.diagnostics.locks = locks;
    } catch (e) {
      extended.diagnostics.locksError = e.message;
    }
    // Dead letter presence
    try {
      const dl = await db.collection('dead_letter_tasks').limit(1).get();
      extended.diagnostics.deadLetterPresent = !dl.empty;
    } catch (e) {
      extended.diagnostics.deadLetterError = e.message;
    }
    // Promotion task backlog sample (pending count limited)
    try {
      const pendingSnap = await db.collection('promotion_tasks').where('status','==','pending').limit(25).get();
      extended.diagnostics.taskSamplePending = pendingSnap.size;
    } catch (e) {
      extended.diagnostics.taskSampleError = e.message;
    }
    // Commit / version info (best-effort)
    extended.diagnostics.version = process.env.GIT_COMMIT || process.env.COMMIT_HASH || process.env.VERCEL_GIT_COMMIT_SHA || null;
    extended.diagnostics.backgroundJobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';
  } catch (e) {
    extended.diagnosticsError = e.message;
  }
  return res.json(extended);
});

// Readiness probe - returns 200 if system considered ready, else 503.
// Criteria (configurable via env):
// - Pending promotion tasks below threshold (READY_MAX_PENDING_TASKS, default 500)
// - Dead letter queue absent unless ignored (READY_ALLOW_DEAD_LETTER=true to ignore)
// - Required workers (when background enabled) have run recently (READY_WORKER_STALE_SEC default 900s)
// - Stale locks below threshold (READY_MAX_STALE_LOCKS default 10)
// If background jobs disabled, worker freshness is skipped unless READY_REQUIRE_JOBS=true.
app.get('/api/health/ready', async (req, res) => {
  const start = Date.now();
  const cfg = {
    maxPending: parseInt(process.env.READY_MAX_PENDING_TASKS || '500', 10),
    workerStaleSec: parseInt(process.env.READY_WORKER_STALE_SEC || '900', 10),
    maxStaleLocks: parseInt(process.env.READY_MAX_STALE_LOCKS || '10', 10),
    allowDeadLetter: process.env.READY_ALLOW_DEAD_LETTER === 'true',
    requireJobs: process.env.READY_REQUIRE_JOBS === 'true'
  };
  const out = { ok: true, status: 'ready', checks: {}, config: cfg, generatedAt: new Date().toISOString() };
  try {
    const { db } = require('./firebaseAdmin');
    // Pending tasks
    try {
      const pendingSnap = await db.collection('promotion_tasks').where('status','==','pending').limit(cfg.maxPending + 1).get();
      const pending = pendingSnap.size; // limited sample but enough to know if threshold exceeded
      const ok = pending <= cfg.maxPending;
      out.checks.backlog = { pending, threshold: cfg.maxPending, ok };
      if (!ok) { out.ok = false; out.status = 'degraded'; }
    } catch (e) { out.checks.backlog = { error: e.message, ok: false }; out.ok = false; out.status = 'degraded'; }

    // Dead letter presence
    try {
      const dl = await db.collection('dead_letter_tasks').limit(1).get();
      const present = !dl.empty;
      const ok = present ? cfg.allowDeadLetter : true;
      out.checks.deadLetter = { present, ok, allowDeadLetter: cfg.allowDeadLetter };
      if (!ok) { out.ok = false; out.status = 'degraded'; }
    } catch (e) { out.checks.deadLetter = { error: e.message, ok: false }; out.ok = false; out.status = 'degraded'; }

    // Locks assessment
    try {
      const lockSnap = await db.collection('system_locks').limit(200).get();
      const now = Date.now();
      let stale = 0;
      lockSnap.forEach(d => { const v = d.data() || {}; if (v.expiresAt && v.expiresAt < now) stale++; });
      const ok = stale <= cfg.maxStaleLocks;
      out.checks.locks = { stale, threshold: cfg.maxStaleLocks, ok };
      if (!ok) { out.ok = false; out.status = 'degraded'; }
    } catch (e) { out.checks.locks = { error: e.message, ok: false }; out.ok = false; out.status = 'degraded'; }

    // Worker freshness (optional if background disabled and not required)
    const bgEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';
    if (bgEnabled || cfg.requireJobs) {
      try {
        const requiredWorkers = ['statsPoller','promotionTasks','platformMetrics','earningsAggregator'];
        const staleCutoff = Date.now() - cfg.workerStaleSec * 1000;
        const statusSnap = await db.collection('system_status').where('__name__','in', requiredWorkers.filter((_,i)=>i<10)) // Firestore in limit safety
          .get().catch(()=>({ empty: true, docs: [] }));
        const workerStatus = {};
        let allOk = true;
        requiredWorkers.forEach(name => workerStatus[name] = { found: false, ok: !cfg.requireJobs && !bgEnabled });
        statusSnap.docs.forEach(d => {
          const v = d.data() || {};
            const lastRun = v.lastRun ? Date.parse(v.lastRun) : null;
            const fresh = lastRun && lastRun >= staleCutoff;
            workerStatus[d.id] = { found: true, lastRun: v.lastRun || null, ok: fresh };
            if (!fresh) allOk = false;
        });
        if ((cfg.requireJobs || bgEnabled) && !allOk) { out.ok = false; out.status = 'degraded'; }
        out.checks.workers = { ok: allOk || (!cfg.requireJobs && !bgEnabled), required: requiredWorkers, details: workerStatus, staleThresholdSec: cfg.workerStaleSec, backgroundEnabled: bgEnabled };
      } catch (e) { out.checks.workers = { error: e.message, ok: false }; out.ok = false; out.status = 'degraded'; }
    } else {
      out.checks.workers = { skipped: true, backgroundEnabled: bgEnabled, ok: true };
    }

    out.latencyMs = Date.now() - start;
  } catch (e) {
    out.ok = false;
    out.status = 'error';
    out.error = e.message;
  }
  return res.status(out.ok ? 200 : 503).json(out);
});


// Catch all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.log('Server error:', err.message);
  
  // Provide more specific error messages for common errors
  if (err.name === 'FirebaseError') {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid email or password' 
      });
    } else if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Your session has expired. Please login again.' 
      });
    } else if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Your session has been revoked. Please login again.' 
      });
    }
  }
  
  // For validation errors, return a 400
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation error',
      message: err.message 
    });
  }
  
  // Default error response
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong. Please try again later.'
      : err.message 
  });
});

// Add response interceptor for debugging
const originalSend = express.response.send;
express.response.send = function(body) {
  const route = this.req.originalUrl;
  if (route.includes('/api/admin')) {
    console.log(`\n[DEBUG] Response for ${route}:`);
    console.log('Status:', this.statusCode);
    try {
      // Log request headers for admin routes
      console.log('Request headers:', this.req.headers.authorization ? 'Authorization: Present' : 'Authorization: Missing');
      
      // Only log body for JSON responses to avoid binary data
      const contentType = this.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        // Try to parse and stringify the body to pretty-print it
        const bodyObj = typeof body === 'string' ? JSON.parse(body) : body;
        // Log if it's mock data
        console.log('isMockData:', bodyObj.isMockData || false);
      }
    } catch (e) {
      // Silently ignore logging errors
    }
  }
  return originalSend.call(this, body);
};

const server = app.listen(PORT, () => {
  console.log(`🚀 AutoPromote Server is running on port ${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
  console.log(`🔗 API endpoints available at: http://localhost:${PORT}/api/`);
}).on('error', (err) => {
  console.log('❌ Server startup error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use by another application.`);
    console.log('Try changing the PORT environment variable or closing the other application.');
  }
});

// -------------------------------------------------
// Background Workers (Phase B - Automatic Scheduling)
// -------------------------------------------------
// Controlled via env flags so we can disable on serverless / multi-instance deployments
const ENABLE_BACKGROUND = process.env.ENABLE_BACKGROUND_JOBS === 'true';
const STATS_POLL_INTERVAL_MS = parseInt(process.env.STATS_POLL_INTERVAL_MS || '180000', 10); // 3 minutes default
const TASK_PROCESS_INTERVAL_MS = parseInt(process.env.TASK_PROCESS_INTERVAL_MS || '60000', 10); // 1 minute default
const PLATFORM_STATS_POLL_INTERVAL_MS = parseInt(process.env.PLATFORM_STATS_POLL_INTERVAL_MS || '300000', 10); // 5 minutes default
const OAUTH_STATE_CLEAN_INTERVAL_MS = parseInt(process.env.OAUTH_STATE_CLEAN_INTERVAL_MS || '900000', 10); // 15 min default
const EARNINGS_AGG_INTERVAL_MS = parseInt(process.env.EARNINGS_AGG_INTERVAL_MS || '600000', 10); // 10 min default
const LOCK_CLEAN_INTERVAL_MS = parseInt(process.env.LOCK_CLEAN_INTERVAL_MS || '300000', 10); // 5 min default

if (ENABLE_BACKGROUND) {
  console.log('🛠  Background job runner enabled.');
  try {
  const { pollYouTubeStatsBatch } = require('./services/youtubeStatsPoller');
  const { pollPlatformPostMetricsBatch } = require('./services/platformStatsPoller');
    const { processNextYouTubeTask, processNextPlatformTask } = require('./services/promotionTaskQueue');
    const { acquireLock, INSTANCE_ID } = require('./services/workerLockService');
    console.log('🔐 Worker instance id:', INSTANCE_ID);

    // Simple re-entrancy guard flags
  let statsRunning = false;
  let taskRunning = false;
  let platformMetricsRunning = false;

    setInterval(async () => {
      if (statsRunning) return; // skip overlapping
      const ok = await acquireLock('statsPoller', STATS_POLL_INTERVAL_MS * 2).catch(()=>false);
      if (!ok) return; // another instance owns lock
      statsRunning = true;
      try {
        const jitter = Math.random() * 250;
        if (jitter) await new Promise(r=>setTimeout(r,jitter));
        // Poll stats with a conservative batch size
        const uidHint = process.env.DEFAULT_STATS_UID || null; // optional: if certain actions require a user context
        const result = await pollYouTubeStatsBatch({ uid: uidHint, velocityThreshold: parseInt(process.env.VELOCITY_THRESHOLD || '800', 10), batchSize: 5 });
        if (result.processed) {
          console.log(`[BG][stats] Updated ${result.processed} content docs`);
          try { require('./services/metricsRecorder').incrCounter('statsPoller.runs'); } catch(_){ }
        }
        try { require('./services/statusRecorder').recordRun('statsPoller', { lastProcessed: result.processed || 0, ok: true }); } catch(_){ }
      } catch (e) {
        console.warn('[BG][stats] error:', e.message);
        try { require('./services/statusRecorder').recordRun('statsPoller', { error: e.message, ok: false }); } catch(_){ }
      } finally {
        statsRunning = false;
      }
    }, STATS_POLL_INTERVAL_MS).unref();

    setInterval(async () => {
      if (taskRunning) return;
      const ok = await acquireLock('promotionTasks', TASK_PROCESS_INTERVAL_MS * 2).catch(()=>false);
      if (!ok) return;
      taskRunning = true;
      try {
        const jitter = Math.random() * 250;
        if (jitter) await new Promise(r=>setTimeout(r,jitter));
        let processed = 0;
        // Process up to N tasks per interval (interleave types)
        const MAX_BATCH = 5;
        for (let i = 0; i < MAX_BATCH; i++) {
          const yt = await processNextYouTubeTask();
          const pf = await processNextPlatformTask();
          if (!yt && !pf) break;
          processed += (yt ? 1 : 0) + (pf ? 1 : 0);
        }
        if (processed) {
          console.log(`[BG][tasks] Processed ${processed} queued tasks`);
          try { require('./services/metricsRecorder').incrCounter('promotionTasks.processed', processed); } catch(_){}
        }
        try { require('./services/statusRecorder').recordRun('promotionTasks', { processed, ok: true }); } catch(_){ }
      } catch (e) {
        console.warn('[BG][tasks] error:', e.message);
        try { require('./services/statusRecorder').recordRun('promotionTasks', { error: e.message, ok: false }); } catch(_){ }
      } finally {
        taskRunning = false;
      }
    }, TASK_PROCESS_INTERVAL_MS).unref();

    setInterval(async () => {
      if (platformMetricsRunning) return;
      const ok = await acquireLock('platformMetrics', PLATFORM_STATS_POLL_INTERVAL_MS * 2).catch(()=>false);
      if (!ok) return;
      platformMetricsRunning = true;
      try {
        const jitter = Math.random() * 250;
        if (jitter) await new Promise(r=>setTimeout(r,jitter));
        const r = await pollPlatformPostMetricsBatch({ batchSize: 5 });
        if (r.processed) console.log(`[BG][platform-metrics] Updated ${r.processed} platform post metrics`);
        if (r.processed) { try { require('./services/metricsRecorder').incrCounter('platformMetrics.processed', r.processed); } catch(_){} }
        try { require('./services/statusRecorder').recordRun('platformMetrics', { processed: r.processed || 0, ok: true }); } catch(_){ }
      } catch (e) {
        console.warn('[BG][platform-metrics] error:', e.message);
        try { require('./services/statusRecorder').recordRun('platformMetrics', { error: e.message, ok: false }); } catch(_){ }
      } finally {
        platformMetricsRunning = false;
      }
    }, PLATFORM_STATS_POLL_INTERVAL_MS).unref();

    // Cleanup old oauth_states docs (stale PKCE state) to reduce clutter
    try {
      const { cleanupOldStates } = require('./services/twitterService');
      setInterval(async () => {
        try {
          const removed = await cleanupOldStates(30); // older than 30 minutes
          if (removed) console.log(`[BG][oauth-states] cleaned ${removed} stale records`);
          if (removed) { try { require('./services/metricsRecorder').incrCounter('oauthStates.cleaned', removed); } catch(_){} }
          try { require('./services/statusRecorder').recordRun('oauthStateCleanup', { removed: removed || 0, ok: true }); } catch(_){ }
        } catch (e) {
          console.warn('[BG][oauth-states] cleanup failed:', e.message);
          try { require('./services/statusRecorder').recordRun('oauthStateCleanup', { error: e.message, ok: false }); } catch(_){ }
        }
      }, OAUTH_STATE_CLEAN_INTERVAL_MS).unref();
    } catch (e) {
      // twitterService may not exist if feature not deployed yet
      console.log('[BG][oauth-states] cleanup skipped:', e.message);
    }

    // Periodic earnings aggregation (best-effort, idempotent per batch)
    try {
      const { aggregateUnprocessed } = require('./services/earningsService');
      const { acquireLock } = require('./services/workerLockService');
      setInterval(async () => {
        try {
          const locked = await acquireLock('earningsAggregator', EARNINGS_AGG_INTERVAL_MS * 2).catch(()=>false);
          if (!locked) return; // another instance aggregating
          const jitter = Math.random() * 250;
          if (jitter) await new Promise(r=>setTimeout(r,jitter));
          const r = await aggregateUnprocessed({ batchSize: 300 });
          if (r.processedEvents) console.log(`[BG][earnings] aggregated ${r.processedEvents} events for ${r.usersUpdated} users`);
          if (r.processedEvents) { try { require('./services/metricsRecorder').incrCounter('earnings.eventsProcessed', r.processedEvents); } catch(_){} }
          try { require('./services/statusRecorder').recordRun('earningsAggregator', { processedEvents: r.processedEvents || 0, usersUpdated: r.usersUpdated || 0, ok: true }); } catch(_){ }
        } catch (e) {
          console.warn('[BG][earnings] aggregation failed:', e.message);
          try { require('./services/statusRecorder').recordRun('earningsAggregator', { error: e.message, ok: false }); } catch(_){ }
        }
      }, EARNINGS_AGG_INTERVAL_MS).unref();
    } catch (e) {
      console.log('[BG][earnings] service not available:', e.message);
    }

    // Stale lock cleanup (best-effort) - removes expired locks to prevent clutter
    setInterval(async () => {
      try {
        const now = Date.now();
        const snap = await db.collection('system_locks').limit(200).get();
        const batch = db.batch();
        let removed = 0;
        snap.forEach(d => { const v = d.data(); if (v.expiresAt && v.expiresAt < now - 60000) { batch.delete(d.ref); removed++; } });
        if (removed) { await batch.commit(); console.log(`[BG][locks] cleaned ${removed} stale locks`); }
        try { require('./services/statusRecorder').recordRun('lockCleanup', { removed: removed || 0, ok: true }); } catch(_){ }
      } catch (e) { console.warn('[BG][locks] cleanup error:', e.message); }
    }, LOCK_CLEAN_INTERVAL_MS).unref();
  } catch (e) {
    console.warn('⚠️ Background job initialization failed:', e.message);
  }
} else {
  console.log('ℹ️ Background job runner disabled (set ENABLE_BACKGROUND_JOBS=true to enable).');
}
