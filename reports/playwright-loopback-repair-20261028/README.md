# Playwright loopback-build repair — 28 October 2026

Run [40739320789](https://github.com/Tibule12/AutoPromote/actions/runs/40739320789), commit `f3a43e4d`, failed 14 tests, passed 16 and skipped 17. Its GitHub connector job log, error contexts and traces were retained privately. See `before.json` for the exact failed cases.

The previous security patch correctly restricts browser-test identities to a loopback page **and API**. CI's React production-mode build inherited `frontend/.env.production`, whose API URL is `https://api.autopromote.org`. Tests still set `window.__E2E_BYPASS` expecting fake local users. The guard rejected the production API target, leaving dashboard tests unauthenticated and billing tests without their fixture identity. The failing cases did not establish fourteen independent editor/provider defects.

CI now supplies `REACT_APP_API_URL=http://127.0.0.1:5000` to its frontend build, matching its isolated static test host. The production environment file and synthetic-token restrictions are unchanged. The owner dashboard selector also retains the established explicit `/admin` alias, alongside `/admin-dashboard` and `/admin-login`; ordinary root entry remains the user workspace. No production role, balance, permission, provider connection, renderer or worker behavior is changed by this repair.

## Validation

An isolated frontend build uses a separate local port/output, a fresh owned `demo-autopromote-e2e` Firestore emulator and the exact suite configuration. Production credentials are excluded, and API/provider/media/payment outcomes remain fixtures. The saved real owner's session, original local builds and existing services are preserved. The complete local suite passed **33 tests, zero failures, 14 skips** in 9.6 minutes; all fourteen previously failed cases passed. Three optional real-source checks ran on this machine that CI previously skipped because their media was absent. Four authority-review regressions and 22 frontend authority/local-auth checks also pass. Local results are recorded in `validation.json`; remote verification is available through the commit’s GitHub Playwright check. An ongoing or cancelled remote run is not a pass.

These browser cases exercise ordinary controls with mocked service boundaries and generated/fixture media. They do not verify a real PayPal payment, external platform publication, production Auth cryptography, cloud/GPU execution or whole Studio predictive parity. Existing test skips remain explicit; no failing case was removed, skipped or weakened to make this change pass.

The completed owner-account routing repair and its real-session browser observations are separately retained at [workspace entry](../workspace-entry-20261028/README.md). The rejected daily films and five verified Queue holds stay in place. Formal Studio counts and S02/S04/S03 work remain unchanged.
