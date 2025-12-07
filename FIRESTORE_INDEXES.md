# Firestore Indexes & Latency Guide

Your logs show repeated warnings like:
```
[IDX][yt_task_select] Missing Firestore index. Create via console link: promotion_tasks: type ASC, status ASC, createdAt ASC
```

This means at least one query executed by the backend requires a composite index that Firestore does not yet have in a READY state.

## Why This Causes ~3–4s Latency
When Firestore encounters a query needing a composite index that doesn't exist:
1. It returns an error (if strict) OR (in development dashboards) a link to create the index.
2. After you create the index, Firestore must backfill it (seconds to minutes depending on data volume).
3. Until the index is built, affected queries fail or remain slow if they fall back or retry.

Your slow endpoints (3s+):
- `/api/users/progress`
- `/api/facebook/status`
- `/api/youtube/status`
- `/api/monetization/earnings/*`
- `/api/platform/status`
- `/api/twitter/connection/status`
- `/api/tiktok/status`

Some of these endpoints likely run promotion or content aggregation queries that touch `promotion_tasks` with multiple where/order clauses.

## Current Declared Indexes
See `firestore.indexes.json` which now includes (ASC + DESC variants to match queries ordering by createdAt desc):
```
promotion_tasks:
  content:
    - (approvalStatus ASC, approvedAt DESC)    # newly added
    - (approvalStatus ASC, rejectedAt DESC)    # newly added
  - (type ASC, status ASC, createdAt ASC)
  - (uid ASC, type ASC, createdAt ASC)
  - (type ASC, status ASC, createdAt DESC)   # newly added
  - (uid ASC, type ASC, createdAt DESC)      # newly added
```
The DESC variants are required because several queries order by `createdAt` descending while filtering on the preceding fields.
If you deployed BEFORE this file existed, your live Firestore project may still be missing them.

## How to Deploy Indexes
Using Firebase CLI:
```bash
firebase login
firebase use <your-project-id>
firebase firestore:indexes
# OR just deploy indexes only
firebase deploy --only firestore:indexes
```
The CLI will read `firestore.indexes.json` and ensure they exist.

Alternatively in Console:
1. Go to Firestore > Indexes > Composite.
2. Click 'Add Index'.
3. Fields:
   - Collection ID: `promotion_tasks`
   - Fields in order:
     1. `type` Asc
     2. `status` Asc
     3. `createdAt` Asc
4. Save and wait for build.

## Verify Build Status
Run:
```bash
firebase firestore:indexes
```
Look for `READY` state. Pending/backfilling indexes show `BUILDING`.

## After Index Build
- First query warms cache; subsequent identical queries should drop below ~150–250ms (network + Firestore).
- Combine with the existing 7s in-memory TTL caches to push median response toward <200ms on cache hit.

## Additional Recommended Indexes (Evaluate Usage)
If you commonly query by status only + createdAt order:
```
{ collectionGroup: "promotion_tasks", queryScope: "COLLECTION", fields: [
  { fieldPath: "status", order: "ASCENDING" },
  { fieldPath: "createdAt", order: "DESCENDING" }
] }
```
If you query by `uid + status + createdAt`:
```
{ collectionGroup: "promotion_tasks", queryScope: "COLLECTION", fields: [
  { fieldPath: "uid", order: "ASCENDING" },
  { fieldPath: "status", order: "ASCENDING" },
  { fieldPath: "createdAt", order: "DESCENDING" }
] }
```
Only add indexes you actually need—each one consumes storage and write I/O. Avoid combinatorial explosion; start from concrete query patterns.

## Profiling Checklist
- Enable `DEBUG_AUTH=true` only while diagnosing.
- Add a temporary log around each Firestore query measuring time (e.g. `console.time('promoQuery')`).
- Confirm whether latency is dominated by a single query or successive serial calls.

## Future Optimizations
1. **In-flight de-duplication**: Coalesce simultaneous identical status requests (store a Promise in a map until resolved).
2. **Batch status endpoint**: Provide `/api/status/aggregate` returning all platform statuses in one call to reduce parallel TCP + middleware overhead.
3. **External cache (Redis)** if horizontally scaling—current in-memory cache is per-instance.
4. **Warm query priming**: At startup, issue representative queries (already partially done) to load Firestore indexes into memory.
5. **Reduce per-request Firestore reads** in `/api/users/progress` by persisting periodically updated aggregates.

## Action Summary
- Deploy indexes (including new DESC composites) NOW (high impact).
- Wait for status = READY (watch console or CLI).
- Re-test latency on affected endpoints (/api/health?verbose=1 to confirm no FAILED_PRECONDITION).
- Then consider batching and in-flight de-duplication.

Questions or want scripts to benchmark latency automatically? Let me know.
