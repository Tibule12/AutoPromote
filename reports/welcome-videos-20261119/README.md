# Welcome video popup · 19 November 2026

The owner explicitly requested publishing the finished videos on the live welcome page and showing a popup to everyone opening the link. This instruction authorizes public copies and this frontend deployment; it supersedes the earlier private-review publication hold for these selected files. The rejected city/coast films and earlier soundtrack remain excluded.

The popup opens on every fresh welcome-page load, with the new AFTERIMAGE/Pulse native Studio film selected. A playlist offers the matching caption-free Studio walkthrough, Find Viral Clips, Publisher and Schedule tutorials. Browser-compatible muted autoplay has an explicit sound control. Native playback controls, Escape/backdrop/close, focus restoration, scrolling restoration and a persistent reopen button are provided. Selecting a different film replaces the single video element; the other four files are not preloaded.

Videos are immutable hash-named public copies in the existing Storage bucket, with exact selected SHA256/size/source attribution in [public-media.json](public-media.json). Each anonymous range request returns206/video/mp4 with the correct production-origin CORS. The existing welcome page, signup flow, pricing and authenticated Studio remain unchanged. Loading or watching the static media runs no models, workers, analysis or render jobs. Normal media transfer charges still apply.

Validation: three popup interaction tests and seven existing welcome-page tests pass. Strict production build and all19 historical welcome-asset checks pass. Production-origin browser checks cover the real public media, desktop/mobile layout, switching all five films, sound, Escape/reopen and reload behavior. Deployment/live verification is recorded separately after the release serves.

This is the owner's selected public demonstration, not whole-Studio PRO/production qualification or full predictive parity. Formal readiness counts and S02/S04/S03 remain unchanged. Five existing Queue holds and the original saved login are preserved; no social publishing or scheduling occurs.
