// Owned source URLs are temporary access leases. Renew them before the
// decoder's next request needs an expired signature; keep edit identity intact.
export function studioSourceLeaseRefreshDelay(value, now = Date.now()) {
  try {
    const url = new URL(value);
    if (!url.searchParams.has("GoogleAccessId") || !url.searchParams.has("Signature")) return null;
    const raw = url.searchParams.get("Expires");
    if (!/^[0-9]{1,13}$/.test(raw || "")) return null;
    const expires = Number(raw) * 1000;
    if (!Number.isSafeInteger(expires) || expires <= 0 || !Number.isFinite(now)) return null;
    return Math.min(2147483647, Math.max(0, expires - now - 60000));
  } catch { return null; }
}
