const crypto = require('crypto');
const { Readable } = require('stream');
jest.mock('../src/services/studioProjectRevisionService', () => ({ parseStudioProjectHeadRecord: jest.fn() }));
const { parseStudioProjectHeadRecord } = require('../src/services/studioProjectRevisionService');
const { resolveSubjectReplacementAssets, replacementIdentity } = require('../src/services/studioSubjectReplacementAssets');
const bytes = Buffer.from('owned background image fixture');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const scene = { effects: [{ type: 'background_replace', asset_id: 'plate', asset_sha256: sha256 }] };
let file, source, input;
beforeEach(() => {
  jest.clearAllMocks();
  parseStudioProjectHeadRecord.mockReturnValue({ document: { assets: [{ sourceId: 'plate', contentHash: sha256, storagePath: 'uploads/images/owner/plate.png' }] } });
  file = { getMetadata: jest.fn(async () => [{ metadata: { ownerUid: 'owner' }, generation: '123', size: bytes.length }]),
    createReadStream: jest.fn(() => Readable.from([bytes])), getSignedUrl: jest.fn(async () => ['https://storage.googleapis.com/test/plate?generation=123']) };
  source = { kind: 'user_upload', storagePath: 'uploads/images/owner/plate.png', size: bytes.length, generation: '123', contentType: 'image/png' };
  const chain = { collection: () => chain, doc: () => chain, get: async () => ({ exists: true, data: () => ({}) }) };
  input = { ownerUid: 'owner', projectId: 'project', scene, firestore: chain,
    resolveSource: jest.fn(async () => source), bucketFor: jest.fn(() => ({ file: jest.fn((path, opts) => {
      expect(path).toBe(source.storagePath); expect(opts).toEqual({ generation: '123' }); return file;
    }) })) };
});
test('project image bytes and signed read are pinned to their owned immutable generation', async () => {
  const assets = await resolveSubjectReplacementAssets(input);
  expect(assets).toEqual([{ assetId: 'plate', sha256, generation: '123', bytes: bytes.length,
    contentType: 'image/png', url: expect.stringContaining('generation=123') }]);
  expect(replacementIdentity(assets)[0]).not.toHaveProperty('url');
  expect(file.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ queryParams: { generation: '123' } }));
});
test('a browser hash alone cannot authorize different stored background bytes', async () => {
  file.createReadStream.mockImplementation(() => Readable.from([Buffer.alloc(bytes.length)]));
  await expect(resolveSubjectReplacementAssets(input)).rejects.toMatchObject({ statusCode: 409 });
  expect(file.getSignedUrl).not.toHaveBeenCalled();
});
test('cross-owner storage and non-project assets are rejected before a worker sees them', async () => {
  file.getMetadata.mockResolvedValue([{ metadata: { ownerUid: 'other' }, generation: '123', size: bytes.length }]);
  await expect(resolveSubjectReplacementAssets(input)).rejects.toMatchObject({ statusCode: 409 });
  expect(file.createReadStream).not.toHaveBeenCalled();
  parseStudioProjectHeadRecord.mockReturnValue({ document: { assets: [] } });
  await expect(resolveSubjectReplacementAssets(input)).rejects.toMatchObject({ statusCode: 409 });
});
