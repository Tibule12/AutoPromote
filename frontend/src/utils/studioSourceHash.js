import { sha256 } from '@noble/hashes/sha256';

const CHUNK_BYTES = 1024 * 1024;
const readChunk = blob => typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer()
  : new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read source media.'));
      reader.onabort = () => reject(new Error('Source media read cancelled.'));
      reader.readAsArrayBuffer(blob);
    });

// Hash the actual upload bytes without retaining a second whole-file copy.
export async function hashStudioSourceBlob(file) {
  if (!(file instanceof Blob)) throw new Error('Source hashing requires a File or Blob.');
  const digest = sha256.create();
  try {
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      digest.update(new Uint8Array(await readChunk(file.slice(offset, offset + CHUNK_BYTES))));
    }
    return Array.from(digest.digest(), value => value.toString(16).padStart(2, '0')).join('');
  } finally { digest.destroy(); }
}
