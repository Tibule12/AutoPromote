// adminOnly middleware - ensures authenticated user has admin privileges
module.exports = function adminOnly(req, res, next) {
  // authMiddleware should already populate req.user
  if (!req.user || !(req.user.isAdmin || req.user.role === 'admin')) {
    return res.status(403).json({ error: 'admin_required' });
  }
  return next();
};
