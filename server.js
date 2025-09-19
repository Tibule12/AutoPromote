
// TikTok and Facebook integrations
const express = require('express');
const cors = require('cors');
const path = require('path');
const tiktokRoutes = require('./tiktokRoutes');
// facebookPoster is a utility, not a router, so no need to use as middleware

const app = express();
const PORT = process.env.PORT || 5000; // Default to port 5000, Render will override with its own PORT

// TikTok site verification file (must be before static/catch-all routes)
app.get('/tiktok_verify.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'tiktok_verify.txt'));
});

// Register TikTok API routes
app.use('/api/tiktok', tiktokRoutes);
app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service | AutoPromote</title>
</head>
<body>
  <h1>Terms of Service</h1>
  <p>Welcome to AutoPromote. By accessing or using our platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>
  <h2>1. Use of Service</h2>
  <p>You must be at least 13 years old to use AutoPromote. You agree to use the service only for lawful purposes and in accordance with all applicable laws.</p>
  <h2>2. User Content</h2>
  <p>You retain ownership of any content you upload, but you grant AutoPromote a license to use, display, and distribute your content as necessary to provide the service.</p>
  <h2>3. Privacy</h2>
  <p>Your privacy is important to us. Please review our <a href="/privacy">Privacy Policy</a> for details on how we handle your information.</p>
  <h2>4. Limitation of Liability</h2>
  <p>AutoPromote is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the service.</p>
  <h2>5. Changes to Terms</h2>
  <p>We may update these Terms of Service from time to time. Continued use of the service constitutes acceptance of the new terms.</p>
  <h2>6. Contact</h2>
  <p>If you have questions about these terms, contact us at <a href="mailto:support@autopromote.com">support@autopromote.com</a>.</p>
</body>
</html>`);
});

app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy | AutoPromote</title>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>AutoPromote is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.</p>
  <h2>1. Information We Collect</h2>
  <p>We collect information you provide directly (such as account details and uploaded content) and information from connected social platforms as needed to provide our services.</p>
  <h2>2. Use of Information</h2>
  <p>We use your information to operate, maintain, and improve AutoPromote, and to communicate with you about your account or our services.</p>
  <h2>3. Sharing of Information</h2>
  <p>We do not sell or share your personal information with third parties except as required to provide our services or comply with the law.</p>
  <h2>4. Data Security</h2>
  <p>We implement reasonable security measures to protect your data, but cannot guarantee absolute security.</p>
  <h2>5. Your Rights</h2>
  <p>You may request access to or deletion of your personal data by contacting us at <a href="mailto:support@autopromote.com">support@autopromote.com</a>.</p>
  <h2>6. Changes to Policy</h2>
  <p>We may update this Privacy Policy from time to time. Continued use of the service constitutes acceptance of the new policy.</p>
  <h2>7. Contact</h2>
  <p>If you have questions about this policy, contact us at <a href="mailto:support@autopromote.com">support@autopromote.com</a>.</p>
</body>
</html>`);
});


require('dotenv').config();

// Load core routes
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const contentRoutes = require('./contentRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const adminRoutes = require('./adminRoutes');
const adminAnalyticsRoutes = require('./adminAnalyticsRoutes');


// Try to load adminTestRoutes, but continue with a dummy router if not available
let adminTestRoutes;
try {
  adminTestRoutes = require('./adminTestRoutes');
  if (typeof adminTestRoutes !== 'function' && typeof adminTestRoutes !== 'object') {
    adminTestRoutes = express.Router();
  }
} catch (error) {
  adminTestRoutes = express.Router();
  adminTestRoutes.get('/admin-test/health', (req, res) => {
    res.json({ status: 'ok', message: 'Admin test routes dummy endpoint' });
  });
}

// Try to load optional route modules
let withdrawalRoutes, monetizationRoutes, stripeOnboardRoutes;
try {
  withdrawalRoutes = require('./routes/withdrawalRoutes');
  if (typeof withdrawalRoutes !== 'function' && typeof withdrawalRoutes !== 'object') {
    withdrawalRoutes = express.Router();
  }
} catch (error) {
  withdrawalRoutes = express.Router();
}

try {
  monetizationRoutes = require('./routes/monetizationRoutes');
  console.log('✅ Monetization routes loaded successfully');
  if (typeof monetizationRoutes !== 'function' && typeof monetizationRoutes !== 'object') {
    monetizationRoutes = express.Router();
  }
} catch (error) {
  console.log('⚠️ Monetization routes not found, using dummy router:', error.message);
  monetizationRoutes = express.Router();
}

try {
  stripeOnboardRoutes = require('./routes/stripeOnboardRoutes');
  if (typeof stripeOnboardRoutes !== 'function' && typeof stripeOnboardRoutes !== 'object') {
    stripeOnboardRoutes = express.Router();
  }
} catch (error) {
  stripeOnboardRoutes = express.Router();
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('ℹ️ STRIPE_SECRET_KEY not found. Stripe features will be disabled.');
  }
}


// Import initialized Firebase services
const { db, auth, storage } = require('./firebaseAdmin');

// CORS configuration - allow all origins for debugging
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://autopromote-1.onrender.com',
      'http://localhost:3000'
    ];
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
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
app.use('/api', adminTestRoutes); // Add admin test routes

// Register optional routes
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/monetization', monetizationRoutes);
app.use('/api/stripe', stripeOnboardRoutes);

// Register optimization routes (content upload, promotion, analytics aggregation)
const optimizationRoutes = require('./optimizationService');
app.use('/api', optimizationRoutes);

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'frontend/build')));

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
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
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

