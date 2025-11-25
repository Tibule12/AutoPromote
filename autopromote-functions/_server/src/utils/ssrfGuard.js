const dns = require('dns').promises;
const { URL } = require('url');

function isPrivateIp(ip) {
  if (!ip) return false;
  // IPv4 quick checks
  if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] || '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 loopback / unique local
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

async function resolveHostname(hostname) {
  try {
    const res = await dns.lookup(hostname, { all: true });
    return res.map(r => r.address);
  } catch (e) {
    return [];
  }
}

async function validateUrl(urlString, opts = {}) {
  // opts: { allowHosts: ['example.com'], requireHttps: true }
  try {
    const url = new URL(urlString);
    if (opts.requireHttps !== false && url.protocol !== 'https:') return { ok: false, reason: 'insecure_protocol' };
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, reason: 'invalid_protocol' };
    const host = url.hostname;
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

async function safeFetch(urlString, fetchFn, opts = {}) {
  // fetchFn is typically node-fetch 'fetch'
  // opts.allowHosts optional
  const v = await validateUrl(urlString, opts);
  if (!v.ok) throw new Error('ssrf_blocked:' + v.reason);
  return fetchFn(urlString, opts.fetchOptions || {});
}

module.exports = { validateUrl, safeFetch };
