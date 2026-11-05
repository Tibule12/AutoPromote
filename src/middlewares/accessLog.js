const { requestLogPath, safeLogText } = require("../utils/logSanitizer");

function accessLog(logger, appendLine) {
  return (req, res, next) => {
    const start = Date.now();
    const send = res.send;
    let bytes = 0;
    res.send = function (body) {
      // Express serializes JSON itself and calls send again with that string.
      // Do not serialize a large response a second time merely to count bytes.
      if (typeof body === "string") bytes = Buffer.byteLength(body);
      else if (Buffer.isBuffer(body)) bytes = body.length;
      return send.call(this, body);
    };
    res.once("finish", () => {
      try {
        const ts = new Date().toISOString();
        const clean = value => safeLogText(String(value || ""), 512).replace(/"/g, "");
        const line =
          `[ACCESS] ts=${ts} ${clean(req.method)} ${requestLogPath(req.originalUrl || req.url)}` +
          ` status=${res.statusCode} requestID="${clean(req.requestId)}"` +
          ` clientIP="${clean(req.headers["x-forwarded-for"] || req.ip)}"` +
          ` responseTimeMS=${Date.now() - start} responseBytes=${bytes}` +
          ` userAgent="${clean(req.headers["user-agent"])}"`;
        logger.info(line);
        if (appendLine) appendLine(line, ts);
      } catch (_) {
        /* Logging failure cannot fail a completed response. */
      }
    });
    next();
  };
}

module.exports = accessLog;
