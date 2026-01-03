const { verifyToken } = require("../services/liveTokens");

module.exports = async function liveAccess(req, res, next) {
  try {
    const token =
      req.headers["x-live-token"] ||
      req.query.token ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);
    if (!token) return res.status(401).json({ error: "live_token_required" });
    const v = await verifyToken(token);
    if (!v.valid) return res.status(403).json({ error: "access_denied", reason: v.reason });
    req.liveToken = v.data;
    req.liveTokenRef = v.tokenDocRef;
    return next();
  } catch (e) {
    console.error("liveAccess middleware error:", e && e.message);
    return res.status(500).json({ error: "internal_error" });
  }
};
