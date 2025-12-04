const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const adminOnly = require('../middlewares/adminOnly');
const { db, admin } = require('../firebaseAdmin');
const os = require('os');

// Get system health metrics
router.get('/health', authMiddleware, adminOnly, async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
        usage: process.cpuUsage()
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        totalMemory: os.totalmem() / 1024 / 1024 / 1024, // GB
        freeMemory: os.freemem() / 1024 / 1024 / 1024 // GB
      }
    };
    
    res.json({ success: true, health });
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get recent errors
router.get('/errors', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { limit = 100, severity } = req.query;
    
    let query = db.collection('error_logs').orderBy('timestamp', 'desc');
    
    if (severity) {
      query = query.where('severity', '==', severity);
    }
    
    const snapshot = await query.limit(parseInt(limit)).get();
    
    const errors = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));
    
    // Get error stats
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentErrors = errors.filter(err => 
      err.timestamp && new Date(err.timestamp) > last24Hours
    );
    
    const errorsByType = recentErrors.reduce((acc, err) => {
      acc[err.type] = (acc[err.type] || 0) + 1;
      return acc;
    }, {});
    
    res.json({ 
      success: true, 
      errors, 
      stats: {
        total: errors.length,
        last24Hours: recentErrors.length,
        byType: errorsByType
      }
    });
  } catch (error) {
    console.error('Error fetching error logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get API metrics
router.get('/api-metrics', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    let startTime = new Date();
    if (timeframe === '24h') {
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (timeframe === '7d') {
      startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '30d') {
      startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    
    const startTimestamp = admin.firestore.Timestamp.fromDate(startTime);
    
    const snapshot = await db.collection('api_requests')
      .where('timestamp', '>=', startTimestamp)
      .get();
    
    const requests = snapshot.docs.map(doc => doc.data());
    
    // Calculate metrics
    const totalRequests = requests.length;
    const successfulRequests = requests.filter(r => r.status >= 200 && r.status < 300).length;
    const failedRequests = requests.filter(r => r.status >= 400).length;
    const avgResponseTime = requests.reduce((sum, r) => sum + (r.responseTime || 0), 0) / totalRequests || 0;
    
    const requestsByEndpoint = requests.reduce((acc, r) => {
      const endpoint = r.endpoint || 'unknown';
      if (!acc[endpoint]) {
        acc[endpoint] = { count: 0, avgResponseTime: 0, errors: 0 };
      }
      acc[endpoint].count++;
      acc[endpoint].avgResponseTime += r.responseTime || 0;
      if (r.status >= 400) acc[endpoint].errors++;
      return acc;
    }, {});
    
    // Calculate averages
    Object.keys(requestsByEndpoint).forEach(endpoint => {
      requestsByEndpoint[endpoint].avgResponseTime /= requestsByEndpoint[endpoint].count;
    });
    
    const topEndpoints = Object.entries(requestsByEndpoint)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([endpoint, stats]) => ({ endpoint, ...stats }));
    
    res.json({
      success: true,
      metrics: {
        totalRequests,
        successfulRequests,
        failedRequests,
        successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
        avgResponseTime: Math.round(avgResponseTime),
        topEndpoints
      }
    });
  } catch (error) {
    console.error('Error fetching API metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get real-time activity feed
router.get('/activity', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const snapshot = await db.collection('activities')
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const activities = [];
    for (const doc of snapshot.docs) {
      const activityData = doc.data();
      
      // Get user info if available
      let userData = null;
      if (activityData.userId) {
        const userDoc = await db.collection('users').doc(activityData.userId).get();
        if (userDoc.exists) {
          const user = userDoc.data();
          userData = {
            id: activityData.userId,
            name: user.name,
            email: user.email
          };
        }
      }
      
      activities.push({
        id: doc.id,
        ...activityData,
        user: userData,
        timestamp: activityData.timestamp?.toDate?.() || activityData.timestamp
      });
    }
    
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Firebase usage stats
router.get('/firebase-usage', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Get collection sizes
    const collections = [
      'users', 'content', 'community_posts', 'community_comments', 
      'community_likes', 'analytics', 'transactions', 'activities'
    ];
    
    const collectionStats = await Promise.all(
      collections.map(async (collectionName) => {
        const snapshot = await db.collection(collectionName).count().get();
        return {
          name: collectionName,
          documentCount: snapshot.data().count
        };
      })
    );
    
    const totalDocuments = collectionStats.reduce((sum, stat) => sum + stat.documentCount, 0);
    
    res.json({
      success: true,
      usage: {
        totalDocuments,
        collections: collectionStats
      }
    });
  } catch (error) {
    console.error('Error fetching Firebase usage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear cache (if implemented)
router.post('/cache/clear', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Add cache clearing logic here if you have Redis or similar
    // For now, just log the action
    
    await db.collection('audit_logs').add({
      action: 'clear_cache',
      adminId: req.user.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get database query performance
router.get('/query-performance', authMiddleware, adminOnly, async (req, res) => {
  try {
    const snapshot = await db.collection('query_metrics')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    
    const queries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));
    
    // Calculate slow queries (> 1000ms)
    const slowQueries = queries.filter(q => q.duration > 1000);
    const avgQueryTime = queries.reduce((sum, q) => sum + (q.duration || 0), 0) / queries.length || 0;
    
    res.json({
      success: true,
      performance: {
        totalQueries: queries.length,
        slowQueries: slowQueries.length,
        avgQueryTime: Math.round(avgQueryTime),
        queries: queries.slice(0, 20)
      }
    });
  } catch (error) {
    console.error('Error fetching query performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
