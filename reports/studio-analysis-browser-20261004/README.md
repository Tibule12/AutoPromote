# Studio frontend browser proof — October 4, 2026

**Status: real browser acceptance passed.** Chromium signed in to the isolated
`autopromote-staging-2026` Firebase project and exercised the production
`ViralClipStudio` component and `AuthProvider`. The local acceptance host mounted
the existing `src/mediaRoutes.js` analysis endpoints in production mode against
staging Firestore and Storage. The analyzer and worker ran in Google Cloud.
There were **zero mocked requests, no E2E auth bypass and no browser JavaScript errors**.

The browser submitted `[0, 600]` seconds of the same owned podcast source used
by the earlier ten-minute gate. It observed `queued → running → completed`,
retrieved the real result, applied **143 camera cuts / 1,277 framing points /
144 timeline-cut entries**, and saved a local project checkpoint. Sampled face
coverage was **99.765625%**. All **48 independent verification checks** pass, covering every persisted
framing point's time, portrait crop coordinates and detection flags, every cut's
time, mode and picture fill, plus the project and source bindings.

## View the frontend

These captures are retained in the shared workspace. The private podcast images
and recording are excluded from Git.

- [Before analysis](../../artifacts/studio-analysis-browser-20261004/frontend-before.png)
- [Queued, with playback continuing](../../artifacts/studio-analysis-browser-20261004/frontend-queued.png)
- [Running in Google Cloud](../../artifacts/studio-analysis-browser-20261004/frontend-running.png)
- [Camera cuts and face framing applied](../../artifacts/studio-analysis-browser-20261004/frontend-applied.png)
- [Full browser recording](../../artifacts/studio-analysis-browser-20261004/frontend-browser.webm)
- [Capture hashes and sizes](visuals.json)

At four checkpoints—before submission, queued, running and applied—the actual
preview video advanced, stayed unpaused and unmuted with volume 1, and showed no
blocking preview loader. The source has H.264 video and AAC audio. The Playwright
recording captures the screen; its audio is not a recorded output-audio test.

## Inspect the persisted evidence

- [Browser acceptance receipt](browser-receipt.json)
- [Actual frontend request and queue receipt](browser-submission.json)
- [119 real analysis HTTP responses](browser-network.json)
- [Editor before](editor-before.json) and [saved editor after](editor-after.json)
- [Six additional access checks using two real Firebase users](backend-authorization.json)
- [Independent cloud job record](cloud-job.json)
- [Exact stored cloud result bytes](cloud-result.json) and [browser result](browser-result.json)
- [Source-shot artifact](cloud-source-shot-artifact.json) and [analysis artifact](cloud-analysis-artifact.json)
- [Source generation metadata](source-metadata.json) and [media probe](source-media.json)
- [Cloud Run execution receipt](cloud-execution.json)
- [Independent verification](verification.json) and [artifact manifest](files.json)

Job `bdacfd34ce78efb7d8615f77229a3ff7db827087289488f08206a9c19f2928e6`
completed on its first worker attempt. Execution `studio-analysis-once-9574q`
is visible in [Google Cloud Console](https://console.cloud.google.com/run/jobs/executions/details/us-central1/studio-analysis-once-9574q?project=autopromote-staging-2026).
The job completed at `2026-10-04T12:13:50.376Z`; browser acceptance completed at
`2026-10-04T12:14:51.098Z`, including screenshots, playback probes, checkpoint
save and authorization checks. The analyzer returned HTTP 200 in 306.395 seconds.
Execution startup, queue waiting and evidence capture are separate from that
analyzer duration. This is one observed run, not a latency guarantee.

The 152,536-byte result hash is
`e8c725943577c7bbc9b275443efa9e2a074a7abd814e391d4dc9ab06c33ae98c`.
It matches the earlier pinned-runtime cloud and local result exactly. The
new project-scoped artifacts have their own identities, while the underlying
analysis content remains identical.

The owner could read the job. A second real Firebase user received 404 for both
job and result, and 403 when submitting the owner's source. Missing auth, a
test token and the Playwright bypass header all received 401.

## Scope and reproduction

This proves the production editor component's analysis workflow in a localhost
acceptance host, with real staging authentication and cloud processing. Full
dashboard navigation, a public staging frontend deployment, export rendering,
and production rollout are separate gates. The production analysis-job flag
remains off. The analysis still requires editorial review.

The acceptance scripts are:

- `scripts/prepare-studio-analysis-browser.js` — short-lived staging sign-in and private source URL
- `scripts/run-studio-analysis-browser-preview.js` — isolated localhost host and existing CRA build loaders
- `test/e2e/playwright/run-studio-analysis-staging-browser.js` — actual browser workflow
- `scripts/collect-studio-analysis-browser-proof.js` — independent authenticated cloud reads
- `scripts/verify-studio-analysis-browser-proof.js` — offline cross-checks

Offline verification needs only Node:

```sh
node scripts/verify-studio-analysis-browser-proof.js
```

Re-running the live gate additionally requires installed repository/frontend
dependencies, Playwright Chromium, FFprobe, Google CLI access to staging, and
Google ADC. Store the staging web app configuration as
`artifacts/studio-analysis-browser-20261004/firebase-config.json`. Preparation
requires permission to sign short-lived tokens through the staging smoke service
account. Set `GOOGLE_APPLICATION_CREDENTIALS`, run preparation, then set
`STUDIO_BROWSER_BOOTSTRAP` to its private `bootstrap.json` when starting the host.
The browser script manually starts the existing staging Cloud Run worker once;
it does not install a schedule. Credentials and signed URLs remain outside Git.

During harness setup, two untrimmed 601.002-second submissions were cancelled
before a worker claimed them. Their cancellation and setup receipts remain
locally under `artifacts/studio-analysis-browser-20261004/setup-attempts`.
The successful gate sets the real editor trim control to exactly 600 seconds.
