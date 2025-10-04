
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

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
let facebookRoutes, youtubeRoutes, instagramRoutes;
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
  promotionTaskRoutes = require('./routes/promotionTaskRoutes');
  console.log('✅ Promotion task routes loaded');
} catch (e) {
  console.log('⚠️ Promotion task routes not found:', e.message);
  promotionTaskRoutes = express.Router();
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
try {
  adminTestRoutes = require('./adminTestRoutes');
} catch (error) {
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

// CORS configuration - allow all origins for debugging
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
app.use('/api/promotion-tasks', promotionTaskRoutes);
console.log('🚏 Promotion task routes mounted at /api/promotion-tasks');
app.use('/api/metrics', metricsRoutes);
console.log('🚏 Metrics routes mounted at /api/metrics');
app.use('/api/instagram', instagramRoutes);
console.log('🚏 Instagram routes mounted at /api/instagram');

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'AutoPromote Server is running',
    timestamp: new Date().toISOString()
  });
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

if (ENABLE_BACKGROUND) {
  console.log('🛠  Background job runner enabled.');
  try {
  const { pollYouTubeStatsBatch } = require('./services/youtubeStatsPoller');
  const { pollPlatformPostMetricsBatch } = require('./services/platformStatsPoller');
    const { processNextYouTubeTask, processNextPlatformTask } = require('./services/promotionTaskQueue');

    // Simple re-entrancy guard flags
  let statsRunning = false;
  let taskRunning = false;
  let platformMetricsRunning = false;

    setInterval(async () => {
      if (statsRunning) return; // skip overlapping
      statsRunning = true;
      try {
        // Poll stats with a conservative batch size
        const uidHint = process.env.DEFAULT_STATS_UID || null; // optional: if certain actions require a user context
        const result = await pollYouTubeStatsBatch({ uid: uidHint, velocityThreshold: parseInt(process.env.VELOCITY_THRESHOLD || '800', 10), batchSize: 5 });
        if (result.processed) {
          console.log(`[BG][stats] Updated ${result.processed} content docs`);
        }
      } catch (e) {
        console.warn('[BG][stats] error:', e.message);
      } finally {
        statsRunning = false;
      }
    }, STATS_POLL_INTERVAL_MS).unref();

    setInterval(async () => {
      if (taskRunning) return;
      taskRunning = true;
      try {
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
        }
      } catch (e) {
        console.warn('[BG][tasks] error:', e.message);
      } finally {
        taskRunning = false;
      }
    }, TASK_PROCESS_INTERVAL_MS).unref();

    setInterval(async () => {
      if (platformMetricsRunning) return;
      platformMetricsRunning = true;
      try {
        const r = await pollPlatformPostMetricsBatch({ batchSize: 5 });
        if (r.processed) console.log(`[BG][platform-metrics] Updated ${r.processed} platform post metrics`);
      } catch (e) {
        console.warn('[BG][platform-metrics] error:', e.message);
      } finally {
        platformMetricsRunning = false;
      }
    }, PLATFORM_STATS_POLL_INTERVAL_MS).unref();
  } catch (e) {
    console.warn('⚠️ Background job initialization failed:', e.message);
  }
} else {
  console.log('ℹ️ Background job runner disabled (set ENABLE_BACKGROUND_JOBS=true to enable).');
}
