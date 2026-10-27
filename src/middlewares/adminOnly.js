// adminOnly middleware - ensures authenticated user has admin privileges
module.exports = function adminOnly(req, res, next) {
  // authMiddleware derives this only from the reviewed identity policy.
  if (!req.user || req.user.isAdmin !== true) {
    return res.status(403).json({ error: "admin_required" });
  }
  return next();
};
