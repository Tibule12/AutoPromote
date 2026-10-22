const crypto = require('crypto');
const Ajv = require('ajv');
const schemas = require('../../contracts/model-capabilities-v1.json');
const registry = require('../../config/model-runtime/registry.v1.json');
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : stable(value)).digest('hex');
const fail = (code, statusCode = 400) => Object.assign(new Error(code), { code, statusCode });
const ajv = new Ajv({ allErrors: true, strictNumbers: true });
const requestValidator = ajv.compile(schemas.request);
const inputs = Object.fromEntries(Object.entries(schemas.inputs).map(([key, schema]) => [key, ajv.compile(schema)]));
const outputs = Object.fromEntries(Object.entries(schemas.outputs).map(([key, schema]) => [key, ajv.compile(schema)]));
const clean = value => JSON.parse(stable(value));
function request(input) {
  // JSON round-tripping must not turn NaN or a class instance into valid input.
  if (!input || Buffer.byteLength(stable(input)) > 48 * 1024 || !requestValidator(input) || !inputs[input.capability](input.parameters))
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
  if(input.capability==='segment_subject' && p.refinement && !input.dependencyHashes.includes(p.refinement.maskArtifactHash))
    throw fail('MODEL_MASK_REFINEMENT_DEPENDENCY_REQUIRED');
  if(input.capability==='detect_object' && p.frameIndex>=frames)throw fail('MODEL_CAPABILITY_FRAME_INVALID');
  if (input.capability === 'generate_video' && !((p.width === 1280 && p.height === 704) || (p.width === 704 && p.height === 1280)))
    throw fail('MODEL_CAPABILITY_VIDEO_GEOMETRY_INVALID');
  if (input.capability === 'segment_subject' && (p.initialBox[0] >= p.initialBox[2] || p.initialBox[1] >= p.initialBox[3]))
    throw fail('MODEL_CAPABILITY_BOX_INVALID');
  if(input.capability==='segment_subject' && p.shotPrompts.some((s,i)=>s.frameIndex>=frames ||
     (i>0 && s.frameIndex<=p.shotPrompts[i-1].frameIndex) || s.box[0]>=s.box[2] || s.box[1]>=s.box[3] ||
     (s.points?.length && !s.points.some(p=>p.label===1))))
    throw fail('MODEL_CAPABILITY_SHOT_PROMPT_INVALID');
  if (input.capability==='segment_subject' && p.components?.length && (p.shotPrompts.some(s=>!s.points?.length) ||
      new Set(p.components.map(c=>c.id)).size!==p.components.length || p.components.some(c=>c.box[0]>=c.box[2] || c.box[1]>=c.box[3])))
    throw fail('MODEL_CAPABILITY_COMPONENT_SELECTION_INVALID');
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
  if (!outputs[capability]?.(output) || Buffer.byteLength(stable(output)) > 512 * 1024)
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
