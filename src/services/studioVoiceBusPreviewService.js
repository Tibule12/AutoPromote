// Transient owned CPU audio from the same mixer as final rendering. No URLs,
// caller paths, GPU jobs or private media are accepted from a public manifest.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const { resolveOwnedStudioMediaSource, getStudioSourceBucket, sourceError } = require('./studioSourceService');
const activeOwners = new Set(), cache = new Map();
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const number = (v, low, high) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => names.includes(key)) && names.every(key => Object.hasOwn(value, key));

function validateVoiceBusRequest(input) {
  const invalid = () => { throw sourceError(422, 'STUDIO_VOICE_PREVIEW_INVALID', 'Recorded-speech preview parameters are invalid'); };
  if (!fields(input, ['version', 'projectId', 'voices', 'speedPlan', 'automation', 'ducking']) || input.version !== 1 ||
      typeof input.projectId !== 'string' || !input.projectId.length || input.projectId.length > 160 ||
      !Array.isArray(input.voices) || !input.voices.length || input.voices.length > 8 ||
      !Array.isArray(input.speedPlan) || !input.speedPlan.length || input.speedPlan.length > 256 ||
      !Array.isArray(input.automation) || input.automation.length > 64 ||
      !fields(input.ducking, ['enabled', 'strength']) || typeof input.ducking.enabled !== 'boolean' ||
      !number(input.ducking.strength, .05, .95)) invalid();
  let end = 0, outputDuration = 0;
  for (const row of input.speedPlan) {
    if (!fields(row, ['start_time', 'end_time', 'rate']) || !number(row.start_time, 0, 90) ||
        !number(row.end_time, 0, 90) || row.end_time <= row.start_time || Math.abs(row.start_time-end) > 1e-7 ||
        !number(row.rate, .25, 4)) invalid();
    outputDuration += (row.end_time-row.start_time)/row.rate; end = row.end_time;
  }
  if (outputDuration > 90) invalid();
  const ids = new Set();
  for (const take of input.voices) {
    if (!fields(take, ['id', 'storagePath', 'sourceContentHash', 'startTime', 'duration', 'trimStart', 'volume', 'fadeIn', 'fadeOut']) ||
        typeof take.id !== 'string' || !take.id.length || take.id.length > 160 || ids.has(take.id) ||
        typeof take.storagePath !== 'string' || take.storagePath.length > 1024 || !/^[a-f0-9]{64}$/.test(take.sourceContentHash || '') ||
        !number(take.startTime, 0, end) || !number(take.duration, .05, 60) ||
        !number(take.trimStart, 0, 60) || take.trimStart+take.duration > 60 ||
        !number(take.volume, 0, 1) || !number(take.fadeIn, 0, 5) || !number(take.fadeOut, 0, 5)) invalid();
    ids.add(take.id);
  }
  for (const key of input.automation) {
    if (!fields(key, ['property', 'time', 'value', 'easing', 'curve']) || key.property !== 'volume' ||
        !number(key.time, 0, end) || !number(key.value, 0, 200) ||
        !['linear', 'hold', 'ease_in', 'ease_out', 'ease_in_out', 'bezier'].includes(key.easing) ||
        !(key.curve === null || Array.isArray(key.curve) && key.curve.length === 4 && key.curve.every(v => number(v, 0, 1)))) invalid();
  }
  return input;
}

async function renderVoiceBusPreview(folder, input, signal) {
  const requestFile = path.join(folder, 'request.json');
  await fs.writeFile(requestFile, JSON.stringify(input), { mode: 0o600 });
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.STUDIO_AUDIO_PREVIEW_PYTHON || 'python3',
      [path.resolve(__dirname, '../../python_media_worker/studio_voice_bus_preview.py'), requestFile, folder],
      { detached: true, env: { ...process.env, CUDA_VISIBLE_DEVICES: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', failure;
    const stop = error => {
      failure = error;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
    };
    const abort = () => stop(sourceError(499, 'STUDIO_VOICE_PREVIEW_CANCELLED', 'Speech preview was superseded'));
    const timer = setTimeout(() => stop(sourceError(503, 'STUDIO_VOICE_PREVIEW_TIMEOUT', 'Recorded-speech preview timed out')), 30000);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 16384) abort(); });
    child.stderr.resume(); // Never return source paths or raw decoder errors.
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.once('error', () => { cleanup(); reject(sourceError(503, 'STUDIO_VOICE_PREVIEW_RUNTIME', 'Recorded-speech preview runtime is unavailable')); });
    child.once('close', code => { cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(sourceError(503, 'STUDIO_VOICE_PREVIEW_RUNTIME', 'Recorded-speech preview could not be prepared'));
      else { try { resolve(JSON.parse(output)); } catch (_) { reject(sourceError(503, 'STUDIO_VOICE_PREVIEW_RUNTIME', 'Invalid speech preview receipt')); } }
    });
    if (signal?.aborted) abort();
  });
}

