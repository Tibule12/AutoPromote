const test = require('node:test');
const assert = require('node:assert/strict');
const { assertOwnerPublicationApproval, assertPublicDuration } = require('../../scripts/daily-studio/publication-policy');
const mediaSha256 = 'a'.repeat(64), thumbnailSha256 = 'b'.repeat(64);
const approval = { decision: 'approved_for_scheduling', source: 'owner_message',
  messageReference: 'Owner message reference fixture; not a real approval', mediaSha256, thumbnailSha256 };
test('duration follows the demonstration, including two and three minutes', () => {
  for (const n of [38.5, 120, 147.25, 180]) assert.doesNotThrow(() => assertPublicDuration(n, n));
  assert.throws(() => assertPublicDuration(60, 147.25), /differs/);
  assert.throws(() => assertPublicDuration(120, undefined), /Declare/);
});
test('an agent review or passing render cannot authorize scheduling', () => {
  assert.throws(() => assertOwnerPublicationApproval({ visualReviewed: true }, { mediaSha256, thumbnailSha256 }), /Owner must watch/);
  assert.throws(() => assertOwnerPublicationApproval({ ownerPublicationApproval: { ...approval, source: 'agent_review' } },
    { mediaSha256, thumbnailSha256 }), /actual owner/);
});
test('approval covers the exact video and thumbnail; changed bytes need review', () => {
  const post = { ownerPublicationApproval: approval };
  assert.doesNotThrow(() => assertOwnerPublicationApproval(post, { mediaSha256, thumbnailSha256 }));
  for (const changed of [{ mediaSha256: 'c'.repeat(64), thumbnailSha256 }, { mediaSha256, thumbnailSha256: 'd'.repeat(64) }])
    assert.throws(() => assertOwnerPublicationApproval(post, changed), /different/);
  assert.throws(() => assertOwnerPublicationApproval(post, { mediaSha256 }), /reviewed thumbnail/);
});
