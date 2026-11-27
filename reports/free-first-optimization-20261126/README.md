27 November release continuation: [actual independent production deployment and remaining Free/Plus gates](../free-first-release-20261127/README.md). Earlier no-deployment statements below describe their original sessions.

27 November continuation: [implemented infrastructure waste reductions and measured local evidence](../free-first-waste-20261126/README.md). The observations/estimates below retain their original scope; production savings have not been measured.

# Free-first processing and operating-cost continuation — 26 November 2026

Implemented on `feat/free-first-subscriptions-20261126`. Free/Plus retain the same creative capabilities and USD pricing. Numerical allowances remain provisional. All new creative executions were offline/local. No deployment, paid cloud processing, PayPal plan activation, real balance modification, new schedule or provider publication occurred.

The expanded [operating-environment audit](OPERATING-ENVIRONMENT.md) covers hosting, database/auth/hosting/functions, storage, Cloud Run/Tasks/Scheduler, builds/registry, observability, AI, email, payments and other dependencies. Its population forecast counts operation expenses once, separately from account and control-plane overhead.

## Implemented changes

- Finder preserves original source bytes during ingest and generates the existing analysis proxy directly. It no longer performs a full-size CFR encode immediately before the proxy. Final exports use original-quality media.
- Transcription reuses exact successful results keyed by media bytes, options, model/environment and implementation revision. The private disk cache has single-flight locking, TTL, size limits and atomic writes. Cold transcription uses the same pinned production model/int8 settings, with explicit CPU thread limits.
- The native compositor fuses only the exact neutral finish into its existing final pass, before titles. Active grades, masks, effects and unsupported combinations retain the existing path. This removes one lossy intermediate encode without reducing resolution, frame rate or encoder quality.
- Subject/background previews reuse the same owner's identical live/completed work across request IDs. Source generation, scene, model and replacement assets invalidate reuse. Queued/uncertain requests never redispatch just because a response was lost.
- Opt-in `MEDIA_WORKER_ROUTING_POLICY=cost-aware-v1` selects the existing CPU renderer for bounded short simple edits and manual two-source Cam work across every plan. Unknown/heavier combinations retain their existing route. This flag is not enabled or deployed.
- Unreserved analysis, story planning, model/3D/VFX, transforms and publishing dispatches are refused when renewable enforcement is enabled. Analysis/Cloud Run Jobs do not automatically submit a second paid attempt under that mode. Direct Python external-provider calls are refused until a bounded provider adapter exists.
- The signed local adapter serializes dispatch preparation, immediately releases known pre-credential refusals, accepts signed no-dispatch termination, and settles owned native cache reuse without a second charge. Existing failure expense and legacy wallet history survive.
- Account/allowance/connection polling no longer renews cross-host optional background demand. Queue deadlines, retry cooldowns and scheduled work remain governed by authoritative queue state, including when no user is present.
- Functions packaging now includes nine canonical shared creative dependencies and five model/template schemas/registries. Seven actual dispatcher modules import successfully from the generated package; lazy export checks alone missed these omissions.

## Completed outputs and measured resources

| Workflow | Finished artifact | Local wall / CPU seconds | Sampled process-tree peak RSS |
| --- | --- | ---: | ---: |
| 60s basic 1920×1080 edit/export | [MP4](studio60-cpu2/artifact-0.mp4) | 94.97 / 149.12, CPU affinity 2 | 411 MiB |
| 60s full-model multilingual captions | [SRT](captions60-sa-cpu2/generated-captions.srt), [VTT](captions60-sa-cpu2/generated-captions.vtt), [word times](captions60-sa-cpu2/result.json) | 144.42 / 245.41, affinity 2 | 1,553 MiB |
| Find moments in 184.27s real footage and export one 44.97s moment | [MP4](finder180-cpu4/artifact-0.mp4), [analysis](finder180-cpu4/result.json) | 295.36 / 852.97, affinity 4 | 1,894 MiB |
| 60s two-stream Cam edit plus external audio, full 1920 CFR inputs | [MP4](cam60-cpu4-matched-before/artifact-0.mp4), [sync/quality receipt](cam60-cpu4-matched-before/result.json) | 215.91 / 561.62, affinity 4 | 568 MiB |
| 60s beat-echo visual effect and keyed-title motion | [MP4](effects60-cpu4/artifact-0.mp4), [receipt](effects60-cpu4/result.json) | 295.71 / 763.59, affinity 4 | 931 MiB |
| Normal signed-in Studio: upload, title, Undo/Redo, save, cold reopen, native 60s export | [MP4](actual-studio60-verified/studio-free-output.mp4), [browser evidence](actual-studio60-verified/browser-evidence.json) | 189.62 / 417.04 | Largest process 740 MiB; aggregate not sampled |

