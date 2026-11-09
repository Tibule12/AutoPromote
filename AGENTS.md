# Studio product continuity

For any AutoPromote Studio, Director, editing, preview/render, GPU capability,
or generated-media integration work, read these files first:

1. `docs/STUDIO-COMPLETION-CONTRACT.md`
2. `docs/STUDIO-PRODUCT-READINESS.md`
3. `test/e2e/studio-capability-matrix.json`
4. `test/e2e/studio-combination-matrix.json`
5. `test/e2e/studio-preview-render-parity.json`

They govern current readiness and the next task. Earlier handoffs/reports are
historical evidence. Preserve working fixes and all existing local changes.
Do not create separate automatic/manual/generated editing engines.
Prioritize the ordered shared-system backlog; no branding/logo work or
isolated creative experiments.

At the end of every Studio session, update product readiness, capability and
combination matrices, exact remaining blockers, evidence and next task.
Update preview/render parity when affected. Validate with
`node test/e2e/validate-studio-contract.js`. Keep FUNCTIONAL distinct from
PRO-READY/PRODUCTION-READY and from creative approval. Mock/CLI/source-only
evidence never qualifies a real Studio flow.

Browser QA must be headless and muted. Never show or restore the app on the
user's work screen. A saved command, contract or historical GPU window does
not authorize starting a paid instance/job. Respect current session steering.
