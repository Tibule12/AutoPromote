# Emergency containment approval packet — 27 October 2026

**E1 explicitly approved and published on 27 October 2026, 05:39 SAST.**
Both active pointers and exact source hashes were verified; see the
[execution receipt](evidence/20261027/e1-execution.json). The text below records the
approved scope. It is not approval to deploy other policies or reopen client access.

Request E1: deploy only the three files identified in the
[exact manifest](../../artifacts/security/emergency-containment/manifest.json), targeting
project `autopromote-cc6d3`, Firestore database `(default)` and Firebase Storage bucket
`autopromote-cc6d3.firebasestorage.app`. These deny all direct client database and Storage
reads/writes, including for administrators. They do not modify any stored document,
balance, Auth claim, user session, object, subscription or price. No push, merge, backend
deploy, IAM change, service suspension or credential revocation is included.

The deployed Firestore escalation was already verified. New isolated tests reproduced
cross-owner private Storage reads and overwrites under the deployed Storage rules; all
three coordinated emulator cases pass with the restrictive rules. Storage therefore
needs coordinated containment rather than waiting for the final application repair.

**Trade-off:** uploads, direct project loading/sync/saving and media access through the
Firebase client SDK can fail for every user. Local editing/device saves may continue;
browser recovery must not discard unsaved work. Authentication and trusted server billing
are not intentionally disabled, and Admin SDK/IAM processing can continue, but this is
not a guarantee that complete user workflows remain usable during containment.

**Limits:** backend Admin SDK calls bypass Rules. Existing forged backend authority,
public alternate APIs/workers, signed URLs, Firebase download tokens, public bucket IAM
and cached media are not blocked by these rules. No claim of complete incident containment
is made. Known endpoint paths and independent backend remediation remain part of the
separate production release. Backend/service/IAM restrictions need separate named approval.

After explicit E1 approval: confirm the manifest hashes and active release pointers;
use a clean approved operator login; deploy Firestore rules first, then the named bucket's
Storage rules, with the explicit project and narrow config. These releases are not atomic.
Re-export release pointers and sources to confirm the result. No production exploit or
financial probe is included. Do not run a broad Firebase deployment.

If only one step succeeds, retain that restrictive policy and report the incomplete step.
Do not restore vulnerable rules. Keep direct access restricted until a separately approved,
tested owner-scoped policy and backend repair are ready. A deployment error is not permission
to change IAM, enable APIs, remove privileges or alter data.

This packet can be approved independently of the final API repair. The final API release
and any reopening of client access still require their own approval.
