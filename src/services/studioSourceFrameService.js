// An accurate paused source frame uses the same -ss / fps / PTS sampling as
// Studio's deterministic sequence renderer. It is transient preview media,
// never a generated asset or an alternate final rendering engine.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const { getStudioSourceBucket, resolveOwnedStudioVideoSource, sourceError } = require('./studioSourceService');
const execute = promisify(execFile);
const { SEQUENCE_SAMPLER, sequencePictureWindow } = require('../../frontend/src/components/studioSequencePictureClock');
const SAMPLER = 'studio-sequence-source-frame-v1';
const TEXTURE_SAMPLER = 'studio-3d-texture-frame-v1';
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const TTL = 2 * 60 * 1000;
const sources = new Map();
const activeOwners = new Set();

function validateFrameRequest(input) {
  const fields = ['storagePath', 'sourceContentHash', 'sourceGeneration', 'start', 'end', 'fps', 'frameIndex', 'sampling',
    'programmeStart', 'programmeDuration'];
  const sequence = input?.sampling === SEQUENCE_SAMPLER;
  const hasHash = Object.hasOwn(input || {}, 'sourceContentHash');
  const hasGeneration = Object.hasOwn(input || {}, 'sourceGeneration');
  if (!input || Object.keys(input).some(key => !fields.includes(key)) ||
      typeof input.storagePath !== 'string' || !(hasHash || hasGeneration) ||
      (hasHash && !/^[a-f0-9]{64}$/.test(input.sourceContentHash || '')) ||
      (hasGeneration && (typeof input.sourceGeneration !== 'string' || !/^[1-9]\d{0,31}$/.test(input.sourceGeneration))) ||
      ![input.start, input.end, input.fps].every(value => typeof value === 'number' && Number.isFinite(value)) ||
      input.start < 0 || input.start > 21600 || input.end <= input.start || input.end-input.start > 90 ||
      input.fps < 1 || input.fps > 120 || !Number.isSafeInteger(input.frameIndex) || input.frameIndex < 0 ||
      (sequence ? ![input.programmeStart, input.programmeDuration].every(value => typeof value === 'number' && Number.isFinite(value)) ||
        input.programmeStart < 0 || input.programmeDuration <= 0 || input.programmeDuration > 90 || input.end > 90 ||
        input.programmeStart + input.end-input.start > input.programmeDuration + .00002 ||
        ![24,25,30,50,60].includes(input.fps) ||
        input.frameIndex >= sequencePictureWindow(input.programmeStart, input.end-input.start,
          input.programmeDuration, input.start, 30, input.fps).frames
        : Object.hasOwn(input, 'programmeStart') || Object.hasOwn(input, 'programmeDuration') ||
          Object.hasOwn(input, 'sampling') && (input.sampling !== TEXTURE_SAMPLER || input.fps !== 30 || input.end-input.start > 10 ||
            input.frameIndex >= Math.ceil(Number(((input.end-input.start)*input.fps).toFixed(8))))) ||
      input.frameIndex >= Math.ceil((input.end-input.start)*input.fps)) {
    throw sourceError(422, 'STUDIO_FRAME_INVALID', 'Choose a frame inside a saved source clip');
  }
  return input;
}

function sourceFrameArgs(file, { start, end, fps, frameIndex, sampling, programmeStart, programmeDuration }) {
  // Match prepare_video_texture's PTS reset BEFORE CFR conversion. Sequence
  // sampling deliberately retains its existing, different trim semantics.
  const texture = sampling === TEXTURE_SAMPLER;
  if (sampling === SEQUENCE_SAMPLER) {
    const window = sequencePictureWindow(programmeStart, end-start, programmeDuration, start, 30, fps);
    // Decode the same CFR30 ingest samples, then apply the canonical sequence
    // phase. Do not seek the original VFR stream to a differently rounded cut.
    // Intermediate lossy encoding is excluded; paired pixel tolerance is
    // measured against actual renderer output, never assumed byte-identical.
    return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2', '-i', file, '-filter_threads', '1',
      '-vf', `fps=30,trim=start_frame=${window.sourceFrame},settb=1/90000,setpts=PTS-STARTPTS+(${window.phase.toFixed(9)})/TB,` +
        `fps=${fps}:start_time=0:round=up,tpad=stop_mode=clone:stop_duration=${(1/fps).toFixed(9)},` +
        `setpts=PTS-STARTPTS,select=eq(n\\,${frameIndex}),scale='min(1920,iw)':-2,` +
        'format=rgb24,setparams=range=full:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr',
      // The programme canvas consumes decoded RGB code values in sRGB. A PNG
      // must describe that RGB surface, not inherit the compressed video's
      // primaries/transfer metadata as if it were still that video signal.
      '-map', '0:v:0', '-an', '-frames:v', '1', '-threads', '2', '-c:v', 'png',
      '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-f', 'image2pipe', 'pipe:1'];
  }
  return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '2',
    '-ss', String(start), '-i', file, ...(texture ? [] : ['-t', String(end-start)]), '-filter_threads', '1',
    '-vf', texture
      ? `setpts=PTS-STARTPTS,fps=${fps}:start_time=0:round=near,select=eq(n\\,${frameIndex}),scale=1280:720:force_original_aspect_ratio=decrease`
      : `fps=${fps},setpts=PTS-STARTPTS,select=eq(n\\,${frameIndex}),scale='min(1920,iw)':-2`,
    '-map', '0:v:0', '-an', '-frames:v', '1', '-threads', '2', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'];
}

