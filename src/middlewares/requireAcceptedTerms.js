const { db } = require('../../firebaseAdmin');

// Factory: returns middleware that enforces acceptance of the given terms version
// options: { version: string }
module.exports = function requireAcceptedTerms(options = {}) {
  const requiredVersion = options.version || process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0';

  return async function (req, res, next) {
    try {
      // Bypass terms check for E2E tests: either special header or origin from localhost
      const hostHeader = req.headers && (req.headers.host || '');
      if (req.headers && (req.headers['x-playwright-e2e'] === '1' || (hostHeader && (hostHeader.includes('127.0.0.1') || hostHeader.includes('localhost'))))) return next();
      // Ensure user is authenticated and we have uid
      const uid = req.userId || (req.user && req.user.uid);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      // Read user's last accepted terms from Firestore user doc
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const last = userData.lastAcceptedTerms || null;

      if (last && last.version === requiredVersion) {
        return next();
      }

      // Not accepted or version mismatch: include required version and hint header
      try { res.setHeader('x-required-terms-version', requiredVersion); } catch(_) {}
      return res.status(403).json({ error: 'terms_not_accepted', requiredVersion });
    } catch (err) {
      console.error('requireAcceptedTerms error:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  };
};
