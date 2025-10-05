const { admin, db } = require('./firebaseAdmin');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const debugAuth = process.env.DEBUG_AUTH === 'true';
    if (debugAuth) console.log('[auth] token provided:', token ? 'Yes (length: ' + token.length + ')' : 'No');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    if (debugAuth) console.log('[auth] token preview (masked):', token.substring(0,4) + '...' + token.slice(-4));

    // Basic shape sanity for Firebase ID token (JWT header starts with eyJ)
    if (token.length < 100 || !token.startsWith('eyJ')) {
      if (debugAuth) console.log('[auth] rejected: token not a Firebase ID token');
      return res.status(401).json({
        error: 'Invalid token format',
        message: 'Exchange custom token for an ID token before calling protected APIs'
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    // Optional audience / issuer enforcement
    const expectedAud = process.env.JWT_AUDIENCE;
    const expectedIss = process.env.JWT_ISSUER;
    if (expectedAud && decodedToken.aud && decodedToken.aud !== expectedAud) {
      if (debugAuth) console.log('[auth] audience mismatch', decodedToken.aud, '!=', expectedAud);
      return res.status(401).json({ error: 'invalid_audience' });
    }
    if (expectedIss && decodedToken.iss && decodedToken.iss !== expectedIss) {
      if (debugAuth) console.log('[auth] issuer mismatch', decodedToken.iss, '!=', expectedIss);
      return res.status(401).json({ error: 'invalid_issuer' });
    }

    if (debugAuth) console.log('[auth] verified uid=', decodedToken.uid, 'email=', decodedToken.email);

    const isAdminFromClaims = decodedToken.admin === true;
    const roleFromClaims = isAdminFromClaims ? 'admin' : (decodedToken.role || 'user');
    req.userId = decodedToken.uid;

    try {
      const [userDoc, adminDoc] = await Promise.all([
        db.collection('users').doc(decodedToken.uid).get(),
        db.collection('admins').doc(decodedToken.uid).get()
      ]);
      const userData = userDoc.exists ? userDoc.data() : null;
      const isAdminInCollection = adminDoc.exists;

      if (isAdminInCollection) {
        if (debugAuth) console.log('[auth] admin doc found');
        const adminData = adminDoc.data();
        req.user = { uid: decodedToken.uid, email: decodedToken.email, ...adminData, isAdmin: true, role: 'admin', fromCollection: 'admins' };
        return next();
      }

      if (!userData) {
        if (debugAuth) console.log('[auth] creating new user doc');
        const basicUserData = {
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email?.split('@')[0],
          role: roleFromClaims,
          isAdmin: isAdminFromClaims,
          createdAt: new Date().toISOString()
        };
        await db.collection('users').doc(decodedToken.uid).set(basicUserData);
        req.user = { uid: decodedToken.uid, email: decodedToken.email, ...basicUserData };
      } else {
        if (isAdminFromClaims && userData.role !== 'admin') {
          if (debugAuth) console.log('[auth] elevating user to admin based on claims');
          await db.collection('users').doc(decodedToken.uid).update({
            role: 'admin',
            isAdmin: true,
            updatedAt: new Date().toISOString()
          });
          userData.role = 'admin';
          userData.isAdmin = true;
        }
        req.user = { uid: decodedToken.uid, email: decodedToken.email, ...userData };
      }
    } catch (firestoreError) {
      if (debugAuth) console.error('[auth] Firestore error', firestoreError.message);
      req.user = { uid: decodedToken.uid, email: decodedToken.email, role: roleFromClaims, isAdmin: isAdminFromClaims };
    }

    next();
  } catch (error) {
    console.error('[auth] error verifying token', error.message);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;
