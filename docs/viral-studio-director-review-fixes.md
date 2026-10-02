# Director foundation review fixes — 30 September 2026

This follow-up addresses the four defects reproduced against `4025b86`.

- **Journal size:** new commands store versioned inverse patches containing changed JSON values. Unchanged caption layers and tracks are not copied into each journal entry. Existing full before-image inverses remain readable. A two-minute project with 80 captions can be registered after 60 splits, reopened from canonical server JSON, undone back to its original state, and registered again within the existing 512 KiB limit. The service limit remains enforced; this is not an unlimited-history claim.
- **Checkpoint revisions:** restoring a checkpoint uses the newest matching live/saved project revision and preserves its command receipts and Director review history. Checkpoint content receives a fresh revision rather than reusing a previously registered revision number. Conflicting edits from other clients still fail the server's revision checks.
- **Repeated Undo:** the headless API selects the latest original command still applied. Undo records no longer cause successive calls to toggle the last edit. Edits after an undo, JSON save/load, old full inverses and unknown-revision barriers are covered. The existing UI snapshot Undo/Redo remains in place.
- **Fractional-frame export:** source endpoints are compared on the canonical tick clock, while duration is checked against its own unrounded endpoints. A valid 24000/1001 fps range no longer fails because of a one-tick rounding difference; changed ranges and incorrect durations still fail.

The server round-trip test also exposed object-key-order sensitivity in document and output-map comparisons. Comparisons now treat reordered JSON keys as the same content. The capability evidence test resolves repository paths from its own file, so both root Jest and frontend test execution work.

Regression coverage lives in `studioDirectorReviewRegressions.test.js`, `studioProjectRevisionRoutes.jest.test.js`, and the mounted `ViralClipStudio.test.js` checkpoint approval case. Route tests use the existing in-memory Firestore transaction fixture and mounted editor tests mock authenticated services; they do not prove production Firestore, live worker or GPU behavior.

No renderer feature, Cam Combiner behavior, deployment or production media job is included in this change.
