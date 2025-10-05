const { admin, db } = require('./firebaseAdmin');

const authMiddleware = async (req, res, next) => {
  try {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const debugAuth = process.env.DEBUG_AUTH === 'true';
  if (debugAuth) console.log('Auth middleware - token provided:', token ? 'Yes (length: ' + token.length + ')' : 'No');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Log the first 10 chars of token for debugging
  if (debugAuth) console.log('Token preview:', token.substring(0, 10) + '...');
    
    // Check if this is a custom token (shouldn't be used directly for auth)
    if (token.length < 100 || !token.startsWith('eyJ')) {
  if (debugAuth) console.log('Warning: Received token does not appear to be a valid Firebase ID token');
      return res.status(401).json({ 
        error: 'Invalid token format', 
        message: 'Please exchange your custom token for an ID token before making authenticated requests'
      });
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    // Optional audience / issuer enforcement
    const expectedAud = process.env.JWT_AUDIENCE;
    const expectedIss = process.env.JWT_ISSUER;
    if (expectedAud && decodedToken.aud && decodedToken.aud !== expectedAud) {
      return res.status(401).json({ error:'invalid_audience' });
    }
    if (expectedIss && decodedToken.iss && decodedToken.iss !== expectedIss) {
      return res.status(401).json({ error:'invalid_issuer' });
    }
  if (debugAuth) console.log('Token verification successful, decoded:', JSON.stringify({
      uid: decodedToken.uid,
      email: decodedToken.email,
      admin: decodedToken.admin,
      role: decodedToken.role
    }, null, 2));
    
    // Extract any custom claims
    const isAdminFromClaims = decodedToken.admin === true;
    const roleFromClaims = isAdminFromClaims ? 'admin' : (decodedToken.role || 'user');
    
    // Set the user ID on the request for later use
    req.userId = decodedToken.uid;
    
    try {
      // Get user data from Firestore
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      
      // Check if user is an admin by checking the admins collection
      const adminDoc = await db.collection('admins').doc(decodedToken.uid).get();
      const isAdminInCollection = adminDoc.exists;
      
      // If admin is found in admins collection, use that data instead
      if (isAdminInCollection) {
  if (debugAuth) console.log('User found in admins collection:', decodedToken.uid);
        const adminData = adminDoc.data();
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          ...adminData,
          isAdmin: true,
          role: 'admin',
          fromCollection: 'admins'
        };
  if (debugAuth) console.log('Admin user data attached to request');
        return next();
      }
      
      if (!userData) {
        // Create a basic user document if it doesn't exist
  if (debugAuth) console.log('No user document found in Firestore, creating one...');
        const basicUserData = {
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email?.split('@')[0],
          role: roleFromClaims, // Use role from claims
          isAdmin: isAdminFromClaims,
          createdAt: new Date().toISOString()
        };
  if (debugAuth) console.log('Creating user with data:', JSON.stringify(basicUserData, null, 2));
        await db.collection('users').doc(decodedToken.uid).set(basicUserData);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          ...basicUserData
        };
  if (debugAuth) console.log('New user document created and attached to request');
      } else {
        // If user exists but role needs to be updated based on claims
  if (debugAuth) console.log('User document found:', JSON.stringify({
          uid: decodedToken.uid,
          email: userData.email,
          role: userData.role,
          isAdmin: userData.isAdmin
        }, null, 2));
        
        if (isAdminFromClaims && userData.role !== 'admin') {
          if (debugAuth) console.log('Updating user to admin role based on token claims');
          await db.collection('users').doc(decodedToken.uid).update({
            role: 'admin',
            isAdmin: true,
            updatedAt: new Date().toISOString()
          });
          userData.role = 'admin';
          userData.isAdmin = true;
        }
        
        // Attach full user data to request
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          ...userData
        };
        console.log('User data attached to request');
      }
    } catch (firestoreError) {
      console.error('Firestore error in auth middleware:', firestoreError);
      console.log('Firestore error details:', JSON.stringify({
        code: firestoreError.code,
        message: firestoreError.message
      }, null, 2));
      
      // Even if Firestore fails, still allow the request to proceed with basic user info
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: roleFromClaims,
        isAdmin: isAdminFromClaims
      };
      
      console.log('Proceeding with basic user info from token claims only');
      console.log('User from token claims:', JSON.stringify(req.user, null, 2));
    }

    next();
  } catch (error) {
    console.error('Auth error:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;