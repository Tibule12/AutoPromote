# TODO: Fix Upload Button Not Uploading Content

## Completed Steps
- [x] Update backend schema in src/contentRoutes.js: make url conditional (required for video/image, optional for text), add articleText field.
- [x] Change frontend type 'article' to 'text' in ContentUploadForm.js.
- [x] Update all conditions in ContentUploadForm.js from 'article' to 'text'.
- [x] Fix App.js handleContentUpload: add url to destructuring, rename variable to finalUrl, remove duplicate upload logic, use finalUrl for payload.url.

## Next Steps
- [ ] Test upload functionality: critical-path testing (verify POST /api/content/upload returns 201 for text and video types, content appears in /api/content/my-content).
