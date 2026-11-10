# Reframe and Moments qualification continuation

**7 November: [approved release deployed and verified live](RELEASE_20261107.md)** at `ce82bb90`. The actual two-person project exports287 expected frames, plays its complete result and saves/reopens exactly. Main checks pass:2,366 tests (5 skipped),30 browser cases (17 skipped), CodeQL and the complete worker-image/candidate gate. One normal5-credit charge; no new grant. Prepared source dialogue remains off. The6 November local investigation below is preserved as history.

7 November release preflight: the owner authorised deployment. [PR #524](https://github.com/Tibule12/AutoPromote/pull/524) carries the existing checkpoint. Its initial strict frontend build rejected two mixed-operator lint warnings; explicit parentheses preserve the same expression semantics. The corrected strict production build passes with lint enabled, and the relevant source-frame/voice-bus/voiceover regressions pass **55 cases in three suites**. Full image/remote release gates and actual deployed verification are tracked separately; this preflight is not evidence of deployment. Source dialogue remains default-off.

The corrected application's first complete worker image and real render gate passes **159 tests**, and CodeQL reports no open alerts on the PR merge ref. CI's browser job then failed during installation because `ubuntu-latest` now resolves to unsupported Ubuntu26.04 for the locked Playwright1.59.1. The browser job is pinned to24.04; no test or assertion is skipped. The strict default-off build also passes native Play/Pause/cut-resume and advancing controls under fourfold CPU throttle. GET-only Rules capture records a pre-existing difference between deployed Firestore and repository team protections; Storage matches. This release publishes neither Rules source and must retain the exact live hashes. Security drift remains separate follow-up.

The first broad emulator run completed **2,358 passed /8 failed /5 skipped** in359 suites. Five failures were CPU reference tests importing the full HTTP/cloud service into the intentionally minimal Python runtime; three editor expectations still described the earlier exact seek/CSS presenter. The references now load the worker's actual function definitions/dependencies and execute real FFmpeg without booting web/cloud dependencies. Their **20 cases in three suites** pass inside the existing minimal, network-disabled, read-only dependency image with only fresh writable scratch space. The three corrected editor cases also pass (173 unrelated cases not rerun locally). Seek assertions retain the exact90kHz interior tick, and frame/export assertions retain the authored geometry. The first supported-runner browser run passed29, skipped17 and failed its same obsolete CSS-radius expectation; that assertion now checks the complete painted surface instead of clipping it again. Pixel/RMSE/geometry tolerances are unchanged. Full remote repeats remain separately tracked; none of these initial failures is reported as a passing run.

6 November 2026 · `qa/studio-controls-director-20261105` · **Local qualification milestone passed; production activation/retest remains pending.**

The unchanged Director-approved 12-second project now passes all twelve paused Live Edit/Finished Video picture comparisons at the original limits: RGB RMSE ≤4 and geometry p95 ≤2 CSS pixels. Worst measured values are **3.9873 RGB** and **0.8175 CSS pixels**. No fitted image/time alignment or tolerance change is used. The original failures remain retained. This qualifies these sampled paused frames, not every moving frame, edge, gamut, source or Studio combination.

## Completed and verified

- Repaired the fractional-cut/source-frame clock and global frame stepping. Normal Play → Pause → Resume and a seek immediately before a fractional cut → Play through it → Pause pass in the actual signed-in candidate.
- Fixed a CPU-load seek storm in the new prepared-dialogue path. Picture playback now uses the existing bounded rate correction instead of repeatedly seeking. Expensive moving-preview pixel work yields time to controls and adapts its raster; paused authoring and final export retain full resolution. Background editor updates yield to input without deferring explicit seeks.
- Under Chrome CPU throttle4, the actual scrubber and timeline advance through **74 distinct positions**, with no observed held-control interval. Maximum observation gap is333.5ms; maximum sampled decoder/control difference is135.6ms. This is a bounded local stress result, not a guarantee for arbitrary hardware/load. The earlier six-second seek-storm failure is preserved. A separate production baseline did not reproduce that same seek storm.
- The existing prepared voice bus plays all **576,000 programme sample frames exactly once**, from offset zero, with no gaps/duplicates and maximum error0.00002718 against prepared PCM. It shares canonical sequence/restoration/delivery helpers. Browser state, our signatures and local receipts prove no cloud/ad execution. Listening and full moving A/V review remain separate.
- Actual source pixels match the compiled programme before framing. The remaining picture divergence was in resizing. The bounded reviewed profile now explicitly specifies source/Director/frame resize filters; redundant intermediate compression is avoided within a512MiB raw YUV budget per intermediate. Larger/unreviewed work retains its previous profile. This is not an aggregate memory or invoice cap. Selected final quality is unchanged.
- Corrected full/limited-range RGB/YUV finish/frame conversion, neutral-grade rounding, selected Rec.709 metadata, and the shared paused presenter. No general HDR/P3 transform qualification is claimed.
- The current actual App saves, cold-reopens and recovers its exact canonical edit/framing, and normal signed-in product help opens. Anonymous welcome content/links/media remain unchanged at all eight checked viewports.

Current native movie: **`f24689ed1800320a9fe518243d50ccfe60e86ec29c44dca8d6146431d05b2dd7`**,720×1280,24fps,288 frames/12seconds. Canonical project hash remains **`b72c64955d1e6d756c1ee8e8a03fe0ad429a9ea882cf107e697381df8e6209c8`**. Movie, complete recordings, PCM, authenticated states, source capabilities and signing material remain private.

The resize investigation used the [Chromium sampling implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/cc/paint/paint_flags.cc) and [FFmpeg scaler documentation](https://www.ffmpeg.org/ffprobe-all.html#Scaler-Options) to identify differing filter families. It is an implementation inference validated against the actual native pictures, not a cross-browser standards guarantee. The earlier RGB-order experiment failed and was not adopted.

## Real two-person source and live boundary

The owner's normal live App uploaded a bounded licensed derivative of [cottonbro studio/Pexels7599936](https://www.pexels.com/video/women-on-a-soundproof-studio-7599936/) under the [Pexels license](https://www.pexels.com/license/). The production CPU detector returned24 keys per person/100% coverage. Tracking toggles, zoom, order, undo/redo and exact save/cold reopen passed. Detection establishes anchor proximity, not voice identity.

The initial live export failed on its unrepresented fractional tail and received its normal five-credit refund, returning the recorded balance to304. It remains a failed live export. The corrected **current canonical local renderer** now produces all287 intended frames at24fps from that exact request/source using the deployed FFmpeg runtime. This is real CPU processing, not a fixture receipt; it does not prove a new production worker execution. No additional credit grant was made.

## Current checks

| Verification | Result |
| --- | --- |
| Frontend clock/source/voice/picture helpers | **94 passed**,9 suites |
| Actual FFmpeg7.1.5 worker regressions, including camera layouts | **54 passed**,24 subtests |
| API preview, existing media routes, billing and payments | **68 passed**,6 suites; includes earlier25-case service subset |
| Matched API Node container regressions | **43 passed**,4 suites; subset of68 above |
| Actual preview API with fresh Auth/Firestore/Storage | **11 passed**, real emulator tokens and object bytes |
| Actual native paused picture pairs | **12/12 colour and geometry pass** |
| Native ordinary transport and fractional-cut resume | Passed |
| CPU-throttled actual-App controls and absolute PCM capture | Passed within the bounds above |
| Current native help, exact save/cold reopen | Passed |
| Anonymous current-build/baseline welcome comparisons | **8 passed**,0 browser errors |
| Stable-source isolated build, lint, syntax, whitespace | Passed |

Counts describe different scopes and are not added into one end-to-end total. Initial observer/setup failures, failed builds and rejected render experiments remain retained. Exact evidence and remaining gates are in the [sanitised checkpoint](evidence/checkpoint.json); [earlier local notes](EARLIER_LOCAL_CHECKPOINTS.md) preserve the investigation history.

## Runtime and authenticated API qualification

The API image was missing the Python media dependencies and its floating Alpine FFmpeg differed from the worker. The first candidate image's prepared mix failed the same-source comparison. The API now uses the measured Debian runtime family with Python/NumPy/Pillow, and both Dockerfiles explicitly pin FFmpeg7.1.5. A non-root, read-only, network-disabled dependency-image run (2CPU/512MiB/96PIDs) prepares the12-second audition in3.44seconds. **All576,000 decoded prepared sample frames match exactly**, with zero sample error against the accepted local preparation. The AAC final comparison remains about.9983/.9988 correlation and.073dB level difference at programme zero. This does not replace listening. The image smoke is not a complete production dependency-install/build/deployment test. Existing API JavaScript route/billing regressions also pass43 cases inside its Node22 runtime with dependencies mounted read-only.

A new [reproducible guarded HTTP check](../../scripts/studio-professional/check-preview-isolation.cjs) uses fresh loopback Auth, Firestore and Storage with the repaired Rules sources. It mounts the actual media router, actual auth middleware and actual CPU helpers. Eleven checks pass: missing authentication, unverified email, default-off flag, enabled-without-enrolment rejection, other owner, authorized generation-bound preparation, URL injection, changed digest, owned fractional source frame, replaced generation and cached ownership revocation. Test profiles, balances and subscription collections remain unchanged after requests. This is emulator verification, not production Auth cryptography/IAM proof. Initial Java17/watcher/credential configuration and rate-limiter observer failures are retained; the corrected run uses Java21, polling, real emulator clients and a declared request cap.

FFmpeg7 additionally exposed an incomplete EOF drain in the existing duck-gain audition. A bounded one-second causal tail and exact authored-sample trim fix it; the decoder must now return the complete finite sample count. All68 API/media/billing/payment regressions pass using that runtime. Earlier raw-video/image observers were also corrected to retain the encoder's passthrough picture clock instead of silently resampling their reference output.

[API boundary evidence](evidence/api-preview-boundary.json) · [runtime evidence](evidence/runtime-validation.json).

To reproduce the real route check, use an owned12-second source and its existing source-dialogue manifest; no credentials are needed:

```sh
CREDITS_JAVA_BIN=/path/to/java21/bin/java \
STUDIO_AUDIO_PREVIEW_PYTHON=/path/to/python-with-numpy-and-pillow \
STUDIO_QA_SOURCE_FILE=/absolute/path/source.mp4 \
STUDIO_QA_DIALOGUE_REQUEST=/absolute/path/source-dialogue-input.json \
node scripts/studio-professional/check-preview-isolation.cjs
```

Existing Node dependencies and cached official emulator jars are required. The script rewrites owner/project/storage identities into a fixed demo project, rejects non-loopback Node egress and shuts down only its own emulators. Its output names a private temporary evidence directory. It never loads the production environment file.

## Final account-gated build repeat

The final isolated build additionally gates the source-dialogue path to an explicit QA account list. Its three cut-frame spot checks repeat the passing picture values exactly; the unchanged renderer/full12-frame evidence above is retained. Normal signed-in help and exact save/cold reopen pass again. Three targeted full-editor regressions pass;173 unrelated cases were skipped, not claimed as rerun. The full frontend/helper run now passes94 cases in9 suites.

The final stress repeat still passes with **53 distinct** scrubber/timeline positions, no sampled held-control interval and maximum sampled decoder/control difference144.7ms. The observation's largest callback gap is611.2ms under fourfold CPU throttling and concurrent local work. That is a remaining smoothness limit, not a claim of zero UI latency under all load. The complete576,000-sample audio capture again has no gaps/duplicates and the same maximum sample error. Earlier74-position/333.5ms results describe their original checkpoint, not this final repeat.

## Remaining release work

The locally supplied preview responses execute real decoding/PCM preparation of the owned source bytes. They do not qualify the deployed API's ownership checks, packaging or resource behaviour. The source-dialogue path remains default-off. Both client and API require their enable flag plus the same explicit account list (`REACT_APP_STUDIO_SOURCE_DIALOGUE_PREVIEW_UIDS` / `STUDIO_SOURCE_DIALOGUE_PREVIEW_UIDS`). The API matches only its verified identity; an enabled flag alone and wildcard enrolment are rejected. No owner list or flag was applied to production. Actual API authorization/preparation now passes in emulators, and the matched runtime smoke passes. The complete production packaging/release and activation boundaries still require review, followed by an actual owner export and recovery retest after release. Full moving-picture/mix, edge/gamut/diverse-footage and listening/creative checks remain open. Director continuation follows this scoped requalification.

Production/main remains at the previously deployed **`e78fe6b9`** in the latest read-only check. No candidate push, merge, deployment, live-ad activation, production credit issuance, subscription/price/security-rule change or publication occurred. The original saved login remains byte-identical. Formal Studio readiness counts remain **17 FUNCTIONAL /9 PARTIAL /1 BROKEN /2 UNIMPLEMENTED /0 PRO-READY /0 PRODUCTION-READY**; shared S02/S04/S03 and security incident follow-up are preserved.
