const crypto = require("crypto");
const { stableStringify } = require("./studioProjectIntelligenceContract");
// The same owner/request identity used by Studio analysis. Never include signed
// URLs or timestamps in an idempotency fingerprint.
const ownerRequestJobId = (uid, requestId) => crypto.createHash("sha256").update(`${uid}\0${requestId}`).digest("hex");
const requestFingerprint = request => crypto.createHash("sha256").update(stableStringify(request)).digest("hex");
module.exports = { ownerRequestJobId, requestFingerprint };
