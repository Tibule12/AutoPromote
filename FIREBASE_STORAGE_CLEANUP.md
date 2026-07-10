# Firebase Storage Lifecycle Management

To prevent excessive billing for storage, we must ensure temporary files are deleted automatically.

## 1. VideoEditor Temporary Uploads

- **Path:** `temp_uploads/{userId}/*`
- **Action:** These files are deleted immediately by the frontend client after successful processing.
- **Safety Net:** Configure a Lifecycle Rule to delete files older than 1 day in `temp_uploads` folder.

## 2. Clip Studio Temporary Sources

- **Path:** `temp_sources/{userId}/*`
- **Action:** These files persist during the analysis session.
- **Policy:** Configure Lifecycle Rule to delete files older than 1 day.

## 3. Cam Combiner Media

- **Original ingest:** `temp/multicam-ingest/{userId}/*`, retained for 72 hours so a failed job can retry without another multi-gigabyte upload.
- **Sync artifacts:** `temp/multicam-clean-sync*`, retained for at most 24 hours.
- **Deliverables:** `processed/multicam_*`, thumbnails, and manifests are retained for 7 days.
- **Upload model:** Originals are uploaded once with an authenticated resumable session. Preflight and rendering reuse the same object generation.
- **Safety:** Object creation timestamps in filenames are never treated as deletion deadlines. Only explicit object metadata or object age controls expiry.

## 4. Generated Clips & Edited Videos

- **Path:** `generated_clips/{userId}/*` and `edited_videos/{userId}/*`
- **Action:** User-owned assets.
- **Policy:**
  - Free Tier users: Auto-delete "edited_videos" after 30 days.
  - Keep "generated_clips" until further notice (smaller file size, high value).

## 5. Main Uploads

- **Path:** `uploads/{type}/*`
- **Action:** Primary source videos.
- **Policy:** App-managed retention, default 14 days.
  - The backend writes `sourceDeleteAfter` onto new content records.
  - Daily cleanup removes expired source uploads only when deletion is safe for history/repost flows.
  - Files that are still the only user-facing media URL are deferred instead of being hard-deleted by bucket lifecycle rules.

## Recommended `lifecycle.json` for Firebase Storage:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 1,
          "matchesPrefix": [
            "temp_uploads/",
            "temp_sources/",
            "temp_scans/",
            "temp/multicam/",
            "temp/multicam-clean-sync/",
            "temp/multicam-clean-sync-audio/"
          ]
        }
      },
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 3,
          "matchesPrefix": ["temp/multicam-ingest/"]
        }
      },
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 7,
          "matchesPrefix": [
            "processed/multicam_",
            "processed/thumbnails/multicam_",
            "processed/manifests/multicam_"
          ]
        }
      },
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 30,
          "matchesPrefix": ["edited_videos/"]
        }
      }
    ]
  }
}
```

## How to Apply

Run this command using gsutil:
`gsutil lifecycle set lifecycle.json gs://<your-bucket-name>`
