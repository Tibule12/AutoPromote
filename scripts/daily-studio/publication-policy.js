const assert = require('node:assert/strict');

// Workflow evidence of an actual owner message, never an agent's quality vote.
// Do not create this record until the owner has watched and approved these bytes.
function assertOwnerPublicationApproval(post, { mediaSha256, thumbnailSha256 }) {
  const approval = post.ownerPublicationApproval;
  assert(approval?.decision === 'approved_for_scheduling',
    'Owner must watch and approve the finished video before scheduling.');
  assert(approval.source === 'owner_message' && typeof approval.messageReference === 'string' &&
    approval.messageReference.trim().length >= 12, 'Retain the actual owner approval message reference.');
  for (const [label, value] of Object.entries({ mediaSha256, thumbnailSha256 })) {
    assert(/^[a-f0-9]{64}$/.test(value || ''), `Retain the reviewed ${label}.`);
    assert.equal(approval[label], value, `Owner approval belongs to a different ${label}.`);
  }
}

function assertPublicDuration(actual, declared) {
  assert(Number.isFinite(actual) && actual > 0, 'Verify the actual native movie duration.');
  assert(Number.isFinite(declared) && declared > 0, 'Declare the duration needed by this demonstration.');
  assert(Math.abs(actual - declared) <= 1 / 24,
    'Public export duration differs from the declared demonstration; do not add filler.');
}

module.exports = { assertOwnerPublicationApproval, assertPublicDuration };
