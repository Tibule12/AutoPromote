const SAFE_DATA_URL_PATTERN = /^data:(image|video|audio)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);
const UNSAFE_URL_TEXT_PATTERN = /[<>"'`\\]/;

function stripUnsafeCharacters(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f\s]+/g, "");
}

function sanitizeRelativeUrl(url) {
  const cleaned = String(url ?? "").trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("//")) return "";
  if (UNSAFE_URL_TEXT_PATTERN.test(cleaned)) return "";

  try {
    const baseOrigin = globalThis.location?.origin || "http://localhost";
    const parsed = new URL(cleaned, baseOrigin);
    return parsed.origin === baseOrigin ? parsed.href : "";
  } catch {
    return "";
  }
}

export function sanitizeMediaUrl(url) {
  const rawUrl = String(url ?? "").trim();
  if (!rawUrl) return "";

  if (rawUrl.startsWith("/") || rawUrl.startsWith("./") || rawUrl.startsWith("../")) {
    return sanitizeRelativeUrl(rawUrl);
  }

  if (rawUrl.startsWith("blob:")) {
    return rawUrl;
  }

  if (rawUrl.startsWith("data:")) {
    return SAFE_DATA_URL_PATTERN.test(rawUrl) ? rawUrl : "";
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return rawUrl.includes(":") ? "" : sanitizeRelativeUrl(rawUrl);
  }
}

export function getSafeMediaSource(url) {
  return sanitizeMediaUrl(url) || undefined;
}

export function applySafeMediaSource(element, url) {
  if (!element) return false;

  const safeUrl = sanitizeMediaUrl(url);
  if (!safeUrl) {
    element.removeAttribute("src");
    return false;
  }

  if (element.getAttribute("src") !== safeUrl) {
    element.setAttribute("src", safeUrl);
  }

  return true;
}

// Helper to sanitize URLs for use in src/href.
export function sanitizeUrl(url) {
  return sanitizeMediaUrl(url);
}

export function createSecureId(prefix = "id") {
  const safePrefix =
    String(prefix || "id")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "id";

  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${safePrefix}-${globalThis.crypto.randomUUID()}`;
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buffer = new Uint32Array(4);
    globalThis.crypto.getRandomValues(buffer);
    const suffix = Array.from(buffer, value => value.toString(16).padStart(8, "0")).join("");
    return `${safePrefix}-${suffix}`;
  }

  return `${safePrefix}-${Date.now().toString(36)}`;
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

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/g, "");
}

function isTrustedHostname(hostname, trustedHosts) {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) return false;
  return trustedHosts.some(trustedHost => {
    const normalizedTrusted = normalizeHostname(trustedHost);
    return normalizedHost === normalizedTrusted || normalizedHost.endsWith(`.${normalizedTrusted}`);
  });
}

export function isSafeRedirectUrl(url) {
  if (!url) return false;
  // Allow relative paths (same-origin navigation)
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return isTrustedHostname(parsed.hostname, TRUSTED_REDIRECT_HOSTS);
  } catch {
    return false;
  }
}
