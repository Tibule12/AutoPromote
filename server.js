
// TikTok and Facebook integrations
// const express = require('express');
const cors = require('cors');
const path = require('path');

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
const tiktokRoutes = require('./tiktokRoutes');

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
let withdrawalRoutes, monetizationRoutes, stripeOnboardRoutes, paymentsStatusRoutes, paymentsExtendedRoutes, notificationsRoutes, profileDefaultsRoutes, variantStrategyStatsRoutes;
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

try { paymentsStatusRoutes = require('./src/routes/paymentsStatusRoutes'); } catch(e) { try { paymentsStatusRoutes = require('./routes/paymentsStatusRoutes'); } catch(_) { paymentsStatusRoutes = express.Router(); } }
try { paymentsExtendedRoutes = require('./src/routes/paymentsExtendedRoutes'); } catch(e) { try { paymentsExtendedRoutes = require('./routes/paymentsExtendedRoutes'); } catch(_) { paymentsExtendedRoutes = express.Router(); } }
try { notificationsRoutes = require('./src/routes/notificationsRoutes'); } catch(e) { notificationsRoutes = express.Router(); }
try { profileDefaultsRoutes = require('./src/routes/profileDefaultsRoutes'); } catch(e) { profileDefaultsRoutes = express.Router(); }
try { variantStrategyStatsRoutes = require('./src/routes/variantStrategyStatsRoutes'); } catch(e) { variantStrategyStatsRoutes = express.Router(); }

// Import initialized Firebase services
const { db, auth, storage } = require('./firebaseAdmin');

const app = express();
// Request context (requestId, timing)
try { app.use(require('./src/middlewares/requestContext')); } catch(_) { /* optional */ }
const PORT = process.env.PORT || 5000; // Default to port 5000, Render will override with its own PORT

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/tiktok', tiktokRoutes);
app.use('/api', adminTestRoutes); // Add admin test routes

// Register optional routes
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/monetization', monetizationRoutes);
app.use('/api/stripe', stripeOnboardRoutes);
app.use('/api/payments', paymentsStatusRoutes); // /status + dev mocks
app.use('/api/payments', paymentsExtendedRoutes); // /balance /plans /admin/overview
app.use('/api/notifications', notificationsRoutes);
app.use('/api/profile', profileDefaultsRoutes);
app.use('/api/admin/variants', variantStrategyStatsRoutes);

// Serve well-known static files (e.g., TikTok site verification) from /public/.well-known
const wellKnownDir = path.join(__dirname, 'public', '.well-known');
app.use('/.well-known', express.static(wellKnownDir, { dotfiles: 'allow' }));

// Serve static files from the React app build directory
const frontendBuild = path.join(__dirname, 'frontend', 'build');
app.use(express.static(frontendBuild, { index: false, fallthrough: true }));

// Avoid serving index.html for asset paths to prevent HTML in JS errors
app.get(['/*.js', '/*.css', '/static/*', '/asset-manifest.json', '/favicon.ico', '/manifest.json'], (req, res, next) => {
  const filePath = path.join(frontendBuild, req.path.replace(/^\/+/, ''));
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

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
    timestamp: new Date().toISOString(),
    requestId: req.requestId || null
  });
});

// Catch all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.log('Server error:', err.message, 'requestId=', req.requestId);
  try { const { audit } = require('./src/services/auditLogger'); audit.log('server.error', { message: err.message, stack: (process.env.NODE_ENV==='production')?undefined:err.stack, requestId: req.requestId }); } catch(_){ }
  
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
      : err.message,
    requestId: req.requestId || null
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


