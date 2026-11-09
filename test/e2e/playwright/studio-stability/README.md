# Studio real execution QA — 7 October 2026

Latest repair checkpoint: `docs/HANDOFF-studio-reliability-repair-20261008.md`
and `reports/studio-stability-20261008/README.md`. The runtime is stopped.
The new commands below never start an instance. Run browser mutations sequentially.

```bash
export STUDIO_QA_REPORT=reports/studio-stability-20261008
node test/e2e/playwright/studio-stability/nvidia-3d.js preview
node test/e2e/playwright/studio-stability/nvidia-3d.js export
node test/e2e/playwright/studio-stability/three-d-reload.js
node test/e2e/playwright/studio-stability/speed-clock-retest.js
node test/e2e/playwright/studio-stability/caption-model-retest.js
```

The 3D script uses the genuine saved `Studio QA 20261008 3D NVIDIA repair`
scene: cinematic title, main text `QA 3D`, secondary `Studio output check`,
wide 16:9, 0–1s. Prepare through the existing Motion → 3D Motion controls
if that saved project is unavailable; do not inject state. The optional
existing-renderer NVIDIA transport requires `STUDIO_3D_SSH_HOST`,
`STUDIO_3D_SSH_ROOT`, `STUDIO_3D_SSH_IMAGE`, `STUDIO_3D_SSH_LOCK`,
and an explicitly configured `STUDIO_3D_SSH_DEADLINE_EPOCH`. It does not
start the retained machine. Completed owned output remains readable after
the compute deadline; expired deadlines reject new renders. Use
`STUDIO_QA_MEDIA_WORKER_URL` to choose the actual worker in `backend-qa.js`.
Cold recovery must use normal App entry and download, not localStorage injection.
Automatic caption wording is still FAIL and 3D audio response is still BLOCKED.

This matrix uses the normal App, real sign-in, owner-scoped Firebase uploads,
real backend job submission, actual NVIDIA execution and the Studio Download
button. No mocks or auth bypass qualify. A technical output receipt is not a
visual or listening acceptance.

Run from the repository root with existing dependencies on NODE_PATH:

```bash
export NODE_PATH=/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules
node test/e2e/playwright/studio-stability/run.js list
node test/e2e/playwright/studio-stability/run.js inspect current
node test/e2e/playwright/studio-stability/flows.js open 'Studio QA 20261007 subject'
node test/e2e/playwright/studio-stability/run.js render compositing
node test/e2e/playwright/studio-stability/cuts-speed.js
node test/e2e/playwright/studio-stability/broll.js
node test/e2e/playwright/studio-stability/audio-import.js
node test/e2e/playwright/studio-stability/director.js
node test/e2e/playwright/studio-stability/blocked-3d.js
node test/e2e/playwright/studio-stability/readiness.js
node test/e2e/playwright/studio-stability/run.js report
```

Prerequisites: normally signed-in **headless, muted** Chromium on CDP 9229, App on 5000,
real QA API on 5100, approved GPU window and already-running retained worker
on 8008 / VFX worker on 8009. `worker-qa.sh` never starts a Brev instance.
Do not run it outside a newly authorized window. Main and VFX workers use
one exclusive GPU lock and run sequentially. Local backend credentials stay
on this workstation. `backend-qa.js` disables schedulers and private Factory.

October 8 uses the retained private persistent headless profile. Do not open,
restore or minimize a visible browser on the user's work screen. `run.js`
rejects non-HeadlessChrome. Start the frontend with `BROWSER=none`. Keep the
desktop pointer flags from Playwright's installed Chromium defaults when using
Chrome CLI headless mode; otherwise the normal desktop gate rejects touch mode.
`worker-qa.sh` uses the NVIDIA gateway SSH host by default because direct host
SSH is unreachable on the current network. No credentials go to the GPU.
Set `STUDIO_QA_WORKER_ENV` to the private local VFX worker credential file when
launching `backend-qa.js`; verify the old API actually exits before restarting.

