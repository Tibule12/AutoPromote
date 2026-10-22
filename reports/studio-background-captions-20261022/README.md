# Background replacement and automatic captions — 22 October 2026

Continuation of the retained 21 October tests. This feature branch isolates caption and subject/background changes from concurrent motion, audio and source-cache work. It is not merged or deployed.

Newly uploaded videos now preserve the server-verified source hash through intake, VideoEditor and the canonical Studio document. All Studio video uploads use the durable owned source path, including small files. This repairs a real fresh-upload failure where Create subject mask refused an otherwise saved source.

Caption generation replaces only the requested source’s track. Reviewed captions on other sources remain intact. If that source’s wording changes while transcription is pending, the late response is rejected and the user’s edit stays. Empty hints use no decoder prompt; speech-language selection, lossless extraction and nonblocking serialized inference are retained from the previous repair.

Later-frame keep/remove points now reach the immutable mask request and the existing CPU tracking session. The editable artifact and manifest preserve those exact points; fixed optional objects keep their independent tracking. Camera cuts still require separate source-bound selections in the local CPU worker. People are selected by default, additional objects are optional, and background replacement is opt-in.

The shared background stack includes source-verified uploads, owned immutable mask dependencies, native background upload/choice, final-alpha colour recovery, edge controls and conservative exact-source caching. Local CPU transport is explicit and production-disabled. The server rollout cohort remains required; this branch does not silently enable paid model execution or qualify all user videos.

The isolated integration branch passes 49 model-runtime cases, 53 backend cases, 58 renderer/cache/server cases, 58 focused frontend cases, 12 full-editor caption cases and 17 product-knowledge cases. Caption CPU cases and strict local builds pass. Eight anonymous viewport comparisons preserve the existing welcome content, and three real signed-in help questions return valid answers with no browser exceptions.

The real signed-in two-video test regenerates only the second source, retaining both reviewed first-source cues byte-for-byte. Its 13-second 1280×720 movie and complete matching editable-timeline recording are retained privately in the model-runtime worktree’s same-date report (`two-source-captioned/final.mp4` and `two-source-captioned/edited-in-studio.mp4`). Movie SHA-256: `7f3c224d76b08c50d6cd5038c90832943977026ac94c46b3404156ae8ec1e215`. This is an existing disclosed fictional generated presenter, with no new generation. Screen capture observes about 15.31 unique fps for a 24 fps movie; it does not qualify playback smoothness.

The fresh presenter test catches a real later-frame failure: click-only correction selects the head and drops the torso. That mask is explicitly rejected and retained. The worker now also passes the authored subject box; the native rerun with optional microphone and laptop is still under review. No clean-background claim is made from the first mask. The previous three podcast movies and full matching Studio recordings stay in the local 21 October report. Raw authenticated proof, sources and movies stay local. The model card describes Swivuriso as beta; float32 and voice-activity trials on the same mixed clip still produce uncertain wording, so no new automatic accuracy claim is made.

No paid GPU, provider generation, production deployment, main merge, publishing or readiness promotion. Mixed-language accuracy, arbitrary-footage naturalness, advanced caption retiming/styles and complete live preview/render parity remain open.
