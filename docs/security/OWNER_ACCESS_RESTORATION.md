# Restore owner access after emergency containment

This security-only follow-up replaces the repository's broad client permissions with
the tested owner-scoped Rules candidates. It does not publish automatically when
merged: the backend pipeline does not deploy Firebase Rules. Payment fulfilment,
subscriptions, balances, ad configuration and media processing code are unchanged.

Deploy only after PR #498's repaired backend is verified on both Render origins.
`scripts/security/publish-reviewed-rules.py` requires the exact live commit and
`security-owner-bootstrap-20261027` policy. It checks both current Rules releases
against the recorded E1 containment pointers and verifies local source hashes before
any write. Without `--execute`, it performs read-only preflight. Execution creates
two Rulesets and updates only the default Firestore and named Storage releases.
The receipt records release names, before/after pointers and verified source hashes.

The user authorised autonomous security remediation after separately approving E1/E2.
No renewed security approval is required. The AdSense tag remains a separate change
held for explicit merge/deploy approval and is not part of this branch.

Storage restores current UID-scoped Publisher, scan, editor, thumbnail and Cam Combiner
paths. Cross-user reads, writes, listing and forged admin claims are rejected. Protected
upload blocks apply to restored private uploads. Public asset reads remain available;
public shared writes require the reviewed administrator identity. Studio analysis/model
paths remain API-only, including for administrator clients. Existing signed/download
tokens and IAM are independent of these Rules.

Legacy flat uploads, unowned proof paths and unknown prefixes remain API-only/denied.
They need a verified ownership relationship before client access is restored. This can
still disrupt legacy media/proof flows; it does not justify a permissive fallback.
Authenticated production browser testing remains distinct from emulator compatibility.

Validation: the profile/authority candidate passed the isolated security suite; ten
real Firestore/Storage emulator tests cover the former exploit, E1 and restored owner
paths. Four fake-API publisher tests verify the runtime/release guards and exact scope.
CI runs all three checks before the existing Render deployment hook.

On failure, keep E1 or reapply its exact deny-all sources through a scoped Rules-only
operation. Preserve backend/IAM containment and roll forward. Never restore the old
vulnerable Rules or unpatched authority backend. Do not rewrite balances or replay
provider events as rollback.
