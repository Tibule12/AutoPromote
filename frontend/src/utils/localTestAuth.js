// Synthetic browser-test credentials must never leave a local test API.
export function canUseLocalTestAuth(apiBaseUrl, location) {
  const loopback = hostname => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  try {
    if (!location || !loopback(location.hostname.toLowerCase())) return false;
    const api = new URL(apiBaseUrl, location.origin);
    return ["http:", "https:"].includes(api.protocol) && loopback(api.hostname.toLowerCase());
  } catch {
    return false;
  }
}
