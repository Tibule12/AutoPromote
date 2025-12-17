## Summary

This PR contains the UI fix for the Upload form to widen the left column, raise drop-zone stacking order, and improve the video preview layout.

Includes:

- CSS changes in `frontend/src/ContentUploadForm.css` to:
  - Increase left column fraction on desktop
  - Reduce right column width and lower its z-index
  - Increase `.file-upload` z-index and min-width so drop-zone sits above adjacent controls
  - Add `aspect-ratio: 16/9` to preview and increase max-height
- Dev-tooling updates were made locally to pin `webpack-dev-server` to v4 so `react-scripts start` runs without schema errors, and the lockfile was updated accordingly.

---

## Build & Test Results

- `npm --prefix frontend run build` completed successfully (production build created, gzipped main JS 484kB).
- Local `npm start` and development server verified; hot-reload working.
- `npm audit` reports 3 moderate advisories (dev-only; webpack-dev-server). We considered `npm audit fix --force` but that produces broad breaking changes (react-scripts upgrade to 0.0.0) and was rejected; we preserved a stable dev build and recorded the advisories.

---

## Testing Checklist (please verify on PR preview/staging)

- [ ] Visual: Drop zone text "Drop files here or click to browse" is prominently above template selection.
- [ ] Visual: Selecting a video shows a wide horizontal preview (16:9) and the right column collapses while previewing.
- [ ] Behavioral: Upload an example video and verify upload flow completes successfully.
- [ ] Auth: Sanity-check login flows on preview/staging environment (use emulator or test account). Ensure no sign-in regressions.
- [ ] E2E: Run a quick smoke Playwright test (if available) against the preview environment.
- [ ] Security: Acknowledge the dev-only `webpack-dev-server` advisories and decide to track them (file a follow-up task if desired).

---

## Notes for Reviewers

- This change is primarily UI / CSS. The functional behavior remains unchanged aside from layout and preview sizing.
- I recommend running manual QA on staging before merging to main and deploying to production. If you'd like, I can also run the test-suite and/or open a preview deployment.

---

PR Author: GitHub Copilot
Branch: `pr/wide-upload-preview`
