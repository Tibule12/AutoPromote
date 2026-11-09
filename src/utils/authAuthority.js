// Accept only verified Firebase claims or the server-managed admins collection.
// A users/{uid} profile is not an authority, including pre-existing forged fields.
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
  return claims.admin === true || claims.isAdmin === true || claims.role === "admin";
}

function authorityFromVerifiedIdentity(claims, adminExists = false) {
  const isAdmin = hasAdminClaim(claims) || adminExists === true;
  return {
    uid: claims.uid,
    id: claims.uid,
    userId: claims.uid,
    email: claims.email,
    role: isAdmin ? "admin" : claims.role || "user",
    isAdmin,
    admin: isAdmin,
    fromCollection: adminExists ? "admins" : isAdmin ? "token_claims" : "users",
    test: false,
    customClaims: {
      ...claims,
      admin: isAdmin,
      isAdmin,
      role: isAdmin ? "admin" : claims.role || "user",
    },
    claims: { ...claims, admin: isAdmin, isAdmin, role: isAdmin ? "admin" : claims.role || "user" },
  };
}

module.exports = { isHostedRuntime, hasAdminClaim, authorityFromVerifiedIdentity };
