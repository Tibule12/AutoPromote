# Release Actions repair — 2 November 2026

Main release `d79aaa19` passed its frontend/backend deployment jobs, 2,200 unit tests, 30 browser tests, CodeQL and Semgrep. The media-worker release [41500205365](https://github.com/Tibule12/AutoPromote/actions/runs/41500205365) failed before pushing an image or creating a candidate revision. Its previous service was not replaced by that run.

The container exposed two integration omissions: the delivery-clock keyword and sub-20ms camera interval handling were missing, and reordered packets shortened the joined timed-grade picture stream by one frame. The repair retains the compiled-programme clock, restored explicit delivery-rate conversion and the lossless reviewed-subject encoding. Only one picture clock is accepted; one-frame intervals and grade segments encode without reordered DTS. Existing exact-frame, decoded-pixel, sound and duration assertions remain strict.

The image build, contract tests and local CPU HTTP smoke now live in one shared script. Both a new credential-free pull-request workflow and the production release use it. The PR gate cannot authenticate, push an image or deploy. Candidate verification, zero-traffic staging, promotion and conditional traffic rollback retain their prior production gates.

Three separate Dependabot jobs failed resolving `glob` in frontend/TodoApp and `minimatch` in frontend. Existing overrides restrict `glob` to 11.x while the advisory requires 14.0.2. Legacy minimatch consumers use its old callable CommonJS API; blindly forcing every consumer to 11.x risks breaking build/lint/test tools. Dependency investigation is separate; no advisory or failing check has been dismissed.

Local validation and the exact image gate are being run on this repair branch. This report is a preparation checkpoint, not deployment evidence. No user media/data, Rules, authority, prices, credits or subscription changes are included. Studio readiness counts and the rejected/private creative evidence remain unchanged.
