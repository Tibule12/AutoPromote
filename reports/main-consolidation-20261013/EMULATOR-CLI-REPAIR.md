# Firebase emulator CLI repair — 13 October 2026

A clean install reproduced the reported startup failure. The locked Firebase CLI 14.23.0 imports legacy stream-json subpaths such as filters/Pick. The repository security override resolves stream-json 3.7.0, which has a different module layout. The runner suppressed that actual exception and reported the CLI missing.

Pin firebase-tools 15.33.0, whose declared stream-json dependency is ^3.6.0, and retain the patched stream-json override. Regenerate the lockfile. The runner now invokes the CLI installed in this checkout through the current Node executable, avoiding npx cached/global substitutions, and preserves startup stderr. Emulator fallback remains opt-in; this verification did not enable it.

Validation uses the workflow's exact Node 22.22.0 and Java 21. The CLI starts, the real Firestore 1.22.0 emulator boots, and five CLI regression checks plus an actual Firestore write/transaction/read/delete check pass. An unfiltered npm run test:emulator was also started and reached Jest; it reported a failing ViralClipStudio.test.js suite after approximately 530 seconds. That run is not qualified passing, even though the wrapper reported exit 0. Full Studio test qualification remains separate from the repaired CLI startup. No production, publishing, GPU or model operation was performed.

The package source review lock is refreshed without changing knowledge contents or readiness. Generated emulator logs are restored to their checked-in baseline and private session data is excluded.

Upstream compatibility: [Firebase CLI 14.23.0 dependencies](https://github.com/firebase/firebase-tools/blob/v14.23.0/package.json), [Firebase CLI 15.33.0 dependencies](https://github.com/firebase/firebase-tools/blob/v15.33.0/package.json). Local clean-install reproduction and actual emulator results support this repair; upstream declarations alone do not qualify the full application suite.
