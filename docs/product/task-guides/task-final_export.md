# Export a final film

Development documentation • product 1.2.0 • knowledge 1.0.65 • 2026-11-22

Overall feature ratings and working subfeatures are separate. PARTIAL or BROKEN does not mean every control fails; entries identify verified workflows, release state and the remaining limitation. FUNCTIONAL does not mean professional or production ready. Current account permissions, source ownership and execution availability remain authoritative.

ID: `task.final_export` • **PARTIAL** • SUPPORTED_WITH_LIMITATIONS

Compile the saved current project, review the completed exact output and download it through the normal flow.

## Before you start

- system.account — FUNCTIONAL

## Steps

1. Verify owned sources, current project revision and all scene reviews.
   Feature: `studio.revision`.

2. Check unsupported/stale scenes, effects and current render estimate.
   Feature: `studio.export`.

3. Request the existing deterministic final render; do not treat a log or queued job as output.
   Feature: `studio.render`.

4. Play the entire downloaded movie with sound and compare relevant preview/cut/text/audio frames.
   Feature: `studio.export`.

## Feature readiness

- system.costs — **PARTIAL**: Exposed generation/render workflows display estimates and apply account allowances or charging checks. A local development charging bypass is not evidence of production billing.
- system.unsupported_media — **FUNCTIONAL**: Source ownership, decode and range validation can reject unusable material. Repair/import an owned compatible source; a temporary local URL is not a durable asset.
- studio.preview — **PARTIAL**: Source and completed-movie playback work. Larger-source paused extraction is verified live on the 293.7 MB podcast. The retained Node repair also passes its six fixed picture comparisons and three playback profiles. PARTIAL refers to wider predictive picture/sound agreement and continuous playback limits, not absence of these working paths.
- studio.revision — **FUNCTIONAL**: Preserves canonical revision and provenance for manual edits, Director proposals, artifact review and output binding. Stale proposals must be reviewed again.
- studio.export — **PARTIAL**: Downloads the exact completed movie. The released 45-second GPU export is verified, including a faster byte-identical retest. Strict size enforcement, Opus, Display P3 and SDR-mapped HDR10/PCM32 also have retained native local proof; those extensions have not reached the released build. PARTIAL applies to the wider delivery and compatibility scope.
- studio.render — **FUNCTIONAL**: Renders the canonical project through the shared worker. A deployed 45-second GPU master is verified end to end, and the optimized retest produces exactly the original movie bytes in 133.335 seconds instead of 348.134 seconds.

## Result and limitations

An owned editable result with current revision and reviewed output; inspect the actual moving picture and sound.

- Expanded caption review and additional delivery profiles have retained local proof but are not all released. A broad feature label must not be read as a failure of every tested control.
- Follow the linked feature readiness; these steps do not promote the workflow to professional or production readiness.

Troubleshooting references: system.unsupported_media, studio.revision.
