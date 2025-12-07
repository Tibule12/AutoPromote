const { validateUrl } = require('../src/utils/ssrfGuard');

describe('ssrfGuard.validateUrl', () => {
  test('blocks local and private IP hostnames', async () => {
    const res1 = await validateUrl('https://localhost/video.mp4', { requireHttps: true, allowHosts: ['firebasestorage.googleapis.com'] });
    expect(res1.ok).toBe(false);

    const res2 = await validateUrl('https://127.0.0.1/video.mp4', { requireHttps: true, allowHosts: ['firebasestorage.googleapis.com'] });
    expect(res2.ok).toBe(false);
  });

  test('requires HTTPS when configured', async () => {
    const res = await validateUrl('http://firebasestorage.googleapis.com/bucket/key.mp4', { requireHttps: true, allowHosts: ['firebasestorage.googleapis.com'] });
    expect(res.ok).toBe(false);
  });

  test('allows known CDN/Storage hosts', async () => {
    const res = await validateUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/key.mp4', { requireHttps: true, allowHosts: ['firebasestorage.googleapis.com'] });
    expect(res.ok).toBe(true);
  });
});