The latest receipts are in `reports/studio-stability-20261008`. Executable GPU
actions are `gpu-continuation.js subject`, `subject-export`, and `captions`.
Set `STUDIO_QA_REPORT=reports/studio-stability-20261008`. These commands do not
start an instance. Subject export requires a played, visually inspected and
sound-reviewed preview. The caption run keeps wording unapproved and renders
a labelled draft. Archive the previous subject preview before another attempt.
`STUDIO_QA_3D_SOURCE` / `STUDIO_QA_3D_PROJECT` select current saved project names
for `blocked-3d.js`. The GPU is STOPPED at the latest checkpoint; commands alone
grant no new paid window.

The matrix records an executable command and user actions for each capability.
Generic render commands require the specified edit to be prepared in the real
UI first. Shared real saved QA projects cover several rows; opening a project
alone does not pass ingest, and a standalone engine result does not pass Studio.
Saved project fixtures are genuine prior QA edits, not mocked media or network
responses. Initial ingest must still be performed through Choose Videos.

For a fresh profile, upload `reports/studio-stability-20261007/media/podcast-12s.mp4`
through Choose Videos, open it in Studio, generate editable caption drafts, edit
one test cue, and save `Studio QA 20261007 baseline`. Do not approve ASR wording
without reviewing it. Duplicate that baseline for isolated scenarios. The
existing QA profile and projects have been retained privately. The original
browser profile and original media remain unchanged.

Prepare composite layers through Graphics (test text 1–3s), Motion (Impact
4–7s), B-roll (existing still 8–11s), Color (Warm Cinematic) and Sound (Podcast
repair). Preview captions can be off while their saved cues remain editable.
`flows.js subject` creates a three-second split and opens the subject panel.
Use points on the actual person ([0.79,0.65], [0.69,0.28]) for this source;
render/review the real preview before final export. Never bypass the reviewed
source checksum, matte quality guard or played-preview review requirement.

Every render observes its own acknowledged owned job ID, requires native
After playback readiness, uses the actual Download button, fully decodes the
file, checks duration/dimensions/A/V clocks and generates a contact sheet.
Previous output files are archived by SHA on reruns. Inspect images and listen
before using `run.js classify <case> <review.json>`; PASS requires review evidence.
The matrix statuses remain FAIL/BLOCKED on incomplete results. Keep all failed
attempts. Investigation target is 25 minutes per capability; record a specific
blocker at that limit and continue. Do not add features or new generation routes.

Scope: short 12-second podcast, founder account, copied private browser profile,
H.264/AAC and retained L40S. This qualifies limited foundations, not finished
creative work, ordinary subscriber entitlement, production output durability,
long recordings, cancellation/restart recovery, concurrency or all advertised
presets/codecs. The GPU is stopped after this sprint; archived outputs remain
local. Start no new jobs merely because these commands exist.

## One-hour regression retests

See `docs/HANDOFF-studio-stability-hour-20261008.md` and the hour report first.
These commands use actual normal signed-in Studio interactions and do not start
any worker or instance. Do not render without an authorized running worker.

```bash
export STUDIO_QA_REPORT=reports/studio-stability-20261007/hour
node test/e2e/playwright/studio-stability/hour-regression.js caption-source
node test/e2e/playwright/studio-stability/hour-regression.js reload
node test/e2e/playwright/studio-stability/hour-regression.js offline-download
node test/e2e/playwright/studio-stability/hour-regression.js offline-render
```

`caption-source` opens the real saved `Studio QA hour captions`, duplicates it,
uploads representative media normally, adds a second sequence source and checks
cue isolation. `reload` requires that saved caption project to be current.
`offline-download` requires its completed result to be visible and the worker
already stopped; it verifies actual native download SHA and full decoding.
`offline-render` tests the actual typed offline rejection on the normal baseline
project. These phases have state prerequisites and are not interchangeable.
This hour used CPU because GPU start was funding-blocked. Its output durability
check passed locally; the older limitations remain as recorded historically.
