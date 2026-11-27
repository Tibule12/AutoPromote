// Rollout selection only; the API still verifies identity and every source.
// An enabled flag alone must not activate new CPU work for all customers.
function sourceDialoguePreviewEnabled(uid, enabled, allowedUids) {
  if (
    enabled !== "true" ||
    typeof uid !== "string" ||
    !uid ||
    typeof allowedUids !== "string" ||
    allowedUids.length > 4096
  )
    return false;
  const cohort = allowedUids
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return cohort.length <= 32 && !cohort.includes("*") && cohort.includes(uid);
}

module.exports = { sourceDialoguePreviewEnabled };
