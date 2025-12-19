TikTok Content Posting - Compliance Implementation Notes

Summary

This document shows how the app implements the TikTok Content Sharing Guidelines (Points 1–5) to satisfy review requirements.

1. Creator Info & Limits

- `ContentUploadForm` fetches `/api/tiktok/creator_info` when TikTok is selected.
- The UI displays "Posting as: <Nickname> (@handle)" when `creator_info` is available.
- If `creator_info.can_post === false`, publishing is blocked and a clear message is shown.
- The client enforces `max_video_post_duration_sec` before allowing Publish.

2. Metadata Inputs

- Title input is provided and editable.
- Privacy dropdown is populated from `creator_info.privacy_level_options` and has no default selection (placeholder "Select privacy").
- Interaction toggles for Comments/Duet/Stitch are present, OFF by default, and disabled when `creator_info` indicates.

3. Commercial Content Disclosure

- A top-level commercial disclosure checkbox is OFF by default.
- When enabled, two checkboxes appear: "Your Brand" and "Branded Content"; at least one must be selected.
- If "Branded Content" is selected, privacy cannot be set to "Only me"; the UI either disables that option or auto-switches to public and informs the user.
- The Publish button is disabled until the disclosure validation is satisfied.

4. Declarations & Consent

- The app displays the appropriate legal declaration text depending on commercial choices:
  - Music Usage Confirmation for normal posts / Your Brand
  - Branded Content Policy + Music Usage Confirmation when Branded Content is selected
- The user must explicitly check the consent checkbox before publishing to TikTok.

5. Preview & Explicit Consent

- The live preview is shown and the caption/title/hashtags are editable prior to publish.
- The app does not add promotional watermarks or overlays automatically; overlay text is flagged and prevented for TikTok uploads.
- The client will not send bytes to TikTok (or initiate publish) until the user checks the consent box and clicks Publish.

Post-publish UX

- After submitting, the UI informs the user processing can take a few minutes.
- The client polls the user's content list (`/api/content/my-content`) for the record with the upload's `idempotency_key` and surfaces processing/published state and links if available.

Notes for Review

- Screenshots to include for audit (in this order to match guideline):
  1. Creator info visible on Post page ("Posting as: ...").
  2. Privacy dropdown showing placeholder "Select privacy" and options populated from `creator_info`.
  3. Interaction toggles OFF by default and disabled when `creator_info` says so.
  4. Commercial disclosure OFF by default; after turning it on, the "Your Brand" and "Branded Content" options appear and the publish button is disabled until selection.
  5. Consent checkbox with the correct declaration text and disabled Publish until checked.
  6. Final preview screen showing editable title/description and processing message after publish.

If you want, I can also produce a short screen-recording (demo mode) that walks through these steps for submission. The app has a demo mode for TikTok uploads to allow building the recording without requiring `video.upload`/`video.publish` scopes.
