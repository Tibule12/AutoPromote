const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');

// Leave at least 256 KiB of Firestore's 1 MiB document allowance for the
// bounded job metadata. The expanded request still cannot exceed 4 MiB.
const INLINE_BYTES = 256 * 1024, MAX_BYTES = 4 * 1024 * 1024, MAX_ARCHIVE_BYTES = 768 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Job status needs the render classification and watermark choice, not a
// duplicate expanded graph. Preserve the complete JSON exactly for recovery;
// the running renderer always receives the original in-memory options.
function encodeStudioJobOptions(options) {
  const bytes = Buffer.from(JSON.stringify(options));
  if (bytes.length <= INLINE_BYTES || options?.renderViral !== true) return { options };
  if (bytes.length > MAX_BYTES) throw Error('Studio job options exceed the 4 MiB archive limit.');
  const data = gzipSync(bytes);
  if (data.length > MAX_ARCHIVE_BYTES) throw Error('Studio job options exceed the 768 KiB compressed archive limit.');
  return {
    options: { renderViral: true, viralData: {
      ...(options.viralData?.brand_watermark === undefined ? {} : { brand_watermark: options.viralData.brand_watermark }),
    } },
    optionsArchive: { encoding: 'gzip-json-v1', sha256: hash(bytes), bytes: bytes.length, data },
  };
}

function decodeStudioJobOptions(record) {
  const archive = record?.optionsArchive;
  if (!archive) return record?.options;
  if (archive.encoding !== 'gzip-json-v1' || !Number.isSafeInteger(archive.bytes) ||
      archive.bytes < 1 || archive.bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(archive.sha256 || '') ||
      !(Buffer.isBuffer(archive.data) || archive.data instanceof Uint8Array) ||
      archive.data.length > MAX_ARCHIVE_BYTES) throw Error('Invalid Studio options archive.');
  const bytes = gunzipSync(archive.data, { maxOutputLength: MAX_BYTES });
  if (bytes.length !== archive.bytes || hash(bytes) !== archive.sha256)
    throw Error('Studio options archive identity mismatch.');
  const options = JSON.parse(bytes.toString('utf8'));
  if (options.renderViral !== true) throw Error('Invalid Studio archive classification.');
  return options;
}

module.exports = { encodeStudioJobOptions, decodeStudioJobOptions };
