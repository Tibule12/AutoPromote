What changed to the Upload UI

Summary
- Added live preview for selected files (images and videos) on the upload page and in the dashboard upload panel.
- Added basic editing controls: rotate, flip, and trim (start/end) for video.
- Added "Templates" to pre-fill title/description/hashtag suggestions for common platform formats (TikTok, Instagram Story, YouTube, etc).
- Metadata (trimStart, trimEnd, rotate, flipH, flipV, template) is now sent under `meta` to the upload endpoint.
 - Metadata (trimStart, trimEnd, rotate, flipH, flipV, crop, template, duration) is now sent under `meta` to the upload endpoint. Audio uploads are now supported.
- Backend now accepts a `meta` object for content upload and stores it on the content document.
 - Backend now accepts a `meta` object for content upload and stores it on the content document. Server-side FFmpeg transform worker will process `media_transform` tasks when `meta` includes transform instructions and will store `processedUrl` on the content once done.
 - New "cute" schedule card view in the Dashboard: Schedules now render as stylized cards with rounded thumbnails, platform badges, sparkling emoji, and easy action buttons (Pause, Resume, Reschedule, Delete).

Notes & Next Steps
- Trimming is currently a client-side driven metadata flag only. The backend stores `meta` and can implement server-side trimming during processing (e.g., video trimming via FFmpeg) in future.
 - Trimming is currently a client-side driven metadata flag only. The backend stores `meta` and can implement server-side trimming during processing (e.g., video trimming via FFmpeg) in future.
- Image cropping is not included yet; only rotate/flip transformations are recorded in metadata. If you want to support cropping, we can add a client-side cropping UI (e.g., react-image-crop) and server-side processing.
- Templates are lightweight; they prefill title/description only. We can extend templates to add overlays, watermark, or hashtags per platform.
 - Templates are lightweight; they prefill title/description only. We can extend templates to add overlays, watermark, or hashtags per platform.
 - Spotify:
	 - Added Spotify track search & selection in the Dashboard upload panel (search, add tracks, create playlist, add tracks to playlist).
	 - Added backend search route: `GET /api/spotify/search`.
	 - Added backend playlist creation endpoint: `POST /api/spotify/playlists` and add tracks endpoint: `POST /api/spotify/playlists/:id/tracks`.
	 - Added frontend state and track selection: selected tracks are passed in upload payload as `platform_options.spotify.trackUris`.
 - Pinterest:
	 - Platform toggles and per-platform options are available in the inline `ContentUploadForm` now:
		 - You can select platforms using the checkboxes and provide per-platform options such as `discord.channelId`, `telegram.chatId`, `reddit.subreddit`, `linkedin.companyId`, or custom `twitter.message` in the Advanced section.
		 - These settings are included in the `platform_options` object submitted with the content upload and are validated by the backend.
	 - Added field to choose Pinterest board and pin note in both the dashboard and the upload form. This is sent in `platform_options.pinterest`.

Technical Details
- Frontend changes in `frontend/src/ContentUploadForm.js` and `frontend/src/UserDashboard_full.js` add preview and edit controls.
- CSS changes in `frontend/src/ContentUploadForm.css` and `frontend/src/UserDashboard.css` style the preview and control items.
- Backend changes in `src/contentRoutes.js` add `meta: Joi.object().optional()` to the upload schema and stores the `meta` object in the content record in Firestore.
 - Server requirements: transforms require `ffmpeg` installed and available on PATH for the worker to execute. Ensure the deployment environment has ffmpeg.

How to use
- Upload page: select a file, choose a template (optional), apply edit operations, then "Preview Content" to generate platform previews or "Upload Content" to publish.
- Dashboard: select a file, pick platforms, adjust metadata, and click "Upload" to schedule or post to connected platforms.

If you'd like, I can now:
- Add server-side trimming (FFmpeg) using the `meta` object.
- Add a cropping UI for images.
- Add template overlay previews (e.g., aspect ratio frames).

Thanks — let me know which next steps you'd prefer!
