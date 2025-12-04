const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const adminOnly = require('../middlewares/adminOnly');
const { db, admin } = require('../firebaseAdmin');

// Get all audit logs
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { action, adminId, limit = 100, startDate, endDate } = req.query;
    
    let query = db.collection('audit_logs');
    
    if (action) {
      query = query.where('action', '==', action);
    }
    
    if (adminId) {
      query = query.where('adminId', '==', adminId);
    }
    
    if (startDate) {
      const start = admin.firestore.Timestamp.fromDate(new Date(startDate));
      query = query.where('timestamp', '>=', start);
    }
    
    if (endDate) {
      const end = admin.firestore.Timestamp.fromDate(new Date(endDate));
      query = query.where('timestamp', '<=', end);
    }
    
    const snapshot = await query
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const logs = [];
    for (const doc of snapshot.docs) {
      const logData = doc.data();
      
      // Get admin user info
      let adminData = null;
      if (logData.adminId) {
        const adminDoc = await db.collection('users').doc(logData.adminId).get();
        if (adminDoc.exists) {
          const admin = adminDoc.data();
          adminData = {
            id: logData.adminId,
            name: admin.name,
            email: admin.email
          };
        }
      }
      
      logs.push({
        id: doc.id,
        ...logData,
        admin: adminData,
        timestamp: logData.timestamp?.toDate?.() || logData.timestamp
      });
    }
    
    res.json({ success: true, logs, total: logs.length });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get audit log statistics
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    let startDate = new Date();
    if (timeframe === '24h') {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (timeframe === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    
    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
    
    const snapshot = await db.collection('audit_logs')
      .where('timestamp', '>=', startTimestamp)
      .get();
    
    const logs = snapshot.docs.map(doc => doc.data());
    
    // Calculate statistics
    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});
    
    const adminActivity = logs.reduce((acc, log) => {
      if (log.adminId) {
        acc[log.adminId] = (acc[log.adminId] || 0) + 1;
      }
      return acc;
    }, {});
    
    res.json({
      success: true,
      stats: {
        totalActions: logs.length,
        actionCounts,
        topAdmins: Object.entries(adminActivity)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([adminId, count]) => ({ adminId, count }))
      }
    });
  } catch (error) {
    console.error('Error fetching audit log stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get security events
router.get('/security-events', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { limit = 50, severity } = req.query;
    
    let query = db.collection('security_events');
    
    if (severity) {
      query = query.where('severity', '==', severity);
    }
    
    const snapshot = await query
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));
    
    res.json({ success: true, events });
  } catch (error) {
    console.error('Error fetching security events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Block/unblock IP address
router.post('/ip-blocks', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { ip, action, reason } = req.body; // action: 'block' or 'unblock'
    
    if (!ip) {
      return res.status(400).json({ success: false, error: 'IP address required' });
    }
    
    if (action === 'block') {
      await db.collection('blocked_ips').doc(ip).set({
        ip,
        reason: reason || 'Admin blocked',
        blockedBy: req.user.uid,
        blockedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await db.collection('audit_logs').add({
        action: 'block_ip',
        adminId: req.user.uid,
        ip,
        reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ success: true, message: 'IP blocked successfully' });
    } else if (action === 'unblock') {
      await db.collection('blocked_ips').doc(ip).delete();
      
      await db.collection('audit_logs').add({
        action: 'unblock_ip',
        adminId: req.user.uid,
        ip,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ success: true, message: 'IP unblocked successfully' });
    }
  } catch (error) {
    console.error('Error managing IP block:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get blocked IPs
router.get('/ip-blocks', authMiddleware, adminOnly, async (req, res) => {
  try {
    const snapshot = await db.collection('blocked_ips').get();
    
    const blockedIps = [];
    for (const doc of snapshot.docs) {
      const blockData = doc.data();
      
      // Get admin who blocked
      let adminData = null;
      if (blockData.blockedBy) {
        const adminDoc = await db.collection('users').doc(blockData.blockedBy).get();
        if (adminDoc.exists) {
          const admin = adminDoc.data();
          adminData = {
            id: blockData.blockedBy,
            name: admin.name,
            email: admin.email
          };
        }
      }
      
      blockedIps.push({
        ...blockData,
        admin: adminData,
        blockedAt: blockData.blockedAt?.toDate?.() || blockData.blockedAt
      });
    }
    
    res.json({ success: true, blockedIps });
  } catch (error) {
    console.error('Error fetching blocked IPs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export audit logs (for GDPR compliance)
router.post('/export', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.body;
    
    let query = db.collection('audit_logs');
    
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    
    if (startDate) {
      const start = admin.firestore.Timestamp.fromDate(new Date(startDate));
      query = query.where('timestamp', '>=', start);
    }
    
    if (endDate) {
      const end = admin.firestore.Timestamp.fromDate(new Date(endDate));
      query = query.where('timestamp', '<=', end);
    }
    
    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Log the export action
    await db.collection('audit_logs').add({
      action: 'export_audit_logs',
      adminId: req.user.uid,
      userId,
      recordCount: logs.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ success: true, logs, count: logs.length });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
