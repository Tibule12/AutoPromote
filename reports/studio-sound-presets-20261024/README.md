# Studio Sound selection and source access repair

24 October 2026. The owner selected **Slowed + Reverb**, with slower, deeper
choir audio and reverb. The prior natural 0.85×/Keep Pitch edit is retained as
a superseded interpretation, not the selected sound.

## Product changes

- Factory preset application now writes the selected preset's actual identity.
  Previously every non-first card could retain the Slowed + Reverb highlight
  while applying another card's values. The owner's 0.98×/zero-pitch/65% reverb
  screenshot matches the 8D Spatial values, explaining the contradictory card.
- Active owned sources renew their temporary V2 signed access before expiry.
  Successful replacement media allows another later renewal; failed attempts
  remain bounded, and duplicate decoder errors coalesce. The existing signed-in
  source endpoint and project checks remain responsible for authorization.
- Sources uploaded before the dedicated ingest-bucket migration are checked in
  the configured main bucket only after an ingest 404. Metadata owner, purpose,
  size and expiry checks still apply. Transport errors and conflicting owners
  cannot fall through to another object. CPU frame, speech-preview and subject
  readers retain the resolved, allowlisted bucket and object generation.
- EQ sliders retain standard vertical writing mode/direction and remove the
  deprecated `slider-vertical` appearance declarations.
- Shared remix mastering materializes DSP timestamp gaps at 48 kHz before final
  limiting. The first full choir export exposed a roughly 100 ms late audio gap;
  its file and failed decoded-sample gate are retained. The strict gate and
  tolerances are unchanged. This is a worker repair, not a separate audio editor.

The old source signature expired on 23 October at 19:18:10 UTC. A separate
native check found the existing source in the main bucket while the local API
looked only in the newer ingest bucket. After the source fix, the same owned
path resolves twice with HTTP 200 instead of 404, without reuploading it.

## Verification

Engineering checks: 36 frontend helper/preset cases; three focused full Studio
component cases (141 unselected); 40 backend cases across four suites; ten real
CPU audio cases, including two packet-clock/video-packet regressions. The new
preset and clock regressions fail before their respective fixes. No full-suite
qualification is inferred from these focused runs.

Separate headless, muted native browser verification clicks all ten factory
presets and checks saved identity. It exercises history and cold reopen for 8D
Spatial, standard vertical EQ Home/End/ArrowDown behavior, three actual signed-in
help questions and four anonymous viewport comparisons. There are no page
errors or render submissions in that UI verification. The retained login file
is unchanged. Native full choir delivery is recorded separately in
[the selected edit report](../studio-choir-slowed-reverb-20261024/README.md).

The actual local App passes a strict build and the entry-point checks before
installation. Its API origin is retained, previous build and hashed assets
remain available, and the index is installed last. The local API is gracefully
replaced with inherited configuration intact; the ingest setting is preserved.
Existing visible browser tabs need a refresh to load the updated bundle.
The corrected full export uses the isolated local CPU worker. The retained
general Studio worker is not restarted during other ongoing editing; the shared
worker source fix is present in both worktrees and loaded by the export worker.

Private evidence lives under ignored `proof/` in the production frontend and
model-runtime worktrees. It includes the failing and passing test logs, native
`verification.json`, source probes, build/install receipts and prior build.
Original failures are retained, including a history observer that attempted
Undo after cold reopen, deleted temporary dependency locations, and a transient
build syntax failure during concurrent unrelated VFX edits. The subsequent
strict build succeeds without changing that unrelated VFX file in this task.

No main merge, production deployment, scheduling, paid GPU/model execution,
creative approval or readiness promotion. Preserve other worktree edits,
projects, original media, chosen identity, existing publishing receipts and
daily/retention/observation timers. Shared S02 picture/processed-sound, colour/
edge/low-alpha/clock/latency, S04 motion depth and S03 ownership remain open.
