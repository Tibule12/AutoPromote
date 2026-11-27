const crypto = require('crypto');
const Ajv = require('ajv');
const schemas = require('../../contracts/creative-templates-v1.json');

const stable = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => crypto.createHash('sha256')
  .update(Buffer.isBuffer(value) || typeof value === 'string' ? value : stable(value)).digest('hex');
const fail = (code, statusCode = 409) => Object.assign(new Error(code), { code, statusCode });
const ajv = new Ajv({ allErrors: true, strictNumbers: true });
const validators = Object.fromEntries(Object.entries(schemas).filter(([, value]) =>
  value && typeof value === 'object').map(([key, value]) => [key, ajv.compile(value)]));
const SHA = /^[a-f0-9]{64}$/;

function validate(kind, value) {
  if (!validators[kind]?.(value) || Buffer.byteLength(stable(value)) > 512 * 1024)
    throw fail('CREATIVE_TEMPLATE_CONTRACT_INVALID');
  return value;
}

function validateRegistry(registry) {
  validate('registry', registry);
  if (new Set(registry.categories.map(item => item.id)).size !== registry.categories.length ||
      new Set(registry.templates.map(item => `${item.templateId}@${item.version}`)).size !== registry.templates.length ||
      registry.templates.some(template => new Set(template.inputSlots.map(slot => slot.id)).size !== template.inputSlots.length))
    throw fail('CREATIVE_TEMPLATE_DUPLICATE_ID');
  return registry;
}

function referenceFor(template) {
  validate('template', template);
  return { templateId: template.templateId, version: template.version, definitionHash: hash(template) };
}

function resolveTemplate(registry, reference, { requireQualified = false } = {}) {
  validateRegistry(registry);
  validate('templateRef', reference);
  const template = registry.templates.find(item => item.templateId === reference.templateId && item.version === reference.version);
  if (!template || hash(template) !== reference.definitionHash)
    throw fail('CREATIVE_TEMPLATE_VERSION_UNAVAILABLE');
  if (requireQualified && (template.status !== 'qualified' ||
      template.qualification.studioLifecycle !== 'verified' ||
      template.qualification.directorInstantiation !== 'verified' ||
      template.qualification.creativeQuality !== 'approved' ||
      template.qualification.previewFinalParity !== 'verified'))
    throw fail('CREATIVE_TEMPLATE_NOT_QUALIFIED');
  return template;
}

function verifiedEvidence(record, expectedHash, kind) {
  if (!record || !SHA.test(expectedHash || '') || record.kind !== kind || hash(record) !== expectedHash)
    throw fail('SHOWCASE_EVIDENCE_CHANGED');
  return record;
}

const same = (a, b) => a !== undefined && b !== undefined && hash(a) === hash(b);

module.exports = { stable, hash, fail, SHA, validate, validateRegistry, referenceFor, resolveTemplate, verifiedEvidence, same };
