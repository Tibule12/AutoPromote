# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.1.0] - 2026-02-04

### Added

- **Native Reddit Video Support**: Implemented direct video uploads to Reddit via their AWS S3 lease mechanism. Now supports `kind: "video"` with thumbnail generation.
- **Immediate Publish Mode**: Updated content routes to auto-approve uploads for immediate publishing.
- **Debug Tools**: Added `uploadRedditMedia` checks and `video_poster_url` fallbacks.

### Fixed

- **YouTube Token Management**: Fixed nested token object structures ensuring reliable refresh token usage.
- **LinkedIn Integration**: Added OIDC profile fallback and improved buffer handling for media uploads.
- **S3 Upload Headers**: Fixed "Precondition Failed" errors by correctly ordering fields in `multipart/form-data` uploads.

- CI: Wait/poll for Playwright E2E reruns before blocking deploy; add better logging and timeout (see `ci(deploy)` commit).
