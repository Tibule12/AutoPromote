// Offline review only: no Firebase SDK, network, claims changes or data writes.
const fs = require("fs");
function privileged(data = {}) {
  return data.admin === true || data.isAdmin === true || data.role === "admin";
}
function index(records, label) {
  if (!Array.isArray(records)) throw new Error(`Missing ${label}`);
  const result = new Map();
  for (const record of records) {
    if (!record || typeof record.uid !== "string" || !record.uid || result.has(record.uid))
      throw new Error(`Invalid or duplicate UID in ${label}`);
    result.set(record.uid, record);
  }
  return result;
}
function review(snapshot, roster) {
  if (snapshot.complete !== true) throw new Error("Incomplete export cannot clear a release gate");
  if (!roster.approvedBy || !roster.reviewedAtUtc || roster.project !== snapshot.project)
    throw new Error("A separately approved roster for the same project is required");
  if (Object.hasOwn(roster, "tenant") && roster.tenant !== snapshot.tenant)
    throw new Error("Tenant scope differs");
  if (!Object.hasOwn(roster, "tenant") && snapshot.tenant)
    throw new Error("A tenant-specific roster is required");
  const approved = index(roster.admins, "approved roster");
  const accounts = index(snapshot.authUsers, "Auth users");
  const documents = index(snapshot.adminDocuments, "admin documents");
  const profiles = index(snapshot.profileSignals, "profile signals");
  const candidates = new Set([...approved.keys(), ...documents.keys()]);
  for (const [uid, record] of accounts) if (privileged(record.customClaims)) candidates.add(uid);
  for (const [uid, data] of profiles) {
    if (
      privileged(data) ||
      privileged(data.claims) ||
      privileged(data.customClaims) ||
      data.fromCollection === "admins" ||
      data.test === true
    )
      candidates.add(uid);
  }
  const findings = [...candidates].sort().map(uid => {
    const account = accounts.get(uid),
      document = documents.get(uid),
      profile = profiles.get(uid);
    const claimAdmin = privileged(account?.customClaims),
      documentAdmin = Boolean(document);
    const profileAuthority = Boolean(
      profile &&
      (privileged(profile) ||
        privileged(profile.claims) ||
        privileged(profile.customClaims) ||
        profile.fromCollection === "admins" ||
        profile.test === true)
    );
    const flags = [];
    if (!approved.has(uid)) flags.push("NOT_ON_INDEPENDENT_ROSTER");
    if (!account) flags.push("AUTH_ACCOUNT_NOT_IN_EXPORT");
    if (account?.disabled) flags.push("AUTH_ACCOUNT_DISABLED");
    if (approved.has(uid) && !claimAdmin && !documentAdmin)
      flags.push("APPROVED_ADMIN_HAS_NO_CANDIDATE_AUTHORITY");
    if (claimAdmin !== documentAdmin) flags.push("CLAIM_DOCUMENT_DIFFERENCE");
    if (profileAuthority && !claimAdmin && !documentAdmin) flags.push("PROFILE_ONLY_AUTHORITY");
    if (
      document &&
      (document.disabled === true || ["disabled", "inactive", "revoked"].includes(document.status))
    )
      flags.push("INACTIVE_DOCUMENT_STILL_GRANTS_ADMIN");
    return { uid, approved: approved.has(uid), claimAdmin, documentAdmin, profileAuthority, flags };
  });
  return {
    project: snapshot.project,
    database: snapshot.database,
    tenant: snapshot.tenant,
    capturedAtUtc: snapshot.capturedAtUtc,
    approvedBy: roster.approvedBy,
    findings,
    requiresHumanReview: findings.some(row => row.flags.length > 0),
    conclusion:
      "Signals for human investigation, not proof of legitimacy, compromise or absence of historical privileged sessions. No changes made.",
  };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        "Usage: node scripts/security/review-admin-authority.cjs snapshot.json independently-approved-roster.json"
      );
    process.stdout.write(
      JSON.stringify(
        review(
          JSON.parse(fs.readFileSync(process.argv[2], "utf8")),
          JSON.parse(fs.readFileSync(process.argv[3], "utf8"))
        ),
        null,
        2
      ) + "\n"
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
module.exports = { review };
