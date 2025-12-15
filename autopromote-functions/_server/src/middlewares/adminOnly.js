// adminOnly middleware - ensures authenticated user has admin privileges
module.exports = function adminOnly(req, res, next) {
  // Require explicit isAdmin flag (set only via claims or admins collection)
  if (!req.user || req.user.isAdmin !== true) {
    return res.status(403).json({ error: "admin_required" });
  }
  return next();
};
