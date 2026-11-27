# Avoid repeated retention dependency reads

The first live cost release removed repeated content writes and their four-way
Function fan-out, but a full maintenance cycle still read nearly as many
historical dependency documents. Fewer query requests alone did not establish
lower Firestore document consumption.

Keep a bounded, process-local cache of decisions that retain publishing media.
For unchanged content, subsequent cycles can skip historical post/task/schedule/
transform reads for up to one hour. Content changes invalidate the entry; known
future 24-hour publication deadlines expire it at that deadline. Dry runs always
refresh. Incomplete scans and errors are never cached. Memory is bounded to
2,000 entries with content hashes instead of copies of full content documents.

This cache never grants permission to delete. Eligible operations retain the
existing fresh transactional dependency checks, shared-reference checks,
owner/type verification and generation preconditions. Dependency-only changes
may postpone cleanup by at most an hour. They cannot accelerate deletion.
Publishing, scheduling, source retention, financial accounting and creative
processing do not consult this cache. No new listeners or persistent writes.

Five real-Firestore-emulator cases cover six maintenance cycles, content
invalidation, dependency-only changes, one-hour expiry, exact publication
expiry, uncached dry runs and truncated scans. Evidence is retained in
`reports/free-first-release-20261127/retention-cache-local.json` in the feature
worktree. Production savings need a cold and warm cycle on the serving revision;
the local result is not an invoice reduction.

No subscription migration, price, numerical allowance, worker, infrastructure
plan, PayPal activation or registry deletion is included. Existing Studio
classifications, typography failures, S02/S04/S03 and creative approval remain.
