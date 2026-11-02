import { API_BASE_URL } from '../config';
import { getMediaAuthToken } from '../utils/mediaAuth';
import { studioPausedFrameReceiptMatches } from './studioSourcePreview';

// Raw source pictures only. Native scene geometry/materials still render in
// Studio; this request never supplies a flattened effect or changes an edit.
let pending = Promise.resolve();
export function loadStudioSourceFrame(request, signal) {
  // Programme and scene inspection share the server's one-decoder-per-owner
  // budget. Superseded queued requests are discarded before touching the API.
  const task = pending.then(() => fetchSourceFrame(request, signal));
  pending = task.catch(() => {});
  return task;
}

async function fetchSourceFrame(request, signal) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const token = await getMediaAuthToken();
  if (!token || signal.aborted) throw new Error('Source frame unavailable');
  let response, result;
  // Cancelling HTTP does not instantly finish an already-started owned-source
  // download. Honour that backpressure within the caller's 30s abort deadline.
  const retryUntil = Date.now() + 10000;
  for (;;) {
    response = await fetch(`${API_BASE_URL}/api/media/studio-assets/source-frame`, {
      method: 'POST', signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    result = await response.json();
    if (response.status !== 429 || Date.now() >= retryUntil) break;
    await new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 500);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
  }
  if (signal.aborted || !response.ok || !studioPausedFrameReceiptMatches(request, result) ||
      result.sampler !== (request.sampling || 'studio-sequence-source-frame-v1'))
    throw new Error('Source frame receipt does not match');
  const image = await new Promise((resolve, reject) => {
    const picture = new Image();
    const cancel = () => { picture.src = ''; reject(new DOMException('Cancelled', 'AbortError')); };
    const finish = error => { signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(picture); };
    picture.onload = () => finish();
    picture.onerror = () => finish(new Error('Source frame could not be decoded'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else picture.src = `data:image/png;base64,${result.image}`;
  });
  return { image, receipt: { sampler: result.sampler, frameIndex: result.frameIndex,
    sourceGeneration: result.sourceGeneration,
    sourceContentHash: result.sourceContentHash, imageContentHash: result.imageContentHash } };
}