async function getOwnedVoiceBusPreview({ ownerUid, input, signal }) {
  validateVoiceBusRequest(input);
  if (activeOwners.has(ownerUid) || activeOwners.size >= 2)
    throw sourceError(429, 'STUDIO_VOICE_PREVIEW_BUSY', 'A recorded-speech preview is still being prepared');
  activeOwners.add(ownerUid);
  let folder;
  try {
    const owned = await Promise.all(input.voices.map(take => resolveOwnedStudioMediaSource({
      storagePath: take.storagePath, userId: ownerUid, signRead: false })));
    if (owned.some(o => !o.generation || o.size > 8*1024*1024 || !o.contentType.startsWith('audio/')) ||
        owned.reduce((sum, o) => sum+o.size, 0) > 32*1024*1024)
      throw sourceError(422, 'STUDIO_VOICE_PREVIEW_LIMIT', 'Accurate speech preview supports bounded saved audio recordings');
    const parametersHash = digest(canonical(input));
    const runtimeFiles = ['studio_voice_bus_preview.py', 'viral_motion_graphics.py', 'studio_audio.py', 'viral_render_contract.py'];
    const runtimeHash = digest(Buffer.concat(await Promise.all(runtimeFiles.map(name =>
      fs.readFile(path.resolve(__dirname, '../../python_media_worker', name))))));
    const cacheKey = digest(canonical([ownerUid, parametersHash, runtimeHash, owned.map(o => [o.generation, o.size])]));
    const prior = cache.get(cacheKey);
    if (signal?.aborted) throw sourceError(499, 'STUDIO_VOICE_PREVIEW_CANCELLED', 'Speech preview was superseded');
    if (prior && Date.now()-prior.at < 60000) return prior.result;
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-voice-bus-'));
    for (let i=0; i<owned.length; i++) {
      const o = owned[i], file = path.join(folder, `source-${i}`);
      const object = getStudioSourceBucket(o.kind).file(o.storagePath, { generation: o.generation });
      await pipeline(object.createReadStream({ validation: 'crc32c', decompress: false }),
        createWriteStream(file, { mode: 0o600 }), { signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(15000)]) });
      const bytes = await fs.readFile(file);
      if (bytes.length !== o.size || digest(bytes) !== input.voices[i].sourceContentHash)
        throw sourceError(409, 'STUDIO_VOICE_PREVIEW_SOURCE_CHANGED', 'A recording no longer matches this edit');
    }
    const receipt = await renderVoiceBusPreview(folder, input, signal);
    if (digest(Buffer.concat(await Promise.all(runtimeFiles.map(name =>
      fs.readFile(path.resolve(__dirname, '../../python_media_worker', name)))))) !== runtimeHash)
      throw sourceError(409, 'STUDIO_VOICE_PREVIEW_RUNTIME_CHANGED', 'Speech processing changed; prepare this preview again');
    const [voice, duck] = await Promise.all([fs.readFile(path.join(folder, 'voice.wav')), fs.readFile(path.join(folder, 'duck.f32'))]);
    if (voice.length > 18*1024*1024 || duck.length !== receipt.sampleCount*4 || receipt.sampleRate !== 48000)
      throw sourceError(503, 'STUDIO_VOICE_PREVIEW_INCOMPLETE', 'Incomplete speech preview');
    const result = { ...receipt, projectId: input.projectId, parametersHash, runtimeHash,
      sourceGenerations: owned.map(o => o.generation),
      voiceHash: digest(voice), voiceBase64: voice.toString('base64'),
      duckHash: digest(duck), duckBase64: duck.toString('base64') };
    cache.set(cacheKey, { at: Date.now(), result, size: voice.length+duck.length });
    let size = [...cache.values()].reduce((sum, v) => sum+v.size, 0);
    for (const [key, value] of cache) if (Date.now()-value.at >= 60000 || size > 16*1024*1024) { cache.delete(key); size -= value.size; }
    return result;
  } finally {
    activeOwners.delete(ownerUid);
    if (folder) await fs.rm(folder, { recursive: true, force: true });
  }
}

module.exports = { validateVoiceBusRequest, renderVoiceBusPreview, getOwnedVoiceBusPreview };
