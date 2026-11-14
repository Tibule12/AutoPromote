const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function isWebCodecsSupported() {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.VideoDecoder === "function" &&
    typeof globalThis.EncodedVideoChunk === "function"
  );
}

/**
 * Picks the fastest stream for the current transport mode:
 * - During active scrubbing or shuttle playback, prefer an intra-frame / low-GOP proxy when present.
 * - When paused for precision inspection or export, prefer the full-resolution source URL.
 */
export function selectOptimalSourceUrl(clip, { scrubbing = false, preferProxy = true } = {}) {
  if (!clip || typeof clip !== "object") return "";
  const fullUrl = clip.url || clip.src || clip.previewUrl || "";
  const proxyUrl = clip.proxyUrl || clip.editProxyUrl || clip.intraProxyUrl || "";
  if ((scrubbing || preferProxy) && proxyUrl) {
    return scrubbing ? proxyUrl : fullUrl || proxyUrl;
  }
  return fullUrl || proxyUrl;
}

/**
 * Computes a directional frame prefetch window so J/K/L shuttle and scrub drags
 * decode ahead in the travel direction rather than wasting decoder cycles behind the playhead.
 */
export function computePrefetchWindow({
  currentFrame = 0,
  direction = 1,
  speed = 1,
  totalFrames = 0,
  radius = 12,
} = {}) {
  const safeTotal = Math.max(0, Math.floor(Number(totalFrames) || 0));
  if (!safeTotal) return [];
  const center = clamp(Math.round(Number(currentFrame) || 0), 0, safeTotal - 1);
  const dir = direction < 0 ? -1 : 1;
  const stride = Math.max(1, Math.min(8, Math.round(Math.abs(Number(speed) || 1))));
  const aheadCount = Math.max(2, Math.round(radius * (dir === 0 ? 0.5 : 1)));
  const behindCount = Math.max(1, Math.floor(radius * 0.25));
  const indices = [center];
  const seen = new Set(indices);
  for (let i = 1; i <= aheadCount; i += 1) {
    const idx = center + dir * i * stride;
    if (idx >= 0 && idx < safeTotal && !seen.has(idx)) {
      seen.add(idx);
      indices.push(idx);
    }
  }
  for (let i = 1; i <= behindCount; i += 1) {
    const idx = center - dir * i * stride;
    if (idx >= 0 && idx < safeTotal && !seen.has(idx)) {
      seen.add(idx);
      indices.push(idx);
    }
  }
  return indices;
}

function releaseFramePayload(payload) {
  if (payload && typeof payload.close === "function") {
    try {
      payload.close();
    } catch (_err) {
      // Ignore already-closed VideoFrame/ImageBitmap handles
    }
  }
}

/**
 * Bounded LRU ring buffer for decoded VideoFrame / ImageBitmap / HTMLCanvasElement textures.
 * Guarantees deterministic `.close()` cleanup on eviction to avoid WebCodecs GPU stalls.
 */
export function createStudioFrameRingBuffer({
  maxFrames = 90,
  maxBytes = 256 * 1024 * 1024,
} = {}) {
  const limitFrames = Math.max(4, Math.floor(Number(maxFrames) || 90));
  const limitBytes = Math.max(4 * 1024 * 1024, Math.floor(Number(maxBytes) || 256 * 1024 * 1024));
  const entries = new Map();
  let totalBytes = 0;

  const estimateBytes = (frame, width = 0, height = 0) => {
    const w = Number(width || frame?.displayWidth || frame?.codedWidth || frame?.width || 640);
    const h = Number(height || frame?.displayHeight || frame?.codedHeight || frame?.height || 360);
    return Math.max(1024, w * h * 4);
  };

  const evictOldest = () => {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) return false;
    const entry = entries.get(oldestKey);
    entries.delete(oldestKey);
    totalBytes = Math.max(0, totalBytes - (entry?.byteLength || 0));
    releaseFramePayload(entry?.frame);
    return true;
  };

  const makeKey = (assetId, frameIndex, quality = "proxy") =>
    `${String(assetId || "source")}:${Math.max(0, Math.floor(Number(frameIndex) || 0))}:${quality}`;

  const set = ({ assetId, frameIndex, quality = "proxy", frame, width, height }) => {
    if (!frame) return null;
    const key = makeKey(assetId, frameIndex, quality);
    if (entries.has(key)) {
      const existing = entries.get(key);
      entries.delete(key);
      totalBytes = Math.max(0, totalBytes - existing.byteLength);
      if (existing.frame !== frame) releaseFramePayload(existing.frame);
    }
    const byteLength = estimateBytes(frame, width, height);
    entries.set(key, {
      key,
      assetId: String(assetId || "source"),
      frameIndex: Math.max(0, Math.floor(Number(frameIndex) || 0)),
      quality,
      frame,
      byteLength,
      storedAt: Date.now(),
    });
    totalBytes += byteLength;
    while (entries.size > limitFrames || totalBytes > limitBytes) {
      if (!evictOldest()) break;
    }
    return key;
  };

  const get = (assetId, frameIndex, quality = "proxy") => {
    const key = makeKey(assetId, frameIndex, quality);
    const entry = entries.get(key);
    if (!entry) return null;
    // Refresh LRU recency
    entries.delete(key);
    entries.set(key, entry);
    return entry.frame;
  };

  const getNearest = (assetId, targetFrameIndex, { maxDistance = 12, quality = "proxy" } = {}) => {
    const exact = get(assetId, targetFrameIndex, quality);
    if (exact) return { frame: exact, frameIndex: targetFrameIndex, exact: true };
    const id = String(assetId || "source");
    let best = null;
    let bestDist = Infinity;
    for (const entry of entries.values()) {
      if (entry.assetId !== id) continue;
      const dist = Math.abs(entry.frameIndex - targetFrameIndex);
      if (dist <= maxDistance && dist < bestDist) {
        best = entry;
        bestDist = dist;
      }
    }
    return best ? { frame: best.frame, frameIndex: best.frameIndex, exact: false } : null;
  };

  const invalidateAsset = assetId => {
    const id = String(assetId || "");
    for (const [key, entry] of [...entries.entries()]) {
      if (entry.assetId === id) {
        entries.delete(key);
        totalBytes = Math.max(0, totalBytes - entry.byteLength);
        releaseFramePayload(entry.frame);
      }
    }
  };

  const clear = () => {
    for (const entry of entries.values()) {
      releaseFramePayload(entry.frame);
    }
    entries.clear();
    totalBytes = 0;
  };

  const stats = () => ({
    frames: entries.size,
    bytes: totalBytes,
    maxFrames: limitFrames,
    maxBytes: limitBytes,
  });

  return {
    set,
    get,
    getNearest,
    invalidateAsset,
    clear,
    stats,
  };
}

