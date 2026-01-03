/* eslint-disable no-console */
// Middleware to ensure the authenticated user has access to AfterDark/adult area
module.exports = async function requireAdultAccess(req, res, next) {
  try {
    // Expect `authMiddleware` to have already attached `req.user` (see src/authMiddleware.js)
    const user = req.user;
    if (!user || !user.uid) return res.status(401).json({ error: 'Authentication required' });

    // Allow admins through
    if (user.isAdmin || (user.role && user.role === 'admin')) return next();

    // Check KYC / explicit access flag on the user record
    const hasKyc = !!user.kycVerified;
    const hasFlag = !!(user.flags && (user.flags.afterDarkAccess === true || user.flags.afterDarkAccess === 'true'));

    if (!hasKyc && !hasFlag) {
      return res.status(403).json({ error: 'Access to AfterDark is restricted' });
    }

    // attach for downstream use
    req.userRecord = user;
    return next();
  } catch (e) {
    console.error('requireAdultAccess error', e && e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
