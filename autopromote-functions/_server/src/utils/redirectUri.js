// Utility to canonicalize OAuth redirect URIs to the production domain and required callback path
// - Forces https://<canonical host> as the host
// - Enforces a required callback path per provider (e.g., /api/youtube/callback)
// - If the provided URI is missing/invalid, constructs the canonical default
// Host precedence order:
//   1. CANONICAL_OAUTH_HOST (specific for OAuth redirects)
//   2. CANONICAL_HOST (general site host)
//   3. api.autopromote.org (default fallback for API/OAuth endpoints)

const CANONICAL_HOST =
  process.env.CANONICAL_OAUTH_HOST || process.env.CANONICAL_HOST || "api.autopromote.org";

function canonicalizeRedirect(input, opts = {}) {
  const requiredPath = (opts && opts.requiredPath) || "/";
  try {
    if (!input || typeof input !== "string") {
      return `https://${CANONICAL_HOST}${requiredPath}`;
    }
    const u = new URL(input);
    // Force https + canonical host
    u.protocol = "https:";
    u.hostname = CANONICAL_HOST;
    // Enforce required path
    if (u.pathname !== requiredPath) {
      u.pathname = requiredPath;
      // Clear search to avoid stale params on path change
      u.search = "";
    }
    return u.toString();
  } catch (_) {
    // If parsing failed (invalid URL), return canonical default
    return `https://${CANONICAL_HOST}${requiredPath}`;
  }
}

module.exports = { canonicalizeRedirect, CANONICAL_HOST };
