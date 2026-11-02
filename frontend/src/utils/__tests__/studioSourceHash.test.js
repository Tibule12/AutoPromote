import { createHash } from 'crypto';
import { hashStudioSourceBlob } from '../studioSourceHash';

test('chunked source hashing matches SHA256 across the one-MiB boundary without reading the whole Blob', async () => {
  const bytes = new Uint8Array(1024*1024+17).map((_, i) => i%251);
  const file = new Blob([bytes]);
  file.arrayBuffer = jest.fn(() => { throw new Error('Whole-file allocation'); });
  const slice = jest.spyOn(file, 'slice');
  expect(await hashStudioSourceBlob(file)).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(file.arrayBuffer).not.toHaveBeenCalled();
  expect(slice).toHaveBeenCalledTimes(2);
});

test('known empty-file digest is exact and invalid source types cannot be hashed', async () => {
  expect(await hashStudioSourceBlob(new Blob([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  await expect(hashStudioSourceBlob('url')).rejects.toThrow('File or Blob');
});
