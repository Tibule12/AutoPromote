# Promotion Schedule Collection Checklist

## Current Status

- ✅ `users` collection exists
- ✅ `content` collection exists
- ✅ `analytics` collection exists
- ⚠️ `promotion_schedules` collection must be provisioned in Firestore for scheduling to work

## Steps to Fix

### 1. Create the Collection in Firestore

1. Open the Firebase console → Firestore Database → Data
2. Add a new collection named `promotion_schedules`
3. Insert a placeholder document (can be deleted later) with the following fields to bootstrap indexes:
   - `contentId` (string)
   - `platform` (string)
   - `scheduleType` (string, e.g. `specific` or `recurring`)
   - `startTime` (timestamp)
   - `isActive` (boolean)
   - `budget` (number)
   - `targetMetrics` (map)

### 2. Deploy the Matching Indexes

If you have not yet deployed Firestore indexes, run:

```bash
firebase deploy --only firestore:indexes
```

Confirm that `firestore.indexes.json` contains composite indexes for `promotion_schedules` on `contentId`, `isActive`, and `startTime`. Add them if missing.

### 3. Verification Steps

```bash
# Smoke test Firestore connectivity
node validate-firebase-setup.js

# Start the server and watch logs for scheduling errors
npm start
```

Expected results:

- ✅ Validation script confirms Firestore access
- ✅ Server boots without `promotion_schedules` errors
- ✅ Scheduling endpoints return data

### 4. Troubleshooting

1. Confirm the service account in `.env` has read/write access to Firestore
2. Ensure security rules allow the backend service account to access `promotion_schedules`
3. If queries fail, review the Firestore profiler to confirm indexes are in place

## Next Steps After Fix

1. Run promotion scheduling tests (`test/test-promotion-service.js`)
2. Exercise the frontend scheduling UI
3. Monitor Firestore for new documents created by automation
