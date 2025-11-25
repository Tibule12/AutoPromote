// requestContext middleware: attaches a lightweight per-request context (requestId, startTime)
// Generates a simple unique id (timestamp + random) sufficient for log correlation.
module.exports = function requestContext(req, _res, next) {
  req.requestId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2,8)}`;
  req._startTimeMs = Date.now();
  next();
};
