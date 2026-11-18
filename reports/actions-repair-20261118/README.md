# Playwright media setup repair — 18 November 2026

The main Playwright run44269803483 failed twice before browser tests started: the five-minute live-media prerequisite step stalled while apt downloaded87 FFmpeg packages (62.8MB). The preceding PR run passed, so the failure was a runner dependency-download problem.

The workflow now prepares FFmpeg and FFprobe from the existing integrity-locked npm dependencies. It copies both binaries into owned runner scratch, restores executable permissions without changing the package installation, verifies both programs and exports PATH/explicit tool paths through the standard Actions files. No apt request, sudo, timeout increase, test skip or production-code change is used.

The actual media regression passes in under one second: prepare tools, preserve pre-existing PATH entries, encode H.264 with audible AAC, inspect both streams and decode the complete file in a subsequent-step environment. A separate actual VP8/WebM encode and YAML/Bash syntax checks pass. Fresh GitHub Playwright verification follows this checkpoint.

PR532 remains deployed at60afc20b on the public frontend and both API hosts; the retired Wolf Hunt endpoint returns410. Director model planning remains separately unverified. Formal Studio counts stay17 FUNCTIONAL/9 PARTIAL/1 BROKEN/2 UNIMPLEMENTED/0 PRO/0 PRODUCTION; typography13/16 and shared S02/S04/S03 are unchanged. This CI setup repair adds no creative, render-parity or production qualification.
