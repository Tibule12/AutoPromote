const { configuration, boundedLaunch } = require('../src/services/studio3DNvidia');

const config = () => ({
  STUDIO_3D_SSH_HOST: 'autopromote-l40s-staging',
  STUDIO_3D_SSH_ROOT: '/data/studio-3d-jobs',
  STUDIO_3D_SSH_IMAGE: 'autopromote-studio-3d:20261006-final',
  STUDIO_3D_SSH_LOCK: '/data/factory/gpu.lock',
  STUDIO_3D_SSH_DEADLINE_EPOCH: String(Math.floor(Date.now() / 1000) + 600),
});

test('Cloud Run remains the default when SSH is not configured', () => {
  expect(configuration({})).toBeNull();
});

test('accepts an explicitly bounded retained NVIDIA transport', () => {
  expect(configuration(config())).toMatchObject({ host: 'autopromote-l40s-staging', root: '/data/studio-3d-jobs' });
});

test('completed artifacts remain readable after the window, while new renders are rejected', () => {
  const expired = { ...config(), STUDIO_3D_SSH_DEADLINE_EPOCH: '1' };
  expect(() => configuration(expired)).toThrow();
  expect(configuration(expired, { requireWindow: false })).toMatchObject({ host: 'autopromote-l40s-staging' });
});

test.each([
  ['STUDIO_3D_SSH_HOST', '-oProxyCommand=bad'],
  ['STUDIO_3D_SSH_HOST', 'host;command'],
  ['STUDIO_3D_SSH_ROOT', '/data/../etc'],
  ['STUDIO_3D_SSH_ROOT', '/tmp/jobs'],
  ['STUDIO_3D_SSH_IMAGE', 'image;command'],
  ['STUDIO_3D_SSH_LOCK', '/data/x/../gpu.lock'],
  ['STUDIO_3D_SSH_DEADLINE_EPOCH', '0'],
])('rejects unbounded or executable %s', (key, value) => {
  expect(() => configuration({ ...config(), [key]: value })).toThrow();
});

test('accepted jobs survive a post-preflight capacity race without extending the authorized cutoff', () => {
  const now = 1791488400 * 1000;
  const settings = configuration({ ...config(), STUDIO_3D_SSH_DEADLINE_EPOCH: '1791489600' }, { requireWindow: false });
  const launch = boundedLaunch(settings, 'autopromote-studio-3d-job', '/data/studio-3d-jobs/job', '', now);
  expect(launch.command).toContain('timeout --signal=TERM --kill-after=15s 1185s flock -w 900 -E 75');
  expect(launch.command).toContain('1791489600-$(date +%s)-15');
  expect(launch.command).toContain('[ "$studio_remaining" -ge 60 ] || exit 76');
  expect(launch.command).toContain('studio_remaining=900');
  require('child_process').execFileSync('bash', ['-n', '-c', launch.command]);
  expect(() => boundedLaunch(settings, 'job', '/data/job', '', 1791489540 * 1000)).toThrow('window expired');
});
