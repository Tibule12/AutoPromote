const nock = require('nock');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const svc = require('../videoClippingService');
const dns = require('dns').promises;

describe('VideoClippingService SSRF protections', () => {
  afterEach(async () => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  test('rejects non-HTTPS URLs', async () => {
    await expect(svc.downloadVideo('http://storage.googleapis.com/mybucket/video.mp4', path.join(os.tmpdir(), 'tmp.mp4')))
      .rejects.toThrow('Only HTTPS URLs are allowed');
  });

  test('rejects host that resolves to private IP', async () => {
    // Mock DNS lookup to return private IP
    jest.spyOn(dns, 'lookup').mockImplementation(async () => [{ address: '127.0.0.1', family: 4 }]);
    const dest = path.join(os.tmpdir(), 'tmp_download_private.mp4');
    await expect(svc.downloadVideo('https://storage.googleapis.com/mybucket/video.mp4', dest))
      .rejects.toThrow('Private IP addresses are not allowed');
  });

  test('throws on redirect to private IPs (prevent redirect-based SSRF)', async () => {
    // Allow DNS lookup for allowed domain
    jest.spyOn(dns, 'lookup').mockImplementation(async (host, opts) => [{ address: '8.8.8.8', family: 4 }]);
    // Mock storage.googleapis redirecting to a private IP
    nock('https://storage.googleapis.com').get('/mybucket/redirect').reply(302, 'redirect', { Location: 'http://127.0.0.1/private.mp4' });
    const dest = path.join(os.tmpdir(), 'tmp_download_redirect.mp4');
    await expect(svc.downloadVideo('https://storage.googleapis.com/mybucket/redirect', dest))
      .rejects.toThrow();
  });

  test('allows downloading from trusted CDN domain and writes file', async () => {
    jest.spyOn(dns, 'lookup').mockImplementation(async (host, opts) => [{ address: '8.8.8.8', family: 4 }]);
    const scope = nock('https://storage.googleapis.com').get('/mybucket/video.mp4').reply(200, 'mp4data');
    const destDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vc-test-'));
    const dest = path.join(destDir, 'video.mp4');
    await svc.downloadVideo('https://storage.googleapis.com/mybucket/video.mp4', dest);
    const stat = await fs.stat(dest);
    expect(stat.size).toBeGreaterThan(0);
    await fs.rm(destDir, { recursive: true, force: true });
    scope.done();
  });
});