All movies have independent full FFmpeg decode/probe/hash evidence adjacent to them. The signed-in final is 1080×1920, 1,800 frames, H264/AAC, SHA256 `632606ea5293c2e14e8dda2ef52b504585213c50d05cb41fe0e5f1fe4c441931`. Complete headless/muted authoring recordings and [finished 60s browser playback](actual-studio60-verified/finished-playback.json) are retained. Editing stayed at 100 processing tokens; successful export left 76; the legacy wallet remained 20. The 24-token deduction is a local CPU-time reference, not an all-in cloud price.

The Finder input is an actual 184s excerpt from a 34-minute source, not a full-episode throughput qualification. Cam uses two different crops/streams derived from one real recording and the corresponding external WAV. It proves a real two-input/manual-cut/external-audio pipeline, not independently captured cameras, nonzero drift or automatic speaker/reaction placement. Captions contain 173 generated words and 25 usable subtitle cues; language accuracy has not received creator review. The effects movie is a canonical worker replay of the saved native request, not an additional signed-in effects-authoring qualification. No technical pass confers creative approval or repairs historical S02/S04/S03/typography limits.

## Savings actually measured locally

- Finder preparation: 102.15→53.52s wall (**47.6% reduction**) and 181.07→87.60 CPU-s (**51.6% reduction**), same real source and proxy workflow.
- Matched neutral-finish comparison: 134.50→127.20s wall (**5.4%**) and 422.13→378.71 CPU-s (**10.3%**). Both complete movies decode; settings are unchanged. See [the comparison](neutral-finish-comparison.json).
- Exact caption repeat: 0.229s rather than another 144s cold workflow, with identical words and timestamps. This is inference reuse, not a measured cloud discount or full cold-run speedup.
- A proposed Cam black-canvas optimization was **rejected and reverted**: matched wall time was 230.14s versus 215.91s for the retained compositor. Its movies and experiment evidence remain; no savings are credited.

## Cam Combiner resource conclusion

