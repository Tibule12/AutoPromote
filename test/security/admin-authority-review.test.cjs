const { it } = require("node:test");
const assert = require("node:assert/strict");
const { review } = require("../../scripts/security/review-admin-authority.cjs");
const roster = {
  project: "demo-security",
  approvedBy: "owner-fixture",
  reviewedAtUtc: "2026-10-26T00:00:00Z",
  admins: [{ uid: "expected" }],
};
const snapshot = {
  project: "demo-security",
  database: "(default)",
  tenant: null,
  complete: true,
  authUsers: [{ uid: "expected", customClaims: { admin: true } }],
  adminDocuments: [{ uid: "expected" }],
  profileSignals: [],
};
it("compares independently approved claim and collection admins without mutation", () => {
  const before = JSON.stringify(snapshot);
  assert.equal(review(snapshot, roster).requiresHumanReview, false);
  assert.equal(JSON.stringify(snapshot), before);
});
it("flags unapproved, orphaned, disabled and profile-only authority without declaring compromise", () => {
  const result = review(
    {
      ...snapshot,
      adminDocuments: [...snapshot.adminDocuments, { uid: "orphan", status: "inactive" }],
      authUsers: [
        ...snapshot.authUsers,
        { uid: "claim-only", disabled: true, customClaims: { isAdmin: true } },
      ],
      profileSignals: [{ uid: "profile-only", role: "admin" }],
    },
    roster
  );
  assert.equal(result.requiresHumanReview, true);
  assert.ok(
    result.findings
      .find(row => row.uid === "orphan")
      .flags.includes("INACTIVE_DOCUMENT_STILL_GRANTS_ADMIN")
  );
  assert.ok(
    result.findings.find(row => row.uid === "profile-only").flags.includes("PROFILE_ONLY_AUTHORITY")
  );
  assert.ok(
    result.findings.find(row => row.uid === "claim-only").flags.includes("AUTH_ACCOUNT_DISABLED")
  );
  assert.match(result.conclusion, /not proof/);
});
it("does not accept string booleans as privileged claims and flags approved admins with no authority", () => {
  const result = review(
    {
      ...snapshot,
      authUsers: [{ uid: "expected", customClaims: { admin: "true" } }],
      adminDocuments: [],
    },
    roster
  );
  assert.ok(result.findings[0].flags.includes("APPROVED_ADMIN_HAS_NO_CANDIDATE_AUTHORITY"));
});
it("rejects incomplete, duplicate, wrong-project and wrong-tenant inputs", () => {
  assert.throws(() => review({ ...snapshot, complete: false }, roster));
  assert.throws(() =>
    review({ ...snapshot, authUsers: [...snapshot.authUsers, ...snapshot.authUsers] }, roster)
  );
  assert.throws(() => review(snapshot, { ...roster, project: "another" }));
  assert.throws(() => review({ ...snapshot, tenant: "tenant-a" }, roster));
});
