const DEFAULT_RETURN_URL = "https://autopromote.org/#/";

function verificationReturnUrl(env = process.env) {
  try {
    const base = String(env.FRONTEND_URL || "https://autopromote.org").replace(/\/$/, "");
    const url = new URL(env.VERIFY_REDIRECT_URL || `${base}/#/`);
    if (url.username || url.password) return DEFAULT_RETURN_URL;
    if (["autopromote.org", "www.autopromote.org"].includes(url.hostname)) {
      url.hostname = "autopromote.org";
      url.protocol = "https:";
      url.port = "";
    }
    const local =
      env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return DEFAULT_RETURN_URL;
    }
    return url.href;
  } catch (_) {
    return DEFAULT_RETURN_URL;
  }
}

async function generateVerificationLink(auth, email) {
  try {
    return await auth.generateEmailVerificationLink(email, { url: verificationReturnUrl() });
  } catch (error) {
    if (error.code !== "auth/unauthorized-continue-uri") throw error;
    // The optional return URL must not prevent verification. Firebase still owns
    // the signed, single-use action and its hosted verification handler.
    console.warn("[auth] Verification return domain rejected; using Firebase's hosted handler");
    return auth.generateEmailVerificationLink(email);
  }
}

function requireVerifiedEmail(claims, res) {
  if (claims.email_verified === true) return true;
  res.status(403).json({
    error: "email_not_verified",
    message: "Please verify your email before signing in.",
    requiresEmailVerification: true,
  });
  return false;
}

module.exports = { verificationReturnUrl, generateVerificationLink, requireVerifiedEmail };
