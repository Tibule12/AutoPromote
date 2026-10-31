# Google source workflow and cost review

Checked 30 October 2026. Estimates in USD; actual invoice, taxes, storage, egress and AutoPromote credit charges are separate. No full-length generation is authorized or started.

## Actual integration

The repository has a private Google Cloud REST source-generation helper at `scripts/creative-templates/human-video-test.py`; its earlier successful output was one eight-second Veo 3.1 Fast 720p take. This is not a released Studio Google-presenter button. This project uses the same Google Cloud publisher-model endpoint and ordinary Studio upload afterward. No other source provider or external animation editor is substituted.

Selected model: `veo-3.1-fast-generate-001`, `us-central1`, native audio, 1080p, 16:9, 24fps, eight seconds, one output per request. Google documents 4/6/8-second clips, image/reference support and no audio input for this model. Reference/first-frame continuity is a pilot hypothesis; it does not guarantee the same voice or a ten-minute acting performance. The old Gemini API preview model IDs were shut down on 22 October 2026; this workflow uses the Google Cloud GA model instead. [Model specifications](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate), [reference-image API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references), [Gemini API migration notice](https://ai.google.dev/gemini-api/docs/video).

Authenticated read-only checks confirm the existing project's AI Platform API and billing are enabled. Two-page Service Usage quota inspection finds the specific Fast model's effective `us-central1` long-running generation quota at **50 requests/minute**; that is a rate ceiling, not guaranteed availability, a free allowance or permission to spend. No API, billing, quota, IAM, GPU instance or production setting was changed. Each fresh accepted pilot operation supplies additional evidence of actual model access. See `google-preflight.json`; the initial v1 quota endpoint failed, and the correct v1beta1 read is retained separately as the successful result.

## Bounded pilot

The user's request to begin a first low-cost source/preview is implemented as **at most two eight-second generations**, with estimated total generation allowance **$1.92**. Each take has one durable request journal; an uncertain submission cannot be retried, and polling only resumes its original operation. A is reviewed before B. No third take, automatic rejection loop, model fallback or full-production submission is permitted by the pilot runner.

Take A returned the exact opening, 1080p/24fps, eight seconds/192 frames. Take B's reference-based request was **filtered by Google**, with no usable video and an explicit provider statement that blocked videos are not charged (support code 15236754). No automatic retry or third take occurred. Estimated charge for A is $0.96; the invoice is unknown. The attempted-spend ceiling was $1.92, not the asserted actual charge.

There is no 16-second concatenation. The eight-second native clock study is **condensed**: clock graphics appear beside the opening line, which does not yet mention the clock. The full script's clock sequence is planned near 00:22. This study cannot qualify narration-to-reveal alignment, the complete opening minute or cross-take face/voice continuity. Google supplies only raw presenter picture and dialogue. AutoPromote supplies the added graphic motion, placement and final composition. Source A's off-axis gaze and incidental microphone branding remain visible quality deviations; no new source is creatively approved.

## Planning estimates

Current published Fast audio/video rates are $0.10 at 720p and $0.12 at 1080p; standard Veo 3.1 audio/video is $0.40 at 1080p. The current pricing table labels units “count”; this estimate treats generated output seconds as the billable count, consistent with Google's video-second throughput definitions and the retained prior project estimate. Actual charged units and invoice have not yet been reconciled. [Published rates](https://cloud.google.com/model-garden/pricing), [video-second definitions](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/provisioned-throughput/supported-models).

| Scope | Generated seconds | Fast 1080p estimate | Standard 1080p estimate |
|---|---:|---:|---:|
| One eight-second source take | 8 | $0.96 | $3.20 |
| Two-take pilot ceiling | 16 | $1.92 | Not proposed |
| Minimum 75 accepted eight-second takes | 600 | $72.00 | $240.00 |
| Suggested initial full-production ceiling: 100 takes | 800 | $96.00 | $320.00 |
| Scenario: two attempts per accepted take | 1,200 | $144.00 | $480.00 |

The $96 proposal would be an **additional generation ceiling**, plus the pilot's estimated $1.92. At 75% usable yield it provides 600 accepted seconds; neither yield nor completion inside that ceiling is guaranteed. Sentence handles, pauses, discarded footage and rejects consume the budget. A request that returns unusable video may still be billable. Do not equate a budget with approval or a target duration with already generated footage. Stop at the agreed ceiling and report remaining gaps; do not silently extend it. Pilot quality must be reviewed before recommending any full-length purchase.

Studio credit/entitlement preflight remains authoritative for actual exports. The local worker advertises 1,800 seconds, 750MB/file and one-job concurrency; these limits do not prove ten-minute project performance. No credit grant, subscription change, render-limit override, GPU purchase or deployment is part of this task. Exact full-render costs and latency require a normal estimate from the accepted project and are currently unknown. Local CPU previews use existing infrastructure, with existing render accounting preserved.

## Presenter and speech continuity

The selected original character description and exact prompts are in `generate-pilot.py`. The static first-take reference, source hashes and independent word timings are retained. No real identity or real voice clone is used. Review face, hair, clothing, microphone, background, camera, gaze and voice at every join; reject rather than conceal discontinuities with unrelated B-roll. Preserve source audio with Studio voice repair disabled for this pilot.

Google TTS can generate directed narration, but no already-qualified Google TTS-to-Veo audio-conditioned lip-sync integration was found in this project. A TTS master cannot simply replace generated speech while retaining an accurate mouth performance. Prefer Veo native dialogue for the small pilot; do not claim a locked narrator voice across 75 clips. Broad reference continuity, long-form acting, exact pronunciation, no incidental music, natural gestures, direct-camera gaze and perceptual lip sync remain review gates.

## Full production after approval

1. Review actual raw takes, native motion movie, matched timeline recording and capability gaps. Accept or reject character, voice, gaze and visual language explicitly.
2. Freeze the approved reference and model/settings; approve an additional dollar ceiling and a maximum take count. Do not buy throughput or change quotas.
3. Divide the 1,250–1,450-word script into phrase-safe takes using the pilot's measured pace. Retain silence and source handles. Generate sequentially with per-take journals, word alignment and continuity review. Stop on a repeated identity/voice failure.
4. Import accepted sources through normal Studio media controls. Assemble a 600-second raw performance in the canonical graph. Measure exact spoken anchors before authoring the six full sequences.
5. Keep the complete graphic project within 128 layers / 32 groups / 8,192 imported property keys; use a planned budget of no more than 112 layers and 6,000 keys. Use native composition and supported controls. Genuine 3D/motion tracking/blur remain optional unqualified scope until the corresponding real workflow passes.
6. Save, cold reopen, back up and independently restore. Render a native draft, review every join/reveal and the near-bare human-cost chapter. Obtain ordinary export estimate and authorization if additional paid execution is required.
7. Render the native full final, decode every frame/audio sample, inspect chapter/cue boundaries and end frames, listen through, compare raw versus edited from the same sources, and record complete matching Studio playback with editable timeline. Deliver the separate movie and native project. Technical checks do not replace the owner's creative review.

No full-production runner has been written or invoked. The pilot runner cannot generate more than its A/B slots.
