const studio = require('../generated/studioDirectorReplayKernel.cjs');
const registry = require('../../config/creative-templates/registry.v1.json');
const { resolveTemplate, referenceFor, hash, fail } = require('./contract');

async function instantiateTemplate({ templateRef, authenticatedUser, projectId, bindings, ...options }) {
  if (!authenticatedUser?.uid) throw fail('TEMPLATE_AUTH_REQUIRED', 401);
  const template = resolveTemplate(registry, templateRef);
  const result = await studio.instantiateStudioCreativeTemplate({ template, templateRef,
    ownerUid: authenticatedUser.uid, projectId, bindings, ...options });
  return { ...result, documentHash: hash(result.document) };
}

// Director selects this same pinned authored definition. Its returned edit is
// committed/reviewed by the existing project workflow, never another renderer.
async function instantiateDirectorTemplate({ selection, authenticatedUser, projectId, bindings, ...options }) {
  const templateRef = selection?.templateRef;
  if (selection?.templateId && selection.templateId !== templateRef?.templateId)
    throw fail('TEMPLATE_IDENTITY_MISMATCH');
  if (!authenticatedUser?.uid) throw fail('TEMPLATE_AUTH_REQUIRED', 401);
  const template = resolveTemplate(registry, templateRef);
  const proposal = await studio.proposeStudioDirectorTemplate({ template, templateRef,
    ownerUid: authenticatedUser.uid, projectId, bindings, ...options, intent: template.categoryIds[0] });
  return { ...proposal.result, documentHash: hash(proposal.result.document),
    selectionReason: proposal.selectionReason, sourceEvidence: proposal.sourceEvidence,
    startsModelJob: proposal.startsModelJob };
}

function launchTemplateReference() { return referenceFor(registry.templates[0]); }

module.exports = { instantiateTemplate, instantiateDirectorTemplate, launchTemplateReference };