The observed full RTX PRO 6000 deployment's 20 vCPU/80 GiB allocation is the provider minimum for that accelerator, not evidence that sync, analysis, compositing or encoding each require it. L4 supports 4 vCPU/16 GiB; its reference minimum-shape rate is $0.0002907/s versus RTX's $0.00088522/s, about 67.2% lower **only at equal runtime**. Break-even is approximately 3.05× RTX execution time. Neither GPU profile was benchmarked or provisioned by this work. [GPU requirements](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu?hl=en), [rates](https://cloud.google.com/run/pricing).

The retained full-quality CPU Cam output finishes in about 216s with 4-core affinity and under 0.6 GiB sampled tree RSS. A 4-vCPU/4-GiB worker is a candidate for this bounded manual workflow. Analysis/proxy/sync can be separate CPU stages; ASR/diarization/model inference and final rendering need their own profiles and durable reusable results. Existing sync, drift, source-clock, reaction and output gates are retained. Independent cameras, automatic speaker/reaction selection, long programmes, hardware encode parity and cold-start tails remain qualification requirements. The production four-hour Cam timeout was not shortened.

## Conditional usage economics

The [JSON](workflow-economics.json) and [CSV](workflow-economics.csv) record current GPU **reference estimates**, smaller CPU candidates, measured local resources, token recommendations, reservation-aware capacity, rolling ceilings and percentage reductions. GPU runtime assumes 4× CPU speed plus 30s startup; it is not measured. CPU estimates use measured local wall time plus assumed 10s startup. Minimum job billing, modeled storage, database overhead, GCS transfer and a possible Render outbound leg are included. Direct owned GCS delivery is also priced separately. No operation has an attributed cloud invoice; actual new cloud expenditure was zero.

| Completed workflow | Current GPU scenario / optimized CPU USD | Proposed tokens / reservation | Free per six days | Plus per renewal / rolling 30d | Modeled reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| 60s basic native worker export | $0.0639 / $0.0154 | 20 / 30 | 4 | 24 / 99 | 75.8% |
| 60s multilingual word-timed captions | $0.0590 / $0.0073 | 10 / 30 | 8 | 48 / 198 | 87.6% |
| 184s Find Viral Clips + 45s export | $0.1081 / $0.0298 | 38 / 70 | 1 | 12 / 51 | 72.4% |
| 60s two-stream Cam edit + external audio | $0.0958 / $0.0395 | 50 / 60 | 1 | 9 / 39 | 58.7% |
| 60s visual effect + keyed title motion | $0.0989 / $0.0314 | 40 / 70 | 1 | 11 / 49 | 68.3% |
| Actual signed-in 60s title/edit/save/reopen/export | $0.0760 / $0.0250 | 32 / 32 | 3 | 15 / 62 | 67.1% |


Capacity is conditional on proposed tariffs and fresh reservation/rolling headroom. These are not production entitlements: only the bounded native local adapter has the signed-in renewable-accounting proof. Existing captions/Finder/Cam/FX production quotes and adapters are not yet qualified for these durations. The 120s native attempt failed; a 240s signed bound completed the normal 60s title export. The effects example took 296s and needs a distinct bounded quote/runtime profile. Increasing a timeout alone is not qualification.

The 100-token Free window can support useful bounded short workflows under these estimates, but it does not establish affordability for unrestricted creative combinations. The 2,000-token Plus rolling ceiling allows only a few fully spent 500-token daily windows in a month. It cannot promise 500 tokens every day for 30 days. Keep both limits provisional until mixed-workflow demand, delivery bytes, failures and production adapters are validated.

[Publisher/Scheduler estimates](publisher-scheduler-estimate.json) reuse the completed movie for six destinations, with no six repeated renders. Current two-leg transfer sensitivity is about $0.045 plus the separate creation/export cost; a same-region bounded publisher candidate is about $0.022. These are proposals, not measured publications or proven savings. Publisher CPU already paid through fixed Render hosting is not charged again as incremental server rent. External publication, provider receipts, resource measurements and complete Free/Plus publishing capacity remain unverified. `AGENTS.md` requires owner approval of the exact final film/thumbnail before releasing held material; no such approval is inferred from this engineering audit.

## Regression evidence and remaining gates

- 46 renewable-accounting/security/storage/native/economics cases, 133 dispatcher/idle cases, 178 Python worker cases, 14 existing unified-wallet integration cases and 17 knowledge cases pass. Existing first-turn frontend build/29 backend/12 frontend cases remain documented separately. No frontend application code was changed in this continuation; generated help reflects the new qualification limits.
- [Migration additions](MIGRATION.md) describe remaining integration/bypass paths, reconciliation and rollout/rollback requirements. [Operating audit](OPERATING-ENVIRONMENT.md) separates observed quantities, historical receipts and reference estimates.
- First-use background segmentation/replacement and Blender/3D economics remain unqualified beyond prior historical evidence and this reuse/dispatch work. Do not publish zero-cost/Free-capacity claims for them.
- Source-level packaged imports and local regression are not production adapter/host-loss/GPU/storage/egress or six-provider publication qualification. Renewables, routing and new prices/allowances remain off/provisional until those gates are met.

Reproduce with `scripts/free-first-workload.py`, `node scripts/free-first-workflow-economics.cjs`, `node scripts/free-first-current-operating-reference.cjs`, `node scripts/free-first-operating-economics.cjs` and `node scripts/test-free-first.cjs`. Model/cache dependencies must already exist locally; the workload harness blocks external network/model downloads.

The four actual App processing jobs and their four local bindings are settled. Earlier failed attempts retained roughly 30 tokens of platform expense; the successful export added 24. No unsettled run was discarded. A [private checkpoint](local-checkpoint.json) retains 28 emulator documents, two emulator users, Storage and signed-worker evidence before closing this session's owned local services. Complete fresh-emulator replay is not independently qualified. Original workstation services/builds and prior creative evidence remain untouched.

Final check logs: [financial/native](free-first-regression-final.log), [dispatcher/idle](dispatcher-and-idle-regression-final.log), [worker](worker-regression-final.log), [legacy wallet](unified-regression-final.log), [knowledge](knowledge-tests-final.log), [packaged dispatcher imports](functions-creative-imports-final.log), [Functions export surface](functions-exports-final.log), [record contract](studio-contract-final.log), [preflight](preflight-final.log). Known taxonomy warnings in the knowledge check are retained and do not imply feature promotion.
