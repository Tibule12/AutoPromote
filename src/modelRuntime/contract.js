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
function capabilityValidators(definitions) {
  return Object.freeze({
    understand_video: ajv.compile(definitions.understand_video),
    detect_object: ajv.compile(definitions.detect_object),
    segment_subject: ajv.compile(definitions.segment_subject),
    track_object: ajv.compile(definitions.track_object),
    generate_video: ajv.compile(definitions.generate_video),
  });
}
const inputs = capabilityValidators(schemas.inputs);
const outputs = capabilityValidators(schemas.outputs);
// Select only statically named validators; request values never name a method.
function validateCapability(validators, capability, value) {
  switch (capability) {
    case 'understand_video': return validators.understand_video(value);
    case 'detect_object': return validators.detect_object(value);
    case 'segment_subject': return validators.segment_subject(value);
    case 'track_object': return validators.track_object(value);
    case 'generate_video': return validators.generate_video(value);
    default: return false;
  }
}
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
  if (!validateCapability(inputs, input.capability, input.parameters))
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
  if (!boundedJson(output, 512 * 1024) || !validateCapability(outputs, capability, output))
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
