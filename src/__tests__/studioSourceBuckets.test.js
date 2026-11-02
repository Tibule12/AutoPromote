const mockObjects = new Map();
const mockReads = [];
const mockSigns = jest.fn();
jest.mock('firebase-admin', () => ({ storage: () => ({ bucket: (name = 'main') => ({
  name,
  file: path => ({
    bucket: { name },
    getMetadata: async () => {
      mockReads.push(`${name}/${path}`);
      const object = mockObjects.get(`${name}/${path}`);
      if (!object) throw Object.assign(new Error('not found'), { code: 404 });
      if (object.error) throw Object.assign(new Error('transport'), { code: object.error });
      return [object];
    },
    getSignedUrl: async () => { mockSigns(name); return [`https://signed.example/${name}/source.mp4`]; },
  }),
}) }) }));
const { resolveOwnedStudioVideoSource, getStudioSourceBucket } = require('../services/studioSourceService');
const path = 'studio/sources/owner/choir.mp4';
const metadata = (ownerUid = 'owner') => ({size: '18980401', contentType: 'video/mp4', generation: '12',
  metadata: {ownerUid, purpose: 'studio_source'}});
const previous = { ingest: process.env.MULTICAM_INGEST_BUCKET, main: process.env.FIREBASE_STORAGE_BUCKET };
beforeEach(() => { mockObjects.clear();mockReads.length = 0;mockSigns.mockClear();
  process.env.MULTICAM_INGEST_BUCKET = 'ingest';process.env.FIREBASE_STORAGE_BUCKET = 'main'; });
afterAll(() => {
  for (const [key, value] of [['MULTICAM_INGEST_BUCKET',previous.ingest],['FIREBASE_STORAGE_BUCKET',previous.main]])
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
});
const resolve = options => resolveOwnedStudioVideoSource({ storagePath: path, userId: 'owner', ...options });
test('new Studio sources stay in their configured ingest bucket', async () => {
  mockObjects.set(`ingest/${path}`,metadata());
  const result = await resolve();expect(result.bucketName).toBe('ingest');
  expect(result.signedUrl).toContain('/ingest/');expect(mockReads).toEqual([`ingest/${path}`]);
});
test('existing Studio sources recover from the main bucket after ingest migration', async () => {
  mockObjects.set(`main/${path}`,metadata());
  const result = await resolve();expect(result.bucketName).toBe('main');expect(result.signedUrl).toContain('/main/');
  expect(mockReads).toEqual([`ingest/${path}`,`main/${path}`]);
  expect(getStudioSourceBucket(result.kind,result.bucketName).name).toBe('main');
});
test('CPU source readers retain the actual authorized bucket and generation', async () => {
  mockObjects.set(`main/${path}`,metadata());const result = await resolve({signRead:false});
  expect(result.bucketName).toBe('main');expect(result.generation).toBe('12');expect(result.signedUrl).toBeUndefined();
  expect(mockSigns).not.toHaveBeenCalled();expect(getStudioSourceBucket(result.kind,result.bucketName).name).toBe('main');
});
test('a missing source remains missing after both configured locations', async () => {
  await expect(resolve()).rejects.toMatchObject({statusCode:404,code:'STUDIO_SOURCE_MISSING'});
  expect(mockSigns).not.toHaveBeenCalled();
});
test('a transient preferred-bucket failure is not hidden by a fallback', async () => {
  mockObjects.set(`ingest/${path}`,{error:503});mockObjects.set(`main/${path}`,metadata());
  await expect(resolve()).rejects.toMatchObject({statusCode:503});expect(mockReads).toEqual([`ingest/${path}`]);
});
test.each(['ingest','main'])('owner verification still rejects another owner in %s', async bucket => {
  mockObjects.set(`${bucket}/${path}`,metadata('attacker'));
  await expect(resolve()).rejects.toMatchObject({statusCode:403});expect(mockSigns).not.toHaveBeenCalled();
});
test('a matching main-bucket object cannot bypass a conflicting preferred owner', async () => {
  mockObjects.set(`ingest/${path}`,metadata('attacker'));mockObjects.set(`main/${path}`,metadata());
  await expect(resolve()).rejects.toMatchObject({statusCode:403});expect(mockReads).toEqual([`ingest/${path}`]);
});
test('source paths and bucket selection remain constrained', async () => {
  await expect(resolve({storagePath:'studio/sources/attacker/choir.mp4'})).rejects.toMatchObject({statusCode:403});
  expect(mockReads).toEqual([]);expect(()=>getStudioSourceBucket('durable_studio','unconfigured')).toThrow();
});
