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

// Only infer source identity from recognized Storage hosts. The authenticated
// resolver still verifies the signed-in owner; a URL never authorizes access.
export function studioSourceStoragePath(source) {
  const explicit = source?.sourceStoragePath || source?.storagePath;
  if (typeof explicit === 'string' && explicit) return explicit;
  try {
    const value = typeof source === 'string' ? source : source?.url || source?.src;
    if (typeof value !== 'string' || !/^https:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\//i.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    let path;
    if (url.hostname === 'storage.googleapis.com') path = url.pathname.split('/').slice(2).join('/');
    else if (url.hostname === 'firebasestorage.googleapis.com') {
      const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
      path = match?.[1];
    }
    if (!path) return null;
    path = decodeURIComponent(path);
    return /^(studio\/sources\/|temp\/multicam-ingest\/|uploads\/(?:videos|images|audios)\/)/.test(path) &&
      !path.includes('..') && !path.includes('\\') ? path : null;
  } catch { return null; }
}

export function studioSourcePlaybackUrl(value, now = Date.now()) {
  return studioSourceStoragePath(value) && studioSourceLeaseRefreshDelay(value, now) === 0
    ? null : value;
}
