# Autopilot Feature (MVP)

This document describes the Autopilot MVP implementation for AutoPromote. Autopilot allows an admin to enable an automated experiment and winner application loop for A/B tests.

Key behaviors:
- When `autopilot.enabled` is true on an `ab_tests` document, the system evaluates the test whenever metrics are updated.
- The system calculates a confidence value (based on a two-sample z-test of conversion rate vs baseline). If confidence >= `autopilot.confidenceThreshold` and `totalViews >= autopilot.minSample`, Autopilot will auto-apply the winning variant and mark the test as completed.
- Autopilot actions are logged into `ab_tests.autopilotActions` array to enable auditing and rollback.
 - Autopilot supports `mode` = `recommend` (suggest but do not apply) or `auto` (apply winner automatically if allowed).
 - Autopilot can be configured to `requiresApproval` which will block auto-apply until an admin explicitly approves the test via the admin endpoint or UI.
Approval workflow:
- Admins can enable `requiresApproval` in the autopilot settings. When enabled, autopilot will only recommend winners until an admin approves the test.
- Approval endpoint: POST `/api/admin/ab_tests/:id/autopilot/approve` (admin-only) — sets `autopilot.approvedBy` and `autopilot.approvedAt`.
- Revoke approval endpoint: POST `/api/admin/ab_tests/:id/autopilot/unapprove`.

Preview & Decision:
- The preview API will return `predictedUplift` (percent increase in conversions if the top variant is applied vs baseline), a `confidence` score, `winner` id, and `reason`.
- The admin UI supports a preview flow that shows this information in the `VariantAdminPanel`.


API Endpoints:
- GET `/api/admin/ab_tests/:id` - admin-only: retrieve a test doc for inspection
- PUT `/api/admin/ab_tests/:id/autopilot` - admin-only: enable/disable autopilot for a test and adjust threshold & minSample

Frontend:
- A small Autopilot control UI is added to the `VariantAdminPanel` (admin) to quickly enable/disable and set parameters for a given test.

Important caveats & next steps:
- The MVP uses a two-sample proportion z-test on conversions; this is an approximation. For production, we should add more robust statistical checks (Bayesian methods or frequentist t-test/chi-squared as relevant).
- Add a simulation/preview mode for Autopilot that shows what would be applied without making changes.
- Add rollback & human-approval workflows to reduce risk of incorrect auto-decisions.
- Add a rate-limited, safe autopilot budget reallocation mechanism in `optimizationService.js`.

Deployment notes:
- Ensure environment has correct `FIREBASE_` env variables; otherwise the admin routes will not be accessible.
- Autopilot is powerful and can change scheduled promotion settings. Use conservative default thresholds and `minSample` for production accounts.

Integration testing (staging):
- To run the autopilot apply integration test script (creates test content and applies autopilot), set FIREBASE or GOOGLE_APPLICATION_CREDENTIALS variables with valid staging credentials and run:
```
node scripts/test-autopilot-apply.js
```
- This will create temporary content and AB test documents in Firestore; run in a staging project to prevent data pollution in production.

CI & automation:
- Add a protected CI job to run full integration tests with a staging Firebase project and `GOOGLE_APPLICATION_CREDENTIALS` secrets stored in your CI environment.

This is an MVP implementation; further enhancements are recommended in statistical validity, UX, and safety features.
