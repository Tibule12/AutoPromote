const MiB = 1024 * 1024;

function createMediaTransferBudget({
  maxActive = 2,
  rssLimitBytes = 384 * MiB,
  reserveBytes = 16 * MiB,
  memoryUsage = process.memoryUsage,
} = {}) {
  let active = 0;
  let reserved = 0;
  return {
    acquire(reservation = reserveBytes) {
      if (active >= maxActive || memoryUsage().rss + reserved + reservation > rssLimitBytes) {
        throw Object.assign(new Error("Media transfers are busy. Please retry shortly."), {
          status: 503,
          code: "MEDIA_TRANSFER_BUSY",
          retryAfter: 15,
          errorClass: "transient",
        });
      }
      active++;
      reserved += reservation;
      let released = false;
      return () => {
        if (!released) {
          active--;
          reserved -= reservation;
          released = true;
        }
      };
    },
    snapshot: () => ({
      active,
      reservedBytes: reserved,
      maxActive,
      rssLimitBytes,
      rssBytes: memoryUsage().rss,
    }),
  };
}

const constrained = process.constrainedMemory?.() || 0;
const positive = (value, fallback) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const transfers = createMediaTransferBudget({
  maxActive: positive(process.env.MEDIA_TRANSFER_MAX_CONCURRENCY, 2),
  rssLimitBytes:
    positive(
      process.env.MEDIA_TRANSFER_RSS_LIMIT_MB,
      constrained ? Math.floor((constrained / MiB) * 0.75) : 384
    ) * MiB,
});

function admit(req, res, next, reservation) {
  let release;
  try {
    release = transfers.acquire(reservation);
  } catch (error) {
    res.set("Retry-After", String(error.retryAfter));
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  res.once("close", release);
  res.once("finish", release);
  next();
}

const admitMediaTransfer = (req, res, next) => admit(req, res, next);
const admitVoicePreview = (req, res, next) => admit(req, res, next, 64 * MiB);

function admitLargeStructuredBody(req, res, next) {
  if (!req.is(["application/json", "application/*+json", "application/x-www-form-urlencoded"]))
    return next();
  const encoded = req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity";
  const length = encoded ? NaN : Number(req.headers["content-length"]);
  if (Number.isFinite(length) && length <= 256 * 1024) return next();
  if (!req.headers["transfer-encoding"] && !req.headers["content-length"]) return next();
  // Parsing needs room for incoming bytes, decoded text, objects and a result.
  // Unknown-length structured bodies reserve against the existing 50 MiB cap.
  return admit(req, res, next, Math.max(16 * MiB, 4 * (length || 50 * MiB)));
}

module.exports = {
  createMediaTransferBudget,
  transfers,
  admitMediaTransfer,
  admitVoicePreview,
  admitLargeStructuredBody,
};