async function decodeSourceFrame(file, request, signal) {
  const { stdout } = await execute('ffmpeg', sourceFrameArgs(file, request), {
    timeout: 30000, maxBuffer: 12 * 1024 * 1024, encoding: 'buffer', killSignal: 'SIGKILL', signal,
  });
  if (!stdout.length || !stdout.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    throw sourceError(422, 'STUDIO_FRAME_MISSING', 'This source has no picture at the selected frame');
  return stdout;
}

async function prune() {
  let size = [...sources.values()].reduce((sum, item) => sum + item.size, 0);
  for (const [key, item] of [...sources].sort((a,b) => a[1].used-b[1].used)) {
    if (item.refs || (Date.now()-item.used < TTL && size <= MAX_SOURCE_BYTES)) continue;
    sources.delete(key); size -= item.size;
    await fs.rm(item.folder, { recursive: true, force: true });
  }
}
setInterval(() => prune().catch(() => {}), TTL).unref();

async function getOwnedSourceFrame({ ownerUid, input, signal }) {
  const request = validateFrameRequest(input);
  // Authorization is checked even when bytes are already cached. The exact
  // storage generation is then pinned throughout download/decode.
  const owned = await resolveOwnedStudioVideoSource({ userId: ownerUid, storagePath: request.storagePath, signRead: false });
  if (request.sourceGeneration && owned.generation !== request.sourceGeneration)
    throw sourceError(409, 'STUDIO_FRAME_SOURCE_CHANGED', 'The saved source generation has changed. Refresh its link.');
  if (!owned.generation || owned.size > MAX_SOURCE_BYTES)
    throw sourceError(422, 'STUDIO_FRAME_SOURCE_LIMIT', 'Accurate paused frames are unavailable for this source');
  if (activeOwners.has(ownerUid) || activeOwners.size >= 2)
    throw sourceError(429, 'STUDIO_FRAME_BUSY', 'A preview frame is still being prepared');
  activeOwners.add(ownerUid);
  let cached;
  try {
    const key = crypto.createHash('sha256').update(`${owned.kind}:${owned.storagePath}:${owned.generation}`).digest('hex');
    cached = sources.get(key);
    if (!cached) {
      const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-frame-'));
      const file = path.join(folder, 'source');
      cached = { folder, file, size: owned.size, used: Date.now(), refs: 0 };
      cached.ready = (async () => {
        try {
          const object = getStudioSourceBucket(owned.kind, owned.bucketName).file(owned.storagePath, { generation: owned.generation });
          await pipeline(object.createReadStream({ validation: 'crc32c', decompress: false }),
            createWriteStream(file, { mode: 0o600 }), { signal: AbortSignal.timeout(30000) });
          const bytes = await fs.readFile(file);
          if (bytes.length !== owned.size) throw new Error('Source size changed');
          cached.hash = crypto.createHash('sha256').update(bytes).digest('hex');
        } catch (_) {
          sources.delete(key); await fs.rm(folder, { recursive: true, force: true });
          throw sourceError(503, 'STUDIO_FRAME_SOURCE_UNAVAILABLE', 'Could not prepare this saved source');
        }
      })();
      sources.set(key, cached);
    }
    cached.refs++; cached.used = Date.now();
    await cached.ready;
    if (signal?.aborted) throw new Error('Preview request was superseded');
    if (request.sourceContentHash && cached.hash !== request.sourceContentHash)
      throw sourceError(409, 'STUDIO_FRAME_SOURCE_CHANGED', 'The source bytes no longer match this project');
    const image = await decodeSourceFrame(cached.file, request, signal);
    return { sampler: request.sampling || SAMPLER, sourceContentHash: cached.hash, sourceGeneration: owned.generation,
      ...(request.sampling === SEQUENCE_SAMPLER ? { sampling: SEQUENCE_SAMPLER,
        programmeStart: request.programmeStart, programmeDuration: request.programmeDuration } : {}),
      start: request.start, end: request.end, fps: request.fps, frameIndex: request.frameIndex,
      imageContentHash: crypto.createHash('sha256').update(image).digest('hex'),
      image: image.toString('base64'), contentType: 'image/png' };
  } catch (error) {
    if (error.statusCode) throw error;
    throw sourceError(503, 'STUDIO_FRAME_UNAVAILABLE', 'Accurate paused preview is temporarily unavailable');
  } finally {
    if (cached) { cached.refs--; cached.used = Date.now(); }
    activeOwners.delete(ownerUid); await prune().catch(() => {});
  }
}

module.exports = { getOwnedSourceFrame, validateFrameRequest, sourceFrameArgs, decodeSourceFrame };
