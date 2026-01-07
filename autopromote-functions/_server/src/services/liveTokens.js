const crypto = require("crypto");
const { db, admin } = require("../firebaseAdmin");

async function issueToken({
  liveId,
  streamerId,
  maxUses = 0,
  ttlSeconds = parseInt(process.env.LIVE_TOKEN_TTL_SECONDS || "900", 10),
}) {
  const token = "lt_" + crypto.randomBytes(12).toString("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.collection("live_tokens").doc(token).set({
    token,
    liveId,
    streamerId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    maxUses,
    uses: 0,
    revoked: false,
  });
  return token;
}

async function verifyToken(token) {
  const ref = db.collection("live_tokens").doc(token);
  const snap = await ref.get();
  if (!snap.exists) return { valid: false, reason: "not_found" };
  const data = snap.data() || {};
  if (data.revoked) return { valid: false, reason: "revoked" };
  if (data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate() < new Date())
    return { valid: false, reason: "expired" };
  if (data.maxUses && data.maxUses > 0 && (data.uses || 0) >= data.maxUses)
    return { valid: false, reason: "max_uses" };
  return { valid: true, tokenDocRef: ref, data };
}

async function redeemToken(token, viewerMeta = {}) {
  const ref = db.collection("live_tokens").doc(token);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("not_found");
  const data = snap.data() || {};
  if (data.revoked) throw new Error("revoked");
  if (data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate() < new Date())
    throw new Error("expired");
  if (data.maxUses && data.maxUses > 0 && (data.uses || 0) >= data.maxUses)
    throw new Error("max_uses");

  const newUses = (data.uses || 0) + 1;
  await ref.set(
    {
      uses: newUses,
      lastRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastRedeemedMeta: viewerMeta,
    },
    { merge: true }
  );
  return { token, data: { ...data, uses: newUses } };
}

async function revokeToken(token) {
  const ref = db.collection("live_tokens").doc(token);
  await ref.set(
    { revoked: true, revokedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return true;
}

module.exports = {
  issueToken,
  verifyToken,
  redeemToken,
  revokeToken,
};
