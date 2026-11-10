import { prepareStudioDirectorProposal } from "./studioDirectorProposals";
import { validateStudioProjectDocument } from "./studioProjectDocument";

const MAX_DRAFT_BYTES = 128 * 1024;
const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
);
const exactKeys = (value, keys) => value && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

// Keep only canonical source identity/timing. Expiring media URLs, reviewer
// identities and approval/settlement receipts do not belong in a suggestion.
const sourceIdentity = (document, occurrenceId) => {
  const occurrence = document.clipOccurrences.find(item => item.occurrenceId === occurrenceId);
  const asset = document.assets.find(item => item.assetId === occurrence?.assetId);
  if (!occurrence || !asset) return null;
  return {
    occurrenceId, assetId: asset.assetId, sourceId: asset.sourceId,
    storagePath: asset.storagePath || null,
    identityState: asset.identityState, contentHash: asset.contentHash || null,
    sourceRange: occurrence.sourceRange, playback: occurrence.playback,
  };
};

export const sourceShotDirectorDraftMatches = (document, draft) => {
  try {
    if (!document || !draft || document.projectId !== draft.projectId) return false;
    return document.projectId === draft.projectId &&
      !!sourceIdentity(document, draft.occurrenceId) &&
      canonical(sourceIdentity(document, draft.occurrenceId)) === canonical(draft.source);
  } catch (_) { return false; }
};

// Reuse the same proposal/command validators as an ordinary review. Restoring
// a suggestion never restores an approval: the UI still registers the current
// revision and asks the authenticated server to verify its owned artifact.
export const restoreSourceShotDirectorDraft = async (document, saved) => {
  try {
    validateStudioProjectDocument(document);
    if (!exactKeys(saved, ["schemaVersion", "projectId", "occurrenceId", "source",
      "selectedProposalId", "choiceProposalIds", "requests"]) || saved.schemaVersion !== 1 ||
        !Array.isArray(saved.requests) || saved.requests.length < 1 || saved.requests.length > 65 ||
        !Array.isArray(saved.choiceProposalIds) || saved.choiceProposalIds.length > 64 ||
        new Set(saved.choiceProposalIds).size !== saved.choiceProposalIds.length ||
        !sourceShotDirectorDraftMatches(document, saved)) return null;
    const json = JSON.stringify(saved);
    if (json.length > MAX_DRAFT_BYTES || new TextEncoder().encode(json).byteLength > MAX_DRAFT_BYTES) return null;
    const draft = JSON.parse(json), byId = new Map(), commands = new Set();
    let evidenceSignature;
    for (const request of draft.requests) {
      const requestKeys = ["proposalId", "idempotencyKey", "directorId", "operation",
        ...(request.evidence !== undefined ? ["evidence"] : [])];
      if (!exactKeys(request, requestKeys) ||
          !["split_clip", "trim_clip", "reframe"].includes(request.operation?.type) ||
          request.operation.target?.occurrenceId !== draft.occurrenceId ||
          (draft.choiceProposalIds.length > 0 && (request.operation.type !== "split_clip" || request.evidence?.type !== "source_shot_boundary")) ||
          byId.has(request.proposalId) || commands.has(request.idempotencyKey)) return null;
      await prepareStudioDirectorProposal(document, request);
      const { boundaryTick: _boundaryTick, ...evidence } = request.evidence || {};
      const signature = canonical(evidence);
      if (evidenceSignature !== undefined && evidenceSignature !== signature) return null;
      evidenceSignature = signature;
      byId.set(request.proposalId, request); commands.add(request.idempotencyKey);
    }
    if (!byId.has(draft.selectedProposalId) ||
        draft.choiceProposalIds.some(id => !byId.has(id))) return null;
    const reviewed = new Set((document.directorReviewJournal || []).map(item => item.receipt?.proposalId));
    const choices = draft.choiceProposalIds.filter(id => !reviewed.has(id)).map(id => byId.get(id));
    const request = reviewed.has(draft.selectedProposalId)
      ? choices[0] : byId.get(draft.selectedProposalId);
    if (!request) return null;
    // Drop consumed choices instead of carrying an old decision across Undo,
    // checkpoint recovery or a normal save/reopen.
    draft.requests = draft.requests.filter(item => !reviewed.has(item.proposalId));
    draft.choiceProposalIds = choices.map(item => item.proposalId);
    draft.selectedProposalId = request.proposalId;
    return { projectId: document.projectId, occurrenceId: draft.occurrenceId,
      request, choices, savedDraft: draft };
  } catch (_) { return null; }
};

export const createSourceShotDirectorDraft = async (document, { request, choices = [], occurrenceId }) => {
  const requests = [request, ...choices].filter((item, index, items) =>
    item && items.findIndex(other => other?.proposalId === item.proposalId) === index);
  return restoreSourceShotDirectorDraft(document, {
    schemaVersion: 1, projectId: document.projectId, occurrenceId,
    source: sourceIdentity(document, occurrenceId), selectedProposalId: request?.proposalId,
    choiceProposalIds: choices.map(item => item.proposalId), requests,
  });
};
