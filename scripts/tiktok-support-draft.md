TikTok Support Request — FILE_UPLOAD chunk_size behavior

## Summary

We are integrating TikTok Content Posting API (v2) and observe inconsistent behavior when initializing FILE_UPLOAD for certain video sizes.

## Reproduction

- Example content doc: contentId GxEE26J1YSKYj7OZ0I1Y (created during CI on branch e2e/tiktok-pull)
- Video URL: https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
- Video size observed: 158,008,374 bytes
- Access token: server-side valid token for uid bf04dPKELvVMivWoUyLsAVyw2sg2

## What we see

- When init payload uses chunk_size=video_size (single chunk), TikTok returns 400 invalid_params ("The chunk size is invalid").
- When init payload uses chunk_size candidates in [1MB..64MB], many sizes return 400 invalid_params ("chunk size invalid") or 400 ("total chunk count is invalid").
- Using a deterministic probe relying on the Media Transfer Guide rules, we discovered chunk_size=5,242,880 (5MB) returns 200 OK with upload_url (publish_id v_pub_file~v2-... upload_url=https://open-upload-va.tiktokapis.com/...upload_id=7599763861918500876...). This candidate produced total_chunks=30 and a merged final chunk.

## Files / captures attached

- `tmp/tiktok-chunk-probes/` — probe captures for tested chunk_size candidates. Contains per-candidate request.json, response.txt, meta.json
- `tmp/tiktok-chunk-captures/` — captured init failures from CI runs (meta.json with request and response body)
- Representative CI runs (artifact URLs):
  - https://github.com/Tibule12/AutoPromote/actions/runs/21371688034/artifacts/5262294819
  - https://github.com/Tibule12/AutoPromote/actions/runs/21371211694/artifacts/5262095958

## Questions

1. Could you confirm the precise server-side validation rules for `chunk_size` and `total_chunk_count`? We implemented the rules from your Media Transfer Guide but encountered "invalid_params" and "total chunk count is invalid" for many reasonable candidates.
2. For files where leftover < 5MB, we assume the final chunk is merged into the last regular chunk (final chunk can be up to 128MB). Is this correct and are there constraints on "merged last chunk" other than <=128MB?
3. Are there additional undocumented constraints (e.g., specific allowed chunk_size granularities or maximum allowed total_chunks for certain accounts)?
4. Is there a recommended algorithm you prefer to compute the `chunk_size`/`total_chunk_count` deterministically to avoid trial-and-error/init failures?

## Steps we took

- Implemented server-side probe and capture tooling; tried candidates in 1MB increments between 5MB and 64MB.
- Implemented fallback to use the discovered candidate (5MB) and now attempt upload init with computed candidates before trying other fallbacks.

## Request

Please advise on the authoritative validation rules and any guidance to ensure our FILE_UPLOAD flow initializes successfully for arbitrary video sizes up to 4GB.

Thanks,
AutoPromote Engineering
