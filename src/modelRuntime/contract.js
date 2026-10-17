const crypto = require('crypto');
const Ajv = require('ajv');
const schemas = require('../../contracts/model-capabilities-v1.json');
const registry = require('../../config/model-runtime/registry.v1.json');
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : stable(value)).digest('hex');
const fail = (code, statusCode = 400) => Object.assign(new Error(code), { code, statusCode });
const ajv = new Ajv({ allErrors: false, strictNumbers: true });
const requestValidator = ajv.compile(schemas.request);
const inputs = new Map(Object.entries(schemas.inputs).map(([key, schema]) => [key, ajv.compile(schema)]));
const outputs = new Map(Object.entries(schemas.outputs).map(([key, schema]) => [key, ajv.compile(schema)]));
const clean = value => JSON.parse(stable(value));
// Reject excessive depth, cycles and non-JSON values before schema traversal
// or serialization. Never invoke user-supplied getters or toJSON methods.
function boundedJson(value, maxBytes) {
  const pending = [{ value, depth: 0 }];
  let nodes = 0, bytes = 0;
  while (pending.length) {
    const item = pending.pop(), current = item.value;
    if (++nodes > 50000 || item.depth > 32) return false;
    if (current === null || typeof current === 'boolean') bytes += 5;
    else if (typeof current === 'number') {
      if (!Number.isFinite(current)) return false;
      bytes += 24;
    } else if (typeof current === 'string') bytes += Buffer.byteLength(current);
    else if (typeof current === 'object') {
      const prototype = Object.getPrototypeOf(current);
      if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) return false;
      const properties = Object.getOwnPropertyDescriptors(current);
      for (const [key, descriptor] of Object.entries(properties)) {
        if (Array.isArray(current) && key === 'length') continue;
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
            ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key)) return false;
        bytes += Buffer.byteLength(key) + 4;
        pending.push({ value: descriptor.value, depth: item.depth + 1 });
      }
    } else return false;
    if (bytes > maxBytes) return false;
  }
  return Buffer.byteLength(stable(value)) <= maxBytes;
}
function request(input) {
  // JSON round-tripping must not turn NaN or a class instance into valid input.
  if (!input || !boundedJson(input, 48 * 1024) || !requestValidator(input))
    throw fail('MODEL_CAPABILITY_REQUEST_INVALID');
  const validateParameters = inputs.get(input.capability);
  if (!validateParameters || !validateParameters(input.parameters))
    throw fail('MODEL_CAPABILITY_REQUEST_INVALID');
  const r = input.sourceRange;
  if (r.endTick <= r.startTick || r.endTick - r.startTick > 30 * 90000)
    throw fail('MODEL_CAPABILITY_RANGE_INVALID');
  const frames=Math.floor((r.endTick-r.startTick)/3750+.5);
  if(frames<1 || frames>720)throw fail('MODEL_CAPABILITY_RANGE_INVALID');
  if (input.sourceStoragePath.includes('..') || input.sourceStoragePath.includes('\\') || input.sourceStoragePath.startsWith('/'))
    throw fail('MODEL_CAPABILITY_SOURCE_INVALID');
  if (new Set(input.dependencyHashes).size !== input.dependencyHashes.length)
    throw fail('MODEL_CAPABILITY_DEPENDENCIES_INVALID');
  const p = input.parameters;
  if(input.capability==='detect_object' && p.frameIndex>=frames)throw fail('MODEL_CAPABILITY_FRAME_INVALID');
  if (input.capability === 'generate_video' && !((p.width === 1280 && p.height === 704) || (p.width === 704 && p.height === 1280)))
    throw fail('MODEL_CAPABILITY_VIDEO_GEOMETRY_INVALID');
  if (input.capability === 'segment_subject' && (p.initialBox[0] >= p.initialBox[2] || p.initialBox[1] >= p.initialBox[3]))
    throw fail('MODEL_CAPABILITY_BOX_INVALID');
  if(input.capability==='segment_subject' && p.shotPrompts.some((s,i)=>s.frameIndex>=frames ||
     (i>0 && s.frameIndex<=p.shotPrompts[i-1].frameIndex) || s.box[0]>=s.box[2] || s.box[1]>=s.box[3]))
    throw fail('MODEL_CAPABILITY_SHOT_PROMPT_INVALID');
  if (input.capability === 'track_object' && (p.mode !== 'mask_centroid' || !p.maskArtifactHash || !input.dependencyHashes.includes(p.maskArtifactHash) || p.points.length))
    throw fail('MODEL_CAPABILITY_POINT_TRACKING_UNAVAILABLE', 503);
  return clean(input);
}
function selectModel(capability, { models = registry, modelId = models.defaults[capability] } = {}) {
  const model = models.models.find(m => m.id === modelId);
  if (!model || model.capabilityId !== capability || !model.enabled) throw fail('MODEL_CAPABILITY_UNAVAILABLE', 503);
  if (!/^[a-f0-9]{40}$/.test(model.revision) || !model.modelVersion || !model.license || !model.weights.length)
    throw fail('MODEL_REGISTRY_UNPINNED', 503);
  return clean(model);
}
function validateOutput(capability, output) {
  const validate = outputs.get(capability);
  if (!validate || !boundedJson(output, 512 * 1024) || !validate(output))
    throw fail('MODEL_CAPABILITY_OUTPUT_INVALID', 502);
  return clean(output);
}
function evidenceFor(artifact) {
  if (artifact.status !== 'completed') throw fail('MODEL_ARTIFACT_NOT_EVIDENCE', 409);
  return { evidenceId: `model:${artifact.artifactHash.slice(0,32)}`, kind: 'model_artifact',
    sourceAssetId: artifact.sourceAssetId, sourceContentHash: artifact.sourceSha256,
    artifactHash: artifact.artifactHash, analysisType: artifact.capability,
    modelRevision: artifact.revision, configHash: artifact.configHash,
    dependencyHashes: artifact.dependencyHashes, statement: null };
}
module.exports = { request, selectModel, validateOutput, evidenceFor, stable, hash, fail, clean, registry, schemas };
