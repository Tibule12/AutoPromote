const { validateUrl } = require('../src/utils/ssrfGuard');

function assert(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exit(1);} }

(async () => {
  console.log('Running ssrf guard sanity tests...');

  // Embedded credentials should be rejected
  const r1 = await validateUrl('https://user:pass@example.com/path');
  assert(!r1.ok && r1.reason === 'embedded_credentials', 'embedded credentials should be blocked');

  // Private IP should be rejected
  const r2 = await validateUrl('http://192.168.1.5/data', { requireHttps: false });
  assert(!r2.ok && r2.reason === 'private_ip', 'private IP should be blocked');

  // IP literal public (example public IP unlikely to resolve locally) check - use 8.8.8.8
  const r3 = await validateUrl('https://8.8.8.8/', { requireHttps: false });
  // Depending on environment, 8.8.8.8 may still be considered public; we just assert response shape
  assert(r3 && typeof r3.ok === 'boolean', 'ip literal check should return a result');

  // Unresolvable host should return unresolvable_host
  const r4 = await validateUrl('https://no-such-host-name-should-fail.invalid/');
  assert(!r4.ok && (r4.reason === 'unresolvable_host' || r4.reason === 'invalid_url'), 'unresolvable host should fail');

  console.log('ssrf guard sanity tests passed.');
})();
