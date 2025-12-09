const dns = require('dns').promises;
const { URL } = require('url');
const net = require('net');

function isPrivateIp(ip) {
  if (!ip) return false;
  // Use net.isIP to determine family
  const family = net.isIP(ip);
  if (family === 4) {
    if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1] || '0', 10);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }
  if (family === 6) {
    // IPv6 loopback / unique local / link-local
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    return false;
  }
  return false;
}

async function resolveHostname(hostname) {
  try {
    // dns.lookup respects hosts file and performs system lookup; return all addresses
    const res = await dns.lookup(hostname, { all: true });
    return res.map(r => r.address);
  } catch (e) {
    return [];
  }
}

/**
 * Validate that a URL is safe to fetch from server-side code.
 * - disallows non-http(s) schemes
 * - enforces HTTPS by default (opts.requireHttps)
 * - disallows embedded credentials in the URL
 * - rejects hosts that resolve to private IPs
 * - supports an explicit allowlist via opts.allowHosts
 */
async function validateUrl(urlString, opts = {}) {
  // opts: { allowHosts: ['example.com'], requireHttps: true }
  try {
    const url = new URL(urlString);
    if (url.username || url.password) return { ok: false, reason: 'embedded_credentials' };
    if (opts.requireHttps !== false && url.protocol !== 'https:') return { ok: false, reason: 'insecure_protocol' };
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, reason: 'invalid_protocol' };

    const host = url.hostname;

    // If host is an IP literal, check directly and avoid DNS lookup
    const ipFamily = net.isIP(host);
    if (ipFamily) {
      if (isPrivateIp(host)) return { ok: false, reason: 'private_ip' };
      return { ok: true, url };
    }

    // Security posture: require an explicit allowlist by default.
    // Callers must pass `opts.allowHosts` or set `SSRF_ALLOW_UNRESTRICTED=1`
    // in the environment to permit outbound requests to arbitrary hosts.
    const allowUnrestricted = process.env.SSRF_ALLOW_UNRESTRICTED === '1' || process.env.SSRF_ALLOW_UNRESTRICTED === 'true';
    if (!(opts.allowHosts && Array.isArray(opts.allowHosts) && opts.allowHosts.length) && !allowUnrestricted) {
      return { ok: false, reason: 'host_not_whitelisted' };
    }

    if (opts.allowHosts && Array.isArray(opts.allowHosts) && opts.allowHosts.length) {
      const matched = opts.allowHosts.some(h => h === host || host.endsWith('.' + h));
      if (!matched) return { ok: false, reason: 'host_not_whitelisted' };
    }

    const addrs = await resolveHostname(host);
    if (!addrs.length) return { ok: false, reason: 'unresolvable_host' };
    for (const a of addrs) {
      if (isPrivateIp(a)) return { ok: false, reason: 'private_ip' };
    }
    return { ok: true, url };
  } catch (e) {
    return { ok: false, reason: 'invalid_url' };
  }
}

/**
 * Perform a safe fetch that does not automatically follow redirects to unvalidated locations.
 * - fetchFn should be a compliant fetch implementation
 * - fetchOptions.redirect is set to 'manual' by default to avoid auto-following redirects
 * - if the response is a redirect and contains a Location header, the location is validated
 */
async function safeFetch(urlString, fetchFn, opts = {}) {
  // fetchFn is typically node-fetch 'fetch'
  // opts.allowHosts optional
  const v = await validateUrl(urlString, opts);
  if (!v.ok) throw new Error('ssrf_blocked:' + v.reason);

  const fetchOptions = Object.assign({}, opts.fetchOptions || {});
  if (!('redirect' in fetchOptions)) fetchOptions.redirect = 'manual';

  const res = await fetchFn(urlString, fetchOptions);

  // If there's a redirect Location header, validate it before returning
  if (res && res.status >= 300 && res.status < 400) {
    const location = res.headers && (res.headers.get ? res.headers.get('location') : res.headers && res.headers.location);
    if (location) {
      const vv = await validateUrl(location, opts);
      if (!vv.ok) throw new Error('ssrf_blocked:redirect_' + vv.reason);
    }
  }

  return res;
}

module.exports = { validateUrl, safeFetch };