/**
 * Coordinates WebCodecs VideoDecoder (when encoded GOP chunks are supplied)
 * alongside HTMLVideoElement / ImageBitmap capture for zero-jank scrubbing.
 */
export function createStudioWebCodecsController({
  maxFrames = 90,
  maxBytes = 256 * 1024 * 1024,
  onFrameReady = null,
  onError = null,
} = {}) {
  const cache = createStudioFrameRingBuffer({ maxFrames, maxBytes });
  let decoder = null;
  let activeConfigKey = "";
  let activeAssetId = "source";
  let activeFps = 30;
  let activeQuality = "proxy";
  let destroyed = false;

  const ensureDecoder = (config, assetId, fps = 30, quality = "proxy") => {
    if (destroyed || !isWebCodecsSupported() || !config?.codec) return false;
    const key = `${assetId}:${config.codec}:${config.codedWidth || 0}x${config.codedHeight || 0}`;
    if (decoder && decoder.state === "configured" && activeConfigKey === key) {
      return true;
    }
    if (decoder) {
      try {
        decoder.close();
      } catch (_err) {
        // Ignore
      }
    }
    activeConfigKey = key;
    activeAssetId = String(assetId || "source");
    activeFps = Math.max(1, Number(fps) || 30);
    activeQuality = quality;
    decoder = new globalThis.VideoDecoder({
      output: videoFrame => {
        if (destroyed) {
          releaseFramePayload(videoFrame);
          return;
        }
        const timestampSec = Number(videoFrame.timestamp || 0) / 1_000_000;
        const frameIndex = Math.max(0, Math.round(timestampSec * activeFps));
        cache.set({
          assetId: activeAssetId,
          frameIndex,
          quality: activeQuality,
          frame: videoFrame,
          width: videoFrame.displayWidth || videoFrame.codedWidth,
          height: videoFrame.displayHeight || videoFrame.codedHeight,
        });
        onFrameReady?.({ assetId: activeAssetId, frameIndex, frame: videoFrame });
      },
      error: err => {
        onError?.(err);
      },
    });
    decoder.configure(config);
    return true;
  };

  const decodeChunks = ({ config, assetId, fps = 30, quality = "proxy", chunks = [] }) => {
    if (!ensureDecoder(config, assetId, fps, quality)) return false;
    for (const chunk of chunks) {
      if (destroyed || decoder.state !== "configured") break;
      const encoded =
        chunk instanceof globalThis.EncodedVideoChunk
          ? chunk
          : new globalThis.EncodedVideoChunk({
              type: chunk.type === "key" ? "key" : "delta",
              timestamp: Math.round(Number(chunk.timestampUs ?? (chunk.timeSeconds || 0) * 1_000_000)),
              duration: chunk.durationUs ? Math.round(chunk.durationUs) : undefined,
              data: chunk.data,
            });
      decoder.decode(encoded);
    }
    return true;
  };

  const captureVideoElementFrame = async ({ video, assetId, frameIndex, quality = "proxy" }) => {
    if (destroyed || !video || video.readyState < 2) return null;
    const existing = cache.get(assetId, frameIndex, quality);
    if (existing) return existing;
    if (typeof globalThis.createImageBitmap === "function") {
      try {
        const bitmap = await globalThis.createImageBitmap(video);
        if (destroyed) {
          releaseFramePayload(bitmap);
          return null;
        }
        cache.set({
          assetId,
          frameIndex,
          quality,
          frame: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        });
        onFrameReady?.({ assetId, frameIndex, frame: bitmap });
        return bitmap;
      } catch (_err) {
        return null;
      }
    }
    return null;
  };

  const flush = async () => {
    if (decoder && decoder.state === "configured") {
      await decoder.flush();
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (decoder) {
      try {
        decoder.close();
      } catch (_err) {
        // Ignore
      }
      decoder = null;
    }
    cache.clear();
  };

  return {
    cache,
    isSupported: isWebCodecsSupported,
    ensureDecoder,
    decodeChunks,
    captureVideoElementFrame,
    flush,
    destroy,
  };
}
