# Ordinary workspace entry for the owner account — 28 October 2026

The owner reported that normal sign-in for `tmtshwelo21@gmail.com` opened the admin dashboard. A read-only Firebase check confirmed its profile role is `user`, it has no admin document, and its custom claims contain no admin flags. The reviewed `security-owner-bootstrap-20261027` UID policy nevertheless recognizes that identity as the trusted owner. The existing App automatically redirected any backend-authorized admin to `/admin-dashboard` and rendered AdminDashboard at every application path. This forced the owner out of their actual content workspace.

Ordinary sign-in and restoration now open UserDashboard at the normal root route, including for the owner. Administration remains an explicit choice via the sidebar's **Admin dashboard** entry and the `/admin-dashboard` route. **Open workspace** is available even while AdminDashboard loads. The backend's reviewed authority remains intact; no trusted UID, Firebase claim, profile role, admin document or other production record was changed.

Session restoration resolves authority through the existing authenticated `/api/auth/verify` endpoint, so the owner does not depend on a legacy raw Firebase admin claim. The response must match the authenticated UID and carry consistent server admin fields. A missing/malformed/mismatched/unavailable result cannot grant admin UI entry. The request is bounded at ten seconds. Profile/subscription enrichment cannot replace verified UID, email, role or admin status. A later login no longer inherits an earlier session's admin flag. User defaults and subscription details also load when an owner uses the ordinary workspace.

## Verification

- 13 new frontend cases cover ordinary versus explicit admin entry, ordinary-account rejection at admin paths, restored backend owner authority without legacy claims, identity mismatch, malformed authority, stale local metadata and provider failure. The eight existing local-auth guards also pass: 21 tests in two suites.
- The strict isolated React build passed, including all 19 immutable welcome assets. It preserved the actual API configuration and existing original App/build.
- The real retained signed-in session opened the normal candidate workspace with zero admin API requests before the explicit choice; cold reload stayed in that workspace. Selecting **Admin dashboard** entered `#/admin-dashboard` with server-verified owner authority; **Open workspace** returned to `#/`. Zero page errors occurred. See `browser-validation.json`.
- Four existing authority-review regression tests passed. No backend authorization or rules source changed.
- Focused lint, whitespace checks and product-knowledge review/build/check passed. Knowledge retains the existing undocumented-surface warnings; no Studio capability or creative readiness promotion is implied.

The candidate was served separately on loopback; authenticated state was neither overwritten nor minted. Screenshots, SDK state and raw account evidence remain private under `/tmp/autopromote-analytics-review-20261028`. This browser run verified a restored real session and native navigation; it did not enter the owner's password or claim a new password-login test.
