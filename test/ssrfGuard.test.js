const dns = require('dns');
jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }));

const { validateUrl, safeFetch } = require('../src/utils/ssrfGuard');

describe('ssrfGuard', () => {
  beforeEach(() => {
    dns.promises.lookup.mockReset();
  });

  test('rejects embedded credentials', async () => {
    const r = await validateUrl('https://user:pass@example.com/path');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('embedded_credentials');
  });

  test('rejects non-https by default', async () => {
    const r = await validateUrl('http://example.com/');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insecure_protocol');
  });

  test('rejects private IP returned by DNS', async () => {
    dns.promises.lookup.mockResolvedValue([{ address: '192.168.1.5' }]);
    const r = await validateUrl('https://example.com/');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('private_ip');
  });

  test('accepts public IP literal host', async () => {
    // IP literal avoids DNS lookup path
    const r = await validateUrl('https://8.8.8.8/', { requireHttps: false });
    expect(r.ok).toBe(true);
  });

  test('safeFetch rejects redirect to private IP', async () => {
    // example.com resolves publicly
    dns.promises.lookup.mockResolvedValue([{ address: '1.2.3.4' }]);
    const fetchFn = jest.fn().mockResolvedValue({
      status: 302,
      headers: {
        get: (h) => (h.toLowerCase() === 'location' ? 'http://192.168.1.5/' : undefined)
      }
    });
    await expect(safeFetch('https://example.com/', fetchFn)).rejects.toThrow(/ssrf_blocked:redirect_private_ip/);
  });
});
