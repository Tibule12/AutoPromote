// Historical claims/admin documents were exposed to escalation. Authority is bound
// to reviewed Firebase identities in the source-controlled policy, not those fields.
const policy = require("../config/trustedAdminPolicy.json");
function isHostedRuntime(env = process.env) {
  return (
    env.NODE_ENV === "production" ||
    Boolean(
      env.K_SERVICE || env.FUNCTION_TARGET || env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_HOSTNAME
    ) ||
    String(env.RENDER || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function hasAdminClaim(claims = {}) {
  // Retain the existing function name at call sites; verified UID is now required.
  return typeof claims.uid === "string" && policy.trustedAdminUids.includes(claims.uid);
}

function authorityFromVerifiedIdentity(claims, _adminExists = false) {
  const isAdmin = hasAdminClaim(claims);
  const role = isAdmin ? "admin" : claims.role === "admin" ? "user" : claims.role || "user";
  return {
    uid: claims.uid,
    id: claims.uid,
    userId: claims.uid,
    email: claims.email,
    role,
    isAdmin,
    admin: isAdmin,
    // Compatibility alias for legacy guards; authoritySource states the real source.
    fromCollection: isAdmin ? "admins" : "users",
    authoritySource: isAdmin ? "trusted_uid_policy" : "verified_identity",
    test: false,
    customClaims: {
      ...claims,
      admin: isAdmin,
      isAdmin,
      role,
    },
    claims: { ...claims, admin: isAdmin, isAdmin, role },
  };
}

module.exports = { isHostedRuntime, hasAdminClaim, authorityFromVerifiedIdentity };
