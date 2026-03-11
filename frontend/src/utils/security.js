// Helper to sanitize URLs for use in src/href
// Prevents javascript: protocol and ensures only approved protocols
export function sanitizeUrl(url) {
  if (!url) return "";

  // If it's a relative path, allow it (but carefully)
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
    return url;
  }

  // If it's a blob url (created by URL.createObjectURL), allow it
  if (url.startsWith("blob:")) {
    return url;
  }

  // If it's a data url, allow safe image/video mime types
  if (url.startsWith("data:")) {
    // Basic check for safe mimetypes
    if (url.match(/^data:(image|video|audio)\/[\w\-\+]+;base64,/)) {
      return url;
    }
  }

  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return url;
    }
  } catch (e) {
    // If it fails parsing and doesn't look like a protocol, maybe relative?
    // But we handled relative above.
    // If it contains a colon, it might be a weird protocol.
    if (!url.includes(":")) return url;
  }

  return "";
}

// Validate redirect URLs to prevent open redirect attacks.
// Only allows HTTPS URLs on trusted domains, or same-origin relative paths.
const TRUSTED_REDIRECT_HOSTS = [
  "autopromote.org",
  "www.autopromote.org",
  "tibule12.github.io",
  "paypal.com",
  "www.paypal.com",
  "www.sandbox.paypal.com",
];

export function isSafeRedirectUrl(url) {
  if (!url) return false;
  // Allow relative paths (same-origin navigation)
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return TRUSTED_REDIRECT_HOSTS.some(trusted => host === trusted || host.endsWith("." + trusted));
  } catch {
    return false;
  }
}
