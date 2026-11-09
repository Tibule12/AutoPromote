# Latest Studio stability / NVIDIA checkpoint — 8 October 2026, 08:49 SAST

Read `../reports/studio-stability-20261008/README.md` and `results.json` first. This supersedes active-process and readiness notes in the hour and October 7 handoffs. Preserve all previous work. Existing foundations and scoped engineering PASS evidence are **not creatively approved finished work**. No branding, logo, speculative creative content or new feature work resumed.

## Outcome and limits

The cumulative 29-capability matrix is **20 PASS / 1 FAIL / 8 BLOCKED**, verdict **not ready** for user handoff. PASS means one stated representative founder-account flow, not every advertised preset or production readiness. The table records current versus historical GPU dates. Full attempts are preserved in JSON; October 7 receipts remain intact.

Fresh user steering authorized prioritizing the retained NVIDIA GPU. The instance started around 08:11 SAST. Direct host SSH was unreachable on the current network; the NVIDIA gateway worked. Four real Studio jobs ran: three-second SAM2 preview with text-behind/background grade/tracked callout/parallax, twelve-second final subject export, CUDA/float16 transcription, and twelve-second labelled transcript draft export. Actual preview and final streams use `h264_nvenc`; model weights/source/matte/pixel checksums and owned API receipts are retained. The fresh preview is byte-identical to the exact preview whose sound the user already accepted. New final exports have technical audio checks, not new listening acceptance.

GPU transcription remains FAIL: repeated low-confidence wording and inconsistent language labels; user wording approval was not supplied. The review gate kept it a draft. All 21 caption definitions now share renderer values; full animation parity and one portrait cue reaching the edge remain unqualified. The original failed output cases are retained. One GPU draft harness expected portrait while Auto Reframe was off; its actual 1280x720 file passed independent verification. This corrects the harness, not recognition quality.

HQ 3D again returned 503 through the normal UI. Root configuration is missing private `STUDIO_3D_BUCKET`/Cloud Run job dispatch; no retained-NVIDIA Studio adapter exists. Standalone Blender evidence does not qualify Studio. Generated image/video/raw providers lack a normal Studio entry; private Factory remains disabled/founder-only. No external/stock provider was substituted and no new adapters were added.

## Implemented and verified

- AutoPromote watermark removed from Studio preview, signature controls, request and worker pass, including old opt-ins. Draft caption review stamps are independent. Existing logo/ident assets unchanged.
- Existing 14 tools exposed with purpose/result explanations and reachable controls. Laptop video/caption/audio lanes and three viewport sizes inspected; every control's output is not qualified.
- Caption definitions/grouping shared with renderer; burned captions appear once over completed video.
- Landscape detected source centres survive portrait switching. Real export retains both speakers at sampled cuts. Older keys without `sourceFocus` require reanalysis.
- Completed output bound to saved project and clean branding. **Signed source URL refresh was incorrectly counted as an edit**, discarding cold recovery. New `studioHistoryMedia.js` compares stored media identity and edit settings while excluding refreshed access URLs. Actual source path/content/trim changes still invalidate output.
- Real cold save/reload now restores matching completed portrait; native download after worker shutdown preserves SHA `dd83c7e13e6c0b0c120bae3bee7a7e3ec5d6c8e129761bb718435880e12d08ca`. Different project opens with three editable caption blocks and no unrelated result. Same-browser scope only.
- Source-analysis Director proposal/review/normal signed-in approval/split/export passed earlier this continuation. This is the product source-analysis Director, not free-form NVIDIA browser planning. No collaboration subagents used.

Seven new playback-identity regression checks plus two selected hydration/completed-caption retests passed. Existing selected regression evidence remains in verification.json; no claim that all 99 component cases ran. Frontend compiled with one preexisting control-regex lint warning. `git diff --check`, script syntax and 21-style sync checks passed. Component mocks establish implementation guards only and never count as real feature execution.

## Runtime stop state

The L40S `autopromote-l40s-staging`, ID `xgh6wcu74`, is independently **STOPPED** (around 08:36 SAST); workers and SSH forwards closed. Its automatic stop watchdog was cancelled after confirmation. No pending GPU job remains. Do not restart merely because this handoff exists; use new user steering/authorization rather than historical window notes.

One local CPU export retested recovery after the GPU shutdown (six CPU exports total in this continuation). CPU worker is stopped. The dedicated headless QA Chrome, frontend 5000 and API 5100 are now closed; ports 8008/8009/9229 are also closed. This reduces laptop load. Original user Chrome/IDE/other project processes were untouched.

**Headless and muted only. Never display, restore or minimize an app/browser on the user's PC screen.** The persistent normally signed-in private profile, credential files, source baseline and logs are under `/home/tibule12/.local/share/autopromote/studio-qa-20261008` (private permissions). Preserve them; never publish tokens/signed URLs. Headless desktop pointer flags are needed when launching Chrome directly; Playwright defaults supply them. `run.js` rejects visible Chrome. No authentication bypass or identity injection is authorized.

QA launcher loads normal local credentials, disables background schedulers/private Factory, and uses local CORS/credit overrides. It does not qualify production billing/entitlements. Use `STUDIO_QA_WORKER_ENV` for the private VFX credential file. Verify an old API really exits before restarting; its SIGTERM handler remained alive during this run and a stale API caused the first offline response. Fresh API configuration fixed that QA setup issue; the real GPU request then passed.

## Preservation and next blockers

Branch/HEAD retained: `agent/director-analysis-staging-browser-v1`, `7f7530ad746050c094bfc78d0921190da98d2098`. All 1,465 preexisting dirty/untracked baseline files remain; zero changed logo/ident artifacts. Only authorized stabilization source/test/docs changed; no reset/clean/discard/stage/commit/push/deploy. Re-run preservation audit against the retained private baseline if editing further.

Executable real actions: `gpu-continuation.js`, `blocked-3d.js` (current project env overrides), `readiness.js`, `reframe-aspect-regression.js`, `reload-continuation.js`, Director/control/caption continuations under `test/e2e/playwright/studio-stability`; read that README. `worker-qa.sh` uses gateway SSH, one exclusive GPU lock, and never starts the instance. The consolidated GPU script mirrors the actual executed native action sequence; it was syntax-checked, not fully rerun after consolidation. Individual flows were executed and evidenced. Project/media selection and video playback remain native user actions; no force-click or injected state qualifies.

Top ten blockers are in the report: ASR/labels, caption animation, HQ 3D/Blender dispatch, generated image entry, video/raw generation entry, advanced VFX edges/cuts/depth, pending audio/speed listening and microphone flow, cross-device/expiry/conflict durability, ordinary account/billing/isolation, production hosting and long-media/concurrency/restart/cancellation resilience. Do not add new features until the current capability gaps are stabilized or explicitly reprioritized by the user.

Evidence integrity note: one historical compositing attempt reused a filename before this continuation; its claimed hash does not match the retained file. The attempt is marked unusable and preserved in results.json. The fresh October 8 compositing output and all current referenced outputs match their hashes. Rerenders now archive by SHA and update contact-sheet pointers. See reports/studio-stability-20261008/artifact-integrity-check.json (repository-relative).
