// requestContext middleware: attaches a lightweight per-request context (requestId, startTime)
// Generates a simple unique id (timestamp + random) sufficient for log correlation.
const crypto = require('crypto');
module.exports = function requestContext(req, _res, next) {
  const rnd = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'));
  req.requestId = `${Date.now().toString(36)}-${rnd}`;
  req._startTimeMs = Date.now();
  next();
};
